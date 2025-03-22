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

	constructor() {
		this.reset();
	}

	reset() {
		this.inner= new Orbit(INNER_SIZE, 1);
		this.middle= new Orbit(MIDDLE_SIZE, -2);
		this.outer= new Orbit(OUTER_SIZE, 4);
		this.periphery= new Orbit(PERIPHERY_SIZE, -4);
		this.untethered = [];
		this.inner.createPlanet("start", 0);
		this.inner.createPlanet("Inner A", 1);
		this.inner.createPlanet("Inner B", 2);
		this.inner.createPlanet("Inner C", 3);
		this.middle.createPlanet("middle A", 0);
		this.middle.createPlanet("middle B", 2);
		this.middle.createPlanet("middle C", 4);
		this.middle.createPlanet("middle D", 6);
		// this.middle.createPlanet("middle E", 8);
		// this.middle.createPlanet("middle F", 11);
		this.outer.createPlanet("outer A", 0);
		// this.outer.createPlanet("outer B", 3 );
		this.outer.createPlanet("outer C", 6 );
		this.outer.createPlanet("outer D", 9 );
		this.outer.createPlanet("outer E", 12 );
		// this.outer.createPlanet("outer F", 15 );
		const PA= this.periphery.createPlanet("Periphery A", 0 );
		this.periphery.createPlanet("Periphery B", 20 );
		const asteroidM = { name: "Asteroid M", hardLinks: [PA]};
		PA.hardLinks.push(asteroidM);
		this.untethered.push(asteroidM);
	}

	orbit(amt= 1) {
		while (amt-- > 0) {
			this.inner.orbit();
			this.middle.orbit();
			this.outer.orbit();
			this.periphery.orbit();
		}
	}

	reachabilityTest(tests = 60) {
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

	visitTest() {
		const planets = this.allPlanets();
		const start = this.getPlanetByName("start")!;
		const asteroidM = this.getPlanetByName("Asteroid M")!;
		if (!start || !asteroidM) throw new Error("Couldn't initialize");
		const map = new Map<Planet, number>(planets.map(x=> [x, 0] ));
			for (let orbit = 0; orbit < 60; orbit++) {
				const path = this.getPathTo(start, asteroidM);
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
			if (orbit == this.inner) {
				paths.push(...this.inner.adjacent(index));
			}

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
				const low= myblock * innerBlockSize;
				return {low, high: low + innerBlockSize};
				default:
				throw new Error(`Unknown size: ${this.planets.length}`);
		}
	}

	outerPathRanges(index: number): LocationRange | undefined {
		switch (this.planets.length) {
			case PERIPHERY_SIZE:
				return undefined;
			case INNER_SIZE:
			case OUTER_SIZE:
			case MIDDLE_SIZE:
				const myblock = Math.floor(index / this.blockSize);
				const outerBlockSize = Math.floor(this.blockSize * GROWTH_FACTOR);
				const low= myblock * outerBlockSize;
				return {low, high: low + outerBlockSize}
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
