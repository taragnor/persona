export  class ProgressClock {
	clockName:string;
	private _amt: number;
	default_max: number;

	constructor(name: string, max: number) {
		this.clockName = name;
		this.default_max = max;
	}

	get amt() : number {
		if (window.clockDatabase) {
			const clock = window.clockDatabase.getName(this.clockName);
			if (clock) {
				this._amt = clock.value;
				return clock.value;
			}
		}
		return this._amt;
	}

	async clear() : Promise< void> {
		this._amt = 0;
		await this.refreshValue(this._amt);
	}

	protected async refreshValue(amt: number) {
		if (window.clockDatabase) {
			const clock = window.clockDatabase.getName(this.clockName);
			if (!clock) return;
			await window.clockDatabase.update( {id: clock.id, value: amt})
		}
	}

	isMaxed() : boolean {
		return this.amt >= this.max;
	}

	get max(): number {
		if (window.clockDatabase) {
			const clock = window.clockDatabase.getName(this.clockName);
			if (clock)  {
				return clock.max;
			}
		}
		return this.default_max;
	}

	async inc(): Promise<number> {
		if (!this.isMaxed())
		await this.add(1);
		return this.amt;
	}

	async add(mod : number): Promise<number> {
		this._amt = Math.min(this.max, Math.max(0, this.amt + mod));
		await this.refreshValue(this._amt);
		return this.amt;
	}

}
