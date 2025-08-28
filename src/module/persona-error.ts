import { PersonaSockets } from "./persona.js";

export class PersonaError extends Error {

	constructor (errortxt: string, ...debugArgs: any[]) {
		super(errortxt);
		PersonaError.notifyGM(errortxt, this.stack);
		ui.notifications.error(errortxt);
		console.error(errortxt);
		debugArgs.forEach(x=> Debug(x));
	}

	static softFail(errortxt: string, ...debugArgs: any[]) {
		try {
			this.notifyGM(errortxt);
			ui.notifications.error(errortxt);
			const trace = this.getTrace();
			console.error(`${errortxt} \n ${trace}`);
		} catch (e) {
			throw new Error(errortxt);
		}
		if (debugArgs) {
			debugArgs.forEach( arg=> Debug(arg));
		}
	}

	static getTrace() : string {
		try {
			throw new Error();
		} catch (e ) {
			const stack =  (e as Error).stack;
			return stack ? stack : "No Trace";
		}
	}

	static notifyGM(errorMsg: string, stack ?: string) {
		if (!game || !game.user || game.user.isGM) {return;}
		const trace = stack ? stack : this.getTrace();
		const userId = game.user.id;
		const gmIds = game.users
			.filter ( user => user.isGM && user.active)
			.map( user => user.id);
		PersonaSockets.simpleSend("ERROR_REPORT", {
			errorMsg,
			trace,
			userId
		}, gmIds);
	}

	static onRecieveRemoveError( {errorMsg, trace, userId}: RemoteErrorInfo) {
		const user = game.users.get(userId);
		console.warn(`Player Error (${user?.name}): ${errorMsg}\n\n ${trace}`);
	}
}

Hooks.on("socketsReady", () => {
	PersonaSockets.setHandler("ERROR_REPORT", (info) => {
		PersonaError.onRecieveRemoveError(info);
	});
});

declare global {
	interface SocketMessage {
		"ERROR_REPORT": RemoteErrorInfo
	}
}

type RemoteErrorInfo = {
	errorMsg:string,
	trace: string,
	userId: string,
}
