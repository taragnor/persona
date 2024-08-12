import { localize } from "../persona.js";
import { POWER_TAGS } from "../../config/power-tags.js";
import { ModifierList } from "../combat/modifier-list.js";
import { testPreconditions } from "../preconditions.js";
import { CardEffectLocation } from "./sheets/social-card-sheet.js";
import { CardChoice } from "../../config/social-card-config.js";
import { CardEvent } from "../../config/social-card-config.js";
import { Consequence } from "../combat/combat-result.js";
import { Precondition } from "../../config/precondition-types.js";
import { BASIC_PC_POWER_NAMES } from "../../config/basic-powers.js";
import { BASIC_SHADOW_POWER_NAMES } from "../../config/basic-powers.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { getActiveConsequences } from "../preconditions.js";
import { PersonaError } from "../persona-error.js";
import { Metaverse } from "../metaverse.js"
import { PersonaActor } from "../actor/persona-actor.js";
import { UniversalItemAccessor } from "../utility/db-accessor.js";
import { Situation } from "../preconditions.js";
import { SLOTTYPES } from "../../config/slot-types.js";
import { ModifierListItem } from "../combat/modifier-list.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { PowerType } from "../../config/effect-types.js";
import { PC } from "../actor/persona-actor.js";
import { Shadow } from "../actor/persona-actor.js";
import { ITEMMODELS } from "../datamodel/item-types.js";
import { PersonaDB } from "../persona-db.js";

declare global {
	type ItemSub<X extends PersonaItem["system"]["type"]> = Subtype<PersonaItem, X>;
}

export class PersonaItem extends Item<typeof ITEMMODELS> {

	declare parent : PersonaActor | undefined;

	getClassProperty<T extends keyof CClass["system"]["leveling_table"][number]> (this: CClass,lvl: number, property:T)  : CClass["system"]["leveling_table"][number][T] {
		const adjustedLvl = Math.clamped(lvl, 0, 11);
		return this.system.leveling_table[adjustedLvl][property];
	}

	get accessor() : UniversalItemAccessor<typeof this> {
		return PersonaDB.getUniversalItemAccessor(this);
	}

	static getBasicPCPowers() : Power[] {
const basic = BASIC_PC_POWER_NAMES;
		return basic.flatMap( powerName =>  {
const power = PersonaDB.getBasicPower(powerName);
			if (!power) return [];
			return [power as Power];
		});
	}

	static getBasicShadowPowers() : Power[] {
const basic = BASIC_SHADOW_POWER_NAMES;
		return basic.flatMap( powerName =>  {
const power = PersonaDB.getBasicPower(powerName);
			if (!power) return [];
			return [power as Power];
		});
	}

	get tags() : string {
		if ("tags" in this.system) {
			const tags= this.system.tags.map(tag => localize(POWER_TAGS[tag]));
			return tags.join(", ");
		}
		return "";
	}

	get amount() : number {
		if (this.system.type != "consumable") {
			return 1;
		}
		return this.system.amount;
	}

	get costString() : string {
		switch (this.system.type) {

			case "power":
				return (this as Power).powerCostString();
			case "consumable":
				return "consumable";

			default:
				return "free";
		}
	}

	powerCostString(this: Power) : string {
		if (!this.parent || this.parent.type == "pc")
			return this.powerCostString_PC();
		if (this.parent.type == "shadow")
			return this.powerCostString_Shadow();
		else return "";
	}

	grantsPowers(this: ModifierContainer): boolean {
		try{
		return this.getEffects(null).some(
			eff => eff.consequences.some(
				cons => cons.type == "add-power-to-list"
			));
		} catch (e) {
			console.log(this);
			return false;
		}
	}

	getGrantedPowers(this: ModifierContainer, user: PC | Shadow, situation?: Situation): Power[] {
		if (!this.grantsPowers()) return [];
		if (!situation) {
			situation = {
				user: user.accessor
			};
		}
		return this.getEffects(user)
			.filter(
				eff => eff.consequences.some(
					cons => cons.type == "add-power-to-list"
				))
			.flatMap(eff=> getActiveConsequences(eff, situation, this))
			.flatMap(x=> x.type == "add-power-to-list" ? [x.id] : [])
			.map(id=> PersonaDB.allPowers().find( x=>x.id == id))
			.flatMap( pwr=> pwr? [pwr]: []);
	}

