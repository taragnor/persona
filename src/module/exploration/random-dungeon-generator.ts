import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {PersonaRegion} from "../region/persona-region.js";
import {SeededRandom} from "../utility/seededRandom.js";
import {DungeonSquare, Point, WallData} from "./dungeon-generator-square.js";

export class RandomDungeonGenerator {
	scene: PersonaScene;
	gridSize: number;
	gridX: number;
	gridY: number;
	width: number;
	height: number;
	squares: U<DungeonSquare>[][];
	squareList: DungeonSquare[];
	maxSquaresWidth : number;
	maxSquaresHeight : number;
	rng: SeededRandom;
	squaresTaken: number;
	_depth: number;
	_name : string;
	lenientMode: boolean;
	_baseDiff: number;

	static init() {}

	constructor(scene: PersonaScene, dungeonName: string = "Unnamed Dungeon", depth: number = 1) {
		this.squaresTaken = 0;
		this.scene = scene;
		this.gridSize = scene.grid.size;
		const rect = scene.dimensions.sceneRect;
		this.gridX= rect.x;
		this.gridY= rect.y;
		this.width = rect.width;
		this.height = rect.height;
		this.calcmaxSquares();
		this.#resetSquares();
		this._depth = depth;
		this._name = dungeonName;
		this.lenientMode = false;
		this._baseDiff= this.scene.baseDungeonLevel;
		if (this._baseDiff == 0) {
			throw new PersonaError(`${scene.name} has no inset Difficulty`);
		}
	}

