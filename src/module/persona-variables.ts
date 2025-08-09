import { VariableTypeSpecifier } from "../config/consequence-types.js";
import { PersonaError } from "./persona-error.js";
import { PersonaScene } from "./persona-scene.js";
import { PersonaSocial } from "./social/persona-social.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { HTMLTools } from "../module/utility/HTMLTools.js";
import { AlterVariableConsequence } from "../config/consequence-types.js";

export class PersonaVariables {
	static async alterVariable (cons: AlterVariableConsequence, actor: PersonaActor) {
		const variableLocation = this.#convertTypeSpecToLocation(cons, actor);
		if (!variableLocation) return;
		const origValue = this.#get(variableLocation) ?? 0;
		const newValue = this.#applyMutator( cons, origValue);
		if (newValue == undefined) {
			PersonaError.softFail(`Couldn't execute ${cons.operator} on ${cons.varType} variable ${cons.variableId}`);
			return;
		}
		await this.#set(variableLocation, newValue);
	}

	/** returns 0 on a non-existent variable, returns undefined if the request was invalid (bad actor Id, etc) */
	static getVariable( cond: VariableTypeSpecifier, actor : PersonaActor | null ) : number | undefined {
		const varData = this.#convertTypeSpecToLocation(cond, actor);
		if (!varData) return undefined;
		return this.#get(varData) ?? 0;
	}

	static #convertTypeSpecToLocation(cons: VariableTypeSpecifier, actor: PersonaActor | null) : VariableData | undefined {
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
				}
			case "actor":
				if (!actor) {
					PersonaError.softFail(`No Actor Provided to find Variable ${cons.variableId}`, cons);
					return undefined;
				}
				return {
					varType,
					variableId,
					actor,
				};
			case "social-temp":
				return {
					varType,
					variableId,
				}
		}
	}
	static #applyMutator( mutator: Pick<AlterVariableConsequence, "operator" | "value">, origValue :number | undefined) : number | undefined {
		const {operator, value} = mutator;
		if (Number.isNaN(origValue)) return undefined;
		switch (operator) {
			case "set":
				return value;
			case "add":
				if (origValue == undefined) return undefined;
				return value + origValue;
			case "multiply":
				if (origValue == undefined) return undefined;
				return value + origValue;
			default:
				operator satisfies never;
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

