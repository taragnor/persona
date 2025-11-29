import {PersonaActor} from "../actor/persona-actor.js";
import {Encounter} from "../exploration/random-encounters.js";
import {Metaverse} from "../metaverse.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {PersonaRegion} from "../region/persona-region.js";
import {sleep, waitUntilTrue} from "../utility/async-wait.js";
import {CreateToken} from "../utility/createToken.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {PersonaCombat} from "./persona-combat.js";

export class CombatScene {
	static instance : U<CombatScene>;
	_previous : Scene["id"];
	encounter: Encounter;
	promiseData: U<{resolve: (value: unknown) => unknown, reject: (reason ?: unknown) => unknown}>;
	combatOver : boolean = false;
	region: U<PersonaRegion>;

	constructor (previous: Scene, encounter: Encounter) {
		this._previous= previous.id;
		this.encounter= encounter;
	}

	get previous()  : PersonaScene {
		return game.scenes.get(this._previous) as PersonaScene;
	}

	async resolve() : Promise<EncounterResult> {
		await this.scene.setFlag("persona", "previousScene", this._previous);
		await this.setupCombat();
		const promise = new Promise( (res, rej) => {
			this.promiseData = {resolve: res, reject: rej};
			setTimeout( () => this.checkCombatOver(), 1000);
		});
		if (game.combat) {
			await game.combat.startCombat();
		}
		try {
			await promise;
		} catch  {
			return false;
		}
		return true;
	}

	async setupCombat() {
		const scene= this.scene;
		await scene.activate();
		await scene.view();
		await waitUntilTrue( () => game.scenes.current == scene && game.canvas.scene == scene && game.canvas.ready);
		const gridsize = scene.grid.size;
		const y = 6 * gridsize;
		let x = 6 * gridsize;
		const tokens : Token<PersonaActor>[] = [];
		for (const shadow of this.encounter.enemies) {
			const token = await CreateToken.create(shadow, {x,y}, this.scene);
			if (token) {
				tokens.push(token.object!);
			}
			x += 4 * gridsize;
		}
		const playerTokens = this.getPlayerTokens();
		tokens.push(...playerTokens);
		await this.addTokensToCombat(tokens);
	}

	getPlayerTokens() : Token<PersonaActor>[] {
		const playerTokens = this.scene.tokens
			.filter( (x: TokenDocument<PersonaActor>)=> x.actor != undefined && (x.actor.isRealPC() || x.actor.isNPCAlly()))
		.map( t=> t._object);
		return playerTokens;
	}

	checkCombatOver() : void {
		try {
			if (this.shouldEndEncounter()) {
				if (!this.promiseData) {return;}
				this.promiseData.resolve(true);
				this.promiseData = undefined;
				return;
			}
			setTimeout(() => this.checkCombatOver(), 1000);
		} catch(e) {
			if (e instanceof Error) {
				PersonaError.softFail(e.message, e);
				if (!this.promiseData) {return;}
				this.promiseData.reject(e);
				this.promiseData = undefined;
			}
		}
	}

	shouldEndEncounter() : boolean {
		if (!this.combatOver) {return false;}
		if (this.scene.tokens.contents.some( tok => {
			if (!tok.actor) {return false;}
			if ( tok.actor.isRealPC()) { return false;}
			if ( tok.actor.isShadow()) { return false;}
			if ( tok.actor.isNPC()) { return false;}
			return true;
			//check for itemPiles
		})) {
			return false;
		}
		return true;
	}

	get scene() : PersonaScene {
		const combatScene= game.scenes.getName("Combat") as PersonaScene;
		if (!combatScene) {
			throw new PersonaError("Can't find Combat scene!");
		}
		return combatScene;
	}

	static async create(encounter: Encounter) {
		const battleChoice = await HTMLTools.confirmBox("Battle", "Start Battle Scene?");
		if (!battleChoice) {return false;}
		const previous = game.scenes.active;
		this.instance = new CombatScene(previous, encounter);
		await this.instance.resolve();
		ui.notifications.notify("Combat Encounter Resolved");
		this.instance = undefined;
	}

	async addTokensToCombat(tokens: Token<PersonaActor>[], allowDuplicates = false) {
		const combat = await this.getOrCreateCombat();
		if (!allowDuplicates) {
			tokens = tokens.filter (t => !combat.combatants.contents.some( c=> c.token == t.document));
		}
		const createData = tokens.map(t => {
			return {
				tokenId: t?.id,
				sceneId: t?.scene?.id,
				actorId: t?.document?.actorId,
				hidden: t?.document?.hidden
			};
		});
		const sanitizedData = createData.filter( x=> 
			x.tokenId && x.sceneId && x.actorId);
		if (sanitizedData.length < createData.length) {
			Debug(tokens);
			Debug(createData);
		}
		return combat.createEmbeddedDocuments("Combatant", sanitizedData);
	}

	async getOrCreateCombat() {
		let combat: U<PersonaCombat> = game.combats.viewed as PersonaCombat;
		if ( !combat ) {
			if ( game.user.isGM ) {
				//@ts-expect-error using special fn
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call
				const cls : typeof PersonaCombat = getDocumentClass("Combat") as typeof PersonaCombat;
				const state = false;
				//@ts-expect-error doesn't wnt to take scene for some reason
				combat = await cls.create({scene: canvas.scene.id, active: true}, {render: !state}) as PersonaCombat;
			} else {
				ui.notifications.warn("COMBAT.NoneActive", {localize: true});
				throw new PersonaError("No combat active");
			}
		}
		return combat;
	}

}

type EncounterResult = boolean;


Hooks.on("deleteCombat", (_combat) => {
	if (CombatScene.instance) {
		CombatScene.instance.combatOver = true;
	}
});


//@ts-expect-error global state
window.CombatScene = CombatScene;
