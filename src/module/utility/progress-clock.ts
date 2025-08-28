import { sleep } from "./async-wait.js";
import { PersonaError } from "../persona-error.js";

declare global {
	interface HOOKS {
		"clockTick": (clock: ProgressClock, newAmt: number) => unknown;
		"updateClock": (clock: ProgressClock, newAmt: number, delta : number) => unknown;
	}

}

interface ClockMetaData  {
	cyclic ?: boolean;
	hideOnZero ?: boolean;
	gmOnly?: boolean;
}

// interface MetaObject {
// 	meta: ClockMetaData
// }

export  class ProgressClock {
	static _clocks: Map<string, ProgressClock> = new Map();
	static _ready = false;
	clockName: string;
	default_max: number;
	id: string;
	#lastKnown: number;

	constructor(id: string, name: string, max: number) {
		this.id = id;
		this.clockName = name;
		this.default_max = max;
		this.registerClock();
	}

	static async createNamedClock(name:string, max: number) : Promise<ProgressClock> {
		while (!ProgressClock._ready) {
			await sleep(1000);
		}
		const db = window.clockDatabase;
		if (!db) {
			throw new PersonaError("No clock database, is Global Progress Clocks enabled?");
		}
		let clock = db.getName(name);
		if (!clock) {
			db.addClock({
				name: name,
				value: 0,
				max: max,
			});
			clock = db.getName(name)!;
		}
		return new ProgressClock(clock.id, clock.name, clock.max);
	}

	renameClock(newName: string) {
		this.clockName = newName;
		const cl = this.#getClock();
		if (!cl) {return;}
		cl.name = newName;
		window.clockDatabase!.update(cl);
	}

	static getOrCreateClockByName(name: string, maxIfDoesntExist: number) {
		const db = window.clockDatabase;
		if (!db) {throw new Error("No Clock database, is Global Progress Clocks Active?");}
		let cl = db.getName(name);
		if (!cl) {
			db.addClock({
				name: name,
				value: 0,
				max: maxIfDoesntExist,
			});
			cl = db.getName(name);
		}
		if (!cl) {
			throw new Error(`Couldn't create clock named ${name} for some reason`);
		}
		return cl;
	}

	static getOrCreateClockById(id: string, nameIfDoesntExist: string, maxIfDoesntExist: number) {
		const db = window.clockDatabase;
		if (!db) {throw new Error("No Clock database, is Global Progress Clocks Active?");}
		let cl = db.get(id);
		if (!cl) {
			db.addClock({
				name: nameIfDoesntExist,
				value: 0,
				max: maxIfDoesntExist,
				id: id,
			});
			cl = db.get(id);
		}
		if (!cl) {
			throw new Error(`Couldn't create clock ${id} for some reason`);
		}
		return cl;
	}

	async registerClock() {
		while (!ProgressClock._ready) {
			await sleep(1000);
		}
		const clock = this.#getClock();
		if (!clock) {return;}
		ProgressClock._clocks.set(clock.id, this);
		this.#lastKnown = this.amt;
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
		if (!window.clockDatabase) {return [];}
		const db = window.clockDatabase;
		return db.contents;
	}

	static getClock(id: string) : ProgressClock | undefined {
		if (!window.clockDatabase) {return undefined;}
		const db = window.clockDatabase;
		const clock = db.get(id);
		if (!clock) {return undefined;}
		const pClock = this._clocks.get(clock.id);
		if (pClock) {return pClock;}
		else {return new ProgressClock(id, clock.name, clock.max);}
	}


	/** returns true if it should start back at 0 once it overflows*/
	isCyclical(): boolean {
		return this.meta.cyclic ?? false;
	}

	hideOnZero(): boolean {
		return this.meta.hideOnZero ?? false;
	}

	gmOnly(): boolean {
		return this.meta.gmOnly ?? false;
	}

	setCyclic(isCyclic: boolean) {
		const m = this.meta;
		m.cyclic = isCyclic;
		this.meta = m;
	}

	setHideOnZero(hide: boolean) {
		const m = this.meta;
		m.hideOnZero = hide;
		this.meta = m;
	}

	setGMOnly(hide: boolean) {
		const m = this.meta;
		m.gmOnly = hide;
		this.meta = m;
	}


	setMax(newMax: number) {
		const clk = this.#getClock();
		if (!clk) {return;}
		clk.max = newMax;
		window.clockDatabase!.update(clk);
	}


	get meta(): ClockMetaData {
		const cl = this.#getClock();
		if (cl && "meta" in cl && typeof cl.meta == "object") {
			return cl.meta as ClockMetaData;
		}
		return {};
	}

	set meta(metadata: ClockMetaData) {
		const cl = this.#getClock();
		if( cl) {
			const cm = cl as {meta ?: ClockMetaData};
			cm["meta"] = metadata;
			window.clockDatabase!.update(cl);
		}
	}


	get amt() : number {
		const clock= this.#getClock();
		if (!clock) {return -1;}
		return clock.value;
	}

	get visible() : boolean {
		const clock = this.#getClock();
		if (!clock) {return false;}
		return !clock.private;
	}

	async clear() : Promise< void> {
		await this.refreshValue(0);
	}

	protected async refreshValue(amt: number) {
		const clock = this.#getClock();
		if (!clock) {return;}
		if (clock.value == amt) {return;}
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
		if (!clock) {return;}
		if (clock.private == true) {return;}
		clock.private = true;
		window.clockDatabase!.update(clock);
	}

	async show() {
		const clock = this.#getClock();
		if (!clock) {return;}
		if (clock.private == false) {return;}
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
		{await this.add(1);}
		return this.amt;
	}

	async reportTick(newAmt: number) : Promise<void> {
		Hooks.callAll("clockTick", this, newAmt);
	}

	async reportChange(newAmt: number, oldAmt: number) : Promise<void> {
		const delta = newAmt - oldAmt;
		if (delta != 0) {
			await this.onUpdate();
			Hooks.callAll("updateClock", this, newAmt, delta);
		}
	}

	async onUpdate() {
		if (this.gmOnly()) {
			await this.hide();
			return;
		}
		if (this.hideOnZero() && this.amt == 0) {
			await this.hide();
		} else {
			await this.show();
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
		let clock = window.clockDatabase.get(this.id);
		if (!clock) {
			window.clockDatabase.addClock({
				name: this.clockName,
				value: 0,
				max: this.default_max,
			});
			clock = window.clockDatabase.getName(this.clockName);
		}
		return clock;
	}

}

Hooks.on("ready", ()=> ProgressClock._ready = true);

Hooks.on("updateSetting", async () => {
	await ProgressClock.checkForUpdate();
});
