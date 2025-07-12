import { ProgressClock } from "../utility/progress-clock.js";
const DOOMSDAY_CLOCK_NAME = "Doomsday Clock";
const DOOMSDAY_CLOCK_MAX = 30;
export class DoomsdayClock extends ProgressClock {
	static _instance: DoomsdayClock;

	static get instance() : DoomsdayClock {
		return this._instance;
	}

	constructor () {
		const cl=  ProgressClock.getOrCreateClockByName(DOOMSDAY_CLOCK_NAME, DOOMSDAY_CLOCK_MAX);
		super(cl.id, cl.name, cl.max);
	}

	static init() {
		this._instance = new DoomsdayClock();
	}

}

Hooks.on("ready", () => {
	DoomsdayClock.init();
});

