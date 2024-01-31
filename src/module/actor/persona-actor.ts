import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { SocialStat } from "../../config/student-skills.js";
import { UniversalActorAccessor } from "../utility/db-accessor.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { PersonaError } from "../persona-error.js";
import { PersonaSounds } from "../persona-sounds.js";
import { Usable } from "../item/persona-item.js";
import { CClass } from "../item/persona-item.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { DAMAGETYPESLIST } from "../../config/damage-types.js";
import { ResistStrength } from "../../config/damage-types.js";
import { StatusEffect } from "../combat/combat-result.js";
import { ModifierList } from "../combat/modifier-list.js";
import { Talent } from "../item/persona-item.js";
import { Focus } from "../item/persona-item.js";
import { ModifierContainer } from "../item/persona-item.js";
import { InvItem } from "../item/persona-item.js";
import { Weapon } from "../item/persona-item.js";
import { Power } from "../item/persona-item.js";
import { PersonaDB } from "../persona-db.js";
import { ACTORMODELS } from "../datamodel/actor-types.js"
import { PersonaItem } from "../item/persona-item.js"
import { PersonaAE } from "../active-effect.js";


declare global {
	type ActorSub<X extends PersonaActor["system"]["type"]> = Subtype<PersonaActor, X>;
}

export class PersonaActor extends Actor<typeof ACTORMODELS, PersonaItem, PersonaAE> {

	async createNewItem() {
		return (await this.createEmbeddedDocuments("Item", [{"name": "Unnamed Item", type: "item"}]))[0];
	}

	get inventory() : ItemSub<"weapon" | "item">[] {
		return this.items.filter( x=> x.system.type == "item" || x.system.type == "weapon") as ItemSub<"weapon" | "item">[];
	}

	get displayedName() : string {
		return this.name;
	}

	get init() : number {
		const combat = game.combat as Combat<PersonaActor>;
		if (!combat) {
			throw new PersonaError("Can't get initiative when not in combat!");
		}
		if (combat.combatants.contents.some( x=> x.actor && x.actor.system.type =="shadow")) {
			return this.combatInit;
		}
		return this.socialInit;
	}

	get socialInit(): number {
		if (this.system.type != "pc") return -999;
		return (this as PC).getSocialStat("courage").total({user:(this as PC).accessor});
	}

	get combatInit(): number {
		switch (this.system.type) {
			case "npc":
				return -5;
			case "shadow":
			case "pc":
				const actor = this as (Shadow | PC);
				return actor.getDefense("ref").total( {user:actor.accessor});
			default:
				this.system satisfies never;
				throw new PersonaError(`Unepxected Type : ${this.type}`);
		}
	}

	get accessor() : UniversalActorAccessor<typeof this> {
		return PersonaDB.getUniversalActorAccessor(this);
	}

	get class() : Subtype<PersonaItem, "characterClass"> {
		let classNameDefault;
		switch (this.system.type) {
			case "pc":
				classNameDefault = "Persona User";
				break;
			case "shadow":
				classNameDefault = "Persona User";
				// classNameDefault = "Shadow";
				break;
			default:
				throw new Error("NPCs have no classes");
		}
		const id = this.system.combat.classData.classId;
		let cl = PersonaDB.getClassById(id);
		if (!cl) {
			const namesearch = PersonaDB.getItemByName(classNameDefault)
			if (!namesearch)
				throw new Error(`Couldn't find class id: ${id} or name: ${classNameDefault}`);
			if (namesearch.system.type != "characterClass")
			{
				throw new Error("Bad Item named: ${classNameDefault}, expecting a character class");
			}
			cl = namesearch as ItemSub<"characterClass">;
		}
		return cl;
	}

	set hp(newval: number) {
		this.update({"system.combat.hp": newval});
	}

	get hp(): number {
		if (this.system.type =="npc") return 0;
		return this.system.combat.hp;
	}

