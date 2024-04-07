import { PersonaActorSheetBase } from "./sheets/actor-sheet.base.js";
import { Metaverse } from "../metaverse.js";
import { Logger } from "../utility/logger.js";
import { Situation } from "../preconditions.js";
import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { Consumable } from "../item/persona-item.js";
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
	override statuses: Set<StatusEffectId>;
	override sheet: PersonaActorSheetBase;


	override prepareBaseData() {
		super.prepareBaseData();
	}

	async refreshHpTracker(this:PC | Shadow)  {
		if (!this.isOwner) return;
		if (this.hp > this.mhp) {
			this.update({"system.combat.hp": this.mhp});
		}
		if (this.system.combat.hpTracker.value != this.hp
			|| this.system.combat.hpTracker.max != this.mhp){
			this.update( {"system.combat.hpTracker.value" : this.hp,
				"system.combat.hpTracker.max": this.mhp
			});
		}
	}

	async createNewItem() {
		return (await this.createEmbeddedDocuments("Item", [{"name": "Unnamed Item", type: "item"}]))[0];
	}

	get inventory() : (Consumable | PersonaItem | Weapon)[] {
		return this.items.filter( x=> x.system.type == "item" || x.system.type == "weapon" || x.system.type == "consumable") as (Consumable | PersonaItem | Weapon)[];
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
		const situation = {user: (this as PC | Shadow).accessor};
		switch (this.system.type) {
			case "npc":
				return -5;
			case "shadow": {
				const actor = this as (Shadow | PC);
				return  -50 + actor.getDefense("ref").total(situation) +(actor.getDefense("will").total(situation)* 0.01);
			}
			case "pc":{
				const actor = this as (Shadow | PC);
				return actor.getDefense("ref").total( {user:actor.accessor}) + 0.1 * actor.getDefense("fort").total(situation) + 0.01 * actor.getDefense("will").total(situation);
			}
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
			const sit ={user: PersonaDB.getUniversalActorAccessor(this as PC)};
			const inc= this.hasIncremental("hp")? 1: 0;
			const lvl = this.system.combat.classData.level;
			const bonuses = this.getBonuses("maxhp");
			const lvlbase = this.class.getClassProperty(lvl, "maxhp");
			const incbonus = this.class.getClassProperty(lvl+inc, "maxhp") - lvlbase;

			bonuses.add("incremental bonus hp", incbonus)
			const mult = this.getBonuses("maxhpMult").total(sit) + 1;

			const mhp= (mult * lvlbase) + bonuses.total(sit);
			return Math.round(mhp);
			// return (this.class.getClassProperty(lvl + inc, "maxhp") + bonuses.total(sit)) * mult ;
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
			const inc =this.hasIncremental("powers") ? 1 : 0;
			const lvl = this.system.combat.classData.level;
			return this.class.getClassProperty(lvl + inc, "slots")[slot_lvl] ?? -999;

		} catch (e) {
			return -999;
		}
	}

	get socialBenefits() : SocialBenefit[] {
		if (this.system.type != "npc") return [];
		const focuses = this.focii;
		focuses.sort((a, b) => a.requiredLinkLevel() - b.requiredLinkLevel() );
		return focuses.map( focus =>({
			id: this.id,
			focus,
			lvl_requirement: focus.requiredLinkLevel(),
		}));
	}

	getSocialStatToRaiseLink(this: NPC | PC, classification: "primary" | "secondary") : SocialStat {
		switch (classification) {
			case "primary":
				return this.system.keyskill.primary;
			case "secondary":
				return this.system.keyskill.secondary;
			default:
				classification satisfies never;
				throw new PersonaError(`Unknown type ${classification}`);
		}
	}

	get socialLinks() : {linkLevel: number, actor: SocialLink, inspiration: number, linkBenefits: SocialLink, currentProgress:number}[] {
		if (this.system.type != "pc") return [];
		return this.system.social.flatMap(({linkId, linkLevel, inspiration, currentProgress}) => {
			const npc = PersonaDB.getActor(linkId);
			if (!npc) return [];
			if (npc.system.type =="npc") {
				return [{
					currentProgress,
					linkLevel,
					inspiration,
					actor:npc as SocialLink,
					linkBenefits: npc as SocialLink,
				}];
			} else {
				if (npc == this) {
					const personalLink = PersonaDB.getActorByName("Personal Social Link") as NPC;
					if (!personalLink)  {
						return [];
					}
					return [{
						currentProgress,
						linkLevel,
						inspiration,
						actor:npc as SocialLink,
						linkBenefits: personalLink,
					}];
				} else {
					const teammate = PersonaDB.getActorByName("Teammate Social Link") as NPC;
					if (!teammate)  {
						return [];
					}
					return [{
						currentProgress,
						linkLevel,
						inspiration,
						actor:npc as SocialLink,
						linkBenefits: teammate,
					}];
				}
			}
		});
	}

	async spendRecovery(this: PC, socialLinkId: string) {
		const link = this.system.social.find( x=> x.linkId == socialLinkId);
		if (!link) {
			throw new PersonaError(`Can't find link ${socialLinkId}`);
		}
		if (link.inspiration <= 0) {
			throw new PersonaError("Can't spend recovery!");
		}
		link.inspiration -= 1;
		const rec_bonuses = this.getBonuses("recovery");
		rec_bonuses.add("Base", 10);
		const situation : Situation = {
			user: PersonaDB.getUniversalActorAccessor(this)
		};
		const healing = rec_bonuses.total(situation);
		await Logger.sendToChat(`${this.name} used inspiration to heal ${healing} hit points (original HP: ${this.hp})` , this);
		await this.update({"system.social": this.system.social});
		await this.modifyHP(healing);
	}

	get powers(): Power[] {
		const basicPowers = PersonaItem.getBasicPowers();
		switch (this.system.type) {
			case "npc" : return [];
			case "pc":
				const powerIds = this.system.combat.powers;
				const pcPowers : Power[] = powerIds.flatMap( id=> {
					const i = PersonaDB.getItemById(id);
					return (i ? [i as Power] : []);
				});
				return basicPowers.concat(pcPowers);
			case "shadow":
				const shadowPowers = this.items.filter( x=> x.system.type == "power") as Power[];
				return basicPowers.concat(shadowPowers);
			default:
				this.system satisfies never;
				throw new PersonaError("Something weird happened");
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
			return [];
			// return this.items.filter( x=> x.system.type == "talent") as Talent[];
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
		if (this.system.type != "pc") {
			return this.items.filter( x=> x.system.type == "focus") as Focus[];
		}
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
		// await this.refreshHpStatus();
	}

	async refreshHpStatus(this: Shadow | PC, newval?: number) {
		const hp = newval ?? this.system.combat.hp;
		if (hp <= 0) {
			await this.addStatus({
				id:"fading",
				duration: "expedition",
			});
		}
		if (hp > 0) {
			await this.removeStatus({
				id: "fading"
			});
		}
		if (hp > this.mhp) {
			await this.update( {"system.combat.hp": this.mhp});
		}
	}

	async addStatus({id, potency, duration}: StatusEffect): Promise<void> {
		const eff = this.effects.find( eff => eff.statuses.has(id));
		const stateData = CONFIG.statusEffects.find ( x=> x.id == id);
		if (!stateData) {
			throw new Error(`Couldn't find status effect Id: ${id}`);
		}
		if (!eff) {
			const s = [id];
			const newState = {
				...stateData,
				name: game.i18n.localize(stateData.name),
				statuses: s
			};
			const newEffect = (await  this.createEmbeddedDocuments("ActiveEffect", [newState]))[0] as PersonaAE;
			await newEffect.setPotency(potency ?? 0);
			await newEffect.setDuration(duration);
			await newEffect.setFlag("persona", "duration", duration);
			await newEffect.setFlag("persona", "potency", potency);
			if (duration == "3-rounds") {
				await newEffect.update({"duration.rounds": 3});
			}
		} else  {
			if (potency && eff.potency < potency) {
				await eff.setPotency(potency);
			}
			if (duration && eff.durationLessThan(duration)) {
				await eff.setDuration(duration);
			}
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

	wpnDamage(this: PC | Shadow, multiplier_factored: boolean = true, situation: Situation = { user: this.accessor}) : {low: number, high:number} {
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
		const mult = this.wpnMult();
		const bonusDamage = this.getBonusWpnDamage(situation);
		return {
			low: basedmg.low * mult + bonusDamage.low.total(situation),
			high: basedmg.high * mult + bonusDamage.high.total(situation),
		}
	}

	getBonusWpnDamage(_situation: Situation) : {low: ModifierList, high: ModifierList} {
		const total = this.getBonuses("wpnDmg");
		const low = this.getBonuses("wpnDmg_low");
		const high = this.getBonuses("wpnDmg_high");
		return {
			low: total.concat(low),
			high: total.concat(high)
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
			...this.getPassivePowers(),
			...PersonaDB.getGlobalModifiers(),
		];
	}

	wpnAtkBonus(this: PC | Shadow) : ModifierList {
		const mods = this.getBonuses("allAtk");
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.lvl_bonus ? 1 : 0;
		const wpnAtk = this.system.combat.wpnatk;
		mods.add("Base Weapon Attack Bonus", wpnAtk);
		mods.add("Level Bonus", lvl + inc);
		const itemBonus = this.getBonuses("wpnAtk");
		return mods.concat(itemBonus);
	}

	magAtkBonus(this:PC | Shadow) : ModifierList {
		const mods = this.getBonuses("allAtk");
		const lvl = this.system.combat.classData.level ?? 0;
		const magAtk = this.system.combat.magatk ?? 0;
		const inc = this.system.combat.classData.incremental.lvl_bonus ? 1 : 0;
		mods.add("Base Magic Attack Bonus", magAtk);
		mods.add("Level Bonus", lvl + inc);
		const itemBonus = this.getBonuses("magAtk");
		return mods.concat(itemBonus);
	}

	itemAtkBonus(this: PC | Shadow, item :Consumable) : ModifierList {
		const mm = this.getBonuses("itemAtk");
		mm.concat(this.getBonuses("allAtk"));
		mm.add("Item Base Bonus", item.system.atk_bonus);

		return mm;
	}

	getDefense(this: PC | Shadow,  type : keyof PC["system"]["combat"]["defenses"]) : ModifierList {
		const mods = new ModifierList();
		const lvl = this.system.combat.classData.level;
		const baseDef = this.system.combat.defenses[type];
		const inc = this.system.combat.classData.incremental.lvl_bonus ? 1 : 0;
		mods.add("Base", 10);
		mods.add("Base Defense Bonus", baseDef);
		mods.add("Level Bonus", lvl + inc);
		const itemBonus = this.getBonuses(type);
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
		const mods = this.mainModifiers().flatMap( item => item.getModifier("criticalBoost"));
		return new ModifierList(mods);
	}

	async addTalent(this: PC | Shadow, talent: Talent) {
		if (this.system.type == "shadow") {
			ui.notifications.warn("Shadows can't use talents");
			return;
		}

		const talents = this.system.talents;
		if (talents.find(x => x.talentId == talent.id)) return;
		talents.push( {
			talentLevel: 0,
			talentId: talent.id
		});
		await this.update( {"system.talents": talents});
	}

	critResist(this: PC | Shadow) : ModifierList {
		const mods = this.mainModifiers().flatMap( item => item.getModifier("critResist"));
		return new ModifierList(mods);
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

	async deleteFocus(focusId: string) {
		const item = this.items.find(x => x.id == focusId);
		if (item) {
			await item.delete();
			return;
		}
		if (this.system.type == "npc") return;
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
							else x += 1;
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
		if (usable.system.type == "power") {
			switch (usable.system.reqCharge) {
				case "none": return true;
				case "always": return !this.statuses.has("depleted");
				case "not-enhanced": return (Metaverse.isEnhanced() || !this.statuses.has("depleted"));
				case "supercharged":
					return this.statuses.has("supercharged");
				default:
					usable.system.reqCharge satisfies never;
					throw new PersonaError(`Unknown REquirement${usable.system.reqCharge}`);
			}
		}
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

	async increaseSocialLink(this: PC, linkId: string) {
		const link = this.system.social.find( x=> x.linkId == linkId);
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

	async socialLinkProgress(this: PC, linkId: string, progress: number) {
		const link = this.system.social.find( x=> x.linkId == linkId);
		if (!link) {
			throw new PersonaError("Trying to increase social link you don't have");
		}
		link.currentProgress = Math.max(0,progress + link.currentProgress);
		link.inspiration = link.linkLevel;
		if (progress < 0) {
			PersonaSounds.socialLinkReverse();
		}
		switch (progress) {
			case 1: PersonaSounds.socialBoostJingle(2);
				break;
			case 2: PersonaSounds.socialBoostJingle(3);
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
			return focusContainer.items
				.filter(x => x.system.type == "focus")
		}) as Focus[];
	}

	getEffects() : ConditionalEffect[] {
		return this.mainModifiers().flatMap( x=> x.getEffects());
	}

	getPassivePowers(): Power[] {
		return this.powers
			.filter( power=> power.system.subtype == "passive");
	}

	canEngage() :boolean {
		return true; //placeholder

	}

	getLevelOfTalent(this: PC, talent: Talent) : number {
		const x= this.system.talents.find( x=> x.talentId == talent.id);
		if (!x) return 0;
		return x.talentLevel;
	}

	async incrementTalent(this:PC, talentId: string) {
		const x = this.system.talents.find( x => x.talentId == talentId);
		if (!x) return;
		x.talentLevel = Math.min(3, x.talentLevel+1);
		await this.update({"system.talents": this.system.talents});
	}

	async decrementTalent(this:PC, talentId :string) {
		const x = this.system.talents.find( x => x.talentId == talentId);

		if (!x) return;
		x.talentLevel = Math.max(0, x.talentLevel-1);
		await this.update({"system.talents": this.system.talents});
	}

	getSaveBonus() : ModifierList {
		const mods = this.mainModifiers().flatMap( item => item.getModifier("save"));
		// const x = this.getActiveTokens()[0]
		return new ModifierList(mods);
	}

	getDisengageBonus() : ModifierList {
		const mods = this.mainModifiers().flatMap( item => item.getModifier("disengage"));
		return new ModifierList(mods);
	}

	/** returns current team (taking into account charm)*/
	getAllegiance(this: PC | Shadow)  : "PCs" | "Shadows" {
		const base = this.system.type == "pc" ? "PCs" : "Shadows";
		if (!this.statuses.has("charmed")) return base;
		return base == "PCs" ? "Shadows" : "PCs";
	}

	async expendConsumable(item: Usable) {
		if (item.system.type == "power") {
			PersonaError.softFail("Can't expend a power, this function requires an item");
			return;
		}
		const amount = item.system.amount;
		if (amount <= 1) {
			await item.delete();
			return;
		}
		if (amount > 1) {
			await item.update({"system.amount": amount-1});
			return;
		}
	}

	isCapableOfAction() : boolean {
		const deblitatingStatuses :StatusEffectId[] = [
			"confused",
			"down",
			"fading",
			"fear",
			"frozen",
			"sleep",
			"shock",
		];
		return (
			this.hp > 0
		&& !deblitatingStatuses.some( stat => this.statuses.has(stat))
		);
	}

	async levelUp(this: PC) : Promise<void> {
		const newlevel  = this.system.combat.classData.level+1 ;
		const incremental = this.system.combat.classData.incremental;
		for (const [k, _v] of Object.entries(incremental)){
			incremental[k as keyof typeof incremental]= false;
		}
		await this.update({
			"system.combat.classData.level": newlevel,
			"system.combat.classData.incremental": incremental,
			"system.combat.classData.incremental_progress": 0,
		});
	}

	meetsSLRequirement(this: PC, benefit: SocialBenefit) : boolean {
		return this.socialLinks.some( x=> {
			return x.actor.socialBenefits.some( ben => {
				return	ben.focus == benefit.focus && x.linkLevel >= ben.lvl_requirement;
			});
		});
	}
}

export type PC = Subtype<PersonaActor, "pc">;
export type Shadow = Subtype<PersonaActor, "shadow">;
export type NPC = Subtype<PersonaActor, "npc">;
export type SocialLink = PC | NPC;

Hooks.on("preUpdateActor", async (actor: PersonaActor, changes: {system: any}) => {
	switch (actor.system.type) {
		case "npc": return;
		case "pc": {
			const newHp = changes?.system?.combat?.hp;
			if (newHp == undefined)
				return;
			await (actor as PC | Shadow).refreshHpStatus(newHp);
			return ;
		}
		case "shadow": {
			const newHp = changes?.system?.combat?.hp;
			if (newHp == undefined)
				return;
			await (actor as PC | Shadow).refreshHpStatus(newHp);
			return;
		}
		default:
			actor.system satisfies never;
			throw new PersonaError(`Unknown Type ${actor.type}`);
	}
});

Hooks.on("updateActor", async (actor: PersonaActor, _changes: {system: any}) => {
	if (actor.system.type != "npc") {
		await	(actor as PC | Shadow).refreshHpTracker();
	}


});
Hooks
export type SocialBenefit = {
	id: string,
	focus: Focus,
	lvl_requirement: number,
};
