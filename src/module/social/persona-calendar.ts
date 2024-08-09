import { ProgressClock } from "../utility/progress-clock.js";
import { WEATHER_TYPE_LIST } from "../../config/weather-types.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { WeatherType } from "../../config/weather-types.js";
import { PersonaError } from "../persona-error.js";

export class PersonaCalendar {
	static DoomsdayClock = new ProgressClock("Doomsday Clock", 30);

	static weekday() : SimpleCalendar.WeekdayName {
		if (!window.SimpleCalendar)
			throw new PersonaError("Simple Calendar isn't enabled!");
		return window.SimpleCalendar.api.getCurrentWeekday().name;
	}

	static isStormy() : boolean {
		const weather = this.getWeather();
		switch (weather) {
			case "cloudy":
			case "sunny":
			case "windy":
				return false;
			case "lightning":
			case "rain":
			case "snow":
				return true;
			default:
				weather satisfies never;
				return false;
		}
	}

	static async nextDay(extraMsgs : string[] = []) {
		if(!game.user.isGM) return;
		const rolls: Roll[] = [];
		if (!window.SimpleCalendar)
			throw new PersonaError("Simple Calendar isn't enabled!");
		await window.SimpleCalendar.api.changeDate({day:1});
		if (this.DoomsdayClock.isMaxed()) {
			await this.DoomsdayClock.clear();
		} else {
			await this.DoomsdayClock.inc();
		}
		rolls.push(await this.randomizeWeather());
		const weather = this.getWeather();
		const date = window.SimpleCalendar.api.currentDateTimeDisplay().date;
		const weekday = window.SimpleCalendar.api.getCurrentWeekday().name;
		let doomsdayMsg = `<hr> <div class="doomsday"> <b>Doomsday</b>  ${this.DoomsdayClock.amt} / ${this.DoomsdayClock.max} </div>`;
		if (this.DoomsdayClock.isMaxed()) {
			doomsdayMsg = `<hr><div class="doomsday"><h2> Doomsday</h2> Doomsday is here! Succeed or Something horrible happens!</div>`;
		}
		extraMsgs = extraMsgs
			.map( x=> `<div> ${x} </div>`);
		const html = `
		<div class="date">
		<h2> ${date} (${weekday}) </h2>
		<div class="weather">
		Weather: ${weather}
		</div>
			${extraMsgs.join("")}
		${doomsdayMsg}
		</div>
			`;
		const speaker: ChatSpeakerObject = {
			alias: "Calendar"
		};
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC,
			rolls,
		};
		await ChatMessage.create(msgData,{} );
		return date;
	}

	static async randomizeWeather() : Promise<Roll> {
		const roll = new Roll("2d6");
		await roll.roll();
		const season = window.SimpleCalendar!.api.getCurrentSeason().name;
		let weather : WeatherType;
		switch (roll.total) {
			case 2: weather = "lightning"; break;
			case 3: weather = "rain"; break;
			case 4: weather = "rain"; break;
			case 5: weather = "sunny"; break;
			case 6: weather = "sunny"; break;
			case 7: weather = "cloudy"; break;
			case 8: weather = "cloudy"; break;
			case 9: weather = "cloudy"; break;
			case 10: weather = "cloudy"; break;
			case 11: weather = "windy"; break;
			case 12: weather = "windy"; break;
			default:
				PersonaError.softFail(`Odd Weather Result ${roll.total}`);
				weather = "cloudy";
		}
		if (season == "Winter" && weather == "rain") {
			weather = "snow";
		}
		await this.setWeather(weather);
		return roll;
	}

	static getWeather() : WeatherType {
		const weather = PersonaSettings.get("weather");
		if (WEATHER_TYPE_LIST.includes(weather as any)) {
			return weather as typeof WEATHER_TYPE_LIST[number];
		}
		return "cloudy";
	}



	static async setWeather(weather: WeatherType) {
		await PersonaSettings.set("weather", weather);
	}

}


// export class DoomsdayClock {
// 	static MAX_TICKS: number = 30;

// 	static isFull() :boolean {
// 		const clock = this.#getClock();
// 		if (!clock) return false;
// 		return (clock.value == clock.max)
// 	}

// 	static async inc(): Promise<void> {
// 		const clock = this.#getClock();
// 		if (!clock) return;
// 		clock.value += 1;
// 		if (clock.value > clock.max) {
// 			clock.value = 0;
// 		}
// 		await window.clockDatabase!.update(clock);
// 	}

// 	static #getClock(): undefined |  GlobalProgressClocks.ProgressClock {
// 		if (!window.clockDatabase) {
// 			PersonaError.softFail("No clock database, is Global Progress Clocks enabled?");
// 			return undefined;
// 		}

// 		let clock = window.clockDatabase.getName("Doomsday Clock");
// 		if (!clock) {
// 			window.clockDatabase.addClock({
// 				name: "Doomsday Clock",
// 				value: 0,
// 				max: this.MAX_TICKS,
// 			});
// 			clock = window.clockDatabase.getName("Doomsday Clock");
// 		}
// 		return clock;
// 	}

// 	static get val(): number {
// 		const clock = this.#getClock();
// 		return clock?.value ?? -1;
// 	}

// 	static get max(): number {
// 		const clock = this.#getClock();
// 		return clock?.max ?? -1;
// 	}

// 	static clockStatus(): number {
// 		const clock = this.#getClock();
// 		return clock?.value ?? -1;
// 	}

// }
