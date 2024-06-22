import { Activity } from "./item/persona-item.js";
import { PC } from "./actor/persona-actor.js";
import { NPC } from "./actor/persona-actor.js";
import { UniversalModifier } from "./item/persona-item.js";
import { Job } from "./item/persona-item.js";
import { Tarot } from "./actor/persona-actor.js";
import { PersonaItem } from "./item/persona-item.js";
import { DBAccessor } from "./utility/db-accessor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { ModifierContainer } from "./item/persona-item.js";
import { Power } from "./item/persona-item.js";
import { BASIC_POWER_NAMES } from "../config/basic-powers.js";
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

	allPowers() : Power[] {
		const items = this.allItems();
		return items
		.filter( x=> x.system.type == "power") as Power[];
	}

	getBasicPower( name: typeof BASIC_POWER_NAMES[number]) : Power | undefined {
		return PersonaDB.getItemByName(name) as Power | undefined;
	}

	tarotCards(): Tarot[] {
		const actors = this.allActors();
		return actors.filter( actor=> actor.system.type == "tarot") as Tarot[];
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
		.filter( x=> x.system.type == "job") as Activity[];
	}

	personalSocialLink(): NPC {
		return this.getActorByName("Personal Social Link") as NPC;
	}

	teammateSocialLink(): NPC {
					return PersonaDB.getActorByName("Teammate Social Link") as NPC;
	}

	socialLinks(): PersonaActor[] {
		return game.actors.filter( (actor :PersonaActor)=> 
			(actor.system.type == "npc"
			|| actor.system.type == "pc" )
			&& !!actor.system.tarot
		) as PersonaActor[];
	}

}

export const PersonaDB = new PersonaDatabase();

//@ts-ignore
window.PersonaDB =PersonaDB;
