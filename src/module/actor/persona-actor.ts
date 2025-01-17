import { FlagData } from "../datamodel/actor-types.js";
import { TarotCard } from "../../config/tarot.js";
import { removeDuplicates } from "../utility/array-tools.js";
import { testPreconditions } from "../preconditions.js";
import { CreatureTag } from "../../config/creature-tags.js";
import { PersonaSocial } from "../social/persona-social.js";
import { TAROT_DECK } from "../../config/tarot.js";
import { localize } from "../persona.js";
import { STATUS_EFFECT_LIST } from "../../config/status-effects.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../../config/status-effects.js";
import { ELEMENTAL_DEFENSE_LINK } from "../../config/damage-types.js";
import { RESIST_STRENGTH_LIST } from "../../config/damage-types.js";
import { Activity } from "../item/persona-item.js";
import { RecoverSlotEffect } from "../../config/consequence-types.js";
import { getActiveConsequences } from "../preconditions.js";
import { PersonaCombat } from "../combat/persona-combat.js";
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
import { StatusEffect } from "../../config/consequence-types.js";
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
import { StatusDuration } from "../active-effect.js";

declare global {
	type ActorSub<X extends PersonaActor["system"]["type"]> = Subtype<PersonaActor, X>;
}


const EMPTYARR :any[] = [] as const; //to speed up things by not needing to create new empty arrays for immutables;

Object.seal(EMPTYARR);

export class PersonaActor extends Actor<typeof ACTORMODELS, PersonaItem, PersonaAE> {
	declare statuses: Set<StatusEffectId>;
	declare sheet: PersonaActorSheetBase;

	static MPMap = new Map<number, number>;

	cache: {
		tarot: Tarot | undefined;
	};

	constructor(...arr: any[]) {
		//@ts-ignore
		super(...arr);
		this.cache = {
			tarot: undefined,
		}
	}

	get mp() : number {
		switch (this.system.type) {
			case "pc": break;
			default: return 0;
		}
		return this.system.combat.mp.value;
	}
	get mmp() : number {
		switch (this.system.type) {
			case "pc": break;
			default: return 0;
		}
		const sit ={user: PersonaDB.getUniversalActorAccessor(this as PC)};
		const bonuses = this.getBonuses("maxmp");
		const mult = 1 + this.getBonuses("maxmpMult").total(sit);
		const lvlmaxMP = (this as PC).calcBaseClassMMP();
		const val = Math.round((mult * (lvlmaxMP)) + bonuses.total(sit));
		(this as PC).refreshMaxMP(val);
		return val;
	}

	calcBaseClassMMP(this: PC): number {
		const lvl = this.system.combat.classData.level;

		const inc = this.system.combat.classData.incremental.mp;
		const mpBase = Math.round(PersonaActor.calcMP(lvl));
		const mpNext = Math.round(PersonaActor.calcMP(lvl + 1));
		const diff = mpNext - mpBase;
		return mpBase + Math.round((inc/3 * diff));
	}

	static calcMP (level: number) : number {
		const mapVal = this.MPMap.get(level);
		if (mapVal != undefined) {
			return mapVal;
		}
		if (level <= 1) return 50;
		const prevMP = this.calcMP(level -1);
		const MP = prevMP + (prevMP * (0.35 - ((level - 2) * .02)));
		this.MPMap.set(level, MP);
		return MP;
	}

	async refreshMaxMP(this: PC, amt = this.mmp) {
		if (amt == this.system.combat.mp.max) return;
		await this.update( { "system.combat.mp.max": amt});
	}

