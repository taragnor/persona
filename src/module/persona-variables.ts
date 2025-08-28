import { ValidAttackers } from "./combat/persona-combat.js";
import { TargettingContextList } from "./combat/persona-combat.js";
import { PersonaDB } from "./persona-db.js";
import { VariableAmount } from "../config/consequence-types.js";
import { AmountOperation } from "../config/consequence-types.js";
import { ConsequenceAmount } from "../config/consequence-types.js";
import { ConsequenceAmountV2 } from "../config/consequence-types.js";
import { VariableTypeSpecifier } from "../config/consequence-types.js";
import { PersonaError } from "./persona-error.js";
import { PersonaScene } from "./persona-scene.js";
import { PersonaSocial } from "./social/persona-social.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { HTMLTools } from "../module/utility/HTMLTools.js";
import { AlterVariableConsequence } from "../config/consequence-types.js";

export class PersonaVariables {
	static async alterVariable (cons: Mutator<AlterVariableConsequence>, contextList : TargettingContextList) {
		const variableLocation = this.#convertTypeSpecToLocation(cons, contextList);
		if (!variableLocation) {return;}
		const origValue = this.#get(variableLocation) ?? 0;
		const newValue = this.#applyMutator( cons, origValue, contextList);
		if (newValue == undefined) {
			PersonaError.softFail(`Couldn't execute ${cons.operator} on ${cons.varType} variable ${cons.variableId}`);
			return;
		}
		await this.#set(variableLocation, newValue);
	}

	/** returns 0 on a non-existent variable, returns undefined if the request was invalid (bad actor Id, etc) */
	static getVariable( cond: Required<VariableTypeSpecifier>, contextList : Partial<TargettingContextList>) : number | undefined {
		const varData = this.#convertTypeSpecToLocation(cond, contextList);
		if (!varData) {return undefined;}
		return this.#get(varData) ?? 0;
	}

	static #convertTypeSpecToLocation(cons: Required<VariableTypeSpecifier>, contextList: Partial<TargettingContextList>) : VariableData | undefined {
		const {varType, variableId} = cons;
		switch (varType) {
			case "global":
				return {
					varType,
					variableId,
				};
			case "scene":
				const scene = game.scenes.get(cons.sceneId) as PersonaScene;
				if (!scene) {
					PersonaError.softFail(`can't find scene ${cons.sceneId} in convertConsequenceToLocation`);
					return undefined;
				}
				return {
					varType,
					variableId,
					scene,
				};
			case "actor":
				const actorAccs = contextList[cons.applyTo];
				if (!actorAccs) {return undefined;}
				const actors = actorAccs
					.map(actorAcc=>  PersonaDB.findActor(actorAcc as UniversalActorAccessor<ValidAttackers>));
				if (actors.length == 0 || !actors.at(0)) {
					PersonaError.softFail(`No Actor Provided to find Variable ${cons.variableId}`, cons);
					return undefined;
				}
				return {
					varType,
					variableId,
					actor: actors.at(0)!,
				};
			case "social-temp":
				return {
					varType,
					variableId,
				};
		}
	}
	static #applyMutator<T extends Mutator<AlterVariableConsequence>>( mutator: T, origValue :number | undefined, contextList: TargettingContextList) : number | undefined {
		if (Number.isNaN(origValue)) {return undefined;}
		switch (mutator.operator) {
			case "set": {
				const {value} = mutator;
				return resolveConsequenceAmount(value, contextList);
			}
			case "add": {
				const {value} = mutator;
				if (origValue == undefined) {return undefined;}
				return resolveConsequenceAmount(value, contextList) + origValue;
			}
			case "multiply": {
				const {value} = mutator;
				if (origValue == undefined) {return undefined;}
				return resolveConsequenceAmount(value, contextList) + origValue;
			}
			case "set-range":
				const {min, max} = mutator;
				return Math.floor(min + (Math.random() * ((1+max)- min)));
			default:
				mutator satisfies never;
				return undefined;
		}
	}

	static async #set(data: VariableData, value: number) {
		switch (data.varType) {
			case "global":
				//TODO: implement
				PersonaError.softFail("Setting global variable not yet implemented");
				break;
			case "scene": {
				const vars : Record<string, number> = data.scene.getFlag("persona", "variables") ?? {};
				vars[data.variableId] = value;
				await data.scene.setFlag("persona", "variables", vars);
				break;
			}
			case "actor": {
				const vars : Record<string, number> = data.actor.getFlag("persona", "variables") ?? {};
				vars[data.variableId] = value;
				await data.actor.setFlag("persona", "variables", vars);
				break;
			}
			case "social-temp": {
				await PersonaSocial.setSocialVariable(data.variableId, value);
				break;
			}
			default:
				data satisfies never;
		}

	}

	static #get(data: VariableData) : number | undefined {
		switch (data.varType) {
			case "global":
				//TODO: Global not yet implemented
				// PersonaError.softFail("Setting global variable not yet implemented");
				return undefined;
			case "scene": {
				const vars : Record<string, number> = data.scene.getFlag("persona", "variables") ?? {};
				return vars[data.variableId];
			}
			case "actor": {
				const vars : Record<string, number> = data.actor.getFlag("persona", "variables") ?? {};
				return vars[data.variableId];
			}
			case "social-temp":
				return PersonaSocial.getSocialVariable(data.variableId);
		}

	}

}


