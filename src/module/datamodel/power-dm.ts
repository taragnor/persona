const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { CONSQUENCELIST } from "../../config/effect-types.js";
import { PRECONDITIONLIST } from "../../config/effect-types.js";
import { POWERTYPESLIST } from "../../config/effect-types.js";
import { DAMAGETYPESLIST } from "../../config/damage-types.js";
import { TARGETINGLIST } from "../../config/effect-types.js";
import { Precondition } from "../combat/modifier-list.js";
import { Consequence } from "../combat/combat-result.js";

export  const damage = function() {
	return new sch( {
		low: new num( {integer:true, min: 0, initial:1}),
		high: new num( {integer:true, min: 0, initial: 1}),
	});
}

const DEFENSECHOICES = ["fort" , "ref" , "will", "none"] as const;

type ConditionalEffect  = {
	conditions: Precondition[],
	consequences: Consequence[]
};

const evenDmg :ConditionalEffect = {
	conditions: [
		{
			type: "hit",
		},
		{
			type: "natural-even",
		},
	],
	consequences: [
		{
			type: "dmg-high"
		}
	]
}

const oddDmg :ConditionalEffect = {
	conditions: [
		{
			type: "hit",
		},
		{
			type: "natural-odd",
		},
	],
	consequences: [
		{
			type: "dmg-low"
		}
	]
}


const powerEffects = function () {
	const initial = [evenDmg, oddDmg];
	return new arr( new obj<ConditionalEffect>()
		,{
			validate: (x:ConditionalEffect[])=> {
				return x.every( e=> Array.isArray(e.conditions) && Array.isArray(e.consequences))
			},
			initial
		});
}

export function powerSpecific () {
	return {
		subtype: new txt<typeof POWERTYPESLIST[number]>( {choices: POWERTYPESLIST, initial: "none"} ),
	}
}

export function powerCost() {
	return {
		hpcost: new num( {integer:true}),
		slot: new num( {integer: true, min:0, max:20, initial: 0}),
	}

}
export function UsablePowerProps() {
	return {
		damage: damage(),
		mag_mult: new num( {integer:true, min:1, max: 100, initial:1}),
		defense: new txt<(typeof DEFENSECHOICES[number]) >( {choices: DEFENSECHOICES, initial: "ref"}),
		targets: new txt<typeof TARGETINGLIST[number]> ( {choices: TARGETINGLIST, initial: "1-engaged"}),
		dmg_type: new txt<typeof DAMAGETYPESLIST[number]>( {choices: DAMAGETYPESLIST, initial:"physical"}),
		crit_boost: new num( {min: 0, max:20, initial: 0, integer:true}),
		effects: powerEffects(),
	};
	//TODO: add shadow type requirements (charged, uncharged)
}



