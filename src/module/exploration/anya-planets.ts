import { PersonaCalendar } from "../social/persona-calendar.js";

const GROWTH_FACTOR = 2;
const INNER_SIZE = 4;
const MIDDLE_SIZE = INNER_SIZE * GROWTH_FACTOR;
const OUTER_SIZE = MIDDLE_SIZE * GROWTH_FACTOR;
const PERIPHERY_SIZE = OUTER_SIZE * GROWTH_FACTOR;

export class AnyaPlanets {
	inner: Orbit ;
	middle: Orbit;
	outer: Orbit ;
	periphery: Orbit;
	untethered : Planet[];
	start: Planet;

	constructor() {
		this.reset();
	}

	reset() {
		this.inner= new Orbit(INNER_SIZE, 0);
		this.middle= new Orbit(MIDDLE_SIZE, -1);
		this.outer= new Orbit(OUTER_SIZE, -2);
		this.periphery= new Orbit(PERIPHERY_SIZE, 4);
		this.untethered = [];
		this.start = this.inner.createPlanet("start", 0);
		this.inner.createPlanet("Battleground Neko", 1);
		const industrial = this.inner.createPlanet("Burning Industrial Asteroid", 2 );
		this.inner.createPlanet("BattleGround Nezumi", 3);
		this.middle.createPlanet("Crimson Glow Asteroid Field(Sini)", 0);
		this.middle.createPlanet("Desolate Asteroid (marines)", 2);
		this.middle.createPlanet("Alestone Asteroid Field(Sini-R)", 4);
		this.middle.createPlanet("Infernal Asteroid (demons)", 6);
		this.outer.createPlanet("Fantastic Biodome (DW basic)", 1);
		this.outer.createPlanet("Odd Biodome (DW Rev)", 2 );

		this.outer.createPlanet("Satellite A", 5 );
		this.outer.createPlanet("Anarchy City", 6 );
		const gundam = this.outer.createPlanet("Orbital Military Installation", 9 );
		this.outer.createPlanet("Satellite B", 10 );
		this.outer.createPlanet("City of the Iron Fist", 13 );
		this.outer.createPlanet("Satellite C", 14 );
		// this.outer.createPlanet("outer F", 15 );
		const PB = this.periphery.createPlanet("Satellite Control Station", 2 );
		const PA = this.periphery.createPlanet("GateWay To M", 20 );
		const asteroidM = { name: "Asteroid M", hardLinks: [PA]};
		const Fleetwood = { name: "Fleetwood School for the Badass (shadow Anya)", hardLinks: [asteroidM]};
		const paintedWorld = {name: "Digitized World 41234", hardLinks: [industrial]}
		industrial.hardLinks.push(paintedWorld);
		asteroidM.hardLinks.push(Fleetwood);
		PA.hardLinks.push(asteroidM);
		this.untethered.push(asteroidM);
		this.untethered.push(paintedWorld);
		this.untethered.push(Fleetwood);
	}

	orbit(amt= 1) {
		if (typeof amt != "number" || Number.isNaN(amt)) {
			throw new Error("Passed amount for Orbit is not valid number");
		}
		while (amt-- > 0) {
			this.inner.orbit();
			this.middle.orbit();
			this.outer.orbit();
			this.periphery.orbit();
		}
	}

	printOrbits() : void {
		this.viewOrbitOnDay();
	}

	viewOrbitOnDay(days?: number) : void {
		if (days == undefined) {
			days = PersonaCalendar.DoomsdayClock.amt;
			console.log(`Orbits for day ${days}`);
		}
		this.reset();
		this.orbit(days)
		this.inner.print();
		this.middle.print();
		this.outer.print();
		this.periphery.print();

	}


	reachabilityTest(tests = 60) {
		this.reset();
		let orbits = 0;
		const start = this.getPlanetByName("start");
		while (orbits <= tests) {
			if (!start) throw new Error("No start planet");
			for (const planet of this.allPlanets()) {
				const path = this.getPathTo(start, planet);
				if (!path) {
					console.log(`Fail on Orbit ${orbits}. No path from ${start.name} to ${planet.name}`);
					return false;
				}
			}
			this.orbit();
			orbits++;
		}
		return true;
	}

