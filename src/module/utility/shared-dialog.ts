import {HTMLDataInputDefinition, HTMLInputReturnType, HTMLTools} from "./HTMLTools.js";
import {SocketManager, SocketPayload} from "./socket-manager.js";

declare global {
	interface SocketMessage {
		"SHARED_DIALOG_START" : {
			name: string,
			dataDef: SharedDataDefinition,
			dialogId: string,
		};
		"SHARED_DIALOG_UPDATE" : {
			name: string;
			data: object;
			dialogId: string;
		};
	}
}

Hooks.on("socketsReady", (sm) => {
	sm.setHandler("SHARED_DIALOG_START", function (data, payload) { SharedDialog.onRemoteStartMsg(data, payload);});
	sm.setHandler("SHARED_DIALOG_UPDATE", function (data, payload) { SharedDialog.onRemoteUpdate(data, payload);});
});

export class SharedDialog<const T extends SharedDataDefinition = SharedDataDefinition> {
	private _dialog: U<Dialog>;
	private _data: SharedDataType<T>;
	private id: string;
	private name: string;
	private suspended: boolean = false;
	private _definition: T;
	private resolver : (data:SharedDataType<T>) => void;
	private terminated : boolean = false;
	private reject : (reason: unknown ) => void;
	/** if true then return data*/
	private _breakout : (data: SharedDataType<T>) => boolean; 
	static socketManager : SocketManager;
	static activeSessions: Map<string, SharedDialog> = new Map();

	constructor (definition: T, name: string) {
		this._definition = definition;
		this.name = name;
		this._data = this.generateDefaultData();
		this.id = SharedDialog.generateId();
	}

	static generateId() : string {
		return game.user.name + Date.now();
	}

	static init (socketManager: SocketManager) {
		this.socketManager = socketManager;
	}

	static onRemoteStartMsg( data: SocketMessage["SHARED_DIALOG_START"], _payload : SocketPayload<"SHARED_DIALOG_START">) {
		const SD = new SharedDialog(data.dataDef, data.name);
		void SD.open( (_data) => SD.isTerminated());
		this.activeSessions.set(data.dialogId, SD);
	}

	static onRemoteUpdate( data: SocketMessage["SHARED_DIALOG_UPDATE"], _payload : SocketPayload<"SHARED_DIALOG_UPDATE">) {
		const session = this.activeSessions.get(data.dialogId);
		if (!session) {
			throw new Error(`Can't find session ${data.dialogId}`);
		}
		session.onRemoteDataUpdate(data.data as SharedDataType<SharedDataDefinition>);
	}

	isTerminated() : boolean {
		return this.terminated;
	}

	onRemoteDataUpdate(data: SharedDataType<T>) {
		this._data = data;
		if (this._dialog) {
			this._dialog.render(false);
		}
	}

	generateDefaultData() : SharedDataType<T> {
		return HTMLTools.generateDefaultData(this._definition);
	}

	isOpen() : boolean {
		return this._dialog != undefined && !(this._data && this.suspended);
	}

	setListeners(html : string | JQuery | HTMLElement) : void {
		if (typeof html == "string") {
			html = $(html);
		}
		if (html instanceof HTMLElement) {
			html = $(html);
		}
		html.find('input[name], select[name]').on("change", () => this.refreshData(html));
	}

	private _openDialog() {
		if (this._dialog && !this.isTerminated()) {
			this._dialog.render(true);
		}
	}

	closeDialog() {
		if (this._dialog) {
			const dialog = this._dialog;
			this._dialog = undefined;
			dialog.close();
		}
		this.terminated = true;
	}

	generateHTML() : string {
		return HTMLTools.generateFormHTML(this._definition, this._data);
	};

	public async open( breakoutFn : typeof this._breakout, _options : SharedDialogOptions = {}) : Promise<SharedDataType<T>> {
		this._breakout = breakoutFn;
		const content = this.generateHTML();
		if (this._dialog == undefined) {
			this._dialog = new Dialog( {
				title: this.name,
				content,
				render: (html) => this.setListeners(html),
				buttons: {},
				close: () => void (this.isOpen() ? this._openDialog() : this.closeDialog()),
			}, {});
			this._openDialog();
		}
		const promise : Promise <SharedDataType<T>>= new Promise ( (res, rej) => {
			this.resolver = res;
			this.reject = rej;
		});
		const data= await promise;
		this.closeDialog();
		this.terminated = true;
		SharedDialog.activeSessions.delete(this.id);
		return data;
	}

	private refreshData(jquery: JQuery) {
		this._data = HTMLTools.collectFormValues(jquery) as SharedDataType<T>;
		this.sendData();
		if (this._breakout( this._data)) {
			this.resolver(this._data);
			this.closeDialog();
		}
	}

	private sendData() {
		const data = this._data;
	}

}

type SharedDialogOptions = object;

type SharedDataDefinition = HTMLDataInputDefinition;

type SharedDataType<T extends SharedDataDefinition> = HTMLInputReturnType<T>;




async function testSD() {
const x = new SharedDialog( 
	{ "x" : {
		label: "Some Number",
		type: "number",
		choices: [1,2],
		default: 2,
	},
		"bool": {
			label: "boolean",
			type: "boolean",
			default: false,
		}
	}
	, "My Dialog");

	return await x.open( (data) => data.x != 2);
}

//@ts-expect-error adding to global
window.testSD = testSD;
