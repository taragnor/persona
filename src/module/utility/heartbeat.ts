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

	static start() {
		Hooks.on("socketsReady", () => {
			if (game.user.isGM) {
				const heartbeatChecker = new Heartbeat();
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
		}
	}


	mainHeartbeatLoop() {
		for (const session of this.sessions) {
			this.pingTarget(session);
		}
	}

	async pingTarget(session: Heartbeat["sessions"][number]) {
		while (true) {
			const initialTime= Date.now();
			const x = await session.sendInitial("HEARTBEAT", {initialTime});
			console.log(`Heartbeat: ${Date.now() - initialTime}`);
		}
	}

	static async onHeartbeatCheck( {time} : {time:number}) {


	}



}
