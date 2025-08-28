import { PersonaSettings } from "../../config/persona-settings.js";
import { sleep } from "./async-wait.js";
import { SocketChannel } from "./socket-channel.js";
import { PersonaSockets } from "../persona.js";
import { ChannelMessage } from "./socket-channel.js";

declare global {
	interface HOOKS {
		"UserNonResponsive": (user: FoundryUser, secondsSinceLastContact: number) => void;
	}
}

interface HEARTBEAT_MSG extends ChannelMessage {
	"HEARTBEAT" : {
		initial: {initialTime: number},
		reply: {initialTime: number}
	}
}

export class Heartbeat {
	static LINK_CODE = "HEARTBEAT";
	static instance : Heartbeat | undefined;

	sessions : SocketChannel<HEARTBEAT_MSG>[] =[];
	lastContact : Map<FoundryUser["id"], number> = new Map();

	static start() {
		Hooks.on("channelsReady", () => {
			if (game.user.isGM) {
				const heartbeatChecker = new Heartbeat();
				Heartbeat.instance = heartbeatChecker;
				heartbeatChecker.initHooks();
				heartbeatChecker.mainHeartbeatLoop();
				setInterval( () => {
					heartbeatChecker.refreshPlayerStatus();
				}, 3000);
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
			.filter (user=> !user.isGM && user.active);
		for (const target of targets) {
			const channel = PersonaSockets.createChannel<HEARTBEAT_MSG>( Heartbeat.LINK_CODE, [target.id]);
			this.sessions.push(channel);
			this.lastContact.set(target.id, 0);
		}
		console.log("Heartbeat initialized");
	}


	initHooks() {
		Hooks.on("userConnected", async (user, isConnected ) => {
			if (!game.user.isGM) {return;}
			if (isConnected) {
				//User Connect
				ui.notifications.notify( `${user.name} has connected`);
			await sleep(5000);
			const channel = PersonaSockets.createChannel<HEARTBEAT_MSG>( Heartbeat.LINK_CODE, [user.id]);
			this.sessions.push(channel);
			this.lastContact.set(user.id, 0);
			this.pingTarget(channel);
			} else {
				//USER DIsconnect
				ui.notifications.notify( `${user.name} has disconnected`);
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
		let notifyTime = 0;
		while (true) {
			if(!PersonaSettings.get("heartbeatOn")) {
				await sleep(20000);
				continue;
			}
			const target = game.users.find( x=> x.id == session.recipients[0]);
			if (!target) {throw new Error("Not sending to anyone");}
			// console.log(`Sending pulse to ${target.name}`);
			const initialTime= Date.now();
			try {
				const x = await session.sendInitial("HEARTBEAT", {initialTime});
				// console.log(`Heartbeat: ${Date.now() - initialTime}`);
				this.lastContact.set(target.id, Date.now());
			} catch (e) {
				const timeSinceLastContact = this.secondsUntilLastContact(target);
				if (timeSinceLastContact > 30 && notifyTime == 0) {
					Hooks.callAll("UserNonResponsive", target, timeSinceLastContact);
					notifyTime = 20;
				}
			}
			if (session.closed) {return;}
			await sleep(4000);
			if (notifyTime > 0) {
				notifyTime -= 1;
			}
		}
	}

	refreshPlayerStatus() {
		const that=  this;
		$(document).find("aside#players").find("li.player")
		.each( function f() {
			const id = $(this).data("userId") as string;
			if (!id) {throw new Error("No id for Player");}
			const user = game.users.find(x=> x.id == id);
			if (!user || user.isGM) {return;}
			const lastContact = that.secondsUntilLastContact(user);
			if (!lastContact) {return;}
			const icon = $(`<span class="connection"> ${that.getHTMLStatusIndicator(lastContact)} </span>`);
			$(this).find(".connection").remove();
			$(this).append(icon);
		});
	}



	getHTMLStatusIndicator(lastContactInSeconds: number) {
		const time = lastContactInSeconds;
		switch (true) {
			case time < 10:
				return `<i class="fa-solid fa-signal"></i>`;
			case time < 20:
				return `<i class="fa-solid fa-question"></i>`;
			default:
				return `<i class="fa-solid fa-user-large-slash"></i>`;
		}

	}

	secondsUntilLastContact(user: FoundryUser) : number {
		const lastTime = this.lastContact.get(user.id) ?? 0;
		return Math.round((Date.now() - lastTime) / 1000);
	}

}

Hooks.on("UserNonResponsive", (user, _time) => {
	ui.notifications.warn(`User ${user.name} lost connect`);
});

