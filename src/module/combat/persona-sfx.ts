import { PermaBuffType } from "../../config/perma-buff-type.js";
import { PersonaScene } from "../persona-scene.js";
import { WeatherType } from "../../config/weather-types.js";
import { BASIC_PC_POWER_NAMES } from "../../config/basic-powers.js";
import { PersonaError } from "../persona-error.js";
import { TurnAlert } from "../utility/turnAlert.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaAE } from "../active-effect.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { PToken } from "./persona-combat.js";
import { PersonaSounds } from "../persona-sounds.js";
import { RealDamageType } from "../../config/damage-types.js";
import {PersonaAnimation} from "./persona-animations.js";

const DoomDoor : DoorSound= {
	close: "systems/persona/sound/doom/dsdorcls.wav",
	open: "systems/persona/sound/doom/dsdoropn.wav",
	label: "WALLS.DoorSound.doom",
	lock: "",
	test: "systems/persona/sound/doom/dsnoway.wav",
	unlock: ""
} as const;

CONFIG.Wall.doorSounds["doomDoor"] = DoomDoor;

export class PersonaSFX {
	static async onDamage( _token: PToken | undefined, hpchange: number, damageType: RealDamageType, power ?: UsableAndCard) {
		if (hpchange == 0) {return;}
		if (hpchange > 0) {
			if (power?.hasTag("resurrection")) {
				await this.#play("raise");
				return;
			}
			if (damageType == "healing") {
				await this.#play("heal");
			}
			return;
		}
		switch (damageType) {
			case "physical":
			case "fire":
			case "cold":
			case "wind":
			case "lightning":
			case "light":
			case "dark":
			case "untyped":
				await this.#play(damageType);
				break;
			case "gun":
				await this.#play("gun-single");
				break;
			case "healing":
				return;
			case "all-out": //silent since AoA plays earlier
			case "none":
				return;
			default:
				damageType satisfies never;
		}
	}

	static async onUsePower(usableOrCard: UsableAndCard,attacker: PToken, targets: PToken[]) : Promise<void> {
		if (usableOrCard.isSkillCard()) {
			return;
		}
		const damageType =usableOrCard.getDamageType(attacker.actor);
		void PersonaAnimation.onUsePower(usableOrCard, damageType, attacker, targets);
		if (usableOrCard.name == BASIC_PC_POWER_NAMES[1]) {
			return PersonaSFX.onAllOutAttack();
		}
		const power = usableOrCard;
		if (power.system.sound) {
			const snd = PersonaSounds.playFile(power.system.sound, 0.5);
			return snd;
		}
		if (!power.isAoE()) {return;}
		switch (damageType) {
			case "fire":
			case "untyped":
			case "wind":
			case "light":
			case "physical":
			case "dark":
			case "cold":
			case "lightning":
				await this.#play(damageType);
				break;
			case "gun":
				await this.#play("gun-auto");
				break;

			case "healing":
				await this.#play("heal");
				break;
			case "none":
			case "all-out":
				break;
			default:
				damageType satisfies never;
				return;
		}
		return;
	}

	static async onAllOutAttack() {
		await this.#play("all-out");
	}

	static onAllOutPrompt() {
		void this.#play("all-out prompt");
	}

	static async onScan(token: PToken | undefined, _level: number) {
		if (!token) {return;}
		await this.addTMFiltersSpecial("scan", token);
		await PersonaSFX.#play("scan");
		await this.removeTMFiltersSpecial("scan", token);
	}

	static async onDefend( _token: PToken | undefined, defenseType: "block" | "absorb" | "miss" | "reflect") {
		await this.#play(defenseType);
	}

	static async onStatus( _token : PToken | undefined, statusEffect: StatusEffectId) {
		if (PersonaSounds.isValidSound(statusEffect)) {
			await this.#play(statusEffect);
		}
	}

	static async onAddStatus(statusId: StatusEffectId, actor: PersonaActor) {
		const tokens = actor.tokens;
		for (const token of tokens) {
			try {
				await this.addTMFiltersStatus(statusId, token);
			} catch (e)  {
				console.error(e);
			}
		}
	}

	static playerAlert() {
		TurnAlert.alert();

	}

