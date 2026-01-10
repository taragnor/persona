import {PersonaError} from "../persona-error.js";
import {SeededRandom} from "../utility/seededRandom.js";
import {DungeonSquare, Point} from "./dungeon-generator-square.js";

export class RandomDungeonGenerator {
	scene: Scene;
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
	_depth: number

	static init() {}

	constructor(scene: Scene, depth: number = 1) {
		this.squaresTaken = 0;
		this.scene = scene;
		this.gridSize = scene.grid.size;
		const rect = scene.dimensions.sceneRect;
		this.gridX= rect.x;
		this.gridY= rect.y;
		this.width = rect.width;
		this.height = rect.height;
		this.calcmaxSquares();
		this.squares = this.#makeRows();
		this.squareList = [];
		this._depth = depth;
	}

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
		return 78 + this.currentDepth;
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
				.filter( sq => sq.isLegalToExpand())
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
				.filter( sq => sq.isLegalToExpand())
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
			return 1 + this.continueCorridor(firstSquare, direction);
		}
		const adjRooms = firstSquare.getAdjacentRooms();
		if (adjRooms.length > 0) {
			const rndRoom = this.rng.randomArraySelect(adjRooms)!;
			const direction = this.getDirectionBetween(rndRoom, firstSquare);
			return 1 + this.continueCorridor(firstSquare, direction);
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

	continueCorridor(sq: DungeonSquare, direction: Direction) : number {
		const corridorParts= [sq];
		const corridorLen = this.rng.die(1,5)+1;
		let corridorsMade = 0;
		while (corridorsMade >= corridorLen && sq.isLegalToExpand()) {
			const nextPt = sq[direction];
			if ( !this.isInBounds(nextPt.x, nextPt.y)
				|| !this.sq(nextPt.x, nextPt.y)
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
			.filter (x=> !x.isStartPoint() && !x.isExitPoint());
		const rng = this.rng;
		for (const room of list) {
			const treasureCheck = rng.die(1,100);
			if (treasureCheck < 30) {continue;}
			const amount = rng.die(1,3);
			room.addTreasure(amount);
		}
	}

	async generate(numSquares: number, seedString: string = "TEST") {
		this.rng = new SeededRandom(seedString);
		const totalSquares = this.maxSquaresWidth * this.maxSquaresHeight;
		if (numSquares > totalSquares) {
			throw new PersonaError(`Too big, trying to request ${numSquares} with only ${totalSquares} available`);
		}
		//Steps
		this.placeStartingRoom();
		while (numSquares > 0) {
			const corridors = this.rng.die(2,3)+1;
			this.createDungeonCorridors(corridors );
			const rooms = this.rng.die(1,2);
			this.createDungeonRooms(rooms);
			numSquares -= corridors + rooms;
		}
		this.assignExit();
		this.assignTreasures();
		console.log( this.print());
		// await this.outputDataToScene();

	}



	generateWallData ( c : WallData["c"]) : Partial<WallData> {

		const animation = {
			direction :1,
			double :  false,
			duration :  750,
			flip :  false,
			strength : 1,
			texture :  "canvas/doors/small/Door_Stone_Volcanic_B1_1x1.webp",
			type :  "descend",
		};

		const wallData : Partial<WallData> = {
			c,
			door: 1,
			ds: 0,
			light: 20,
			move: 20,
			sight: 20,
			sound: 20,
			animation,
		};
		return wallData;
	}

	async addWall(wallData: WallData[]) {
		await this.scene.createEmbeddedDocuments("Wall", wallData);
	}

	async resetFog() {
		if (!game.user.isGM) {return;}
		if (game.scenes.current != this.scene) {
			new PersonaError("Can't clear fog this scene isn't current scene.");
		}
		await game.canvas.fog.reset();
	}

}


type WallData = Pick<Foundry.WallDocument, "door" | "c" | "ds" | "light" | "sound" | "move" | "sight" | "animation">;

// class DungeonSquare {
// 	parent: RandomDungeonGenerator;
// 	x: number;
// 	y: number;
// 	static WIDTH= 4 as const;
// 	static HEIGHT = 4 as const;
// 	type: "corridor" | "room";
// 	group: DungeonSquare[];
// 	connections: DungeonSquare[] = [];
// 	specials: RoomSpecial[];

// 	constructor(generator: RandomDungeonGenerator, x: number, y:number, type: typeof this["type"]) {
// 		this.parent = generator;
// 		this.x= x;
// 		this.y = y;
// 		this.type = type;
// 		this.group = [this];
// 		this.connections = [];
// 		this.specials = [];
// 	}

// 	AdjacenciesToGroup() {
// 		const parent = this.parent;
// 		const group = this.group;
// 		const val = this.group.reduce( (acc, sq) => 
// 			acc + sq.getLegalAdjoiningPoints()
// 			.map (pt=> parent.sq(pt.x, pt.y))
// 			.filter(pt => pt != undefined &&
// 				!group.includes(pt))
// 			.length
// 		, 0 );
// 		return val;
// 	}

// 	isStartPoint(): boolean {
// 		return this.specials.includes("entrance");
// 	}

// 	isExitPoint() : boolean {
// 		return this.specials.includes("exit");
// 	}

// 	isTreasureRoom() : boolean {
// 		return this.specials.includes("treasure");
// 	}


// 	addToGroup(sq: DungeonSquare[]) {
// 		this.group.pushUnique(...sq);
// 	}


// 	makeStairsUp() {
// 		this.addSpecial("entrance");
// 	}

// 	makeStairsDown() {
// 		this.addSpecial("exit");
// 	}

// 	get up() {
// 		return {x: this.x, y: this.y-1 };
// 	}
// 	get down() {
// 		return {x: this.x, y: this.y+1 };
// 	}

// 	get right() {
// 		return {x: this.x+1, y: this.y };
// 	}

// 	get left(): Point {
// 		return {x: this.x-1, y: this.y };
// 	}

// 	static getAdjoiningPoints(pt: Point) : Point[] {
// 		return [
// 			left(pt),
// 			right(pt),
// 			up(pt),
// 			down(pt)
// 		];
// 	}

// 	private getAdjoiningPoints() : Point[] {
// 		// const p = function (x: number, y:number) { return {x, y};};
// 		return [
// 			this.left,
// 			this.right,
// 			this.up,
// 			this.down
// 		];
// 	}

// 	getLegalAdjoiningPoints() : Point[] {
// 		return this.getAdjoiningPoints()
// 		.filter(pt => this.parent.isInBounds(pt.x, pt.y));
// 	}

// 	isLegalToExpand(): boolean {
// 		const emptyAdjacent = this.getEmptyAdjoiningPoints();
// 		switch (this.type) {
// 			case "corridor" :
// 				return emptyAdjacent.length >= 2 &&
// 					this.AdjacenciesToGroup() <= 3;
// 			case "room":
// 				return this.isStartPoint();
// 		}
// 	}

// 	connectTo(other: DungeonSquare) {
// 		this.connections.push(other);
// 		other.connections.push(this);
// 	}

// 	isConnectedTo(other: DungeonSquare) {
// 		return this.connections.includes(other);
// 	}

// 	getAdjacentCorridors() : Point[] {
// 		const parent = this.parent;
// 		return this.getLegalAdjoiningPoints()
// 			.filter( p=> parent.sq(p.x, p.y)?.type == "corridor"
// 			);
// 	}

// 	getAdjacentRooms() : Point[] {
// 		const parent = this.parent;
// 		return this.getLegalAdjoiningPoints()
// 			.filter( p=> parent.sq(p.x, p.y)?.type == "room");
// 	}

// 	getEmptyAdjoiningPoints() : Point[] {
// 		const parent = this.parent;
// 		return this.getLegalAdjoiningPoints()
// 		.filter( p=> !parent.sq(p.x, p.y));
// 	}

// 	addSpecial (sp : RoomSpecial) {
// 		this.specials.pushUnique(sp);
// 	}

// 	print() : string {
// 		switch (this.type) {
// 			case "corridor":
// 			return "C";
// 			case "room":
// 				switch (true) {
// 					case this.isStartPoint(): return "S";
// 					case this.isExitPoint(): return "X";
// 					default: return "R";
// 				}
// 		}
// 	}
// }





//@ts-expect-error adding to glboal scope for test
window.DG = RandomDungeonGenerator;

type Direction = "up" | "down" | "left" |"right";