	powerCostString_PC(this: Power) : string {
		switch (this.system.subtype) {

			case "weapon":
				if (this.system.hpcost)
					return `${this.system.hpcost} HP`;
				else return "free";
			case "magic":
				const slotName = PersonaItem.getSlotName(this.system.slot);
				return `${slotName} slot`;
			case "social-link":
				if (this.system.inspirationCost > 0) {
					return `${this.system.inspirationCost} Inspiration`;
				}

			case "other":
			case "passive":
			case "none":
			case "standalone":
			case "defensive":
				break;
			default:
				this.system.subtype satisfies never;
		}
		return "free";
	}

	powerCostString_Shadow(this: Power) : string {
		let costs : string[] = [];
		if (this.system.reqEnhancedMultiverse) {
			costs.push("ENH");
		}
		if (this.system.reqEscalation) {
			costs.push(`ESC${this.system.reqEscalation}+`);
		}
		switch (this.system.reqCharge) {
			case "none":
				break;
			case "always":
				costs.push("Charged-");
				break;
			case "not-enhanced":
				if (!Metaverse.isEnhanced()) {costs.push("Charged")}
				break;
			case "supercharged":
				costs.push("AMPED-");
				break;
			case "supercharged-not-enhanced":
				if (!Metaverse.isEnhanced()) {
					costs.push("AMPED")
				} else {
					costs.push("Charged");
				}
				break;
			case "charged-req":
				costs.push("Charged");
				break;
			case "amp-req":
				costs.push("AMPED");
				break;
			case "amp-fulldep":
				costs.push("AMPED--");
				break;
			default:
				this.system.reqCharge satisfies never;
		}
		return costs.join(", ");
	}

	static getSlotName(num : number) {
		return game.i18n.localize(SLOTTYPES[num]);
	}

	/** required because foundry input hates arrays*/
	async sanitizeEffectsData(this: PowerContainer) {
		const isArray = Array.isArray;
		let update = false;
		let effects = this.system.effects;
		try {
			if (!isArray(this.system.effects)) {
				effects = ArrayCorrector(this.system.effects);
				update = true;
			}
			effects.forEach( ({conditions, consequences}, i) => {
				if (!isArray(conditions)) {
					effects[i].conditions = ArrayCorrector(conditions);
					update=  true;
				}
				if (!isArray(consequences)) {
					effects[i].consequences = ArrayCorrector(consequences);
					update=  true;
				}
			});
		} catch (e) {
			console.log(this);
			throw e;
		}
		if (update) {
			await this.update({"system.effects": effects});
		}
	}

	static newConditionalEffectsObject() {
		return {
			conditions: [],
			consequences: []
		};
	}

	async addNewPowerEffect(this: PowerContainer) {
		const arr= this.system.effects ?? [];
		arr.push(
			PersonaItem.newConditionalEffectsObject()
		);
		await this.update({ "system.effects": arr});
	}

	async addConditionalEffect(this: PowerContainer): Promise<void>;
	async addConditionalEffect(this: SocialCard, location:CardEffectLocation) :Promise<void>;
	async addConditionalEffect(this: SocialCard | PowerContainer, location?:CardEffectLocation) :Promise<void>
	{
		if (this.system.type != "socialCard") {
			return await (this as Exclude<typeof this, SocialCard>).addNewPowerEffect();
		}
		if (location == undefined)  throw new PersonaError("no index provided");
		const card = (this as SocialCard);
		const {array, updater} =  card.createConditionalEffectUpdater(location);
		if ("effects" in array) {
			this.#appendNewEffect(array);
			await updater();
		}
	}


