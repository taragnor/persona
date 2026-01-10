import {PersonaRegion} from "../region/persona-region.js";
import {RandomDungeonGenerator} from "./random-dungeon-generator.js";
import {EnchantedTreasureFormat, TreasureSystem} from "./treasure-system.js";

export class DungeonSquare {
	parent: RandomDungeonGenerator;
	x: number;
	y: number;
	static WIDTH= 5 as const;
	static HEIGHT = 5 as const;
	type: "corridor" | "room";
	group: DungeonSquare[];
	connections: DungeonSquare[] = [];
	specials: RoomSpecial[];
	treasures: EnchantedTreasureFormat[] = [];
	region: UN<RegionData>;
	regionData: PersonaRegion["regionData"];

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

	isStairsDown() : boolean {
		return this.specials.includes("exit");
	}

	isTeleporter(): boolean {
		return this.specials.includes("checkpoint");

	}

	isStairs(): boolean {
		return this.isStartPoint() || this.isStairsDown();
	}

	hasTreasure() : boolean {
		return this.treasures.length > 0;
	}


	generateRegionName() : string {
		switch (this.type) {
			case "corridor":
				if (this.isDeadEnd()) {
					return "Dead End";
				}
				if (this.group.length == 1) {
					return "Short Corridor";
				}
				if (this.group.length >= 4) {
					return "Long Corridor";
				}
				return "Corridor";
			case "room":
				switch (true) {
					case this.isStartPoint(): {
						return "Stairs Up";
					}
					case this.isStairsDown(): {
						return "Stairs Down";
					}
					default:
						return "Miscellaneous Room";
				}
		}
	}

	realCoordinates() : Point {
		const parent = this.parent;
		const x = parent.gridX + (parent.gridSize * this.x * DungeonSquare.WIDTH);
		const y = parent.gridY + (parent.gridSize * this.y * DungeonSquare.HEIGHT);
		return {x, y};
	}

	treasurePosition(): Point {
		let {x,y} = this.realCoordinates();
		const GS = this.parent.gridSize;
		x += Math.floor(DungeonSquare.HEIGHT /2) * GS;
		y += Math.floor(DungeonSquare.WIDTH /2) * GS;
		return {x,y};
	}

	rect() : RegionDocument["shapes"][number] {
		const {x,y} = this.realCoordinates();
		const width = DungeonSquare.WIDTH;
		const height = width;
		return {
			type :"rectangle",
			x, y,
			width: this.parent.gridSize * width,
			height: this.parent.gridSize * height,
			hole: false,
			rotation: 0,
		};
	}

	finalize() {
		this.makeRegionData();
	}

	makeRegionData() : RegionData {
		if (this.region === null) {return;}
		const name = this.generateRegionName();
		const shapes = this.group.map( x=> x.rect());
		const regionConstructionInfo : RegionData = {
			name,
			shapes,
		};
		this.group.forEach( member => member.region = null);
		this.region = regionConstructionInfo;
		this.prepPersonaRegionData();

	}

	maxTreasures(): number {
		if (this.isCorridor()) {
			if (this.isDeadEnd()) {
				return 2;
			}
			return 1;
		}
		if (this.isStartPoint() || this.isStairsDown()) {
			return 0;
		}
		return Math.floor(2 + Math.random() * 4);
	}

