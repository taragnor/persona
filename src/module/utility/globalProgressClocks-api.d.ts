interface Window {
	clockDatabase?:{
		getName(name: string) : GlobalProgressClocks.ProgressClock | undefined;
		update(newData : {id: string, value: number}): Promise<void>;
		addClock(data: Partial<GlobalProgressClocks.ProgressClock>): Promise<void>
	}
}

namespace GlobalProgressClocks {
	type ProgressClock = {
		name: string,
		id: string,
		value: number,
		max: number,
		private: boolean;

	}

}
