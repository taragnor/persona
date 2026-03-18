import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaItem} from "../item/persona-item.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {PersonaRegion} from "../region/persona-region";
import {ArrayEq} from "../utility/array-tools.js";
import {DungeonSquare, Point, WallData} from "./dungeon-generator-square.js";
import {GeneratorSceneModifier, RandomDungeonGenerator} from "./random-dungeon-generator.js";
import {EnchantedTreasureFormat} from "./treasure-system.js";

export class RandomDungeonOutput <TreasureType> {

  scene: PersonaScene;
  _baseDiff: number = 0;
  _generator: U<RandomDungeonGenerator>;
  grid : {
    width: number;
    height: number;
    x: number;
    y: number;
    size: number;
  };
  squareList: DungeonSquare[];
  depth : number;
  treasureSystem : TreasureGenerator<TreasureType>;
  sceneMods : readonly GeneratorSceneModifier["item"][];
  name: string;

	wallData: ReturnType<RandomDungeonOutput<unknown>["createWallsOnSquare"]> = [];
  errorLog: (string | Error)[] = [];

  regionData : WeakMap<DungeonSquare, RegionBaseData> = new WeakMap();
  treasureData : WeakMap<DungeonSquare, TreasureType[]> = new WeakMap();

  SQUARE_WIDTH = 5 as const;
  SQUARE_HEIGHT = 5 as const;
  DOOR_TEXTURE  = "canvas/doors/small/Door_Metal_Gray_E1_1x1.webp";
  WALL_TEXTURE = "canvas/doors/small/Door_Stone_Volcanic_B1_1x1.webp";
  WALL_COLOR = "#FF0000";
  SECRET_DOOR_COLOR = "#DD0000";

	static async outputToScene <T> (gen: RandomDungeonGenerator, scene: PersonaScene, treasureGenerator: TreasureGenerator<T>, dungeonName: string, baseDiff = 0 ) {
		const outputter = new RandomDungeonOutput( scene, gen, treasureGenerator, baseDiff);
		await outputter.outputDataToScene(dungeonName);
	}

	get generator() : RandomDungeonGenerator {

		if (!this._generator) {
			throw new PersonaError("No generator provided");
		}
		return this._generator;
	}