	static async onRemoveStatus(statusId: StatusEffectId, actor: PersonaActor) {
		const tokens = actor.tokens;
		for (const token of tokens) {
			try {
				await this.removeTMFiltersStatus(statusId, token);
			} catch (e)  {
				console.error(e);
			}
		}
	}

	static async onPermaBuff(_actor: ValidAttackers, _buffType: PermaBuffType, _amt: number) {
		//placeholder
	}

	static async addTMFiltersStatus(statusId: StatusEffectId, token: TokenDocument) {
		if (!window.TokenMagic) {return;}
		if (!token.isOwner) {return;}
		let params;
		switch (statusId) {
			case "burn":
				params =
					[{
						filterType: "fire",
						filterId: "myFire",
						intensity: 1,
						color: 0xFFFFFF,
						amplitude: 1,
						time: 0,
						blend: 2,
						fireBlend : 1,
						animated :
						{
							time :
							{
								active: true,
								speed: -0.0024,
								animType: "move"
							},
							intensity:
							{
								active:true,
								loopDuration: 15000,
								val1: 0.8,
								val2: 2,
								animType: "syncCosOscillation"
							},
							amplitude:
							{
								active:true,
								loopDuration: 4400,
								val1: 1,
								val2: 1.4,
								animType: "syncCosOscillation"
							}
						}
					}];
				break;
			case "frozen":
				params =
					[{
						filterType: "zapshadow",
						filterId: "myPureIceZapShadow",
						alphaTolerance: 0.50
					},
						{
							filterType: "xglow",
							filterId: "myPureIceAura",
							auraType: 1,
							color: 0x5099DD,
							thickness: 4.5,
							scale: 10,
							time: 0,
							auraIntensity: 0.25,
							subAuraIntensity: 1,
							threshold: 0.5,
							discard: false,
							animated:
							{
								time:
								{
									active: true,
									speed: 0.0018,
									animType: "move"
								},
								thickness:
								{
									val1: 2, val2: 2.5,
									animType: "cosOscillation",
									loopDuration: 3000
								},
								subAuraIntensity:
								{
									val1: 0.45, val2: 0.65,
									animType: "cosOscillation",
									loopDuration: 6000
								},
								auraIntensity:
								{
									val1: 0.9, val2: 2.2,
									animType: "cosOscillation",
									loopDuration: 3000
								}
							}
						},
						{
							filterType: "smoke",
							filterId: "myPureIceSmoke",
							color: 0x80CCFF,
							time: 0,
							blend: 2,
							dimX: 0.3,
							dimY: 1,
							animated:
							{
								time:
								{
									active: true,
									speed: -0.006,
									animType: "move"
								},
								dimX:
								{
									val1: 0.4, val2: 0.2,
									animType: "cosOscillation",
									loopDuration: 3000
								}
							}
						}];
				break;
			case "curse":
				params =
					[{
						filterType: "xfire",
						filterId: "myBlackXFire",
						time: 0,
						color: 0x707070,
						blend: 11,
						amplitude: 1,
						dispersion: 2.2,
						chromatic: false,
						scaleX: 2.5,
						scaleY: 2,
						inlay: false,
						animated :
						{
							time :
							{
								active: true,
								speed: -0.0015,
								animType: "move"
							}
						}
					}];
				break;
			case "shock":
				params =
					[{
						filterType: "electric",
						filterId: "myElectric",
						color: 0xFFFFFF,
						time: 0,
						blend: 1,
						intensity: 5,
						animated :
						{
							time :
							{
								active: true,
								speed: 0.0020,
								animType: "move"
							}
						}
					}];
				break;
			case "expel":
				params =
					[{
						filterType: "xray",
						filterId: "mySunburstRays",
						time: 0,
						color: 0xFFBB00,
						blend: 9,
						dimX: 1,
						dimY: 1,
						anchorX: 0,
						anchorY: 0,
						divisor: 36,
						intensity: 4,
						animated :
						{
							time :
							{
								active: true,
								speed: 0.0012,
								animType: "move"
							},
							anchorX:
							{
								animType: "syncCosOscillation",
								loopDuration : 6000,
								val1: 0.40,
								val2: 0.60
							}
						}
					}];
				break;
			default:
				return;
		}
		await window.TokenMagic.addUpdateFilters(token.object!, params);
	}

