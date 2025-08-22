import { AlterVariableConsequence } from "./config/consequence-types";
import { Mutator } from "./module/persona-variables";




//@ts-ignore
let x: Mutator<AlterVariableConsequence> = window.bleh;


if (x.varType == "actor" && x.operator == "set") {
	if ( typeof x.value != "number") {
		const value = x.value;
		if ( value.type =="operation" ) {
			const amt1 = value.amt1;
			}
		if ( value.type =="variable-value" ) {
}

		}

}