	visitTest1 () {
		const start = this.getPlanetByName("start")!;
		const asteroidM = this.getPlanetByName("Asteroid M")!;
		return this.#visitTest(start, asteroidM);
	}

	visitTest2 () {
		const start = this.getPlanetByName("start")!;
		const PeripheryB = this.getPlanetByName("Satellite Control Station")!;
		return this.#visitTest(start, PeripheryB);
	}


	#visitTest(start: Planet, destination: Planet) {
		const planets = this.allPlanets();
		if (!start || !destination) throw new Error("Couldn't initialize");
		const map = new Map<Planet, number>(planets.map(x=> [x, 0] ));
			for (let orbit = 0; orbit < 60; orbit++) {
				const path = this.getPathTo(start, destination);
				for (const planet of planets) {
					if (path && path.includes(planet)) {
						const count = map.get(planet) ?? 0;
						map.set(planet, count +1);
					}
				}
				this.orbit();
			}
		for (const [planet,count] of map.entries()) {
			console.log(`${planet.name}: ${count}`);
		}
		this.reset();
	}

	allPlanets() : Planet [] {
		const arr = [this.inner,
			this.middle,
			this.outer,
			this.periphery,
		].flatMap( x=> x.planets.filter(x=> x))
		return arr.concat(this.untethered) as Planet[];
	}

	getPlanetByName( planetName:string) : Planet | undefined {
		return this.allPlanets().find(x=> x.name == planetName);
	}

	findPlanet (planetName: string | Planet) : [Orbit | undefined, number] {
		if (typeof planetName != "string") {
			planetName = planetName.name;
		}
		for (const orbit of [this.inner, this.middle, this.outer, this.periphery]) {
			const index = orbit.findPlanetIndex(planetName);
			if (index >= 0) {
				return [orbit, index]
			}
		}
		const index =  this.untethered.findIndex(x=> x.name == planetName);
		if (index >= 0)
		{
			return [undefined, index];
		}
		throw new Error(`Planet ${planetName} doesn't exist`);
	}

	getOuterOrbit (orbit: Orbit | undefined) : Orbit | undefined{
		switch (true) {
			case orbit == this.inner:
				return this.middle;
			case orbit == this.middle:
				return this.outer;
			case orbit == this.outer:
				return this.periphery;
			case orbit == this.periphery:
				return undefined;
		}
	}

	getInnerOrbit (orbit: Orbit | undefined) : Orbit | undefined{
		switch (true) {
			case orbit == this.inner:
				return undefined;
			case orbit == this.middle:
				return this.inner;
			case orbit == this.outer:
				return this.middle;
			case orbit == this.periphery:
				return this.outer;
		}
	}


	getPaths(start: Planet) : Planet[] {
		const paths = start.hardLinks.slice();
		let [orbit, index] = this.findPlanet(start.name);
		if (orbit) {
			paths.push(...orbit.adjacent(index));
			const outer = this.getOuterOrbit(orbit);
			const inner = this.getInnerOrbit(orbit);
			const [innerR, outerR] = orbit?.getRanges(index);
			// console.log( `${start.name}: Inner ${innerR?.low}-${innerR?.high}, Outer: ${outerR?.low} - ${outerR?.high} `);
			paths.push(
				...(inner?.planetsInRange(innerR!) ?? []),
				...(outer?.planetsInRange(outerR!) ?? [])
			)
		}
		return paths;
	}

	pathsTest() {
		for (const planet of this.allPlanets()) {
			const paths = this.getPaths(planet!).map( x=> x.name).join(",");
			const [orbit, index] = this.findPlanet(planet);
			console.log( `${planet?.name} (${index}) : ${paths}`);
		}

	}

	getPathTo(start: Planet | string, end: Planet | string) : Planet[] | null {
		if (typeof start == "string") {
			start = this.getPlanetByName(start)!;
		}
		if (typeof end == "string") {
			end = this.getPlanetByName(end)!;
		}
		return breadthFirstSearch(start, end, this.getPaths.bind(this));
	}

	getOrbit(planetName: string) : Orbit | undefined {
		return this.findPlanet(planetName)![0];
	}

}

