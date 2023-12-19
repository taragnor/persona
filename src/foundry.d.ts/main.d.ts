
interface Window {
	CONFIG : typeof CONFIG,
	foundry: typeof foundry,
}


declare const foundry:   {
	abstract: FoundryAbstract,
		data: FoundryData
}

declare const CONFIG : {
	Actor: {
		dataModels: Record<string, DataModel>
	}
}

