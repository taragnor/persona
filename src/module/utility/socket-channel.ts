import { SocketManager, TimeoutError } from "./socket-manager.js";


declare global {
	interface SocketMessage {
		"CHANNEL_MESSAGE":  ChannelMessagePayload
	}
	interface HOOKS {
		"newRecieverChannel": <T extends ChannelMessage>(reciever: SocketChannel<T>) => void;
		"channelsReady": () => void;

	}
}

interface OpenChannel {
	"OPEN_CHANNEL" : undefined;
}

type ChannelMessagePayload = {
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
	channelMsgCode: (keyof ChannelMessage | keyof OpenChannel) & string;
	channelId: number;
	sessionCode: number;
	msgType: "initial" | "reply" | "open" | "close";
	data: ChannelMessage[string]["initial" | "reply"];
	sender: FoundryUser["id"];
	linkCode: SocketChannel["linkCode"];
};


export type ChannelMessage =
	{
		[k: number]: never,
		[k: symbol]: never,
		[key: string]: {
			initial: MsgObjectData,
			reply?:	MsgObjectData,
		}

	};

type MsgObjectData = undefined | string | number  |boolean | {[key:string] : MsgObjectData};


type HandlerFn<T extends ChannelMessage, K extends keyof T & string> = (data: T[K]["initial"]) => Promise <T[K]["reply"] | undefined>;



export class SocketChannel<MSGTYPE extends ChannelMessage = ChannelMessage> {
	closed= false;
	recipients: FoundryUser["id"][]= [];
	static nextId = 0;
	static socket: SocketManager;
	socket: SocketManager;
	id: number;
	linkCode: string;
	static nextSessionCode = 0;
	sessionCode: number = 0;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static channels: SocketChannel<any>[] = [];
	awaiters: Map<SocketMessage["CHANNEL_MESSAGE"]["sessionCode"], {
		res: (reply: MSGTYPE[string]["initial" | "reply"]) => void ,
		rej: (reason: unknown) => void
	}> = new Map();
	handlers: Map<keyof MSGTYPE & string, HandlerFn<MSGTYPE, keyof MSGTYPE & string>> = new Map();

	constructor (linkCode: string, recipients: SocketChannel<MSGTYPE>["recipients"], channelId?: number) {
		if (channelId == undefined) {
			channelId = SocketChannel.nextId++;
		}
		this.id = channelId;
		this.socket = SocketChannel.socket;
		this.linkCode = linkCode;
		this.recipients = recipients;
		if (!this.socket) {
			throw new Error("Sockets not started and trying to make a channel");
		}
	}

	static open<MSGTYPE extends ChannelMessage>(openerChannelId: SocketChannel<MSGTYPE>["id"], linkCode: string) {
		const channel=  new SocketChannel(linkCode, [], openerChannelId);
		SocketChannel.channels.push(channel);
		return channel;
	}


	static init() {
		Hooks.on("socketsReady", (socketManager) => {
			this.socket = socketManager;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			socketManager.setHandler("CHANNEL_MESSAGE", this.onChannelMessage.bind(this));
			Hooks.callAll("channelsReady");
		});

	}

	setHandler<T extends keyof MSGTYPE & string>( msgCode: T, replyFn: HandlerFn<MSGTYPE, T>) {
		this.handlers.set(msgCode, replyFn);
	}

	static onChannelMessage( payload: SocketMessage["CHANNEL_MESSAGE"]) : void {
		switch (payload.msgType) {
			case "open": {
				const reciever = SocketChannel.open(payload.channelId, payload.linkCode);
				Hooks.callAll("newRecieverChannel", reciever);
				console.debug("Opening Channel");
				break;
			}
		}
		const channel = this.channels.find(ch => ch.linkCode == payload.linkCode && payload.channelId == ch.id);
		if (!channel) {
			console.warn(this.channels);
			console.warn(`Recieved non-existant link Code :${payload.linkCode}`);
			console.warn(payload);
			return;
		}
		if (channel.closed) {
			channel.sendClose();
			return;
		}
		channel.onChannelMessage(payload);
	}