	createConditionalEffectUpdater(this: SocialCard, location: CardEffectLocation) : ConditionalEffectUpdater<ConditionalEffectObjectContainer> {
		switch (location.name) {
			case "opportunity-roll": {
				const list = this.system.opportunity_list;
				const opp = list[location.opportunityIndex];
				if (!("effects" in opp)) {
					(opp as any)["effects"] = [];
				}
				if (!("effects" in opp)) {
					throw new PersonaError("something weird happened");
				}
				return {
					array: opp,
					updater :
					async () => await this.update({"system.opportunity_list": list})
				};
			}
			case "card-modifiers": {
				const array= ArrayCorrector(this.system.globalModifiers) ?? [];
				const newObj = {
					effects: array
				};
				return {
					array: newObj,
					updater: async () =>
					await this.update({"system.globalModifiers": newObj.effects})
				}
			}
			case "card-conditions": {
				const array = this.system;
				return {
					array,
					updater: async() => await this.update({"system.conditions": array.conditions}),
				};
			}
			case "opportunity-condition": {
				const array = this.system.opportunity_list;
				const opportunity = array[location.opportunityIndex];
				if (opportunity.conditions== undefined) {
					opportunity.conditions = [];
				}
				return {
					array: opportunity,
					updater: async () => await this.update({"system.opportunity_list": array})
				}
			}
			case "event-choice-effects": {
				const list = this.system.events;
				const event = list[location.eventIndex];
				event.choices = ArrayCorrector(event.choices  ?? []);
				const choice = event.choices[location.choiceIndex];
				choice.postEffects = choice.postEffects ?? {effects: []};
				choice.postEffects.effects = ArrayCorrector(choice.postEffects.effects);
				return {
					array: choice.postEffects,
					updater: async () => {
						await this.update({"system.events": list});
					}
				};
			}
			case "event-choice-conditions": {
				const list = this.system.events;
				const choice = this.system.events[location.eventIndex!].choices[location.choiceIndex];
				if (choice.conditions == undefined) {
					choice.conditions = [];
				}
				return {
					array: choice,
					updater: async () => {
						await this.update({"system.events": list});
					},
				};
			}
			case "event-conditions":
				const list = this.system.events;
				const event = this.system.events[location.eventIndex];
				if (event.conditions == undefined) {
					event.conditions = [];
				}
				return {
					array: event,
					updater: async () => {
						await this.update({"system.events": list});
					},
				};
			default:
				location satisfies never;
				throw new PersonaError("Shouldn't be able to get here");
		}
	}

	async deletePowerEffect(this: PowerContainer, index: number) : Promise<void> {
		let arr =this.system.effects ?? [];
		arr.splice(index, 1);
		await this.update({ "system.effects": arr});
	}

	async deleteConditionalEffect(this: PowerContainer, effect_index: number): Promise<void>;
	async deleteConditionalEffect(this: SocialCard, effectIndex: number, location: CardEffectLocation) : Promise<void>;
	async deleteConditionalEffect(this: SocialCard | PowerContainer, effectIndex: number, location ?: CardEffectLocation) : Promise<void> {
		if (this.system.type != "socialCard") {
			return await (this as Exclude<typeof this, SocialCard>) .deletePowerEffect(effectIndex);
		}
		if (!location) {
			throw new PersonaError("No location given");
		}
		const {array, updater} =  (this as SocialCard).createConditionalEffectUpdater(location);
		if ("effects" in array || Array.isArray(array)) {
			this.#deleteEffect(array, effectIndex)
			await updater();
		}

		// const loc = location;
		// switch (loc.name) {
		// 	case "event-choice-conditions":
		// 		throw new PersonaError("This location only has conditions");
		// 	case "event-choice-roll" : {
		// 		const list = this.system.events;
		// 		const event = list[loc.eventIndex];
		// 		event.choices = ArrayCorrector(event.choices);
		// 		const choice = event.choices[loc.choiceIndex];
		// 		const roll = choice.roll;
		// 		(roll as any).effects = (roll as any).effects ?? [];
		// 		if ("effects" in roll) {
		// 			this.#deleteEffect(roll, effectIndex);
		// 			await this.update({"system.events": list});
		// 		}
		// 		break;
		// 	}

		// 	case "card-modifiers":
		// 		const list = this.system.globalModifiers;
		// 		this.#deleteEffect(list, effectIndex!);
		// 		await this.update({"system.globalModifiers": list});
		// 		break;
		// 	case "opportunity-condition": {
		// 		throw new PersonaError("This location doesn't have effects");
		// 	}
		// 	case "opportunity-roll":{
		// 		const list = this.system.opportunity_list;
		// 		const roll = list[loc.opportunityIndex].roll;
		// 		if (("effects" in roll)) {
		// 			this.#deleteEffect(roll, effectIndex);
		// 			await this.update({"system.opportunity_list": list});
		// 		}
		// 		break;
		// 	}
		// 	default:
		// 		loc satisfies never;
		// 		throw new PersonaError(`invalid location: ${loc}`);
		// }
	}