	get mhp() : number {
		if (this.system.type == "npc") return 0;
		try {
			const inc= this.hasIncremental("hp")? 1: 0;
			const lvl = this.system.combat.classData.level;
			const bonuses = this.getBonuses("maxhp");
			return this.class.getClassProperty(lvl + inc, "maxhp") + bonuses.total( {user: PersonaDB.getUniversalActorAccessor(this as PC)});
		} catch (e) {
			console.warn(`Can't get Hp for ${this.name} (${this.id})`);
			return 0;
		}
	}

	hasIncremental(type: keyof Subtype<PersonaActor, "pc">["system"]["combat"]["classData"]["incremental"]) {
		switch (this.system.type) {
			case "pc": case "shadow":
				return this.system.combat.classData.incremental[type];
			default:
				throw new Error("Doesn't have incremental");
		}

	}

	getMaxSlotsAt(slot_lvl: number) : number {
		if (this.system.type != "pc") return 0;
		try {
			const inc =this.hasIncremental("slots") ? 1 : 0;
			const lvl = this.system.combat.classData.level;
			return this.class.getClassProperty(lvl + inc, "slots")[slot_lvl] ?? -999;

		} catch (e) {
			return -999;
		}
	}

	get socialLinks() : {linkLevel: number, actor: SocialLink, inspiration: number}[] {
		if (this.system.type != "pc") return [];
		return this.system.social.flatMap(({linkId, linkLevel, inspiration}) => {
			const npc = PersonaDB.getActor(linkId);
			if (!npc) return [];
			return [{
				linkLevel,
				inspiration,
				actor:npc as SocialLink,
			}];
		});
	}


	get powers(): Power[] {
		if (this.system.type =="npc") return [];
		try {
			const powerIds = this.system.combat.powers;
			let powers : Power[] = powerIds
				.flatMap( id => {
					const i = PersonaDB.getItemById(id) as Power;
					return i ? [i] : []
				});
			const basicAtk = PersonaItem.getBasicAttack();
			if (basicAtk) {
				powers = powers.concat([basicAtk]);
			}
			const itemPowers = this.items.filter( x=> x.system.type == "power") as Power[];
			return powers.concat(itemPowers);;
		} catch(e) {
			console.error(e);
			return [];
		}
	}

	get weapon() : Option<Weapon> {
		if (this.system.type != "pc") {
			return null;
		}
		const id = this.system.equipped.weapon;
		const item = this.items.find( x=> x.id == id);
		if (item) return item as Weapon;
		const dbitem = PersonaDB.getItemById(id);
		if (dbitem) return dbitem as Weapon;
		return null;
	}

	get talents() : Talent[] {
		if (this.system.type == "shadow") {
			return this.items.filter( x=> x.system.type == "talent") as Talent[];
		}
		if (this.system.type != "pc") return [];
		const extTalents = this.system.talents.flatMap( ({talentId}) => {
			const tal= PersonaDB.getItemById(talentId);
			if (!tal) return [];
			if (tal.system.type != "talent") return [];
			return tal as Talent;
		});
		const itemTalents = this.items.filter ( x => x.system.type == "talent") as Talent[];
		return extTalents.concat(itemTalents);
	}

	get focii(): Focus[] {
		if (this.system.type == "shadow") {
			return this.items.filter( x=> x.system.type == "focus") as Focus[];
		}
		if (this.system.type != "pc") return [];
		const fIds = this.system.combat.focuses;
		const focii = fIds.flatMap( id => {
			const focus = PersonaDB.getItemById(id);
			if (!focus) return [];
			if (focus.system.type != "focus") return [];
			return [focus as Focus];
		});
		const itemFocii = this.items.filter ( x => x.system.type == "focus") as Focus[];
		return focii.concat(itemFocii);
	}

	async modifyHP( this: Shadow | PC, delta: number) {
		let hp = this.system.combat.hp;
		hp += delta;
		if (hp < 0 ) {
			hp = 0;
		}
		if (hp >= this.mhp) {
			hp = this.mhp;
		}
		await this.update( {"system.combat.hp": hp});
	}

