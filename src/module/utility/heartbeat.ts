import { sleep } from "./async-wait.js";
import { SocketChannel } from "./socket-channel.js";
import { PersonaSockets } from "../persona.js";
import { ChannelMessage } from "./socket-channel.js";

interface HEARTBEAT_MSG extends ChannelMessage {
	"HEARTBEAT" : {
		initial: {initialTime: number},
		reply: {initialTime: number}
	}
}


export class Heartbeat {
	static LINK_CODE = "HEARTBEAT";

	sessions : SocketChannel<HEARTBEAT_MSG>[] =[];
	lastContact : Map<FoundryUser["id"], number> = new Map();

	static start() {
		Hooks.on("channelsReady", () => {
			if (game.user.isGM) {
				const heartbeatChecker = new Heartbeat();
				heartbeatChecker.initHooks();
				heartbeatChecker.mainHeartbeatLoop()
			}
			Hooks.on("newRecieverChannel", (reciever: SocketChannel<HEARTBEAT_MSG>) => {
				if (reciever.linkCode != this.LINK_CODE) {
					return;
				}
				reciever.setHandler("HEARTBEAT", async ( time) => {
					return time;
				});
			});
		});
	}

	constructor () {
		const targets = game.users.contents
			.filter (user=> !user.isGM && user.active)
		for (const target of targets) {
			const channel = PersonaSockets.createChannel<HEARTBEAT_MSG>( Heartbeat.LINK_CODE, [target.id]);
			this.sessions.push(channel);
			this.lastContact.set(target.id, 0);
		}
		console.log("Heartbeat initialized");
	}


	initHooks() {
		Hooks.on("userConnected", async (user, isConnected ) => {
			if (isConnected) {
				//User Connect
			await sleep(5000);
			const channel = PersonaSockets.createChannel<HEARTBEAT_MSG>( Heartbeat.LINK_CODE, [user.id]);
			this.sessions.push(channel);
			this.lastContact.set(user.id, 0);
			this.pingTarget(channel);
			} else {
				//USER DIsconnect
				const removed = this.sessions.filter( x => x.recipients.includes(user.id));
				this.sessions =this.sessions.filter( x => !x.recipients.includes(user.id));
				for (const session of removed) {
					session.close();
				}

			}
		});

	}

	mainHeartbeatLoop() {
		for (const session of this.sessions) {
			this.pingTarget(session);
		}
	}

	async pingTarget(session: Heartbeat["sessions"][number]) {
		while (true) {
			const target = game.users.find( x=> x.id == session.recipients[0]);
			if (!target) throw new Error("Not sending to anyone");
			console.log(`Sending Ping to ${target?.name}`);
			const initialTime= Date.now();
			const x = await session.sendInitial("HEARTBEAT", {initialTime});
			console.log(`Heartbeat: ${Date.now() - initialTime}`);
			this.lastContact.set(target.id, Date.now());
			await sleep(2000);
		}
	}

	static async onHeartbeatCheck( {time} : {time:number}) {


	}
}



