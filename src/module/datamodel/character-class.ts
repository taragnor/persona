const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

type ClassLevelType = {
	lvl_num: number,
	maxhp: number,
	slots: [number,number,number,number]
	talents: [number,number,number,number],
	powers_known: [number,number,number,number],
	magic_damage: {low: number, high:number, boost: number},
	wpn_mult: number,
};

function level_table() {
	const internalObj = function () {
		return new obj<ClassLevelType>();
	};
	let ret= new arr( internalObj()
		, {initial: []});
	return ret;
}

export class CharacterClass extends foundry.abstract.DataModel {
	get type() { return "characterClass" as const;}
	static override defineSchema() {
		const ret = {
			talentChoices: new arr(
				new id()
			),
			focusChoices: new arr(
				new id()
			),
			leveling_table: level_table(),
			desciption: new html(),
		};
		return ret;
	}
}

