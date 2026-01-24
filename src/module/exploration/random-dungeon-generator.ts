import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {ArrayEq} from "../utility/array-tools.js";
import {SeededRandom} from "../utility/seededRandom.js";
import {DungeonSquare, Point} from "./dungeon-generator-square.js";

export class RandomDungeonGenerator {
	seedString: string;
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
	wallData: ReturnType<DungeonSquare["walls"]> = [];
	sceneModifiers : UniversalModifier[] = [];
	SCENEMODS = SCENE_MOD_NAMES;

	static SPECIAL_FLOORS = ["tough-enemy", "revealed", "treasure-shadow", "dark"] as const;

	static init() {}

	constructor(scene: PersonaScene, dungeonName: string = "Unnamed Dungeon", depth: number = 1, baseDiff ?: number) {
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
		this.wallData = [];
		this._baseDiff = (this.scene.baseDungeonLevel || baseDiff) ?? 0;
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

		let ret = `Dungeon Lvl ${this.currentDepth} Seed: ${this.seedString}`;
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
		return this._baseDiff + Math.floor(this.currentDepth / 2);
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
				throw new InvalidDungeonError("Out of bounds error, this shyouldn't happen");
			}
			if (safetyBreak ++ > 10000) {
				Debug(this);
				throw new InvalidDungeonError("Safety Break");
			}
		} while (this.sq(randx, randy) != undefined);
		return {
			x: randx,
			y: randy,
		};
	}

	constructSquareAt( {x, y} : {x: number, y:number}, type: DungeonSquare["type"] ) : DungeonSquare {
		if (!this.isInBounds(x, y)) {
			throw new InvalidDungeonError(`Square ${x} ${y} is out of bounds`);
		}
		if (this.sq(x, y)) {
			throw new InvalidDungeonError(`Trying to create a quare a ${x} ${y} where one alerady exists`);
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
					throw new InvalidDungeonError("corridor create breakout trap");
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
					throw new InvalidDungeonError("room create breakout trap");
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
			default: throw new UnexpectedResultError("Points are equal!");
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

	private assignExit() {
		const list = this.squareList
			.filter(x=> x.type == "room")
			.filter (x=> !x.isStartPoint());
		const rm = this.rng.randomArraySelect(list);
		if (!rm) {
			throw new InvalidDungeonError("Can't assign exit room!");
		}
		rm.makeStairsDown();
	}

	private assignTreasures() {
		const list = this.squareList
			.filter(x=> x.isRoom() || x.isDeadEnd())
			.filter (x=> !x.isStairs() && !x.isTeleporter());
		const rng = this.rng;
		for (const room of list) {
			if (!this.percentChance(60)) {continue;}
			const amount = rng.die(1,2);
			room.addTreasure(amount);
		}
	}

	private assignFlavorText() {
		this.squareList
			.filter( sq => sq.isEmptyRoom())
			.filter( sq => this.percentChance( sq.isHiddenRoom() ? 100 : 60))
			.forEach( sq=> this.createFlavorEffectInRoom(sq));

		this.squareList
			.filter( sq => sq.isCorridor())
			.filter( _sq => this.percentChance(20))
			.forEach( sq=> this.createFlavorEffectInCorridor(sq));
	}

	private createFlavorEffectInRoom(sq: DungeonSquare) : void{
		const effect = this.rng.weightedChoice(
			ROOM_FLAVORS
			.filter( fl =>
				(!sq.isHiddenRoom() && !fl.hiddenRoomOnly)
				|| (sq.isHiddenRoom() && fl.hiddenRoomOnly)
			)
			.map( fl => ({weight: fl.weight ?? 1.0, item: fl}))
		);
		if (!effect) {return;}
		sq.addFlavorText(effect);
	}

	private createFlavorEffectInCorridor (sq: DungeonSquare) : void {
		const effect = this.rng.weightedChoice(
			CORRIDOR_FLAVORS
			.filter( fl => !fl.tellForHiddenDoor || sq.hasHiddenDoor() )
			.map( fl => ({weight: fl.weight ?? 1.0, item: fl}))
		);
		if (!effect) {return;}
		sq.addFlavorText(effect);

	}

	assignSpecials() {
		const list = this.squareList
			.filter (x=> !x.isStairs());
		for (const room of list) {
			if (!this.percentChance(30)) {continue;}
			room.assignSpecials();
		}
	}

	percentChance(percentNum: number) : boolean {
		const check = this.rng.die(1,100);
		if (check <= percentNum) {return true;}
		return false;
	}

	private init(numSquares: number, originalSeedString: string) {
		this.seedString = originalSeedString;
		const totalSquares = this.maxSquaresWidth * this.maxSquaresHeight;
		if (numSquares > totalSquares) {
			throw new InvalidDungeonError(`Too big, trying to request ${numSquares} with only ${totalSquares} available`);
		}
	}

	generate(numSquares: number, originalSeedString: string = "TEST") {
		this.init(numSquares, originalSeedString);
		let timeout = 0;
		while (timeout < 100) {
			try {
				this.createFloorplan(numSquares);
				this.assignExit();
				this.assignSpecialFloors();
				this.assignSpecials();
				this.assignTreasures();
				this.assignFlavorText();
				this.finalizeSquares();
				console.log( this.print());
				return this;
			} catch (e) {
				timeout ++;
				if (e instanceof UnexpectedResultError) {
					PersonaError.softFail("Unexpected Behavior from dungeon generator", e);
				}
				this.seedString += this.rng.randomLetter();
				// this.seedString += "A";
			}
		}
		if (timeout >= 100) {
			throw new InvalidDungeonError("Generation had too many errrors and had to bail out");
		}
	}

	private createFloorplan(numSquares: number) {
		this.lenientMode = false;
		this.rng = new SeededRandom(this.seedString);
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

	finalizeSquares() {
		this.squareList.forEach( sq=> sq.finalize());
		this.prepareWallData();
	}

	assignSpecialFloors() {
		const roll = this.rng.die(1,100);
		const mods : (keyof typeof SCENE_MOD_NAMES)[] = [];
		if (this.currentDepth < 2) {return;}
		switch (true) {
			case roll < 5: {
				mods.push("hardShadowsFloor");
				break;
			}
			case roll < 10: {
				mods.push("treasureFloor");
				break;
			}
			case roll < 14: {
				mods.push("shadowDrops");
				break;
			}
			default:
				break;
		}
		this.sceneModifiers = mods
			.flatMap (x=> this.getSceneMod(x));
	}

	getSceneMod ( mod : keyof RandomDungeonGenerator["SCENEMODS"]) : UniversalModifier[] {
		const item = PersonaDB.getSceneModifiers().find( x=> x.name == this.SCENEMODS[mod]);
		if (item) {return [item];}
		PersonaError.softFail(`Can't find modifier ${this.SCENEMODS[mod]}`);
		return [];
	}

	private prepareWallData() {
		const wallData = this.squareList
			.flatMap( x=> x.walls());
		const dupeRemover = ([] as typeof wallData).pushUniqueS((a, b) => ArrayEq(a.c ?? [], b.c ?? []) , ...wallData);
		if (wallData.length == dupeRemover.length) {
			PersonaError.softFail("Create walls seems to have failed to remove duplicates");
		}
		this.wallData = dupeRemover;
	}

}

//@ts-expect-error adding to glboal scope for test
window.DG = RandomDungeonGenerator;

type Direction = "up" | "down" | "left" |"right";

class GenerationBailOutError extends Error {

}

const SCENE_MOD_NAMES = {
	"hardShadowsFloor": "Difficult Enemies",
	"treasureFloor": "Treasure Floor",
	"shadowDrops" : "Extra Shadow Drops",
} as const;


class InvalidDungeonError extends Error { }

class UnexpectedResultError extends Error{ }


export type FlavorText = {
	newName ?: string,
	text: string;
	gmNote?: string,
	secret?: string,
	weight?: number,//defautl to 1
	hazard ?: string,
	ultraRichTreasure ?: true;
};

type CorridorFlavorText = FlavorText & {
	tellForHiddenDoor?: true;
}

type RoomFlavorText = FlavorText & {
	hiddenRoomOnly?: true,
}

const ROOM_FLAVORS : RoomFlavorText[] = [
	{
		newName: "Data Cache",
		text: "There seems to be a collection of various data here. If you had the right implement, you might be able to extract some." ,
		gmNote: "Can be mined with a Data Miner",
	}, {
		newName: "Gallery",
		text: "Various Photos, (many of them of cats) are all over the walls of this room" ,
	}, {
		newName: "Explicit Pictures Gallery",
		text: "Various pictures of a sexual nature are posted here on the walls" ,
		secret: "Can find some clues to find Cassandra's source if possible",
		weight: 0.2,
	}, {
		newName: "Blanked Data",
		text: "The data here seems to have bene deliberately deleted. It seems irrecoverable" ,
		weight: 1.0,
	}, {
		newName: "Blanked Data",
		text: "The data here seems to have bene deliberately deleted." ,
		weight: 0.333,
		secret: "With some effort you're able to reconstruct the data."
	}, {
		newName: "Data Cache",
		text: "There seems to be a collection of various data here. If you had the right implement, you might be able to extract some." ,
		weight: 0.333,
		gmNote: "Can be mined with a Data Miner. Contains financial Data, get 300R",
	}, {
		newName: "Concordia Daemon Processing Node",
		text: "This area seems to contain some kind of secuirity device, it has a concordia signature on it. It does seem important, but do you smash it or try to examine it." ,
		hazard: "Summons a daemon encounter",
		secret: "Grants a new daemon persona or skillCard",
		gmNote: "",
		weight: 0.2,
		hiddenRoomOnly: true,
	}, {
		newName: "Concordia Daemon Processing Node",
		text: "This area seems to contain some kind of secuirity device, it has a concordia signature on it. It does seem important, but do you smash it or try to examine it." ,
		hazard: "Summons a daemon encounter",
		secret: "Reveals Cheshy as a daemon",
		gmNote: "Reveals Cheshy's true nature",
		weight: 0.2,
		hiddenRoomOnly: true,
	}, {
		newName: "Concordia Treasure Cache",
		text: "Seems to be a collection of useful Metaverse objects",
		weight: 0.2,
		hazard: "Alarm raises tension by +2",
		hiddenRoomOnly: true,
		ultraRichTreasure : true ,
	}, {
		newName: "Concordia Metaverse Manipulator",
		text: "An odd Concordia device",
		weight: 0.2,
		hiddenRoomOnly: true,
		secret: "Seems to be a warp zone, takes you down 5 levels instantly."
	},


] as const;

const CORRIDOR_FLAVORS : CorridorFlavorText[] = [
	{
		text: "Many data cubes whizz by at great speed",
	} , {
		text: "Many data cubes whizz by at great speed",
		secret: "There is a Concordia packet inspector here. It seems to be gathering information. Can either be destroyed or tapped for data with the other action.",
		weight: 0.5,
		gmNote: "PCs can destroy it with an other action or try to tap it for data."
	} , {
		text: "The travelling Data cubes seem to travel in an odd path here",
		tellForHiddenDoor : true,
		weight: 0.333,
	}
] as const;
