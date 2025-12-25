import { LevelUpCalculator } from "../config/level-up-calculator.js";
import { PersonaCombatStats } from "./actor/persona-combat-stats.js";
import { NonDeprecatedModifierType } from "../config/item-modifiers.js";
import {  ModifierContainer, PersonaItem} from "./item/persona-item.js";
import { Logger } from "./utility/logger.js";
import { removeDuplicates } from "./utility/array-tools.js";
import { PersonaSettings } from "../config/persona-settings.js";
import { Metaverse } from "./metaverse.js";
import { StatusEffectId } from "../config/status-effects.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaError } from "./persona-error.js";
import { localize } from "./persona.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../config/status-effects.js";
import { RealDamageType, RESIST_STRENGTH_LIST } from "../config/damage-types.js";
import { getActiveConsequences, multiCheckContains, multiCheckToArray } from "./preconditions.js";
import { PersonaI } from "../config/persona-interface.js";
import { DamageType } from "../config/damage-types.js";
import { ResistStrength } from "../config/damage-types.js";
import {PersonaTag} from "../config/creature-tags.js";
import {Defense} from "../config/defense-types.js";
import {PersonaStat} from "../config/persona-stats.js";
import {Calculation, EvaluatedCalculation} from "./utility/calculation.js";

export class Persona<T extends ValidAttackers = ValidAttackers> implements PersonaI {
	#combatStats: U<PersonaCombatStats>;
	user: T;
	source: ValidAttackers;
	_powers: Power[];
	#cache: PersonaClassCache;
	_isHypothetical: boolean;

	static leveling = {
		SHADOWS_TO_LEVEL: 10,
		BASE_XP: 600, // XP FOR FIRST LEVEL UP
		XP_GROWTH: 200, //added XP for additional level ups
	};

	constructor (source: ValidAttackers, user: T, powers?: Power[], isHypothetical = false) {
		this.user = user;
		this.source = source;
		this._powers = powers == undefined ? source._mainPowers(): powers;
		this._isHypothetical = isHypothetical;
		this.resetCache();
	}

