import {RandomDungeonGenerator} from "./random-dungeon-generator.js";
import {EnchantedTreasureFormat, TreasureSystem} from "./treasure-system.js";

export class DungeonSquare {
	parent: RandomDungeonGenerator;
	x: number;
	y: number;
	static WIDTH= 4 as const;
	static HEIGHT = 4 as const;
	type: "corridor" | "room";
	group: DungeonSquare[];
	connections: DungeonSquare[] = [];
	specials: RoomSpecial[];
	treasures: EnchantedTreasureFormat[] = [];

	constructor(generator: RandomDungeonGenerator, x: number, y:number, type: typeof this["type"]) {
		this.parent = generator;
		this.x= x;
		this.y = y;
		this.type = type;
		this.group = [this];
		this.connections = [];
		this.specials = [];
		this.treasures = [];
	}

	AdjacenciesToGroup() {
		const parent = this.parent;
		const group = this.group;
		const val = this.group.reduce( (acc, sq) =>
			acc + sq.getLegalAdjoiningPoints()
			.map (pt=> parent.sq(pt.x, pt.y))
			.filter(pt => pt != undefined &&
				!group.includes(pt))
			.length
		, 0 );
		return val;
	}

	get difficultyLevel() : number {
		return this.parent.difficultyLevel;
	}

	isStartPoint(): boolean {
		return this.specials.includes("entrance");
	}

	isExitPoint() : boolean {
		return this.specials.includes("exit");
	}

	isTreasureRoom() : boolean {
		return this.treasures.length == 0;
	}


	addToGroup(sq: DungeonSquare[]) {
		this.group.pushUnique(...sq);
	}


	makeStairsUp() {
		this.addSpecial("entrance");
	}

	makeStairsDown() {
		this.addSpecial("exit");
	}

	get up() {
		return {x: this.x, y: this.y-1 };
	}
	get down() {
		return {x: this.x, y: this.y+1 };
	}

	get right() {
		return {x: this.x+1, y: this.y };
	}

	get left(): Point {
		return {x: this.x-1, y: this.y };
	}

	static getAdjoiningPoints(pt: Point) : Point[] {
		return [
			left(pt),
			right(pt),
			up(pt),
			down(pt)
		];
	}

	private getAdjoiningPoints() : Point[] {
		// const p = function (x: number, y:number) { return {x, y};};
		return [
			this.left,
			this.right,
			this.up,
			this.down
		];
	}

	getLegalAdjoiningPoints() : Point[] {
		return this.getAdjoiningPoints()
		.filter(pt => this.parent.isInBounds(pt.x, pt.y));
	}

	isLegalToExpand(): boolean {
		const emptyAdjacent = this.getEmptyAdjoiningPoints();
		switch (this.type) {
			case "corridor" :
				return emptyAdjacent.length >= 2 &&
					this.AdjacenciesToGroup() <= 3;
			case "room":
				return this.isStartPoint();
		}
	}

	connectTo(other: DungeonSquare) {
		this.connections.push(other);
		other.connections.push(this);
	}

	isConnectedTo(other: DungeonSquare) {
		return this.connections.includes(other);
	}

	getAdjacentCorridors() : Point[] {
		const parent = this.parent;
		return this.getLegalAdjoiningPoints()
			.filter( p=> parent.sq(p.x, p.y)?.type == "corridor"
			);
	}

	getAdjacentRooms() : Point[] {
		const parent = this.parent;
		return this.getLegalAdjoiningPoints()
			.filter( p=> parent.sq(p.x, p.y)?.type == "room");
	}

	getEmptyAdjoiningPoints() : Point[] {
		const parent = this.parent;
		return this.getLegalAdjoiningPoints()
		.filter( p=> !parent.sq(p.x, p.y));
	}

	addSpecial (sp : RoomSpecial) {
		this.specials.pushUnique(sp);
	}

	print() : string {
		switch (this.type) {
			case "corridor":
			return "C";
			case "room":
				switch (true) {
					case this.isStartPoint(): return "S";
					case this.isExitPoint(): return "X";
					case this.isTreasureRoom(): return "T";
					default: return "R";
				}
		}
	}

	isRoom() : boolean {
		return this.type == "room";
	}

	isCorridor() : boolean {
		return this.type == "corridor";
	}

	isDeadEnd() : boolean {
		return this.type == "corridor"
		&& this.getEmptyAdjoiningPoints().length == 3;
	}

	addTreasure(amt: number) {
		let modifier: number;
		switch (true) {
			case this.isDeadEnd():
				modifier = -25;
				break;
			case this.isRoom():
				modifier = 1;
				break;
			default:
				modifier = -50;
		}
		while (amt -- > 0) {
			const treasure = TreasureSystem.generate(this.difficultyLevel, modifier);
			this.treasures.push(...treasure);
		}
	}
}

function up(pt: Point): Point {
	return {x: pt.x, y: pt.y-1 };
}
function down(pt: Point) :Point{
	return {x: pt.x, y: pt.y+1 };
}

	function right(pt: Point) :Point{
		return {x: pt.x+1, y: pt.y };
	}

	function left(pt: Point): Point {
		return {x: pt.x-1, y: pt.y };
	}


export type Point = {x: number, y:number};


type RoomSpecial = "exit" | "entrance";

