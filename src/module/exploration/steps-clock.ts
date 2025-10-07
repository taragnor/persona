import { ProgressClock } from "../utility/progress-clock.js";

const STEPS_CLOCK_NAME = "Metaverse Turns Taken";
const STEPS_CLOCK_MAX = 120;

export class StepsClock extends ProgressClock {
	static _instance: StepsClock;

	static get instance() {
		return this._instance;
	}

	constructor () {
		const cl=  ProgressClock.getOrCreateClockByName(STEPS_CLOCK_NAME, STEPS_CLOCK_MAX);
		super(cl.id, cl.name, cl.max);
	}

	static init() {
		this._instance = new StepsClock();
		this._instance.setGMOnly(false);
		void this._instance.show();
	}
}

Hooks.on("ready", () => {
	StepsClock.init();
});


Hooks.on("exitMetaverse", async() => {
	await StepsClock.instance.set(0);
	await StepsClock.instance.hide();
});

Hooks.on("enterMetaverse",async () => {
	await StepsClock.instance.set(0);
	await StepsClock.instance.show();
});

