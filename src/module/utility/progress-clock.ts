import { PersonaError } from "../persona-error.js";

export  class ProgressClock {
	clockName:string;
	default_max: number;

	constructor(name: string, max: number) {
		this.clockName = name;
		this.default_max = max;
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
		else return new ProgressClock(clock.name, clock.max);
	}

	get amt() : number {
		const clock= this.#getClock()
		if (!clock) return -1;
		return clock.value;
	}

	get visible() : boolean {
		const clock= this.#getClock()
		if (!clock) return false;
		return !clock.private;

	}

	async clear() : Promise< void> {
		await this.refreshValue(0);
	}

	protected async refreshValue(amt: number) {
		const clock = this.#getClock();
		if (!clock) return;
		clock.value = amt;
		if (window.clockDatabase) {
			await window.clockDatabase.update(clock);
		}
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
		if (!this.isMaxed())
		await this.add(1);
		return this.amt;
	}

	async add(mod : number): Promise<number> {
		const amt = Math.min(this.max, Math.max(0, this.amt + mod));
		await this.refreshValue(amt);
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
