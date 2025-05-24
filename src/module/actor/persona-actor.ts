import { PersonaRoller } from "../persona-roll.js";
import { RollSituation } from "../../config/situation.js";
import { randomSelect } from "../utility/array-tools.js";
import { Persona } from "../persona-class.js";
import { SHADOW_ROLE } from "../../config/shadow-types.js";
import { PowerTag } from "../../config/power-tags.js";
import { POWER_TAGS_LIST } from "../../config/power-tags.js";
import { localizeStatusId } from "../../config/status-effects.js";
import { fatigueLevelToStatus } from "../../config/status-effects.js";
import { statusToFatigueLevel } from "../../config/status-effects.js";
import { FatigueStatusId } from "../../config/status-effects.js";
import { statusMap } from "../../config/status-effects.js";
import { PersonaScene } from "../persona-scene.js";
import { poisonDamageMultiplier } from "../../config/shadow-types.js";
import { TriggeredEffect } from "../triggered-effect.js";
import { shadowRoleMultiplier } from "../../config/shadow-types.js";
import { RealDamageType } from "../../config/damage-types.js";
import { SkillCard } from "../item/persona-item.js";
import { UsableAndCard } from "../item/persona-item.js";
import { ValidSocialTarget } from "../social/persona-social.js";
import { ValidAttackers } from "../combat/persona-combat.js";
import { FlagData } from "../../config/actor-parts.js";
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


export class PersonaActor extends Actor<typeof ACTORMODELS, PersonaItem, PersonaAE> {
	declare statuses: Set<StatusEffectId>;
	declare sheet: PersonaActorSheetBase;

	static MPMap = new Map<number, number>;

	cache: {
		tarot: Tarot | undefined;
		complementRating: Map<Shadow["id"], number>;
	};

	constructor(...arr: any[]) {
		super(...arr);
		this.cache = {
			tarot: undefined,
			complementRating: new Map(),
		}
	}

	get mp() : number {
		switch (this.system.type) {
			case "npcAlly":
			case "pc": break;
			case "shadow":
			case "npc":
			case "tarot":
				return 0;
			default:
				this.system satisfies never;
				return 0;
		}
		return this.system.combat.mp.value;
	}

	isNPC(): this is NPC {
		return this.system.type == "npc";
	}

	isSocialLink(): this is SocialLink {
		if (!this.isNPC() && !this.isPC()) {
			return false;
		}
		if (this.tarot == undefined) return false;
		return true;
	}

	isPC(): this is PC {
		return this.system.type == "pc";
	}

	isNPCAlly(): this is NPCAlly {
		return this.system.type == "npcAlly";
	}

	isShadow(): this is Shadow {
		return this.system.type == "shadow";
	}

	isTarot(): this is Tarot {
		return this.system.type == "tarot";
	}

	isRealPC(): this is PC {
		return this.system.type == "pc" && this.hasPlayerOwner && this.tarot != undefined;
	}

	async setAsNavigator(this: NPCAlly) {
		for (const ally of PersonaDB.NPCAllies()) {
			if (ally == this) continue;
			if (!ally.system.combat.isNavigator) continue;
			if (!ally.isOwner) {
				PersonaError.softFail(`Can't change navigator status on ${ally.name}, no ownership`);
				continue;
			}
			await ally.update({ "system.combat.isNavigator": false});
		}
		PersonaDB.clearCache();
		if (PersonaDB.getNavigator() != this) {
			PersonaError.softFail("Navigator was set improperly");
			return;
		}
		await Logger.sendToChat(`${this.name} set to party navigator`, this);
	}

	get mmp() : number {
		if (!this.isValidCombatant()) return 0;
		switch (this.system.type) {
			case "npcAlly": case "pc":
				break;
			case "shadow":
				return 0;
			default:
				this.system satisfies never;
				return 0;
		}
		const persona = this.persona();
		const sit ={user: PersonaDB.getUniversalActorAccessor(this as PC)};
		const bonuses = persona.getBonuses("maxmp");
		const mult = 1 + persona.getBonuses("maxmpMult").total(sit);
		const lvlmaxMP = (this as PC | NPCAlly).calcBaseClassMMP();
		const val = Math.round((mult * (lvlmaxMP)) + bonuses.total(sit));
		(this as PC | NPCAlly).refreshMaxMP(val);
		return val;
	}

	calcBaseClassMMP(this: PC | NPCAlly): number {
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
		const MP = prevMP + (prevMP * (0.33 - ((level - 2) * .02)));
		this.MPMap.set(level, MP);
		return MP;
	}

	async refreshMaxMP(this: PC | NPCAlly, amt = this.mmp) {
		if (amt == this.system.combat.mp.max) return;
		await this.update( { "system.combat.mp.max": amt});
	}

