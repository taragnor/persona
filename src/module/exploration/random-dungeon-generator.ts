import { CORRIDOR_FLAVORS, ROOM_FLAVORS } from "./random-flavor-text.js";
import {SeededRandom} from "../utility/seededRandom.js";
import {DungeonSquare, FinalizedDungeonSquare, Point} from "./dungeon-generator-square.js";

export class RandomDungeonGenerator {
	seedString: string;
	private squares: U<DungeonSquare>[][];
	squareList: DungeonSquare[];
  sceneModifierPossibilities : readonly GeneratorSceneModifier[] = [];
	rng: SeededRandom;
	squaresTaken: number;
	_depth: number;
	lenientMode: boolean;
	sceneModifiers : unknown[] = [];
  errorLog: (string | Error)[] = [];
  stepDebug: boolean = false;
  public finalizedSquareList: FinalizedDungeonSquare[];
  dimensions : {width: number, height: number};

	static SPECIAL_FLOORS = ["tough-enemy", "revealed", "treasure-shadow", "dark"] as const;

	static init() {}

	constructor(dimensions: {height: number, width:number}, depth: number = 1, sceneModifiers: GeneratorSceneModifier[]) {
		this.squaresTaken = 0;
    this.dimensions = dimensions;
		this.#resetSquares();
		this._depth = depth;
		this.lenientMode = false;
    this.sceneModifierPossibilities = sceneModifiers;
	}

