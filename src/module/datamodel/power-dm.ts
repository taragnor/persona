const {StringField:txt, EmbeddedDataField: embedded, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id, BooleanField: bool, FilePathField: file } = foundry.data.fields;

import { ConditionalEffectDM } from "./item-types.js";

import { DAMAGE_LEVELS_LIST } from "../../config/damage-types.js";
import { INSTANT_KILL_LEVELS } from "../../config/damage-types.js";
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

export interface ConditionalEffect {
	isDefensive: boolean,
	conditions: Precondition[],
	consequences: Consequence[]
};

export function powerSpecific () {
	return {
		description: new txt(),
		subtype: new txt<typeof POWERTYPESLIST[number]>( {choices: POWERTYPESLIST, initial: "none"} ),
	}
}

export function powerCost() {
	return {
		mpcost: new num( {initial: -1, integer:true}),
		// hpcost: new num( {integer:true}),
		slot: new num( {integer: true, min:0, max:20, initial: 0}),
		energy: new sch({
			required: new num({initial: 0, min:0, max:10, integer: true}),
			cost: new num({initial: 0, min:0, max:10, integer: true}),
			newForm: new bool(),
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
		sound: new file ({categories: ["AUDIO"] }),
		tags: new arr( new txt<typeof POWER_TAGS_LIST[number]>({choices: POWER_TAGS_LIST})),
		damageLevel: new txt({choices: DAMAGE_LEVELS_LIST, initial: "-"}),
		customCost: new bool(),
		instantKillChance: new txt({choices: INSTANT_KILL_LEVELS, initial: "none"}),
		ailmentChance: new txt({choices: INSTANT_KILL_LEVELS, initial: "none"}),
		damage: damage(),
		mag_mult: new num( {integer:true, min:0, max: 100, initial:1}),
		melee_extra_mult: new num( {integer: true, min: -10, max:50, initial: 0}),
		defense: new txt<(typeof DEFENSECHOICES[number]) >( {choices: DEFENSECHOICES, initial: "ref"}),
		targets: new txt<typeof TARGETINGLIST[number]> ( {choices: TARGETINGLIST, initial: "1-engaged"}),
		validTargetConditions: new arr( new obj<Precondition>()),
		dmg_type: new txt( {choices: DAMAGETYPESLIST, initial:"physical"}),
		crit_boost: new num( {min: -20, max:20, initial: 0, integer:true}),
		atk_bonus: new num({initial: 0, integer: true}),
		openerConditions: new arr(new obj<Precondition>()),
		teamworkConditions: new arr(new obj<Precondition>()),
	};
	//TODO: add shadow type requirements (charged, uncharged)
}

export function effects(_baseattack: boolean) {
	return {
			effects: new arr(new embedded(ConditionalEffectDM)),
	}
}

export class TriEffectsDM extends foundry.abstract.DataModel {
	static override defineSchema() {
		return {
			onUse: new arr(new embedded(ConditionalEffectDM)),
			triggered: new arr(new embedded(ConditionalEffectDM)),
			passive: new arr(new embedded(ConditionalEffectDM)),
			defensive: new arr(new embedded(ConditionalEffectDM)),
			embedded: new arr(new embedded(ConditionalEffectDM)),
		};
	}

}

export function triEffects() {
	return {
		triEffects: new embedded(TriEffectsDM),
	}
}

