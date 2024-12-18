interface FoundryAbstract {
	DataModel: typeof DataModelClass;
	TypeDataModel : typeof TypeDataModelClass;
}

interface DatabaseCreateOperation {
	broadcast?: boolean;
	data?: object[];
	// Default: false
	keepId?: boolean;
	// Default: true
	keepEmbeddedIds?: boolean;
	modifiedTime?: number;
	// Default: false
	noHook?: boolean;
	// Default: true
	render?: boolean;
	// Default: false
	renderSheet?: boolean;
	// Default: null
	parent?: any;
	pack?: string | null;
	parentUuid?: string | null;
	_result?: (string | object)[];
}