	#resetSquares() {
		this.squares = this.#makeRows();
		this.squareList = [];
	}

	get currentDepth() : number {return this._depth;}

	print(description : boolean = false) : string {

    let ret = "";
    if (description) {
      ret += `Dungeon Lvl ${this.currentDepth} Seed: ${this.seedString}`;
    }
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

  printErrorLog() {
    for (const err of this.errorLog) {
      console.log(err);
    }
  }

	getAdjacentX(pt: Point, type : DungeonSquare["type"]) : Point[] {
		return DungeonSquare.getAdjoiningPoints(pt)
			.filter( p=> this.isInBounds(p.x, p.y)
				&& this.sq(p.x, p.y)?.type == type
			);
	}

	#makeRows() : U<DungeonSquare>[][] {
		let size = this.dimensions.width;
		const arr : U<DungeonSquare>[][] = [];
		while (size-- > 0) {
			arr.push(this.#makeColumn());
		}
		return arr;
	}

	#makeColumn() : U<DungeonSquare>[] {
		let size = this.dimensions.height;
		const arr : U<DungeonSquare>[] = [];
		while (size-- > 0) {
			arr.push(undefined);
		}
		return arr;
	}

	isInBounds(sqx: number, sqy: number): boolean {
		return sqx >= 0 && sqx < this.dimensions.width
			&& sqy >= 0 && sqy < this.dimensions.height;
	}

	randomEmptySquareCoords() : {x:number , y:number} {
		let randx : number;
		let randy : number;
		let safetyBreak = 0;
		do {
			randx = this.rng.die(1,this.dimensions.width)  -1;
			randy = this.rng.die(1, this.dimensions.height)-1 ;
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


  createDungeonCorridors(numOfSquares : number) : boolean {
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
        // console.log("Early break out of corridors");
        return false;
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
    return true;
  }

	createDungeonRooms(numOfSquares: number) : boolean {
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
				// console.log("Early break out of rooms");
				return false;
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
    return true;
	}

	/** returns number of squares used*/
	startCorridorAt(pt: Point, origin: DungeonSquare) : number {
		const firstSquare = this.constructSquareAt(pt, "corridor");
		firstSquare.connectTo(origin);
		const adjCorridors = firstSquare.getAdjacentCorridors();
		if (adjCorridors.length > 0) {
			const rndCorridor = this.rng.randomArraySelect(adjCorridors)!;
			const direction = RandomDungeonGenerator.getDirectionBetween(rndCorridor, firstSquare);
			return 1 + this.extendCorridor(firstSquare, direction);
		}
		const adjRooms = firstSquare.getAdjacentRooms();
		if (adjRooms.length > 0) {
			const rndRoom = this.rng.randomArraySelect(adjRooms)!;
			const direction = RandomDungeonGenerator.getDirectionBetween(rndRoom, firstSquare);
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
	static getDirectionBetween( a: Point, b: Point) : Direction {
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
		const corridorLen = this.rng.die(1,2);
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
		// console.log(`corridor Parts: ${corridorParts.map(x=> x.print()).join("")}`);
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
      const hidden = room.group.isHiddenRoom();
      const chance = hidden ? 100: 60;
      if (!this.percentChance(chance)) {continue;}
      const amount = hidden ? rng.die(2,3): rng.die(1,2);
      room.setTreasures(amount);
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
        fl.hiddenRoom == undefined ||
				(sq.isHiddenRoom() == fl.hiddenRoom)
			)
			.map( fl => ({weight: fl.weight ?? 1.0, item: fl}))
		);
		if (!effect) {return;}
		sq.addFlavorText(effect);
	}

	private createFlavorEffectInCorridor (sq: DungeonSquare) : void {
		const effect = this.rng.weightedChoice(
			CORRIDOR_FLAVORS
			.filter( fl => !fl.tellForHiddenDoor || sq.group.hasHiddenDoor() )
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
		const totalSquares = this.dimensions.width * this.dimensions.height;
		if (numSquares > totalSquares) {
			throw new InvalidDungeonError(`Too big, trying to request ${numSquares} with only ${totalSquares} available`);
		}
	}

  generate(numSquares: number, originalSeedString: string = "TEST") {
    this.init(numSquares, originalSeedString);
    for (let timeout = 0; timeout < 30; ++timeout) {
      try {
        this.createFloorplan(numSquares);
        this.assignExit();
        this.assignSpecialFloors();
        this.assignSpecials();
        this.assignTreasures();
        this.assignFlavorText();
        // this.finalizeSquares();
        console.log( this.print());
        return this;
      } catch (e) {
        if (e instanceof UnexpectedResultError) {
          this.errorLog.push(e);
        }
        if (this.stepDebug) {
          console.log(e);
          return;
        }
        this.seedString += this.rng.randomLetter();
      }
    }
    throw new InvalidDungeonError("Generation had too many errrors and had to bail out");
  }

  randomLetterTest() {
    if (!this.rng) {
      this.rng = new SeededRandom(this.seedString);
    }
    let str= "";
    for (let i = 0; i < 10; i++ ) {
      str+= this.rng.randomLetter();
    }
    console.log(str);
    return str;
  }

  private createFloorplan(numSquares: number) {
    this.lenientMode = false;
    this.rng = new SeededRandom(this.seedString);
    this.#resetSquares();
    this.placeStartingRoom();
    if (this.stepDebug) {
      this.print();
    }
    let emergencyBrake = 0;
    while (this.squareList.length < numSquares) {
      const corridors = this.rng.die(2,3)+1;
      const corridorMade= this.createDungeonCorridors(corridors );
      if (corridorMade && this.stepDebug) {
        this.print();
      }
      const rooms = this.rng.die(1,2);
      const roomMade = this.createDungeonRooms(rooms);
      if (roomMade && this.stepDebug) {
        this.print();
      }
      if (!corridorMade && !roomMade) {
        if (this.lenientMode == false) {
          this.lenientMode = true;
        } else {
          throw new GenerationBailOutError("Deadlocked, no rooms or corridor made");
        }
      }
      if (emergencyBrake > 200) {
        this.lenientMode = true;
      }
      if (emergencyBrake++ > 5000 && this.squareList.length < 20) {
        if (this.squareList.length < 20) {
          throw new GenerationBailOutError("Had To bail out on generation, too many retries");
        }
        console.error(`Dungeon Generatiuon troubles, only ${this.squareList.length} squares`);
      }
    }
  }

  assignSpecialFloors() {
    // const roll = this.rng.die(1,100);
    if (this.sceneModifierPossibilities.length == 0) {return;}
    const weighted = this.sceneModifierPossibilities.map(
      p=> ({ item: p, weight: p.probability}));
    const choice = this.rng.weightedChoice(weighted);
    if (choice && choice.item) {
      this.sceneModifiers.push(choice.item);
    }
  }

}

type Direction = "up" | "down" | "left" |"right";

class GenerationBailOutError extends Error {

}

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

export type CorridorFlavorText = FlavorText & {
	tellForHiddenDoor?: true;
}

export type RoomFlavorText = FlavorText & {
	// hiddenRoomOnly?: true,
  hiddenRoom?: boolean
}



export class GenerationError extends Error{

}


export type GeneratorSceneModifier<itemType = unknown> = {
  localName?: string;
  item: N<itemType>;
  probability: number;
};
