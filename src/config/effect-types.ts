export const CONSQUENCELIST = [
	"none",
	"absorb",
	"hp-loss",
	"dmg-low",
	"dmg-high",
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
] as const;


export  const MODIFIER_VARIABLES = [
	"escalationDie" //Escalation Die

] as const;

export type ModifierVariable = typeof MODIFIER_VARIABLES[number];

export const CONSQUENCETYPES = Object.fromEntries(
CONSQUENCELIST.map( x=> [x, `persona.effecttypes.${x}`])
);

export const PRECONDITIONLIST = [
	"always",
	"natural+",
	"natural-",
	"natural-odd",
	"natural-even",
	"critical",
	"miss",
	"hit",
	"escalation+",
	"escalation-",
	"escalation-odd",
	"escalation-even",
	"activation+",
	"activation-",
	"activation-odd",
	"activation-even",
	"in-battle",
	"non-combat",
	"talent-level+",
	"power-damage-type-is",
	"power-type-is",
	"has-tag",
	"not-tag",
	"user-has-status",
	"user-not-status",
	"target-has-status",
	"target-not-status",
	"user-is-pc",
	"user-is-shadow",
	"is-engaged",
	"is-engaged-with-target",
	"is-not-engaged-with-target",
	"metaverse-enhanced",
	"metaverse-normal",
	"is-resistant-to",
	"not-resistant-to",
	"target-is-resistant-to",
	"target-is-not-resistant-to",
	"struck-weakness",
	"requires-social-link-level",
	"save-versus",
] as const;

export type PreconditionType = typeof PRECONDITIONLIST[number];

export const PRECONDITIONTYPES = Object.fromEntries( PRECONDITIONLIST.map(x=> [x, `persona.preconditions.${x}`]));

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
	"1d4-random",
	"1d4-random-rep",
	"1d3-random",
	"1d3-random-rep",
	"self",
	"all-enemies",
	"all-allies",
] as const;

export const TARGETING= Object.fromEntries( TARGETINGLIST.map(x=> [x, `persona.power.targets.${x}`]));

export const SHADOW_CHANGE_REQ_LIST= [
	"none",
	"always",
	"not-enhanced",
	"supercharged",
] as const;

export type ShadowChargeReq = typeof SHADOW_CHANGE_REQ_LIST[number];

export const SHADOW_CHARGE_REQ = Object.fromEntries( SHADOW_CHANGE_REQ_LIST.map( x=> [x, `persona.power.shadowcosts.${x}`]));
