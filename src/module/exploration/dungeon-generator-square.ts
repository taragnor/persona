import {FlavorText, RandomDungeonGenerator} from "./random-dungeon-generator.js";
// import {EnchantedTreasureFormat, TreasureSystem} from "./treasure-system.js";

export class DungeonSquare {
	parent: RandomDungeonGenerator;
	x: number;
	y: number;
	static WIDTH = 5 as const;
	static HEIGHT = 5 as const;
	type: "corridor" | "room";
	group: DungeonSquare[];
	connections: DungeonSquare[] = [];
	specials: RoomSpecial[] = [];
	treasures: unknown[] = [];
	region: UN<RegionData>;
  flavorText: FlavorText[] = [];

	constructor(generator: RandomDungeonGenerator, x: number, y:number, type: typeof this["type"]) {
		this.parent = generator;
		this.x = x;
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

  equals(ds: DungeonSquare) {
    return this == ds;
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
    const definedName = this.flavorText
      .find( ft => ft.newName)?.newName;
    if (definedName) {return definedName;}
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
						return "Access Point (up)";
					}
					case this.isStairsDown(): {
						return "Access Point (down)";
					}
					case this.isTeleporter(): {
						return "Remote Access Terminal";
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

	}

	die (sides: number) {
		return Math.floor(Math.random() * sides) + 1;
	}

	public maxTreasures(): number {
		if (this.isCorridor()) {
			if (this.isDeadEnd()) {
				return this.die(3);
			}
			return this.die(2)-1;
		}
		if (this.isStartPoint() || this.isStairsDown()) {
			return 0;
		}
		return Math.floor(1 + this.die(4));
	}

	getDoorCoords(other: Point): WallData["c"][] {
		const wallCoords = this.getWallCoords(other);
		const doorCoords = DungeonSquare.splitLine(wallCoords, 3);
		return doorCoords;
	}

	static flipCoordsIfNecessary (c: WallData["c"]) : WallData["c"] {
		const [x1, y1, x2, y2] = c;
		if (x2 < x1 || y2 < y1) {
			return [x2, y2, x1, y1];
		}
		return c;
	}

	static splitLine([x1, y1, x2, y2] : WallData["c"], splits: number) : WallData["c"][] {
		const x_increment = (x2-x1) / splits;
		const y_increment = (y2-y1) / splits;
		const arr= [] as WallData["c"][];
		let x = x1, y = y1;
		for (let i =0 ; i <splits; i++) {
			const nx =  x + x_increment;
			const ny =y + y_increment;
			arr.push( [x, y, nx, ny]);
			x = nx; y =ny;
		}
		return arr;
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

	walls() {
		const walls = [] as ReturnType<DungeonSquare["generateWallData"]>[];
		const adj = this.getAdjoiningPoints();
		const outOfBounds = adj
			.filter( pt => this.parent.sq(pt.x, pt.y) == undefined);
		const possibles = adj
			.map( pt => this.parent.sq(pt.x, pt.y))
			.filter( sq=> sq != undefined);

		for (const OB of outOfBounds) {
			walls.push(...this.generateWall(OB));
		}
		for (const poss of possibles) {
			if (!this.connections.includes(poss)) {
				walls.push(...this.generateWall(poss));
				continue;
			}
			if (poss.type != this.type)  {
				const isSecret = poss.isHiddenRoom() || this.isHiddenRoom();
				walls.push(...this.generateDoor(poss, isSecret));
				continue;
			}
		}
		return walls;
	}

	generateDoor(other: Point, isSecret : boolean) {
		const [wall1, door, wall2] = this.getDoorCoords(other);
		return [
			this.generateWallData(wall1),
			this.generateWallData(door, isSecret ? "secret" : true),
			this.generateWallData(wall2),
		];
	}

	generateWall(other: Point) {
		const coords = this.getWallCoords(other);
		return [this.generateWallData(coords)];
	}


	generateWallData ( c : WallData["c"], isDoor : "secret" | boolean = false) {
		const texture = isDoor == true
			? "canvas/doors/small/Door_Metal_Gray_E1_1x1.webp"
			:   "canvas/doors/small/Door_Stone_Volcanic_B1_1x1.webp";
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

	public shadowPresence() : number {
		switch (true) {
			case this.isStartPoint():  return 0;
			case this.isDeadEnd(): {return 1;}
			case this.isStairsDown(): {return 4;}
			case this.isCorridor(): {
				const presence =  Math.max(1, Math.ceil(this.group.length / 2));
				return presence;
			}
			default: return 2;
		}
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

	isLegalToExpand(lenient: boolean): boolean {
		const emptyAdjacent = this.getEmptyAdjoiningPoints();
		const lenientBonus = lenient ? 1 : 0;
		switch (this.type) {
			case "corridor" :
				return emptyAdjacent.length >= 2 &&
					this.AdjacenciesToGroup() <= (lenientBonus + this.group.length <= 3 ? 3 : 4);
			case "room":
				if (this.isStartPoint()) {
					return this.AdjacenciesToGroup() <= lenientBonus + 0;
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
					case this.isTeleporter(): return "t";
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

  isEmptyRoom() : boolean {
    return this.isRoom()
      && this.specials.length == 0
      && !this.isStartPoint()
      && !this.isStairsDown()
      && !this.isTeleporter();
  }

	isHiddenRoom() : boolean {
		return this.specials.includes("hidden-room");
	}

	hasHiddenDoor() : boolean {
		return this.isHiddenRoom()
			|| (
				this.isCorridor()
				&& this.connections.some( c => c.isHiddenRoom())
			)
		;
	}

	assignSpecials() {
		if (this.isRoom()) {return this.assignRoomSpecials();}
		if (this.isCorridor()) {return this.assignCorridorSpecials();}
	}

	assignCorridorSpecials() {
		const die = this.die(100);
		switch (true) {
			case die > 90:
				break;
		}
	}

	assignRoomSpecials() {
		const die = this.die(100);
		switch (true) {
			case die > 90:
				this.specials.push("checkpoint");
				break;
			case die > 80 : {
				this.specials.push("hidden-room");
				break;
			}
		}
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
			const treasure = this.parent.treasureSystem.generate(this.difficultyLevel, modifier);
			// const treasure = TreasureSystem.generate(this.difficultyLevel, modifier);
			this.treasures.push(...treasure);
		}
	}

	addFlavorText(flavor: FlavorText)  {
    this.flavorText.push(flavor);
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


type RoomSpecial = "exit" | "entrance" | "checkpoint" | "persona-gather" | "hidden-room";


type RegionData = U<Pick<RegionDocument, "name" | "shapes">>;

export type WallData = Pick<Foundry.WallDocument, "door" | "c" | "ds" | "light" | "sound" | "move" | "sight" | "animation">;

