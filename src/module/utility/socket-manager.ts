declare global {
	export interface SocketMessage {
		"TEST": string;
		"X": number;
		"__VERIFY__": VerificationId;
		"__VERIFY_ERROR__": VerificationId
	}

	interface HOOKS {
		"socketsReady": (x: SocketManager) => unknown;

	}
}

import {PersonaError} from "../persona-error.js";
import {sleep} from "./async-wait.js";
import { ChannelMessage } from "./socket-channel.js";

import { SocketChannel } from "./socket-channel.js";

export class SocketManager {
	#socketName: string;
	_socketsReady: boolean = false;
	#handlers: HandlerMap<keyof SocketMessage>= new Map();
	// #channelNumber = 0;

	#messageId: 1;

	_handledVerifications: Map<User["id"], Set<VerificationId>> = new Map();
	_pendingVerifications: Map<User["id"], Map<VerificationId, PromiseData>> = new Map();


	constructor (socketName: string, isSystem: boolean = false) {
		const namestarter = isSystem? "system" : "module";
		this.#messageId = 1;
		this.#socketName=`${namestarter}.${socketName}`;
		Hooks.on("ready",
			() => {
				game.socket.on(this.#socketName, (x: SocketPayload<keyof SocketMessage>) => this.onMsgRecieve(x));
				console.debug(`Sockets intiailized : ${this.#socketName}`);
				this._socketsReady = true;
				Hooks.callAll("socketsReady", this);
				this.setHandler("__VERIFY__", (verificationId, payload) => this.clearPending(verificationId, payload.sender) );
			});
				this.setHandler("__VERIFY_ERROR__", (verificationId, payload) => this.clearPendingErr(verificationId, payload.sender) );
	}

	get socketsReady() : boolean {
		return this._socketsReady;
	}

	#checkSockets(): void {
		if (!game.socket.connected)  {
			const msg = "Socket Error: Socket Not connected";
			ui.notifications.error(msg);
			throw new SocketsNotConnectedError(msg);
		}
	}

	newMessageId() : number {
		const id = this.#messageId  ;
		this.#messageId += 1;
		if (typeof id == "number" && !Number.isNaN(id))
			{return id;}
		throw new Error("Something screwy with Id");
	}

