declare class Actor<T extends typeof foundry.abstract.DataModel> {
	name: string;
	id: string;
	type: string;
	system: SystemDataObject<ReturnType<T['defineSchema']>>;


}


type SystemDataObjectFromDM<T extends typeof foundry.abstract.DataModel> =
SystemDataObject<ReturnType<T['defineSchema']>>;

type SystemDataObject<T extends SchemaReturnObject> = {[name in keyof T]: SchemaConvert<T[name]>};


type SchemaConvert<F> = F extends FoundryDMField<infer T> ? T : never ;

