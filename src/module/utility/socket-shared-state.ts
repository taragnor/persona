import { SocketManager } from "./socket-manager.js";

export class SocketSharedState<T> implements SharedState<T> {

	state : T;
	stateChangeFunctions : StateChangeFn<T>[];
	socketData : unknown;

	constructor (initialState: T, socketData ?: SocketSharedState<T>["socketData"]) {
		this.state = initialState;
		this.stateChangeFunctions = [];
		if (socketData) {
			this.socketData = socketData;
			return;
		}
		this.#setUpSockets();
	}

	async #setUpSockets(): Promise<void> {
		// const socketData : this["socketData"]  = something
		//TODO: setup socket stuff here
		// this.socketData = socketData;

	}

	async setState(data: T): Promise<void> {
		this.state = data;
		let report : Promise<void> | undefined;
		try {
			report = this.#reportStateChange(data);
		} catch (e: unknown) {
			const error = e as Error;
			console.error(`Report state change reports error  ${error.stack}`);
		}
		for (const fn of this.stateChangeFunctions) {
			await fn(data);
		}
		if (report) {
			await report;
		}
	}

	async #reportStateChange(data :T) : Promise<void> {
		//TODO, do socket stuff here

	}

	onStateChange(stateChangeFunction: StateChangeFn<T>): void {
		throw new Error("Method not implemented.");
	}

}

interface SharedState<T extends any> {
	setState(data: T): Promise<void>;
	onStateChange( stateChangeFunction : StateChangeFn<T>) : void;

}

type StateChangeFn<T> = (newData: T) => Promise<void> | void;
