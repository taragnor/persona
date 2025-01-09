export class Helpers {

	static async sleep(sec: number): Promise<void> {
		return new Promise( (conf, _r) => {
			setTimeout( () => conf(), sec * 1000);
		});
	}

	/** errors if the game is paused and the user isn't a GM, else returns true */
	static pauseCheck(errorMsg?: string): true {
		if (game.paused && !game.user.isGM) {
			if (!errorMsg) {
				errorMsg = "Can't perform this action if the game is paused";
			}
			ui.notifications.error(errorMsg);
			throw new Error("Pause Check failed");
		}
		return true;
	}

	/** used primarily for array related stuff, clears out datamodels and offers a full diff so array pushes aren't lost**/
	static expandObject<T extends unknown>(data: T) :T  {
		switch (typeof data) {
			case "string":
			case "number":
			case "bigint":
			case "boolean":
			case "symbol":
			case "undefined":
				return data;
			case "function":
				throw new Error("Doesn't handle functions");
			case "object":
				if (data  == null) return data;
				if (Array.isArray(data)) {
					return data.map( x=> this.expandObject(x)) as T;
				}
				return Object.fromEntries(
					Object.entries(data)
					.map (([k,v])=> {
						switch (typeof v) {
							case "string":
							case "number":
							case "bigint":
							case "boolean":
							case "symbol":
							case "undefined":
								return [k,v];
							case "function":
								return [];
							case "object":
								if (v == null) return [k,v];
								if ("schema" in v && "toObject" in v && typeof v.toObject == "function") return this.expandObject(v.toObject());
								if (Array.isArray(v))
									return [k,
										v.map( x=> this.expandObject(x))];
								else return [k, this.expandObject(v)];
						}
					})
					.filter(x=> x.length > 0 )
				) as T;
		}
	}

}
