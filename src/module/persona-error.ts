import { PersonaSockets } from "./persona.js";

export class PersonaError extends Error {

	constructor (errortxt: string, ...debugArgs: unknown[]) {
		super(errortxt);
		PersonaError.notifyGM(errortxt, this.stack);
		ui.notifications.error(errortxt);
		console.error(errortxt);
		debugArgs.forEach(x=> Debug(x));
	}

	static softFail(errortxt: string, ...debugArgs: unknown[]) {
		try {
			ui.notifications.error(errortxt);
			const trace = this.getTrace();
			this.notifyGM(errortxt, trace, debugArgs);
			console.error(`${errortxt} \n ${trace}`);
		} catch (e) {
			this.notifyGM(errortxt, undefined, debugArgs);
			PersonaError.softFail("Error with softFail error reporting");
			if (e instanceof Error)
			{throw e;}
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

	static notifyGM(errorMsg: string, stack ?: string, ...debugArgs : unknown[]) {
		if (!game || !game.user || game.user.isGM) {return;}
		const trace = stack ? stack : this.getTrace();
		const userId = game.user.id;
		const gmIds = game.users
			.filter ( user => user.isGM && user.active)
			.map( user => user.id);
		const args = debugArgs.map( x=> {
			if (typeof x == "string" || typeof x == "boolean" || typeof x =="number") {return x.toString();}
			if (typeof x == "object") {return JSON.stringify(x);}
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			return x?.toString() ?? "undefined";
		});
		PersonaSockets.simpleSend("ERROR_REPORT", {
			errorMsg,
			trace,
			userId,
			args,
		}, gmIds);
	}

	static onRecieveRemoveError( {errorMsg, trace, userId, args}: RemoteErrorInfo) {
		const user = game.users.get(userId);
		ui.notifications.warn(`Error report recieved from ${user?.name}`);
		console.warn(`Player Error (${user?.name}): ${errorMsg}\n\n ${trace}`);

		Debug(trace);
		Debug(args);
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
	args: string[],
}
