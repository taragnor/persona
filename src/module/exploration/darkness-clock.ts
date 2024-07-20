import { ProgressClock } from "../utility/progress-clock.js";
export class Darkness {
	static lightClock= new ProgressClock("Light Level", 6);
	static lastLight = -1;


	static init() {
		if (!game.user.isGM) return;
		Hooks.on("canvasReady", () => {
			this.updateLightVisibility();
		});
		this.updateLightVisibility();
		this.setListener();
	}

	static async updateLightVisibility() {
		if (game.scenes.active.name == "Crypt") {
			await this.lightClock.show();
		} else {
			await this.lightClock.hide();
		}
	}

	static setListener() {
		console.log("Listener Set");
		setInterval( this.updateLight.bind(this), 1500);
	}

	static updateLight() {
		const clockVal = (this.lightClock.visible) ? this.lightClock.amt: 0;
		if (clockVal != this.lastLight) {
			this.lastLight = clockVal;
			const bright = clockVal * 0.5;
			const dim = clockVal * 0.5 + 6;
			const torch = {
					type: "flame",
					speed: 2,
					intensity:3,
			};
			const noLight = {
				type: null,
			}
			const animation = clockVal > 0 ? torch : noLight;
			const lightObj = {
				bright,
				dim,
				animation,
			};
			game.scenes.active.tokens.forEach( tok => {
				if (tok.actor && tok.actor.type == "pc") {
					//TODO: Change light source here
					console.log(`Updating Light for ${tok.name}`);
					tok.update({"light" : lightObj });

				}
			});
		}
	}
}

