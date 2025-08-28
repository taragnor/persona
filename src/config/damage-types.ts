import { PersonaError } from "../module/persona-error.js";
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
	static weaponSkillDamage(weaponPower:ItemSubtype<Power, "weapon">) : NewDamageParams {
	switch (weaponPower.system.damageLevel) {
			case "-": //old system
				PersonaError.softFail(`${weaponPower.name} is no longer supported`);
				return {
					extraVariance: weaponPower.system.melee_extra_mult + 1,
					baseAmt: 0
				};
			case "fixed":
			return {
				extraVariance: 0,
				baseAmt: weaponPower.system.damage.low
			};
			default:
			return DAMAGE_LEVEL_CONVERT_WEAPON[weaponPower.system.damageLevel];
		}
	}

	static magicSkillDamage(magic: ItemSubtype<Power, "magic">) : Readonly<NewDamageParams> {
		switch (magic.system.damageLevel) {
			case "-":
				PersonaError.softFail(`${magic.name} is no longer supported (No damagelevel)`);
				return {
					extraVariance: magic.system.mag_mult,
					baseAmt: 0
				};
			case "fixed":
				PersonaError.softFail(`${magic.name} is no longer supported (Fixed damage)`);
				return {
					extraVariance: 0,
					baseAmt: magic.system.damage.low,
				};
			default:
				const isHealing = magic.system.dmg_type == "healing";
				const val = DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE[magic.system.damageLevel];
				if (isHealing) {
					return {
						extraVariance: val.extraVariance + 1,
						baseAmt: val.baseAmt,
					};
				}
				return val;
		}
	}

	static convertFromOldLowDamageToNewBase(low: number) : number {
		return this.getWeaponDamageByWpnLevel(low-1);
	}

	static getWeaponDamageByWpnLevel(lvl: number) : number {
		const val =  WEAPON_LEVEL_TO_DAMAGE[lvl];
		if (val) {return val;}
		return 0;
	}

}

const DAMAGE_LEVEL_CONVERT_WEAPON = {
	"none": {extraVariance: 0, baseAmt: 0},
	"miniscule": {extraVariance: 0, baseAmt: 0},
	"basic": {extraVariance: 2, baseAmt: 0},
	"light": {extraVariance: 2, baseAmt: 10},
	"medium": {extraVariance: 3, baseAmt: 25},
	"heavy": {extraVariance: 3, baseAmt: 50},
	"severe": {extraVariance: 4, baseAmt: 70},
	"colossal": {extraVariance: 4, baseAmt: 110},
} as const satisfies Readonly<Record<ConvertableDamageLevel, NewDamageParams>> ;


const DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE = {
	"none": {extraVariance: 0, baseAmt: 0},
	"miniscule": {extraVariance: 0, baseAmt: 0},
	"basic": {extraVariance: 2, baseAmt: 0},
	"light": {extraVariance: 2, baseAmt: 18},
	"medium": {extraVariance: 3, baseAmt: 35},
	"heavy": {extraVariance: 3, baseAmt: 60},
	"severe": {extraVariance: 4, baseAmt: 85},
	"colossal": {extraVariance: 4, baseAmt: 120},
} as const satisfies Readonly<Record< ConvertableDamageLevel, NewDamageParams>>;

type ConvertableDamageLevel = Exclude<DamageLevel, "-" | "fixed">;



const INSTANT_KILL_LEVELS_LIST= [
	"none",
	"low",
	"medium",
	"high",
	"always"
] as const;

export type InstantKillLevel = typeof INSTANT_KILL_LEVELS_LIST[number];

export const INSTANT_KILL_LEVELS = HTMLTools.createLocalizationObject( INSTANT_KILL_LEVELS_LIST, "persona.powers.instantKillLevels");


export const INSTANT_KILL_CRIT_BOOST : Record< InstantKillLevel, number>= {
	none: 0,
	high: 11,
	low: 5,
	medium: 8,
	always: 1000,
};

export type NewDamageParams = {
	baseAmt: number,
	extraVariance: number,
};

//formual start at 6, then to get further levels , add (newlvl+1) to previous value
const WEAPON_LEVEL_TO_DAMAGE: Record<number, number> = {
	0: 10,
	1: 14,
	2: 18,
	3: 24,
	4: 32,
	5: 42,
	6: 54,
	7: 68,
	8: 84,
	9: 102,
	10: 122,
	11: 144,
	12: 168,
};


export const BASE_VARIANCE = 1 as const;
