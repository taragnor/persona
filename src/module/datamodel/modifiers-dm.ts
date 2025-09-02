// eslint-disable-next-line @typescript-eslint/no-unused-vars
const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;
import { ConditionalModifier } from "../combat/modifier-list.js";


//Note: have to manually match this with MODIIFERLIST
export function modifiers() {
	return new arr( new obj<ConditionalModifier>(), {initial: []});
}
