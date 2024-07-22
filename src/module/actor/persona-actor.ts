import { RESIST_STRENGTH_LIST } from "../../config/damage-types.js";
import { Activity } from "../item/persona-item.js";
import { RecoverSlotEffect } from "../combat/combat-result.js";
import { getActiveConsequences } from "../preconditions.js";
import { PersonaCombat } from "../combat/persona-combat.js";
import { Metaverse } from "../metaverse.js";
import { PersonaActorSheetBase } from "./sheets/actor-sheet.base.js";
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
import { StatusDuration } from "../../config/status-effects.js";

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
		if (!game.user.isGM) return;//attempt at fixing lag hopefully won't lead to inaccurate bar
		// if (!this.isOwner) return; //old code lagged maybe
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

	get inventory() : (Consumable | InvItem | Weapon)[] {
		return this.items.filter( x=> x.system.type == "item" || x.system.type == "weapon" || x.system.type == "consumable") as (Consumable | InvItem | Weapon)[];
	}

	get consumables(): Consumable[] {
		const consumables =  this.items.filter( x=> x.system.type == "consumable") as Consumable[];
		return consumables.sort( (a,b) => a.name.localeCompare(b.name));
	}

	get nonUsableInventory() : (InvItem | Weapon)[] {
		const inventory = this.items.filter( i=> i.system.type == "item" || i.system.type == "weapon") as (InvItem | Weapon)[];
		return inventory.sort( (a,b) =>  {
			const typesort = a.system.type.localeCompare(b.system.type);
			if (typesort != 0) return typesort;
			if (a.system.type == "item" && b.system.type == "item") {
				const slotSort = a.system.slot.localeCompare(b.system.slot);
				if (slotSort != 0) return slotSort;
			}
			return a.name.localeCompare(b.name);
		});
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
			case "tarot" :{
				return -5;
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
		if (this.system.type == "npc"
			|| this.system.type == "tarot") return;
		this.update({"system.combat.hp": newval});
		(this as PC | Shadow).refreshHpStatus(newval);
	}

	get hp(): number {
		switch (this.system.type) {
			case "npc": return 0;
			case "tarot": return 0;
			case "pc":
			case "shadow":
				return this.system.combat.hp;
			default:
				this.system satisfies never;
				throw new PersonaError(`Unknown Type, can't get hp`);
		}
	}

	get mhp() : number {
		if (this.system.type == "npc") return 0;
		if (this.system.type == "tarot") return 0;
		try {
			const sit ={user: PersonaDB.getUniversalActorAccessor(this as PC)};
			const inc = this.hasIncremental("hp")? 1: 0;
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
			console.log(e);
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

	getWeakestSlot(): 0 | 1 | 2 | 3 {
		if (this.system.type != "pc") return 0;
		for (let slot_lvl = 0 ; slot_lvl <= 4; slot_lvl++) {
			const inc = this.hasIncremental("powers") ? 1 : 0;
			const lvl = this.system.combat.classData.level;
			if ( this.class.getClassProperty(lvl + inc, "slots")[slot_lvl] ?? -999 > 0) return slot_lvl as 0 | 1 | 2 | 3;
		}
		PersonaError.softFail(`Can't get weakest slot for ${this.name}`);
		return 0;
	}

	getMaxSlotsAt(slot_lvl: number) : number {
		if (this.system.type != "pc") return 0;
		try {
			const inc = this.hasIncremental("powers") ? 1 : 0;
			const lvl = this.system.combat.classData.level;
			let baseSlots =  this.class.getClassProperty(lvl + inc, "slots")[slot_lvl] ?? -999;
			const sit : Situation = {
				user: (this as PC).accessor
			}
			const bonusWeak = this.getBonuses("weakestSlot").total(sit);
			if (bonusWeak > 0 && slot_lvl == this.getWeakestSlot()) {
				baseSlots += bonusWeak;
			}
			return baseSlots;
		} catch (e) {
			return -999;
		}
	}

	async recoverSlot(this: PC, slottype: RecoverSlotEffect["slot"], amt: number = 1) {
		let slotNum: keyof typeof this.system.slots;
		switch (slottype) {
			case "lowest":
				slotNum = this.getWeakestSlot();
				break;
			case "0":
			case "1":
			case "2":
			case "3":
				slotNum = Number(slottype) as 0 | 1 | 2 | 3;
				break;
			case "highest":
				PersonaError.softFail("Recover slot for highest is not yet implemented");
				return;
			default:
				slottype satisfies never;
				PersonaError.softFail(`Unexpected slottype : ${slottype}`);
				return;
		}
		const maxSlots = this.getMaxSlotsAt(slotNum);
		this.system.slots[slotNum] = Math.min (this.system.slots[slotNum] + amt, maxSlots);
		await this.update( {"system.slots": this.system.slots});
	}

	get socialBenefits() : SocialBenefit[] {
		let focuses : Focus[] = [];
		switch (this.system.type) {
			case "pc": return [];
			case "shadow": return [];
			case "tarot":
				focuses = this.focii;
				break;
			case "npc":
				focuses = this.focii
					.concat(this.tarot?.focii ?? []);
				break;
			default:
					this.system satisfies never;
				throw new PersonaError("Unknwon type");
		}
		focuses.sort((a, b) => a.requiredLinkLevel() - b.requiredLinkLevel() );
		return focuses.map( focus =>({
			id: this.id,
			focus,
			lvl_requirement: focus.requiredLinkLevel(),
		}))
		;

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

	highestLinker(this: SocialLink) : {pc: PC | null, linkLevel: number} {
		const listOfLinkers = (game.actors.contents as PersonaActor[])
			.filter( x=> x.system.type == "pc" && x != this)
			.map( (pc : PC)=> ({
				pc,
				highest: pc.socialLinks
				.find( link=> link.actor == this)
				?.linkLevel ?? 0
			}))
		.sort ( (a,b) => b.highest - a.highest);
		const highest = listOfLinkers[0];
		if (!highest || highest.highest == 0) {
			return {pc: null, linkLevel: 0};
		}
		return {pc : highest.pc, linkLevel: highest.highest};
	}

	async addNewActivity(this: PC, activity: Activity) {
		const act= this.system.activities;
		if (act.find(x=> x.linkId == activity.id))
			return;
		const item : typeof act[number] = {
			linkId: activity.id,
			strikes: 0,
			currentProgress: 0,
		};
		act.push( item);
		await this.update( {"system.activities": act});
	}

	get activityLinks() : ActivityLink[] {
		if (this.system.type != "pc") return [];
		return this.system.activities
		.flatMap( aData => {
			const activity = PersonaDB.allActivities().find(x=> x.id == aData.linkId);
			if (!activity) return [];
			const aLink : ActivityLink = {
				strikes: aData.strikes ?? 0,
				available: activity.isAvailable(this as PC),
				currentProgress: aData.currentProgress,
				activity,
			}
			return aLink;
		});
	}

	get socialLinks() : SocialLinkData[] {
		const meetsSL = function (linkLevel: number, focus:Focus) {
			return	linkLevel >= focus.requiredLinkLevel();
		};
		if (this.system.type != "pc") return [];
		return this.system.social.flatMap(({linkId, linkLevel, inspiration, currentProgress, relationshipType}) => {
			const npc = PersonaDB.getActor(linkId);
			if (!npc) return [];
			relationshipType = relationshipType ? relationshipType : npc.baseRelationship;
			if (npc.system.type =="npc") {
				const allFocii = (npc as NPC).getSocialFocii(npc as SocialLink);
				const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
				return [{
					currentProgress,
					linkLevel,
					inspiration,
					relationshipType,
					actor:npc as SocialLink,
					linkBenefits: npc as SocialLink,
					allFocii: (npc as NPC).getSocialFocii(npc as SocialLink),
					available: npc.isAvailable(),
					focii: qualifiedFocii,
				}];
			} else {
				if (npc == this) {
					const personalLink = PersonaDB.personalSocialLink();
					if (!personalLink)  {
						return [];
					}
					const allFocii = (personalLink as NPC).getSocialFocii(personalLink as SocialLink);
					const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
					return [{
						currentProgress,
						linkLevel,
						inspiration,
						relationshipType,
						actor:npc as SocialLink,
						linkBenefits: personalLink,
						allFocii: allFocii,
						focii: qualifiedFocii,
						available: (npc as SocialLink).isAvailable(),
					}];
				} else {
					const teammate = PersonaDB.teammateSocialLink();
					if (!teammate)  {
						return [];
					}
					const allFocii = (teammate as NPC).getSocialFocii(teammate as SocialLink);
					const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
					return [{
						currentProgress,
						linkLevel,
						inspiration,
						relationshipType,
						actor:npc as SocialLink,
						linkBenefits: teammate,
						allFocii: allFocii,
						focii: qualifiedFocii,
						available: (npc as SocialLink).isAvailable()
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
		const linkActor = game.actors.get(socialLinkId);

		await Logger.sendToChat(`${this.name} used inspiration from link ${linkActor?.name} to heal ${healing} hit points (original HP: ${this.hp})` , this);
		await this.update({"system.social": this.system.social});
		await this.modifyHP(healing);
	}

	get powers(): Power[] {
		const basicPowers = PersonaItem.getBasicPowers();
		switch (this.system.type) {
			case "tarot": return [];
			case "npc" : return [];
			case "pc":
				const powerIds = this.system.combat.powers;
				const pcPowers : Power[] = powerIds.flatMap( id=> {
					const i = PersonaDB.getItemById(id);
					return (i ? [i as Power] : []);
				});
				const bonusPowers : Power[] =
					(this as PC).mainModifiers({omitPowers:true})
					.filter(x=> x.grantsPowers())
					.flatMap(x=> x.getGrantedPowers(this as PC ));
				return basicPowers.concat(pcPowers).concat(bonusPowers);
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
		if (hp > 0) {
			await this.setFadingState(0);
		}
		if (hp > this.mhp) {
			await this.update( {"system.combat.hp": this.mhp});
		}
		const opacity = hp > 0 ? 1.0 : (this.isFullyFaded(hp) ? 0.2 : 0.6);
		if (this.token) {
			await this.token.update({"alpha": opacity});
		} else {
			//@ts-ignore
			for (const iterableList of this._dependentTokens.values()) {
				for (const tokDoc of iterableList) {
					(tokDoc as TokenDocument<PersonaActor>).update({"alpha": opacity});
				}
			}
		}

	}

	/** returns true if status is added*/
	async addStatus({id, potency, duration}: StatusEffect): Promise<boolean> {
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
			if (await this.checkStatusNullificaton(id)) return false;
			const newEffect = (await  this.createEmbeddedDocuments("ActiveEffect", [newState]))[0] as PersonaAE;
			await newEffect.setPotency(potency ?? 0);
			await newEffect.setDuration(duration);
			// await newEffect.setFlag("persona", "duration", duration);
			// await newEffect.setFlag("persona", "potency", potency);
			if (duration == "3-rounds") {
				await newEffect.update({"duration.rounds": 3});
			}
			return true;
		} else  {
			if (potency && eff.potency < potency) {
				await eff.setPotency(potency);
			}
			if (duration && eff.durationLessThanOrEqualTo(duration)) {
				await eff.setDuration(duration);
			}
			//TODO: update the effect
			return false;
		}

	}

	hasStatus (id: StatusEffectId) : boolean {
		return this.effects.contents.some( eff => eff.statuses.has(id));
	}


	/** returns status id of nullified status otherwise return undefined */
	async checkStatusNullificaton(statusId: StatusEffectId) : Promise<StatusEffectId  | undefined> {
		let remList : StatusEffectId[] = [];
		switch (statusId) {
			case "supercharged":
				remList.push("depleted");
				break;
			case "depleted":
				remList.push("supercharged");
				remList.push("power-charge");
				remList.push("magic-charge");
				break;
		}
		for (const id of remList) {
			if (await this.removeStatus(id)) {
				return id;
			}
		}
		return undefined;
	}


	async removeStatus(status: Pick<StatusEffect, "id"> | StatusEffectId) : Promise<boolean>{
		const id = typeof status == "object" ? status.id : status;
		const promises =this.effects
		.filter( eff => eff.statuses.has(id))
		.map( eff => eff.delete());
		await Promise.all(promises);
		return promises.length > 0;
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

	passiveItems(): InvItem[] {
		if (this.system.type != "pc") return [];
		const inv = this.inventory;
		return inv.filter( item => item.system.type == "item" && item.system.slot == "none") as InvItem[];
	}

	wpnDamage(this: PC | Shadow, multiplier_factored: boolean = true, situation: Situation = { user: this.accessor}) : {low: number, high:number} {
		let basedmg: {low: number, high:number};
		if (this.system.type == "pc") {
			const wpn = this.weapon;
			if (!wpn) {
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

	getBonuses (modnames : ModifierTarget | ModifierTarget[]): ModifierList {
		if (this.system.type == "npc" || this.system.type == "tarot")  return new ModifierList();
		let modList = new ModifierList( (this as Shadow | PC).mainModifiers().flatMap( item => item.getModifier(modnames, this as Shadow | PC)
			.filter( mod => mod.modifier != 0 || mod.variableModifier.size > 0)
		));
		return modList;
	}

	mainModifiers(this: PC | Shadow, options?: {omitPowers?: boolean} ): ModifierContainer[] {
		const passivePowers = (options && options.omitPowers) ? [] : this.getPassivePowers();
		return [
			...this.equippedItems(),
			...this.focii,
			...this.talents,
			...passivePowers,
			...this.passiveItems(),
			...this.getAllSocialFocii(),
			...this.roomModifiers(),
			...PersonaDB.getGlobalModifiers(),
		].filter( x => x.getEffects(this).length > 0);
	}

	defensivePowers() : Power [] {
		return  this.powers
			.filter(x=> x.system.subtype == "defensive");
	}

	getSourcedDefensivePowers(this: PC | Shadow) {
		return this.defensivePowers().flatMap( x=> x.getSourcedEffects(this));
	}

	wpnAtkBonus(this: PC | Shadow) : ModifierList {
		const mods = this.getBonuses(["allAtk", "wpnAtk"]);
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.lvl_bonus ? 1 : 0;
		const wpnAtk = this.system.combat.wpnatk;
		mods.add("Base Weapon Attack Bonus", wpnAtk);
		mods.add("Level Bonus", lvl + inc);
		// const itemBonus = this.getBonuses("wpnAtk");
		return mods;
	}

	magAtkBonus(this:PC | Shadow) : ModifierList {
		const mods = this.getBonuses(["allAtk", "magAtk"]);
		const lvl = this.system.combat.classData.level ?? 0;
		const magAtk = this.system.combat.magatk ?? 0;
		const inc = this.system.combat.classData.incremental.lvl_bonus ? 1 : 0;
		mods.add("Base Magic Attack Bonus", magAtk);
		mods.add("Level Bonus", lvl + inc);
		// const itemBonus = this.getBonuses("magAtk");
		return mods;
	}

	itemAtkBonus(this: PC | Shadow, item :Consumable) : ModifierList {
		const mm = this.getBonuses(["itemAtk", "allAtk"]);
		// mm.concat(this.getBonuses("allAtk"));
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
		const universalDefenseType = this.getBonuses("allDefenses");
		return mods.concat(itemBonus).concat(universalDefenseType);
	}

	elementalResist(this: PC | Shadow, type: typeof DAMAGETYPESLIST[number]) : ResistStrength  {
		switch (type) {
			case "untyped":  case "none":
			case "all-out":
				return "normal";
			case "healing":
				return "absorb";
		}

		const baseResist= this.system.combat.resists[type] ?? "normal";
		let resist = baseResist;
		const effectChangers=  this.mainModifiers().filter( x=> x.getEffects(this)
			.some(x=> x.consequences
				.some( cons=>cons.type == "raise-resistance" || cons.type == "lower-resistance")));
		const situation : Situation = {
			user: this.accessor,
		};
		const consequences = effectChangers.flatMap(
			item => item.getEffects(this).flatMap(eff =>
				getActiveConsequences(eff, situation, item)
			)
		);
		const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
		let resBonus = 0;
		let resPenalty = 0;
		for (const cons of consequences) {
			switch (cons.type) {
				case "raise-resistance":
					if (cons.resistType == type &&
						resval(cons.resistanceLevel!) > resval(baseResist)) {
						resBonus = Math.max(resBonus, resval(cons.resistanceLevel!) - resval(baseResist))
					}
					break;
				case "lower-resistance":
					if (cons.resistType == type &&
						resval (cons.resistanceLevel!) < resval(baseResist))  {
						resPenalty = Math.min(resPenalty, resval(cons.resistanceLevel!) - resval(baseResist))
					}
						break;
				default:
					break;
			}
		}
		const resLevel = Math.clamped(resval(baseResist) + resBonus + resPenalty, 0 , RESIST_STRENGTH_LIST.length-1);
		return RESIST_STRENGTH_LIST[resLevel];
	}

	wpnMult( this: PC | Shadow) : number {
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.wpn_mult ? 1 : 0;
		const mult = this.class.getClassProperty(lvl + inc, "wpn_mult") ?? 0;
		return mult;

	}

	magDmg (this: PC | Shadow, situation: Situation) : {low: number, high:number} {
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.mag_dmg ? 1 : 0;
		const magDmg = this.class.getClassProperty(lvl + inc, "magic_damage") ?? 0;
		return magDmg;
	}

	critBoost(this: PC | Shadow) : ModifierList {
		const mods = this.mainModifiers().flatMap( item => item.getModifier("criticalBoost", this));
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
		const adjustedLevel = this.system.combat.classData.level + (this.system.combat.classData.incremental.lvl_bonus ? 1 : 0) ;
		const modifier  = Math.floor(adjustedLevel /4);
		const ret = new ModifierList();
		ret.add("Base Modifier", modifier);

		const mods = this.mainModifiers().flatMap( item => item.getModifier("critResist", this));
		return ret.concat(new ModifierList(mods));
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
		const actorType = this.system.type;
		switch (actorType) {
			case "npc": return;
			case "tarot": return;
			case "pc": case "shadow":
				let foci = this.system.combat.focuses;
				if (!foci.includes(focusId)) return;
				foci = foci.filter( x=> x != focusId);
				return await this.update( {"system.combat.focuses": foci});
			default:
				actorType satisfies never;
		}
	}

	async  setClass(this: PC | Shadow, cClass: CClass) {
		await this.update( {"this.system.combat.classData.classId": cClass.id});


	}

	canPayActivationCost(this: PC | Shadow, usable: Usable, outputReason: boolean = true) : boolean {
		if (this.system.type == "pc") {
			return (this as PC).canPayActivationCost_pc(usable, outputReason);
		}
		else return (this as Shadow).canPayActivationCost_shadow(usable, outputReason);
	}

	canPayActivationCost_pc(this: PC, usable: Usable, _outputReason: boolean) : boolean {
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
					case "social-link":
						const inspirationId = usable.system.inspirationId;
						if (inspirationId) {
							const socialLink = this.system.social.find( x=> x.linkId == inspirationId);
							if (!socialLink) return false;
							return socialLink.inspiration >= usable.system.inspirationCost;
						} else {
							const inspiration = this.system.social.reduce( (acc, item) => acc + item.inspiration , 0)
							return inspiration >= usable.system.inspirationCost;
						}

					default:
						return true;
				}
			}
			case "consumable":
				return usable.system.amount > 0;
		}
	}

	canPayActivationCost_shadow(this: Shadow, usable: Usable, outputReason: boolean) : boolean {
		if (usable.system.type == "power") {
			if (usable.system.reqEnhancedMultiverse && !Metaverse.isEnhanced()) {
				if (outputReason) {
					ui.notifications.notify(`only usable in enhanced multiverse`);
				}
				return false;
			}
			const combat = game.combat;
			if (combat && (combat as PersonaCombat).getEscalationDie() < usable.system.reqEscalation) {
				if (outputReason) {
					ui.notifications.notify(`Escalation die must be ${usable.system.reqEscalation} or higher to use this pwoer`);
				}
				return false;
			}
			const enhanced= Metaverse.isEnhanced();
			if (usable.system.reqHealthPercentage < 100) {
				const reqHp = (usable.system.reqHealthPercentage / 100) * this.mhp ;
				if (this.hp > reqHp) return false;
			}
			switch (usable.system.reqCharge) {
				case "none": return true;
				case "always": return !this.statuses.has("depleted");
				case "not-enhanced": return (enhanced || !this.statuses.has("depleted"));
				case "supercharged":
					return this.statuses.has("supercharged");
				case "supercharged-not-enhanced":
					return enhanced
						? !this.statuses.has("depleted")
						: this.statuses.has("supercharged");

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
				currentProgress: 0,
				relationshipType: npc.system.type == "pc"? "PEER" : npc.system.baseRelationship,
			}
		);
		PersonaSounds.newSocialLink();
		await this.update({"system.social": this.system.social});
	}

	get baseRelationship(): string {
		switch (this.system.type) {
			case "pc":
				return "PEER";
				 case "npc":
				return this.system.baseRelationship;
			default:
				return "NONE";
		}
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
		// link.currentProgress= 0;
		link.inspiration = link.linkLevel;
		if (link.linkLevel == 10) {
			PersonaSounds.socialLinkMax();
		} else {
			PersonaSounds.socialLinkUp();
		}
		await this.update({"system.social": this.system.social});
	}

	async decreaseSocialLink(this: PC, linkId: string) {
		const link = this.system.social.find( x=> x.linkId == linkId);
		if (!link) {
			throw new PersonaError("Trying to decrease social link you don't have");
		}
		if (link.linkLevel >= 10) {
			throw new PersonaError("Social Link is already maxed out");
		}
		link.linkLevel -=1 ;
		// link.currentProgress= 0;
		link.inspiration = link.linkLevel;
		PersonaSounds.socialLinkReverse();
		if (link.linkLevel == 0) {
			const newSocial = this.system.social.filter( x=> x != link);
			await this.update({"system.social": newSocial});
			return;
		}
		await this.update({"system.social": this.system.social});
	}

	async socialLinkProgress(this: PC, linkId: string, progress: number) {
		const link = this.system.social.find( x=> x.linkId == linkId);
		if (!link) {
			throw new PersonaError("Trying to increase social link you don't have");
		}
		const orig = link.currentProgress;
		link.currentProgress = Math.max(0,progress + link.currentProgress);
		link.inspiration = link.linkLevel;
		const linkActor = game.actors.get(link.linkId);
		if (progress < 0) {
			// PersonaSounds.socialLinkReverse();
		}
		switch (progress) {
			case 1: PersonaSounds.socialBoostJingle(1);
				break;
			case 2: PersonaSounds.socialBoostJingle(2);
				break;
			case 3: PersonaSounds.socialBoostJingle(3);
				break;
		}
		await this.update({"system.social": this.system.social});
		await Logger.sendToChat(`${this.name} added ${progress} progress tokens to link ${linkActor?.name} (original Value: ${orig})` , this);
	}

	async activityProgress(this: PC, activityId :string, progress: number) {
		const activityData = this.system.activities.find( x=> x.linkId == activityId);
		if (!activityData) {
			throw new PersonaError("Trying to increase activty you don't have");
		}
		const orig = activityData.currentProgress;
		activityData.currentProgress = Math.max(0,progress + activityData.currentProgress);
		await this.update({"system.activities": this.system.activities});
		const activity = PersonaDB.allActivities().find( act=> act.id == activityId);
		await Logger.sendToChat(`${this.name} added ${progress} progress tokens to ${activity?.name ?? "unknown activity"} (original Value: ${orig})` , this);

	}

	async activityStrikes(this: PC, activityId: string, strikes: number) {
		const activityData = this.system.activities.find( x=> x.linkId == activityId);
		if (!activityData) {
			throw new PersonaError("Trying to increase activty you don't have");
		}
		const orig = activityData.strikes;
		activityData.strikes = Math.max(0,strikes + activityData.strikes);
		await this.update({"system.activities": this.system.activities});
		const activity = PersonaDB.allActivities().find( act=> act.id == activityId);
		await Logger.sendToChat(`${this.name} added ${strikes} strikes to ${activity?.name ?? "unknown activity"} (original Value: ${orig})` , this);
	}

	async refreshSocialLink(this: PC, npc: SocialLink) {
		const link = this.system.social.find( x=> x.linkId == npc.id);
		if (!link) {
			throw new PersonaError(`Trying to refresh social link ${this.name} doesn't have: ${npc.name} `);
		}
		link.inspiration = link.linkLevel;
		await this.update({"system.social": this.system.social});
	}

	async spendInspiration(this: PC, linkId:string, amt?: number) : Promise<void> ;
	async spendInspiration(this: PC, socialLink:SocialLink , amt?: number): Promise<void> ;

	async spendInspiration(this: PC, socialLinkOrId:SocialLink | string, amt: number = 1): Promise<void> {
		const id = typeof socialLinkOrId == "string" ? socialLinkOrId : socialLinkOrId.id;
		const link = this.system.social.find( x=> x.linkId == id);
		if (!link) {
			throw new PersonaError("Trying to refresh social link you don't have");
		}
		if (link.inspiration <= 0) {
			throw new PersonaError("You are trying to spend Inspiration you don't have");
		}
		link.inspiration -= amt;
		await this.update({"system.social": this.system.social});
	}


	async addInspiration(this:PC, linkId:SocialLink["id"], amt: number) {
		const link = this.system.social.find( x=> x.linkId == linkId);
		if (!link) {
			throw new PersonaError("Trying to refresh social link you don't have");
		}
		link.inspiration += amt;
		link.inspiration = Math.min(link.linkLevel, link.inspiration);
		await this.update({"system.social": this.system.social});
	}

	getSocialFocii(this: NPC, linkHolder: SocialLink) : Focus[] {
		const sortFn = function (a: Focus, b: Focus) {
			return a.requiredLinkLevel() - b.requiredLinkLevel();
		};
		const tarot = this.tarot ?? linkHolder.tarot;
		if (!tarot) {
			console.log(`No tarot found for ${this.name} or ${linkHolder.name}`);
			return this.focii.sort( sortFn);
		}
		return this.focii.concat(tarot.focii).sort(sortFn);
	}

	getAllSocialFocii() : Focus[] {
		if (this.system.type != "pc")  {
			return [];
		}
		return this.socialLinks.flatMap( link => {
			return link.focii;
		});
	}

	getSourcedEffects(this: PC | Shadow): {source: ModifierContainer, effects: ConditionalEffect[]} []{
		return this.mainModifiers().flatMap( x=> x.getSourcedEffects(this));
	}

	getEffects(this: Shadow  | PC) : ConditionalEffect[] {
		return this.mainModifiers().flatMap( x=> x.getEffects(this));
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

	getSaveBonus( this: Shadow | PC) : ModifierList {
		const mods = this.mainModifiers().flatMap( item => item.getModifier("save", this));
		// const x = this.getActiveTokens()[0]
		return new ModifierList(mods);
	}

	getDisengageBonus( this: Shadow | PC) : ModifierList {
		const mods = this.mainModifiers().flatMap( item => item.getModifier("disengage", this));
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

	roomModifiers() : ModifierContainer[] {
		return (game.combats.contents as PersonaCombat[])
			.filter(combat => combat.combatants.contents
				.some( comb => comb.actor == this)
			).flatMap( combat=> combat.getRoomEffects())
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

	async fullHeal() {
		if (this.system.type == "pc" || this.system.type == "shadow") {
			this.hp = this.mhp;
		}
	}

	async OnEnterMetaverse(this: PC) {
		try {
			this.fullHeal();
			await this.update( {"system.slots" : {
				0: this.getMaxSlotsAt(0),
				1: this.getMaxSlotsAt(1),
				2: this.getMaxSlotsAt(2),
				3: this.getMaxSlotsAt(3),
			}});
			await this.refreshSocialLink(this);
		} catch (e) {
			console.log(e);
			ui.notifications.error(`problem with Onentermetaverse for ${this.name}`);
		}
	}

	async OnExitMetaverse(this: PC ) {
		try {
			this.fullHeal();
			for (const eff of this.effects) {
				if (eff.durationLessThanOrEqualTo("expedition")) {
					await eff.delete();
				}
			}
			await this.update( {"system.slots" : {
				0: this.getMaxSlotsAt(0),
				1: this.getMaxSlotsAt(1),
				2: this.getMaxSlotsAt(2),
				3: this.getMaxSlotsAt(3),
			}});
			await this.refreshSocialLink(this);
		} catch (e) {
			console.log(e);
			ui.notifications.error(`problem with OnExitMetaverse for ${this.name}`);
		}
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

	meetsSLRequirement (this: PC, focus: Focus) {
		return this.system.social.some( link=>
			link.linkId == focus.parent?.id
			&& link.linkLevel >= focus.requiredLinkLevel()
		);
		// return this.socialLinks.some( link=> {
		// 	return	link.focii.includes(focus) && link.linkLevel >= focus.requiredLinkLevel();
		// });
	}

	isFullyFaded(this: PC | Shadow, newhp?:number) : boolean {
		if (this.system.type== "shadow")
			return (newhp ?? this.hp) <= 0;
		else return this.system.combat.fadingState >= 2;
	}

	isFading(this:PC | Shadow): boolean {
		if (this.system.type == "shadow") return false;
		return this.hp <= 0 && this.system.combat.fadingState < 2;
	}

	get triggers() : ModifierContainer[] {
		switch (this.system.type ) {
			case "npc":
			case "tarot":
				return []
			case "pc":
			case "shadow":
				return (this as PC | Shadow).mainModifiers().filter( x=>
					x.getEffects(this as PC | Shadow).some( eff =>
						eff.conditions.some( cond => cond.type == "on-trigger")
					)
				);
			default:
				this.system satisfies never;
				return [];

		}
	}

	async setFadingState (this: PC | Shadow, state: number) {
		switch (state) {
			case 0:
				await this.removeStatus({
					id: "fading"
				});
				break;
			case 1:
				if (state == this.system.combat.fadingState)
					return;
				await this.addStatus({
					id:"fading",
					duration: "expedition",
				});
				break;
			case 2:
				break;
		}
		if (state == this.system.combat.fadingState)
			return;
		await this.update( {"system.combat.fadingState": state});
		await this.refreshHpStatus();
	}

	async raiseSocialSkill (this: PC, socialStat: SocialStat, amt: number) {
		const newval = this.system.skills[socialStat] + amt;
		const upgradeObj : Record<string, any> = {};
		const skillLoc = `system.skills.${socialStat}`;
		upgradeObj[skillLoc] = newval;
		await this.update(upgradeObj);
	}

	async gainMoney(this: PC, amt: number) {
		if (amt > 200) {
			throw new PersonaError("Can't get this much money at once!");
		}
		const resources = this.system.money + amt;
		await this.update({ "system.money": resources});
	}

	async spendMoney(this: PC, amt: number) {
		if (amt > this.system.money) {
			throw new PersonaError("You don't have that much money!");
		}
		const resources = this.system.money - amt;
		await this.update({ "system.money": resources});
	}

	isAlive(): boolean {
		if (this.system.type == "npc") return true;
		return this.hp > 0;
	}

	async setAvailability(this: SocialLink, bool: boolean) {
		await	this.update( {"system.weeklyAvailability.available": bool});
	}

	get tarot() : Tarot | undefined {
		switch (this.system.type) {
			case "pc":
				const PC = this as PC;
				return PersonaDB.tarotCards().find(x=> x.name == PC.system.tarot);
			case "shadow":
				return undefined;
			case "npc":
				const NPC = this as NPC;
				if (NPC == PersonaDB.personalSocialLink()
					|| NPC == PersonaDB.teammateSocialLink()
				) {
					return undefined;
				}
				return PersonaDB.tarotCards().find(x=> x.name == NPC.system.tarot);
			case "tarot":
				return this as Tarot;
			default:
				this.system satisfies never;
				return undefined;
		}

	}

	get perk() : string {
		switch (this.system.type) {
			case "pc":
				return this.tarot?.perk ?? "";
			case "shadow":
					return "";
			case "npc":
					return this.tarot?.perk ?? "";
			case "tarot":
					return this.system.perk;
			default:
					this.system satisfies never;
				return "";
		}
	}

	getEffectFlag(flagId: string) : this["system"]["flags"][number] | undefined {
		 return this.system.flags.find(flag=> flag.flagId == flagId.toLowerCase());
	}
	 getFlagState(flagName: string) : boolean {
		 return !!this.getEffectFlag(flagName);
	 }

	getFlagDuration(flagName: string) : StatusDuration | undefined {
		return this.getEffectFlag(flagName)?.duration;
	}

	async setEffectFlag(flagId: string, setting: boolean, duration: StatusDuration = "instant", flagName ?: string) {
		flagId = flagId.toLowerCase();
		let flags = this.system.flags;
		const current = this.getFlagState(flagId);
		if (setting == current) {
			const flag = flags.find(flag => flag.flagId == flagId);
			if (!flag) return;
			const eff  =this.effects.find(eff => eff.id == flag.AEId);
			eff!.setDuration(duration);
			return;
		}

		if (setting == true) {
			const newAE = {
				name: flagName,
			};
			const AE = (await  this.createEmbeddedDocuments("ActiveEffect", [newAE]))[0] as PersonaAE;
			flags.push({
				flagId: flagId.toLowerCase(),
				flagName: flagName,
				duration,
				AEId: AE.id,
			});
			await AE.setDuration(duration);
			await AE.linkToEffectFlag(flagId);
		} else {
			const flag = flags.find(flag => flag.flagId == flagId);
			if (flag) {
				try {
					const effects =  this.effects
						.filter(eff=> eff.linkedFlagId == flagId);
					for (const eff of effects) {
						if ("_flaggedDeletion" in eff && eff._flaggedDeletion){ continue;}
						if (eff.linkedFlagId) {
							await eff.unsetFlag("persona", "LinkedEffectFlag");
							await eff.delete();
						}
					}
				} catch(e) {
					console.log(e);
				}
			}
			flags = flags.filter(flag=> flag.flagId.toLowerCase() != flagId.toLowerCase());
		}
		await this.update({"system.flags": flags});
	}

	async setRelationshipType(this: PC, socialLinkId: string, newRelationshipType: string) {
		const link = this.system.social.find(x=> x.linkId == socialLinkId);

		if (!link) {
			throw new PersonaError(`Can't find link for Id ${socialLinkId}`);
		}
		link.relationshipType = newRelationshipType;
		await this.update({"system.social": this.system.social});
	}

	isSpecialEvent(this:SocialLink, numberToCheck: number) : boolean {
		if (this.system.type == "pc") return false;
		const peices = (this.system.specialEvents ?? "").split(",", 20).map(x=> Number(x));
		return peices.includes(numberToCheck);
	}

	async createNewTokenSpend(this: SocialLink) {
		const list = this.system.tokenSpends;
		const newItem : typeof list[number] = {
			conditions: [],
			amount: 1,
			text: "",
			consequences: []
		};
		list.push(newItem);
		await this.update({"system.tokenSpends":list});
	}

	async deleteTokenSpend(this: SocialLink, deleteIndex:number) {
		const list = this.system.tokenSpends;
		list.splice(deleteIndex,1);
		await this.update({"system.tokenSpends":list});
	}

	isAvailable() : boolean {
		if (this.system.type == "shadow" || this.system.type == "tarot") return false;
		return this.system.weeklyAvailability.available;
	}

	canTakeNormalDowntimeActions(): boolean {
		return !this.hasStatus("jailed") && !this.hasStatus("crippled");
	}

	async moneyFix() {
		//updates money to new x10 total
		switch (this.system.type) {
			case "pc":
				const money = this.system.money * 10;
				await this.update({"system.money": money});
			default:
				return;
		}
	}

}

Hooks.on("preUpdateActor", async (actor: PersonaActor, changes: {system: any}) => {
	switch (actor.system.type) {
		case "npc": return;
		case "tarot": return;
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
	switch (actor.system.type) {
		case "pc": case "shadow":
			await	(actor as PC | Shadow).refreshHpTracker();
			break;
		case "npc": case "tarot":
			break;
		default:
			actor.system satisfies never;
	}
});

Hooks.on("createToken", async function (token: TokenDocument<PersonaActor>)  {
	if (token.actor) {
		token.actor.fullHeal();
	}
});


export type SocialBenefit = {
	id: string,
	focus: Focus,
	lvl_requirement: number,
};

export type PC = Subtype<PersonaActor, "pc">;
export type Shadow = Subtype<PersonaActor, "shadow">;
export type NPC = Subtype<PersonaActor, "npc">;
export type Tarot = Subtype<PersonaActor, "tarot">;
export type SocialLink = PC | NPC;


export type ActivityLink = {
	strikes: number,
	available: boolean,
	activity: Activity,
	currentProgress: number,
}

export type SocialLinkData = {
	linkLevel: number,
	actor: SocialLink,
	inspiration: number,
	linkBenefits: SocialLink,
	focii: Focus[],
	currentProgress:number,
	relationshipType: string,
	available: boolean,
}


