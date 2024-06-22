declare global {
	interface Window {
		TensionPool: typeof TensionPool;
	}
}



export class TensionPool {
	static _amt: number;
	static DEFAULT_MAX= 6;

	static get amt() : number {
		if (window.clockDatabase) {
			const clock = window.clockDatabase.getName("Tension Pool");
			if (clock) {
				this._amt = clock.value;
				return clock.value;
			}
		}
		return this._amt;

	}

	static async inc(): Promise<number> {
		if (!this.isMaxed())
			await this.modifyTensionPool(1);
		return this.amt;
	}

	private static async refreshValue(amt: number) {
		if (window.clockDatabase) {
			const clock = window.clockDatabase.getName("Tension Pool");
			if (!clock) return;
			await window.clockDatabase.update( {id: clock.id, value: amt})
		}

	}

	static isMaxed() : boolean {
		return this.amt >= this.max();
	}

	static max(): number {
		if (window.clockDatabase) {
			const clock = window.clockDatabase.getName("Tension Pool");
			if (clock)  {
				return clock.max;
			}
		}
		return this.DEFAULT_MAX;
	}

	static async modifyTensionPool(mod : number): Promise<number> {
		this._amt = Math.min(this.max(), Math.max(0, this.amt + mod));
		await this.refreshValue(this._amt);
		return this.amt;
	}

}


window.TensionPool = TensionPool;
