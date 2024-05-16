declare global {
	export interface SocketMessage {
		"TEST": string,
			"X": number,
	}

	interface HOOKS {
		"socketsReady": (x: SocketManager) => unknown;

	}
}

import { ChannelMessage } from "./socket-channel";

import { SocketChannel } from "./socket-channel.js";

export class SocketManager {
	#socketName: string;
	_socketsReady: boolean = false;
	#handlers: HandlerMap<keyof SocketMessage>= new Map();
	#channelNumber = 0;

	constructor (socketName: string, isSystem: boolean = false) {
		const namestarter = isSystem? "system" : "module";
		this.#socketName=`${namestarter}.${socketName}`;
		Hooks.on("ready",
			async () => {
				game.socket.on(this.#socketName, (x: SocketPayload<keyof SocketMessage>) => this.onMsgRecieve(x));
				console.log(`Sockets intiailized : ${this.#socketName}`);
				this._socketsReady = true;
				Hooks.callAll("socketsReady", this);
			});
	}

	get socketsReady() : boolean {
		return this._socketsReady;
	}

	/** A simple send with no confirmation that it was recieved */
	simpleSend<T extends keyof SocketMessage>(msgType: T, dataToSend: SocketMessage[T], recipientIds: string[]) : void {
		if (!game.socket.connected)  {
			const msg = "Socket Error: SOcket Not connected";
			ui.notifications.error(msg);
			throw new Error(msg);
		}
		const sessionInfo = {};
		const sPayload = {
			code: msgType,
			sender: game.user.id,
			targetInfo: sessionInfo,
			recipients: recipientIds,
			data	:dataToSend,
		}
		game.socket.emit(this.#socketName, sPayload );
	}

	setHandler<T extends keyof SocketMessage>(msgType: T, handlerFn : DataHandlerFn<T>) : void {
		if (!this.socketsReady) {
			Hooks.on("socketsReady", () => {
				this.setHandler(msgType, handlerFn);
			});
			return;
		}
		if (!this.#handlers.has(msgType)) {
			this.#handlers.set(msgType, []);
		}
		const arr = this.#handlers.get(msgType)!;
		arr.push(handlerFn);
	}

	private onMsgRecieve(packet: SocketPayload<keyof SocketMessage>) :void {
		const {code, recipients} = packet;
		if (!recipients.includes(game.user.id)) return;
		const handlers = this.#handlers.get(code);
		if (!handlers) {
			console.warn(`No handler for message ${code}`);
			return;
		}
		for (const handler of handlers) {
			handler(packet.data, packet);
		}
	}

	createChannel<T extends ChannelMessage>(linkCode: string, recipients: SocketChannel<T>["recipients"] = []) : SocketChannel<T> {
		return new SocketChannel<T>(this.#channelNumber++,linkCode, recipients);
	}


}

type SocketPayload<T extends keyof SocketMessage> = {
	code: T,
	data: SocketMessage[T],
	/** userId of sender*/
	sender: string,
	recipients: string[],
	targetInfo: SessionInfo,

};

type DataHandlerFn<T extends keyof SocketMessage> =
	(data: SocketMessage[T], payload: SocketPayload<T>) => any;


type SessionInfo = {};

type HandlerMap<T extends keyof SocketMessage> = Map<T, DataHandlerFn<T>[]>;
