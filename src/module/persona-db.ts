import { TarotCard } from "../config/tarot.js";
import { TreasureItem } from "./metaverse.js";
import { SkillCard } from "./item/persona-item.js";
import { NPCAlly } from "./actor/persona-actor.js";
import { SocialEncounterCard } from "./social/persona-social.js";
import { ModifierContainer } from "./item/persona-item.js";
import { PC } from "./actor/persona-actor.js";
import { Shadow } from "./actor/persona-actor.js";
import { PersonaError } from "./persona-error.js";
import { Activity } from "./item/persona-item.js";
import { NPC } from "./actor/persona-actor.js";
import { UniversalModifier } from "./item/persona-item.js";
import { Tarot } from "./actor/persona-actor.js";
import { PersonaItem } from "./item/persona-item.js";
import { DBAccessor } from "./utility/db-accessor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { Power } from "./item/persona-item.js";
import { BASIC_PC_POWER_NAMES } from "../config/basic-powers.js";
import { BASIC_SHADOW_POWER_NAMES } from "../config/basic-powers.js";
import { SocialCard } from "./item/persona-item.js";


declare global {
	interface HOOKS {
		"DBrefresh": () => unknown,
	}
}

class PersonaDatabase extends DBAccessor<PersonaActor, PersonaItem> {

	#cache: PersonaDBCache;
	navigator: NPC | PC;
	failLog: Map<string, string>;


	constructor() {
		super();
		this.#resetCache();
		this.failLog = new Map();
	}

