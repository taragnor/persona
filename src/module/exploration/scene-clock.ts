import { Darkness } from "./darkness-clock.js";
import { ProgressClock } from "../utility/progress-clock.js";

const SCENE_CLOCK_ID = "SceneClock";
const SCENE_CLOCK_NAME = "Scene Clock";
const SCENE_CLOCK_MAX = 8;


export class SceneClock extends ProgressClock {

	static _instance: SceneClock;

	static get instance() : SceneClock {
		return this._instance;

	}

	static init() {
		this._instance = new SceneClock();
	}


	constructor () {
		const cl = ProgressClock.getOrCreateClockById(SCENE_CLOCK_ID, SCENE_CLOCK_NAME, SCENE_CLOCK_MAX);
		super(cl.id, cl.name, cl.max);
	}
}

Hooks.on("ready", () => {
	SceneClock.init();
});

export const LIGHT_LEVEL_CLOCK_NAME = "Light Level" as const;

export const SCENE_CLOCK_NAMES_LIST = [
	SCENE_CLOCK_NAME,
	LIGHT_LEVEL_CLOCK_NAME,
] as const;