	onChannelMessage( payload: SocketMessage["CHANNEL_MESSAGE"]) {
		// const sessionCode = payload.sessionCode;
		switch (payload.msgType) {
			case "open":
				return;
			case "initial":
				void this.#onInitialMsg(payload.channelMsgCode, payload.data, payload);
				break;
			case "reply":
				void this.#onReplyMsg(payload.channelMsgCode, payload.data, payload);
				break;
			case "close":
				this.#closeSub();
				break;
			default:
				payload.msgType satisfies never;
		}
		throw new Error(`Unknown Payload Msg Type : ${payload.msgType}`);
	}

	async #onInitialMsg<T extends keyof MSGTYPE & string> (msgCode: T, data: MSGTYPE[T]["initial"], payload: ChannelMessagePayload) {
		const x = this.handlers.get(msgCode);
		if (!x) {
			console.warn(`No handler for ${String(msgCode)}`);
			return;
		}
		if (x) {
			const y = await x(data);
			if (y) {
				this.sessionCode = payload.sessionCode;
				this.#reply(msgCode, y, payload.sessionCode, payload.sender);
			}
		}
	}

	#onReplyMsg<T extends keyof MSGTYPE & string> (msgCode: T, data: MSGTYPE[T]["reply"], payload: ChannelMessagePayload) {
		const {sessionCode} = payload;
		const awaiter = this.awaiters.get(sessionCode);
		if (!awaiter) {
			console.warn(`No awaiter found for ${msgCode}, sessionId: ${sessionCode}`);
			return;
		}
		awaiter.res(data);
		this.awaiters.delete(sessionCode);
	}

	async sendInitial<T extends keyof MSGTYPE & string> (msgCode: T, initialMsg: MSGTYPE[T]["initial"]) : Promise<MSGTYPE[T]["reply"]> {
		if (this.closed) {
			return Promise.reject(new ChannelClosedError());
		}
		const recipients = this.recipients;
		this.sessionCode = SocketChannel.nextSessionCode++;
		return await new Promise( (res, rej) => {
			// console.log(`Creating Awaiter for :${recipients.map(id => game.users.get!(id)!.name).join(", ")} ${this.sessionCode}`);
			this.awaiters.set(this.sessionCode, {res,rej});
			this.socket.simpleSend("CHANNEL_MESSAGE", {
				channelMsgCode: msgCode,
				channelId: this.id,
				data: initialMsg,
				sessionCode: this.sessionCode,
				msgType: "initial",
				sender: game.user.id,
				linkCode: this.linkCode
			}, recipients);
			setTimeout( () => {
				rej(new TimeoutError());
			}, 8000);
		});
	}

	#reply<T extends keyof MSGTYPE & string> (msgCode: T, reply: MSGTYPE[T]["reply"], sessionCode: ChannelMessagePayload["sessionCode"], target: FoundryUser["id"] ) {
		// const recipients = this.recipients;
		this.socket.simpleSend("CHANNEL_MESSAGE", {
			channelMsgCode: msgCode,
			channelId: this.id,
			data: reply,
			sessionCode,
			msgType: "reply",
			sender: game.user.id,
			linkCode: this.linkCode
		}, [target]);
	}

	sendOpen() {
		this.socket.simpleSend("CHANNEL_MESSAGE", {
			channelMsgCode: "OPEN_CHANNEL",
			channelId: this.id,
			sessionCode: -1,
			msgType: "open",
			data: undefined,
			sender: game.user.id,
			linkCode: this.linkCode
		}, this.recipients);
	}

	sendClose() {
		this.socket.simpleSend("CHANNEL_MESSAGE", {
			channelMsgCode: "CLOSE_CHANNEL",
			channelId: this.id,
			sessionCode: this.sessionCode,
			msgType: "close",
			data: undefined,
			sender: game.user.id,
			linkCode: this.linkCode
		}, this.recipients);
	}

	close() {
		this.sendClose();
		this.#closeSub();
	}

	#closeSub() {
		this.closed = true;
		this.awaiters.forEach( awaiter => {
			awaiter.rej("Channel closed");
		});
		this.awaiters.clear();
		this.recipients = [];
		this.handlers.clear();
		this.linkCode= "";
		SocketChannel.channels = SocketChannel.channels.filter( x=> x.id == this.id);
	}

}

Hooks.on("ready", () => SocketChannel.init());


export class ChannelClosedError extends Error {
	constructor() {
		super ("Channel Closed");
	}

}
