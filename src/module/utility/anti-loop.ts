import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaError} from "../persona-error.js";
import {sleep} from "./async-wait.js";

const lockedObjects : WeakMap<object, number> = new WeakMap();

export async function lockObject(lockObj: object,  fn: () => Promise<unknown>, options : LockObjectOptions = {}) : Promise<void> {
  await antiLoop(lockObj, fn, options);
}

export async function antiLoop(lockObj: object,  fn: () => Promise<unknown>, options : LockObjectOptions = {}) : Promise<void> {
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
  try {
    lockedObjects.set(lockObj, usage + 1);
    if (options.timeoutMs && options.timeoutMs > 0) {
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
