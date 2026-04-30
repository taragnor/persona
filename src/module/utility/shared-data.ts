import {HTMLDataInputDefinition, HTMLInputReturnType, HTMLTools} from "./HTMLTools";
import {SocketManager, SocketPayload} from "./socket-manager.js";

declare global {
	interface SocketMessage {
		"SHARED_DATA_START" : {
			name: string,
			dataDef: SharedDataDefinition,
			dialogId: string,
			userIds: User["id"][]
		};
		"SHARED_DATA_UPDATE" : {
			name: string;
			data: object;
			dialogId: string;
		};
		"SHARED_DATA_CLOSE": {
			dialogId: string;
		};
	}

}

Hooks.on("socketsReady", (sm) => {
	sm.setHandler("SHARED_DATA_START", function (data, payload) {
		SharedData.onRemoteStartMsg(data, payload);
	});
	sm.setHandler("SHARED_DATA_UPDATE", function (data, payload) {
		SharedData.onRemoteUpdate(data, payload)
		;});
	sm.setHandler("SHARED_DATA_CLOSE", function (data, payload) {
		SharedData.onCloseRequest(data, payload);
	});
	SharedData.init(sm);
});

export class SharedData<T extends SharedDataDefinition = HTMLDataInputDefinition> {
  static socketManager : SocketManager;
  private _definition: T;
  private name: string;
  private users: FoundryUser[];
  private _data: SharedDataType<T>;
  private id: string;
	static activeSessions: Map<string, SharedData> = new Map();
  //@ts-expect-error too complex for TS
  private listenerList : SharedDataListener<this>[] = [];

  constructor (definition: T, name: string, users ?: FoundryUser[], id ?: string) {
    this._definition = definition;
    this.name = name;
    this._data = this.generateDefaultData();
    this.users = users ? users : game.users.filter( x=> x.active);
		this.id = id ? id : SharedData.generateId();
  }

  get definition() {
    return this._definition;
  }

  //@ts-expect-error too complex for TS
  addListener(x:  SharedDataListener<this>) {
    this.listenerList.push(x);
  }

  private setData(newData: typeof this._data, sendUpdate: boolean) {
    this._data = foundry.utils.mergeObject(this._data, newData);
    if (sendUpdate) {
      this._sendData(game.users.filter( x=> x.active));
    }
  }

	static init (socketManager: SocketManager) {
		this.socketManager = socketManager;
	}

	private static generateId() : string {
		return game.user.name + Date.now();
	}

	onRemoteDataUpdate(remoteData: SharedDataType<T>) {
		if (remoteData == undefined) {return;}
		this.setData(remoteData, false);
    this.notifyListeners("update"); // new function to allow you to notify other objects
  }

	generateDefaultData() : SharedDataType<T> {
		return HTMLTools.generateDefaultData(this._definition);
	}


	private _sendData(users : FoundryUser[] = this.users) {
		const data = this._data;
		const payload = {
			name: this.name,
			data: data,
			dialogId: this.id,
		};
		for (const user of users) {
			void SharedData.socketManager.verifiedSend( "SHARED_DIALOG_UPDATE", payload, user.id);
		}
	}

	static onRemoteStartMsg( data: SocketMessage["SHARED_DATA_START"], _payload : SocketPayload<"SHARED_DATA_START">) {
		const users = data.userIds.map(id=> game.users.get(id))
		.filter( x=> x != undefined)
		.filter( x=> x.active);
		const SD = new SharedData(data.dataDef, data.name, users, data.dialogId);
		this.activeSessions.set(data.dialogId, SD);
    SD.notifyListeners("create");
	}

	static onRemoteUpdate( data: SocketMessage["SHARED_DATA_UPDATE"], _payload : SocketPayload<"SHARED_DATA_UPDATE">) {
		const session = this.activeSessions.get(data.dialogId);
		if (!session) {
			throw new Error(`${game.user.name} : Can't find session ${data.dialogId}`);
		}
		session.onRemoteDataUpdate(data.data as SharedDataType<SharedDataDefinition>);
	}

	static onCloseRequest( data: SocketMessage["SHARED_DATA_CLOSE"], _payload : SocketPayload<"SHARED_DATA_CLOSE">) {
		const session = this.activeSessions.get(data.dialogId);
		if (!session) {
			throw new Error(`${game.user.name} : Can't find session ${data.dialogId}`);
		}
		session.notifyListeners("close");
	}

  get data() : SharedDataType<T> {
    return this._data;
  }

  notifyListeners(action : "create" | "update" | "close") : void {
    switch (action) {
      case "create":
        this.listenerList.forEach( x=> void x.onSharedDataCreate(this._definition));
        break;
      case "update":
        this.listenerList.forEach( x=> void x.onSharedDataUpdate(this.data));
        break;
      case "close":
        this.listenerList.forEach( x=> void x.onSharedDataClose(this.data));
        break;
      default:
        action satisfies never;
        throw new Error(`Illegal Listener Action : ${action as string}`);
    }
  }

}


type SharedDataDefinition = HTMLDataInputDefinition;

type SharedDataType<T extends SharedDataDefinition> = HTMLInputReturnType<T>;


interface SharedDataListener<SD extends SharedData> {
  onSharedDataCreate(dataDef : SD["definition"] ): Promise<void>;
  onSharedDataUpdate (data: SD["data"]): Promise<void>;
  onSharedDataClose (data: SD["data"]) : Promise<void>;
}

