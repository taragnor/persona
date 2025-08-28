
function d(sides: number): number;
function d(num: number, sides: number): number;
function d(num: number, sides?: number) {
	if (!sides) {
		sides= num;
		num = 1;
	}
	let total = 0;
	while (num-- > 0) {
		total += Math.floor(Math.random() * sides + 1);
	}
	return total;
}

export class Simulations {



	static sinistar(sinistarCompletion = 20) : number {
		const NUM_PLAYERS = 4;
		const travel = 6;
		let bombs = 0;
		for (let sinistar = travel; sinistar < sinistarCompletion; sinistar++) {
			for (let i=0; i< NUM_PLAYERS; i++) {
				bombs += d(6) >= 5 ? 1 : 0;
			}
		}
		return bombs;
	}

	static avgBombs(neededBombs = 13) : number {
		const ITERATIONS = 10000;
		let bombs = 0, pass = 0;
		for (let i =0; i< ITERATIONS ; i++) {
			const bomb = this.sinistar();
			bombs += bomb;
			pass += bomb >= neededBombs ? 1 : 0;
		}
		const avgBombs= bombs / ITERATIONS;
		const avgPass = pass / ITERATIONS;
		console.log( ` Avg Bombs: ${avgBombs}, Pass % ${Math.round(avgPass * 100)}`);
		return avgBombs;
	}

}

//@ts-ignore
window.Simulations = Simulations;

//@ts-ignore
window.d = d;
