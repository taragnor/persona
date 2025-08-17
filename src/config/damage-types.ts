import { ItemSubtype } from "../module/item/persona-item.js";
import { Power } from "../module/item/persona-item.js";
import { HTMLTools } from "../module/utility/HTMLTools.js";
import { PC } from "../module/actor/persona-actor.js";

export const REALDAMAGETYPESLIST = [
	"physical",
	"gun",
	"fire",
	"cold",
	"wind",
	"lightning",
	"light",
	"dark",
	"untyped",
	"healing",
	"all-out",
	"none",
] as const;

export const DAMAGETYPESLIST = [
	...REALDAMAGETYPESLIST,
	"by-power", //by power or weapon
] as const;

export const DAMAGETYPES = HTMLTools.createLocalizationObject(DAMAGETYPESLIST, "persona.damage.types");

// export const DAMAGETYPES = Object.fromEntries(
// 	DAMAGETYPESLIST.map( x=> [x, `persona.damage.types.${x}`])
// );
export const REALDAMAGETYPES = Object.fromEntries(
	REALDAMAGETYPESLIST.map( x=> [x, `persona.damage.types.${x}`])
);

export type DamageType = ( (typeof DAMAGETYPESLIST)[number]);

export type RealDamageType = ( (typeof REALDAMAGETYPESLIST)[number])

export type ResistType = Exclude<DamageType, "none" | "healing" | "untyped" | "all-out" | "by-power">;

export const RESIST_STRENGTH_LIST = [
	"weakness",
	"normal",
	"resist",
	"block",
	"absorb",
	"reflect"
] as const;

export type ResistStrength = typeof RESIST_STRENGTH_LIST[number];

export const RESIST_STRENGTHS = HTMLTools.createLocalizationObject(RESIST_STRENGTH_LIST, "persona.damage.resist");

// export const RESIST_STRENGTHS = Object.fromEntries(
// 	RESIST_STRENGTH_LIST.map( x=> [x, `persona.damage.resist.${x}`])
// );

export const ELEMENTAL_DEFENSE_LINK : Record<keyof PC["system"]["combat"]["defenses"], ResistType[]> = {
	"ref": ["physical", "fire"],
	"fort": ["cold", "wind", "lightning"],
	"will": ["dark", "light"],
};

export const DAMAGE_LEVELS_LIST = [
	"-",
	"none",
	"fixed",
	"miniscule",
	"basic",
	"light",
	"medium",
	"heavy",
	"severe",
	"colossal",
] as const;

export type DamageLevel = typeof DAMAGE_LEVELS_LIST[number];

export const DAMAGE_LEVELS = HTMLTools.createLocalizationObject(DAMAGE_LEVELS_LIST, "persona.damage.levels");


export class DamageCalculator {
	static weaponSkillDamage(weaponPower:ItemSubtype<Power, "weapon">) : DamageReturn {
	switch (weaponPower.system.damageLevel) {
			case "-": //old system
			return {
				multiplier: weaponPower.system.melee_extra_mult,
				low: 0, high:0};
			case "fixed":
			return {
				multiplier: 0,
				...weaponPower.system.damage
			};
			default:
			return DAMAGE_LEVEL_CONVERT_WEAPON[weaponPower.system.damageLevel];
		}
	}

	static magicSkillDamage(magic: ItemSubtype<Power, "magic">) : DamageReturn {
		switch (magic.system.damageLevel) {

			case "-":
				return {
					multiplier: magic.system.mag_mult,
					low: 0, high: 0 };
			case "fixed":
				return {
					multiplier: 0,
					...magic.system.damage,
				};
			default:
				const isHealing = magic.system.dmg_type == "healing";
				if (isHealing) {
					return DAMAGE_LEVEL_CONVERT_MAGIC_HEALING[magic.system.damageLevel];
				} else {
					return DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE[magic.system.damageLevel];
				}
		}

	}


}

const DAMAGE_LEVEL_CONVERT_WEAPON : Record<ConvertableDamageLevel, DamageReturn> = {
	"none": { multiplier: 0, low: 0, high: 0},
	"miniscule": {multiplier: -1, low: 0, high: 0},
	"basic": {multiplier: 0, low: 1, high: 2},
	// "light": {multiplier: 1, low: 0, high: 0},
	// "medium": {multiplier: 3, low: 0, high: 0},
	// "heavy": {multiplier: 5, low: 0, high: 0},
	// "severe": {multiplier: 7, low: 0, high: 0},
	// "colossal": {multiplier: 10, low: 0, high: 0},
	"light": {multiplier: 1, low: 2, high: 5},
	"medium": {multiplier: 3, low: 5, high: 10},
	"heavy": {multiplier: 5, low: 10, high: 15},
	"severe": {multiplier: 7, low: 15, high: 20},
	"colossal": {multiplier: 9, low: 25, high: 30},
} as const;

const DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE : Record< ConvertableDamageLevel, DamageReturn> = {
	"none": { multiplier: 0, low: 0, high: 0},
	"miniscule": {multiplier: 2, low: 0, high: 0},
	"basic": {multiplier: 1, low: 0, high: 0},
	// "light": {multiplier: 3, low: 0, high: 0},
	// "medium": {multiplier: 4, low: 0, high: 0},
	// "heavy": {multiplier: 7, low: 0, high: 0},
	// "severe": {multiplier: 11, low: 0, high: 0},
	// "colossal": {multiplier: 15, low: 0, high: 0},
	"light": {multiplier: 2, low: 3, high: 7},
	"medium": {multiplier: 3, low: 25, high: 35},
	"heavy": {multiplier: 4, low: 45, high: 55},
	"severe": {multiplier: 5, low: 60, high: 80},
	"colossal": {multiplier: 6, low: 90, high: 110},
} as const;

const DAMAGE_LEVEL_CONVERT_MAGIC_HEALING : Record< ConvertableDamageLevel, DamageReturn> = {
	"none": { multiplier: 0, low: 0, high: 0},
	"miniscule": {multiplier: 2, low: 0, high: 0},
	"basic": {multiplier: 1, low: 0, high: 0},
	// "light": {multiplier: 4, low: 0, high: 0},
	// "medium": {multiplier: 6, low: 0, high: 0},
	// "heavy": {multiplier: 8, low: 0, high: 0},
	// "severe": {multiplier: 13, low: 0, high: 0},
	// "colossal": {multiplier: 18, low: 0, high: 0},
	"light": {multiplier: 3, low: 3, high: 7},
	"medium": {multiplier: 4, low: 25, high: 35},
	"heavy": {multiplier: 6, low: 45, high: 55},
	"severe": {multiplier: 8, low: 60, high: 80},
	"colossal": {multiplier: 10, low: 90, high: 110},
} as const;

type ConvertableDamageLevel = Exclude<DamageLevel, "-" | "fixed">;

type DamageReturn = {
	multiplier: number,
	low: number,
	high: number,
}


const INSTANT_KILL_LEVELS_LIST= [
	"none",
	"low",
	"medium",
	"high",
] as const;

export type InstantKillLevel = typeof INSTANT_KILL_LEVELS_LIST[number];

export const INSTANT_KILL_LEVELS = HTMLTools.createLocalizationObject( INSTANT_KILL_LEVELS_LIST, "persona.powers.instantKillLevels");


export const INSTANT_KILL_CRIT_BOOST : Record< InstantKillLevel, number>= {
	none: 0,
	high: 11,
	low: 5,
	medium: 8
}

export type NewDamageParams = {
	baseAmt: number,
	varianceMult: number,
};
