import { statusResists } from "./actor-parts.js";
import { elementalResists } from "./actor-parts.js";
import { classData } from "./actor-parts.js";
import { Power } from "../module/item/persona-item.js";
import { Talent } from "../module/item/persona-item.js";
import { Focus } from "../module/item/persona-item.js";
import { ValidAttackers } from "../module/combat/persona-combat.js";

export interface PersonaI {
	user: ValidAttackers;
	name: string;
	powers: Power[];
	xp: number;
	statusResists: Foundry.SchemaConvert<ReturnType<typeof statusResists>>;
	resists: Foundry.SchemaConvert<ReturnType<typeof elementalResists>>;
	classData: Foundry.SchemaConvert<ReturnType<typeof classData>>;
	talents: Talent[];
	focii: Focus[];
	XPForNextLevel: number;
	level: number;
}
