import { sleep } from "../utility/async-wait.js";
import { PersonaSocial } from "./persona-social.js";
import { localize } from "../persona.js";
import { WEATHER_TYPES } from "../../config/weather-types.js";
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
			case "fog":
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

	static async advanceCalendar() {
		const calendar = window?.SimpleCalendar?.api;
		if (!calendar) {
			throw new PersonaError("Simple Calendar isn't enabled!");
		}
		const original_Weekday = calendar.getCurrentWeekday().name;
		let weekday = original_Weekday;
		let sleepMult = 1;
		try {
			while (weekday == original_Weekday) {
				await sleep(500 * sleepMult);
				const ret = await calendar.changeDate({day:1});
				await sleep(2000 * sleepMult);
				if (ret == false) {
					throw new PersonaError("Calendar function returned false for some reason");
				}
				await sleep(500 * sleepMult);
				weekday = calendar.getCurrentWeekday().name;
				if (weekday == original_Weekday) {
					if (sleepMult >= 5) {
						throw new PersonaError("Date won't update");
					}
					sleepMult +=1 ;
					console.warn(`Date change fail, mult ${sleepMult}`);
				}
			}
		} catch (e) {
			PersonaError.softFail("Error Updating Calendar with ChangeDate", e);
			return false;
		}
		return true;
	}

	static async nextDay(extraMsgs : string[] = []) {
		if(!game.user.isGM) return;
		const rolls: Roll[] = [];
		const calendar = window?.SimpleCalendar?.api;
		if (!calendar) {
			throw new PersonaError("Simple Calendar isn't enabled!");
		}
		const requireManual = !(await this.advanceCalendar());
		const date = calendar.currentDateTimeDisplay().date;
		const weekday = calendar.getCurrentWeekday().name;
		rolls.push(await this.randomizeWeather());
		const weather = this.getWeather();
		if (this.DoomsdayClock.isMaxed()) {
			await this.DoomsdayClock.clear();
		} else {
			await this.DoomsdayClock.inc();
		}
		let doomsdayMsg = `<hr> <div class="doomsday"> <b>Doomsday</b>  ${this.DoomsdayClock.amt} / ${this.DoomsdayClock.max} </div>`;
		if (this.DoomsdayClock.isMaxed()) {
			doomsdayMsg = `<hr><div class="doomsday"><h2> Doomsday</h2> Doomsday is here! Succeed or Something horrible happens!</div>`;
		}
		const manualUpdate = requireManual ? `<h2> Requires Manaul date update </h2>`: "";
		await PersonaSocial.updateLinkAvailability(weekday);
		extraMsgs = extraMsgs
			.map( x=> `<div> ${x} </div>`);
		const html = `
		<div class="date">
		${manualUpdate}
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
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
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
		const currentWeather = this.getWeather();
		switch (roll.total) {
			case 2: weather = "lightning"; break;
			case 3: weather = "rain"; break;
			case 4: weather = "rain"; break;
			case 5: weather = "sunny"; break;
			case 6: weather = "sunny"; break;
			case 7: weather = "cloudy"; break;
			case 8: weather = "cloudy"; break;
			case 9: weather = "cloudy"; break;
			case 10: weather = "rain"; break;
			case 11:
				weather = currentWeather == "rain" || currentWeather == "lightning" ? "fog" : "windy";
				break;
			case 12:
				weather = currentWeather == "rain" || currentWeather == "lightning" ? "fog" : "lightning";
				break;
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

	static getDateString() : string {
		const calendar = window.SimpleCalendar;
		if (!calendar) return "ERROR";
		const day = calendar.api.currentDateTimeDisplay();
		let daystr = day.date;
		daystr = daystr.substring(0, daystr.length -6);
		daystr =`${this.weekday()}, ${daystr}`;
		return daystr;
	}

	static getWeatherIcon() : JQuery {
		const weather = PersonaCalendar.getWeather();
		const weatherLoc = localize(WEATHER_TYPES[weather]);
		switch (weather) {
			case "cloudy":
				return $(`<i title="${weatherLoc}" class="fa-solid fa-cloud"></i>`);
			case "sunny":
				return $(`<i title="${weatherLoc}" class="fa-solid fa-sun"></i>)`);
			case "lightning":
				return $(`<i title="${weatherLoc}" class="fa-solid fa-cloud-bolt"></i>`);
			case "rain":
				return $(`<i title="${weatherLoc}" class="fa-solid fa-cloud-rain"></i>`);
			case "snow":
				return $(`<i title="${weatherLoc}" class="fa-solid fa-snowflake"></i>`);
			case "windy":
				return $(`<i title="${weatherLoc}" class="fa-solid fa-wind"></i>`);
			case "fog":
				return $(`<i title="${weatherLoc}" class="fa-solid fa-smog"></i>`);
			default:
				weather satisfies never;
		}
		throw new PersonaError(`Unknwon weather type ${weather}`);
	}

}

// **************************************************
// ******   Calendar Date check debug code  ******* *
// **************************************************

Hooks.on("preUpdateSetting", function (updateItem, changes) {
	if (updateItem.key == "smalltime.current-date" && changes.value != undefined) {
		console.log(`SmallTime PreUpdate: ${updateItem.value}`);
		Debug(updateItem, changes);
	}
	if (updateItem.key == "foundryvtt-simple-calendar.calendar-configuration" && changes.value != undefined) {
		console.log(`SimpleCalendar Preupdate`);
		Debug(updateItem, changes);
	}

})

Hooks.on("updateSetting", function (updateItem, changes) {
	if (updateItem.key == "smalltime.current-date" && changes.value != undefined) {
		console.log(`SmallTime Update: ${updateItem.value}`);
		Debug(updateItem, changes);
	}
	if (updateItem.key == "foundryvtt-simple-calendar.calendar-configuration" && changes.value != undefined) {
		console.log(`SimpleCalendar Update:`);
		Debug(updateItem, changes);
	}
});

