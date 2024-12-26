import { SocialLink } from "./actor/persona-actor.js";
import { Weapon } from "./item/persona-item.js"
import { Shadow } from "./actor/persona-actor.js";
import { InvItem } from "./item/persona-item.js";
import { Consumable } from "./item/persona-item.js";
import { PersonaError } from "./persona-error.js";
import { Activity } from "./item/persona-item.js";
import { NPC } from "./actor/persona-actor.js";
import { UniversalModifier } from "./item/persona-item.js";
import { Job } from "./item/persona-item.js";
import { Tarot } from "./actor/persona-actor.js";
import { PersonaItem } from "./item/persona-item.js";
import { DBAccessor } from "./utility/db-accessor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { Power } from "./item/persona-item.js";
import { BASIC_PC_POWER_NAMES } from "../config/basic-powers.js";
import { BASIC_SHADOW_POWER_NAMES } from "../config/basic-powers.js";
import { SocialCard } from "./item/persona-item.js";


class PersonaDatabase extends DBAccessor<PersonaActor, PersonaItem> {

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
		return UMs.filter(um=> !um.system.room_effect);
	}

	getRoomModifiers() : UniversalModifier [] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
		return UMs.filter(um=> um.system.room_effect);
	}

	allSocialLinks() : SocialLink[] {
		return this.allActors()
		.filter( actor=> actor.system.type == "pc" || actor.system.type == "npc") as SocialLink[];
	}

	allPowers() : Power[] {
		const items = this.allItems();
		return items
		.filter( x=> x.system.type == "power") as Power[];
	}

	getBasicPower( name: typeof BASIC_SHADOW_POWER_NAMES[number] | typeof BASIC_PC_POWER_NAMES[number]) : Power | undefined {
		const power = PersonaDB.getItemByName(name) as Power | undefined;
		if (!power)  {
			PersonaError.softFail(`Can't get basic power ${name}`);
		}
		return power;
	}

	shadows(): Shadow[] {
		const actors = this.allActors();
		return actors.filter( act=> act.system.type == "shadow") as Shadow[];

	}

	tarotCards(): Tarot[] {
		const actors = this.allActors();
		return actors.filter( actor=> actor.system.type == "tarot") as Tarot[];
	}

	treasureItems(): (Weapon | InvItem | Consumable)[] {
		const items = this.allItems();
		return  items.filter ( item =>
			item.system.type == "weapon"
			|| item.system.type == "consumable"
			|| item.system.type == "item"
		) as (Weapon | InvItem | Consumable)[];
	}

	dungeonScenes(): Scene[] {
		return game.scenes.contents;
	}

	allSocialCards() :SocialCard[] {
		return this.allItems()
			.filter( x=> x.system.type == "socialCard") as SocialCard[];
	}

	allJobs(): Job[] {
		return this.allItems()
		.filter( x=> x.system.type == "job") as Job[];
	}

	allActivities(): Activity[] {
		return this.allItems()
		.filter( x=> x.system.type == "socialCard" && (x.system.cardType == "job" || x.system.cardType =="training" || x.system.cardType == "recovery" || x.system.cardType == "other") ) as Activity[];
	}

	personalSocialLink(): NPC {
		return this.getActorByName("Personal Social Link") as NPC;
	}

	teammateSocialLink(): NPC {
					return PersonaDB.getActorByName("Teammate Social Link") as NPC;
	}

	socialLinks(): PersonaActor[] {
		return game.actors.filter( (actor :PersonaActor) =>
			(actor.system.type == "npc"
			|| actor.system.type == "pc" )
			&& !!actor.system.tarot
		) as PersonaActor[];
	}

	getPower(id: string) : Power | undefined {
		return this.getItemById(id) as Power | undefined;

	}

}

export const PersonaDB = new PersonaDatabase();

//@ts-ignore
window.PersonaDB =PersonaDB;

