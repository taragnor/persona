import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaError} from "../persona-error.js";
import {sleep} from "./async-wait.js";

const lockedObjects : WeakMap<object, number> = new WeakMap();

export async function antiLoop(lockObj: object,  fn: () => Promise<void>, options : LockObjectOptions = {}) : Promise<void> {
	 const usage = lockedObjects.get(lockObj) ?? 0;
	 const usageLimit = options.maxDepth ?? 1;
	 if (usage >= usageLimit ) {
			if (options.inUseMsg) {
				 ui.notifications.notify(options.inUseMsg);
				 console.log(options.inUseMsg);
				 if (PersonaSettings.debugMode()) {
						PersonaError.logTrace();
				 }
			} else {
				 console.log("Anti loop triggered");
			}
			return;
	 }
	 lockedObjects.set(lockObj, usage + 1);
	 try {
			if (options.timeoutMs) {
				 await Promise.race([fn(), sleep(options.timeoutMs)]);
			} else {
				 await fn();
			}
	 } catch (e) {
			if (e instanceof Error) {
				 console.log(e.message);
				 console.log(e.stack);
			}
			throw e;
	 }
	 lockedObjects.delete(lockObj);
}


interface LockObjectOptions {
	 timeoutMs?: number;
	 inUseMsg?: string;
	 maxDepth?: number;
};