export class Orbit {
	planets: SpaceLocation[];
	orbitMove: number;
	blockSize: number;

	constructor(size: number, orbitMove: number) {
		this.planets =new Array(size);
		this.orbitMove = orbitMove;
		this.blockSize = Math.floor(size / 4);
	}

	getRanges(index: number): [LocationRange | undefined, LocationRange | undefined] {
		return [this.innerPathRanges(index), this.outerPathRanges(index)];
	}

	findPlanetIndex(planetName: string) : number {
		return this.planets.findIndex( p=> p && p.name == planetName);
	}

	innerPathRanges(index : number): LocationRange | undefined {
		switch (this.planets.length) {
			case INNER_SIZE:
				return undefined;
			case PERIPHERY_SIZE:
			case OUTER_SIZE:
			case MIDDLE_SIZE:
				const myblock = Math.floor(index / this.blockSize);
				const innerBlockSize = Math.floor(this.blockSize / GROWTH_FACTOR);
				// const low= myblock * innerBlockSize;
				const low= Math.floor(index / GROWTH_FACTOR);
				return {low, high: low + GROWTH_FACTOR};
				default:
				throw new Error(`Unknown size: ${this.planets.length}`);
		}
	}

	print() : void {
		const planetStr = this.planets
		.map( (pl, i) => pl ?`${pl.name} (${i})`: "")
		.filter (x=> x.length > 0);
		const str = planetStr.join("\n");
		console.log(str);
	}

	outerPathRanges(index: number): LocationRange | undefined {
		switch (this.planets.length) {
			case PERIPHERY_SIZE:
				return undefined;
			case INNER_SIZE:
			case OUTER_SIZE:
			case MIDDLE_SIZE:
				const outerBlockSize = Math.floor(this.blockSize * GROWTH_FACTOR);
				const low = index * GROWTH_FACTOR;
				return {low, high: low + GROWTH_FACTOR}
		}
	}

	planetsInRange({low, high} : LocationRange) : Planet[] {
		return this.planets.filter ( (planet, index) => {
			if (planet == undefined) return false;
			return index >= low && index < high;
		}) as Planet[];

	}

	createPlanet( planetName: string, location: number): Planet;
	createPlanet( p: Planet, location: number): Planet;
	createPlanet( planet: Planet | string, location: number):Planet {
		if (typeof planet == "string") {
			planet = {
				name: planet,
				hardLinks: [],
			};
		}
		if (location >= this.planets.length) throw new Error(`Invalid location ${location} foir size {$this.planets.length}`);
		if (this.planets[location]) {
			throw new Error(`Location ${location} already contains ${this.planets[location].name}`);
		}
		this.planets[location] = planet;
		return planet;
	}

	orbit() {
		const length = this.planets.length;
		const next = new Array<SpaceLocation>(length);
		this.planets.forEach( (planet, index) => {
			const newIndex = (length + index + this.orbitMove) % length;
			next[newIndex] = planet;
		});
		// console.log(next);
		this.planets= next;
		return next;
	}

	adjacent(index: number) :Planet[] {
		const size = this.planets.length;
		const left = (size + index -1) % size;
		const right = (size + index +1) % size;
		return [this.planets.at(left),
			this.planets.at(right)]
			.filter(x=>x) as Planet[];
	}

}

type SpaceLocation = Planet | undefined;

type LocationRange = {low: number, high:number};

type Planet = {
	name: string;
	hardLinks: Planet[];
}

function breadthFirstSearch<T>(
  start: T,
  target: T,
  getNodes: (node: T) => T[]
): T[] | null {
  const queue: T[][] = [[start]];
  const visited: Set<T> = new Set();
  visited.add(start);
  while (queue.length > 0) {
    const path = queue.shift()!; // Remove the first path
    const node = path[path.length - 1];
    if (node === target) {
      return path; // Return the shortest path found
    }
    for (const neighbor of getNodes(node)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return null; // Return null if no path is found
}
