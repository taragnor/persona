export class Helpers {

	static async sleep(sec: number): Promise<void> {
		return new Promise( (conf, _r) => {
			setTimeout( () => conf(), sec * 1000);
		});
	}



}
