const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id, BooleanField: bool } = foundry.data.fields;


import { POWERTYPESLIST } from "../../config/effect-types.js";
import { DAMAGETYPESLIST } from "../../config/damage-types.js";
import { TARGETINGLIST } from "../../config/effect-types.js";
import { Precondition } from "../../config/precondition-types.js";
import { Consequence } from "../../config/consequence-types.js";
import { POWER_TAGS_LIST } from "../../config/power-tags.js";
import { SHADOW_CHANGE_REQ_LIST_FULL } from "../../config/effect-types.js";

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
			type: "boolean",
			booleanState: true,
			boolComparisonTarget: "is-hit",
		},
		{
			type: "numeric",
			comparisonTarget:"natural-roll",
			comparator: "even",
		},
	],
	consequences: [
		{
			type: "damage-new",
			damageSubtype: "high",
			damageType: "by-power",
		}
	]
}

const oddDmg :ConditionalEffect = {
	conditions: [
		{
			type: "boolean",
			booleanState: true,
			boolComparisonTarget: "is-hit",
		},
		{
			type: "numeric",
			comparisonTarget:"natural-roll",
			comparator: "odd",
		},
	],
	consequences: [
		{
			type: "damage-new",
			damageSubtype: "low",
			damageType: "by-power",
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
		mpcost: new num( {initial: 0, integer:true}),
		hpcost: new num( {integer:true}),
		slot: new num( {integer: true, min:0, max:20, initial: 0}),
		energy: new sch({
			required: new num({initial: 0, min:0, max:10, integer: true}),
			cost: new num({initial: 0, min:0, max:10, integer: true}),
		}),
		reqCharge: new txt( {choices: SHADOW_CHANGE_REQ_LIST_FULL , initial: "none"}),
		reqEscalation: new num( {initial: 0, integer: true, min: 0, max: 6}),
		inspirationId: new id(),
		inspirationCost: new num({initial: 0, max: 10, min:0, integer: true}),
		reqHealthPercentage: new num( {initial: 100, min : 1, max: 100}),
	}
}

export function UsablePowerProps() {
	return {
		tags: new arr( new txt<typeof POWER_TAGS_LIST[number]>({choices: POWER_TAGS_LIST})),
		damage: damage(),
		mag_mult: new num( {integer:true, min:0, max: 100, initial:1}),
		melee_extra_mult: new num( {integer: true, min: 0, max:50, initial: 0}),
		defense: new txt<(typeof DEFENSECHOICES[number]) >( {choices: DEFENSECHOICES, initial: "ref"}),
		targets: new txt<typeof TARGETINGLIST[number]> ( {choices: TARGETINGLIST, initial: "1-engaged"}),
		dmg_type: new txt<typeof DAMAGETYPESLIST[number]>( {choices: DAMAGETYPESLIST, initial:"physical"}),
		crit_boost: new num( {min: -20, max:20, initial: 0, integer:true}),
		atk_bonus: new num({initial: 0, integer: true}),
	};
	//TODO: add shadow type requirements (charged, uncharged)
}

export function effects(baseattack: boolean) {
	return {
		effects: powerEffects(baseattack),
	}
}