	getWallCoords(other: Point): WallData["c"] {
		const parent = this.parent;
		const GS = parent.gridSize * DungeonSquare.HEIGHT;
		let {x, y} = this.realCoordinates();
		const direction = parent.getDirectionBetween(this, other);
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

	walls() : Partial<WallData>[] {
		const walls = [];
		const adj = this.getAdjoiningPoints();
		const outOfBounds = adj
		.filter( pt => this.parent.sq(pt.x, pt.y) == undefined);
		const possibles = adj
		.map( pt => this.parent.sq(pt.x, pt.y))
		.filter( sq=> sq != undefined);

		for (const OB of outOfBounds) {
			const coords = this.getWallCoords(OB);
			walls.push(this.generateWallData(coords));
		}
		for (const poss of possibles) {
			if (!this.connections.includes(poss)) {
				const coords = this.getWallCoords(poss);
				walls.push(this.generateWallData(coords));
				continue;
			}
			if (poss.type != this.type)  {
				const coords = this.getWallCoords(poss);
				//this is a door
				walls.push(this.generateWallData(coords, true));
				continue;
			}
		}
		return walls;
	}

	generateWallData ( c : WallData["c"], isDoor = false) : Partial<WallData> {
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
			door: isDoor ? 0: 1,
			ds: isDoor ? 0 : 2, //0 is closed, 1 open, 2 locked
			light: 20,
			move: 20,
			sight: 20,
			sound: 20,
			animation,
		};
		return wallData;
	}



	private shadowPresence() : number {
		switch (true) {
			case this.isStartPoint():  return 0;
			case this.isDeadEnd(): {return 1;}
			case this.isStairsDown(): {return 4;}
			case this.isCorridor(): {
				const presence =  Math.max(1, Math.ceil(this.group.length / 2));

				console.log(`Corridor Presence : ${presence}`);
				return presence;
			}
			default: return 2;
		}
	}

	private region_pointsOfInterest() : string []{
		const ret = [];
		switch (true) {
			case this.isStartPoint():
				if (this.parent.currentDepth == 0) {
					ret.push("Exit: An exit leads back to Wonderland");
				} else {
					ret.push("Ascend Point: You can ascend towards the higher level here.");
				}
				break;
			case this.isStairsDown():
				ret.push("Descend Point: You can descend even deeper into this strange realm.");
				break;
			case this.isTeleporter(): 
				ret.push("Teleporter: You can use this to return back to the entrance of Wonderland");
				break;
		}
		return ret;
	}

	private region_specialMods() : DungeonSquare["regionData"]["specialMods"] {
		if (this.isTeleporter()) {
			return ["safe" ,"compendium-access"];
		}
		if (this.isStartPoint()) {
			return ["safe"];
		}
		return [];
	}

private region_secret() : {status: DungeonSquare["regionData"]["secret"], details: string} {
	let status : DungeonSquare["regionData"]["secret"];
	const details = "";

	switch (true) {

		default:
			status= "none";
	}
	return {status, details};
}

private region_hazard() : {status: DungeonSquare["regionData"]["hazard"], details: string} {
	let status : DungeonSquare["regionData"]["secret"];
	const details = "";
	switch (true) {
		default:
			status= "none";
	}
	return {status, details};
}

	private prepPersonaRegionData() {
		const secret = this.region_secret();
		const hazard = this.region_hazard();
		const regionData: DungeonSquare["regionData"]  = {
			ignore: false,
			secret: secret.status,
			hazard: hazard.status,
			secretDetails: secret.details,
			hazardDetails: hazard.details,
			treasures: {
				found: 0,
				max: this.maxTreasures(),
			},
			roomEffects: [],
			pointsOfInterest: this.region_pointsOfInterest(),
			specialMods: this.region_specialMods(),
			shadowPresence: this.shadowPresence(),
			secretNotes: "",
			challengeLevel: 0
		};
		this.regionData = regionData;
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
			if (this.isStartPoint()) {
				return this.AdjacenciesToGroup() <= 0;
			}
			return false;
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
				if (this.hasTreasure()) {
					return "T";
				}
				if (this.isDeadEnd()) {
					return "D";
				}
			return "C";
			case "room":
				switch (true) {
					case this.isStartPoint(): return "S";
					case this.isStairsDown(): return "X";
					case this.hasTreasure(): return String(this.treasures.length);
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


type RoomSpecial = "exit" | "entrance" | "checkpoint" | "persona-gather";


type RegionData = U<Pick<RegionDocument, "name" | "shapes">>;

export type WallData = Pick<Foundry.WallDocument, "door" | "c" | "ds" | "light" | "sound" | "move" | "sight" | "animation">;

