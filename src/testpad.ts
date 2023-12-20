type yyyyy = TransformToRealData<typeof actormodels>;

type yyyyyy = UnionizeRecords< yyyyy>;

// type TotalConvert<T extends SchemaDict> = UnionizeRecords<TransformToRealData<T>>;

type xxxxx = UnionizeRecords<typeof actormodels>
	type yyy  = SystemDataObjectFromDM<xxxxx>
	type yyyy = TotalConvert<typeof actormodels>

type xxxx = UnionizeRecords<typeof actormodels>;
	// type BuildSystemDataObject<T extends foundry.abstract.model>= T & SystemDataObjectFromDM<RecordToUnion

class NestedSchema extends foundry.abstract.DataModel {
	get type() { return "npc" as const;}
	static override defineSchema() {
		const fields = window.foundry.data.fields;
		const ret = {
			shadowdesc: new fields.StringField(),
			schemaTest: new fields.SchemaField( {
				num: new fields.NumberField(),
				str: new fields.StringField(),
				sub: new fields.SchemaField( { 
					subdata: new fields.NumberField()
				}),
			}),
		} as const;
		return ret;
	}
}

type x= SystemDataObjectFromDM<typeof NestedSchema>;

type ret<T extends typeof foundry.abstract.DataModel> = ReturnType<T['defineSchema']>
type SystemDataObject<T extends SchemaReturnObject> = {[name in keyof T]: SchemaConvert<T[name]>};




