import { statusResists } from "./actor-parts.js";
import { elementalResists } from "./actor-parts.js";
import { Power } from "../module/item/persona-item.js";
import { Talent } from "../module/item/persona-item.js";
import { Focus } from "../module/item/persona-item.js";
import { ValidAttackers } from "../module/combat/persona-combat.js";
import { ResistStrength } from "./damage-types.js";
import { DamageType } from "./damage-types.js";
import {Calculation} from "../module/utility/calculation.js";
import {Defense} from "./defense-types.js";

export interface PersonaI {
	user: ValidAttackers;
	name: string;
	powers: readonly Power[];
	xp: number;
	statusResists: Foundry.SchemaConvert<ReturnType<typeof statusResists>>;
	resists: Foundry.SchemaConvert<ReturnType<typeof elementalResists>>;
	classData: ValidAttackers["system"]["combat"]["classData"];
	talents: readonly Talent[];
	focii: readonly Focus[];
	XPForNextLevel: number;
	level: number;
	scanLevelRaw: number;
	effectiveScanLevel: number;
	getDefense( defType : Defense) : Calculation;
	combatInit: Calculation;
}

export interface PersonaCombatI {
	elemResist(type: Exclude<DamageType, "by-power">): ResistStrength;

}