type VariableData = {
	variableId: string,
	varType: VariableType,
} & VariableSpecifier;

export const VARIABLE_TYPE_LIST = [
	"global",
	"scene",
	"actor",
	"social-temp",
] as const;

export type VariableType = typeof VARIABLE_TYPE_LIST[number];

export const VARIABLE_TYPE = HTMLTools.createLocalizationObject(VARIABLE_TYPE_LIST, "persona.effecttypes.variableTypes");

type VariableSpecifier = {
	varType: "global",
} | {
	varType: "scene",
	scene: PersonaScene,
} | {
	varType: "actor",
	actor : PersonaActor,
} | {
	varType: "social-temp",
};


function resolveConsequenceAmount< C extends ConsequenceAmount, T extends PreparedConsequenceAmountV2<C>>(amt: T, contextList: TargettingContextList) : number {
	if (typeof amt == "number") {return amt;}
	switch (amt.type) {
		case "operation":
			return resolveOperation(amt, contextList);
		case "constant":
			return amt.val ?? 0;
		case "variable-value":
				return PersonaVariables.getVariable(amt, contextList) ?? 0;
		case "random-range": {
			const rand = Math.floor(amt.min + Math.random() * (amt.max - amt.min));
			return rand;
		}
		default:
				amt satisfies never;
			PersonaError.softFail(`Unknwon consequence Amount type :${amt["type"]}`);
			return -1;
	}

}

function resolveOperation <T extends PreparedConsequenceAmountV2<C> , C extends ConsequenceAmountV2>(amt: T & {type : "operation"}, contextList: TargettingContextList ) : number {
	const val1 = resolveConsequenceAmount(amt.amt1, contextList);
	const val2 = resolveConsequenceAmount(amt.amt2, contextList);

	switch (amt.operator) {
		case "add":
			return val1 + val2;
		case "subtract":
			return val1 - val2;
		case "divide":
			return val1 / val2;
		case "multiply":
			return val1 * val2;
		case "modulus":
			return val1 % val2;
		default:
			amt.operator satisfies never;
			PersonaError.softFail(`Unknown Operator: ${amt["operator"]}`);
			return -1;
	}
}

export type Mutator<T extends AlterVariableConsequence> =
	//unknwon trick oddly seems to extend to unions
	T extends unknown ?
	(
		Required<T>
	& (
		T extends {value: ConsequenceAmount}
		? {
			value: PreparedConsequenceAmountV2<T["value"]>,
			// found: true
		}
		: {}
	)
	) : never;


type PreparedConsequenceAmountV2<T extends ConsequenceAmount= ConsequenceAmountV2> =
	T extends number
	? number
	: T extends unknown ? (
	Required<T>
	// & {test: string}
	& (
		T extends VariableAmount
		? Required<VariableAmount>
		: {}
	)
	& (
		T extends AmountOperation
		? {
			type: "operation",
			amt1: PreparedConsequenceAmountV2<ConsequenceAmountV2>;
			amt2: PreparedConsequenceAmountV2<ConsequenceAmountV2>;
		}
		:{}
	)
	) : never;

