const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { CONSQUENCELIST } from "../../config/effect-types.js";
import { PRECONDITIONLIST } from "../../config/effect-types.js";
import { POWERTYPESLIST } from "../../config/effect-types.js";
import { DAMAGETYPESLIST } from "../../config/damage-types.js";

export  const damage = function() {
	return new sch( {
		low: new num( {integer:true, min: 0, initial:1}),
		high: new num( {integer:true, min: 0, initial: 1}),
	});
}

type EffectObject = {
	type: typeof CONSQUENCELIST[number],
	damageType ?: typeof DAMAGETYPESLIST[number],
	amount?: number,
	statusName?: string,
	statusDuration?: string,
}

type ConditionalEffect  = {
	conditions: Precondition[],
	consequences: EffectObject[]
};

type Precondition = {
	type : typeof PRECONDITIONLIST[number],
	num?: number,
}

const powerEffects = function () {
	return new arr( new obj<ConditionalEffect>()
		,{
			validate: (x:ConditionalEffect[])=> {
				return x.every( e=> Array.isArray(e.conditions) && Array.isArray(e.consequences))
			}
			});
}


export class Power extends foundry.abstract.DataModel {
	get type() {return "power" as const;}
	static override defineSchema() {
		const ret = {
			subtype: new txt( {choices: POWERTYPESLIST, initial: "none"} ),
			hpcost: new num( {integer:true}),
			damage: damage(),
			mag_mult: new num( {integer:true, min:1, max: 100, initial:1}),
			slot: new num( {integer: true, min:0, max:20, initial: 0}),
			effects: powerEffects(),
		};
		return ret;
	}

}

//testing the types, purely for debug purposes
type PowerSO= SystemDataObjectFromDM<typeof Power>;