	async addNewPowerPrecondition(this: PowerContainer, index:number) {
		const x = this.system.effects[index];
		x.conditions = ArrayCorrector(x.conditions);
		x.conditions.push( {
			type: "always"
		});
		await this.update({"system.effects": this.system.effects});
	}

	#appendNewEffect(effectHolder:{effects:ConditionalEffect[]} | ConditionalEffect[]): void {
		if ("effects" in effectHolder) {
			effectHolder.effects = ArrayCorrector(effectHolder.effects);
			effectHolder.effects.push( {
				conditions: [],
				consequences: []
			});
		} else {
			effectHolder.push( {
				conditions: [],
				consequences: []
			});

		}
	}

	#deleteEffect(effectHolder:{effects:ConditionalEffect[]} | ConditionalEffect[], effectIndex:number): void {
		if ("effects" in effectHolder) {
		effectHolder.effects = ArrayCorrector(effectHolder.effects);
		effectHolder.effects.splice(effectIndex,1);
		} else {
			effectHolder.splice(effectIndex, 1);
		}
	}



	#appendNewPrecondition(effectArr:{effects:ConditionalEffect[]} , effectIndex:number): void
	#appendNewPrecondition(preconditionArr:{conditions:Precondition[]}): void
	#appendNewPrecondition(array: ({conditions: Precondition[]} | {effects:ConditionalEffect[]}), effectIndex?: number): void {
		if ("effects" in array) {
			array.effects = ArrayCorrector(array.effects);
			const effect = array.effects[effectIndex!];
			return this.#appendNewPrecondition(effect);
		}
		array.conditions = ArrayCorrector(array.conditions);
		array.conditions.push({
			type: "always"
		});
		return;
	}

	#deletePrecondition(effectArr:{effects:ConditionalEffect[]} , conditionIndex:number, effectIndex:number): void;
	#deletePrecondition(preconditionArr:{conditions:Precondition[]}, conditionIndex:number): void;
	#deletePrecondition(array: ({conditions: Precondition[]} | {effects:ConditionalEffect[]}), conditionIndex: number, effectIndex?: number) {
		if ("effects" in array) {
			array.effects = ArrayCorrector(array.effects);
			const effect = array.effects[effectIndex!];
			return this.#deletePrecondition(effect, conditionIndex);
		}
		array.conditions = ArrayCorrector(array.conditions);
		array.conditions.splice(conditionIndex, 1);
		return;
	}

	#appendNewConsequence(effectArr:{effects:ConditionalEffect[]}, effectIndex:number): void
	#appendNewConsequence(preconditionArr:{consequences:Consequence[]}): void
	#appendNewConsequence(array: ({effects:ConditionalEffect[]} | {consequences:Consequence[]}), effectIndex?: number) : void {
		if ("effects" in array) {
			array.effects = ArrayCorrector(array.effects);
			const effect = array.effects[effectIndex!];
			return this.#appendNewConsequence(effect);
		}
		array.consequences = ArrayCorrector(array.consequences);
		array.consequences.push({
			type: "none",
			amount: 0,
		});
		return;
	}

	#deleteConsequence(effectArr:{effects:ConditionalEffect[]} , consIndex:number, effectIndex:number): void;
	#deleteConsequence(preconditionArr:{consequences:Consequence[]}, consIndex:number): void;
	#deleteConsequence(array: ({consequences: Consequence[]} | {effects:ConditionalEffect[]}), consIndex: number, effectIndex?: number) : void {
		if ("effects" in array) {
			array.effects = ArrayCorrector(array.effects);
			const effect = array.effects[effectIndex!];
			return this.#deleteConsequence(effect, consIndex);
		}
		array.consequences = ArrayCorrector(array.consequences);
		array.consequences.splice(consIndex, 1);
		return;
	}

	async addCondition(this: PowerContainer, effectIndex: number) : Promise<void>;
	async addCondition(this: SocialCard | Job, effectIndex: number, location: CardEffectLocation): Promise<void>;
	async addCondition(this: SocialCard | PowerContainer | Job, effectIndex: number, location?: CardEffectLocation): Promise<void>
	{
		if (!location) {
			return await (this as PowerContainer).addNewPowerPrecondition(effectIndex);
		}

		const {array, updater} =  (this as SocialCard).createConditionalEffectUpdater(location);
		if ("conditions" in array) {
			this.#appendNewPrecondition(array);
		}
		if ("effects" in array) {
			this.#appendNewPrecondition(array, effectIndex);
		}
		await updater();
	}

	async deletePowerPrecondition( this: PowerContainer, effectIndex: number, condIndex: number) {
		const x = this.system.effects[effectIndex];
		x.conditions = ArrayCorrector(x.conditions);
		x.conditions.splice(condIndex, 1);
		await this.update({"system.effects": this.system.effects});
	}

	async deleteCondition(this: PowerContainer, effectIndex: number, condIndex: number): Promise<void>;
	async deleteCondition(this: SocialCard | Job,  effectIndex: number, condIndex: number, location: CardEffectLocation): Promise<void>;
	async deleteCondition(this: SocialCard | PowerContainer | Job, effectIndex: number, condIndex: number, location?: CardEffectLocation): Promise<void> {
		if (!location) {
			return await (this as PowerContainer).deletePowerPrecondition(effectIndex, condIndex);
		}
		const {array, updater} =  (this as SocialCard).createConditionalEffectUpdater(location);
		if ("conditions" in array) {
			this.#deletePrecondition(array, condIndex);
		}
		if ("effects" in array) {
			this.#deletePrecondition(array, condIndex, effectIndex);
		}
		await updater();
	}


	async addNewPowerConsequence(this: PowerContainer, index:number) {
		const x = this.system.effects[index];
		x.consequences = ArrayCorrector(x.consequences);
		x.consequences.push( {
			type: "none",
			amount: 0,
		});
		await this.update({"system.effects": this.system.effects});
	}

	async addConsequence(this: PowerContainer, effectIndex: number): Promise<void>;
	async addConsequence(this: SocialCard, effectIndex:number, location: CardEffectLocation): Promise<void>;
	async addConsequence(this: SocialCard | PowerContainer, effectIndex: number, location?: CardEffectLocation){
		if (this.system.type != "socialCard") {
			return await (this as PowerContainer).addNewPowerConsequence(effectIndex as number);
		}
		if (!location)
			throw new Error("No location provided for card");
		const {array, updater} =  (this as SocialCard).createConditionalEffectUpdater(location);
		if ("consequences" in array) {
			this.#appendNewConsequence(array);
		}
		if ("effects" in array) {
			this.#appendNewConsequence(array, effectIndex);
		}
		await 	updater();

	}

	async deleteConsequence(this: PowerContainer, effectIndex: number, consIndex: number): Promise<void>;
	async deleteConsequence(this: SocialCard, effectIndex: number, consIndex: number, location: CardEffectLocation): Promise<void>;
	async deleteConsequence(this: SocialCard | PowerContainer, effectIndex: number, consIndex:number, location?: CardEffectLocation): Promise<void> {
		if (this.system.type != "socialCard") {
			return await (this as PowerContainer).deletePowerConsequence(effectIndex, consIndex);
		}
		if (!location) {
			throw new PersonaError("No location given");
		}
		const {array, updater} =  (this as SocialCard).createConditionalEffectUpdater(location);
		if ("consequences" in array) {
			this.#deleteConsequence(array, consIndex);
		}
		if ("effects" in array) {
			this.#deleteConsequence(array, consIndex, effectIndex);
		}
		await updater();
	}



	async deletePowerConsequence (this: PowerContainer, effectIndex: number, consIndex: number) {
		const x = this.system.effects[effectIndex];
		x.consequences = ArrayCorrector(x.consequences);
		x.consequences.splice(consIndex, 1);
		await this.update({"system.effects": this.system.effects});
	}

	getModifier(this: ModifierContainer, bonusTypes : ModifierTarget[] | ModifierTarget, sourceActor: PC | Shadow) : ModifierListItem[] {
		bonusTypes = Array.isArray(bonusTypes) ? bonusTypes: [bonusTypes];
		return this.getEffects(sourceActor)
			.map(x =>
				({
					name: this.name,
					source: PersonaDB.getUniversalItemAccessor(this),
					conditions: ArrayCorrector(x.conditions),
					modifier: ModifierList.getModifierAmount(x.consequences, bonusTypes),
					variableModifier: ModifierList.getVariableModifiers(x.consequences, bonusTypes),
				})
			);
	}

	getDamage(this:ModifierContainer , user: PC | Shadow, type: "high" | "low", situation: Situation = {user: user.accessor , usedPower: this.accessor, attacker: user.accessor}) : number {
		if (!("dmg_type" in this.system)) return 0;
		if (this.system.dmg_type == "none") return 0;
		const subtype : PowerType  = this.system.type == "power" ? this.system.subtype : "standalone";
		switch(subtype) {
			case "weapon" : {
				const dmg = user.wpnDamage();
				// const bonus = this.system.damage;
				// const modified = {
				// 	low: dmg.low + bonus.low,
				// 	high: dmg.high + bonus.high
				// }
				const mult = user.wpnMult() + (this.system.melee_extra_mult ?? 0);
				const bonusDamage = user.getBonusWpnDamage();
				return {
					low: dmg.low * mult + bonusDamage.low.total(situation),
					high: dmg.high * mult + bonusDamage.high.total(situation),
				}[type];
			}
			case "magic": {
				const dmg = user.magDmg();
				const mult = this.system.mag_mult;
				const bonuses=  user.getBonuses("magDmg");
				const bonus = bonuses.total(situation);
				const modified = {
					low: (dmg.low * mult) + bonus,
					high: (dmg.high * mult) + bonus
				}
				return modified[type];
			}
			case "standalone": {
				const dmg = this.system.damage;
				return dmg[type];
			}
			default:
				return 0;
		}
	}

	getSourcedEffects(this: ModifierContainer, sourceActor: PC | Shadow): {source: ModifierContainer, effects: ConditionalEffect[]} {
		return {
			source: this,
			effects: this.getEffects(sourceActor)
		};
	}

	getEffects(this: ModifierContainer, sourceActor : PC | Shadow | null): ConditionalEffect[] {
		return this.system.effects.map( eff=> {
			const conditions= ArrayCorrector(eff.conditions)
				.map (x=> ({ ...x,
					actorOwner: sourceActor? sourceActor.accessor : undefined,
					sourceItem: PersonaDB.getUniversalItemAccessor(this),
				})
				);
			const consequences= ArrayCorrector(eff.consequences)
				.map (x=> ({ ...x,
					actorOwner: sourceActor? sourceActor.accessor : undefined,
					sourceItem: PersonaDB.getUniversalItemAccessor(this),
				})
				);
			return {conditions, consequences};
		});
	}

	requiredLinkLevel(this: Focus) : number  {
		let requirement = 0;
		for (const eff of this.getEffects( null)) {
			for (const cond of eff.conditions) {
				if (cond.type == "numeric" && cond.comparisonTarget == "social-link-level")
				{
					if (cond.num)
						return cond.num;
						// requirement = Math.max(requirement, cond.num);
				}
			}
		}
		return requirement;
	}

	isAvailable(this: Activity, pc: PC): boolean {
		const sit: Situation = {
			user: pc.accessor
		};
		if(!testPreconditions(this.system.conditions,sit, null)) return false;
		return this.system.weeklyAvailability.available;
	}

	async setAvailability(this: SocialCard, bool: boolean) {
		await	this.update( {"system.weeklyAvailability.available": bool});
	}

	async addCardEvent(this: SocialCard) {
		const newEv : CardEvent = {
			text: "",
			img: "",
			placement: {
				starter: true,
				middle: true,
				finale: true
			},
			label: "",
			name: "Unnamed Event",
			frequency: 1,
			choices: [],
			conditions: [],
		};
		this.system.events.push( newEv);
		this.update({"system.events": this.system.events});
	}

	async deleteCardEvent(this: SocialCard, eventIndex: number) {
		this.system.events.splice(eventIndex, 1);
		this.update({"system.events": this.system.events});
	}

	async addEventChoice(this: SocialCard, eventIndex: number) {
		const event = this.system.events[eventIndex];
		event.choices = ArrayCorrector(event.choices);
		const newChoice: CardChoice = {
			name: "Unnamed Choice",
			conditions: [],
			text: "",
			postEffects: {effects:[]},
			roll: {rollType: "none"},
		};
		event.choices.push( newChoice);
		await this.update({"system.events": this.system.events});
	}

	async deleteEventChoice(this: SocialCard, eventIndex: number, choiceIndex: number) {
		const event = this.system.events[eventIndex];
		event.choices = ArrayCorrector(event.choices);
		event.choices.splice(choiceIndex, 1);
		await this.update({"system.events": this.system.events});
	}


	get perk() : string {
		switch (this.system.type) {
			case "job":
				return this.system.perk;
			case "socialCard":
				return this.system.perk;
			default:
				return "";
		}
	}

	async createNewTokenSpend(this: Activity | SocialCard) {
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

	async deleteTokenSpend(this: Activity | SocialCard, deleteIndex:number) {
		const list = this.system.tokenSpends;
		list.splice(deleteIndex,1);
		await this.update({"system.tokenSpends":list});
	}

	async priceFix() {
		//updates money to new x10 total
		switch (this.system.type) {
			case "item":
			case "consumable":
				const price = this.system.price * 10;
				await this.update({"system.price": price});
			default:
				return;
		}
	}

	isMultiTarget(this: Usable) : boolean {
		switch (this.system.targets) {
			case "1-nearby-dead":
			case "1-nearby":
			case "1-engaged":
			case "self":
				return false;
			case "1d4-random":
			case "1d4-random-rep":
			case "1d3-random":
			case "1d3-random-rep":
			case "all-enemies":
			case "all-allies":
			case "all-dead-allies":
			case "all-others":
			case "everyone":
				return true;
			default:
				this.system.targets satisfies never;
				PersonaError.softFail(`Unknown target type: ${this.system.targets}`);
				return false;
		}
	}

	isAoE(this: Usable) : boolean {
		switch (this.system.targets) {
			case "1-nearby-dead":
			case "1-nearby":
			case "1-engaged":
			case "self":
			case "1d4-random":
			case "1d4-random-rep":
			case "1d3-random":
			case "1d3-random-rep":
				return false;
			case "all-enemies":
			case "all-allies":
			case "all-dead-allies":
			case "all-others":
			case "everyone":
				return true;
			default:
				this.system.targets satisfies never;
				PersonaError.softFail(`Unknown target type: ${this.system.targets}`);
				return false;
		}
	}

	/** used for determining shadows usage limits
	 */
	powerEffectLevel(this: Power) : number {
		const base = this.system.slot * 3;
		const tags = this.system.tags;
		let mod = 0;
		if (tags.includes("healing")) {
			mod += 1;
		}
		// const multiMod = this.isMultiTarget() ? 1 : 0;
		const dmgtype = this.system.dmg_type;
		if (dmgtype == "dark" || dmgtype == "light")
			mod+= 1;
		if (this.isAoE()) {
			mod += 2;
		}
		return base + mod;
	}

}


