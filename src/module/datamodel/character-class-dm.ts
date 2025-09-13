import {HTMLTools} from "../utility/HTMLTools.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const {StringField:txt, ObjectField:obj, BooleanField: bool, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

export class CharacterClassDM extends foundry.abstract.DataModel {
	get type() { return "characterClass" as const;}
	static override defineSchema() {
		return {
			uniquePersonas: new num({initial:0, min: 0, max:3, integer:true}),
			maxPersonas: new num({initial:0, min: 0, max:10, integer:true}),
			canUseRandomPersonas: new bool({initial: false}),
			canUsePowerSideboard: new bool({initial: false}),
			canUsePersonaSideboard: new bool({initial: false}),
			hpgrowth : new sch( {
				growthRate: new num( {initial: 1.02, integer: false, min: 0, max: 10}),
				initial: new num( {initial: 45, integer: true, min: 0, max: 100}),
				initialGrowthAmount: new num( {initial: 2, integer: false, min: 0, max: 100}),
				growthAcceleration: new num( {initial: 0, integer: false, min: 0, max: 2}),
			}),
			mpgrowth : new sch( {
				growthRate: new num( {initial: 1.02, integer: false, min: 0, max: 10}),
				initial: new num( {initial: 30, integer: true, min: 0, max: 100}),
				initialGrowthAmount: new num( {initial: 1.5, integer: false, min: 0, max: 100}),
				growthAcceleration: new num( {initial: 0, integer: false, min: 0, max: 2}),
			}),
			affinityType: new txt({choices: PERSONA_AFFINITIES, initial: "standard"}),
			focii: new arr(new id()),
			powers: new arr(new id()),
			description: new txt(),
		};
	}
}

const PERSONA_AFFINITY_LIST = [
	 "all",
	 "strong",
	 "standard",
	 "weak",
] as const;

export const PERSONA_AFFINITIES = HTMLTools.createLocalizationObject(PERSONA_AFFINITY_LIST, "persona.affinity.ranking");
