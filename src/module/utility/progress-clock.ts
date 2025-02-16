import { sleep } from "./async-wait.js";
import { PersonaError } from "../persona-error.js";

declare global {
	interface HOOKS {
		"clockTick": (clock: ProgressClock, newAmt: number) => unknown;
		"updateClock": (clock: ProgressClock, newAmt: number, delta : number) => unknown;
	}

}

export  class ProgressClock {
	static _clocks: Map<string, ProgressClock> = new Map();
	static _ready = false;
	clockName: string;
	default_max: number;
	#cyclic: boolean = false;
	#lastKnown: number;

	constructor(name: string, max: number) {
		this.clockName = name;
		this.default_max = max;
		this.#cyclic = name.trim().toLowerCase().endsWith("(c)");
		this.registerClock();
	}


	async registerClock() {
		while (!ProgressClock._ready) {
			await sleep(1000);
		}
		const clock = this.#getClock();
		if (!clock) return;
		ProgressClock._clocks.set(clock.id, this);
		this.#lastKnown = this.amt;
	}

	get id(): string {
		return this.#getClock()!.id;
	}

	static async checkForUpdate() : Promise<void> {
		for (const cl of this._clocks.values()) {
			const amt = cl.amt;
			if (amt != cl.#lastKnown) {
				await cl.reportChange(amt, cl.#lastKnown);
				cl.#lastKnown = amt;
			}
		}
	}

	static allClocks() : GlobalProgressClocks.ProgressClock[]{
		if (!window.clockDatabase) return [];
		const db = window.clockDatabase;
		return db.contents;
	}

	static getClock(id: string) : ProgressClock | undefined {
		if (!window.clockDatabase) return undefined;
		const db = window.clockDatabase;
		const clock = db.get(id);
		if (!clock) return undefined;
		const pClock = this._clocks.get(clock.id);
		if (pClock) return pClock;
		else return new ProgressClock(clock.name, clock.max);
	}

	/** returns true if it should start back at 0 once it overflows*/
	isCyclical(): boolean {
		return this.#cyclic;
	}

	get amt() : number {
		const clock= this.#getClock()
		if (!clock) return -1;
		return clock.value;
	}

	get visible() : boolean {
		const clock = this.#getClock()
		if (!clock) return false;
		return !clock.private;
	}

	async clear() : Promise< void> {
		await this.refreshValue(0);
	}

	protected async refreshValue(amt: number) {
		const clock = this.#getClock();
		if (!clock) return;
		if (clock.value == amt) return;
		clock.value = amt;
		if (window.clockDatabase) {
			await window.clockDatabase.update(clock);
		}
		this.#lastKnown = amt;
	}

	isMaxed() : boolean {
		return this.amt >= this.max;
	}

	async hide() {
		const clock = this.#getClock();
		if (!clock) return;
		clock.private = true;
		window.clockDatabase!.update(clock);
	}

	async show() {
		const clock = this.#getClock();
		if (!clock) return;
		clock.private = false;
		window.clockDatabase!.update(clock);
	}

	get max(): number {
		const clock = this.#getClock();
		if (clock)  {
			return clock.max;
		}
		return this.default_max;
	}

	async inc(): Promise<number> {
		if (!this.isMaxed() || this.isCyclical())
		await this.add(1);
		return this.amt;
	}

	async reportTick(newAmt: number) : Promise<void> {
		Hooks.callAll("clockTick", this, newAmt);
	}

	async reportChange(newAmt: number, oldAmt: number) : Promise<void> {
		const delta = newAmt - oldAmt;
		if (delta != 0) {
			Hooks.callAll("updateClock", this, newAmt, delta);
		}
	}

	async set(amt: number) : Promise<number> {
		const oldVal = this.amt;
		const tick = Math.abs(this.amt - amt);
		amt = Math.clamp(amt, 0, this.max);
		this.refreshValue(amt);
		if (tick != 0) {
			await this.reportTick(tick);
		}
		await this.reportChange(amt, oldVal);
		return this.amt;
	}

	async add(mod : number): Promise<number> {
		if (!this.isCyclical()) {
			const oldVal = this.amt;
			const amt = Math.min(this.max, Math.max(0, this.amt + mod));
			await this.refreshValue(amt);
			if (mod == 1) {await  this.reportTick(amt); }
			await this.reportChange(amt, oldVal);
			return this.amt;
		}
		let modAmt = this.amt + mod;
		while (modAmt > this.max) {
			modAmt = modAmt - (this.max +1);
		}
		while (modAmt < 0) {
			modAmt = modAmt + (this.max +1);
		}
		const oldVal = this.amt;
		this.refreshValue(modAmt);
		if (mod == 1) { await this.reportTick(modAmt); }
		await this.reportChange(modAmt, oldVal);
		return this.amt;
	}

	#getClock(): undefined |  GlobalProgressClocks.ProgressClock {
		if (!window.clockDatabase) {
			PersonaError.softFail("No clock database, is Global Progress Clocks enabled?");
			return undefined;
		}

		let clock = window.clockDatabase.getName(this.clockName);
		if (!clock) {
			window.clockDatabase.addClock({
				name: this.clockName,
				value: 0,
				max: this.default_max,
			});
			clock = window.clockDatabase.getName("Doomsday Clock");
		}
		return clock;
	}

}

Hooks.on("ready", ()=> ProgressClock._ready = true);

Hooks.on("updateSetting", async () => {
	await ProgressClock.checkForUpdate();
});