/** Handlebars keeps turning my arrays inside an object into an object with numeric keys, this fixes that */
export function ArrayCorrector<T extends any>(obj: (T[] | Record<string | number, T>)): T[] {
	try {
		if (obj == null) return[];
		if (!Array.isArray(obj)) {
			return Object.keys(obj).map(function(k) { return obj[k] });
		}
	} catch (e) {
		throw e;
	}
	return obj;
}

export type CClass = Subtype<PersonaItem, "characterClass">;
export type Power = Subtype<PersonaItem, "power">;
export type Weapon = Subtype<PersonaItem, "weapon">;
export type InvItem = Subtype<PersonaItem, "item">;
export type Talent = Subtype<PersonaItem, "talent">;
export type Focus = Subtype<PersonaItem, "focus">;
export type Consumable = Subtype<PersonaItem, "consumable">;
export type Job = Subtype<PersonaItem, "job">;
export type Activity = SocialCard;
export type SocialCard = Subtype<PersonaItem, "socialCard">;

export type UniversalModifier = Subtype<PersonaItem, "universalModifier">;

export type ModifierContainer = Weapon | InvItem | Focus | Talent | Power | Consumable | UniversalModifier;

export type PowerContainer = Consumable | Power | ModifierContainer;
export type Usable = Power | Consumable;


type ConditionalEffectUpdater<T extends ConditionalEffectObjectContainer> = {
	array: T,
	updater : () => Promise<unknown>;
};

type ConditionalEffectObjectContainer =
	{effects: ConditionalEffect[]}
	| {consequences: Consequence[]}
	| {conditions: Precondition[]};
