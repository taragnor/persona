import { localize } from "./persona.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../config/status-effects.js";
import { RESIST_STRENGTH_LIST } from "../config/damage-types.js";
import { getActiveConsequences } from "./preconditions.js";
import { Situation } from "./preconditions.js";
import { statusResists } from "../config/actor-parts.js";
import { PersonaI } from "../config/persona-interface.js";
import { DamageType } from "../config/damage-types.js";
import { ResistStrength } from "../config/damage-types.js";
import {ValidAttackers} from "./combat/persona-combat.js";
import {Power, Talent, Focus} from "./item/persona-item.js";
import { elementalResists } from "../config/actor-parts.js";
import { classData } from "../config/actor-parts.js";

export class Persona<T extends ValidAttackers = ValidAttackers> implements PersonaI {
	user: T;
	name: string;
	powers: Power[];
	xp: number;
	statusResists: Foundry.SchemaConvert<ReturnType<typeof statusResists>>;
	resists: Foundry.SchemaConvert<ReturnType<typeof elementalResists>>;
	classData: Foundry.SchemaConvert<ReturnType<typeof classData>>;
	talents: Talent[];
	focii: Focus[];
	XPForNextLevel: number;
	scanLevel: number;
	actorId: string;

	constructor (actor: T, powers: Power[]) {
		this.user = actor;
		const {statusResists, resists, classData} = actor.system.combat;
		this.powers = powers;
		this.statusResists = statusResists;
		this.resists= resists;
		this.classData = classData;
		this.talents = actor.talents;
		this.focii = actor.focii;
		this.XPForNextLevel = actor.XPForNextLevel;
		this.scanLevel = 3;
		this.actorId = actor.id;
		switch (actor.system.type) {
			case "pc":
			case "npcAlly":
				this.name = actor.system.personaName;
				break;
			case "shadow":
				this.name = actor.name;
		}
	}

	get level() : number {
		return this.classData.level;
	}

	elemResist(type: Exclude<DamageType, "by-power">): ResistStrength {
		switch (type) {
			case "untyped":  case "none":
			case "all-out":
				return "normal";
			case "healing":
				return "absorb";
		}

		const baseResist = this.resists[type] ?? "normal";
		const effectChangers=  this.user.mainModifiers().filter( x=> x.getEffects(this.user)
			.some(x=> x.consequences
				.some( cons=>cons.type == "raise-resistance" || cons.type == "lower-resistance")));
		const situation : Situation = {
			user: this.user.accessor,
			target: this.user.accessor,
		};
		const consequences = effectChangers.flatMap(
			item => item.getEffects(this.user).flatMap(eff =>
				getActiveConsequences(eff, situation, item)
			)
		);
		const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
		let resBonus = 0;
		let resPenalty = 0;
		for (const cons of consequences) {
			switch (cons.type) {
				case "raise-resistance":
					if (cons.resistType == type &&
						resval(cons.resistanceLevel!) > resval(baseResist)) {
						resBonus = Math.max(resBonus, resval(cons.resistanceLevel!) - resval(baseResist))
					}
					break;
				case "lower-resistance":
					if (cons.resistType == type &&
						resval (cons.resistanceLevel!) < resval(baseResist))  {
						resPenalty = Math.min(resPenalty, resval(cons.resistanceLevel!) - resval(baseResist))
					}
					break;
				default:
					break;
			}
		}
		const resLevel = Math.clamp(resval(baseResist) + resBonus + resPenalty, 0 , RESIST_STRENGTH_LIST.length-1);
		return RESIST_STRENGTH_LIST[resLevel];
	}

	static combinedPersona<T extends ValidAttackers>(basePersona: Persona<T>, attachedPersona: Persona<any>) : Persona<T> {
		const fusedPowers = attachedPersona.powers.concat(
			basePersona.powers);
		fusedPowers.length = Math.min(6, fusedPowers.length);
		const fusedPersona = new Persona(attachedPersona.user, fusedPowers);
		// const fusedPersona : PersonaI = {
		// 	user: basePersona.user,
		// 	name: attachedPersona.name,
		// 	powers: fusedPowers,
		// 	xp: attachedPersona.xp,
		// 	statusResists: attachedPersona.statusResists,
		// 	resists: attachedPersona.resists,
		// 	classData: basePersona.classData,
		// 	talents: attachedPersona.talents,
		// 	focii: attachedPersona.focii,
		// 	XPForNextLevel: attachedPersona.XPForNextLevel,
		// 	level: attachedPersona.level,
		// 	scanLevel: attachedPersona.scanLevel,
		// }
		fusedPersona.user = basePersona.user;
		fusedPersona.classData = basePersona.classData;
		return fusedPersona;
	}

	get isBasePersona(): boolean {
		return this.actorId == this.user.id;
	}

	get printableResistanceString() : string {
		const resists = this.statusResists;
		const retdata = Object.entries(resists)
			.map(([statusRaw, level]) => {
				const statusTrans = localize(STATUS_EFFECT_TRANSLATION_TABLE[statusRaw]);
				switch (level) {
					case "resist": return `Resist ${statusTrans}`;
					case "absorb":
					case "reflect":
					case "block": return `Block ${statusTrans}`;
					default: return "";
				}
			})
			.filter( x=> x.length > 0)
			.join(", ");
		return retdata;
	}

}