	#resetSquares() {
		this.squares = this.#makeRows();
		this.squareList = [];

	}

	get name () :string {return this._name;}

	get currentDepth() : number {return this._depth;}

	print() : string {
		let ret = "";
		for (const column of this.squares) {
			ret += column
				.map(sq=> sq ? sq.print() : " ")
				.join("");
			ret += "\n";
		}
		return `
		${ret}
		`;
	}

	get difficultyLevel() {
		return this._baseDiff + this.currentDepth;
	}

	getAdjacentX(pt: Point, type : DungeonSquare["type"]) : Point[] {
		return DungeonSquare.getAdjoiningPoints(pt)
			.filter( p=> this.isInBounds(p.x, p.y)
				&& this.sq(p.x, p.y)?.type == type
			);
	}

	#makeRows() : typeof this["squares"] {
		let size = this.maxSquaresWidth;
		const arr : U<DungeonSquare>[][] = [];
		while (size-- > 0) {
			arr.push(this.#makeColumn());
		}
		return arr;
	}

	#makeColumn() : U<DungeonSquare>[] {
		let size = this.maxSquaresHeight;
		const arr : U<DungeonSquare>[] = [];
		while (size-- > 0) {
			arr.push(undefined);
		}
		return arr;
	}

	isInBounds(sqx: number, sqy: number): boolean {
		return sqx >= 0 && sqx < this.maxSquaresWidth
			&& sqy >= 0 && sqy < this.maxSquaresHeight;
	}

	randomEmptySquareCoords() : {x:number , y:number} {
		let randx : number;
		let randy : number;
		let safetyBreak = 0;
		do {
			randx = this.rng.die(1,this.maxSquaresWidth)  -1;
			randy = this.rng.die(1, this.maxSquaresHeight)-1 ;
			if (!this.isInBounds(randx, randy)) {
				throw new PersonaError("Out of bounds error, this shyouldn't happen");
			}
			if (safetyBreak ++ > 10000) {
				Debug(this);
				throw new PersonaError("Safety Break");
			}
		} while (this.sq(randx, randy) != undefined);
		return {
			x: randx,
			y: randy,
		};
	}

	constructSquareAt( {x, y} : {x: number, y:number}, type: DungeonSquare["type"] ) : DungeonSquare {
		if (!this.isInBounds(x, y)) {
			throw new PersonaError(`Square ${x} ${y} is out of bounds`);
		}
		if (this.sq(x, y)) {
			throw new PersonaError(`Trying to create a quare a ${x} ${y} where one alerady exists`);
		}
		const sq = new DungeonSquare(this, x, y, type);
		this.squares[x][y]= sq;
		this.squaresTaken+=1 ;
		this.squareList.push(sq);
		return sq;
	}

	sq(x: number, y: number) : U<DungeonSquare> {
		if (!this.isInBounds(x, y)) {return undefined;}
		return this.squares[x][y];
	}

	calcmaxSquares() {
		this.maxSquaresWidth= Math.floor(this.width / this.gridSize / DungeonSquare.WIDTH
		);
		this.maxSquaresHeight = Math.floor(
			this.height / this.gridSize/ DungeonSquare.HEIGHT
		);
	}

	placeStartingRoom() {
		const randLoc = this.randomEmptySquareCoords();
		const sq = this.constructSquareAt(randLoc, "room");
		sq.makeStairsUp();

	}

	numOfAdjacentCorridors(pt: Point) : number {
		const corridors = this.getAdjacentX(pt, "corridor");
		return corridors.length;
	}

	numOfAdjacentRooms(pt: Point) : number {
		const rooms = this.getAdjacentX(pt, "room");
		return rooms.length;
	}


	createDungeonCorridors(numOfSquares : number) {
		let breakout = 0;
		const rng = this.rng;
		while (numOfSquares > 0) {
			const pts = this.squareList
				.filter( sq => sq.isLegalToExpand(this.lenientMode))
				.map( sq => [sq, sq
					.getEmptyAdjoiningPoints()
					.filter(pt => this.numOfAdjacentCorridors(pt) <= 1)
				])
				.filter( data => (data.at(1) as DungeonSquare[]).length > 0)
			;
			if (pts.length == 0) {
				console.log("Early break out of corridors");
				return;
			}
			const origin = rng.randomArraySelect(pts);
			if (!origin) {
				if (breakout++ > 10000) {
					Debug(this);
					throw new PersonaError("corridor create breakout trap");
				}
				continue;
			}
			const pt = rng.randomArraySelect(origin.at(1) as DungeonSquare[]);
			if (pt) {
				numOfSquares -= this.startCorridorAt(pt, origin.at(0) as DungeonSquare);
			}
		}
	}

	createDungeonRooms(numOfSquares: number) {
		let breakout = 0;
		const rng = this.rng;
		while (numOfSquares > 0) {
			const pts = this.squareList
				.filter( sq=> sq.type == "corridor")
				.filter( sq => sq.isLegalToExpand(this.lenientMode))
				.map( sq => [sq, sq
					.getEmptyAdjoiningPoints()
					.filter(pt => this.numOfAdjacentRooms(pt) == 0)
				])
				.filter( data => (data.at(1) as DungeonSquare[]).length > 0);
			if (pts.length == 0) {
				console.log("Early break out of rooms");
				return;
			}
			const origin = rng.randomArraySelect(pts);
			if (!origin) {
				if (breakout++ > 10000) {
					Debug(this);
					throw new PersonaError("room create breakout trap");
				}
				continue;
			}
			const pt = rng.randomArraySelect(origin.at(1) as DungeonSquare[]);
			if (pt) {
				numOfSquares -= this.startRoomAt(pt, origin.at(0) as DungeonSquare);
			}
		}
	}

	/** returns number of squares used*/
	startCorridorAt(pt: Point, origin: DungeonSquare) : number {
		const firstSquare = this.constructSquareAt(pt, "corridor");
		firstSquare.connectTo(origin);
		const adjCorridors = firstSquare.getAdjacentCorridors();
		if (adjCorridors.length > 0) {
			const rndCorridor = this.rng.randomArraySelect(adjCorridors)!;
			const direction = this.getDirectionBetween(rndCorridor, firstSquare);
			return 1 + this.extendCorridor(firstSquare, direction);
		}
		const adjRooms = firstSquare.getAdjacentRooms();
		if (adjRooms.length > 0) {
			const rndRoom = this.rng.randomArraySelect(adjRooms)!;
			const direction = this.getDirectionBetween(rndRoom, firstSquare);
			return 1 + this.extendCorridor(firstSquare, direction);
		}
		return 1;
	}

	startRoomAt(pt: Point, origin: DungeonSquare) : number {
		const firstSquare = this.constructSquareAt(pt, "room");
		firstSquare.connectTo(origin);
		return 1;
	}

	/** returns direction from a to b */
	getDirectionBetween( a: Point, b: Point) : Direction {
		switch (true) {
			case a.x < b.x: return "right";
			case a.x > b.x: return "left";
			case a.y < b.y : return "down";
			case a.y > b.y: return "up";
			default: throw new PersonaError("Points are equal!");
		}
	}

	extendCorridor(sq: DungeonSquare, direction: Direction) : number {
		const corridorParts= [sq];
		const corridorLen = this.rng.die(1,4)+1;
		let corridorsMade = 0;
		while (corridorsMade < corridorLen && sq.isLegalToExpand(this.lenientMode)) {
			const nextPt = sq[direction];
			if ( !this.isInBounds(nextPt.x, nextPt.y)
				|| this.sq(nextPt.x, nextPt.y)
			) { break; }
			const newSq = this.constructSquareAt(nextPt, "corridor");
			corridorParts.push(newSq);
			sq.connectTo(newSq);
			sq = newSq;
			corridorsMade += 1;
		}
		for (const pt of corridorParts) {
			pt.addToGroup(corridorParts);
		}
		console.log(`corridor Parts: ${corridorParts.map(x=> x.print()).join("")}`);
		return corridorsMade;
	}

	assignExit() {
		const list = this.squareList
			.filter(x=> x.type == "room")
			.filter (x=> !x.isStartPoint());
		const rm = this.rng.randomArraySelect(list);
		if (!rm) {
			throw new PersonaError("Can't assign exit room!");
		}
		rm.makeStairsDown();
	}

	assignTreasures() {
		const list = this.squareList
			.filter(x=> x.isRoom() || x.isDeadEnd())
			.filter (x=> !x.isStartPoint() && !x.isStairsDown());
		const rng = this.rng;
		for (const room of list) {
			const treasureCheck = rng.die(1,100);
			if (treasureCheck < 40) {continue;}
			const amount = rng.die(1,2);
			room.addTreasure(amount);
		}
	}


	async generate(numSquares: number, seedString: string = "TEST") {
		const totalSquares = this.maxSquaresWidth * this.maxSquaresHeight;
		if (numSquares > totalSquares) {
			throw new PersonaError(`Too big, trying to request ${numSquares} with only ${totalSquares} available`);
		}
		let timeout = 0;
		while (timeout < 100) {
			try {
				this.createDungeon(numSquares, seedString);
				break;
			} catch {
				timeout ++;
				seedString = seedString + "A";
			}
		}
		if (timeout >= 100) {
			PersonaError.softFail("Generation had too many errrors and had to bail out");
		}
		this.assignExit();
		this.assignTreasures();
		this.finalizeSquares();
		console.log( this.print());
		await this.outputDataToScene();
	}

	createDungeon(numSquares: number, seedString: string = "TEST") {
		this.lenientMode = false;
		this.rng = new SeededRandom(seedString);
		this.#resetSquares();
		this.placeStartingRoom();
		let emergencyBrake = 0;
		while (this.squareList.length < numSquares) {
			const corridors = this.rng.die(2,3)+1;
			this.createDungeonCorridors(corridors );
			const rooms = this.rng.die(1,2);
			this.createDungeonRooms(rooms);
			if (emergencyBrake > 500) {
				this.lenientMode = true;
			}
			if (emergencyBrake++ > 10000) {
				throw new GenerationBailOutError("Had To bail out on generation, too many retries");
			}
		}
	}

	async setRandomEncounterList() {
		const CR =this.difficultyLevel;
		await this.scene.setTrueDifficulty(CR);

		const shadows = PersonaDB.shadows()
			.filter( x => x.isEligibleForRandomEncounter())
			.filter(x=> x.level >= CR -3 &&  x.level<= CR +5)
			.filter( x=> !x.isBossOrMiniBossType());

		await this.scene.setRandomEncounterList(shadows);
		console.log(`setting random encounter list : ${shadows.map(x=> x.name).join()}` );
	}

	finalizeSquares() {
		this.squareList.forEach( sq=> sq.finalize());
	}


	async outputDataToScene() {
		if (!this.scene.allowsRandomGenerator()) {
			ui.notifications.warn("This scene doesn't allow random Mutation");
			return;
		}
		await this.clearScene();
		await this.movePCs();
		await this.resetFog();
		await this.updateSceneName();
		await this.createWalls();
		await this.createRegions();
		await this.createTreasures();
		await this.setRandomEncounterList();
		await this.resetFog();
	}

	async updateSceneName() {
		const name = `${this.name} L${this.currentDepth+1}`;
		await this.scene.update({name});
	}

	async movePCs() {
		const PCTokens = this.scene.tokens.filter( tok => tok.actor != undefined && tok.actor.hasPlayerOwner);
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

	async clearScene () {
		for (const i of this.scene.walls) {
			await i.delete();
		}
		for (const i of this.scene.regions) {
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

	async createWalls() {
		const wallData = this.squareList
			.flatMap( x=> x.walls());
		await this.addWall(wallData);
	}

	async createRegions() {
		for (const sq of this.squareList) {
			const rdata = sq.region;
			if (!rdata) {continue;}
			const region = (await this.scene.createEmbeddedDocuments<PersonaRegion>("Region", [rdata as Record<string, unknown>]))[0];
			await region.setRegionData(sq.regionData);
		}
	}


	async addWall(wallData: Partial<WallData>[]) {
		await this.scene.createEmbeddedDocuments("Wall", wallData);
	}

	async createTreasures() {
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
			for (const treasure of sq.treasures) {
				await pileActor.actor.addTreasureItem(treasure, true);
			}
		}

	}

	async resetFog() {
		if (!game.user.isGM) {return;}
		if (game.scenes.current != this.scene) {
			new PersonaError("Can't clear fog this scene isn't current scene.");
		}
		await game.canvas.fog.reset();
	}

}








//@ts-expect-error adding to glboal scope for test
window.DG = RandomDungeonGenerator;

type Direction = "up" | "down" | "left" |"right";



class GenerationBailOutError extends Error {

}
