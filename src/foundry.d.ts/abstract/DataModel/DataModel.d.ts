
declare class DataModelClass {
	constructor ();
	static defineSchema() : SchemaReturnObject
}

type SchemaReturnObject = Record<string, FoundryDMField<any>>

