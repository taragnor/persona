import {FlavorText, RandomDungeonGenerator} from "./random-dungeon-generator.js";
// import {EnchantedTreasureFormat, TreasureSystem} from "./treasure-system.js";

export class DungeonSquare {
	parent: RandomDungeonGenerator;
	x: number;
	y: number;
	static WIDTH = 5 as const;
	static HEIGHT = 5 as const;
	type: "corridor" | "room";
	group: SquareGroup;
	connections: DungeonSquare[] = [];
	specials: RoomSpecial[] = [];
  canBeRegion = true;
  flavorText: FlavorText[] = [];
  numOfTreasures: number = 0;

	constructor(generator: RandomDungeonGenerator, x: number, y:number, type: typeof this["type"]) {
		this.parent = generator;
		this.x = x;
		this.y = y;
		this.type = type;
		this.group = new SquareGroup(this);
		this.connections = [];
		this.specials = [];
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
		return this.numOfTreasures > 0;
	}

	generateRegionName() : string {
    const definedName = this.flavorText
      .find( ft => ft.newName)?.newName;
    if (definedName) {return `${definedName}${this.isHiddenRoom() ? " (Hidden)": ""}`;}
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
						return "Remote Access Terminal (Teleporter)";
					}
          case this.isHiddenRoom(): {
            return "Secret Area";
          }
					default:
						return "Miscellaneous Room";
				}
		}
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

	getAdjoiningPoints() : Point[] {
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
					this.group.getNumberOfLegalAdjoiningPoints() <= (lenientBonus + this.group.length <= 3 ? 3 : 4);
			case "room":
				if (this.isStartPoint()) {
					return this.group.getNumberOfLegalAdjoiningPoints() <= lenientBonus + 0;
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
					case this.hasTreasure(): return String(this.numOfTreasures);
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
    return this.isCorridor()
      && this.connections
      .filter( x=> !x.isHiddenRoom())
      .length <= 1;
    // && this.getEmptyAdjoiningPoints().length == 3;
  }

  isEmptyRoom() : boolean {
    return this.isRoom()
      // && this.specials.length == 0
      && !this.isStartPoint()
      && !this.isStairsDown()
      && !this.isTeleporter()
      && this.flavorText.length == 0;

  }

	isHiddenRoom() : boolean {
		return this.specials.includes("hidden-room");
	}

	hasHiddenDoor() : boolean {
		return this.isHiddenRoom()
			|| (
				this.isCorridor()
				&& this.connections.some( c => c.group.isHiddenRoom())
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
        if (!this.parent.squareList.some( sq => sq.isTeleporter()) ) {
          this.specials.push("checkpoint");
          console.log("teleporter created");
          break;
        }
      // eslint-disable-next-line no-fallthrough
      case die > 75 : {
        this.specials.push("hidden-room");
        console.log("Hidden room created");
        break;
      }
    }
  }

  setTreasures(amt: number) {
    this.numOfTreasures = amt;
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


export type FinalizedDungeonSquare = DungeonSquare & {
  region: RegionData;
}


class SquareGroup extends Array<DungeonSquare> {
  getNumberOfLegalAdjoiningPoints() {
    const val = this.reduce( (acc, sq) =>
      acc + sq.getLegalAdjoiningPoints()
      .map (pt=> sq.parent.sq(pt.x, pt.y))
      .filter(pt => pt != undefined &&
        !this.includes(pt))
      .length
      , 0 );
    return val;
  }

  get connections() : DungeonSquare[] {
    return this.reduce( (acc, sq) => {
      const nonGroupConnections= sq.connections
        .filter( c => !this.includes(c));
      acc.push(...nonGroupConnections);
      return acc;
    }, [] as DungeonSquare[]);
  }

  hasHiddenDoor() : boolean {
    return this.some(sq => sq.hasHiddenDoor());

  }

  isHiddenRoom() : boolean {
    return this.some(sq => sq.isHiddenRoom());
  }

}
