export class SeededRandom {
	#state : [number, number, number, number];
	constructor (seed: string) {
		this.#state = SeededRandom.hash(seed);
	}

	die(num : number, sides: number) : number {
		let total = 0;
		while (num-- > 0) {
			const rand = this.getRandom();
			const die = (rand % sides)  + 1;
			total += die;
		}
		return total;
	}

	random(): number {
		//TODO: emulate Math.random()
		// throw new Error("NOt yet implemented");
		// const MAX_INT = 2147483612; // based on tests this seemsto be the largest integer produced;
		// return Math.clamp(this.getRandom() / MAX_INT, 0, 1);
		return this.getRandom() % 1000000 / 1000000;
	}

	getRandom() : number {
		const state = this.#state;
		let t  = state[3];
		const s  = state[0];
		state[3] = state[2];
		state[2] = state[1];
		state[1] = s;

		t ^= t << 11;
		t ^= t >> 8;
		state[0] = t ^ s ^ (s >> 19);
		return state[0];
	}

	randomArraySelect<T>(arr: T[]) : T | undefined {
		if (arr.length ==0) {return undefined;}
		const random = this.getRandom();
		const randomChoice = random % arr.length;
		return arr[randomChoice];
	}

	randomLetter() : string {
		const str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
		const index = this.random() % str.length;
		return str.at(index)!;
	}

	weightedChoice<T>( array: WeightedChoiceItem<T>[]): U<T> {
	array = array.filter( x=>x.weight > 0);
	if (array.length == 0) {return undefined;}
	if (array.some(x=> typeof x.weight != "number")) {
		array.forEach( x=> x.weight = Number(x.weight));
	}
	const weightSum = array.reduce(
		(acc, {weight}) => acc + (weight ?? 1)
		, 0);
	let random = this.random() * weightSum;
	for (const {item, weight} of array) {
		random -= weight ?? 1;
		if (random <=0) {
			return item;
		}
	}
	console.log("Might be error, returning last element in array");
	return array[array.length-1].item;

	}

	private static hash(str: string) : [number, number, number, number] {
		let h1 = 1779033703, h2 = 3144134277,
		h3 = 1013904242, h4 = 2773480762;
		for (let i = 0, k; i < str.length; i++) {
			k = str.charCodeAt(i);
			h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
			h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
			h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
			h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
		}
		h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
		h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
		h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
		h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		h1 ^= (h2 ^ h3 ^ h4), h2 ^= h1, h3 ^= h1, h4 ^= h1;
		return [h1>>>0, h2>>>0, h3>>>0, h4>>>0];
	}


}

type WeightedChoiceItem<T>= {
	item: T,
	weight: number
}

