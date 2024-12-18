interface FoundryAbstract {
	DataModel: typeof DataModelClass;
	TypeDataModel : typeof TypeDataModelClass;
}

interface DatabaseCreateOperation {
	broadcast?: boolean;
	data?: object[];
	keepId?: boolean; // Default: false
	keepEmbeddedIds?: boolean; // Default: true
	modifiedTime?: number;
	noHook?: boolean; // Default: false
	render?: boolean; // Default: true
	renderSheet?: boolean; // Default: false
	parent?: any; // Default: null
	pack?: string | null;
	parentUuid?: string | null;
	_result?: (string | object)[];
}
