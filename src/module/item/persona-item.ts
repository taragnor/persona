import { PC } from "../actor/persona-actor.js";
import { Shadow } from "../actor/persona-actor.js";
import { Situation } from "../combat/modifier-list.js";
import { Precondition } from "../combat/modifier-list.js";
import { ITEMMODELS } from "../datamodel/item-types.js";
import { PersonaDB } from "../persona-db.js";

declare global {
	type ItemSub<X extends PersonaItem["system"]["type"]> = Subtype<PersonaItem, X>;
}

export class PersonaItem extends Item<typeof ITEMMODELS> {

	getClassProperty<T extends keyof CClass["system"]["leveling_table"][number]> (this: CClass,lvl: number, property:T)  : CClass["system"]["leveling_table"][number][T] {
		return this.system.leveling_table[lvl][property];
	}

	static getBasicAttack() : Option<Power> {
		return PersonaDB.getItemByName("Basic Attack")  as Power;
	}

	async addNewPowerEffect(this: PowerContainer) {
		const arr= this.system.effects ?? [];
		arr.push( {
			conditions: [],
			consequences: []
		});
		await this.update({ "system.effects": arr});
	}

	async deletePowerEffect(this: PowerContainer, index: number) : Promise<void> {
		let arr =this.system.effects ?? [];
		arr.splice(index, 1);
		await this.update({ "system.effects": arr});
}

	async addNewPowerPrecondition(this: PowerContainer, index:number) {
		const x = this.system.effects[index];
		x.conditions = ArrayCorrector(x.conditions);
		x.conditions.push( {
			type: "always"
		});
		await this.update({"system.effects": this.system.effects});
	}

async deletePowerPrecondition( this: PowerContainer, index: number) {
		const x = this.system.effects[index];
		x.conditions = ArrayCorrector(x.conditions);
	   x.conditions.splice(index, 1);
		await this.update({"system.effects": this.system.effects});
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

async deletePowerConsequence (this: PowerContainer, index: number) {
	const x = this.system.effects[index];
	x.consequences = ArrayCorrector(x.consequences);
	x.consequences.splice(index, 1);
	await this.update({"system.effects": this.system.effects});
}

	getModifier(this: ModifierContainer, type : keyof InvItem["system"]["modifiers"]) : number {
		return this.system.modifiers[type];
	}

	getDamage(this: Power, user: PC | Shadow, type: "high" | "low") : number {
		switch(this.system.subtype) {
			case "weapon" : {
				const dmg =user.wpnDamage(true)
				const bonus = this.system.damage;
				const modified = {
					low: dmg.low + bonus.low,
					high: dmg.high + bonus.high
				}
				return modified[type];
			}
			case "magic": {
				const dmg = user.magDmg();
				const mult = this.system.mag_mult;
				const modified = {
					low: dmg.low * mult,
					high: dmg.high * mult
				}
				return modified[type];
			}
			default:
				return 0;
		}
	}

static testPrecondition (condition: Precondition, situation:Situation) : boolean {
		const nat = situation.naturalAttackRoll;
		switch (condition.type) {
			case "always":
				return true;
			case "natural+":
				return nat != undefined && nat >= condition.num! ;
			case "natural-":
				return nat != undefined && nat <= condition.num! ;
			case "natural-odd":
				return nat != undefined && nat % 2 == 1;
			case "natural-even":
				return nat != undefined && nat % 2 == 0;
			case "critical":
				return situation.criticalHit ?? false;
			case "miss":
					return situation.hit === false;
			case "hit":
					return situation.hit === true;
			case "escalation+":
				return situation.escalationDie != undefined && situation.escalationDie >= condition.num!;
			case "escalation-":
				return situation.escalationDie != undefined && situation.escalationDie <= condition.num!;
			case "activation+":
				return !!situation.activationRoll && nat! >= condition.num!;
			case "activation-":
				return !!situation.activationRoll && nat! <= condition.num!;
			case "activation-odd":
				return !!situation.activationRoll && nat! % 2 == 1;
			case "activation-even":
				return !!situation.activationRoll && nat! % 2 == 0;
			default:
				condition.type satisfies never;
				return false;
		}
	}

}


/** Handlesbars keeps turning my arrays inside an object into an object with numeric keys, this fixes that */
export function ArrayCorrector<T extends any>(obj: (T[] | Record<string | number, T>)): T[] {
	if (!Array.isArray(obj)) {
		return Object.keys(obj).map(function(k) { return obj[k] });
	}
	return obj;
}

export type CClass = Subtype<PersonaItem, "characterClass">;
export type Power = Subtype<PersonaItem, "power">;
export type Weapon = Subtype<PersonaItem, "weapon">;
export type InvItem = Subtype<PersonaItem, "item">;
export type Talent = Subtype<PersonaItem, "talent">;
export type StudentSkill = Subtype<PersonaItem, "studentSkill">;
export type Focus = Subtype<PersonaItem, "focus">;
export type Consumable = Subtype<PersonaItem, "consumable">;

export type ModifierContainer = Weapon | InvItem | Focus | Talent;

export type PowerContainer = Consumable | Power;

