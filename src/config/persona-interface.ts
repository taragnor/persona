import { statusResists } from "./actor-parts.js";
import { elementalResists } from "./actor-parts.js";
import { Power } from "../module/item/persona-item.js";
import { Talent } from "../module/item/persona-item.js";
import { Focus } from "../module/item/persona-item.js";
import { ValidAttackers } from "../module/combat/persona-combat.js";
import { ResistStrength } from "./damage-types.js";
import { DamageType } from "./damage-types.js";
import { ModifierList } from "../module/combat/modifier-list.js";

export interface PersonaI {
	user: ValidAttackers;
	name: string;
	powers: Power[];
	xp: number;
	statusResists: Foundry.SchemaConvert<ReturnType<typeof statusResists>>;
	resists: Foundry.SchemaConvert<ReturnType<typeof elementalResists>>;
	classData: ValidAttackers["system"]["combat"]["classData"];
	talents: Talent[];
	focii: Focus[];
	XPForNextLevel: number;
	level: number;
	scanLevel: number;
	getDefense( defType : keyof ValidAttackers["system"]["combat"]["defenses"]) : ModifierList;
	combatInit: number;
}

export interface PersonaCombatI {
	elemResist(type: Exclude<DamageType, "by-power">): ResistStrength;

}
