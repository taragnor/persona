import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaItem} from "../item/persona-item.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {PersonaRegion} from "../region/persona-region";
import {DungeonSquare, WallData} from "./dungeon-generator-square.js";
import {RandomDungeonGenerator} from "./random-dungeon-generator.js";
import {EnchantedTreasureFormat, TreasureSystem} from "./treasure-system.js";

export class RandomDungeonOutput {

	scene: PersonaScene;
	_generator: U<RandomDungeonGenerator>;

	static async outputToScene (gen: RandomDungeonGenerator, scene: PersonaScene) {
		const outputter = new RandomDungeonOutput( scene, gen);
		await outputter.outputDataToScene();
	}

	get wallData() {
		return this.generator.wallData;
	}

	get generator() : RandomDungeonGenerator {

		if (!this._generator) {
			throw new PersonaError("No generator provided");
		}
		return this._generator;
	}

	get squareList() {
		return this.generator.squareList;
	}

	constructor (scene: PersonaScene, generator: RandomDungeonGenerator) {
		if (!scene.allowsRandomGenerator()) {
			throw new PersonaError("This scene doesn't allow random Mutation");
		}
		this.scene = scene;
		this._generator = generator;
	}

	async outputDataToScene() {
		if (this.squareList.length == 0) {
			throw new PersonaError("You haven't run genreate yet");
		}
		await this.clearScene();
		await this.movePCs();
		await this.resetFog();
		await this.updateSceneName();
		await this.createWalls();
		await this.createRegions();
		await this.createTreasures();
		await this.setRandomEncounterList();
		await this.writeSceneModifiers();
		await this.resetFog();
	}

	private async updateSceneName() {
		const name = `${this.generator.name} L${this.generator.currentDepth+1}`;
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
			const {x, y} = startingSq.treasurePosition();
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
			.map(x=> RandomDungeonOutput.wallToLineConvert(x))
			.filter (x => x != undefined);
		await this.scene.createEmbeddedDocuments( "Drawing", lines);
	}


  private async createRegions() {
    for (const sq of this.squareList) {
      const rdata = sq.region;
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
			roomEffects: [],
			pointsOfInterest: this.region_pointsOfInterest(sq),
			specialMods: this.region_specialMods(sq),
			shadowPresence: sq.shadowPresence(),
			secretNotes: "",
			challengeLevel: 0
		};
    return regionData;
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
		let details = "";
    const ft = sq.flavorText.find( x=> x.secret);
    if (ft) {
      status = "hidden";
      details = ft.secret!;
    }
		return {status, details};
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
			if (sq.treasures.length == 0) {continue;}
			const position = sq.treasurePosition();
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
      if (this._generator?.treasureSystem != TreasureSystem) {
        PersonaError.softFail("Treasure system in generator is not correct");
      }
			for (const treasure of (sq.treasures as EnchantedTreasureFormat[])) {
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
		await this.scene.setDifficulty(this.generator.difficultyLevel);
	}

  private async writeSceneModifiers() {
    const mods = this.generator.sceneModifiers;
    const mod0= mods.at(0);
    if (mod0 == undefined) {return;}
    if (mod0 instanceof PersonaItem) {
      await this.scene.setSceneModifiers(mods as UniversalModifier[]);
    } else {
      throw new PersonaError("Modifiers aren't of type PersonaItem UniversalModifier");
    }
  }

	static wallToLineConvert( wd: Pick<WallData, "door" | "c">) : U<Partial<Foundry.DrawingData>> {
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
		const color = wd.door == 0 ? "#FF0000" : "#DD0000";
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

}

type RegionData = PersonaRegion["regionData"];
