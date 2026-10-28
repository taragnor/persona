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
    if (options.suppressMessages) {return;}
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
      Debug(e);
    }
  }
  lockedObjects.delete(lockObj);
}

interface LockObjectOptions {
  timeoutMs?: number;
  inUseMsg?: string;
  maxDepth?: number;
  suppressMessages?: boolean;
};




export class RecursionControl {
  static lockedObjects : WeakMap<object, number> = new WeakMap(); //number is depth of recursion

  private maxDepth: number = 1;
  private _lockObject: object;

  constructor (lockObject: object, options ?: RecursionControlOptions) {
    this._lockObject = lockObject;
    // RecursionControl.lockedObjects.set(this._lockObject, 0);
    this.maxDepth = options?.maxDepth ?? 1;
  }

  canLock () : boolean {
    const locks = RecursionControl.locksOnObject(this._lockObject);
    return locks < this.maxDepth;
  }

  lock() {
    RecursionControl.lockObject(this._lockObject);
  }

  release() {
    RecursionControl.releaseLock(this._lockObject);
  }

  altFn<T>(baseFn: () =>T, altFn: () => T) : T {
    if (this.canLock() ) {
      try {
        this.lock();
        return baseFn();
      } finally {
        this.release();
      }
    } else {
      try {
        this.lock();
        return altFn();
      } finally {
        this.release();
      }
    }
  }

  /** runs an alt function if the first object exceeds maxlocks*/
  static altFunction<T>(lockObject: object, baseFn: () => T, altFn: () => T, options ?: RecursionControlOptions) : T {
    const control = new RecursionControl(lockObject, options);
    return control.altFn(baseFn, altFn);
  }

  static locksOnObject (lockObject: object): number {
    return this.lockedObjects.get(lockObject) ?? 0;
  }

  static lockObject(lockObject: object) : number {
    let locks = this.lockedObjects.get(lockObject) ?? 0;
    locks += 1;
    this.lockedObjects.set(lockObject, locks);
    return locks;
  }

  static releaseLock (lockObject: object) : number {
    let locks = this.lockedObjects.get(lockObject) ?? 0;
    if (locks <= 0) {
      Debug(lockObject);
      const name = "name" in lockObject?  lockObject.name : "unknown";
      throw new Error(`Somehow object is not locked but lock is being released:  ${name as string}`);
    }
    locks -= 1;
    this.lockedObjects.set(lockObject, locks);
    return locks;
  }



}

type RecursionControlOptions = {
  maxDepth ?: number;

}
