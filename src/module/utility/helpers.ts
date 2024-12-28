export class Helpers {

	static async sleep(sec: number): Promise<void> {
		return new Promise( (conf, _r) => {
			setTimeout( () => conf(), sec * 1000);
		});
	}

	static randomSelect<T extends any>(arr: T[]) : T {
		return arr[Math.floor(Math.random() * arr.length)];
	}

}
