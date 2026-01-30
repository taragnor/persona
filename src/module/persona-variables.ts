
import { PersonaCombat} from "./combat/persona-combat.js";
import { TargettingContextList } from "./combat/persona-combat.js";
import { PersonaDB } from "./persona-db.js";
import { VariableTypeSpecifier } from "../config/consequence-types.js";
import { PersonaError } from "./persona-error.js";
import { PersonaScene } from "./persona-scene.js";
import { PersonaSocial } from "./social/persona-social.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { HTMLTools } from "../module/utility/HTMLTools.js";
import {ConsequenceAmountResolver} from "./conditionalEffects/consequence-amount.js";
import {PersonaSettings} from "../config/persona-settings.js";

export class PersonaVariables {
	static async alterVariable (cons: SourcedConsequence & {type: "alter-variable"}, situation : Partial<Situation>) {
		const variableLocation = this.#convertTypeSpecToLocation(cons, situation);
		if (!variableLocation) {return;}
		const origValue = this.#get(variableLocation) ?? 0;
		const newValue = this.#applyMutator( cons, origValue, situation);
		if (newValue == undefined) {
			PersonaError.softFail(`Couldn't execute ${cons.operator} on ${cons.varType} variable ${cons.variableId}`);
			return;
		}
		await this.#set(variableLocation, newValue);
	}

	/** returns 0 on a non-existent variable, returns undefined if the request was invalid (bad actor Id, etc) */
	static getVariable( cond: Required<VariableTypeSpecifier>, situation : Partial<Situation>) : number | undefined {
		const varData = this.#convertTypeSpecToLocation(cond, situation);
		if (!varData) {return undefined;}
		return this.#get(varData) ?? 0;
	}

	static #convertTypeSpecToLocation(cons: Required<VariableTypeSpecifier>, situation: Partial<Situation>) : VariableData | undefined {
		const {varType, variableId} = cons;
		switch (varType) {
			case "global":
				return {
					varType,
					variableId,
				};
			case "scene": { const scene = game.scenes.get(cons.sceneId as PersonaScene["id"]) as PersonaScene;
				if (!scene) {
					PersonaError.softFail(`can't find scene ${cons.sceneId} in convertConsequenceToLocation`);
					return undefined;
				}
				return {
					varType,
					variableId,
					scene,
				};
			}
			case "actor": {
				const contextList = PersonaCombat.createTargettingContextList(situation, null);
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
			}
			case "social-temp":
				return {
					varType,
					variableId,
				};
		}
	}

	static #applyMutator<T extends SourcedConsequence & {type: "alter-variable"}>( mutator: T, origValue :number | undefined, situation: Partial<Situation>) : number | undefined {
		if (Number.isNaN(origValue)) {return undefined;}
		switch (mutator.operator) {
			case "set": {
				const value = ConsequenceAmountResolver.extractSourcedValue(mutator);
				return ConsequenceAmountResolver.resolveConsequenceAmount(value, situation);
			}
			case "add": {
				const value = ConsequenceAmountResolver.extractSourcedValue(mutator);
				if (origValue == undefined) {return undefined;}
				const val = ConsequenceAmountResolver.resolveConsequenceAmount(value, situation);
				return (val ?? 0) + origValue;
			}
			case "multiply": {
				const value = ConsequenceAmountResolver.extractSourcedValue(mutator);
				if (origValue == undefined) {return undefined;}
				const val = ConsequenceAmountResolver.resolveConsequenceAmount(value, situation);
				return (val ?? 1) * origValue;
			}
			case "set-range": {
				const {min, max} = mutator;
				return Math.floor(min + (Math.random() * ((1+max)- min)));
			}
			default:
				mutator satisfies never;
				return undefined;
		}
	}

	static async #set(data: VariableData, value: number) {
		switch (data.varType) {
			case "global":
				await PersonaSettings.setGlobalVariable(data.variableId, value);
				break;
			case "scene": {
				const vars : Record<string, number> = data.scene.getFlag("persona", "variables") ?? {};
				vars[data.variableId] = value;
				await data.scene.setFlag("persona", "variables", vars);
				break;
			}
			case "actor": {
				await data.actor.setVariable(data.variableId, value);
				break;
			}
			case "social-temp": {
				PersonaSocial.currentSocialCardExecutor?.setSocialVariable(data.variableId, value);
				break;
			}
			default:
				data satisfies never;
		}

	}

	static #get(data: VariableData) : number | undefined {
		switch (data.varType) {
			case "global": {
				const globalVar = PersonaSettings.getGlobalVariable(data.variableId);
				return globalVar ?? 0;
			}
			case "scene": {
				const vars : Record<string, number> = data.scene.getFlag("persona", "variables") ?? {};
				return vars[data.variableId];
			}
			case "actor": {
				return data.actor.getVariable(data.variableId);
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


export function createTargettingContextListFromSituation( situation: Situation) : Partial<TargettingContextList> {
	 const list : Partial<TargettingContextList> = {};

	 function copyToListPartial< T extends keyof TargettingContextList & keyof Situation> ( partial: Partial<TargettingContextList>, sit: Situation, key: T) {
			if (key in sit && sit[key] != undefined) {
				 const x= [sit[key]] as NonNullable<Partial<TargettingContextList>[T]>;
				 partial[key]= x;
			}
	 }
	 copyToListPartial(list, situation, "target");
	 copyToListPartial(list, situation, "user");
	 copyToListPartial(list, situation, "cameo");
	 copyToListPartial(list, situation, "attacker");
	 return list;
}

//type Mutator<T extends AlterVariableConsequence> =
//	//unknwon trick oddly seems to extend to unions
//	T extends unknown ?
//	(
//		Required<T>
//	& (
//		T extends {value: ConsequenceAmount}
//		? {
//			value: PreparedConsequenceAmountV2<T["value"]>,
//			// found: true
//		}
//		: {}
//	)
//	) : never;


//type PreparedConsequenceAmountV2<T extends ConsequenceAmount= ConsequenceAmountV2> =
//	T extends number
//	? number
//	: SourcedConsequenceAmountV2<Exclude<T, number>>;
//	// : T extends unknown ? (
//	// Required<T>
//	// // & {test: string}
//	// & (
//	// 	T extends VariableAmount
//	// 	? Required<VariableAmount>
//	// 	: {}
//	// )
//	// & (
//	// 	T extends AmountOperation
//	// 	? {
//	// 		type: "operation",
//	// 		amt1: PreparedConsequenceAmountV2<ConsequenceAmountV2>;
//	// 		amt2: PreparedConsequenceAmountV2<ConsequenceAmountV2>;
//	// 	}
//	// 	:{}
//	// )
//	// ) : never;

//type SourcedConsequenceAmountV2<T extends ConsequenceAmountV2 = ConsequenceAmountV2> =
//	// Sourced<ActualConsequenceAmountV2<T>>;
//	Sourced<test>;


//type ActualConsequenceAmountV2<T extends ConsequenceAmountV2 = ConsequenceAmountV2> =
//	T extends unknown ? (
//		Required<T>
//		// & {test: string}
//		& (
//			T extends VariableAmount
//			? Required<VariableAmount>
//			: {}
//		)
//		& (
//			T extends AmountOperation
//			? {
//				type: "operation",
//				amt1: ActualConsequenceAmountV2<ConsequenceAmountV2>;
//				amt2: ActualConsequenceAmountV2<ConsequenceAmountV2>;
//			}
//			:{}
//		)
//	) : never;
