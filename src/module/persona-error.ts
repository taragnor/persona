import { PersonaSockets } from "./persona.js";

export class PersonaError extends Error {

  constructor (e: Error);
	 constructor (errortxt: string, ...debugArgs: unknown[]);
	 constructor (error: string | Error, ...debugArgs: unknown[]) {
     if (error instanceof Error) {
       super(error.message);
       if (error.stack) {
       this.stack = error.stack;
       }
       this.name = error.name;
       return;
     }
     const errortxt = error;
			super(errortxt);
			PersonaError.notifyGM(errortxt, this.stack, debugArgs);
			ui.notifications.error(errortxt);
			console.error(errortxt);
			debugArgs.forEach(x=> Debug(x));
	 }

  static softFail(error: string | Error, ...debugArgs: unknown[]) : void {
    try {
      if (error instanceof Error) {
        this.notifyGM(error.message, error.stack, debugArgs);
        ui.notifications.error(error.message);
        console.error(`${error.message} \n ${error.stack}`);
        return;
      }
      const errortxt = error;
      ui.notifications.error(errortxt);
      const trace = this.getTrace();
      this.notifyGM(errortxt, trace, debugArgs);
      console.error(`${errortxt} \n ${trace}`);
    } catch (e) {
      if (debugArgs) {
        debugArgs.forEach( arg=> Debug(arg));
      }
      this.notifyGM(error instanceof Error ? error.message : error, undefined, debugArgs);
      PersonaError.softFail("Error with softFail error reporting");
      if (e instanceof Error)
      {throw e;}
    }
    // if (debugArgs) {
    //   debugArgs.forEach( arg=> Debug(arg));
    // }
  }

  static async asyncErrorWrapper(fn: () => Promise<void | undefined>, ...args: unknown[]): Promise<void> {
    try {
      await fn();
    } catch (e)  {
      if (e instanceof Error) {
        PersonaError.softFail(e, ...args);
      }
    }
  }

	 static logTrace() : void {
			console.log(this.getTrace());
	 }

	 static getTrace() : string {
			try {
				 throw new Error();
			} catch (e ) {
				 const stack =  (e as Error).stack;
				 return stack ? stack : "No Trace";
			}
	 }

	 private static toText( x: unknown) : string {
			if (typeof x == "string" || typeof x == "boolean" || typeof x =="number") {return x.toString();}
			if (Array.isArray(x)) {
				 return x.flatMap( y => this.toText(y))
						.join ("\n");
			}
			if (typeof x == "object") {
				 if (x instanceof Error) {
						return `${x.message}: \n${x.stack}`;
				 }
				 return JSON.stringify(x);}
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			return x?.toString() ?? "undefined";


	 }

	 static notifyGM(errorMsg: string, stack ?: string, ...debugArgs : unknown[]) {

     if (!game || !game.user) {return;}
     if (game.user.isGM) {
       Debug(...debugArgs);
     }
     const trace = stack ? stack : this.getTrace();
     const userId = game.user.id;
     const gmIds = game.users
       .filter ( user => user.isGM && user.active)
       .map( user => user.id);
     const args = debugArgs.flatMap( x=> this.toText(x));
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
	 userId: User["id"],
	 args: string[],
}
