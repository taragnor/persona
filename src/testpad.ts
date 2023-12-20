type yyyyy = TransformToRealData<typeof actormodels>;

type yyyyyy = UnionizeRecords< yyyyy>;

// type TotalConvert<T extends SchemaDict> = UnionizeRecords<TransformToRealData<T>>;

type xxxxx = UnionizeRecords<typeof actormodels>
	type yyy  = SystemDataObjectFromDM<xxxxx>
	type yyyy = TotalConvert<typeof actormodels>

type xxxx = UnionizeRecords<typeof actormodels>;
	// type BuildSystemDataObject<T extends foundry.abstract.model>= T & SystemDataObjectFromDM<RecordToUnion

