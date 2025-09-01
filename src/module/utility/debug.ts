 export class DebugTools {
	static DEBUG = true;
	static _DList: unknown[] = [];

		static Debug(...args :unknown[] ) {
			 if (this._DList == null) {this._DList= [];}
			 console.warn("Added to Debug");
			 for (const str of args) {
					this._DList.unshift(str);
			 }
		}

	static DLog (num ?: number | null) {
		if (num == null)
			{return this._DList;}
		else {return this._DList[num];}
	}

	static setDebugMode(bool: boolean) {
		if (typeof bool != "boolean")
			{throw new Error(`Expected boolean and got ${typeof bool} :${bool as string}`);}
		this.DEBUG = bool;
		console.log(`Debug mode set to ${bool}`);
	}
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
window.Debug = DebugTools.Debug.bind(DebugTools);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
window.DLog = DebugTools.DLog.bind(DebugTools);


declare global {
	const Debug  : (...item: unknown[]) => void;
	interface Window {
		Debug(...str : unknown[]) : void;
		DLog(num ?: unknown) : unknown;
	}
}

const oldSO = Handlebars.helpers["selectOptions"] ;
Handlebars.helpers["selectOptions"] = function (...x : unknown[]) {
	try {
		return oldSO(...x);
	} catch (e) {
		ui.notifications.error("Error in selectOptions");
		Debug(x);
		Debug(e);
		return "ERROR";
	}

};

