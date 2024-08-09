export function shuffle<T>(array: T[]) : void {
  let currentIndex = array.length;
  while (currentIndex != 0) {
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
};

export function weightedChoice<T>( array: WeightedChoiceItem<T>[]) : T | undefined {
	if (array.length == 0) return undefined;
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


type WeightedChoiceItem<T>= {
	item: T,
	weight: number
}

//PURE TESTING FUNCTION no real usage
function test_weightedChoice() {
	const items : WeightedChoiceItem<"A" | "B" | "C">[] = [
		{
			item: "A", weight: 5
		},
		{
			item: "B", weight: 1
		},
		{
			item: "C", weight: 0.2
		}
	];
	let x = {
		A: 0,
		B: 0,
		C: 0
	};
	const times = 100000;
	for (let i = 0; i< times; i++) {
		const result = weightedChoice(items);
		if (result == undefined) continue;
		x[result] += 1;
	}
	for (const [k,v] of Object.entries(x)) {
		x[k as keyof typeof x] = Math.round(v / times * 1000) / 1000;
	}

	console.log( `A: ${x["A"]}`);
	console.log( `B: ${x["B"]}`);
	console.log( `C: ${x["C"]}`);
}