	async refreshHpTracker(this:ValidAttackers)  {
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

	get inventory() : (Consumable | InvItem | Weapon | SkillCard)[] {
		return this.items.filter( x=> x.system.type == "item" || x.system.type == "weapon" || x.system.type == "consumable" || x.system.type == "skillCard") as (Consumable | InvItem | Weapon)[];
	}

	get consumables(): Consumable[] {
		const consumables =  this.items.filter( x=> x.system.type == "consumable" || x.system.type == "skillCard") as Consumable[];
		return consumables.sort( (a,b) => {
			if (!a.isCraftingItem && b.isCraftingItem ) return -1;
			if (!b.isCraftingItem && a.isCraftingItem ) return 1;
			return a.name.localeCompare(b.name)
		}
		);
	}

	get nonUsableInventory() : (SkillCard | InvItem | Weapon)[] {
		const inventory = this.items.filter( i=> i.system.type == "item" || i.system.type == "weapon" || i.system.type == "skillCard") as (InvItem | Weapon)[];
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
			case "npcAlly":
			case "shadow":
					const combat = game.combat as PersonaCombat | undefined;
				if (!combat) return this.name;
				const token = combat.getCombatantByActor(this as ValidAttackers)?.token;
				if (!token) return this.name;
				return token.name;
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

	/** gets the real NPC of an NPC Ally*/
	getNPCProxyActor(this: NPCAlly) : NPC | PC | undefined {
		const proxyId = this.system.NPCSocialProxyId;
		if (!proxyId)
			return undefined;
		const npc = PersonaDB.socialLinks()
			.find( x=> x.id == proxyId);
		if (!npc || npc.system.type != "npc" && npc.system.type != "pc") {
			PersonaError.softFail(`Can't find Proxy actor for: ${this.name}`);
		}
		return npc as NPC | PC;
	}

	isUsingBasePersona(this: ValidAttackers) : boolean {
		if ("activePersona" in this.system) {
			const active = this.system.activePersona;
			return !active  || active == this.id;
		}
		return true;
	}

	get basePersona() : Persona<ValidAttackers> {
		if (!this.isValidCombatant()) {
			throw new PersonaError("Can't call basePersona getter on non combatant");
		}
		return new Persona(this, this, this.#mainPowers());
	}

	persona<T extends ValidAttackers>(this: T): Persona<T> {
		switch (this.system.type) {
			case "pc":
			case "npcAlly":
				if (this.isNPCAlly() || (this.isPC() && (this.system.activePersona == null || this.system.activePersona == this.id))) {
					return this.basePersona as Persona<T>;
				}
				const activePersona = game.actors.get((this as PC).system.activePersona) as ValidAttackers;
				if (!activePersona) {
					return this.basePersona as Persona<T>
				};
				return Persona.combinedPersona(this.basePersona, activePersona.basePersona) as Persona<T>;
			case "shadow":
				return this.basePersona as Persona<T>;
			default:
				this.system satisfies never;
				throw new PersonaError(`Can't get persona for ${this.name}`);
		}
	}

	async addPersona(this: PC, shadow: Shadow) {
		if (!shadow.hasPlayerOwner || !shadow.isOwner) {
			PersonaError.softFail("Can't add this, doesn't have a player owner");
		}
		const arr = this.system.personaList.slice();
		arr.push(shadow.id);
		await this.update( {"system.personaList": arr});
		ui.notifications.notify(`Persona ${shadow.displayedName} added`);
	}

	get combatInit(): number {
		if (!this.isValidCombatant()) return -666;
		const situation = {user: (this as PC | Shadow).accessor};
		const initBonus = this.persona()
			.getBonuses("initiative")
			.total(situation);
		switch (this.system.type) {
			case "shadow": {
				const inc = this.system.combat.classData.incremental.initiative;
				const level  = this.system.combat.classData.level;
				const initRating = this.system.combat.initiative;
				const initScore = this.#translateInitString(initRating);
				return initBonus + (inc * 2) + (level * 3) + initScore;
			}
			case "pc":  case "npcAlly": {
				const inc = this.system.combat.classData.incremental.initiative;
				const level  = this.system.combat.classData.level;
				const initRating = this.system.combat.initiative;
				const initScore = this.#translateInitString(initRating);
				return initBonus + (inc * 2) +  (level * 3) + initScore;
			}
			default:
				this.system satisfies never;
				throw new PersonaError(`Unepxected Type`);
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
			case "npcAlly":
				classNameDefault = "Persona User";
				break;
			case "pc":
				classNameDefault = "Persona User";
				break;
			case "shadow":
				classNameDefault = "Persona User";
				// classNameDefault = "Shadow";
				break;
			case "npc":
				throw new Error("NPCs have no classes");
			case "tarot":
				throw new Error("Tarot cards have no classes");
			default:
				this.system satisfies never;
				throw new Error("Undefined type");
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
			case "npcAlly":
				return this.system.combat.hp;
			default:
				this.system satisfies never;
				throw new PersonaError(`Unknown Type, can't get hp`);
		}
	}

	get mhp() : number {
		if (!this.isValidCombatant()) return 0;
		try {
			const persona = this.persona();
			const sit ={user: PersonaDB.getUniversalActorAccessor(this as PC)};
			const inc = this.system.combat.classData.incremental.hp ?? 0;
			const lvl = this.system.combat.classData.level;
			const nonMultbonuses = persona.getBonuses("maxhp");
			const newForm = persona.getBonuses("maxhpMult-new");
			const lvlbase = this.class.getClassProperty(lvl, "maxhp");
			const diff = this.class.getClassProperty(lvl+1, "maxhp") - lvlbase;
			const incBonus = Math.round(inc / 3 * diff);
			const weaknesses = Object.values(this.system.combat.resists)
				.filter(x=> x == "weakness")
				.length;
			const resists = Object.values(this.system.combat.resists)
				.filter(x=> x == "resist")
				.length;
			const blocks = Object.values(this.system.combat.resists)
				.filter(x=> x == "block" || x == "absorb" || x == "reflect")
				.length;
			const multmods = persona.getBonuses("maxhpMult")
			if (weaknesses > 1) {
				const bonus = (weaknesses -1 ) * 0.25;
				multmods.add("weaknesses mod", bonus)
			}
			if (this.system.combat.resists.physical == "weakness") {
				newForm.add("weak to Physical", 1.25);
			}
			if (this.isShadow()) {
				const overResist = blocks + (0.5 * resists) - (weaknesses * 1);
				if (overResist > 2.5) {
					const penalty = overResist * -0.07;
					multmods.add("overResist/Block Mod", penalty);
				}
			}
			// bonuses.add("incremental bonus hp", incBonus)
			const mult = multmods.total(sit, "percentage-special");
			const newformMult = newForm.total(sit, "percentage");
			const mhp = (newformMult * mult * (lvlbase + incBonus)) + nonMultbonuses.total(sit);
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

	/** returns the total SLs that the PCs have with this character*/
	get totalSLs() : number {
		switch (this.system.type) {
			case "shadow":
			case "tarot": return 0;
			case "pc":
			case "npc":
			case "npcAlly":
				let targetActor : NPC | PC | NPCAlly = this as any;
				if (this.isNPCAlly()) {
					const proxy = this.getNPCProxyActor();
					if (!proxy) {return 0;}
					targetActor = proxy;
				}
				return PersonaDB.realPCs()
					.reduce( (acc, pc) => acc + pc.getSocialSLWith(targetActor), 0)
			default:
				this.system satisfies never;
				return -1;
		}
	}

	get socialBenefits() : SocialBenefit[] {
		let focuses : Focus[] = [];
		switch (this.system.type) {
			case "pc": return [];
			case "shadow": return [];
			case "tarot":
				focuses = this.focii;
				break;
			case "npc": case "npcAlly":
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

	getSocialStatToRaiseLink(this: ValidSocialTarget, classification: "primary" | "secondary") : SocialStat {
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
			case "npcAlly":
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
			case "npcAlly":
				return [];
			case "pc":
				break;
			default:
				this.system satisfies never;
				throw new PersonaError("Something weird happened");
		}
		const currentLinks = this.system.social.map(x=> x.linkId);
		const list = PersonaDB.socialLinks()
			.filter( x=> !currentLinks.includes(x.id))
			.filter( (x : PC | NPC)=> Object.values(x.system.weeklyAvailability).some(x=> x == true))
			.filter( (x : PC | NPC)=> !!x.system.tarot)
		return list;
	}

	get recoveryAmt(): number {
		if (!this.isPC()) return 0;
		const persona = this.persona();
		const rec_bonuses = persona.getBonuses("recovery");
		rec_bonuses.add("Base", 10);
		const situation : Situation = {
			user: (this as PC).accessor
		};
		const rec_mult = persona.getBonuses("recovery-mult").total(situation, "percentage");
		const healing = rec_bonuses.total(situation);
		return healing * rec_mult;
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

	#mainPowers() : Power[] {
		switch (this.system.type) {
			case "npc": case "tarot": return [];
			case "npcAlly":
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

	get mainPowers() : Power[] {
		switch (this.system.type) {
			case "npc": case "tarot": return [];
			case "pc":
			case "shadow":
			case "npcAlly":
				return (this as ValidAttackers).persona().powers;
			default:
				this.system satisfies never;
				return [];
		}
	}

	get sideboardPowers() : Power [] {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
				return [];
			case "npcAlly":
			case "pc":
				break;
			default:
				this.system satisfies never;
		}
		const powerIds = this.system.combat.powers_sideboard;
		const pcPowers : Power[] = powerIds.flatMap( id=> {
			const i = PersonaDB.getItemById(id);
			return (i ? [i as Power] : []);
		});
		return pcPowers;
	}

	get bonusPowers() : Power[] {
		switch (this.system.type) {
			case "npc": case "tarot":
				return [];
			case "shadow":
			case "pc":
			case "npcAlly":
				const bonusPowers : Power[] =
					this.mainModifiers({omitPowers:true})
					.filter(x=> x.grantsPowers())
					.flatMap(x=> x.getGrantedPowers(this as PC ))
					.sort ( (a,b)=> a.name.localeCompare(b.name)) ;
				return removeDuplicates(bonusPowers);
			default:
				this.system satisfies never;
				return [];
		}
	}

	get basicPowers() : Power [] {
		switch (this.system.type) {
			case "npc": case "tarot":
				return [];
			case "shadow":
				return PersonaItem.getBasicShadowPowers();
			case "pc":
			case "npcAlly":
				const arr = PersonaItem.getBasicPCPowers();
				const extraSkills = [
					this.teamworkMove,
					...this.navigatorSkills,
				].flatMap( x=> x != undefined ? [x] : []);
				arr.push (...extraSkills);
				return arr;
			default:
				this.system satisfies never;
				return [];
		}
	}

	get maxPowers() : number {
		if (!this.isValidCombatant()) return 0;
		switch (this.system.type) {
			case "npcAlly":
				return 8;
			case "pc":
			case "shadow":
				const extraMaxPowers = this.persona().getBonuses("extraMaxPowers");
				return 8 + extraMaxPowers.total ( {user: (this as PC | Shadow).accessor});
			default:
				this.system satisfies never;
				return -1;
		}
	}

	get maxMainPowers() : number {
		switch (this.system.type) {
			case "npc":
			case "tarot":
				return 0;
			case "pc":
			case "npcAlly":
			case "shadow":
				return 8;
			default:
				this.system satisfies never;
				return -1;
		}
	}

	async addNavigatorSkill(this: NPCAlly, pwr: Power) {
		this.system.combat.navigatorSkills.pushUnique(pwr.id);
		await this.update( {"system.combat.navigatorSkills" : this.system.combat.navigatorSkills});
		await Logger.sendToChat(`${this.name} added Navigator skill: ${pwr.name}` , this);
	}

	async deleteNavigatorSkill(this: NPCAlly, power: Power ) {
		this.system.combat.navigatorSkills= this.system.combat.navigatorSkills.filter(x=> x != power.id);
		await this.update( {"system.combat.navigatorSkills" : this.system.combat.navigatorSkills});
		await Logger.sendToChat(`${this.name} deleted Navigator skill ${power.name}` , this);
	}

	get navigatorSkills(): Power[] {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
			case "pc":
				return [];
			case "npcAlly":
				const powers = this.system.combat.navigatorSkills
				.map( id => PersonaDB.getPower(id))
				.filter( x=> x != undefined);
				// const powers = PersonaDB.allPowers().filter(x=> x.id == id);
				return powers;
			default:
				this.system satisfies never;
				return [];
		}
	}

	get maxSideboardPowers() : number {
		if (!this.isValidCombatant()) return 0;
		switch (this.system.type) {
			case "npcAlly":
			case "shadow":
				return 0;
			case "pc":
				const extraMaxPowers = this.persona().getBonuses("extraMaxPowers");
				return extraMaxPowers.total ( {user: (this as PC | Shadow).accessor});
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

	randomItem(this:PC): InvItem | SkillCard | Weapon | Consumable  {
		const items = this.items.filter(x=> x.isTrueItem() == true);
		return randomSelect(items) as InvItem | SkillCard | Weapon | Consumable;
	}

	get weapon() : Option<Weapon> {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
				return null;
			case "pc":
			case "npcAlly":
				break;
			default:
				this.system satisfies never;
		}
		const id = this.system.equipped.weapon;
		const item = this.items.find( x=> x.id == id);
		if (item) return item as Weapon;
		const dbitem = PersonaDB.getItemById(id);
		if (dbitem) return dbitem as Weapon;
		return null;
	}

	unarmedTagList() : PowerTag[] {
		if (POWER_TAGS_LIST.includes (this.getUnarmedDamageType() as any)) {
			return [this.getUnarmedDamageType()] as PowerTag[];
		}
		return [];
	}

	get talents() : Talent[] {
		switch (this.system.type) {
			case "tarot":
			case "npc":
				return [];
			case "shadow":
				return this.items.filter( x=> x.system.type == "talent") as Talent[];
			case "pc":
			case "npcAlly":
				break;
			default:
				this.system satisfies never;
				return [];
		}
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
		return this.items.filter( x=> x.isFocus()) as Focus[];
	}

	passiveFocii(this: ValidAttackers): Focus[] {
		return this.persona().passiveFocii();
	}

	defensiveFocii(this: ValidAttackers): Focus[] {
		return this.persona().defensiveFocii();
	}

	async modifyHP( this: ValidAttackers, delta: number) {
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

	async modifyMP( this: PC | NPCAlly, delta: number) {
		let mp = this.system.combat.mp.value;
		mp += delta;
		mp = Math.clamp(Math.round(mp), 0, this.mmp);
		await this.update( {"system.combat.mp.value": mp});
	}

	async refreshHpStatus(this: ValidAttackers, newval?: number) {
		const startingHP = this.system.combat.hp;
		const hp = newval ?? this.system.combat.hp;
		if (hp > 0) {
			await this.clearFadingState();
		}
		if (hp > this.mhp) {
			await this.update( {"system.combat.hp": this.mhp});
		}
		if (newval != undefined) {
			if (startingHP > 0  && newval <= 0) {
				await this.onKO();
			}
			if (startingHP <= 0 && newval > 0) {
				await this.onRevive();
			}
		}
		await this.updateOpacity(hp);
	}

	async updateOpacity(this: ValidAttackers, hp: number) {
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
				const save = await PersonaRoller.rollSave(this as Shadow, {
					DC: 11,
					label:`Resist status ${id}`,
					askForModifier: false,
					saveVersus: id,
					modifier: 0,
					rollTags: ["resist-status"],
				});
				await save.toModifiedMessage(true);
				if (save.success) return true;
				break;
			default:
				resist satisfies never;
		}
		return false;
	}

	/**error catch wrapper for this funciton as Monks's statuses was throwing here and may have been breaking hooks when it failed.*/
	override async toggleStatusEffect(statusId: StatusEffectId, options?: Foundry.ToggleStatusOptions) {
		try {
			const ret = super.toggleStatusEffect(statusId, options);
			return ret;
		} catch (error ) {
			const e = error as Error;
			console.warn(`${e.toString()} \n ${e.stack}`);
			return undefined;
		}
	}

	/** returns true if status is added*/
	async addStatus({id, potency, duration}: StatusEffect, ignoreFatigue= false): Promise<boolean> {
		if (!ignoreFatigue && statusMap?.get(id)?.tags.includes("fatigue")) {
			const lvl = statusToFatigueLevel(id as FatigueStatusId);
			const oldLvl = this.fatigueLevel;
			await this.setFatigueLevel(lvl);
			const newLvl = this.fatigueLevel;
			return oldLvl != newLvl;
		}
		if (await this.isStatusResisted(id)) return false;
		const stateData = CONFIG.statusEffects.find ( x=> x.id == id);
		if (!stateData) {
			throw new Error(`Couldn't find status effect Id: ${id}`);
		}
		const instantKillStatus : StatusEffectId[] = ["curse", "expel"];
		if ( instantKillStatus.some(status => id == status) && this.isValidCombatant()) {
			this.hp -= 9999;
		}
		// id = await this.checkStatusEscalation(id);
		const eff = this.effects.find( eff => eff.statuses.has(id));
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
			const adjustedDuration = this.getAdjustedDuration(duration, id);
			await newEffect.setDuration(adjustedDuration);
			return true;
		} else  {
			if (potency && eff.potency < potency) {
				await eff.setPotency(potency);
			}
			eff.duration.startRound = game?.combat?.round ?? 0;
			await eff.update({"duration": eff.duration});
			const adjustedDuration = this.getAdjustedDuration(duration, id);
			if (typeof duration != "string" && eff.durationLessThanOrEqualTo(adjustedDuration)) {
				await eff.setDuration(adjustedDuration);
			}
			//TODO: update the effect
			return false;
		}

	}

	getAdjustedDuration( duration: StatusDuration, id: StatusEffect["id"]) : StatusDuration {
		if (!this.isValidCombatant()) return duration;
		try {
			switch (duration.dtype)  {
				case "X-rounds":
				case "3-rounds":
					const tags = CONFIG.statusEffects.find(x=> x.id == id)?.tags;
					if (!tags) {
						PersonaError.softFail(`Bad status Id: ${id}`);
						return duration;
					}
					if (!tags.includes("baneful") || tags.includes("downtime"))  {
						return duration;
					}
					const situation : Situation = {
						user: (this as ValidAttackers).accessor,
						target: (this as ValidAttackers).accessor,
						statusEffect: id,
					};
					const modifier = this.persona().getBonuses("baleful-status-duration").total(situation);
					const reducedAmt = Math.max(0, duration.amount + modifier);
					return {
						...duration,
						amount: reducedAmt,
					};
				default:
					return duration;
			}
		} catch (e) {
			PersonaError.softFail("Problem with getAdjusted Duration");
			Debug(e);
			return duration;
		}
	}

	get openerActions() : Usable[] {
		if (this.system.type == "npc" || this.system.type == "tarot")
			return [];
		const powerBased = (this.system.type == "shadow" ? this.mainPowers : this.consumables)
			.filter( power => power.isOpener());
		const arr : Usable[] = (this as ValidAttackers).mainModifiers({omitPowers:true})
			.filter(x=> x.grantsPowers())
			.flatMap(x=> x.getOpenerPowers(this as PC ) as Usable[])
			.concat(powerBased);
		return removeDuplicates(arr);
	}

	async setTeamworkMove(this: ValidAttackers, power: Power) {
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
		switch (this.system.type) {
			case "pc":
			case "npcAlly":
				break;
			case "shadow":
			case "tarot":
			case "npc":
				return undefined;
			default:
				this.system satisfies never;
				return undefined;
		}
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

	/** returns true if nullfied **/
	async checkStatusNullificaton(statusId: StatusEffectId) : Promise<boolean> {
		let cont = false;
		let remList : StatusEffectId[] = [];
		switch (statusId) {
			case "defense-boost":
				remList.push("defense-nerf");
				break;
			case "defense-nerf":
				remList.push("defense-boost");
				break;
			case "attack-boost":
				remList.push("attack-nerf");
				break;
			case "attack-nerf":
				remList.push("attack-boost");
				break;
			case "damage-boost":
				remList.push("damage-nerf");
				break;
			case "damage-nerf":
				remList.push("damage-boost");
				break;
		}
		if (this.hp <= 0) {
			const allNonDowntimeStatus = this.effects.filter( x=> x.isStatus && !x.isDowntimeStatus && !x.statuses.has("fading"));
			const list = allNonDowntimeStatus.flatMap( x=> Array.from(x.statuses));
			remList.push(...list)
			cont = true;
		}
		let removed =0;

		for (const id of remList) {
			if (this.hasStatus(id)) {
				removed++;
				await this.removeStatus(id);
			}
		}
		return removed > 0 && !cont;
	}

	/** returns new status to escalate if needed  */
	async checkStatusEscalation (statusId: StatusEffectId) : Promise <StatusEffectId>  {
		let remList : StatusEffectId[] = [];
		let returnStatus: StatusEffectId = statusId;
		switch (statusId) {
			case "tired":
				if (!this.hasStatus("tired")) break;
				remList.push("tired");
				returnStatus = "exhausted";
				break;
			case "exhausted":
				remList.push("tired");
				returnStatus = "exhausted";
				break;
			default:
				returnStatus = statusId;
				break;
		}
		for (const id of remList) {
			await this.removeStatus(id);
		}
		return returnStatus;
	}

	async removeStatus(status: Pick<StatusEffect, "id"> | StatusEffectId) : Promise<boolean>{
		const id = typeof status == "object" ? status.id : status;
		const promises = this.effects
		.filter( eff => eff.statuses.has(id))
		.map( eff => eff.delete());
		await Promise.all(promises);
		return promises.length > 0;
	}

	equippedItems() : (InvItem | Weapon)[]  {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
				return [];
			case "pc":
			case "npcAlly":
				break;
			default:
				this.system satisfies never;
				return [];
		}
		const inv = this.inventory;
		const slots : (keyof typeof this.system.equipped)[]=  ["weapon", "body", "accessory", "weapon_crystal"]
		const ret = slots
			.map( slot=> inv
				.find(item => item.id == (this as PC).system.equipped[slot]))
			.flatMap (x=> x? [x]: []);
		return ret as (InvItem | Weapon)[];
	}

	passiveItems(): InvItem[] {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
				return [];
			case "pc":
			case "npcAlly":
				break;
			default:
				this.system satisfies never;
				return [];
		}
		const inv = this.inventory;
		return inv.filter( item => item.system.type == "item" && (item.system.slot == "none" || item.system.slot =="key-item")) as InvItem[];
	}

	wpnDamage(this: ValidAttackers) : {low: number, high:number} {
		let basedmg: {low: number, high:number};
		switch (this.system.type) {
			case "pc": case "npcAlly":
				const wpn = this.weapon;
				if (!wpn) {
					return  {low: 1, high:2};
				}
				basedmg =  wpn.system.damage;
				break;
			case "shadow":
				basedmg = this.system.combat.wpndmg;
				break;
			default:
				this.system satisfies never;
				return {low: 0, high: 0};
		}
		return basedmg;
	}

	getBonusWpnDamage(this: ValidAttackers) : {low: ModifierList, high: ModifierList} {
		const persona = this.persona();
		const total = persona.getBonuses("wpnDmg");
		const low = persona.getBonuses("wpnDmg_low");
		const high = persona.getBonuses("wpnDmg_high");
		return {
			low: total.concat(low),
			high: total.concat(high)
		}
	}

	getPersonalBonuses(modnames : ModifierTarget | ModifierTarget[], sources: ModifierContainer[] = this.actorMainModifiers()) : ModifierList  {
		let modList = new ModifierList( sources.flatMap( item => item.getModifier(modnames, this)
			.filter( mod => mod.modifier != 0 || mod.variableModifier.size > 0)
		));
		return modList;
	}

	actorMainModifiers(): ModifierContainer[] {
		return [
			...this.passiveItems(),
			...this.getAllSocialFocii(),
			...this.equippedItems(),
		].filter (x=> x.getEffects(this).length > 0);
	}

	hpCostMod(this: ValidAttackers) : ModifierList {
		return this.persona().getBonuses("hpCostMult");
	}

	get treasureMultiplier () : number {
		if (!this.isValidCombatant()) return 1;
		switch (this.system.type) {
			case "pc": case "npcAlly":
				const situation :Situation = {
					user: (this as PC | NPCAlly).accessor
				};
				const bonus= this.persona().getBonuses("shadowMoneyBoostPercent").total(situation, "percentage");
				return !Number.isNaN(bonus) ? bonus : 1;
			default:
				return 1;
		}
	}

	getFatigueStatus() : FatigueStatusId | undefined {
		const eff = this.effects.contents.find( x=> x.getFatigueStatus() != undefined);
		return eff?.getFatigueStatus();
	}

	get fatigueLevel() : number {
		if (this.system.type != "pc") return 0;
		const st = this.getFatigueStatus();
		return statusToFatigueLevel(st);
	}

	hasAlteredFatigueToday(this:PC): boolean {
		return this.system.fatigue.hasAlteredFatigueToday ?? false;
	}

	hasMadeFatigueRollToday(this:PC) : boolean {
		return this.system.fatigue.hasMadeFatigueRollToday ?? false;
	}

	async setAlteredFatigue(val = true) {
		await this.update({"system.fatigue.hasAlteredFatigueToday": val});
	}

	async setFatigueLevel(lvl: number,log = true) : Promise<FatigueStatusId | undefined> {
		const oldLvl = this.fatigueLevel;
		const oldId = fatigueLevelToStatus(oldLvl);
		const newId = fatigueLevelToStatus(lvl);
		for (const eff of this.effects.contents) {
			if (eff.isFatigueStatus) {
				if (!eff.statuses.has(newId!))
					await eff.delete();
			}
		}
		if (newId) {
			await this.addStatus( {
				id: newId,
				duration: {
					dtype:"permanent",
				}
			}, true);
		}
		if (lvl < -1) {
			await this.addStatus( {
				id: "crippled",
				duration: {
					dtype:"permanent",
				}
			}, true);
		}
		// const newId = await this.setFatigueLevel(st);
		if (log && (oldId != newId || lvl < -1)) {
			const oldName = oldId ? localize(statusMap.get(oldId)!.name) : "Normal";
			const newName = newId ? localize(statusMap.get(newId)!.name): "Normal";
			const hospital = lvl < -1 ? `${this.displayedName} is over-fatigued and need to be hospitalized!`: "";
			await Logger.sendToChat(`${this.displayedName}  fatigue changed from ${oldName} to ${newName}. ${hospital}`);
		}
		return newId;
	}

	async alterFatigueLevel(amt: number, log=true) : Promise<FatigueStatusId | undefined> {
		const oldLvl = this.fatigueLevel;
		const newLvl = oldLvl + amt;
		return await this.setFatigueLevel(newLvl, log);
	}

	getUnarmedDamageType(): RealDamageType {
		if (this.system.type == "shadow") return this.system.combat.baseDamageType ?? "physical";
		return "physical";
	}

	listComplementRatings(this: Shadow, list: Shadow[]) : string[] {
		return list.map( shadow => {
			const rating = Math.round(this.complementRating(shadow) * 10) / 10;
			return {rating, name: shadow.name};
		})
			.sort( (a,b) => b.rating - a.rating)
			.map(x => `${x.name}: ${x.rating}`)

	}

	complementRating (this: Shadow, other: Shadow) : number {
		const cachedRating = this.cache.complementRating.get(other.id);
		if (cachedRating != undefined) {
			return cachedRating;
		}
		const rating = this.#complementRating(other) + other.#complementRating(this);
		this.cache.complementRating.set(other.id, rating);
		return rating;
	}

	#complementRating (this: Shadow, other: Shadow) : number {
		let rating = 0;
		if (this == other) return 0; //baseline
		const scaledPairs : [Shadow["system"]["role"], Shadow["system"]["role"], number][] = [
			["soldier", "lurker", 1],
			["soldier", "support", 1],
			["soldier", "artillery", 1],
			["brute", "support", 1],
			["brute", "controller", 1],
			["assassin", "lurker", -1],
			["lurker", "support", -1],
			["lurker", "controller", 1],
			["lurker", "lurker", -0.5],
			["soldier", "soldier", -0.5],
			["support", "support", -0.5],
		] as const;
		for (const [r1,r2, amt] of scaledPairs) {
			if (this.hasRole(r1) && other.hasRole(r2)) {
				rating += amt
			}
		}
		const thisP= this.persona();
		const otherP = other.persona();
		const weaknesses = DAMAGETYPESLIST
			.filter( dmg => dmg != "by-power" && thisP.elemResist(dmg) == "weakness") as RealDamageType[];
		rating -= 0.5 * weaknesses.length;
		const normalR = DAMAGETYPESLIST
			.filter( dmg => dmg != "by-power" && thisP.elemResist(dmg) == "normal") as RealDamageType[];
		for (const w of weaknesses) {
			const res = otherP.elemResist(w);
			switch (res)  {
				case "block":
					rating += 2;
					break;
				case "absorb":
				case "reflect":
					rating += 3;
					break;
				case "resist":
					rating += 0.5;
					break;
				case "normal":
					rating -= 1;
					break;
				case "weakness":
					rating -= 2;
					break;
				default:
					break;
			}
		}
		for (const n of normalR) {
			const res = otherP.elemResist(n);
			switch (res) {
				case "resist":
					rating += 0.1;
					break;
				case "absorb":
				case "reflect":
				case "block":
					rating += 1;
					break;
				case "weakness":
					rating -= 1;
					break;
			}
		}

		const attacks = new Set(
			this.powers
			.map(x=> x.system.dmg_type)
			.filter (dmgType => dmgType != "untyped" && dmgType != "none")
		);
		const otherAttacks =
			other.powers
			.map(x=> x.system.dmg_type)
			.filter (dmgType => dmgType != "healing" && dmgType != "untyped" && dmgType != "none")
		rating += otherAttacks.reduce( (acc, dmg) =>
			acc + (!attacks.has(dmg) ? 1 : 0)
			, 0 );
		return rating;
	}

	basePowerCritResist(this: ValidAttackers, power: Usable): number {
		if (!power.isInstantDeathAttack()) return 0;
		const level = this.system.combat.classData.level;
		return Math.floor(level / 2);
	}

	instantKillResistanceMultiplier(this: ValidAttackers, attacker: ValidAttackers) : number {
		const situation : Situation = {
			attacker: attacker.accessor,
			user: this.accessor,
			target: this.accessor,
		}
		return this.persona().getBonuses("instantDeathResistanceMult").total(situation, "percentage");
	}

	mainModifiers(options?: {omitPowers?: boolean} ): ModifierContainer[] {
		if (!this.isValidCombatant()) return [];
		return this.persona().mainModifiers(options);
	}

	defensivePowers(this: ValidAttackers) : ModifierContainer [] {
		if (!this.isValidCombatant()) return [];
		const defensiveItems = this.equippedItems().filter( item => item.hasTag("defensive"));
		return  [
			...defensiveItems,
			...this.persona().powers,
			...this.defensiveFocii(),
		].filter(x=> x.isDefensive())
	}

	getSourcedDefensivePowers(this: ValidAttackers) {
		return this.defensivePowers().flatMap( x=> x.getSourcedEffects(this));
	}

	wpnAtkBonus(this: ValidAttackers) : ModifierList {
		const mods = this.persona().getBonuses(["allAtk", "wpnAtk"]);
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.attack ?? 0;
		const wpnAtk = this.system.combat.wpnatk;
		mods.add("Base Weapon Attack Bonus", wpnAtk);
		mods.add("Level Bonus (x2)", lvl * 2);
		mods.add("Incremental Advance" , inc);
		return mods;
	}

	magAtkBonus(this: ValidAttackers) : ModifierList {
		const mods = this.persona().getBonuses(["allAtk", "magAtk"]);
		const lvl = this.system.combat.classData.level ?? 0;
		const magAtk = this.system.combat.magatk ?? 0;
		const inc = this.system.combat.classData.incremental.attack ?? 0;
		mods.add("Base Magic Attack Bonus", magAtk);
		mods.add("Level Bonus (x2)", lvl * 2);
		mods.add("Incremental Advance" , inc);
		return mods;
	}

	itemAtkBonus(this: ValidAttackers, item :Consumable) : ModifierList {
		const mods = this.persona().getBonuses(["itemAtk", "allAtk"]);
		mods.add("Item Base Bonus", item.system.atk_bonus);
		const lvl = this.system.combat.classData.level ?? 0;
		const inc = this.system.combat.classData.incremental.attack ?? 0;
		mods.add("Level Bonus (x1)", lvl);
		mods.add("Incremental Advance" , inc);
		return mods;
	}

	getDefense(this: ValidAttackers,  type : keyof PC["system"]["combat"]["defenses"]) : ModifierList {
		const mods = new ModifierList();
		const lvl = this.system.combat.classData.level;
		const baseDef = this.#translateDefenseString(type, this.system.combat.defenses[type]);
		const inc = this.system.combat.classData.incremental.defense;
		mods.add("Base", 10);
		mods.add("Base Defense Bonus", baseDef);
		mods.add("Level Bonus (x2)", lvl * 2);
		mods.add("Incremental Advance" , inc);
		const otherBonuses = this.persona().getBonuses([type, "allDefenses"]);
		const defenseMods = this.persona().getBonuses([type, "allDefenses"], this.defensivePowers());
		return mods.concat(otherBonuses).concat(defenseMods);
	}

	#translateDefenseString(this: ValidAttackers, defType: keyof PC["system"]["combat"]["defenses"], val: PC["system"]["combat"]["defenses"]["fort"],): number {
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

	#getWeaknessesInCategory(this: ValidAttackers, defType: keyof PC["system"]["combat"]["defenses"]): number {
		const damageTypes = ELEMENTAL_DEFENSE_LINK[defType];
		const weaknesses= damageTypes.filter( dt => this.system.combat.resists[dt] == "weakness")
		return weaknesses.length;
	}

	// elementalResist(this: ValidAttackers, type: Exclude<DamageType, "by-power">) : ResistStrength  {
	// 	return this.persona().elemResist(type);
	// }

	statusResist(status: StatusEffectId) : ResistStrength {
		switch (this.system.type) {
			case "tarot":
			case "npc":
				return "normal";
			case "pc":
			case "shadow":
			case "npcAlly":
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
				if (!cons.lowerResist && resval(cons.resistanceLevel) > resval(resist)) {
					resist = cons.resistanceLevel;
				}
				if (cons.lowerResist && resval(cons.resistanceLevel) < resval(resist)) {
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
				local: localize(STATUS_EFFECT_TRANSLATION_TABLE[k as StatusEffectId]),
				img: STATUS_EFFECT_LIST.find(x=> x.id == k)?.icon ?? "",
			});
		}
		return arr;
	}

	wpnMult( this: ValidAttackers) : number {
		const lvl = this.system.combat.classData.level;
		const inc = this.system.combat.classData.incremental.wpnDamage * 0.5 ;
		const mult = ((this.class.getClassProperty(lvl, "wpn_mult") ?? 0)  + inc);
		return mult;
	}

	magDmg (this: ValidAttackers) : {low: number, high:number} {
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

	critBoost(this: ValidAttackers) : ModifierList {
		const mods = this.mainModifiers().flatMap( item => item.getModifier("criticalBoost", this));
		return new ModifierList(mods);
	}

	async addTalent(this: ValidAttackers, talent: Talent) {
		switch (this.system.type) {
			case "shadow":
				ui.notifications.warn("Shadows can't use talents");
				return;
			case "pc":
			case "npcAlly":
				break;
			default:
				this.system satisfies never;
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

	critResist(this: ValidAttackers) : ModifierList {
		const ret = new ModifierList();
		const mods = this.mainModifiers().flatMap( item => item.getModifier("critResist", this));
		return ret.concat(new ModifierList(mods));
	}

	async deleteTalent(this: ValidAttackers, id: string) {
		const item = this.items.find(x => x.id == id);
		if (item) {
			await item.delete();
			return;
		}
		if (!("talents" in this.system)) {return;}
		let talents = this.system.talents;
		if (!talents.find(x => x.talentId == id)) return;
		const talent = PersonaDB.getItemById(id) as Talent;
		talents = talents.filter( x=> x.talentId != id);
		await this.update( {"system.talents": talents});
		await Logger.sendToChat(`${this.name} deleted talent ${talent.name}` , this);
	}

	async addPower(this: PC | NPCAlly | Shadow, power: Power) {
		if (power.isNavigator()) {
			if (!this.isNPCAlly()) {
				PersonaError.softFail("Only NPC Allies can learn Navigator skills!");
				return;
			}
			await this.addNavigatorSkill(power);
			return;
		}
		if (this.isShadow()) {
			const pow = await this.createEmbeddedDocuments("Item", [power]);
			await this.setDefaultShadowCosts(pow[0] as Power);
			return;
		}
		const powers = this.system.combat.powers;
		if (powers.includes(power.id)) {
			ui.notifications.notify("You already know this power in main powers!");
			return;
		}
		const sideboard =  this.system.combat.powers_sideboard;
		if (sideboard.includes(power.id)) {
			ui.notifications.notify("You already know this power in sideboard!");
			return;
		}
		if (powers.length < this.maxMainPowers) {
			powers.push(power.id);
			await this.update( {"system.combat.powers": powers});
			return;
		}
		sideboard.push(power.id);
		await this.update( {"system.combat.powers_sideboard": sideboard});
		const totalPowers = this.mainPowers.length + this.sideboardPowers.length;
		let maxMsg = "";
		if (totalPowers > this.maxPowers) {
			maxMsg = `<br>${this.name} has exceeded their allowed number of powers (${this.maxPowers})  and must forget one or more powers.`;
		}
		await Logger.sendToChat(`${this.name} learned ${power.name} ${maxMsg}` , this);
	}

	async deletePower(this: ValidAttackers, id: string ) {
		const item = this.items.find(x => x.id == id);
		if (item) {
			await item.delete();
			return;
		}
		if (! ("talents" in this.system)) {
			return false;
		}
		if (this.isShadow()) return;
		let powers = this.system.combat.powers;
		const power = PersonaDB.getItemById(id) as Power;
		if (powers.includes(id)) {
			powers = powers.filter( x=> x != id);
			await this.update( {"system.combat.powers": powers});
			await this.checkMainPowerEmptySpace();
			await Logger.sendToChat(`${this.name} deleted power ${power.name}` , this);
			return;
		}
		let sideboard = this.system.combat.powers_sideboard;
		if (sideboard.includes(id)) {
			sideboard = sideboard.filter( x=> x != id);
			await this.update( {"system.combat.powers_sideboard": sideboard});
			await Logger.sendToChat(`${this.name} deleted sideboard power ${power.name}` , this);
		}
	}

	async checkMainPowerEmptySpace(this: PC | NPCAlly) {
		let powers = this.system.combat.powers;
		while (powers.length < this.maxMainPowers) {
			let sideboard = this.system.combat.powers_sideboard;
			const pow1 = sideboard.shift();
			if (!pow1) return;
			powers.push(pow1);
			await this.update( {"system.combat.powers": powers});
			await this.update( {"system.combat.powers_sideboard": sideboard});
		}
	}

	async movePowerToSideboard(this: PC, powerId: Power["id"]) {
		const newPowers = this.system.combat.powers
			.filter( id => id != powerId);
		await this.update({"system.combat.powers": newPowers});
		const sideboard = this.system.combat.powers_sideboard;
		sideboard.push(powerId);
		await this.update({"system.combat.powers_sideboard": sideboard});
		const power = PersonaDB.getItemById(powerId) as Power;
		await Logger.sendToChat(`${this.name} moved power ${power.name} to sideboard` , this);
	}

	async retrievePowerFromSideboard(this: PC, powerId: Power["id"]) {
		if (this.mainPowers.length >= this.maxMainPowers) {
			ui.notifications.warn(`Can't have more than ${this.maxMainPowers} main powers.`);
			return;
		}
		const newSideboard = this.system.combat.powers_sideboard
			.filter( id => id != powerId);
		await this.update({"system.combat.powers_sideboard": newSideboard});
		const powers = this.system.combat.powers;
		powers.push(powerId);
		await this.update({"system.combat.powers": powers});
		const power = PersonaDB.getItemById(powerId) as Power;
		await Logger.sendToChat(`${this.name} moved power ${power.name} out of sideboard` , this);
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
			case "pc": case "shadow": case "npcAlly":
				let foci = this.system.combat.focuses;
				if (!foci.includes(focusId)) return;
				foci = foci.filter( x=> x != focusId);
				return await this.update( {"system.combat.focuses": foci});
			default:
				actorType satisfies never;
		}
	}

	async  setClass(this: ValidAttackers, cClass: CClass) {
		await this.update( {"this.system.combat.classData.classId": cClass.id});
	}

	hasPowerInhibitingStatus() : boolean {
		switch (true) {
			case this.hasStatus("rage"):
			case this.hasStatus("sealed"):
				return true;
		}
		return false;
	}
	canUsePower (this: ValidAttackers, usable: UsableAndCard, outputReason: boolean = true) : boolean {
		if (this.hasStatus("rage") && usable != PersonaDB.getBasicPower("Basic Attack")) {
			if (outputReason) {
				ui.notifications.warn("Can't only use basic attacks when raging");
			}
			return false;
		}
		if (this.hasPowerInhibitingStatus() && usable.system.type == "power" && !usable.isBasicPower()) {
			if (outputReason) {
				ui.notifications.warn("Can't use that power due to a status");
			}
			return false;
		}
		return this.canPayActivationCost(usable, outputReason);

	}

	canPayActivationCost(this: ValidAttackers, usable: UsableAndCard, outputReason: boolean = true) : boolean {
		switch (this.system.type) {
			case "npcAlly":
			case "pc":
				return (this as PC | NPCAlly).canPayActivationCost_pc(usable, outputReason);
			case "shadow":
				return (this as Shadow).canPayActivationCost_shadow(usable, outputReason);
			default:
				this.system satisfies never;
				throw new PersonaError("Unknown Type");
		}
	}

	canPayActivationCost_pc(this: PC | NPCAlly, usable: UsableAndCard, _outputReason: boolean) : boolean {
		switch (usable.system.type) {
			case "power": {
				if (usable.system.tags.includes("basicatk")) {
					return true;
				}
				switch (usable.system.subtype) {
					case "weapon":
						return  this.hp > (usable as Power).hpCost();
					case "magic":
						const mpcost = (usable as Power).mpCost(this);
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
			case "skillCard":
				return this.canLearnNewSkill();
		}
	}

	canLearnNewSkill() : boolean {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
				return false;
			case "npcAlly":
			case "pc":
				return this.maxPowers - this.mainPowers.length - this.sideboardPowers.length >= 0;
			default:
				this.system satisfies never;
				return false;
		}
	}

	canPayActivationCost_shadow(this: Shadow, usable: UsableAndCard, outputReason: boolean) : boolean {
		if (usable.system.type == "skillCard") {
			return false;
		}
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
			if (combat && energyCost > (currentEnergy + 3)) {
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
	return mods.concat(this.persona().getBonuses(socialStat));
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
			relationshipType: "PEER",
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
		case "npc": case "npcAlly":
			return "PEER";
		case "shadow":
		case "tarot":
			break;
		default:
			this.system satisfies never;
	}
	return "NONE";
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

getSocialLinkProgress(this: PC, linkId: string) : number {
	const link = this.system.social.find( x=> x.linkId == linkId);
	if (!link) {
		return 0;
	}
	return link.currentProgress;
}

async alterSocialLinkProgress(this: PC, linkId: string, progress: number) {
	return await this.socialLinkProgress(linkId, progress);
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
	link.inspiration = Math.max(0, link.inspiration);
	link.inspiration = Math.min(link.linkLevel, link.inspiration);
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
	switch (this.system.type) {
		case "pc":
			return this.socialLinks.flatMap( link => {
				return link.focii;
			});
		case "npcAlly":
			return []; //coming soon
		case "shadow":
		case "npc":
		case "tarot":
			return [];
		default:
			this.system satisfies never;
			return [];
	}
}

getSourcedEffects(this: ValidAttackers): {source: ModifierContainer, effects: ConditionalEffect[]} []{
	return this.mainModifiers().flatMap( x=> x.getSourcedEffects(this));
}

getEffects(this: ValidAttackers) : ConditionalEffect[] {
	return this.mainModifiers().flatMap( x=> x.getEffects(this));
}

getPassivePowers(this: ValidAttackers): Power[] {
	return this.persona().passivePowers();
}

canEngage() :boolean {
	return !this.isDistracted() && this.isCapableOfAction();
}

canAllOutAttack(): boolean {
	if (this.hp < 0) return false;
	if (this.isDistracted()) return false;
	if (!this.isCapableOfAction()) return false;
	if (this.hasBanefulStatus()) return false;
	return true;
}

hasBanefulStatus(): boolean {
	return !!this.effects.find( (st) => st.isBaneful)
}

getLevelOfTalent(this: PC, talent: Talent) : number {
	const x= this.system.talents.find( x=> x.talentId == talent.id);
	if (!x) return 0;
	return x.talentLevel;
}

async incrementTalent(this: PC | NPCAlly, talentId: string) {
	const x = this.system.talents.find( x => x.talentId == talentId);
	if (!x) return;
	x.talentLevel = Math.min(3, x.talentLevel+1);
	await this.update({"system.talents": this.system.talents});
	const talent = PersonaDB.allItems().find( item => item.id == talentId);
	await Logger.sendToChat(`<b>${this.name}:</b> raised talent ${talent?.name} to level ${x.talentLevel}`, this);
}

async decrementTalent(this:PC | NPCAlly, talentId :string) {
	const x = this.system.talents.find( x => x.talentId == talentId);
	if (!x) return;
	x.talentLevel = Math.max(0, x.talentLevel-1);
	await this.update({"system.talents": this.system.talents});
	const talent = PersonaDB.allItems().find( item => item.id == talentId);
	await Logger.sendToChat(`<b>${this.name}:</b> reduced talent ${talent?.name} to level ${x.talentLevel}`, this);
}

getSaveBonus( this: ValidAttackers) : ModifierList {
	const mods = this.mainModifiers().flatMap( item => item.getModifier("save", this));
	// const x = this.getActiveTokens()[0]
	return new ModifierList(mods);
}

getDisengageBonus( this: ValidAttackers) : ModifierList {
	const mods = this.mainModifiers().flatMap( item => item.getModifier("disengage", this));
	return new ModifierList(mods);
}

/** returns current team (taking into account charm)*/
getAllegiance()  : Team {
	if (!this.isValidCombatant()) return "Neutral";
	switch (this.system.type) {
		case "pc":
			if (!this.hasPlayerOwner) return "Neutral";
			return "PCs";
		case "shadow":
			if (this.hasPlayerOwner) return "PCs";
			return "Shadows";
		case "npcAlly":
			return "PCs";
		default:
			this.system satisfies never;
			PersonaError.softFail(`Unknown type of actor, ${(this as any)?.system?.type}`);
			return "Neutral";
	}
}

async expendConsumable(item: UsableAndCard) {
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

isValidCombatant(): this is ValidAttackers {
	switch (this.system.type) {
		case "pc":
		case "shadow":
		case "npcAlly":
			return true;
		case "npc":
		case "tarot":
			return false;
		default:
			this.system satisfies never;
			return false;
	}
}

isDistracted() : boolean {
	return !!this.effects.find( st => st.isDistracting);
}

isCapableOfAction() : boolean {
	if (!!this.effects.find( st=> st.isIncapacitating)) return false;
	return this.hp > 0;
}

async fullHeal() {
	if (this.isValidCombatant()) {
		this.hp = this.mhp;
		if (this.system.type == "pc" || this.system.type == "npcAlly") {
			this.update({"system.combat.mp.value" : this.mmp});
		}
		(this as PC | Shadow).refreshHpTracker();
	}
}

async onEnterMetaverse()  : Promise<void> {
	if (!this.isValidCombatant()) return;
	if (this.system.type == "pc" && !this.hasPlayerOwner) return; //deal with removing item piles and such
	try {
		await this.fullHeal();
		if (this.system.type == "pc") {
			await (this as PC).refreshSocialLink(this as PC);
		}
		const situation : Situation = {
			trigger: "enter-metaverse",
			triggeringUser: game.user,
			triggeringCharacter: this.accessor,
			user: this.accessor,
		};
		await TriggeredEffect
			.onTrigger("enter-metaverse", this, situation)
			.emptyCheck()
			?.autoApplyResult();
	} catch (e) {
		console.log(e);
		PersonaError.softFail(`problem with onEnterMetaverse for ${this.name}`, e);
	}
}

async endEffectsOfDurationOrLess( duration: StatusDuration) : Promise<ActiveEffect[]> {
	const removed : ActiveEffect[] = [];
	for (const eff of this.effects) {
		if (eff.durationLessThanOrEqualTo(duration)) {
			removed.push(eff);
			await eff.delete();
		}
	}
	return removed;
}

async onExitMetaverse(this: ValidAttackers ) : Promise<void> {
	try {
		if (this.isPC() && !this.isRealPC()) {return;} //skip fake PCs like itempiles and the party token
		if (this.isRealPC()) {
			if (this.hasStatus("full-fade")) {
				await this.removeStatus("full-fade");
				await this.alterFatigueLevel(-2);
			}
		}
		await this.fullHeal();
		await this.endEffectsOfDurationOrLess( {dtype :"expedition"});
		if (this.system.type == "pc") {
			const pc = this as PC;
			await pc.refreshSocialLink(pc);
		}
		switch (this.system.type) {
			case "pc":
			case "shadow":
			case "npcAlly":
				await TriggeredEffect.onTrigger("exit-metaverse", this).emptyCheck()?.autoApplyResult() ?? Promise.resolve();
				break;
			default:
					this.system satisfies never;
		}
	} catch (e) {
		Debug(e);
		console.log(e);
		ui.notifications.error(`problem with OnExitMetaverse for ${this.name}`);
	}
}

async levelUp(this: PC | NPCAlly) : Promise<void> {
	const newlevel  = this.system.combat.classData.level+1 ;
	await this.resetIncrementals();
	await this.update({
		"system.combat.classData.level": newlevel,
		"system.combat.xp" : 0,
	});
}

async resetIncrementals(this: ValidAttackers) {
	const incremental : PC["system"]["combat"]["classData"]["incremental"] = {
		hp: 0,
		mp: 0,
		attack: 0,
		defense: 0,
		magicLow: false,
		magicHigh: false,
		talent: false,
		wpnDamage: 0,
		initiative: 0,
	};
	await this.update({
		"system.combat.classData.incremental": incremental,
	})
}

maxSlot() : number {
	switch (this.system.type) {
		case "shadow": return 99;
		case "npc": return -1;
		case "tarot": return -1;
		case "pc":
		case "npcAlly":
			break;
		default:
			this.system satisfies never;
	}
	const level = this.system.combat.classData.level;
	switch (true) {
		case level >= 9: return 3;
		case level >= 6: return 2;
		case level >= 5: return 2; // SPECIAL CASE
		case level >= 3: return 1;
		default: return 0;
	}
}

meetsSLRequirement (this: PC, focus: Focus) {
	return this.system.social.some( link=>
		link.linkId == focus.parent?.id
		&& link.linkLevel >= focus.requiredLinkLevel()
	);
}

isFullyFaded(this: ValidAttackers, newhp?:number) : boolean {
	switch (this.system.type) {
		case "shadow":
			return (newhp ?? this.hp) <= 0;
		case "pc":
		case "npcAlly":
				return this.hasStatus("full-fade");
			// return this.system.combat.fadingState >= 2;
		default:
			this.system satisfies never;
			return true;
	}
}

isFading(this: ValidAttackers): boolean {
	if (this.system.type == "shadow") return false;
	return this.hp <= 0 && !this.hasStatus("full-fade");
	// return this.hp <= 0 && this.system.combat.fadingState < 2;
}

get triggers() : ModifierContainer[] {
	switch (this.system.type ) {
		case "npc":
		case "tarot":
			return []
		case "pc":
		case "shadow":
		case "npcAlly":
			return (this as ValidAttackers).mainModifiers().filter( x=>
				x.getEffects(this as ValidAttackers).some( eff =>
					eff.conditions.some( cond => cond.type == "on-trigger")
				)
			);
		default:
			this.system satisfies never;
			return [];
	}
}

async increaseFadeState( this: ValidAttackers) {
	switch (true) {
		case this.hasStatus("full-fade"):
			return "full-fade";
		case this.hasStatus("fading"):
			await this.removeStatus("fading");
			await this.addStatus( {
				id: "full-fade",
				duration: {dtype: "expedition"}
			});
			return "full-fade";
		default :
			await this.addStatus( {
				id: "fading",
				duration: {dtype: "combat"}
			});
	}
}

async clearFadingState( this: ValidAttackers) {
	await this.removeStatus("fading");
	await this.removeStatus("full-fade");
}

// async setFadingState (this: ValidAttackers, state: number) {
// 	switch (state) {
// 		case 0:
// 			await this.removeStatus({
// 				id: "fading"
// 			});
// 			break;
// 		case 1:
// 			if (state == this.system.combat.fadingState)
// 				return;
// 			await this.addStatus({
// 				id:"fading",
// 				duration: {
// 					dtype: "expedition"
// 				},
// 			});
// 			break;
// 		case 2:
// 			break;
// 	}
// 	if (state == this.system.combat.fadingState)
// 		return;
// 	await this.update( {"system.combat.fadingState": state});
// 	await this.refreshHpStatus();
// }

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
	const amount = Math.abs(amt);
	const resources = this.system.money - amount;
	await this.update({ "system.money": resources});
	await Logger.sendToChat(`${this.name} spent ${amount} resource points`);
	await PersonaSounds.ching();
}

isAlive(): boolean {
	if (this.system.type == "npc") return true;
	return this.hp > 0;
}

async resetAvailability( this: SocialLink, day: SimpleCalendar.WeekdayName) {
	const avail = this.system.weeklyAvailability[day];
	await this.setAvailability(avail);
}

async setAvailability(this: SocialLink, bool: boolean) {
	if (this.system.weeklyAvailability.available == bool) return;
	if (game.user.isGM || this.isOwner) {
		//possible fix for the update seemingly not taking effect in time despite the await
		this.system.weeklyAvailability.available = bool;
		await	this.update( {"system.weeklyAvailability.available": bool});
	} else {
		PersonaSocial.requestAvailabilitySet(this.id, bool);
	}
}
get tarot() : (Tarot | undefined) {
	switch (this.system.type) {
		case "pc":
			if (this.cache.tarot?.name == this.system.tarot)
				break;
			if (this.system.tarot == "")
				return undefined;
			const PC = this as PC;
			this.cache.tarot = PersonaDB.tarotCards().find(x=> x.name == PC.system.tarot);
			break;
		case "shadow":
			if (this.cache.tarot?.name == this.system.tarot)
				break;
			if (this.system.tarot == "")
				return undefined;
			const shadow = this as Shadow;
			this.cache.tarot =  PersonaDB.tarotCards().find(x=> x.name == shadow.system.tarot);
			break;
		case "npcAlly":
			if (this.system.NPCSocialProxyId) {
				const actor = PersonaDB.socialLinks().find( x=> x.id == (this as NPCAlly).system.NPCSocialProxyId);
				if (actor) return actor.tarot;
			}
			//switch fallthrough is deliberate here
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

numOfIncAdvances(): number {
	switch (this.system.type) {
		case "npc":
		case "tarot":
			return 0;
	}
	const advances = this.system.combat.classData.incremental;
	return Object.values(advances).reduce<number>( (a, x) => {
		if (typeof x == "boolean" && x == true) {return a + 1;}
		if (typeof x == "number") {return a + x;}
		return a;
	}, 0);
}

get XPForNextLevel() : number {
	const incAdvances = this.numOfIncAdvances();
	const typeMult = this.system.type == "pc" ? 1.0 : 0.75;
	const base = Persona.leveling.BASE_XP;
	const growth = Persona.leveling.XP_GROWTH;
	return Math.floor( base + growth * incAdvances * typeMult);
}

/** returns true on level up */
async awardXP(this: PC | NPCAlly, amt: number) : Promise<boolean> {
	if (!amt) {
		return false;
	}
	if (Number.isNaN(amt)) {
		PersonaError.softFail(`Attempting to add NaN XP to ${this.name}, aborted`);
		return false;
	}
	const sit: Situation = {
		user: this.accessor,
	};
	amt = amt * this.persona().getBonuses("xp-multiplier").total(sit, "percentage");
	if (amt <= 0) {
		PersonaError.softFail(`Could be an error as XP gained is now ${amt}`);
		return false;
	}
	let levelUp = false;
	let newxp = this.system.combat.xp + amt;
	const XPrequired = this.XPForNextLevel;
	while (newxp > XPrequired) {
		newxp -= XPrequired;
		levelUp = true;
	}
	await this.update({"system.combat.xp" : newxp});
	return levelUp;
}

XPValue(this: Shadow) : number {
	if (this.hasCreatureTag("no-xp")) return 0;
	const SHADOWS_TO_LEVEL = Persona.leveling.SHADOWS_TO_LEVEL;
	const firstLevelUp = Persona.leveling.BASE_XP;
	const baseXP = firstLevelUp/SHADOWS_TO_LEVEL;
	const role = shadowRoleMultiplier(this.system.role) * shadowRoleMultiplier(this.system.role2);
	const incrementals = Object.values(this.system.combat.classData.incremental).reduce<number> ( (acc, i) => {
		if (typeof i == "number") return acc+i;
		if (typeof i == "boolean") return acc + (i ? 1 : 0);
		return acc;
	}, 0);
	return baseXP * role * (1 + (incrementals * 0.05));
}

maxActions(this: ValidAttackers): number  {
	return Math.max(0, 1 + this.persona().getBonuses("actions-per-turn").total( {user: this.accessor}));
}

async refreshActions(): Promise<number> {
	switch (this.system.type) {
		case "tarot":
		case "npc":
			return 0;
		case "pc":
		case "shadow":
		case "npcAlly":
			break;
		default:
			this.system satisfies never;
	}
	const maxActions = (this as ValidAttackers).maxActions();
	await this.update({"system.combat.actionsRemaining": maxActions});
	return maxActions;
}

async expendAction(this: ValidAttackers): Promise<number> {

	let actions = this.system.combat.actionsRemaining ?? 1;
	if (this.hasStatus("bonus-action")) {this.removeStatus("bonus-action");
		return actions;
	}
	actions = Math.max(0, actions-1);
	await this.update({"system.combat.actionsRemaining": actions});
	return actions;
}

get actionsRemaining(): number {
	if (this.isValidCombatant()) {
		return this.system.combat.actionsRemaining;
	}
	else return 0;
}

get perk() : string {
	switch (this.system.type) {
		case "pc":
			return this.tarot?.perk ?? "";
		case "shadow":
				return "";
		case "npc":
		case "npcAlly":
			return this.tarot?.perk ?? "";
		case "tarot":
				return this.system.perk;
		default: {
			this.system satisfies never;
			return "";
		}
	}
}

getEffectFlag(flagId: string) : FlagData | undefined {
	const flag= this.effects.find(eff=> eff.flagId?.toLowerCase() == flagId.toLowerCase());
	if (flag) return {
		flagId,
		duration: flag.statusDuration,
		flagName: flag.name,
		AEId: flag.id,
	};
}

//** returns true if shadow has one of the roles in the array */
hasRole( roles: Shadow["system"]["role"] | Shadow["system"]["role"][]): boolean {
	if (this.system.type != "shadow") return false;
	if (!Array.isArray(roles)) {
		roles = [roles];
	}
	const shadow = this as Shadow;
	return roles.some( role => {
		return shadow.system.role == role
			|| shadow.system.role2 == role;
	});
}

isSoloType() : boolean {
	return this.hasRole("solo");
}

isBossOrMiniBossType() : boolean {
	if (this.system.type != "shadow") return false;
	const bossRoles : Shadow["system"]["role"][] = [
		"miniboss", "boss", "solo",
	];
	return bossRoles.some( role => this.hasRole(role));
}

async onStartCombatTurn(this: PC | Shadow): Promise<string[]> {
	console.log(`${this.name} on Start turn`);
	await this.removeStatus("blocking");
	let ret = [] as string[];
	for (const eff of this.effects) {
		if ( await eff.onStartCombatTurn()) {
			ret.push(`Removed Condition ${eff.displayedName} at start of turn`);
		}
	}
	return ret;
}

async onEndCombatTurn(this : ValidAttackers) : Promise<string[]> {
	let ret: string[]= [];
	const burnStatus = this.effects.find( eff=> eff.statuses.has("burn"));
	if (burnStatus) {
		const damage = burnStatus.potency;
		await this.modifyHP(-damage);
	}
	this.hasStatus("burn");
	const despair = this.hasStatus("despair");
	if (despair && !this.isShadow() ) {
		await this.modifyMP(-this.despairMPDamage());
	}
	if (this.isShadow()) {
		const situation : Situation = {
			user: this.accessor,
			activeCombat: true,
		};
		let bonusEnergy = 3 + this.persona().getBonuses("energy-per-turn").total(situation);
		if (despair) {
			bonusEnergy = Math.floor(bonusEnergy/2);
		}
		await this.alterEnergy(bonusEnergy);
	}

	ret.push(...await this.endTurnSaves())
	return ret;
}

despairMPDamage(this: PC | NPCAlly): number {
	return Math.floor(this.mmp * 0.15);
}

/** should get called after a search action or after entering a new region*/
async onMetaverseTimeAdvance(): Promise<string[]> {
	const ret: string[] = [];
	for (const eff of this.effects) {
		if ( await eff.onMetaverseTimeAdvance()) {
			ret.push(`Removed Condition ${eff.displayedName} at start of turn`);
		}
	}
	return ret;
}

socialEffects(this: SocialLink) : ConditionalEffect[] {
	return this.system?.socialEffects ?? [];
}

async fatigueRecoveryRoll(this: PC): Promise<string[]> {
	let ret = [] as string[];
	const fatigueStat = this.getFatigueStatus();
	if (fatigueStat == undefined) return ret;
	if (this.hasAlteredFatigueToday()) return ret;
	let DC = 11;
	switch (fatigueStat) {
		case "rested": DC = 16; break;
		case "exhausted": DC = 11;
			if (this.hasMadeFatigueRollToday()) return ret;
			break;
		case "tired": DC= 6;
			if (this.hasMadeFatigueRollToday()) return ret;
			break;
	}
	const roll = await PersonaRoller.rollSave(this, {
		DC,
		label: `Save to end ${localizeStatusId(fatigueStat)}`,
		saveVersus: fatigueStat,
		rollTags: ["rest"],
	});
	await roll.toModifiedMessage(true);
	const locStat = localizeStatusId(fatigueStat);
	const fatLevel = this.fatigueLevel;
	if (roll.success && fatLevel < 1) {
		const newStat = await this.alterFatigueLevel(1);
		if (newStat) {
			ret.push(`${this.displayedName} is now ${localizeStatusId(newStat)}`);
		} else {
			ret.push(`${this.displayedName} is no longer ${locStat}`);
		}
	}
	if (!roll.success && fatLevel > 1) {
		await this.alterFatigueLevel(-1);
		ret.push(`${this.displayedName} is no longer ${locStat}`);
	}
	return ret;
}

async resetFatigueChecks(this: PC) {
	if (this.hasAlteredFatigueToday() || this.hasMadeFatigueRollToday()) {
		await this.update({
			"system.fatigue.hasAlteredFatigueToday": false,
			"system.fatigue.hasMadeFatigueRollToday" : false
		});
	}
}

async onEndDay(this: PC): Promise<string[]> {
	let ret = [] as string[];
	for (const eff of this.effects) {
		if (await eff.onEndSocialTurn())
			ret.push(`Removed Condition ${eff.displayedName} at end of day.`);
	}
	ret.push(...await this.fatigueRecoveryRoll());
	await this.resetFatigueChecks();
	return ret;
}

async onEndSocialTurn(this: PC) : Promise<string[]> {
	let ret = [] as string[];
	for (const eff of this.effects) {
		if (await eff.onEndSocialTurn())
			ret.push(`Removed Condition ${eff.displayedName} at end of social turn`);
	}
	return ret;
}

async onEndCombat(this: ValidAttackers) : Promise<void> {
	for (const eff of this.effects) {
		await eff.onEndCombat();
	}
}

encounterSizeValue() : number {
	let val = 1;
	if (!this.isValidCombatant()) return 1;
	if (this.hasRole("solo")) val *=4;
	if (this.hasRole("duo")) val*= 2;
	if (this.hasRole("elite")) val*= 1.75;
	if (this.hasRole("summoner")) val *= 2;
	if (this.hasRole("minion")) val *= 0.666;
	if (this.isNewEnemy()) val *= 1.2;
	return val;
}

isNewEnemy(): boolean {
	if (!this.isShadow()) return false;
	return this.system.encounter.timesDefeated == 0 && this.persona().scanLevel == 0;
}

async onDefeat(this: ValidAttackers) {
	if (this.isShadow()) {
		const defeat = this.system.encounter.timesDefeated+ 1;
		await this.update( {"system.encounter.timesDefeated": defeat});
	}
}

async endTurnSaves(this: ValidAttackers) : Promise<string[]> {
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

getEncounterWeight(this: Shadow, scene: PersonaScene): number {
	const encounterData= this.system.encounter.dungeonEncounters.find(x=> x.dungeonId == scene.id);
	if (!encounterData) return 0;
	return encounterData.frequency ?? 1;
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
	switch (this.system.type) {
		case "shadow":
		case "tarot":
			return false;
		case "npc": case "npcAlly":
			const npc = this as NPC;
			const sit: Situation = {
				user: (pc as PC).accessor,
				socialTarget: npc.accessor,
			};
			if(!testPreconditions(this.system.availabilityConditions,sit, null)) {
				return false;
			}
			break;
		case "pc":
			break;
		default:
			this.system satisfies never;
	}
	if (PersonaSocial.disqualifierStatuses.some (st=> this.hasStatus(st))) {return false;}
	const availability = this.system.weeklyAvailability;
	if (this.isSociallyDisabled())  {
		return false;
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

		case "npcAlly":
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

async setDefaultShadowCosts(this: Shadow, power: Power) {
	if (!this.items.get(power.id)) {
		ui.notifications.warn("Shadow can't edit power it doesn't own");
		return;
	}
	// const role = this.system.role;
	const diff = this.comparativePowerRatingToUsePower(power);
	let energyReq= 0, cost= 1;
	const reducedCostType = power.hasTag("buff") || power.hasTag("debuff") || power.hasTag("status-removal");
	let reqMin = reducedCostType ? 0 : 1;
	let energyMod = reducedCostType ? -3: 0;
	switch (true) {
		case (power.isDefensive() == true):
		case (power.isPassive() == true):
			energyReq = 0;
			cost = 0;
			reqMin = 0;
			break;
		case (diff == 0):
			energyReq += 3;
			cost += 1;
			break;
		case (diff > 0):
			energyReq += Math.max(reqMin, 3-diff);
			cost += 2 - Math.floor((1+diff)/2);
			break;
		case (diff < 0):
			if (power.hasTag("debuff") || power.hasTag("buff")) {
				energyReq += Math.min(3, 3 - diff);
			} else {
				energyReq += Math.min(10, 3-diff);
			}
			cost += 2 - diff;
			break;
	}
	energyReq += energyMod;
	cost = Math.clamp(cost, 0, 10);
	energyReq = Math.clamp(energyReq, reqMin, 10);
	return await power.setPowerCost(energyReq, cost);
}

comparativePowerRatingToUsePower(this: Shadow, power: Power) {
	const userLevel = this.system.combat.classData.level;
	let powerSlot = power.system.slot;
	let extraMod = 0;
	if (power.hasTag("price-lower-for-shadow")) {
		powerSlot -= 1;
	}
	if (power.hasTag("high-cost")) {
		extraMod += 2;
	}
	const effectiveLevel = extraMod + (powerSlot*3);
	return Math.round(userLevel - effectiveLevel);
}

static highestPowerSlotUsableAtLvl(lvl: number) : number {
	return Math.min(0, Math.floor(lvl / 3));
}

allOutAttackDamage(this: ValidAttackers, situation?: Situation) : { high: number, low: number } {
	if (!this.canAllOutAttack()) {
		return {high: 0, low: 0};
	}
	let high = 0, low = 0;
	if (!situation) {
		situation = {
			user: this.accessor,
			attacker: this.accessor,
		};
	}
	const basicAttack = PersonaDB.getBasicPower("Basic Attack");
	if (!basicAttack) {
		PersonaError.softFail("Can't find Basic attack power");
		return {high, low};
	}
	const mult = basicAttack.getDamageMultSimple(this, situation);
	const dmg = basicAttack.getDamage(this);
	low = dmg["low"] * mult;
	high = dmg["high"] * mult;
	return {high, low};
}

getPoisonDamage(this: ValidAttackers): number {
	const base = Math.round(this.mhp * 0.15);
	switch (this.system.type) {
		case "pc":
		case "npcAlly":
			return base;
		case "shadow":
			break;
		default:
			this.system satisfies never;
	}
	return Math.round(base * poisonDamageMultiplier(this.system.role) * poisonDamageMultiplier(this.system.role2));
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
	const maxEnergy = Math.min(10, this.system.combat.energy.max);
	if (this.system.combat.energy.max < 10) {
		await this.update( { "system.combat.energy.max": 10});
	}
	amt = Math.clamp(amt, -1, maxEnergy);
	await this.update({"system.combat.energy.value": amt});
}

async alterEnergy(this: Shadow, amt: number) {
	await this.setEnergy(this.system.combat.energy.value + amt);
}

async onRoll(situation: RollSituation & Situation) {
	console.log(`${this.name} is making a roll with tags: ${situation.rollTags.join(", ")}`);
	if (!this.isValidCombatant()) return;
	if (this.isPC() ) {
		if (situation.rollTags.includes("fatigue")) {
			await this.update({"system.fatigue.hasMadeFatigueRollToday" : true});
		}
	}
	const rollSituation : Situation = {
		user: this.accessor,
		triggeringCharacter: this.accessor,
		trigger: "on-roll",
		rollTags: situation.rollTags,
		naturalRoll: situation.naturalRoll,
		rollTotal: situation.rollTotal,
		triggeringUser: game.user,
	};
	await TriggeredEffect.onTrigger("on-roll", this, rollSituation)
		.emptyCheck()
		?.autoApplyResult();
}

async onCombatStart() {
}


async onKO() : Promise<void> {
	console.log("Calling onKO");
	await Promise.allSettled(this.effects
		.filter( eff => eff.removesOnDown())
		.map(eff => eff.delete())
	);
}

async onRevive() : Promise<void> {
	console.log("Calling onRevive");
}


get tagList() : CreatureTag[] {
	//NOTE: This is a candidate for caching
	if (this.system.type == "tarot") return [];
	let list = this.system.creatureTags.slice();
	if (this.isValidCombatant()) {
		const extraTags = this.mainModifiers().flatMap( x=> x.getConferredTags(this as ValidAttackers));
		for (const tag of extraTags) {
			if (!list.includes(tag))
				list.push(tag);
		}
	}
	switch (this.system.type) {
		case "pc":
			if (!list.includes("pc")) {
				list.push("pc");
			}
			return list;
		case "npcAlly":
			if (!list.includes("npc-ally")) {
				list.push("npc-ally");
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
			const startingEnergy = 3 + (this as Shadow).persona().getBonuses("starting-energy").total(sit);
			await (this as Shadow).setEnergy(startingEnergy);
			break;
		case "pc":
		case "npc":
		case "tarot":
			break;
	}

}

get questions(): NPC["system"]["questions"] {
	switch (this.system.type) {
		case "shadow":
		case "tarot":
			return [];
		case "npcAlly":
			return (this as NPCAlly).getNPCProxyActor()?.questions ?? [];
		case "pc":
		case "npc":
				return this.system.questions;
	}
}

async restoreAllQuestions(this: NPC) {
	const questions = this.system.questions.map (x=> x.toJSON ? x.toJSON() as NPC["system"]["questions"][number] : x );
	for (const question of questions) {
		question.expended = false;
	}
	await this.update({"system.questions": questions});
}

async markQuestionUsed(this: NPC, index: number) {
	const questions = this.system.questions.map( x=> (x as any).toJSON());
	questions[index].expended = true;
	await this.update({system: {questions}});
}

async addQuestion(this: NPC | PC) {
	const choices : NPC["system"]["questions"][number]["choices"] = [
		{
			name: "A",
			response: "",
			progressSuccess: 0,
		}, {
			name: "B",
			response: "",
			progressSuccess: 0,
		}, {
			name: "C",
			response: "",
			progressSuccess: 0,
		}
	];
	const question : NPC["system"]["questions"][number] = {
		name: "Unnamed Question",
		text: "",
		label: "",
		choices,
		expended: false,
		requiresDating: false,
		SLmin: 1,
		SLmax: 10,
	};
	this.system.questions.push(question);
	await this.update( { "system.questions": this.system.questions});
}

async deleteQuestion(this: NPC | PC, index: number) {
	this.system.questions.splice(index, 1);
	await this.update( { "system.questions": this.system.questions});
}

get roleString() : SafeString {
	if (!this.isShadow()) return "";
	let roles: (typeof this.system.role)[] = [];
	roles.push(this.system.role);
	roles.push(this.system.role2);
	const localized = roles
		.filter( x=> x != undefined && x != "base")
		.map( x=> localize(SHADOW_ROLE[x]))
		.join(", ");
	return localized;
}

async setWeaponDamageByLevel(this: Shadow, lvl: number) {
	const low = 3 + Math.floor(lvl /2);
	const high = 5 + Math.floor((lvl +1) /2);
	this.system.combat.wpndmg.low;
	await this.update( {
		"system.combat.wpndmg.low" : low,
		"system.combat.wpndmg.high": high
	});
}

get treasureString() : SafeString {
	if (this.system.type != "shadow") return "";
	const treasure = this.system.encounter.treasure;
	const items = [treasure.item0, treasure.item1, treasure.item2]
		.filter( id=> id)
		.map( id => PersonaDB.treasureItems().find(x=> x.id == id))
		.flatMap(item => item ? [item.name] : [])
	const cardPower = treasure.cardPowerId ? PersonaDB.allPowers().filter( x=> treasure.cardPowerId == x.id): [];
	const cardName = cardPower.map( pwr => `${pwr.name} Card`);
	return new Handlebars.SafeString(items.concat(cardName).join(", "));
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

get isTrueOwner() : boolean {
	switch (this.system.type) {
		case "tarot":
		case "npcAlly":
		case "shadow":
		case "npc":
			return game.user.isGM;
		case "pc":
			return game.user.isGM || game.user.id == this.system.trueOwner;
	}

}

}

Hooks.on("preUpdateActor", async (actor: PersonaActor, changes: {system: any}) => {
	switch (actor.system.type) {
		case "npc": return;
		case "tarot": return;
		case "pc":
		case "npcAlly":
		case "shadow":  {
			const newHp = changes?.system?.combat?.hp;
			if (newHp == undefined)
			return;
			await (actor as ValidAttackers).refreshHpStatus(newHp);
			return ;
		}
		default:
			actor.system satisfies never;
			throw new PersonaError(`Unknown Type`);
	}
});

Hooks.on("updateActor", async (actor: PersonaActor, changes: {system: any}) => {
	switch (actor.system.type) {
		case "npcAlly":
			if (changes?.system?.combat?.isNavigator == true) {
				await (actor as NPCAlly).setAsNavigator();
			}
			await	(actor as NPCAlly).refreshHpTracker();
			break;
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
export type NPCAlly =Subtype<PersonaActor, "npcAlly">;
export type Tarot = Subtype<PersonaActor, "tarot">;
export type SocialLink = PC | NPC | NPCAlly;


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


type Team = "PCs" | "Shadows" | "Neutral" ;

const EMPTYARR :any[] = [] as const; //to speed up things by not needing to create new empty arrays for immutables;

Object.seal(EMPTYARR);


Hooks.on("createActor", async function (actor: PersonaActor) {
	if (actor.isShadow()) {
		const pcs = game.actors
			.filter( (x: PersonaActor)=> x.isPC() && x.hasPlayerOwner && x.talents.length > 0)
		const totalLevels = pcs.reduce ((acc, i : PC) => acc + i.system.combat.classData.level, 0 );
		const avgLevel = Math.round(totalLevels/ pcs.length);
		await actor.update({ "system.combat.classData.level" : avgLevel});
		await actor.setWeaponDamageByLevel(avgLevel);
	}
});