	#resetCache() : PersonaDBCache {
		const newCache =  this.#cache = {
			powers: undefined,
			shadows: undefined,
			socialLinks: undefined,
			treasureItems: undefined,
			tarot: undefined,
			navigator: undefined,
			pcs: undefined,
			teammateSocialLink: undefined,
			personalSocialLink: undefined,
			NPCAllies: undefined,
			sceneModifiers: undefined,
			worldModifiers: undefined,
			worldPassives: undefined,
			worldDefensives: undefined,
		};
		Hooks.callAll("DBrefresh");
		return newCache;
	}

	clearCache() {
		this.#resetCache();
	}

	override async onLoadPacks() {
		await super.onLoadPacks();
		this.#resetCache();
	}

	onCreateActor(_actor :PersonaActor) {
		this.#resetCache();
	}

	onCreateItem(_item: PersonaItem) {
		this.#resetCache();
	}

	getClassById(id: string): Option<ItemSub<"characterClass">> {
		const item = this.getItemById(id);
		if (!item) {return null;}
		if (item.system.type == "characterClass") {
			return item as ItemSub<"characterClass">;
		}
		throw new Error("Id ${id} points towards invalid type");
	}

	getGlobalDefensives(): readonly UniversalModifier [] {
		if (this.#cache.worldDefensives == undefined) {
		this.#cache.worldDefensives = this.getGlobalModifiers()
				.filter(um=> um.hasDefensiveEffects(null));
		}
		return this.#cache.worldDefensives;
	}

	getGlobalPassives() : readonly UniversalModifier [] {
		if (this.#cache.worldPassives == undefined) {
		this.#cache.worldPassives = this.getGlobalModifiers()
				.filter(um=> um.hasPassiveEffects(null));
		}
		return this.#cache.worldPassives;
	}

	getGlobalModifiers() : readonly UniversalModifier [] {
		if (this.#cache.worldModifiers == undefined) {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
		this.#cache.worldModifiers = UMs.filter(um=> um.system.scope == "global");
		}
		return this.#cache.worldModifiers;
	}

	getRoomModifiers() : readonly UniversalModifier [] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
		return UMs
			.filter(um=> um.system.scope == "room")
			.sort ( (a,b) => a.name.localeCompare(b.name));
	}

	getSceneModifiers() : readonly UniversalModifier [] {
		if (this.#cache.sceneModifiers == undefined) {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
			this.#cache.sceneModifiers = UMs
			.filter(um=> um.system.scope == "scene")
			.sort ( (a,b) => a.name.localeCompare(b.name));
		}
		return this.#cache.sceneModifiers;
	}

	getSceneAndRoomModifiers() : readonly UniversalModifier[] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
		return UMs
			.filter(um=> um.system.scope == "scene" || um.system.scope == "room")
			.sort ( (a,b) => a.name.localeCompare(b.name));
	}


	allPowersArr(): readonly Power[] {
		return Array.from(this.allPowers().values());
	}

	allPowers() : Map<string, Power> {
		if (this.#cache.powers) {return this.#cache.powers;}
		// const items = this.allItems();
		// return this.#cache.powers =
		const items = this.allItems()
			.filter( x=> x.system.type == "power")
			.map( pwr => [pwr.id, pwr]) as [string, Power][];
		return this.#cache.powers = new Map(items);
	}

	getBasicPower( name: typeof BASIC_SHADOW_POWER_NAMES[number] | typeof BASIC_PC_POWER_NAMES[number]) : Power | undefined {
		const power = PersonaDB.getItemByName(name) as Power | undefined;
		if (!power && !this.failLog.has(name))  {
			const msg =`Can't get basic power ${name}`;
			this.failLog.set(name, msg);
			PersonaError.softFail(msg);
		}
		return power;
	}

	shadows(): readonly Shadow[] {
		if (this.#cache.shadows) {return this.#cache.shadows;}
		const actors = this.allActors();
		return this.#cache.shadows = actors
			.filter( act=> act.system.type == "shadow") as Shadow[];
	}

	tarotCards(): readonly Tarot[] {
		if (this.#cache.tarot) {return this.#cache.tarot;}
		const actors = this.allActors();
		return this.#cache.tarot = actors
			.filter( actor=> actor.system.type == "tarot") as Tarot[];
	}

	getSocialLinkByTarot(tarotCardNameOrId: TarotCard | (Tarot["id"] & {})) : U<NPC | PC> {
		return this.socialLinks()
		.find( x=> x.tarot
			&& (
				x.tarot.name == tarotCardNameOrId
				|| x.tarot.id == tarotCardNameOrId
			)
		);
	}

	treasureItems(): readonly TreasureItem[] {
		if (this.#cache.treasureItems) {return this.#cache.treasureItems;}
		const items = this.allItems();
		this.#cache.treasureItems =
			this.#cache.treasureItems = items
			.filter ( item =>
				item.system.type == "weapon"
				|| item.system.type == "consumable"
				|| item.system.type == "item"
			)
			.filter( (x : TreasureItem)=> !x.hasTag("key-item") && !x.hasTag("mundane")) as TreasureItem[];
		return this.#cache.treasureItems;
	}

	dungeonScenes(): readonly Scene[] {
		return game.scenes.contents;
	}

	allSocialCards() :readonly SocialCard[] {
		return this.allItems()
			.filter( x=> x.system.type == "socialCard") as SocialCard[];
	}

	socialEncounterCards(): readonly SocialEncounterCard[] {
		return this.allSocialCards()
			.filter( x=> x.system.cardType == "social") as SocialEncounterCard[];
	}

	/** Actual PCs not counting things with just PC type like item piles and party token*/
	realPCs(): readonly  PC[] {
		return this.PCs().filter( x=> x.isRealPC());
	}

	PCs() : readonly PC[] {
		if (this.#cache.pcs) {return this.#cache.pcs;}
		this.#cache.pcs=  this.allActors().filter( actor => actor.isPC() && actor.hasPlayerOwner) as PC[];
		return this.#cache.pcs;
	}

	allActivities(): readonly Activity[] {
		return this.allSocialCards()
			.filter( x=> (x.system.cardType == "job" || x.system.cardType =="training" || x.system.cardType == "recovery" || x.system.cardType == "other") );
	}

	personalSocialLink(): NPC {
		if (!this.#cache.personalSocialLink) {
			this.#cache.personalSocialLink = this.getActorByName("Personal Social Link") as NPC;
		}
		return this.#cache.personalSocialLink;
	}

	teammateSocialLink(): NPC {
		if (!this.#cache.teammateSocialLink) {
			this.#cache.teammateSocialLink =  PersonaDB.getActorByName("Teammate Social Link") as NPC;
		}
		return this.#cache.teammateSocialLink;
	}

	socialLinks(): readonly (PC | NPC)[] {
		if (this.#cache.socialLinks) {return this.#cache.socialLinks;}
		return this.#cache.socialLinks = game.actors.filter( (actor :PersonaActor) =>
			(actor.system.type == "npc"
				|| actor.system.type == "pc" )
			&& Boolean(actor.tarot)
		) as (PC | NPC)[];
	}

	skillCards(): readonly SkillCard[] {
		return this.allItems().filter( item => item.system.type == "skillCard") as SkillCard[];
	}

	getPower(id: Power["id"]) : Power | undefined {
		return this.getItemById(id) as Power | undefined;
	}

	NPCAllies() : readonly NPCAlly[] {
		if (this.#cache.NPCAllies == undefined) {
			this.#cache.NPCAllies = this.allActors().filter( x=>
				x.system.type == "npcAlly") as NPCAlly[];
		}
		return this.#cache.NPCAllies;
	}

	getNavigator() : NPCAlly | undefined {
		if (!this.#cache.navigator) {
			const navigator = this.NPCAllies().find( ally => ally.system.combat.isNavigator);
			this.#cache.navigator = navigator;
		}
		return this.#cache.navigator;
	}

	navigatorModifiers(): ModifierContainer[] {
		const navigator = this.getNavigator();
		if (!navigator) {return [];}
		const skills = navigator.navigatorSkills
			.filter(sk => sk.isPassive());
		return skills as ModifierContainer[];
	}

	PersonaableShadowsOfArcana(min: number, max: number) : Shadow[] {
		const shadows = this.allActors()
			.filter ( x=> x.isShadow()
				&& !x.hasCreatureTag("d-mon")
				&& x.persona().isEligibleToBecomePersona()
				&& x.persona().level >= min
				&& x.persona().level <= max
			)
			.sort( (a,b) => (b.tarot?.displayedName ?? "").localeCompare(a.tarot?.displayedName ?? ""));
		for (const shadow of shadows) {
			console.log(`${shadow.name} (${shadow.tarot?.displayedName ?? "No Tarot"})`);
		}
		return shadows as Shadow[];
	}
}

export const PersonaDB = new PersonaDatabase();

//@ts-expect-error adding to global objects
window.PersonaDB =PersonaDB;

Hooks.on("createItem", (item: PersonaItem) => {
	PersonaDB.onCreateItem(item);
});

Hooks.on("createActor", (actor : PersonaActor) => {
	PersonaDB.onCreateActor(actor);
});

type PersonaDBCache =	{
	powers: Map<Power["id"], Power> | undefined,
	shadows: Shadow[] | undefined;
	socialLinks: (PC | NPC)[] | undefined;
	treasureItems: TreasureItem[] | undefined;
	tarot: Tarot[] | undefined;
	navigator: NPCAlly | undefined;
	pcs: PC[] | undefined;
	teammateSocialLink: NPC | undefined;
	personalSocialLink: NPC | undefined;
	NPCAllies: U<NPCAlly[]>;
	sceneModifiers: U<UniversalModifier[]>;
	worldModifiers: U<UniversalModifier[]>;
	worldPassives: U<UniversalModifier[]>;
	worldDefensives: U<UniversalModifier[]>;
};

