import { PersonaActor } from "../actor/persona-actor.js";
import { ProgressClock } from "../utility/progress-clock.js";
export class Darkness {
	static lightClock= new ProgressClock("Light Level", 6);
	static lastLight = -1;


	static init() {
		if (!game.user.isGM) return;
		Hooks.on("canvasReady", () => {
			this.updateClockVisibility();
		});
		Hooks.on("updateClock", (clock) => {
			if (clock != Darkness.lightClock) return;
			this.updateClockVisibility();
			this.updateLight();
		});
		Hooks.on("enterMetaverse", () => {
			this.lightClock.set(0);
		});
		Hooks.on("exitMetaverse", () => {
			this.lightClock.set(0);
		});
		// this.updateLightVisibility();
		this.setListener();
	}

	static async updateClockVisibility() {
		if (this.lightClock.amt > 0) {
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
			// const bright = clockVal * 0.5;
			// const dim = clockVal * 0.5 + 6;
			const torch = {
					type: "flame",
					speed: 2,
					intensity:3,
			};
			const noLight = {
				type: null,
			}
			const animation = clockVal > 0 ? torch : noLight;
			const alpha = clockVal > 0 ? clockVal * 0.10: 0;
			const lightObj = {
				// bright,
				// dim,
				alpha,
				color: 13695488,
				animation,
			};
			game.scenes.active.tokens.forEach( (tok: TokenDocument<PersonaActor>) => {
				if (tok.actor && (tok.actor.isPC() || tok.actor.isNPCAlly()) && tok.actor.hasPlayerOwner) {
					//TODO: Change light source here
					console.log(`Updating Light for ${tok.name}, alpha ${lightObj.alpha}`);
					tok.update({"light" : lightObj });

				}
			});
		}
	}
}


