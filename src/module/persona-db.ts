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
		};
		Hooks.callAll("DBrefresh");
		return newCache;
	}

	clearCache() {
		this.#resetCache();
	}

	override async onLoadPacks() {
		super.onLoadPacks();
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
		if (!item) return null;
		if (item.system.type == "characterClass") {
			return item as ItemSub<"characterClass">;
		}
		throw new Error("Id ${id} points towards invalid type");
	}

	getGlobalModifiers() : UniversalModifier [] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
		return UMs.filter(um=> um.system.scope == "global");
	}

	getRoomModifiers() : UniversalModifier [] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
		return UMs
			.filter(um=> um.system.scope == "room")
			.sort ( (a,b) => a.name.localeCompare(b.name));
	}

	getSceneModifiers() : UniversalModifier [] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
		return UMs
			.filter(um=> um.system.scope == "scene")
			.sort ( (a,b) => a.name.localeCompare(b.name));
	}

	getSceneAndRoomModifiers() : UniversalModifier[] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
		return UMs
			.filter(um=> um.system.scope == "scene" || um.system.scope == "room")
			.sort ( (a,b) => a.name.localeCompare(b.name));
	}


	allPowers() : Power[] {
		if (this.#cache.powers) return this.#cache.powers;
		const items = this.allItems();
		return this.#cache.powers = items
			.filter( x=> x.system.type == "power") as Power[];
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

	shadows(): Shadow[] {
		if (this.#cache.shadows) return this.#cache.shadows;
		const actors = this.allActors();
		return this.#cache.shadows = actors
			.filter( act=> act.system.type == "shadow") as Shadow[];
	}

	tarotCards(): Tarot[] {
		if (this.#cache.tarot) return this.#cache.tarot;
		const actors = this.allActors();
		return this.#cache.tarot = actors
			.filter( actor=> actor.system.type == "tarot") as Tarot[];
	}

	treasureItems(): TreasureItem[] {
		if (this.#cache.treasureItems) return this.#cache.treasureItems;
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

	dungeonScenes(): Scene[] {
		return game.scenes.contents;
	}

	allSocialCards() :SocialCard[] {
		return this.allItems()
			.filter( x=> x.system.type == "socialCard") as SocialCard[];
	}

	socialEncounterCards(): SocialEncounterCard[] {
		return this.allSocialCards()
			.filter( x=> x.system.cardType == "social") as SocialEncounterCard[]
	}

	/** Actual PCs not counting things with just PC type like item piles and party token*/
	realPCs():  PC[] {
		return this.PCs().filter( x=> x.isRealPC());
	}

	PCs() : PC[] {
		if (this.#cache.pcs) return this.#cache.pcs;
		this.#cache.pcs=  this.allActors().filter( actor => actor.isPC()) as PC[];
		return this.#cache.pcs;
	}

	allActivities(): Activity[] {
		return this.allSocialCards()
			.filter( x=> (x.system.cardType == "job" || x.system.cardType =="training" || x.system.cardType == "recovery" || x.system.cardType == "other") ) as Activity[];
	}

	personalSocialLink(): NPC {
		return this.getActorByName("Personal Social Link") as NPC;
	}

	teammateSocialLink(): NPC {
		return PersonaDB.getActorByName("Teammate Social Link") as NPC;
	}

	socialLinks(): (PC | NPC)[] {
		if (this.#cache.socialLinks) return this.#cache.socialLinks;
		return this.#cache.socialLinks = game.actors.filter( (actor :PersonaActor) =>
			(actor.system.type == "npc"
				|| actor.system.type == "pc" )
			&& !!actor.tarot
		) as (PC | NPC)[];
	}

	skillCards(): SkillCard[] {
		return this.allItems().filter( item => item.system.type == "skillCard") as SkillCard[];
	}

	getPower(id: string) : Power | undefined {
		return this.getItemById(id) as Power | undefined;
	}

	NPCAllies() : NPCAlly[] {
		return this.allActors().filter( x=>
			x.system.type == "npcAlly") as NPCAlly[];
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
		if (!navigator) return [];
		const skills = navigator.navigatorSkills;
		return skills
			.filter( sk => sk && sk.isPassive()) as ModifierContainer[];
	}

}

export const PersonaDB = new PersonaDatabase();

//@ts-ignore
window.PersonaDB =PersonaDB;

Hooks.on("createItem", (item: PersonaItem) => {
	PersonaDB.onCreateItem(item);
});

Hooks.on("createActor", (actor : PersonaActor) => {
	PersonaDB.onCreateActor(actor);
});

type PersonaDBCache =	{
	powers: Power[] | undefined,
	shadows: Shadow[] | undefined;
	socialLinks: (PC | NPC)[] | undefined;
	treasureItems: TreasureItem[] | undefined;
	tarot: Tarot[] | undefined;
	navigator: NPCAlly | undefined;
	pcs: PC[] | undefined;
};

