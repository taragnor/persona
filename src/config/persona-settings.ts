export const SYSTEMNAME = `persona` as const;
export const SYSTEMPATH = `systems/${SYSTEMNAME}` as const;
export const HBS_TEMPLATES_DIR = `${SYSTEMPATH}/sheets` as const;
export const HANDLEBARS_TEMPLATE_DIR = `${SYSTEMPATH}/parts` as const;


export class PersonaSettings {
	static registerSettings() {
		for (const [key, options] of Object.entries(SETTINGS)) {
			game.settings.register("persona", key, options);
		}
	}

	static get<T extends SETTINGKEYS>(settingName: T) : InstanceType<typeof SETTINGS[T]["type"]> {
		return game.settings.get("persona", settingName);
	}

	static isMetaverseEnhanced() : boolean {
		return this.get("metaverseState").valueOf();
	}


}


const SETTINGS = {
	"metaverseState" : {
			name: "Metaverse Enhanced",
			hint: "Is Metaverse Enhanced?",
			scope: "world",
			restricted: true,
			config: true, //turn this off eventually
			type :Boolean,
			default: false,
	}
} as const;

type SETTINGKEYS = keyof typeof SETTINGS;

