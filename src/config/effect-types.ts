export const CONSQUENCELIST = [
	"none",
	"absorb",
	"hp-loss",
	"dmg-low",
	"dmg-high",
	"dmg-allout-low",
	"dmg-allout-high",
	"dmg-mult",
	"addStatus",
	"removeStatus",
	"escalationManipulation",
	"extraAttack",
	"expend-slot",
	"modifier",
	"add-escalation",
	"save-slot", //don't expend slot you normally would
	"half-hp-cost", //half hp cost of weapon skills
	"revive",
	"extraTurn",
	"expend-item",
	"recover-slot",
	"add-power-to-list",
	"other-effect",
	"set-flag",
	"raise-resistance",
	"lower-resistance",
] as const;


export  const MODIFIER_VARIABLES = [
	"escalationDie" //Escalation Die
] as const;


export type ModifierVariable = typeof MODIFIER_VARIABLES[number];

export const CONSQUENCETYPES = Object.fromEntries(
CONSQUENCELIST.map( x=> [x, `persona.effecttypes.${x}`])
);

export const POWERTYPESLIST = [
	"weapon",
	"magic",
	"other",
	"passive",
	"none",
	"standalone",
] as const;

export type PowerType = typeof POWERTYPESLIST[number];

export const POWERTYPES= Object.fromEntries( POWERTYPESLIST.map(x=> [x, `persona.power.types.${x}`]));

export const TARGETINGLIST = [
	"1-engaged",
	"1-nearby",
	"1-nearby-dead",
	"1d4-random",
	"1d4-random-rep",
	"1d3-random",
	"1d3-random-rep",
	"self",
	"all-enemies",
	"all-allies",
	"all-dead-allies",
	"all-others",
	"everyone",
] as const;

export const TARGETING= Object.fromEntries( TARGETINGLIST.map(x=> [x, `persona.power.targets.${x}`]));

export const SHADOW_CHANGE_REQ_LIST= [
	"none",
	"always",
	"not-enhanced",
	"supercharged",
	"supercharged-not-enhanced",
] as const;

export type ShadowChargeReq = typeof SHADOW_CHANGE_REQ_LIST[number];

export const SHADOW_CHARGE_REQ = Object.fromEntries( SHADOW_CHANGE_REQ_LIST.map( x=> [x, `persona.power.shadowcosts.${x}`]));


