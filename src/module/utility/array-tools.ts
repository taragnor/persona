export function shuffle<T>(array: T[]) : Array<T> {
  let currentIndex = array.length;
  while (currentIndex != 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
	return array;
};

export function weightedChoice<T>( array: WeightedChoiceItem<T>[]) : T | undefined {
	array = array.filter( x=>x.weight > 0);
	if (array.length == 0) {return undefined;}
	if (array.some(x=> typeof x.weight != "number")) {
		array.forEach( x=> x.weight = Number(x.weight));
	}
	const weightSum = array.reduce(
		(acc, {weight}) => acc + (weight ?? 1)
		, 0);
	let random = Math.random() * weightSum;
	for (const {item, weight} of array) {
		random -= weight ?? 1;
		if (random <=0) {
			return item;
		}
	}
	console.log("Might be error, returning last element in array");
	return array[array.length-1].item;
}

export function randomSelect<T>(arr: T[]) : T {
	return arr[Math.floor(Math.random() * arr.length)];
}

export function removeDuplicates<T>(arr: T[]) : T[] {
	return [...new Set(arr)];
}

type WeightedChoiceItem<T>= {
	item: T,
	weight: number
}

//PURE TESTING FUNCTION no real usage
// function test_weightedChoice() {
// 	const items : WeightedChoiceItem<"A" | "B" | "C">[] = [
// 		{
// 			item: "A", weight: 2
// 		},
// 		{
// 			item: "B", weight: 1
// 		},
// 		{
// 			item: "C", weight: 0.2
// 		}
// 	];
// 	const x = {
// 		A: 0,
// 		B: 0,
// 		C: 0
// 	};
// 	const times = 100000;
// 	for (let i = 0; i< times; i++) {
// 		shuffle(items);
// 		const result = weightedChoice(items);
// 		if (result == undefined) {continue;}
// 		x[result] += 1;
// 	}
// 	for (const [k,v] of Object.entries(x)) {
// 		x[k as keyof typeof x] = Math.round(v / times * 1000) / 1000;
// 	}

// 	console.log( `A: ${x["A"]}`);
// 	console.log( `B: ${x["B"]}`);
// 	console.log( `C: ${x["C"]}`);
// }

declare global {
	interface Array<T> {
		pushUnique<R extends T>(...x: R[]): number;
	}
}

Array.prototype.pushUnique = function<T>(this: Array<T>, ...list: T[]) {
	for (const x of list) {
		if (this.includes(x)) {continue;}
		this.push(x);
	}
	return this.length;
};