	resetCache() {
		this.#cache = {
			mainModifiers: undefined,
			passivePowers: undefined,
			defensiveModifiers : undefined,
		};
	}

	get img() : string {
		if (this.source.system.combat.personaImg) {
			return this.source.system.combat.personaImg;
		}
		if (this.source.isShadow() && !this.source.system.combat.builtInPersona) {
			return this.source.img;
		}
		return "";
	}

	get powers() : readonly Power[] {
		return this.mainPowers
			.concat(this.bonusPowers)
			.filter( pwr => this.highestPowerSlotUsable() >= pwr.system.slot);
	}

	get activeCombatPowers() : readonly Power[] {
		return this.powers.filter( pwr => pwr.system.subtype == "magic" || pwr.system.subtype == "weapon");
	}

	get bonusPowers() : readonly Power [] {
		const bonusPowers : Power[] =
			this.mainModifiers({omitPowers:true, omitTalents: true})
			.filter(trait => PersonaItem.grantsPowers(trait))
			.flatMap(powerGranter=> PersonaItem.getAllGrantedPowers(powerGranter, this.user))
			.filter( pwr=> !pwr.hasTag("opener"))
			.sort ( (a,b)=> a.name.localeCompare(b.name)) ;
		return removeDuplicates(bonusPowers);
	}

	get basicPowers() {
		return this.user.basicPowers;
	}

	get mainPowers(): Power[] {
		return this._powers;
	}

	get statusResists() : Readonly<ValidAttackers["system"]["combat"]["statusResists"]> {
		return this.source.system.combat.statusResists;
	}

	get resists(): Readonly<ValidAttackers["system"]["combat"]["resists"]> {
		return this.source.system.combat.resists;
	}

	get classData(): Readonly<ValidAttackers["system"]["combat"]["classData"]> {
		return this.source.system.combat.classData;
	}

	get focii(): readonly Focus[] {
		const actor = this.source;
		if (actor.isPC())
		{return [];}
		return actor.items.filter( x=> x.isFocus()) as Focus[];
	}

	async learnPower(power: Power, logChanges = true) {
		await this.source._learnPower(power, logChanges);
	}

	get talents() : readonly Talent[] {
		const extraTalents = this.mainModifiers({omitTalents: true, omitPowers: true})
			.filter( CE=> PersonaItem.grantsTalents(CE))
			.flatMap(CE => PersonaItem.getGrantedTalents(CE, this.user));
		;
		const mainTalents= this.source.system.combat.talents
			.map( id => PersonaDB.getItemById<Talent>(id))
			.filter( tal => tal != undefined);
		extraTalents.pushUnique(...mainTalents);
		return extraTalents;
	}

	getTalentLevel(talent: Talent | Talent["id"]) : number {
		const id = talent instanceof PersonaItem ? talent.id : talent;
		const talents = this.talents;
		let index = talents.findIndex(tal => tal.id == id);
		if (index == -1) {return 0;}
		const convertedLevel = Math.floor(this.level/10) + 1;
		const effectiveLevel = Math.max(0, convertedLevel  -1);
		const baseVal = Math.floor(effectiveLevel / 3);
		const partial = effectiveLevel % 3;
		index = index >= 2 ? 2 : index;
		if (index < partial) {
			return baseVal + 1;
		}
		return baseVal;
	}

	get name(): string {
		switch (this.source.system.type) {
			case "pc":
			case "npcAlly":
				return this.source.system.personaName ?? this.source.displayedName;
			case "shadow":
					if (!this.source.system.combat.builtInPersona) {
						return this.source.displayedName;
					}
				return this.source.system.personaName;
			default:
					this.source.system satisfies never;
				return "ERROR";
		}
	}

	get displayedName(): string {
		return this.name;
	}

	get publicName() : string {
		switch (this.source.system.type) {
			case "pc":
			case "npcAlly":
				return this.displayedName;
			case "shadow":
				if (this.source.system.combat.builtInPersona) {
					return this.displayedName;
				}
				return this.source.publicName;
			default:
				this.source.system satisfies never;
				return "ERROR";
		}
	}

	get unspentStatPoints() : number {
		return this.combatStats.unspentStatPoints();
	}

	get XPForNextLevel() : number {
		return LevelUpCalculator.XPRequiredToAdvanceToLevel(this.level +1);
	}

	get xp(): number {
		return this.source.system.combat.personaStats.xp - LevelUpCalculator.minXPForEffectiveLevel(this.level);
	}

	get effectiveScanLevel(): number {
		const user = this.user;
		const source = this.source;
		if (game.user.isGM) {return 3;}
		if (source.hasPlayerOwner && user.hasPlayerOwner) {
			return 3;
		}
		const permission = Math.min(source.permission, user.permission);
		if (permission >= 2) {return 3;}
		if (this.isPartial) {return 3;}
		if (source.isShadow()) {
			return source.system.scanLevel ?? 0;
		}
		return 0;
	}

	async resetCombatStats( autoSpendersOnly :boolean) {
		if (!game.user.isGM) {return;}
		if (autoSpendersOnly && !this.canAutoSpendStatPoints() ) {return;}
		const source = this.source;
		const stats = source.system.combat.personaStats.stats;
		console.log(`Resetting stats for ${this.name}`);
		for (const k of Object.keys(stats)) {
			stats[k as PersonaStat] = 1;
		}
		await source.update({
"system.combat.personaStats.stats": stats
		});
		if (this.canAutoSpendStatPoints()) {
			await this.combatStats.autoSpendStatPoints();
		}
	}

	canAutoSpendStatPoints() : boolean {
		const source = this.source;
		const isNPCAllyOrShadow = source.isNPCAlly()
			|| source.isShadow();
		return isNPCAllyOrShadow
			&& !source.isCustomPersona() 
			&& source.tarot != undefined;
	}

	get scanLevelRaw() : number {
		const source = this.source;
		if (source.isShadow()) {
			return source.system.scanLevel ?? 0;
		}
		return 3;
	}

	critResist(): Calculation {
		const mods = PersonaItem.getModifier(this.mainModifiers(), "critResist");
		const list =  new ModifierList(mods);
		const calc = this.combatStats.lukCriticalResist();
		calc.add(1, list, "Mods", "add");
		return calc;
	}

	critBoost() : Calculation {
		const mods = PersonaItem.getModifier(this.mainModifiers(), "criticalBoost");
		const list= new ModifierList(mods);
		const calc = this.combatStats.lukCriticalBoost();
		calc.add(1, list, "Mods", "add");
		return calc;
	}

	equals(other: Persona) : boolean {
		return this.source == other.source;
	}

	get level() : number {
		// return this.classData.level;
		return this.source.system.combat.personaStats.pLevel ?? 0;
	}

	get startingLevel() : number {
		return this.source.startingLevel;
	}

	/**gains X amount of levels */
	async gainLevel(amt: number) : Promise<void> {
		const source=  this.source;
		const currLevel = source.system.combat.personaStats.pLevel;
		const newLevel = amt + currLevel;
		const neededXP = LevelUpCalculator.minXPForEffectiveLevel(newLevel);
		await source.update( {
			"system.combat.personaStats.pLevel" : newLevel,
			"system.combat.personaStats.xp": neededXP,
		});
		await Logger.sendToChat(`${this.displayedName} gained ${amt} levels`);
	}
	/** return leveled Persona on level up*/
	async awardXP(amt: number, allowMult = true): Promise<U<XPGainReport>> {
		const isBackup = !this.user.persona().equals(this);
		if (!amt) {
			return undefined;
		}
		if (Number.isNaN(amt)) {
			PersonaError.softFail(`Attempting to add NaN XP to ${this.name}, aborted`);
			return undefined;
		}
		amt = Math.floor(amt);
		const sit: Situation = {
			...this.baseSituation,
		};
		if (allowMult) {
			const XPMult = this.getBonuses("xp-multiplier").total(sit, "percentage") ?? 1;
			amt = amt * XPMult;
		}
		if (amt <= 0) {
			PersonaError.softFail(`Could be an error as XP gained is now ${amt}`);
			return undefined;
		}
		if (isBackup) {
			let multiplier = this.getBonuses("inactive-persona-xp").total(sit);
			multiplier = Math.clamp(multiplier, 0, 1);
			amt *= multiplier;
		}
		if (amt == 0) {return undefined;}
		let levelUp = false;
		const currXP  = this.source.system.combat.personaStats.xp;
		const newXP = currXP + amt;
		let newLevel = this.level;
		while (newXP >= LevelUpCalculator.minXPForEffectiveLevel(newLevel +1)) {
			newLevel += 1;
		}
		if (newLevel > this.level) {
			levelUp = true;
			//TODO: FINISH THIS
			// await this.source.onLevelUp_BasePersona(newLevel);
		}
		if (!PersonaSettings.freezeXPGain()) {
			await this.source.update({
				"system.combat.personaStats.xp" : newXP,
				"system.combat.personaStats.pLevel" : newLevel
			});
		}
		if (levelUp ) {
			await this.source.onLevelUp_BasePersona(newLevel);
		}
		return {
			name: `${this.name} (${this.user.name})`,
			amount: amt,
			leveled: levelUp,
		};
	}

	get baseSituation() : Required<Pick<Situation, "user" | "persona">> {
		return {
			user: this.user.accessor,
			persona: this,
		};
	}


	get pLevel() : number {
		return this.source.system.combat.personaStats.pLevel;
	}

	isEligibleToBecomeDMon() : boolean {
		const source = this.source;
		if (!source.isShadow()) {return false;}
		if (source.system.combat.builtInPersona) {return false;}
		if (source.hasRole(["boss", "miniboss", "treasure-shadow", "duo", "solo", "summoner"])) {return false;}
		if (source.system.creatureType != "shadow" && source.system.creatureType != "daemon") {return false;}
		if (source.hasCreatureTag("pure-shadow")) {return false;}
		return true;
	}

	isEligibleToBecomeWildPersona(): boolean {
		const source = this.source;
		if (!source.isShadow()) {return false;}
		if (!source.tarot || source.tarot.name.length == 0) { return false; }
		if (source.system.combat.builtInPersona) {return false;}
		if (source.level <= 0) {return false;}
		if (this.isPersona()) {return true;}
		if (this.isDMon()) {return true;}
		if (source.prototypeToken.actorLink == true) {return false;}
		if (source.hasRole(["boss", "miniboss", "treasure-shadow", "summoner", "minion"])) {return false;}
		if (source.system.creatureType != "shadow" && source.system.creatureType != "daemon") {return false;}
		if (source.hasCreatureTag("pure-shadow")) {return false;}
		return true;
	}

	isFusable(): boolean {
		if (!this.isEligibleToBecomeWildPersona()) {return false;}
		if (this.hasTag("non-fusable-variant")) {return false;}
		if (this.source.system.creatureType == "daemon") {return false;}
		return true;
	}

	isPersona(): boolean {
		const source = this.source;
		if (source.isPC() || source.isNPCAlly()) {return true;}
		if (source.system.creatureType == "persona") {return true;}
		return false;
	}

	get isCustomPersona() : boolean {
		return this.source.isShadow()
			&& this.isPersona()
			&& this.source.isCustomPersona();
	}

	isDMon() : boolean {
		const source = this.source;
		if (source.system.creatureType == "d-mon") {return true;}
		if (source.isShadow() && source.hasCreatureTag("d-mon")) {return true;}
		return false;
	}

	numOfWeaknesses(): number {
		return Object.values(this.resists)
			.reduce( (acc, res) =>  acc + (res == "weakness" ? 1 : 0) ,0);
	}

	numOfIncAdvances(): number {
		return this.source.numOfIncAdvances();
	}

	getDefensiveBonuses( modNames : MaybeArray<NonDeprecatedModifierType>)  : ModifierList {
		return this.getBonuses(modNames, this.defensiveModifiers());
	}

	getBonuses (modnames : MaybeArray<NonDeprecatedModifierType>, usedPower: Usable, attacker: Persona) : ModifierList;
	getBonuses (modnames : MaybeArray<NonDeprecatedModifierType>, sources?: readonly SourcedConditionalEffect[]): ModifierList;
	getBonuses (modnames : MaybeArray<NonDeprecatedModifierType>, sources: (readonly SourcedConditionalEffect[] | Usable) = this.passiveCEs(), attacker?: Persona): ModifierList {
		if (sources instanceof PersonaItem) {
			const baseMods = this.getBonuses(modnames);
			const usable= sources;
			const usableEffects = usable.getPassiveEffects(attacker!.user);
			const mods = PersonaItem.getModifier(usableEffects, modnames);
			const modList = new ModifierList(mods);
			return baseMods.concat(modList);
		}
		const mods = PersonaItem.getModifier(sources, modnames)
			.filter( mod => mod.modifier != 0);
		return new ModifierList(mods);
	}

	passiveCEs() : SourcedConditionalEffect[] {
		return this.mainModifiers().filter ( x=>x.conditionalType == "passive");
	}

	mainModifiers(options?: MainModifierOptions ): readonly SourcedConditionalEffect[] {
		//NOTE: this could be a risky operation
		const canCache = !options && this.canCache;
		if (canCache && this.#cache.mainModifiers) {
			return this.#cache.mainModifiers;
		}
		const mainMods = this._mainModifiers(options);
		if (canCache) {
			this.#cache.mainModifiers = mainMods;
		}
		return mainMods;
	}

	private _mainModifiers(options?: MainModifierOptions): readonly SourcedConditionalEffect[] {
		const user = this.user;
		const roomModifiers : UniversalModifier[] = [];
		if (game.combat) {
			roomModifiers.push(...PersonaCombat.getRoomModifiers(this));
		} else {
			roomModifiers.push(...(Metaverse.getRegion()?.allRoomEffects ?? []));
		}
		const passiveOrTriggeredPowers = (options && options.omitPowers) ? [] : this.passiveOrTriggeredPowers();
		const talents = (options && options?.omitTalents) ? [] : this.talents;
		const mainModsList : ModifierContainer[]= [
			...this.focii,
			...talents,
			...passiveOrTriggeredPowers,
			...user.actorMainModifiers(options),
			...roomModifiers,
			...PersonaDB.getGlobalPassives(),
			...PersonaDB.navigatorModifiers(),
		];
		return mainModsList
			.flatMap( x=> x.getEffects(this.user));
	}

	passiveOrTriggeredPowers() : readonly Power[] {
		const PersonaCaching = this.canCache;
		if (!this.#cache.passivePowers || !PersonaCaching) {
			const val =  this.powers
				.filter( power => power.isPassive() || power.isDefensive())
				.filter( power=> power.hasPassiveEffects(this.user) || power.hasTriggeredEffects(this.user));
			if (!PersonaCaching) {return val;}
			this.#cache.passivePowers = val;
		}
		return this.#cache.passivePowers;
	}

	defensiveModifiers(): readonly SourcedConditionalEffect[] {
		if (!this.#cache.defensiveModifiers || !this.canCache) {
			const val =  this.mainModifiers().filter ( eff => eff.conditionalType == "defensive");
			if (!this.canCache) {return val;}
			this.#cache.defensiveModifiers = val;
		}
		return this.#cache.defensiveModifiers;
	}

	async addTalent(talent: Talent) {
		const source = this.source;
		const arr = source.system.combat.talents;
		if (!this.source.isShadow() && talent.system.shadowOnly) {
			ui.notifications.error("This talent can only be used by shadows");
		}
		arr.pushUnique(talent.id);
		await source.update( {"system.combat.talents": arr});
		if (source.hasPlayerOwner) {
			await Logger.sendToChat(`${this.name} added ${talent.name} Talent` , source);
		}
	}

	async deleteTalent(id: string) {
		const source = this.source;
		const talent = PersonaDB.getItemById<Talent>(id);
		if (!talent) {throw new PersonaError(`No such talent ${id}`);}
		const arr = source.system.combat.talents
			.filter(x=> x != id);
		await source.update( {"system.combat.talents": arr});
		await Logger.sendToChat(`${this.name} deleted ${talent.name} Talent` , source);
	}


	get effectiveLevel() : number {
		const advances = this.numOfIncAdvances();
		const maxIncAdvances = this.maxIncrementalAdvances();
		const valPerAdvance = 1 / maxIncAdvances;
		return this.source.system.combat.classData.level + (valPerAdvance * advances);
	}

	maxIncrementalAdvances(): number {
		return this.source.maxIncrementalAdvances();
	}

	/* Base XP for one shadow of equal power **/
	static get BaselineXP(): number {
		const SHADOWS_TO_LEVEL = Persona.leveling.SHADOWS_TO_LEVEL;
		const firstLevelUp = Persona.leveling.BASE_XP;
		return firstLevelUp/SHADOWS_TO_LEVEL;
	}

	static MIN_XP_MULT = 0.05;
	static MAX_XP_MULT = 3;

	static calcXP(killedTargets: ValidAttackers[], numOfAllies: number): number {
		const XP= killedTargets.reduce( (a,x) => x.XPValue() + a, 0);
		return Math.floor(XP / numOfAllies);
	}

	get baseInitRank() : ValidAttackers["system"]["combat"]["initiative"] {
		return this.source.system.combat.initiative;
	}

	get combatInit(): Calculation {
		const initBonus = this
			.getBonuses("initiative");
		const agi = this.combatStats.baseInit();
		agi.add(1, initBonus, "Init bonus", "add");
		return agi;
	}

	printableDefenseMods( defense: Defense) :EvaluatedCalculation["steps"] {
		const def = this.getDefense(defense);
		const situation : Situation  = {
			user: this.user.accessor,
			target: this.user.accessor,
		};
		return def.eval(situation).steps;
	}

	getDefense(defense: Defense) : Calculation {
		let calc : Calculation; 
		// const mods = new ModifierList();
		switch (defense) {
			case "ref": {
				calc =this.combatStats.baseRef();
				break;
			}
			case "fort": {
				calc =this.combatStats.baseFort();
				break;
			}
			case "kill":
				calc = this.combatStats.instantDeathDefense();
				break;
			case "ail":
				calc = this.combatStats.ailmentDefense();
				break;
			case "none":
				return new Calculation(0);
			default:
				defense satisfies never;
				ui.notifications.warn(`Attmept to access nonsense Defense :${defense as string}`);
				return new Calculation(0);
		}
		const modifiers = [
			...this.passiveCEs(),
		];
		modifiers.pushUnique(...this.defensiveModifiers());
		const defenseMods = this.getBonuses([defense, "allDefenses"], modifiers);
		const modList = new ModifierList();
		return calc.add(1, modList.concat(defenseMods), "Other Modifiers", "add");
	}

	get tarot() {
		return this.source.tarot;
	}


	get combatStats(): PersonaCombatStats {
		if (this.#combatStats == undefined) {
			this.#combatStats = new PersonaCombatStats(this);
		}
		return this.#combatStats;
	}


	passiveFocii() : Focus[] {
		return this.focii.filter( f=> f.hasPassiveEffects(this.user));
	}

	defensiveFocii(): Focus[] {
		return this.focii.filter( f=> f.hasDefensiveEffects(this.user));
	}

	elemResist(type: Exclude<DamageType, "by-power">): ResistStrength {
		switch (type) {
			case "untyped":  case "none":
			case "all-out":
				return "normal";
			case "healing":
				return "absorb";
		}
		const baseResist = this.resists[type] ?? "normal";
		const modifiers = [
			// ...this.defensiveModifiers(),
			...this.mainModifiers(),
		];
		const effectChangers=  modifiers.filter( x=>
			x.consequences
			.some( cons=>cons.type == "raise-resistance" || cons.type == "lower-resistance"));
		const situation : Situation = {
			user: this.user.accessor,
			target: this.user.accessor,
		};
		const consequences = effectChangers
			.flatMap( eff =>
				getActiveConsequences(eff, situation)
			);
		const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
		let resBonus = 0, resPenalty = 0;
		for (const cons of consequences) {
			switch (cons.type) {
				case "raise-resistance": {
					const isSameType = multiCheckContains(cons.resistType, [type]);
					// if (cons.resistType == type &&
					if (isSameType &&
						resval(cons.resistanceLevel) > resval(baseResist)) {
						resBonus = Math.max(resBonus, resval(cons.resistanceLevel) - resval(baseResist));
					}
					break;
				}
				case "lower-resistance": {
					const isSameType = multiCheckContains(cons.resistType, [type]);
					if (isSameType &&
						resval (cons.resistanceLevel) < resval(baseResist))  {
						resPenalty = Math.min(resPenalty, resval(cons.resistanceLevel) - resval(baseResist));
					}
					break;
				}
				default:
					break;
			}
		}
		const resLevel = Math.clamp(resval(baseResist) + resBonus + resPenalty, 0 , RESIST_STRENGTH_LIST.length-1);
		return RESIST_STRENGTH_LIST[resLevel];
	}

	static combinedPersona<T extends ValidAttackers>(basePersona: Persona<T>, attachedPersona: Persona) : Persona<T> {
		const fusedPowers = attachedPersona.powers.concat(
			basePersona.powers);
		fusedPowers.length = Math.min(6, fusedPowers.length);
		const fusedPersona = new Persona(attachedPersona.source, attachedPersona.user, fusedPowers);
		fusedPersona.user = basePersona.user;
		fusedPersona.source = attachedPersona.source;
		//I am not sure if this really persona<T> as there were errors but not sure if this ufnction is even used
		return fusedPersona as Persona<T>;
	}

	get isBasePersona(): boolean {
		return this.source == this.user;
	}

	get printableResistanceString() : string {
		const resists = this.statusResists;
		const retdata = Object.entries(resists)
			.filter ( ([statusId, _y]) => CONFIG.statusEffects.some(st=> st.id == statusId))
			.map(([statusRaw, _level]) => {
				const actual = this.statusResist(statusRaw as StatusEffectId);
				const statusTrans = localize(STATUS_EFFECT_TRANSLATION_TABLE[statusRaw as StatusEffectId]);
				if (statusTrans == undefined) {
					return "ERROR";
				}
				switch (actual) {
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

	statusResist(status: StatusEffectId, modifiers ?: readonly SourcedConditionalEffect[]) : ResistStrength {
		const actor= this.source;
		if (!modifiers) {
			modifiers = this.mainModifiers();
		}
		const effectChangers = modifiers
			.filter ( mod => mod.consequences
				.some( cons=>
					cons.type == "raise-status-resistance" && multiCheckContains(cons.statusName,status)
				));
		const situation : Situation = {
			user: actor.accessor,
			target: actor.accessor,
		};
		const consequences = effectChangers.flatMap(
			item => getActiveConsequences(item, situation)
		);
		const resists = this.statusResists;
		type ResistableStatus = keyof typeof resists;
		const baseStatusResist = resists[status as ResistableStatus] ? resists[status as ResistableStatus] : "normal" ;
		const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
		let resist= baseStatusResist;
		for (const cons of consequences) {
			if (cons.type == "raise-status-resistance") {
				const statusList = multiCheckToArray(cons.statusName);
				if (statusList.includes(status)) {
					if (!cons.lowerResist && resval(cons.resistanceLevel) > resval(resist)) {
						resist = cons.resistanceLevel;
					}
					if (cons.lowerResist && resval(cons.resistanceLevel) < resval(resist)) {
						resist = cons.resistanceLevel;
					}
				}
			}
		}
		return resist;
	}


	get maxSideboardPowers() : number {
		if (!this.source.isValidCombatant()) {return 0;}
		switch (this.source.system.type) {
			case "npcAlly":
			case "shadow":
				return 0;
			case "pc": {
				if (!this.source.class.system.canUsePowerSideboard) {return 0;}
				const extraMaxPowers = this.getBonuses("extraMaxPowers");
				return extraMaxPowers
				.total ( {user: this.user.accessor});
			}
			default:
				this.source.system satisfies never;
				return -1;
		}
	}

	get maxMainPowers() : number {
		switch (this.source.system.type) {
			case "pc":
			case "npcAlly":
				return 8;
			case "shadow":
				if (this.isPersona()) {return 8;}
				return 16;
			default:
				this.source.system satisfies never;
				return -1;
		}
	}

	maxDefensiveBoosts() : number {
		const baseBoosts = this.#baseDefenseBoosts();
		const situation: Situation = {
			user: this.user.accessor,
			target: this.user.accessor,
		};
		const bonusBoosts =this.getBonuses("max-defense-boosts").total(situation);
		return baseBoosts + bonusBoosts;
	}

	#baseDefenseBoosts() : number {
		switch (this.source.system.type) {
			case "pc": return 1;
			case "shadow": {
				if (this.source.isCustomPersona()) {return 1;}
				return 2;
			}
			case "npcAlly": return 1;
			default:
				this.source.system satisfies never;
				return 0;
		}
	}

	maxResists () : number {
		const baseResists = this.#baseResists();
		const situation: Situation = {
			user: this.user.accessor,
			target: this.user.accessor,
		};
		const bonusBoosts = this.getBonuses("max-resist-boosts").total(situation);
		return baseResists + bonusBoosts;
	}

	#baseResists() : number {
		switch (this.source.system.type) {
			case "pc": return -1;
			case "shadow" : {
				if (this.source.isCustomPersona()) {
					return -1;
				}
				return 1;
			}
			case "npcAlly": return -1;
			default:
				this.source.system satisfies never;
				return -999;
		}
	}

	get isOverResistCap(): boolean {
		return this.source.totalResists() > this.maxResists();
	}

	wpnAtkBonus() : Calculation {
		const mods = this.getBonuses(["allAtk", "wpnAtk"]);
		const wpnAtk = this.combatStats.baseWpnAttackBonus();
		return wpnAtk.add(1, mods, "Mods", "add");
	}

	magAtkBonus() : Calculation {
		const mods = this.getBonuses(["allAtk", "magAtk"]);
		const magAtk = this.combatStats.baseMagAttackBonus();
		return magAtk.add(1, mods, "Mods", "add");
	}

	instantDeathAtkBonus() : Calculation {
		const mods = this.getBonuses(["instantDeathRange"]);
		const deathAtk = this.combatStats.baseDeathAtkBonus();
		return deathAtk.add(1, mods, "Mods", "add");
	}

	ailmentAtkBonus() : Calculation {
		const mods = this.getBonuses("afflictionRange");
		const ailAtk = this.combatStats.baseAilmentAtkBonus();
		return ailAtk.add(1, mods, "Mods", "add");
	}

	itemAtkBonus(item : Consumable) : Calculation {
		const calc=new Calculation();
		const mods = this.getBonuses(["itemAtk", "allAtk"]);
		return calc
			.add(1, item?.system?.atk_bonus ?? 0, "Item Modifier", "add")
			.add(1, mods, "Modifiers", "add");
	}

	get isUnderResistCap(): boolean {
		const leeway  = 0;  //allow leeway for double weakness
		return this.source.totalResists() + leeway < this.maxResists();
	}

	hpCostMod() : ModifierList {
		return this.getBonuses("hpCostMult");
	}

	canUsePower (usable: UsableAndCard, outputReason: boolean = true) : boolean {
		const msg =
			this._consumableCheck(usable)
			|| this._downtimeCheck(usable)
			|| this._powerInhibitingStatusCheck(usable)
			|| this._powerTooStrong(usable)
			|| this._deadCheck(usable)
			|| this._isTrulyUsable(usable)
			|| this._canPayActivationCostCheck(usable);
		;
		if (msg === null) {return true;}
		if (outputReason) {
			ui.notifications.warn(msg);
		}
		return false;
	}

	private _isTrulyUsable( usable: UsableAndCard) : N<FailReason> {
		if (!usable.isTrulyUsable()) {
			return `${usable.name} isn't a usable type of Power or Item`;
		}
		return null;
	}

	private _deadCheck(usable: UsableAndCard) : N<FailReason> {
		if (!this.user.isAlive() && !usable.hasTag("usable-while-dead")) {return "Can't Use While Unconscious";}
		return null;
	}

	private _powerTooStrong(usable: UsableAndCard) : N<FailReason> {
		if (usable.isPower() && this.highestPowerSlotUsable() < usable.system.slot) {
				return "Power is too advanced for you to use";
			}
		return null;
	}

	private _consumableCheck(usable: UsableAndCard) : N<FailReason> {
		if (usable.isConsumable() && !usable.canUseConsumable(this.user)) {
			return "You don't meet the conditions to use this consumable";
		}
		return null;
	}

	private _downtimeCheck(usable: UsableAndCard) : N<FailReason> {
		if (usable.hasTag("downtime") || usable.hasTag("downtime-minor")) {
			if (!game.combat || !(game.combat as PersonaCombat).isSocial) {
					return "Can only use this item during downtime in social rounds";
			}
		}
		return null;
	}

	private _powerInhibitingStatusCheck(usable: UsableAndCard) : N<FailReason> {
		const user = this.user;
		switch (true) {
			case (user.hasStatus("rage")
				&& usable != PersonaDB.getBasicPower("Basic Attack") ): {
					return "Can't only use Basic Attack while having Rage Status";
				}
			case user.hasStatus("sealed")
					&& usable.isPower()
					&& !usable.isBasicPower()
					&& !usable.hasTag("usable-while-sealed"):
				return " Can't take that action because of status: Sealed";
		}
		return null;
	}

	canPayActivationCost(usable: UsableAndCard) : boolean {
		return this._canPayActivationCostCheck(usable) == null;
	}

	private _canPayActivationCostCheck(usable: UsableAndCard) : N<FailReason> {
		switch (this.user.system.type) {
			case "npcAlly":
			case "pc":
				return (this as Persona<PC | NPCAlly>)._canPayActivationCostCheck_pc(usable);
			case "shadow":
				return (this as Persona<Shadow>)._canPayActivationCostCheck_shadow(usable);
			default:
				this.user.system satisfies never;
				throw new PersonaError("Unknown Type");
		}
	}

	private _canPayActivationCostCheck_pc(this: Persona<PC | NPCAlly>, usable: UsableAndCard) : N<FailReason> {
		switch (usable.system.type) {
			case "power": {
				if (usable.system.tags.includes("basicatk")) {
					return null;
				}
				switch (usable.system.subtype) {
					case "weapon":
						if ( this.user.hp <= (usable as Power).hpCost()) {return "HP cost would kill user";}
						break;
					case "magic": {
						const mpcost = (usable as Power).mpCost(this);
						if (mpcost > 0 && this.user.mp < mpcost) {
							return "Can't afford MP Cost";
						}
					}
						break;
					case "social-link": {
						const inspirationId = usable.system.inspirationId;
						if (!this.user.isPC()) {return "Non-PCs can't use social-link powers";}
						if (inspirationId) {
							const socialLink = this.user.system.social.find( x=> x.linkId == inspirationId);
							if (!socialLink) {return "You don't have the social link required";}
							if (socialLink.inspiration < usable.system.inspirationCost) {
								return "You can't pay the inspiration cost";
							}
						} else {
							const inspiration = this.user.system.social.reduce( (acc, item) => acc + item.inspiration , 0);
							if (inspiration < usable.system.inspirationCost) {return "You can't pay the inspiration cost";}
						}
					}
						break;
					case "downtime": {
						const combat = PersonaCombat.combat;
						if (!combat || combat.isSocial) {return "Can only use this during downtime rounds";}
						break;
					}
					default:
						return null;
				}
			}
				break;
			case "consumable":
				if (usable.system.amount <= 0) {
					return "You don't have any of that consumable";
				}
				break;
			case "skillCard":
				if(!this.user.canLearnNewSkill()) {
					return "You have no space left to learn";
				}
		}
		return null;
	}

	private _canPayActivationCostCheck_shadow(this: Persona<Shadow>, usable: UsableAndCard) : N<FailReason> {
		if (usable.system.type == "skillCard") {
			return "Shadows cant use skill cards";
		}
		if (usable.isPower()) {
			const combat = game.combat;
			const energyRequired = usable.energyRequired(this);
			const energyCost = usable.energyCost(this);
			const currentEnergy = this.user.system.combat.energy.value;
			if (combat && energyRequired > 0 && energyRequired > currentEnergy) {
				return `Requires ${energyRequired} energy and you only have ${currentEnergy}`;
			}
			if (combat && energyCost > (currentEnergy + 3)) {
				return (`Costs ${energyCost} energy and you only have ${currentEnergy}`);
			}
			if (usable.system.reqHealthPercentage < 100) {
				const reqHp = (usable.system.reqHealthPercentage / 100) * this.user.mhpEstimate ;
				if (this.user.hp > reqHp) {
					return `Power Only Usable when Hp < ${reqHp}`;
				}
			}
		}
		return null;
	}


	hasTag(tag: PersonaTag) : boolean {
		return this.tagListPartial().includes(tag);
	}

	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
	tagListPartial() : (PersonaTag | Tag["id"])[] {
		const base = this.source.system.combat.personaTags.slice();
		base.pushUnique (...this.source.system.creatureTags);
		base.pushUnique(...this._autoTags());
		return base;
	}

	private _autoTags() : PersonaTag[] {
		const autoPTags :PersonaTag[]= [];
		if (this.source.isPC() || this.source.isNPCAlly()){
			autoPTags.pushUnique("persona");
		}
		if (this.user.isUsingMetaPod()) {
			autoPTags.pushUnique("simulated");
		}
		switch (this.source.system.creatureType) {
			case "enemy-metaverse-user":
			case "persona":
				autoPTags.pushUnique("persona");
				break;
			case "d-mon":
				autoPTags.pushUnique("d-mon");
				break;
		}
		if (this.source.isShadow()) {
			if ( this.source.system.creatureType == "daemon") {
				autoPTags.pushUnique("simulated");
			}
		}
		if (this.user.isShadow()) {
			if (this.user.system.role != "base") {
				autoPTags.pushUnique(this.user.system.role);
			}
			if (this.user.system.role2 != "base") {
				autoPTags.pushUnique(this.user.system.role2);
			}
		}
		if (autoPTags.includes("persona") && this.source.isPC() &&  this.source.hasSoloPersona) {
			autoPTags.pushUnique("lone-persona");
		}
		return autoPTags;
	}

	realTags() : Tag[] {
		const ret =  this.tagListPartial().flatMap( tag => {
			const IdCheck = PersonaDB.allTags().get(tag);
			if (IdCheck) {return [IdCheck];}
			const nameCheck = PersonaDB.allTagLinks().get(tag);
			if (nameCheck) {return [nameCheck];}
			return [];
		});
		return ret;
	}

	highestPowerSlotUsable() : number {
		if (this.user.isShadow()) {return 99;}
		const level = Math.floor(this.user.level / 10) +1;
		const CAP = this.user.system.combat.usingMetaPod ? 2 : 99;
		const maxLevel = this.source.isPersona() && !this.source.isCustomPersona() ? 99 : this.#powerSlotMaxByLevel(level);
		return Math.min(CAP, maxLevel);
	}

	#powerSlotMaxByLevel(this: void, level: number) {
		switch (true) {
			case level > 6: return 3;
			case level > 4: return 2;
			case level > 2: return 1;
			default: return 0;
		}

	}

	// armorDR() : number {
	// 	if (this.user.isShadow()) {
	// 		const DR =  PersonaSettings.getDamageSystem().getArmorDRByArmorLevel(Math.floor(this.level /10));
	// 		return DR;
	// 	}
	// 	const armor = this.user.equippedItems().find(x => x.isInvItem() && x.system.slot == "body") as U<InvItem>;
	// 	return armor  != undefined ? armor.armorDR() : 0;
	// }


	getBonusWpnDamage() : ModifierList {
		return this.getBonuses("wpnDmg");
	}

	getBonusVariance() : ModifierList {
		return this.getBonuses("variance");
	}

	async levelUp_manual() {
		const level = this.source.system.combat.personaStats.pLevel;
		const currXP = this.source.system.combat.personaStats.xp;
		const XPForNext = LevelUpCalculator.minXPForEffectiveLevel(level + 1);
		const XPNeeded = XPForNext - currXP;
		console.log(`${this.name} XP needed: ${XPNeeded}`);
		await this.awardXP(XPNeeded, false);
	}

	get isActivateable() : boolean {
		if (this._isHypothetical) {return false;}
		if (!this.source.hasPlayerOwner) {return false;}
		return this.user.personaList
			.some( persona => this.equals(persona));
	}

	get isPartial() : boolean {
		return this._isHypothetical;
	}

	get canCache() : boolean {
		const PersonaCaching = PersonaSettings.agressiveCaching();
		return !this.isPartial && PersonaCaching;
	}

	possibleElementTypes(): RealDamageType[] {
		return this.powers
			.filter (pwr => pwr.system.damageLevel != "none")
			.filter( x=> {
				const dtype  = x.getDamageType(this.user);
				switch (dtype) {
					case "none":
					case "healing":
						return false;
				}
				return true;
			})
			.map ( x=> x.getDamageType(this.user));
	}

	get compendiumEntry(): U<Shadow> {
		return this.source.compendiumEntry;
	}

} // end of class


interface PersonaClassCache {
	mainModifiers: U<readonly SourcedConditionalEffect[]>;
	passivePowers: U<readonly Power[]>;
	defensiveModifiers: U<readonly SourcedConditionalEffect[]>;
}

interface MainModifierOptions {
	omitPowers?: boolean;
	omitTalents?: boolean;
	omitTags ?: boolean;
}

type FailReason = string;