	async addStatus({id, potency, duration}: StatusEffect): Promise<void> {
		const eff = this.effects.find( eff => eff.statuses.has(id));
		const stateData = CONFIG.statusEffects.find ( x=> x.id == id);
		if (!stateData) {
			throw new Error(`Couldn't find status effect Id: ${id}`);
		}
		if (!eff) {
			const s= new Set();
			s.add(id);
			const newState = {
				...stateData,
				statuses: s
			};
			const newEffect = (await  this.createEmbeddedDocuments("ActiveEffect", [newState]))[0] as PersonaAE;
			// const statuses= Array.from(s);
			// newEffect.update({statuses});
		} else  {

			//TODO: update the effect

		}

	}

	async removeStatus({id}: Pick<StatusEffect, "id">) : Promise<void>{
		this.effects
		.filter( eff => eff.statuses.has(id))
		.forEach( eff => eff.delete());
	}

	async expendSlot(this: PC,  slot: number, amount = 1) {
		if (slot < 0 && slot >= 4) return;
		const slots = this.system.slots;
		slots[slot as (0 | 1 | 2 | 3)] -= amount;
		await this.update( {"system.slots" : slots});
	}

	equippedItems() : (InvItem | Weapon)[]  {
		if (this.system.type != "pc") return [];
		const inv = this.inventory;
		const slots : (keyof typeof this.system.equipped)[]=  ["weapon", "body", "accessory", "weapon_crystal"]
		const ret = slots
			.map( slot=> inv
				.find(item => item.id == (this as PC).system.equipped[slot]))
			.flatMap (x=> x? [x]: []);
		return ret as (InvItem | Weapon)[];
	}

	wpnDamage(this: PC | Shadow, multiplier_factored: boolean = true) : {low: number, high:number} {
		let basedmg: {low: number, high:number};
		if (this.system.type == "pc") {
			const wpn = this.weapon;
			if (!wpn) {
				ui.notifications.warn(`${this.name} doesn't have an equipped weapon`)
				return  {low: 1, high:2};
			}
			basedmg =  wpn.system.damage;
		} else {
			basedmg = this.system.combat.wpndmg;
		}
		if (!multiplier_factored)
			return basedmg;
		const mult =this.wpnMult();
		return {
			low: basedmg.low * mult,
			high: basedmg.high * mult,
		}
	}

	getBonuses (type : ModifierTarget): ModifierList {
		if (this.system.type == "npc")  return new ModifierList();
		let modList = new ModifierList( this.mainModifiers().flatMap( item => item.getModifier(type)
		));
		return modList;
	}

	mainModifiers(): ModifierContainer[] {
		return [
			...this.equippedItems(),
			...this.focii,
			...this.talents,
			...this.getSocialFocii(),
		];
	}

	wpnAtkBonus(this: PC | Shadow) : ModifierList {
		const mods = new ModifierList();
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.atkbonus ? 1 : 0;
		const wpnAtk = this.system.combat.wpnatk;
		mods.add("Base Weapon Attack Bonus", wpnAtk);
		mods.add("Level Bonus", lvl + inc);
		const itemBonus = this.getBonuses("wpnAtk");
		return mods.concat(itemBonus);
	}

	magAtkBonus(this:PC | Shadow) : ModifierList {
		const mods = new ModifierList();
		const lvl = this.system.combat.classData.level ?? 0;
		const magAtk = this.system.combat.magatk ?? 0;
		const inc = this.system.combat.classData.incremental.atkbonus ? 1 : 0;
		mods.add("Base Magic Attack Bonus", magAtk);
		mods.add("Level Bonus", lvl + inc);
		const itemBonus = this.getBonuses("magAtk");
		return mods.concat(itemBonus);
	}

	getDefense(this: PC | Shadow,  type : keyof PC["system"]["combat"]["defenses"]) : ModifierList {
		const mods = new ModifierList();
		const lvl = this.system.combat.classData.level;
		const baseDef = this.system.combat.defenses[type];
		const inc = this.system.combat.classData.incremental.defbonus ? 1 : 0;
		mods.add("Base", 10);
		mods.add("Base Defense Bonus", baseDef);
		mods.add("Level Bonus", lvl + inc);
		const itemBonus = this.getBonuses("ref");
		return mods.concat(itemBonus);
	}