  constructor (scene: PersonaScene, generator: RandomDungeonGenerator, treasureSystem: typeof this.treasureSystem, baseDiff: number) {
    if (!scene.allowsRandomGenerator()) {
      throw new PersonaError("This scene doesn't allow random Mutation");
    }
    this.treasureSystem = treasureSystem;
    this.scene = scene;
    this._generator = generator;
    const rect = scene.dimensions.sceneRect;
    this.grid = {
      size: scene.grid.size,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
    this.depth = generator.currentDepth;
    this.checkDimensions();
    this.sceneMods = generator.sceneModifiers;
    this.squareList = this.generator.squareList;
    this.finalizeSquares(this.squareList);
		this._baseDiff = (this.scene.baseDungeonLevel || baseDiff) ?? 0;
		if (this._baseDiff == 0) {
			throw new Error(`${scene.name} has no inset Difficulty`);
		}
    this.wallData = this.prepareWallData();
	}

	get difficultyLevel() {
		return this._baseDiff + Math.floor(this.depth / 2);
	}

  private finalizeSquares(squares : readonly DungeonSquare[]) {
    for (const sq of squares) {
      const data = this.makeRegionData(sq);
      if (data) {
        this.regionData.set(sq, data);
      }
      const treasures= this.generateTreasures(sq);
      this.treasureData.set(sq, treasures);
    }
  }

	async outputDataToScene(dungeonName : string) {
		if (this.squareList.length == 0) {
			throw new PersonaError("You haven't run genreate yet");
		}
		await this.clearScene();
		await this.movePCs();
		await this.resetFog();
		await this.updateSceneName(dungeonName);
		await this.createWalls();
		await this.createRegions();
		await this.createTreasures();
		await this.setRandomEncounterList();
		await this.writeSceneModifiers();
		await this.resetFog();
	}

  prepareWallData() : typeof this["wallData"] {
		const wallData = this.squareList
			.flatMap( sq=> this.createWallsOnSquare(sq));
		const dupeRemover = ([] as typeof wallData).pushUniqueS((a, b) => ArrayEq(a.c ?? [], b.c ?? []) , ...wallData);
		if (wallData.length == dupeRemover.length) {
			this.errorLog.push("Create walls seems to have failed to remove duplicates");
		}
    return dupeRemover;
  }

	private async updateSceneName( dungeonName: string) {
		const name = `${dungeonName} L${this.depth+1}`;
		await this.scene.update({name});
	}

	private async movePCs() {
		const PCTokens = this.scene.tokens.filter( tok => tok.actor != undefined && tok.actor.hasPlayerOwner && !tok.hidden);
		const startingSq = this.squareList.find( x=> x.isStartPoint());
		if (!startingSq) {
			ui.notifications.error("No startign square");
			return;
		}
		for (const tok of PCTokens) {
			const {x, y} = this.treasurePosition(startingSq);
			await tok.move( {x , y, action: "displace"});
		}
	}

	private async clearScene () {
		for (const i of this.scene.walls) {
			await i.delete();
		}
		for (const i of this.scene.regions) {
			await i.delete();
		}
		for (const i of this.scene.drawings) {
			await i.delete();
		}
		for (const t of this.scene.tokens) {
			if (game.itempiles && game.itempiles.API.isValidItemPile(t)) {
			await t.delete();
				continue;
			}
			if (t.actor && t.actor.isShadow()) {await t.delete();}
		}
	}

	private async createWalls() {
		await this.addWalls(this.wallData);
		const lines = this.wallData
			.map(x=> this.wallToLineConvert(x))
			.filter (x => x != undefined);
		await this.scene.createEmbeddedDocuments( "Drawing", lines);
	}

  private async createRegions() {
    for (const sq of this.squareList) {
      const rdata = this.regionData.get(sq);
      if (!rdata) {continue;}
      const region = (await this.scene.createEmbeddedDocuments<PersonaRegion>("Region", [rdata as Record<string, unknown>]))[0];
      const regionData = this.prepPersonaRegionData(sq);
      await region.setRegionData(regionData);
    }
  }

	private prepPersonaRegionData(sq: DungeonSquare) : RegionData {
		const secret = this.region_secret(sq);
		const hazard = this.region_hazard(sq);
		const regionData: RegionData = {
			ignore: false,
			secret: secret.status,
			hazard: hazard.status,
			secretDetails: secret.details,
			hazardDetails: hazard.details,
			treasures: {
				found: 0,
				max: sq.maxTreasures(),
			},
			roomEffects: this.region_roomEffects(sq),
			pointsOfInterest: this.region_pointsOfInterest(sq),
			specialMods: this.region_specialMods(sq),
			shadowPresence: sq.shadowPresence(),
			secretNotes: this.region_notes(sq),
			challengeLevel: 0
		};
    return regionData;
	}

  private region_notes (sq: DungeonSquare) : string {
    let notes= "";
    notes += sq.flavorText
      .filter( ft => ft.gmNote)
      .map (ft=> ft.gmNote)
      .join( "\n");
    return notes;
  }

  private checkDimensions() {
    const rect = this.scene.dimensions.sceneRect;
    const width = rect.width;
    const height = rect.height;
    const gridSize = this.scene.grid.size;
    const maxWidth = Math.floor(width / gridSize / DungeonSquare.WIDTH
    );
    const maxHeight = Math.floor(
     height / gridSize/ DungeonSquare.HEIGHT
    );
    if (this.generator.dimensions.width > maxWidth) {
      PersonaError.softFail(`Warning: Dungeon is too wide ${maxWidth} scene max width,  but geneator is using ${this.generator.dimensions.width} width`);
    }
    if (this.generator.dimensions.height > maxHeight) {
      PersonaError.softFail(`Warning: Dungeon is too tall ${maxWidth} scene max height,  but geneator is using ${this.generator.dimensions.width} height`);
    }
  }

  private region_roomEffects( _sq: DungeonSquare) : RegionData["roomEffects"] {
    return [];
  }

  private region_specialMods(sq: DungeonSquare) : RegionData["specialMods"] {
    let mods : RegionData["specialMods"] = [];
    if (sq.isTeleporter()) {
      return ["safe" ,"compendium-access"];
    }
    if (sq.isStartPoint()) {
      return ["safe"];
    }
    if (sq.isRoom()) {
      const x = Math.floor(Math.random() * 10 + 1);
      if (x>= 9) {
        mods.push("treasure-rich");
      }
    }
    if (sq.isCorridor()) {
      const x = Math.floor(Math.random() * 10 + 1);
      if (x< 5) {
        mods.push("treasure-poor");
      }
    }
    if (sq.flavorText.some(x=> x.ultraRichTreasure)) {
      if (mods.includes("treasure-rich") || mods.includes("treasure-poor")) {
        mods = mods
          .filter ( x=> x != "treasure-poor" && x != "treasure-rich");
      }
      mods.push("treasure-ultra");
    }

    return mods;

	}

	private region_secret(sq: DungeonSquare) : {status: RegionData["secret"], details: string} {
		let status : RegionData["secret"] = "none";
		const details :string[]= [];
    const ft = sq.flavorText.find( x=> x.secret);
    if (ft) {
      status = "hidden";
      details.push(ft.secret!);
    }
    if (sq.group.hasHiddenDoor()) {
      status = "hidden";
      details.push("Secret Door");

    }
		return {status, details: details.join(", ")};
	}

private region_hazard(sq: DungeonSquare) : {status: RegionData["hazard"], details: string} {
		let status : RegionData["hazard"] = "none";
		let details = "";
    const ft = sq.flavorText.find( x=> x.hazard);
    if (ft) {
      status = "hidden";
      details = ft.hazard!;
    }
		return {status, details};
	}


	private region_pointsOfInterest(sq: DungeonSquare) : string []{
		const ret = [];
		switch (true) {
			case sq.isStartPoint():
				if (sq.parent.currentDepth == 0) {
					ret.push("Exit: An exit leads back to Wonderland");
				} else {
					ret.push("Ascend Point: You can ascend towards the higher level here.");
				}
				break;
			case sq.isStairsDown():
				ret.push("Descend Point: You can descend even deeper into this strange realm.");
				break;
			case sq.isTeleporter():
				ret.push("Access Terminal: You can use this to return back to the entrance of Wonderland");
				break;
		}
    ret.push(... sq
      .flavorText.filter( x=> x.text)
      .map (x => x.text)
    );
		return ret;
	}


	private async addWalls(wallData: Partial<WallData>[]) {
		await this.scene.createEmbeddedDocuments("Wall", wallData);
	}

	private async createTreasures() {
		if (game.itempiles == undefined) {
			PersonaError.softFail("No item piles, can't create treasures");
			return;
		}
		for (const sq of this.squareList)  {
      const treasures = this.treasureData.get(sq) ?? [];
			if (treasures.length == 0) {continue;}
			const position = this.treasurePosition(sq);
			const pile = await game.itempiles.API.createItemPile({position});
			if (!pile?.tokenUuid)  {
				PersonaError.softFail(`Something went wrong with creating Item pile at ${position.x} , ${position.y}`);
				return;
			}
			const pileActor = await foundry.utils.fromUuid(pile.tokenUuid) as TokenDocument<PersonaActor> ;
			if (!pileActor || !(pileActor instanceof TokenDocument) || !pileActor.actor) {
				PersonaError.softFail(`Cant' find token ${pile?.tokenUuid}`);
				return;
			}
			for (const treasure of (treasures as EnchantedTreasureFormat[])) {
				await pileActor.actor.addTreasureItem(treasure, true);
			}
		}

	}

	private async resetFog() {
		if (!game.user.isGM) {return;}
		if (game.scenes.current != this.scene) {
			new PersonaError("Can't clear fog this scene isn't current scene.");
		}
		await game.canvas.fog.reset();
	}

	private async setRandomEncounterList() {
		await this.scene.setDifficulty(this.difficultyLevel);
	}

  private async writeSceneModifiers() {
    const mods = this.sceneMods;
    let mod0 = mods.at(0);
    if (typeof mod0 == "string") {
      mod0 = PersonaDB.getSceneModifiers().find( x=> x.name == mod0 || x.id == mod0);
    }
    if (mod0 == undefined) {
      await this.scene.setSceneModifiers([]);
      return;
    }
    if (mod0 instanceof PersonaItem) {
      await this.scene.setSceneModifiers(mods as UniversalModifier[]);
    } else {
      throw new PersonaError("Modifiers aren't of type PersonaItem UniversalModifier");
    }
  }

	wallToLineConvert( wd: Pick<WallData, "door" | "c">) : U<Partial<Foundry.DrawingData>> {
		if (wd.door == 1) {return undefined;}
		const [x1, y1, x2, y2] = DungeonSquare.flipCoordsIfNecessary(wd.c);
		const dx = x2 - x1;
		const dy = y2 - y1;
		const shape : Foundry.ShapesData = {
			type: "p",
			height: Math.abs(y2- y1),
			width: Math.abs(x2- x1),
			radius: null,
			points: [0, 0, Math.abs(dx), Math.abs(dy)]
		};
		const color = wd.door == 0 ? this.WALL_COLOR: this.SECRET_DOOR_COLOR;
		return {
			x: x1,
			y: y1,
			strokeColor: color,
			strokeWidth: 15,
			strokeAlpha: 0.8,
			shape,
			hidden: false,
			locked: true,
			interface: false,
		};
	}

  generateWallData ( c : WallData["c"], isDoor : "secret" | boolean = false) {
    const texture = isDoor == true
      ? this.DOOR_TEXTURE
      :   this.WALL_TEXTURE;
    const animation = {
      direction :1,
      double :  false,
      duration :  750,
      flip :  false,
      strength : 1,
      texture : texture,
      type :  "descend",
    };
    const doorVal = (isDoor === "secret") ? 2
      : isDoor == true ? 1
      :0 ;
    const wallData = {
      c,
      door: doorVal, // 2 is secret door, used for walling
      ds: doorVal == 2 ? 2 : 0, //0 is closed, 1 open, 2 locked
      light: 20,
      move: 20,
      sight: 20,
      sound: 20,
      animation: doorVal == 1 ? animation : undefined,
    } satisfies Partial<WallData>;
    return wallData;
  }

  generateWall(start: Point, other: Point) {
    const coords = this.getWallCoords(start, other);
    return [this.generateWallData(coords)];
  }

	getWallCoords(start: Point, other: Point): WallData["c"] {
		const GS = this.grid.size * this.SQUARE_HEIGHT;
		let {x, y} = this.realCoordinates(start);
		const direction = RandomDungeonGenerator.getDirectionBetween(start, other);
		let x2 = x;
		let y2 = y;
		switch (direction) {
			case "left":  y2 +=GS; break;
			case "right": x += GS; x2+= GS;y2 +=GS; break;
			case "up": x2 += GS;break;
			case "down": y += GS ; y2 += GS; x2+=GS; break;
		}
		return [ x, y, x2, y2];
	}

  realCoordinates( pt: Point) : Point {
		const gridSize = this.grid.size;
		const x = this.grid.x + (gridSize * pt.x * this.SQUARE_WIDTH);
		const y = this.grid.y + (gridSize * pt.y * this.SQUARE_HEIGHT);
		return {x, y};

  }

	generateDoor(start : Point, other: Point, isSecret : boolean) {
		const [wall1, door, wall2] = this.getDoorCoords(start, other);
		return [
			this.generateWallData(wall1),
			this.generateWallData(door, isSecret ? "secret" : true),
			this.generateWallData(wall2),
		];
	}

	getDoorCoords(start: Point, other: Point): WallData["c"][] {
		const wallCoords = this.getWallCoords(start, other);
		const doorCoords = DungeonSquare.splitLine(wallCoords, 3);
		return doorCoords;
	}

  sq (x: number, y: number) {
    return this.squareList.find( sq=> sq.x == x && sq.y == y);
  }

	private createWallsOnSquare(sq: DungeonSquare) {
		const walls = [] as ReturnType<RandomDungeonOutput<unknown>["generateWallData"]>[];
		const adj = sq.getAdjoiningPoints();
		const outOfBounds = adj
			.filter( pt => this.sq(pt.x, pt.y) == undefined);
		const possibles = adj
			.map( pt => this.sq(pt.x, pt.y))
			.filter( sq=> sq != undefined);

		for (const OB of outOfBounds) {
			walls.push(...this.generateWall(sq, OB));
		}
		for (const poss of possibles) {
			if (!sq.connections.includes(poss)) {
				walls.push(...this.generateWall(sq, poss));
				continue;
			}
			if (poss.type != sq.type)  {
				const isSecret = poss.isHiddenRoom() || sq.isHiddenRoom();
				walls.push(...this.generateDoor(sq, poss, isSecret));
				continue;
			}
		}
		return walls;
	}

	treasurePosition(sq : DungeonSquare): Point {
		let {x,y} = this.realCoordinates(sq);
		const GS = this.grid.size;
		x += Math.floor(this.SQUARE_WIDTH /2) * GS;
		y += Math.floor(this.SQUARE_HEIGHT /2) * GS;
		return {x,y};
	}

	rect(sq: DungeonSquare) : RegionDocument["shapes"][number] {
		const {x,y} = this.realCoordinates(sq);
		const width = DungeonSquare.WIDTH;
		const height = width;
		return {
			type :"rectangle",
			x, y,
			width: this.grid.size * width,
			height: this.grid.size * height,
			hole: false,
			rotation: 0,
		};
	}

	private makeRegionData(sq: DungeonSquare) : U<RegionBaseData> {
		if (sq.canBeRegion === false) {return;}
		const name = sq.generateRegionName();
		const shapes = sq.group.map( x=> this.rect(x));
		const regionConstructionInfo : RegionBaseData = {
			name,
			shapes,
		};
		sq.group.forEach( member => member.canBeRegion = false);
    //need to compress thigs like flavor text and such into the one region
		return regionConstructionInfo;
	}

	generateTreasures(sq: DungeonSquare,) : TreasureType[] {
    const arr : TreasureType[] = [];
		let modifier: number = 0;
    let minLevel : number = 1;
		switch (true) {
			case sq.isDeadEnd():
				modifier += -25;
				break;
      case sq.isHiddenRoom():
        modifier += 25;
        minLevel += 50;
        break;
			case sq.isRoom():
				modifier = 1;
				break;
			default:
				modifier = -50;
		}
    let amt = sq.numOfTreasures ?? 0;
		while (amt -- > 0) {
			const treasure = this.treasureSystem.generate(this.difficultyLevel, modifier, minLevel);
			// const treasure = TreasureSystem.generate(this.difficultyLevel, modifier);
			arr.push(...treasure);
		}
    return arr;
	}

}

type RegionData = PersonaRegion["regionData"];

type RegionBaseData = Pick<RegionDocument, "name" | "shapes">;

interface TreasureGenerator<T>  {
  generate (diffLevel: number, modifier?: number, minLevel?: number): T[];
}

