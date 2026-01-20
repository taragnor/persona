import {sleep} from "./async-wait.js";

const lockedObjects : WeakSet<object> = new WeakSet();

export async function lockObject(lockObj: object,  fn: () => Promise<void>, options : LockObjectOptions = {}) : Promise<void> {
	if (lockedObjects.has(lockObj)) {
		if (options.inUseMsg) {
			ui.notifications.notify(options.inUseMsg);
		}
		console.log("Anti loop activated");
		return;
	}
	lockedObjects.add(lockObj);
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
	timeoutMs?: number,
	inUseMsg?: string
};