	elementalResist(this: PC | Shadow, type: typeof DAMAGETYPESLIST[number]) : ResistStrength  {
		switch (type) {
			case "untyped":  case "none":
				return "normal";
			case "healing":
				return "absorb";
		}
		return this.system.combat.resists[type] ?? "normal";
	}

	wpnMult( this: PC | Shadow) : number {
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.wpn_mult ? 1 : 0;
		const mult = this.class.getClassProperty(lvl + inc, "wpn_mult") ?? 0;
		return mult;

	}

	magDmg (this: PC | Shadow) : {low: number, high:number} {
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.mag_dmg ? 1 : 0;
		const magDmg = this.class.getClassProperty(lvl + inc, "magic_damage") ?? 0;
		return magDmg ;
	}

	critBoost(this: PC | Shadow) : ModifierList {
		const itemBonus = this.getBonuses("ref");
		return itemBonus; //placeholder
	}

	async addTalent(this: PC | Shadow, talent: Talent) {
		const talents = this.system.talents;
		if (talents.find(x => x.talentId == talent.id)) return;
		talents.push( {
			talentLevel: 0,
			talentId: talent.id
		});
		await this.update( {"system.talents": talents});
	}

	async deleteTalent(this: PC | Shadow, id: string) {
		const item = this.items.find(x => x.id == id);
		if (item) {
			await item.delete();
			return;
		}
		let talents = this.system.talents;
		if (!talents.find(x => x.talentId == id)) return;
		talents = talents.filter( x=> x.talentId != id);
		await this.update( {"system.talents": talents});
	}

	async addPower(this: PC | Shadow, power: Power) {
		const powers = this.system.combat.powers;
		if (powers.includes(power.id)) return;
		powers.push(power.id);
		await this.update( {"system.combat.powers": powers});
	}

	async deletePower(this: PC | Shadow, id: string ) {
		const item = this.items.find(x => x.id == id);
		if (item) {
			await item.delete();
			return;
		}
		let powers = this.system.combat.powers;
		if (!powers.includes(id)) return;
		powers = powers.filter( x=> x != id);
		await this.update( {"system.combat.powers": powers});

	}

	async addFocus(this: PC | Shadow, focus: Focus) {
		const foci = this.system.combat.focuses;
		if (foci.includes(focus.id)) return;
		foci.push(focus.id);
		await this.update( {"system.combat.focuses": foci});
	}

	async deleteFocus(this: PC | Shadow, focusId: string) {
		const item = this.items.find(x => x.id == focusId);
		if (item) {
			await item.delete();
			return;
		}
		let foci = this.system.combat.focuses;
		if (!foci.includes(focusId)) return;
		foci = foci.filter( x=> x != focusId);
		await this.update( {"system.combat.focuses": foci});
	}

	async  setClass(this: PC | Shadow, cClass: CClass) {
		await this.update( {"this.system.combat.classData.classId": cClass.id});


	}

	 canPayActivationCost(this: PC | Shadow, usable: Usable) : boolean {
		if (this.system.type == "pc") {
			return (this as PC).canPayActivationCost_pc(usable);
		}
		else return (this as Shadow).canPayActiationCost_shadow(usable);
	}

	canPayActivationCost_pc(this: PC, usable: Usable) : boolean {
		switch (usable.system.type) {
			case "power": {
				switch (usable.system.subtype) {
					case "weapon":
						return  this.hp > usable.system.hpcost;
					case "magic":
						let x = usable.system.slot as keyof typeof this["system"]["slots"];
						while (x <= 3) {
							if (this.system.slots[x] > 0) {
								return true;
							}
							else x+=1;
						}
						return false;
					default:
						return true;
				}
			}
			case "consumable":
				return true; //may have some check later
		}
	}

	canPayActiationCost_shadow(this: Shadow, usable: Usable) : boolean {
		return true; //placeholder
	}

	getSocialStat(this: PC, socialStat: SocialStat) : ModifierList {
		const stat = this.system.skills[socialStat];
		const mods = new ModifierList();
		const skillName = game.i18n.localize(STUDENT_SKILLS[socialStat]);
		mods.add(skillName, stat);
		return mods.concat(this.getBonuses(socialStat));
	}

