const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { CONSQUENCELIST } from "../../config/effect-types.js";
import { PRECONDITIONLIST } from "../../config/effect-types.js";
import { POWERTYPESLIST } from "../../config/effect-types.js";
import { DAMAGETYPESLIST } from "../../config/damage-types.js";
import { TARGETINGLIST } from "../../config/effect-types.js";

export  const damage = function() {
	return new sch( {
		low: new num( {integer:true, min: 0, initial:1}),
		high: new num( {integer:true, min: 0, initial: 1}),
	});
}

type ConsequencesObject = {
	type: typeof CONSQUENCELIST[number],
	amount?: number,
	statusName?: string,
	statusDuration?: string,
}

type ConditionalEffect  = {
	conditions: Precondition[],
	consequences: ConsequencesObject[]
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

export function UsablePowerProps() {
	return {
		subtype: new txt<typeof POWERTYPESLIST[number]>( {choices: POWERTYPESLIST, initial: "none"} ),
		hpcost: new num( {integer:true}),
		damage: damage(),
		mag_mult: new num( {integer:true, min:1, max: 100, initial:1}),
		targets: new txt<typeof TARGETINGLIST[number]> ( {choices: TARGETINGLIST, initial: "1-engaged"}),
		slot: new num( {integer: true, min:0, max:20, initial: 0}),
		dmg_type: new txt<typeof DAMAGETYPESLIST[number]>( {choices: DAMAGETYPESLIST, initial:"physical"}),
		crit_boost: new num( {min: 0, max:20, initial: 0, integer:true}),
		effects: powerEffects(),
	};
	//TODO: add shadow type requirements (charged, uncharged)
}