	/** A simple send with no confirmation that it was recieved */
	simpleSend<T extends keyof SocketMessage>(msgType: T, dataToSend: SocketMessage[T], recipientIds: string[]) : void {
		this.#checkSockets();
		const sessionInfo = {};
		const sPayload = {
			code: msgType,
			sender: game.user.id,
			targetInfo: sessionInfo,
			recipients: recipientIds,
			data	:dataToSend,
		};
		game.socket.emit(this.#socketName, sPayload );
	}

	/** as simple send but returns a boolean as a promise if the message was recieved*/
	async verifiedSend<T extends keyof SocketMessage>(msgType: T, dataToSend: SocketMessage[T], recipient: string) : Promise<boolean> {
		if (recipient == game.user.id) {return true;}
		this.#checkSockets();
		const sessionInfo = {};
		const sPayload = {
			code: msgType,
			sender: game.user.id,
			targetInfo: sessionInfo,
			recipients: [recipient],
			verificationId: this.newMessageId(),
			data: dataToSend,
		};
		game.socket.emit(this.#socketName, sPayload );
		// console.debug(`Initial: Verified Send out ${sPayload.verificationId}`);
		let killTimeout = false;
		const p = new Promise( (resolve, reject) => {
			this.setPending( sPayload.verificationId, recipient, { resolve, reject});
			let timeoutCount = 10;
			const timeout  = () => {
				if (killTimeout) {return;}
				if (timeoutCount-- <= 0) {
					reject(new TimeoutError(`Time out ${sPayload.verificationId}!`));
					return;
				}
				game.socket.emit(this.#socketName, sPayload );
				const user = game.users.get(recipient);
				ui.notifications.notify(`Trouble sending data to remote client ${user?.name}, retrying....`);
				setTimeout(timeout, 3000);
			};
			setTimeout(timeout, 3000);
		});
		try {
			await p;
			//clear out pending
		} catch {
			return false;
		}
		killTimeout = true;
		return true;
	}


	setPending(verificationId: VerificationId, recipient: User["id"], promiseData: PromiseData)
	{
		const r = recipient;
		if (!this._pendingVerifications.has(r))
		{this._pendingVerifications.set(r, new Map());}
		const map = this._pendingVerifications.get(r)!;
		map.set(verificationId, promiseData);
	}


	clearPendingErr(verificationId: VerificationId, sender: User["id"]) {
		const realClear = this.clearPending(verificationId, sender);
		if (realClear) {
			console.warn(`Verification Error Received from ${sender}`);
			// throw new VerificationFailedError(`Verification Failed! verificationId: ${verificationId} Sender: ${sender}`);
		}
	}

	clearPending(verificationId: VerificationId, sender: User["id"]) : boolean {
		const user = game.users.get(sender);
		// console.debug(`Initial: Verification Msg recieved ${verificationId} from ${user?.name}, clearing log`);
		const userPending = this._pendingVerifications.get(sender)!;
		const pendingProm = userPending.get(verificationId);
		if (pendingProm == undefined) {return false;}
		pendingProm.resolve(true);
		console.debug(`resolved ${verificationId} from ${user?.name}, clearing log`);
		userPending.delete(verificationId);
		return true;
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

private async onMsgRecieve(packet: SocketPayload<keyof SocketMessage>) : Promise<void> {
	const {code, recipients} = packet;
	if (!recipients.includes(game.user.id)) {return;}
	if (packet.sender == game.user.id) {return;}
	const handlers = this.#handlers.get(code);
	if (!handlers) {
		console.warn(`No handler for message ${code}`);
		return;
	}
	if (this.#recordVerifiedMessage(packet)) {return;}
	for (const handler of handlers) {
		try{
			await handler(packet.data, packet);
			void this.#sendVerification(packet);
		} catch (e) {
			PersonaError.softFail("Error during handler", e);
			void this.#sendVerificationError(packet);
			continue;
		}
	}
}

/** returns true if this message has already been verified, to prevent invoking the handler for an alrady handled request */
#recordVerifiedMessage(packet: SocketPayload<keyof SocketMessage>)  : boolean {
	const verificationId = packet.verificationId;
	if (verificationId == undefined)  {return false;}
	const sender = packet.sender;

	if( !this._handledVerifications.has(sender)) {
		this._handledVerifications.set(sender, new Set());
	}
	const handledSet = this._handledVerifications.get(sender)!;
	if (handledSet.has(verificationId)) {return true;}
	handledSet.add(verificationId);
	return false;
}

	createChannel<T extends ChannelMessage>(linkCode: string, recipients: SocketChannel<T>["recipients"] = [], _sessionCode?: number) : SocketChannel<T> {
		const channel =  new SocketChannel<T>(linkCode, recipients);
		SocketChannel.channels.push(channel);

		if (recipients.length) {
			channel.sendOpen();
		}
		return channel;
	}

async #sendVerification(packet: SocketPayload<keyof SocketMessage>) {
	const verificationId = packet.verificationId;
	if (verificationId == undefined) { return; }
	const targets = [packet.sender];
	console.debug(`Reciever: Verified Request recieved ${packet.verificationId}, sending Verification`);
	for (let i = 0; i< 10; i++) {
		this.simpleSend("__VERIFY__", verificationId, targets);
		await sleep(5000);
	}
}

async #sendVerificationError(packet: SocketPayload<keyof SocketMessage>) {
	const verificationId = packet.verificationId;
	if (verificationId == undefined) { return; }
	const targets = [packet.sender];
	console.debug(`Reciever: Error on handling Verifified Packet Request ${packet.verificationId}, sending Error Result`);
	for (let i = 0; i< 10; i++) {
		this.simpleSend("__VERIFY_ERROR__", verificationId, targets);
		await sleep (5000);
	}
}

}

export type SocketPayload<T extends keyof SocketMessage> = {
	code: T,
	data: SocketMessage[T],
	/** userId of sender*/
	verificationId ?: number,
	sender: string,
	recipients: string[],
	targetInfo: SessionInfo,

};

type DataHandlerFn<T extends keyof SocketMessage> =
	(data: SocketMessage[T], payload: SocketPayload<T>) => unknown;

type SessionInfo = object;

type HandlerMap<T extends keyof SocketMessage> = Map<T, DataHandlerFn<T>[]>;


type PromiseData = {
	resolve: (accepted: boolean) => void,
	reject: (e: Error) => void,
};

type VerificationId = ReturnType<SocketManager["newMessageId"]>;

export class TimeoutError extends Error{

};

export class VerificationFailedError extends Error{

}

export class SocketsNotConnectedError extends Error {

}