	async refreshHpTracker(this:PC | Shadow)  {
		if (!game.user.isGM) return;
		if (this.system.type == "pc") {
			await (this as PC).refreshMaxMP();
		}

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
		switch (this.system.type) {
			case "tarot":
				return game.i18n.localize(TAROT_DECK[this.name as keyof typeof TAROT_DECK] ?? "-");
			default:
					return this.name;
		}
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

	get printableResistanceString() : string {
		switch (this.system.type) {
			case "tarot":
			case "npc":
				return "";
		}
		const resists= this.system.combat.statusResists;
		const retdata = Object.entries(resists)
			.map(([statusRaw, level]) => {
				const statusTrans = localize(STATUS_EFFECT_TRANSLATION_TABLE[statusRaw]);
			switch (level) {
				case "resist": return `Resist ${statusTrans}`;
				case "absorb":
				case "reflect":
				case "block": return `Block ${statusTrans}`;
				default: return "";
			}
		})
		.filter( x=> x.length > 0)
		.join(", ");
		return retdata;
	}

	get combatInit(): number {
		const situation = {user: (this as PC | Shadow).accessor};
		const initBonus = this
			.getBonuses("initiative")
			.total(situation);
		switch (this.system.type) {
			case "npc":
				return -5;
			case "shadow": {
				const initRating = this.system.combat.initiative;
				const initScore = this.#translateInitString(initRating);
				// const actor = this as (Shadow | PC);
				return initBonus + (this.system.combat.classData.level * 2) + initScore;
			}
			case "pc":{
				const initRating = this.system.combat.initiative;
				const initScore = this.#translateInitString(initRating);
				// const actor = this as (Shadow | PC);
				return initBonus + (this.system.combat.classData.level * 2) + initScore;
			}
			case "tarot" :{
				return -5;
			}
			default:
				this.system satisfies never;
				throw new PersonaError(`Unepxected Type : ${this.type}`);
		}
	}

	#translateInitString(initString: PC["system"]["combat"]["initiative"]): number {
		switch (initString) {
			case "pathetic": return -6;
			case "weak": return -3;
			case "normal": return 0;
			case "strong": return 3;
			case "ultimate": return 6;
			default:
				initString satisfies never;
				return -999;
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
		newval = Math.clamp(newval, 0, this.mhp);
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
			const inc = this.system.combat.classData.incremental.hp ?? 0;
			const lvl = this.system.combat.classData.level;
			const bonuses = this.getBonuses("maxhp");
			const lvlbase = this.class.getClassProperty(lvl, "maxhp");
			const diff = this.class.getClassProperty(lvl+1, "maxhp") - lvlbase;
			const incBonus = Math.round(inc / 3 * diff);
			const weaknesses = Object.values(this.system.combat.resists)
				.filter(x=> x == "weakness")
				.length;
			const multmods = this.getBonuses("maxhpMult")
			if (weaknesses > 1) {
				const bonus = (weaknesses -1 ) * 0.25;
				multmods.add("weaknesses mod", bonus)
			}
			bonuses.add("incremental bonus hp", incBonus)
			const mult = multmods.total(sit) + 1;
			const mhp = (mult * lvlbase) + bonuses.total(sit);
			return Math.round(mhp);
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

	/** @deprecated */
	getWeakestSlot(): void {
		PersonaError.softFail("Thios function is deprecated and shouldn't be called anymore");
	}

	/** @deprecated */
	getMaxSlotsAt(_slot_lvl: number) : void {
		return;
	}

	/** @deprecated */
	async recoverSlot(this: PC, _slottype: RecoverSlotEffect["slot"], _amt: number = 1) : Promise<never> {
		throw new Error("Deprecated Crap, do not call");
	}

	getSocialSLWithTarot(this: PC, tarot: TarotCard) : number {
		const link= this.socialLinks.find(
			link => link.actor.tarot?.name == tarot);
		if (!link) return 0;
		return link.linkLevel;
	}

	getSocialSLWith(this: PC, sl : SocialLink | UniversalActorAccessor<SocialLink>) : number {
		if ("actorId" in sl) {
			sl = PersonaDB.findActor(sl);

		}
		const linkData= this.system.social.find( x=> x.linkId == sl.id)
		if (!linkData) return 0;
		return linkData.linkLevel;
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

	isDating(linkId: string) : boolean;
	isDating( link: PersonaActor) : boolean;

	isDating( sl: PersonaActor | string) : boolean {
		switch (this.system.type) {
			case "shadow":
			case "tarot":
				return false;
			case "npc": {
				const id = sl instanceof PersonaActor ? sl.id: sl;
				const target =PersonaDB.allActors().find( x=> x.id == id);
				if (!target || target.system.type != "pc")  {
					return false;
				}
				return target.isDating(this as NPC);
			}
			case "pc":
				break;
			default:
				this.system satisfies never;
				PersonaError.softFail(`Unexpected Date type: ${this.system["type"]}`);
				return false;
		}
		if (this.system.type != "pc") return false;
		const id = sl instanceof PersonaActor ? sl.id: sl;
		const link =  this.system.social.find(x=> x.linkId == id);
		if (!link) return false;
		return link.isDating || link.relationshipType == "DATE";
	}


	get socialLinks() : SocialLinkData[] {
		const meetsSL = function (linkLevel: number, focus:Focus) {
			return linkLevel >= focus.requiredLinkLevel();
		};
		if (this.system.type != "pc") {
			return EMPTYARR;
		}
		return this.system.social.flatMap(({linkId, linkLevel, inspiration, currentProgress, relationshipType}) => {
			const npc = PersonaDB.getActor(linkId);
			if (!npc) return [];
			const isDating = relationshipType == "DATE";
			relationshipType = relationshipType ? relationshipType : npc.baseRelationship;
			if (npc.system.type == "npc") {
				const allFocii = (npc as NPC).getSocialFocii_NPC(npc as SocialLink);
				const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
				return [{
					currentProgress,
					linkLevel,
					inspiration,
					relationshipType,
					actor:npc as SocialLink,
					linkBenefits: npc as SocialLink,
					allFocii,
					available: npc.isAvailable(this as PC),
					focii: qualifiedFocii,
					isDating,
				}];
			} else {
				if (npc == this) {
					const personalLink = PersonaDB.personalSocialLink();
					if (!personalLink)  {
						return [];
					}
					const allFocii = (personalLink as NPC).getSocialFocii_PC(personalLink as SocialLink, npc as PC);
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
						available: (npc as SocialLink).isAvailable(this as PC),
						isDating,
					}];
				} else {
					const teammate = PersonaDB.teammateSocialLink();
					if (!teammate)  {
						return [];
					}
					const allFocii = (teammate as NPC).getSocialFocii_PC(teammate as SocialLink, npc as PC);
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
						available: (npc as SocialLink).isAvailable(this as PC),
						isDating,
					}];
				}
			}
		});
	}

	get unrealizedSocialLinks() : (NPC | PC)[] {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
				return [];
			case "pc":
				break;
			default:
				this.system satisfies never;
				throw new PersonaError("Something weird happened");
		}
		const currentLinks = this.system.social.map(x=> x.linkId);
		const list = game.actors
			.filter( x=> x.system.type == "npc" || x.system.type =="pc")
			.filter( x=> !currentLinks.includes(x.id))
			.filter( (x : PC | NPC)=> Object.values(x.system.weeklyAvailability).some(x=> x == true))
			.filter( (x : PC | NPC)=> !!x.system.tarot)
		return list as (PC | NPC)[];
	}

	get recoveryAmt(): number {
		if (this.system.type != "pc") return 0;
		const rec_bonuses = this.getBonuses("recovery");
		rec_bonuses.add("Base", 10);
		const situation : Situation = {
			user: (this as PC).accessor
		};
		const healing = rec_bonuses.total(situation);
		return healing;
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
		const healing = this.recoveryAmt;
		const linkActor = game.actors.get(socialLinkId);

		await Logger.sendToChat(`${this.name} used inspiration from link ${linkActor?.name} to heal ${healing} hit points (original HP: ${this.hp})` , this);
		await this.update({"system.social": this.system.social});
		await this.modifyHP(healing);
	}

	get mainPowers() : Power[] {
		switch (this.system.type) {
			case "npc": case "tarot": return [];
			case "pc":
				const powerIds = this.system.combat.powers;
				const pcPowers : Power[] = powerIds.flatMap( id=> {
					const i = PersonaDB.getItemById(id);
					return (i ? [i as Power] : []);
				});
				return pcPowers;
			case "shadow":
				const shadowPowers = this.items.filter( x=> x.system.type == "power") as Power[];
				return shadowPowers;
			default:
				this.system satisfies never;
				return [];
		}
	}

	get bonusPowers() : Power[] {
		switch (this.type) {
			case "npc": case "tarot": 
				return [];
			case "shadow":
			case "pc":
				const bonusPowers : Power[] =
					(this as PC | Shadow).mainModifiers({omitPowers:true})
					.filter(x=> x.grantsPowers())
					.flatMap(x=> x.getGrantedPowers(this as PC )) ;
				return removeDuplicates(bonusPowers);
			default:
				this.type satisfies never;
				return [];
		}
	}

	get basicPowers() : Power [] {
		switch (this.type) {
			case "npc": case "tarot":
				return [];
			case "shadow":
				return PersonaItem.getBasicShadowPowers();
			case "pc":
				const arr =  PersonaItem.getBasicPCPowers();
				if (this.teamworkMove) {
					arr.push(this.teamworkMove);
				}
				return arr;
			default:
				this.type satisfies never;
				return [];
		}

	}

	get maxPowers() : number {
		switch (this.system.type) {
			case "npc":
			case "tarot":
				return 0;
			case "pc":
			case "shadow":
				const extraMaxPowers = this.getBonuses("extraMaxPowers");
				return 8 + extraMaxPowers.total ( {user: (this as PC | Shadow).accessor});
			default:
				this.system satisfies never;
				return -1;
		}
	}

	get powers(): Power[] {
		return [
			...this.basicPowers,
			...this.mainPowers,
			...this.bonusPowers,
		].flat();
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
		if (this.system.type == "pc")
			return [];
		return this.items.filter( x=> x.system.type == "focus") as Focus[];
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

	async modifyMP( this: PC, delta: number) {
		let mp = this.system.combat.mp.value;
		mp += delta;
		mp = Math.clamp(Math.round(mp), 0, this.mmp);
		await this.update( {"system.combat.mp.value": mp});
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

	async isStatusResisted( id : StatusEffect["id"]) : Promise<boolean> {
		const resist = this.statusResist(id);
		switch (resist) {
			case "absorb":
			case "reflect":
			case "weakness":
			case "normal":
				break;
			case "block":
				return true;
			case "resist":
				const save = await PersonaCombat.rollSave(this as Shadow, {
					DC: 11,
					label:`Resist status ${id}`,
					askForModifier: false,
					saveVersus: id,
					modifier: 0,
				});
				if (save.success) return true;
				break;
			default:
				resist satisfies never;
		}
		return false;
	}

	/** returns true if status is added*/
	async addStatus({id, potency, duration}: StatusEffect): Promise<boolean> {
		if (await this.isStatusResisted(id)) return false;
		const eff = this.effects.find( eff => eff.statuses.has(id));
		const stateData = CONFIG.statusEffects.find ( x=> x.id == id);
		if (!stateData) {
			throw new Error(`Couldn't find status effect Id: ${id}`);
		}
		if (id == "curse" || id == "expel") {
			if (this.system.type == "pc" || this.system.type == "shadow") {
				this.hp -= 9999;
			}
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
			return true;
		} else  {
			if (potency && eff.potency < potency) {
				await eff.setPotency(potency);
			}
			eff.duration.startRound = game?.combat?.round ?? 0;
			await eff.update({"duration": eff.duration});
			if (typeof duration != "string" && eff.durationLessThanOrEqualTo(duration)) {
				await eff.setDuration(duration);
			}
			//TODO: update the effect
			return false;
		}

	}

	get openerActions() : Usable[] {
		if (this.system.type == "npc" || this.system.type == "tarot")
			return [];
		const arr = (this as PC | Shadow).mainModifiers({omitPowers:true})
			.filter(x=> x.grantsPowers())
			.flatMap(x=> x.getOpenerPowers(this as PC ))
			.concat( this.system.type == "shadow" ? this.mainPowers.filter(x=> x.isOpener()) : []);
		return removeDuplicates(arr);
	}

	async setTeamworkMove(this: PC, power: Power) {
		const id = power.id;
		const oldTW = this.teamworkMove;
		await this.update( {"system.combat.teamworkMove": id});
		if (oldTW) {
			await Logger.sendToChat(`${this.name} replaced Teamwork ${oldTW.displayedName} with ${power.displayedName}` , this);
		} else {
			await Logger.sendToChat(`${this.name} set Teamwork Move to ${power.displayedName}` , this);
		}

	}

	get teamworkMove() : Power | undefined {
		if (this.system.type != "pc")
			return undefined;
		const id = this.system.combat.teamworkMove;
		if (!id)
			return undefined;
		return PersonaDB.allPowers().find(pwr => pwr.id == id);
	}

	hasStatus (id: StatusEffectId) : boolean {
		return this.effects.contents.some( eff => eff.statuses.has(id));

	}

	getStatus( id: StatusEffectId) : PersonaAE | undefined {
		return this.effects.contents.find( eff => eff.statuses.has(id));

	}

	get tokens() : TokenDocument<this>[] {
		const actor = this;
		if (actor.token) {
			return [actor.token];
		}
		//@ts-ignore
		const dependentTokens : TokenDocument<PersonaActor>[] = Array.from(actor._dependentTokens.values()).flatMap(x=> Array.from(x.values()));
		return dependentTokens.filter( x=> x.actorLink == true) as TokenDocument<this>[];
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
		const promises = this.effects
		.filter( eff => eff.statuses.has(id))
		.map( eff => eff.delete());
		await Promise.all(promises);
		return promises.length > 0;
	}

	async downGradeSlot(this: PC, slot: number ): Promise<boolean> {
		if (slot >= 3 || slot <= 0) return false;
		const slots = this.system.slots;
		const s = slot as (1 | 2 |3);
		if (slots[s] == 0) {
			const expend = await this.downGradeSlot(s +1);
			if (!expend) return false;
		}
		slots[s] -= 1;
		slots[(s-1) as (0 | 1 | 2 |3)] += 2;
		await this.update( {"system.slots" : slots});
		return true;
	}

	async expendSlot(this: PC,  slot: number, amount = 1) {
		if (slot < 0 && slot >= 4) return;
		const slots = this.system.slots;
		while (amount > 0) {
			if (slots[slot as (0 | 1 | 2 | 3)] < 1) {
				if (!(await this.downGradeSlot(slot +1 ))) {
					PersonaError.softFail(`Can't afford Slot for slot ${slot}`);
					break;
				}
			}
			slots[slot as (0 | 1 | 2 | 3)] -= 1;
			amount --;
		}
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

	wpnDamage(this: PC | Shadow) : {low: number, high:number} {
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
		return basedmg;
	}

	getBonusWpnDamage() : {low: ModifierList, high: ModifierList} {
		const total = this.getBonuses("wpnDmg");
		const low = this.getBonuses("wpnDmg_low");
		const high = this.getBonuses("wpnDmg_high");
		return {
			low: total.concat(low),
			high: total.concat(high)
		}
	}

	getBonuses (modnames : ModifierTarget | ModifierTarget[], sources: ModifierContainer[] = this.mainModifiers() ): ModifierList {
		// if (this.system.type == "npc" || this.system.type == "tarot")  return new ModifierList();
		let modList = new ModifierList( sources.flatMap( item => item.getModifier(modnames, this as Shadow | PC)
			.filter( mod => mod.modifier != 0 || mod.variableModifier.size > 0)
		));
		return modList;
	}

	basePowerCritResist(this: PC |Shadow): number {
		const inc = this.system.combat.classData.incremental.defenses ? 1 : 0;
		const level = this.system.combat.classData.level + inc;
		return Math.floor(level /2);
	}

	mainModifiers(options?: {omitPowers?: boolean} ): ModifierContainer[] {
		switch (this.system.type) {
			case "npc": case "tarot":
				return [];
			case "pc":
			case "shadow":
				break;
			default:
				this.system satisfies never;
		}
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
			...PersonaDB.navigatorModifiers(),
		].filter( x => x.getEffects(this as PC | Shadow).length > 0);
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
		const inc = this.system.combat.classData.incremental.attack ? 1 : 0;
		const wpnAtk = this.system.combat.wpnatk;
		mods.add("Base Weapon Attack Bonus", wpnAtk);
		mods.add("Level Bonus", lvl + inc);
		return mods;
	}

	magAtkBonus(this:PC | Shadow) : ModifierList {
		const mods = this.getBonuses(["allAtk", "magAtk"]);
		const lvl = this.system.combat.classData.level ?? 0;
		const magAtk = this.system.combat.magatk ?? 0;
		const inc = this.system.combat.classData.incremental.attack ? 1 : 0;
		mods.add("Base Magic Attack Bonus", magAtk);
		mods.add("Level Bonus", lvl + inc);
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
		const baseDef = this.#translateDefenseString(type, this.system.combat.defenses[type]);
		const inc = this.system.combat.classData.incremental.defenses ? 1 : 0;
		mods.add("Base", 10);
		mods.add("Base Defense Bonus", baseDef);
		mods.add("Level Bonus", lvl + inc);
		const otherBonuses = this.getBonuses([type, "allDefenses"]);
		const defenseMods = this.getBonuses([type, "allDefenses"], this.defensivePowers());
		return mods.concat(otherBonuses).concat(defenseMods);
	}

	#translateDefenseString(this: PC | Shadow, defType: keyof PC["system"]["combat"]["defenses"], val: PC["system"]["combat"]["defenses"]["fort"],): number {
		const weaknesses= this.#getWeaknessesInCategory(defType);
		switch (val) {
			case "pathetic": return Math.min(-6 + 2 * weaknesses,-2) ;
			case "weak": return Math.min(-3 + 1 * weaknesses, -1);
			case "normal": return 0;
			case "strong": return Math.max(3 - 1 * weaknesses, 1);
			case "ultimate": return Math.max(6 - 2 * weaknesses, 2);
			default:
				PersonaError.softFail(`Bad defense tsring ${val} for ${defType}`);
				return -999;
		}
	}

	#getWeaknessesInCategory(this: PC | Shadow, defType: keyof PC["system"]["combat"]["defenses"]): number {
		const damageTypes = ELEMENTAL_DEFENSE_LINK[defType];
		const weaknesses= damageTypes.filter( dt => this.system.combat.resists[dt] == "weakness")
		return weaknesses.length;
	}

	elementalResist(this: PC | Shadow, type: typeof DAMAGETYPESLIST[number]) : ResistStrength  {
		switch (type) {
			case "untyped":  case "none":
			case "all-out":
				return "normal";
			case "healing":
				return "absorb";
		}

		const baseResist = this.system.combat.resists[type] ?? "normal";
		// let resist = baseResist;
		const effectChangers=  this.mainModifiers().filter( x=> x.getEffects(this)
			.some(x=> x.consequences
				.some( cons=>cons.type == "raise-resistance" || cons.type == "lower-resistance")));
		const situation : Situation = {
			user: this.accessor,
			target: this.accessor,
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
		const resLevel = Math.clamp(resval(baseResist) + resBonus + resPenalty, 0 , RESIST_STRENGTH_LIST.length-1);
		return RESIST_STRENGTH_LIST[resLevel];
	}

	statusResist(status: StatusEffectId) : ResistStrength {
		switch (this.system.type) {
			case "tarot":
			case "npc":
				return "normal";
			case "pc":
			case "shadow":
				break;
			default:
				this.system satisfies never;
				PersonaError.softFail("Unknown Type");
				return "normal";
		}
		const actor = this as PC | Shadow;
		const effectChangers=  actor.mainModifiers().filter( x=> x.getEffects(actor)
			.some(x=> x.consequences
				.some( cons=>cons.type == "raise-status-resistance" && cons.statusName == status)));
		const situation : Situation = {
			user: actor.accessor,
			target: actor.accessor,
		};
		const consequences = effectChangers.flatMap(
			item => item.getEffects(actor).flatMap(eff =>
				getActiveConsequences(eff, situation, item)
			)
		);
		let baseStatusResist : ResistStrength = "normal";
		if ("statusResists" in actor.system.combat) {
			const statusResist = actor.system.combat.statusResists;
			if (status in statusResist) {
				baseStatusResist = statusResist[status as keyof typeof statusResist];
			}
		}
		const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
		let resist= baseStatusResist;
		for (const cons of consequences) {
			if (cons.type == "raise-status-resistance"
				&& cons.statusName == status) {
				if (resval(cons.resistanceLevel) > resval(resist)) {
					resist = cons.resistanceLevel;
				}
			}
		}
		return resist;
	}

	get statusResists() : {id: string, img: string, local: string, val: string}[] {
		let arr: {id: string, img: string, local: string, val: string}[]   = [];
		if (this.system.type != "shadow") return [];
		for (const [k, v] of Object.entries(this.system.combat.statusResists)) {
			arr.push( {
				id: k,
				val: v,
				local: localize(STATUS_EFFECT_TRANSLATION_TABLE[k]),
				img: STATUS_EFFECT_LIST.find(x=> x.id == k)?.icon ?? "",
			});
		}
		return arr;
	}

	wpnMult( this: PC | Shadow) : number {
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.wpnDamage * 0.5 ;
		const mult = ((this.class.getClassProperty(lvl, "wpn_mult") ?? 0)  + inc);
		return mult;
	}

	magDmg (this: PC | Shadow) : {low: number, high:number} {
		const lvl = this.system.combat.classData.level;
		const incLow = this.system.combat.classData.incremental.magicLow ? 1 : 0;
		const incHigh = this.system.combat.classData.incremental.magicHigh ? 1 : 0;
		const baseDmg = this.class.getClassProperty(lvl, "magic_damage") ?? 0;
		const nextLvl = this.class.getClassProperty(lvl+1, "magic_damage") ?? 0;
		return {
			low: incLow ? nextLvl.low : baseDmg.low,
			high: incHigh ? nextLvl.high : baseDmg.high,
		}
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
		await Logger.sendToChat(`${this.name} added ${talent.name} Talent` , this);
	}

	critResist(this: PC | Shadow) : ModifierList {
		const ret = new ModifierList();
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
		const talent = PersonaDB.getItemById(id) as Talent;
		talents = talents.filter( x=> x.talentId != id);
		await this.update( {"system.talents": talents});
		await Logger.sendToChat(`${this.name} deleted talent ${talent.name}` , this);
	}

	async addPower(this: PC, power: Power) {
		const powers = this.system.combat.powers;
		if (powers.includes(power.id)) return;
		powers.push(power.id);
		await this.update( {"system.combat.powers": powers});
		await Logger.sendToChat(`${this.name} added ${power.name}` , this);
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
		const power = PersonaDB.getItemById(id) as Power;
		await this.update( {"system.combat.powers": powers});
		await Logger.sendToChat(`${this.name} deleted power ${power.name}` , this);
	}

	async addFocus(this: PC, focus: Focus) {
		PersonaError.softFail(`Can't drop ${focus.name}. Focii are no longer supported on PCs`);
		return;
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

	canUsePower (this: PC | Shadow, usable: Usable, outputReason: boolean = true) : boolean {
		if (this.hasStatus("rage") && usable != PersonaDB.getBasicPower("Basic Attack")) {
			if (outputReason) {
				ui.notifications.warn("Can't only use basic attacks when raging");
			}
			return false;
		}
		return this.canPayActivationCost(usable, outputReason);

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
				if (this.hasStatus("depleted") && !usable.system.tags.includes("basicatk")) {
					return false;
				}
				switch (usable.system.subtype) {
					case "weapon":
						return  this.hp > usable.system.hpcost;
					case "magic":
						const mpcost = usable.mpCost(this);
						if (mpcost > 0) {
							return this.mp >= mpcost;
						}
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
					case "downtime":
						const combat = game.combat as PersonaCombat;
						if (!combat) return false;
						return combat.isSocial;
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
			const combat = game.combat;
			// if (combat && usable.system.reqEscalation > 0 && (combat as PersonaCombat).getEscalationDie() < usable.system.reqEscalation) {
			const energyRequired = usable.system.energy.required;
			const energyCost = usable.system.energy.cost;
			const currentEnergy = this.system.combat.energy.value;
			if (combat && energyRequired > 0 && energyRequired > currentEnergy) {
				if (outputReason) {
					ui.notifications.notify(`Requires ${energyRequired} energy and you only have ${currentEnergy}`);
				}
				return false;
			}
			if (combat && energyCost > (currentEnergy + 1)) {
				if (outputReason) {
					ui.notifications.notify(`Costs ${energyCost} energy and you only have ${currentEnergy}`);
				}
				return false;
			}
			if (usable.system.reqHealthPercentage < 100) {
				const reqHp = (usable.system.reqHealthPercentage / 100) * this.mhp ;
				if (this.hp > reqHp) return false;
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
				isDating: false,
			}
		);
		PersonaSounds.newSocialLink();
		await this.update({"system.social": this.system.social});
		await Logger.sendToChat(`${this.name} forged new social link with ${npc.displayedName} (${npc.tarot?.name}).` , this);
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
		const target = game.actors.get(link.linkId) as NPC | PC;
		if (target) {
			await Logger.sendToChat(`${this.name} increased Social Link with ${target.displayedName} (${target.tarot?.name}) to SL ${link.linkLevel}.` , this);
		}
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
			PersonaError.softFail("Trying to increase social link you don't have");
			return;
		}
		const orig = link.currentProgress;
		link.currentProgress = Math.max(0,progress + link.currentProgress);
		if (progress > 0) {
			link.inspiration = link.linkLevel;
		}
		const linkActor = game.actors.get(link.linkId);
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
			PersonaError.softFail("Trying to increase activty you don't have");
			return;
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


	getInspirationWith(linkId: SocialLink["id"]): number {
		if (this.system.type != "pc") return 0;
		const link = this.system.social.find( x=> x.linkId == linkId);
		if (!link) return 0;
		return link.inspiration;
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

	getSocialFocii_PC(this: NPC, linkHolder: SocialLink, targetPC: PC) : Focus[] {
		const sortFn = function (a: Focus, b: Focus) {
			return a.requiredLinkLevel() - b.requiredLinkLevel();
		};
		const tarot = targetPC.tarot;
		if (!tarot) {
			console.debug(`No tarot found for ${this.name} or ${linkHolder.name}`);
			return this.focii.sort( sortFn);
		}
		return this.focii.concat(tarot.focii).sort(sortFn);
	}

	getSocialFocii_NPC(this: NPC, linkHolder: SocialLink) : Focus[] {
		const sortFn = function (a: Focus, b: Focus) {
			return a.requiredLinkLevel() - b.requiredLinkLevel();
		};
		const tarot = this.tarot ?? linkHolder.tarot;
		if (!tarot) {
			console.debug(`No tarot found for ${this.name} or ${linkHolder.name}`);
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
		return !this.isDistracted() && this.isCapableOfAction();
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
	getAllegiance(this: PC | Shadow)  : "PCs" | "Shadows" | "Neutral" {
		if (this.system.type == "pc") {
			if (!this.hasPlayerOwner) return "Neutral";
		}
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

	/** used for determining all out attack viability*/
	isStanding() : boolean {
		return (this.hp > 0 && !this.statuses.has("down"))
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
			if (this.system.type == "pc") {
				this.update({"system.combat.mp.value" : this.mmp});
			}
			(this as PC | Shadow).refreshHpTracker();
		}
	}

	async OnEnterMetaverse(this: PC) {
		try {
			this.fullHeal();
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
				if (eff.durationLessThanOrEqualTo({ dtype: "expedition"})) {
					await eff.delete();
				}
			}
			await this.refreshSocialLink(this);
		} catch (e) {
			console.log(e);
			ui.notifications.error(`problem with OnExitMetaverse for ${this.name}`);
		}
	}

	async levelUp(this: PC) : Promise<void> {
		const newlevel  = this.system.combat.classData.level+1 ;
		// const incremental = this.system.combat.classData.incremental;
		const incremental : PC["system"]["combat"]["classData"]["incremental"] = {
			hp: 0,
			mp: 0,
			attack: false,
			defenses: false,
			magicLow: false,
			magicHigh: false,
			talent: false,
			wpnDamage: 0
		};
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
					duration: {
						dtype: "expedition"
					},
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

	async alterSocialSkill (this: PC, socialStat: SocialStat, amt: number, logger = true) {
		const oldval = this.system.skills[socialStat];
		const newval = oldval + amt;
		const upgradeObj : Record<string, any> = {};
		const skillLoc = `system.skills.${socialStat}`;
		upgradeObj[skillLoc] = newval;
		await this.update(upgradeObj);
		if (logger) {
			switch (amt) {
				case 1: case 2: case 3:
					await PersonaSounds.skillBoost(amt);
			}
			const verb = amt >= 0 ? "raised" : "lowered";
			await Logger.sendToChat(`<b>${this.name}:</b> ${verb} ${socialStat} by ${amt} (previously ${oldval})`, this);
		}
	}

	async gainMoney(this: PC, amt: number, log :boolean) {
		if (amt < 0) {
			return this.spendMoney(amt);
		}
		if (amt > 200) {
			throw new PersonaError("Can't get this much money at once!");
		}
		const resources = this.system.money + amt;
		await this.update({ "system.money": resources});
		if (log && amt > 0) {
			await Logger.sendToChat(`${this.name} Gained ${amt} resource points`);
			await PersonaSounds.ching();
		}
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
		if (this.isOwner) {
		await	this.update( {"system.weeklyAvailability.available": bool});
		} else {
			PersonaSocial.requestAvailabilitySet(this.id, bool);
		}
	}

	get tarot() : Tarot | undefined {
		switch (this.system.type) {
			case "pc":
				if (this.cache.tarot?.name == this.system.tarot)
					break;
				if (this.system.tarot == "")
					return undefined;
				// console.debug("cached value no good (pc)");
				const PC = this as PC;
				this.cache.tarot = PersonaDB.tarotCards().find(x=> x.name == PC.system.tarot);
				break;
			case "shadow":
				if (this.cache.tarot?.name == this.system.tarot)
					break;
				if (this.system.tarot == "")
					return undefined;
				// console.debug("cached value no good(Shadow)");
				const shadow = this as Shadow;
				this.cache.tarot =  PersonaDB.tarotCards().find(x=> x.name == shadow.system.tarot);
				break;
			case "npc":
				if (this.cache.tarot?.name == this.system.tarot)
					break;
				if (this.system.tarot == "")
					return undefined;
				// console.debug("cached value no good (NPC)");
				const NPC = this as NPC;
				if (
					NPC == PersonaDB.personalSocialLink()
					|| NPC == PersonaDB.teammateSocialLink()
				) {
					return undefined;
				}
				this.cache.tarot =  PersonaDB.tarotCards().find(x=> x.name == NPC.system.tarot);
				break;
			case "tarot":
				return this as Tarot;
			default:
				this.system satisfies never;
				return undefined;
		}
		return this.cache.tarot;
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

	getEffectFlag(flagId: string) : FlagData | undefined {
		const flag= this.effects.find(eff=> eff.flagId == flagId);
		if (flag) return {
			flagId,
			duration: flag.statusDuration,
			flagName: flag.name,
			AEId: flag.id,
		};
	}

	async onStartCombatTurn(this: PC | Shadow): Promise<string[]> {
		console.log(`${this.name} on Start turn`);
		await this.removeStatus("blocking");
		let ret = [] as string[];
		for (const eff of this.effects) {
			console.log(`${this.name} has Effect ${eff.name}`);
			Debug(eff);
			if ( await eff.onStartCombatTurn()) {
				ret.push(`Removed Condition ${eff.displayedName} at start of turn`);
			}
		}
		return ret;
	}

	async onEndCombatTurn(this : PC | Shadow) : Promise<string[]> {
		const burnStatus = this.effects.find( eff=> eff.statuses.has("burn"));
		if (burnStatus) {
			const damage = burnStatus.potency;
			await this.modifyHP(-damage);
		}
		let ret = [] as string[];
		for (const eff of this.effects) {
			if (await eff.onEndCombatTurn()) {
				ret.push(`Removed Condition ${eff.displayedName} at end of turn`);
			}
		}
		return ret;
	}

	getFlagState(flagName: string) : boolean {
		return !!this.getEffectFlag(flagName);
	}

	getFlagDuration(flagName: string) : StatusDuration | undefined {
		return this.getEffectFlag(flagName)?.duration;
	}

	async setEffectFlag(flagId: string, setting: boolean, duration: StatusDuration = {dtype: "instant"}, flagName ?: string) {
		if (setting) {
			await this.createEffectFlag(flagId, duration, flagName);
		} else {
			await this.clearEffectFlag(flagId);
		}
	}


	async createEffectFlag(flagId: string, duration: StatusDuration = {dtype: "instant"}, flagName ?: string) {
		flagId = flagId.toLowerCase();
		const eff = this.effects.find(x=> x.isFlag(flagId))
		const newAE = {
			name: flagName,
		};
		if (eff) {
			eff.setDuration(duration);
		} else {
			const AE = (await  this.createEmbeddedDocuments("ActiveEffect", [newAE]))[0] as PersonaAE;
			await AE.setDuration(duration);
			await AE.markAsFlag(flagId);
		}
	}

	async clearEffectFlag(flagId: string) {
		const eff = this.effects.find(x=> x.isFlag(flagId))
		if (eff) {await eff.delete();}
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
		const peices = (this.system.specialEvents ?? "").split(",", 20).map(x=> Number(x?.trim() ?? ""));
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

	isAvailable(pc: PersonaActor) : boolean {
		if (this.system.type == "shadow" || this.system.type == "tarot") return false;
		if (pc.system.type != "pc") return false;
		const availability = this.system.weeklyAvailability;
		if (this.isSociallyDisabled()) return false;
		if (this.system.type == "npc") {
			const npc = this as NPC;
			const sit: Situation = {
				user: (pc as PC).accessor,
				socialTarget: npc.accessor,
			};
			if(!testPreconditions(this.system.availabilityConditions,sit, null)) {
				return false;
			}
		}
		return availability?.available ?? false;
	}

	isSociallyDisabled(): boolean {
		switch (this.system.type) {
			case "shadow":
			case "tarot":
				return true;
			case "pc":
				const statuses : StatusEffectId[] = ["jailed", "exhausted", "crippled", "injured"];
				return statuses.some( x=> this.hasStatus(x));

			case "npc":
				return this.system.weeklyAvailability.disabled || this.tarot == undefined;
			default:
				this.system satisfies never;
				throw new PersonaError("Unknown type");
		}
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

	/** return true if target is harder to disengage from (hard diff)
	 */
	isSticky() : boolean {
		return this.hasStatus("sticky");
	}

	isDistracted() : boolean {
		const distractingStatuses :StatusEffectId[] = [
			"confused",
			"down",
			"fading",
			"fear",
			"frozen",
			"sleep",
			"shock",
			"dizzy",
			"burn",
		];
		return distractingStatuses.some( status => this.hasStatus(status));
	}

	async setDefaultShadowCosts(this: Shadow, power: Power) {
		if (!this.items.get(power.id)) {
			ui.notifications.warn("Shadow can't edit power it doesn't own");
			return;
		}
		const role = this.system.role;
		const userLevel = this.system.combat.classData.level
			+ (this.system.combat.classData.incremental.talent ? 1 : 0)
		const powerLevel = power.powerEffectLevel();
		const diff = powerLevel - userLevel;
		const cost = PersonaActor.calcPowerCost(role, power, diff);
		const energyReq = PersonaActor.calcPowerRequirement(role, power,  diff);
		await power.update({
			"system.energy.required": energyReq,
			"system.energy.cost": cost
		});
	}

allOutAttackDamage(this: PC | Shadow, situation?: Situation) : { high: number, low: number } {
	let high = 0, low = 0;
	if (this.isDistracted() || !this.isCapableOfAction()) {
		return {high, low};
	}
	if (!situation) {
		situation = {
			user: this.accessor,
			attacker: this.accessor,
		};
	}
	const wpndmg = this.wpnDamage();
	//temporarily removed to see about increasing damage base instead
	// const levelBasedScaling = this.system.combat.classData.level / 3;
	const mult = this.wpnMult();
	const bonusdmg = this.getBonusWpnDamage();
	high += (wpndmg.high * mult) + bonusdmg.high.total(situation) ;
	low += (wpndmg.low * mult) + bonusdmg.low.total(situation);
	return {high, low};
}

	getPoisonDamage(this: PC | Shadow): number {
		const base = Math.round(this.mhp * 0.15);
		if (this.system.type == "pc") return base;
		switch (this.system.role) {
			case "miniboss":
			case "miniboss-lord":
			case "boss-lord":
			case "boss":
				return Math.round(base / 4);
			default:
				return base;
		}
	}

	static calcPowerRequirement(role: Shadow["system"]["role"], power: Readonly<Power>,  diff: number) : number {
		if (power.system.tags.includes("basicatk"))
			return 0;
		const tags = power.system.tags;
		switch (role) {
			case "support":
				if (!tags.includes("debuff")) {
					diff -= 2;
				}
				if (tags.includes("buff")
					|| tags.includes("healing")) {
					diff += 1;
				}
				break;
			default:
				break;
		}
		return Math.clamp(diff, 0, 4);
	}

	static calcPowerCost(_role: Shadow["system"]["role"], power: Readonly<Power>, diff: number) : Power["system"]["reqEscalation"] {
		if (power.system.tags.includes("basicatk"))
			return 0;
		if (diff <= 0) return 0;
		let esc = Math.round(Math.abs(diff) / 2);
		return Math.clamp(esc, 0, 6);
	}

	async increaseScanLevel(this: Shadow, amt :number) {
		const scanLevel = this.system.scanLevel ?? 0;
		if (scanLevel >= amt) return;
		if (this.token) {
			await this.token.baseActor.increaseScanLevel(amt);
		}
		await this.update({"system.scanLevel": amt});
		if (amt > 0) {
			this.ownership.default = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
			await this.update({"ownership": this.ownership});
		}
	}

	async setEnergy(this: Shadow, amt: number) {
		amt = Math.clamp(amt, -1, this.system.combat.energy.max);
		await this.update({"system.combat.energy.value": amt});
	}

	async alterEnergy(this: Shadow, amt: number) {
		await this.setEnergy(this.system.combat.energy.value + amt);
	}

	async onCombatStart() {
	}

get tagList() : CreatureTag[] {
	if (this.system.type == "tarot") return [];
	let list = this.system.creatureTags.slice();
	switch (this.system.type) {
		case "pc":
			if (!list.includes("pc")) {
				list.push("pc");
			}
			return list;
		case "npc": return list;
		case "shadow": return list;
		default:
			this.system satisfies never;
			return [];
	}

}
	hasCreatureTag(tag: CreatureTag) : boolean{
		return this.tagList.includes(tag);
	}

	async deleteCreatureTag(index: number) : Promise<void> {
		const tags = this.system.creatureTags;
		tags.splice(index, 1);
		await this.update( {"system.creatureTags": tags});
	}

	async addCreatureTag() : Promise<void> {
		const tags = this.system.creatureTags;
		tags.push("neko");
		await this.update( {"system.creatureTags": tags});
	}

	async onAddToCombat() {
		switch (this.system.type) {
			case "shadow":
				const sit : Situation = {
					user: (this as Shadow).accessor,
				}
				const startingEnergy = 1 + (this as Shadow).getBonuses("starting-energy").total(sit);
				await (this as Shadow).setEnergy(startingEnergy);
				break;
			case "pc":
			case "npc":
			case "tarot":
				break;
		}

	}


	static convertSlotToMP(slotLevel: number) {
			switch (slotLevel) {
				case 0: return 4;
				case 1: return 8;
				case 2: return 12;
				case 3: return 24;
				default: return 48;
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
	if (token.actor && game.user.isGM && token.actor.system.type == "shadow") {
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
	isDating: boolean,
}

