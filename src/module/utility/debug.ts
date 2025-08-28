 export class DebugTools {
	static DEBUG = true;
	static _DList: unknown[] = [];

	static Debug(...args :unknown[] ) {
		if (this._DList == null)
			{this._DList= [];}
		for (const str of args)
		{this._DList.unshift(str);}
		// console.warn("Added to Debug");
	}

	static DLog (num ?: number | null) {
		if (num == null)
			{return this._DList;}
		else {return this._DList[num];}
	}

	static setDebugMode(bool: boolean) {
		if (typeof bool != "boolean")
			{throw new Error(`Expected boolean and got ${typeof bool} :${bool}`);}
		this.DEBUG = bool;
		console.log(`Debug mode set to ${bool}`);
	}
}

window.Debug = DebugTools.Debug.bind(DebugTools);
window.DLog = DebugTools.DLog.bind(DebugTools);


declare global {
	const Debug  : (...item: unknown[]) => void;
	interface Window {
		Debug(str: any) : void;
		DLog(num ?: unknown) : void;
	}
}

const oldSO = Handlebars.helpers["selectOptions"] ;
Handlebars.helpers["selectOptions"] = function (...x : any[]) {
	try {
		return oldSO(...x);
	} catch (e) {
		ui.notifications.error("Error in selectOptions");
		Debug(x);
		return "ERROR";
	}

};

