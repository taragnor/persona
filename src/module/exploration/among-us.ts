import { randomSelect } from "../utility/array-tools.js";
import { PersonaRegion } from "../region/persona-region.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaScene } from "../persona-scene.js";
import { HTMLTools } from "../utility/HTMLTools.js";

export class AmongUs {
	static async admin(shipScene: string | PersonaScene = (game.scenes.current as PersonaScene)): Promise<ChatMessage<any> | undefined> {
		if (typeof shipScene == "string") {
			shipScene = game.scenes.get(shipScene) as PersonaScene;
		}
		if (!game.user.isGM) {throw new Error("GM only");}
		if (!await HTMLTools.confirmBox("Show Player Locations", "Show Player Locations")) {
			return;
		}
		const tokens = this.gamePlayers(shipScene);
		const locations = tokens.map( token=> [token.name, this.getLocation(token, shipScene)] as [string, PersonaRegion]).
		map( ([s, region]) => [s, region ? region.name : "Location Unknown"] as [string, string])
		.concat ([ ["Anya", "Admin"] ])
		.map ( ([name, loc]) => `<div><b>${name}:</b> ${loc}</div>`);
		return await ChatMessage.create(  {
			speaker: {alias: "Admin Console"},
			content: `${locations.join("")}`,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		});
	}

	static getLocation (token: TokenDocument<PersonaActor>, shipScene: PersonaScene) : PersonaRegion | undefined {
		if (token.actor && token.actor.hasStatus("down")) return undefined;
		const region = shipScene.regions.find( region => {
			return region.tokens.has(token);
		});
		return region;
	};


	static alivePlayers(shipScene: PersonaScene) : TokenDocument<PersonaActor>[]  {
		return this.gamePlayers(shipScene).filter( x=> x.actor && !x.actor.hasStatus("down"));
	}

	static gamePlayers(shipScene : PersonaScene) : TokenDocument<PersonaActor>[] {
		const colors = [
			"White",
"Blue",
"Orange",
"Purple",
"Black",
"Green",
"Red",
"Pink",
		] as const;
		const tokens = colors.map( color => shipScene.tokens.find( x=> x.name.includes(color)))
			.filter(x=> x != undefined);
		return tokens;
	}

	static async getAction(token: TokenDocument<PersonaActor>, shipScene: PersonaScene) : Promise<AmongUsAction> {
		const current : AmongUsAction = token.getFlag("persona", "AmongUsAction") ?? { action: "Do Nothing"};
		switch (current.action) {
			case "Do Task":
				if (current.timeRemaining > 0) {
					current.timeRemaining -= 1;
					await this.setAction(token, current);
					return current;
				} else {
					return await this.assignNewTask(token, shipScene);
				}
			case "Move To":
				const location = this.getLocation(token, shipScene)
				if (location != undefined && location.id != current.regionId) {
					return current;
				} else {
					const task : AmongUsAction = {
						action: "Do Task",
						timeRemaining: Math.floor(Math.random() * 3 + 2),
					};
					return await this.setAction(token, task);
				}
			case "Do Nothing":
				return await this.assignNewTask(token, shipScene);
			default:
				current satisfies never;
		}
		throw new Error("Invalid Task Type");
	}

	static async setAction (token: TokenDocument<PersonaActor>, action: AmongUsAction ) : Promise<AmongUsAction>{
		await token.setFlag("persona", "AmongUsAction", action);
		return action;
	}

	static async assignNewTask(token: TokenDocument<PersonaActor>, scene: PersonaScene) : Promise<AmongUsAction> {
		const random = Math.floor(Math.random() * 6 +1);
		let action : AmongUsAction;
		switch (random) {
			case 1:
			case 2:
				action =   {
					action : "Do Nothing"
				}
				break;
			case 2:
			case 3:
			case 4:
			case 5:
			case 6:
			default:
				const target = randomSelect(scene.regions.filter( reg => reg.regionData.treasures.max >= 2)).id;
				action = {
					action: "Move To",
					regionId: target
				};
				break;
		}
		return await this.setAction(token, action);
	}

	static async printActions(scene: string | PersonaScene = game.scenes.current as PersonaScene) {
		if (!game.user.isGM) {return;}
		if (typeof scene == "string") {
			scene = game.scenes.get(scene) as PersonaScene;
		}

		let actions : [string, string][] = [];
		for (const player of this.alivePlayers(scene)) {
			const action = await this.getAction(player, scene);
			actions.push([`${player.name}`,`${this.translateAction(action, scene)}`]);

		}
		await ChatMessage.create( {
			speaker: {"alias": "Crew Actions"},
			content: actions.map( ([name, action]) => `<div> ${name}: ${action}</div>`).join(""),
			style: CONST.CHAT_MESSAGE_STYLES.WHISPER,
			whisper: [game.user],
		});

	}

static translateAction(action: AmongUsAction, scene: PersonaScene) : string {
	switch (action.action) {
		case "Do Task":
			return `Do Task (${action.timeRemaining} remaining)`;
		case "Do Nothing":
			return "Do Nothing";
		case "Move To":
			const target = scene.regions.get(action.regionId);
			return `Go To ${target?.name ?? "Region Not found"}`;
	}
}

}// end of class




type AmongUsAction = {
	action: "Do Task",
	timeRemaining: number
}
	| {
		action: "Move To",
		regionId: string,
	} | {
		action: "Do Nothing"
	};
