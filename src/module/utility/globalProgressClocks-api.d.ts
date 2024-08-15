interface Window {
	clockDatabase?: GlobalProgressClocks.ClockDatabase;
}


namespace GlobalProgressClocks {
	interface ClockDatabase extends Collection<ProgressClock> {
		getName(name: string) : GlobalProgressClocks.ProgressClock | undefined;
		update(newData : {id: string, value: number}): Promise<void>;
		addClock(data: Partial<GlobalProgressClocks.ProgressClock>): Promise<void>
	}

	type ProgressClock = {
		name: string,
		id: string,
		value: number,
		max: number,
		private: boolean;

	}

}
