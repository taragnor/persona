const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { POWERTYPESLIST } from "../../config/effect-types.js";
import { DAMAGETYPESLIST } from "../../config/damage-types.js";
import { TARGETINGLIST } from "../../config/effect-types.js";
import { Precondition } from "../preconditions.js";
import { Consequence } from "../combat/combat-result.js";
import { POWER_TAGS_LIST } from "../../config/power-tags.js";
import { SHADOW_CHANGE_REQ_LIST } from "../../config/effect-types.js";

export  const damage = function() {
	return new sch( {
		low: new num( {integer:true, min: 0, initial:1}),
		high: new num( {integer:true, min: 0, initial: 1}),
	});
}

export const DEFENSECHOICES = ["fort" , "ref" , "will", "none"] as const;

export type ConditionalEffect  = {
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


const powerEffects = function (fillBaseAttack: boolean) {
	const initial = fillBaseAttack ? [evenDmg, oddDmg] : [];
	return new arr( new obj<ConditionalEffect>()
		,{
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
		reqCharge: new txt( {choices: SHADOW_CHANGE_REQ_LIST , initial: "none"}),
	}
}




export function UsablePowerProps() {
	return {
		tags: new arr( new txt<typeof POWER_TAGS_LIST[number]>({choices: POWER_TAGS_LIST})),
		damage: damage(),
		mag_mult: new num( {integer:true, min:0, max: 100, initial:1}),
		defense: new txt<(typeof DEFENSECHOICES[number]) >( {choices: DEFENSECHOICES, initial: "ref"}),
		targets: new txt<typeof TARGETINGLIST[number]> ( {choices: TARGETINGLIST, initial: "1-engaged"}),
		dmg_type: new txt<typeof DAMAGETYPESLIST[number]>( {choices: DAMAGETYPESLIST, initial:"physical"}),
		crit_boost: new num( {min: -20, max:20, initial: 0, integer:true}),
	};
	//TODO: add shadow type requirements (charged, uncharged)
}

export function effects(baseattack: boolean) {
	return {
		effects: powerEffects(baseattack),
	}
}