	static async addTMFiltersSpecial(filterType: "scan", token: TokenDocument) {
		if (!window.TokenMagic) {return;}
		if (!token.isOwner) {return;}
		let params;
		switch (filterType) {
			case "scan": {
				params =
				[{
					filterType: "xray",
					filterId: "myXrayScan",
					time: 0,
					color: 0xFFFFFF,
					blend: 5,
					dimX: 20,
					dimY: 20,
					anchorX: 0.5,
					anchorY: 0,
					divisor: 8,
					intensity: 1,
					animated :
					{
						time :
						{
							active: true,
							speed: 0.00038,
							animType: "move"
						}
					}
				}];
				break;
			}
		}

		try {
			await window.TokenMagic.addUpdateFilters(token.object!, params);
		} catch (e) {
			if (e instanceof Error) {
				console.warn(`${e.message}\n${e.stack}`);
			}
		}
	}

	static async removeTMFiltersSpecial(filterType: "scan", token: TokenDocument) {
		if (!window.TokenMagic) {return;}
		if (!token.isOwner) {return;}
		let filters = [];
		switch (filterType) {
			case "scan" :{
				filters = ["myXrayScan"];
				break;
			}
		}
		for (const filterId of filters) {
			try {
				await window.TokenMagic?.deleteFilters(token.object!, filterId);
			} catch (e) {
				if (e instanceof Error) {
					console.warn(`${e.message}\n${e.stack}`);
				}
			}
		}
	}

	static async removeTMFiltersStatus(statusId: StatusEffectId, token: TokenDocument) {
		if (!window.TokenMagic) {return;}
		let filters : string[] = [];
		switch (statusId) {
			case "burn":
				filters= ["myFire"];
				break;
			case "frozen":
				filters=  ["myPureIceZapShadow", "myPureIceSmoke", "myPureIceAura"];
				break;
			case "curse":
				filters=  ["myBlackXFire"];
				break;
			case "shock":
				filters = ["myElectric"];
				break;
			case "expel":
				filters=  ["mySunburstRays"];
				break;
			default:
				return;
		}
		for (const filterId of filters) {
			await window.TokenMagic?.deleteFilters(token.object!, filterId);
		}
	}

	static async #play(snd: Parameters<typeof PersonaSounds["playBattleSound"]>[0], volume = 0.5) {
		await PersonaSounds.playBattleSound(snd, volume);
	}
	static async onLevelUp(): Promise<void> {
		await this.#play("level-up");
	}

	static async onWeatherChange(weather: WeatherType) {
		const sceneName = "Loading Screen";
		const scene = game.scenes.getName(sceneName) as PersonaScene | undefined;
		if (!scene) {
			PersonaError.softFail(`Can't find scene : ${sceneName}`);
			return;
		}
		try {
			switch (weather) {
				case "windy":
					await scene.changeWeather("windy");
					break;
				case "sunny":
					await scene.changeWeather("");
					break;
				case "cloudy":
					await scene.changeWeather("cloudy");
					break;
				case "lightning":
					await scene.changeWeather("rainstorm");
					break;
				case "rain":
					await scene.changeWeather("rain");
					break;
				case "snow":
					await scene.changeWeather("snow");
					break;
				case "fog":
					await scene.changeWeather("fog");
					break;
			}
		} catch (e: unknown) {
			if (e instanceof Error) {
				PersonaError.softFail(`${e}`, e);
			}
		}
	}

}

Hooks.on("createActiveEffect",(eff: PersonaAE) => {
	console.log(`Create Active effect ${eff.name}`);
	if (!game.user.isGM) {return;}
	eff.statuses.forEach( statusId => {
		if (eff.parent instanceof PersonaActor)  {
			void PersonaSFX.onAddStatus(statusId, eff.parent);
		}
	});
});

Hooks.on("deleteActiveEffect", (eff: PersonaAE) => {
	if (!game.user.isGM) {return;}
	eff.statuses.forEach( statusId => {
		if (eff.parent instanceof PersonaActor)  {
			void PersonaSFX.onRemoveStatus(statusId, eff.parent);
		}
	});
});


declare global {
	interface Window {
		TokenMagic ?: TokenMagic;
	}
}

interface TokenMagic {
	deleteFilters(token :Token, filterId: string): Promise<unknown>;
	addUpdateFilters(token: Token, filterData: object): Promise<unknown>;
}

