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


}
