declare interface CONFIG {
	Actor: {
		dataModels: Record<string, typeof foundry.abstract.DataModel>;
		documentClass: typeof Actor<T>;
	}
	Item: {
		dataModels: Record<string, typeof foundry.abstract.DataModel>;
		documentClass: typeof Item<T>;
	}
	statusEffects: StatusEffectObject[]

}


type StatusEffectObject = {
	id: string,
	name: string,
	icon: string,
}

