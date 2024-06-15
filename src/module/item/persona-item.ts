import { BASIC_POWER_NAMES } from "../../config/basic-powers.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { getActiveConsequences } from "../preconditions.js";
import { testPrecondition } from "../preconditions.js";
import { Availability } from "../../config/availability-types.js";
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
		return this.system.leveling_table[lvl][property];
	}

	get accessor() : UniversalItemAccessor<typeof this> {
		return PersonaDB.getUniversalItemAccessor(this);
	}

	static getBasicPowers() : Power[] {
const basic = BASIC_POWER_NAMES;
		return basic.flatMap( powerName =>  {
const power = PersonaDB.getBasicPower(powerName);
			if (!power) return [];
			return [power as Power];
		});
	}

	get tags() : string {
		if ("tags" in this.system)
			return this.system.tags.join(", ");
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

	get conditional_effects() : ConditionalEffect[] {
		if (! ("effects" in this.system)) return [];
		return (this as ModifierContainer).getEffects();

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
		return this.conditional_effects.some(
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
		return this.conditional_effects
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
				costs.push("Charged");
				break;
			case "not-enhanced":
				if (!Metaverse.isEnhanced()) {costs.push("Charged")}
				break;
			case "supercharged":
				costs.push("AMPED");
				break;
			case "supercharged-not-enhanced":
				if (!Metaverse.isEnhanced()) {
					costs.push("AMPED")
				} else {
					costs.push("Charged");
				}
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
	async addConditionalEffect(this: SocialCard, location: "opportunity" | "event", index: number) :Promise<void> 
	async addConditionalEffect(this: SocialCard | PowerContainer, location?: "opportunity" | "event", index?: number) :Promise<void>
	{
		if (this.system.type != "socialCard") {
			return await (this as Exclude<typeof this, SocialCard>).addNewPowerEffect();
		} else {
			const card = this as SocialCard;
			if (index == undefined)  throw new PersonaError("no index provided");
			switch (location) {
				case "opportunity":
					const list = this.system.opportunity_list;
				const roll = list[index].roll;
					if (!("effects" in roll)) {
						(roll as any)["effects"] = [];
					}
					if (!("effects" in roll)) {
						throw new PersonaError("something weird happened");
					}
					roll.effects = ArrayCorrector(roll.effects);
					roll.effects.push( PersonaItem.newConditionalEffectsObject());
					await this.update({"system.opportunity_list": list});
					break;
				case "event":
					throw new PersonaError("Not yet implemented");
				default:
					location satisfies undefined;
					throw new PersonaError(`Not yet implemented for location ${location}`);
			}
		}
	}

	async deletePowerEffect(this: PowerContainer, index: number) : Promise<void> {
		let arr =this.system.effects ?? [];
		arr.splice(index, 1);
		await this.update({ "system.effects": arr});
	}

	async deleteConditionalEffect(this: PowerContainer, effect_index: number): Promise<void>;
	async deleteConditionalEffect(this: SocialCard, location: "opportunity", opportunity_index: number, effect_index: number) : Promise<void>;
	async deleteConditionalEffect(this: SocialCard | PowerContainer, locationOrIndex?: number | "opportunity", opportunity_index?: number, effect_index?: number) : Promise<void> {
		if (this.system.type != "socialCard") {
			return await (this as Exclude<typeof this, SocialCard>) .deletePowerEffect(locationOrIndex as number);
		}
		switch (locationOrIndex) {
			case "opportunity":
				const list = this.system.opportunity_list;
				const roll = list[opportunity_index!].roll;
				if (("effects" in roll)) {
					roll.effects = ArrayCorrector(roll.effects);
					roll.effects.splice(effect_index!, 1);
					await this.update({"system.opportunity_list": list});
				}
				return;
			default:
				locationOrIndex satisfies undefined | number;
				throw new PersonaError(`invalid location: ${locationOrIndex}`);
		}
	}

	async addNewPowerPrecondition(this: PowerContainer, index:number) {
		const x = this.system.effects[index];
		x.conditions = ArrayCorrector(x.conditions);
		x.conditions.push( {
			type: "always"
		});
		await this.update({"system.effects": this.system.effects});
	}

	async addCondition(this: PowerContainer, effect_index: number) : Promise<void>;
	async addCondition(this: SocialCard, location: "opportunity", opportunity_index: number, effect_index: number): Promise<void>;
	async addCondition(this: SocialCard | PowerContainer, locationOrIndex: "opportunity" | number, opportunity_index?: number, effect_index?: number): Promise<void>
	{
		if (this.system.type != "socialCard") {
			return await (this as PowerContainer).addNewPowerPrecondition(locationOrIndex as number);
		}
		switch (locationOrIndex) {
			case "opportunity": {
				const card = this as SocialCard;
				const list = this.system.opportunity_list;
				const roll = list[opportunity_index!].roll;
				if (("effects" in roll)) {
					roll.effects= ArrayCorrector(roll.effects);
					const effect = roll.effects[effect_index!];
					effect.conditions = ArrayCorrector(effect.conditions);
					effect.conditions.push({
						type: "always"
					});
					await this.update({"system.opportunity_list": list});
				}
			}
				break;
			default:
				locationOrIndex satisfies number | undefined;
				throw new PersonaError(`invalid location: ${locationOrIndex}`);
		}
	}

	async deletePowerPrecondition( this: PowerContainer, effectIndex: number, condIndex: number) {
		const x = this.system.effects[effectIndex];
		x.conditions = ArrayCorrector(x.conditions);
		x.conditions.splice(condIndex, 1);
		await this.update({"system.effects": this.system.effects});
	}

	async deleteCondition(this: PowerContainer, effectIndex: number, condIndex: number): Promise<void>;
	async deleteCondition(this: SocialCard, location: "opportunity", opportunityIndex: number, effectIndex: number, condIndex: number): Promise<void>;
	async deleteCondition(this: SocialCard | PowerContainer, locationOrIndex: "opportunity" | number, opportunityIndex: number, effectIndex?: number, condIndex?: number): Promise<void> {
		if (this.system.type != "socialCard") {
			return await (this as PowerContainer).deletePowerPrecondition(locationOrIndex as number, opportunityIndex);
		}
		switch (locationOrIndex) {
			case "opportunity": {
				const card = this as SocialCard;
				const list = this.system.opportunity_list;
				const roll = list[opportunityIndex!].roll;
				if (("effects" in roll)) {
					roll.effects= ArrayCorrector(roll.effects);
					const effect = roll.effects[effectIndex!];
					effect.conditions = ArrayCorrector(effect.conditions);
					effect.conditions.splice(condIndex!, 1);
					await this.update({"system.opportunity_list": list});
				}
			}
				break;
			default:
				locationOrIndex satisfies number | undefined;
				throw new PersonaError(`invalid location: ${locationOrIndex}`);
		}
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
	async addConsequence(this: SocialCard, location: "opportunity", opportunityIndex:number, effectIndex: number): Promise<void>;
	async addConsequence(this: SocialCard | PowerContainer, locationOrIndex: "opportunity"| number, opportunityIndex?: number, effectIndex?: number){
		if (this.system.type != "socialCard") {
			return await (this as PowerContainer).addNewPowerConsequence(locationOrIndex as number);
		}
		switch (locationOrIndex) {
			case "opportunity": {
				const card = this as SocialCard;
				const list = this.system.opportunity_list;
				const roll = list[opportunityIndex!].roll;
				if (("effects" in roll)) {
					roll.effects= ArrayCorrector(roll.effects);
					const effect = roll.effects[effectIndex!];
					effect.consequences = ArrayCorrector(effect.consequences);
					effect.consequences.push({
						type: "none",
						amount: 0,
					});
					await this.update({"system.opportunity_list": list});
				}
			}
				break;
			default:
				locationOrIndex satisfies number | undefined;
				throw new PersonaError(`invalid location: ${locationOrIndex}`);
		}
	}

	async deleteConsequence(this: PowerContainer, effectIndex: number, consIndex: number): Promise<void>;
	async deleteConsequence(this: SocialCard, location: "opportunity", opportunityIndex: number, effectIndex: number, consIndex: number): Promise<void>;
	async deleteConsequence(this: SocialCard | PowerContainer, locationOrIndex: "opportunity" | number, index1: number, index2?: number, index3?: number): Promise<void> {
		if (this.system.type != "socialCard") {
			return await (this as PowerContainer).deletePowerConsequence(locationOrIndex as number, index1);
		}
		switch (locationOrIndex) {
			case "opportunity": {
				const card = this as SocialCard;
				const list = this.system.opportunity_list;
				const roll = list[index1!].roll;
				if (("effects" in roll)) {
					roll.effects= ArrayCorrector(roll.effects);
					const effect = roll.effects[index2!];
					effect.consequences = ArrayCorrector(effect.consequences);
					effect.consequences.splice(index3!, 1);
					await this.update({"system.opportunity_list": list});
				}
			}
				break;
			default:
				locationOrIndex satisfies number | undefined;
				throw new PersonaError(`invalid location: ${locationOrIndex}`);
		}
	}



	async deletePowerConsequence (this: PowerContainer, effectIndex: number, consIndex: number) {
		const x = this.system.effects[effectIndex];
		x.consequences = ArrayCorrector(x.consequences);
		x.consequences.splice(consIndex, 1);
		await this.update({"system.effects": this.system.effects});
	}

	getModifier(this: ModifierContainer, type : ModifierTarget) : ModifierListItem[] {
		return this.getEffects()
			.map(x =>
				({
					name: this.name,
					source: PersonaDB.getUniversalItemAccessor(this),
					conditions: ArrayCorrector(x.conditions),
					modifier: ArrayCorrector(x.consequences).reduce( (acc,x)=> {
						if ( x.modifiedField == type) {
							if (x.amount != 0) return acc + (x.amount ?? 0);
						}
						return acc;
					}, 0),
					variableModifier: new Set(ArrayCorrector(x.consequences).flatMap ( x=> {
						if (x.modifiedField != type) return [];
						if (x.type == "add-escalation") return ["escalationDie"];
						return [];
					}))
				})
			);
		// return this.system.modifiers[type];
	}

	getDamage(this:ModifierContainer , user: PC | Shadow, type: "high" | "low", situation: Situation = {user: user.accessor , usedPower: this.accessor}) : number {
		if (!("dmg_type" in this.system)) return 0;
		if (this.system.dmg_type == "none") return 0;
		const subtype : PowerType  = this.system.type == "power" ? this.system.subtype : "standalone";
		switch(subtype) {
			case "weapon" : {
				const dmg = user.wpnDamage(true, situation);
				const bonus = this.system.damage;
				const modified = {
					low: dmg.low + bonus.low,
					high: dmg.high + bonus.high
				}
				return modified[type];
			}
			case "magic": {
				const dmg = user.magDmg(situation);
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

	getSourcedEffects(this: ModifierContainer): {source: ModifierContainer, effects: ConditionalEffect[]} {
		return {source: this,
			effects: this.getEffects()
		};
	}

	getEffects(this: ModifierContainer): ConditionalEffect[] {
		return this.system.effects.map( eff=> {
			return {
				conditions: ArrayCorrector(eff.conditions),
				consequences: ArrayCorrector(eff.consequences)
			}
		});
	}

	requiredLinkLevel(this: Focus) : number  {
		let requirement = 0;
		for (const eff of this.getEffects()) {
			for (const cond of eff.conditions) {
				if (cond.type == "numeric" && cond.comparisonTarget == "social-link-level")
				{
					if (cond.num)
						requirement = Math.max(requirement, cond.num);
				}
			}
		}
		return requirement;
	}

	async setAvailability(this: Job, d6roll:number) {
		if (this.system.availability == "N/A")
			return;
		let avail: Availability = "--";
		switch (d6roll) {
			case 1:
				avail = "--";
				break;
			case 2:
			case 3:
				avail = "-";
				break;
			case 4:
			case 5:
				avail = "+";
				break;
			case 6:
				avail = "++";
				break;
			default:
				throw new PersonaError(`d6 roll doesn't fall within range: ${d6roll}`);
		}
		await this.update({ "system.availability": avail});
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
export type SocialCard = Subtype<PersonaItem, "socialCard">;

export type UniversalModifier = Subtype<PersonaItem, "universalModifier">;

export type ModifierContainer = Weapon | InvItem | Focus | Talent | Power | Consumable | UniversalModifier;

export type PowerContainer = Consumable | Power | ModifierContainer;
export type Usable = Power | Consumable;

