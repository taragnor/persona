/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable no-empty */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
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
		if ( value.type == "variable-value" ) {
		}

		}

}


function xxxx(x ?: boolean) : number {
	return 1;
	}


function r( x: Readonly<Item>) {
	rr (x);
}

function rr( x: Item) {

}

