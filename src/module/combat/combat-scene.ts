import {PersonaActor} from "../actor/persona-actor.js";
import {Encounter} from "../exploration/random-encounters.js";
import {BattleTreasure, EnchantedTreasureFormat} from "../exploration/treasure-system.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {PersonaRegion} from "../region/persona-region.js";
import {waitUntilTrue} from "../utility/async-wait.js";
import {CreateToken} from "../utility/createToken.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {PersonaCombat, StartCombatOptions} from "./persona-combat.js";

export class CombatScene {
	static instance : U<CombatScene>;
	_previous : Scene["id"];
	encounter: Pick<Encounter, "enemies">;
	promiseData: U<{resolve: (value: unknown) => unknown, reject: (reason ?: unknown) => unknown}>;
	combatOver : boolean = false;
	region: U<PersonaRegion>;

	constructor (previous: Scene, encounter: Pick<Encounter, "enemies">) {
		this._previous = previous.id;
		this.encounter = encounter;
	}

	get previous()  : PersonaScene {
		return game.scenes.get(this._previous) as PersonaScene;
	}

	async resolve(options :CombatSetupOptions = {}) : Promise<EncounterResult> {
		await this.scene.setFlag("persona", "previousScene", this._previous);
		await this.setupCombat();
		const promise = new Promise( (res, rej) => {
			this.promiseData = {resolve: res, reject: rej};
			setTimeout( () => this.checkCombatOver(), 1000);
		});
		if (!PersonaCombat.combat) {
			throw new PersonaError("Couldn't find Combat");
		}
		const combatOptions = this.getCombatOptions(options);
		await PersonaCombat.combat.startCombat(combatOptions);
		try {
			await promise;
		} catch  {
			return false;
		}
		return true;
	}

	getCombatOptions(options: CombatSetupOptions) : StartCombatOptions {
		const combatOptions :StartCombatOptions = {
		};
		const mods : UniversalModifier["id"][] = [];
		combatOptions.roomMods = mods;
		switch (options.advantage) {
			case undefined:
				break;
			case "shadows": {
				const ambush = PersonaDB.shadowAmbush();
				if (ambush) {
					mods.push(ambush.id);
				}
				break;
			}
			case "PCs": {
				const PCAmbush = PersonaDB.PCAmbush();
				if (PCAmbush) {
					mods.push(PCAmbush.id);
				}
				break;
			}
		}
		return combatOptions;
	}

	async setupCombat() {
		const scene= this.scene;
		await scene.activate();
		await scene.view();
		await waitUntilTrue( () => game.scenes.current == scene && game.canvas.scene == scene && game.canvas.ready);
		const tokens : Token<PersonaActor>[] = await this.setupShadows();
    const playerTokens = await this.setupPCs();
		tokens.push(...playerTokens);
		await this.addTokensToCombat(tokens);
	}

  private async setupShadows() : Promise<Token<PersonaActor>[]> {
		const INITIAL_OFFSET = { x: 6, y: 6} as const;
		const SPACING_BLOCKS = 4 as const;
		const gridsize = this.scene.grid.size;
		let x = INITIAL_OFFSET.x * gridsize;
		const y = INITIAL_OFFSET.y * gridsize;
		const tokens : Token<PersonaActor>[] = [];
		for (const shadow of this.encounter.enemies) {
			const token = await CreateToken.create(shadow, {x,y}, this.scene);
			if (token) {
				tokens.push(token.object!);
			}
			x += SPACING_BLOCKS * gridsize;
		}
    return tokens;
  }

  private async setupPCs() : Promise<Token<PersonaActor>[]> {
    this.clearUnusedPartyMembers();
		const playerTokens = await this.getPlayerTokens();
		const INITIAL_OFFSET = { x: 6, y: 12} as const;
		const SPACING_BLOCKS = 4 as const;
		const gridsize = this.scene.grid.size;
		let x = INITIAL_OFFSET.x * gridsize;
		const y = INITIAL_OFFSET.y * gridsize;

    for (const token of playerTokens) {
      await token.document.update( {x, y});
			x += SPACING_BLOCKS * gridsize;
    }
    return playerTokens;
  }

  async getPlayerTokens() : Promise<Token<PersonaActor>[]> {
    const PCParty = PersonaDB.activePCParty();
    for (const pc of PCParty) {
      if (!this.scene.tokens.contents.some(tok => tok.actor == pc)) {
        await CreateToken.create(pc, {x: 200, y: 200}, this.scene);
      }
    }
    const playerTokens = PCParty
    .map( actor => this.scene.tokens.find( tok => tok.actor == actor))
    // .filter( (x: TokenDocument<PersonaActor>)=> x.actor != undefined && (x.actor.isRealPC() || x.actor.isNPCAlly()))
    .filter ( t=> t != undefined)
    .map( t=> t._object);
    return playerTokens;
  }

  clearUnusedPartyMembers() {
    const PCParty = PersonaDB.activePCParty();
    this.scene.tokens
      .filter( tok => tok.actor != undefined && tok.actor?.isNPCAlly() && !PCParty.includes( tok.actor))
      .forEach( tok=> void tok.delete());
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

	static get scene() : PersonaScene {
		const combatScene= game.scenes.getName("Combat") as PersonaScene;
		if (!combatScene) {
			throw new PersonaError("Can't find Combat scene!");
		}
		return combatScene;
	}

	get scene() : PersonaScene {
		return CombatScene.scene;
	}

	static async create(encounter: Encounter, options: CombatSetupOptions = {}) {
		const battleChoice = await HTMLTools.confirmBox("Battle", "Start Battle Scene?");
		if (!battleChoice) {return false;}
		const previous = game.scenes.active;
		this.instance = new CombatScene(previous, encounter);
		await this.instance.resolve(options);
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

  static async createTreasure(treasure: BattleTreasure) {
    if (game.scenes.current != this.scene)  {
      return;
    }
    if (game.itempiles == undefined) {
      PersonaError.softFail("No item piles, can't create treasures");
      return;
    }
    const gridsize = this.scene.grid.size;
    const cr = this.scene.dimensions.sceneRect;
    const center =  {
      x: Math.floor( (cr.x + cr.width)  / 2 / gridsize) * gridsize,
      y: Math.floor( (cr.y + cr.height) / 2 / gridsize) * gridsize,
    };
    if (treasure.items.length == 0) {
      return;
    }
    const pile = await game.itempiles.API.createItemPile({position:center});
    const pileActor = await foundry.utils.fromUuid(pile.tokenUuid) as TokenDocument<PersonaActor> ;
    if (!pileActor || !(pileActor instanceof TokenDocument) || !pileActor.actor) {
      PersonaError.softFail(`Cant' find token ${pile?.tokenUuid}`);
      return;
    }
    for (const item of treasure.items) {
      const itemFormatted : EnchantedTreasureFormat = {
        item: item.accessor,
        enchantments: [],
      };
      await pileActor.actor.addTreasureItem(itemFormatted);
    }
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


export interface CombatSetupOptions {
	/** for ambushes */
	advantage ?: "PCs" | "shadows",
}