	async createSocialLink(this: PC, npc: SocialLink) {
		if (this.system.social.find( x=> x.linkId == npc.id)) {
			return;
		}
		this.system.social.push(
			{
				linkId: npc.id,
				linkLevel: 1,
				inspiration: 1,
				currentProgress: 0
			}
		);
		PersonaSounds.newSocialLink();
		await this.update({"system.social": this.system.social});
	}

	async increaseSocialLink(this: PC, npc: SocialLink) {
		const link = this.system.social.find( x=> x.linkId == npc.id);
		if (!link) {
			throw new PersonaError("Trying to increase social link you don't have");
		}
		if (link.linkLevel >= 10) {
			throw new PersonaError("Social Link is already maxed out");
		}
		link.linkLevel +=1 ;
		link.currentProgress= 0;
		link.inspiration = link.linkLevel;
		if (link.linkLevel == 10) {
			PersonaSounds.socialLinkMax();
		} else {
			PersonaSounds.socialLinkUp();
		}
		await this.update({"system.social": this.system.social});
	}

	async socialLinkProgress(this: PC, npc: SocialLink, progress: 5 | 10) {
		const link = this.system.social.find( x=> x.linkId == npc.id);
		if (!link) {
			throw new PersonaError("Trying to increase social link you don't have");
		}
		link.currentProgress += progress;
		link.inspiration = link.linkLevel;
		switch (progress) {
			case 5: PersonaSounds.socialBoostJingle(2);
				break;
			case 10: PersonaSounds.socialBoostJingle(3);
				break;
		}
		await this.update({"system.social": this.system.social});
	}

	async refreshSocialLink(this: PC, npc: SocialLink) {
		const link = this.system.social.find( x=> x.linkId == npc.id);
		if (!link) {
			throw new PersonaError("Trying to refresh social link you don't have");
		}
		link.inspiration = link.linkLevel;
		await this.update({"system.social": this.system.social});
	}


	async spendInspiration(this: PC, npc:SocialLink, amt: number = 1) {
		const link = this.system.social.find( x=> x.linkId == npc.id);
		if (!link) {
			throw new PersonaError("Trying to refresh social link you don't have");
		}
		if (link.inspiration <= 0) {
			throw new PersonaError("You are trying to spend Inspiration you don't have");
		}
		link.inspiration -= amt;
		await this.update({"system.social": this.system.social});

	}

	getSocialFocii() : Focus[] {
		if (this.system.type != "pc")  {
			return [];
		}
		return this.socialLinks.flatMap( link => {
			let focusContainer : NPC;
			switch (link.actor.system.type) {
				case "pc": {
					if (this == link.actor) {
						const focus = PersonaDB.getActorByName("Personal Social Link") as NPC;
						if (!focus) {
							ui.notifications.warn("Couldn't find personal social link");
							return [];
						}

						focusContainer = focus;
						break;
					}
					const focus = PersonaDB.getActorByName("Teammate Social Link") as NPC;
					if (!focus) {
						ui.notifications.warn("Couldn't find teammate social link");
						return [];
					}
					focusContainer = focus;
					break;
				}
				case "npc": {
					focusContainer = link.actor as NPC;
					break;
				}
				default:
					throw new Error("Not sure how this happened?");
			}
			let focusIds : string[] = [];
			for (let i=1; i<= link.linkLevel; i++) {
				focusIds = focusIds.concat(focusContainer.system.linkBenefits[i as keyof typeof focusContainer.system.linkBenefits]);
			}
			return focusContainer.items
				.filter(x => focusIds.includes(x.id))
		}) as Focus[];
	}

	getEffects() : ConditionalEffect[] {
		const containers : ModifierContainer[] = [
			...this.equippedItems(),
			...this.focii,
			...this.talents,
			...(this as PC).getSocialFocii(),
		];
		return containers.flatMap( x=> x.getEffects());
	}

}

export type PC = Subtype<PersonaActor, "pc">;
export type Shadow = Subtype<PersonaActor, "shadow">;
export type NPC = Subtype<PersonaActor, "npc">;
export type SocialLink = PC | NPC;
