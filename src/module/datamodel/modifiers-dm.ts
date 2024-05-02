const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;
import { ConditionalModifier } from "../combat/modifier-list.js";


//Note: have to manually match this with MODIIFERLIST
export function modifiers() {
	return new arr( new obj<ConditionalModifier>(), {initial: []});
}
// return new sch( {
// 	maxhp: new num({initial: 0, integer: true}),
// 	wpnAtk: new num({initial: 0, integer: true}),
// 	magAtk: new num({initial: 0, integer: true}),
// 	wpnDmg: new num({initial: 0, integer: true}),
// 	magDmg: new num({initial: 0, integer: true}),
// 	criticalBoost: new num({initial: 0, integer: true}),
// 	ref: new num({initial: 0, integer: true}),
// 	fort: new num({initial: 0, integer: true}),
// 	will: new num({initial: 0, integer: true}),
// });

