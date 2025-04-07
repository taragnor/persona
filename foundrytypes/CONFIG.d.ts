declare interface CONFIG {
	Actor: {
		dataModels: Record<string, typeof foundry.abstract.DataModel>;
		documentClass: typeof Actor<any, any>;
	};
	Item: {
		dataModels: Record<string, typeof foundry.abstract.DataModel>;
		documentClass: typeof Item<any>;
	};
	statusEffects: StatusEffectObject[];
	ActiveEffect: {
		documentClass: typeof ActiveEffect<any, any>;
		legacyTransferral: boolean;
	};
	sounds: {
		dice: string
	};
	Dice: {
		rolls: (typeof Roll)[];
	};
	Region: {
		documentClass: typeof RegionDocument;
	};
	Combat: {
		documentClass: typeof Combat<any>;
		initiative: {
			formula: string;
			decimals: number;
		},
	};
	ChatMessage : {
		template: string;
		/** default "fas fa-comments" */
		sidebar: string;
		documentClass: typeof ChatMessage;
	};
	Scene: {
		documentClass: typeof Scene;
	}
	weatherEffects: {
		"blizzard": WeatherEffectData;
		"fog": WeatherEffectData;
		"leaves": WeatherEffectData;
		"rain": WeatherEffectData;
		"rainstorm": WeatherEffectData;
		"snow": WeatherEffectData;
	}
}

interface StatusEffectObject {
	id: string,
	name: string,
	icon: string,
	changes ?: readonly AEChange[],
}

interface WeatherEffectData {}
