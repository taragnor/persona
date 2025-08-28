import { DoomsdayClock } from "../exploration/doomsday-clock.js";
import { SeededRandom } from "../utility/seededRandom.js";
import { PersonaSFX } from "../combat/persona-sfx.js";
import { PersonaDB } from "../persona-db.js";
import { sleep } from "../utility/async-wait.js";
import { PersonaSocial } from "./persona-social.js";
import { localize } from "../persona.js";
import { WEATHER_TYPES } from "../../config/weather-types.js";
import { WEATHER_TYPE_LIST } from "../../config/weather-types.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { WeatherType } from "../../config/weather-types.js";
import { PersonaError } from "../persona-error.js";

export class PersonaCalendar {

	static get DoomsdayClock() {
		return DoomsdayClock.instance;
	}

	static weekday() : SimpleCalendar.WeekdayName {
		if (!window.SimpleCalendar)
			{throw new PersonaError("Simple Calendar isn't enabled!");}
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
		if(!game.user.isGM) {return;}
		console.debug("nextday Called");
		const rolls: Roll[] = [];
		const calendar = window?.SimpleCalendar?.api;
		if (!calendar) {
			throw new PersonaError("Simple Calendar isn't enabled!");
		}
		const requireManual = !(await this.advanceCalendar());
		const date = calendar.currentDateTimeDisplay().date;
		const weekday = calendar.getCurrentWeekday().name;
		const newWeather =  this.determineWeather(calendar.currentDateTime());
		await this.setWeather(newWeather);
		// rolls.push(await this.randomizeWeather());
		const weather = this.getWeather();
		if (weather != newWeather) {
			PersonaError.softFail(`Weather is incorrect. Shoudl be ${newWeather}`);
		}
		const manualUpdate = requireManual ? `<h2> Requires Manaul date update </h2>`: "";
		await PersonaSocial.updateLinkAvailability(weekday);
		const doomsdayMsg = await this.advanceDoomsday();
		extraMsgs.push(... await this.endDayForPCs());
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
		const speaker: Foundry.ChatSpeakerObject = {
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

	static async endDayForPCs(): Promise<string[]> {
		const ret : string[] = [];
		for (const pc of PersonaDB.realPCs()) {
			try {
				const changes = await pc.onEndDay();
				if (changes.length == 0) {continue;}
				ret.push(`<div class="pc-change end-day">`);
				ret.push( `<div>${pc.displayedName} End of Day</div>`);
				ret.push(`<ul>`);
				ret.push( ...changes.map( chg => `<li> ${chg} </li>`));
				ret.push(`</ul>`);
				ret.push(`</div>`);
			} catch (e) {
				PersonaError.softFail(`End Day Error for ${pc.name}`, e);
				continue;
			}

		}
		return ret;
	}

	static async advanceDoomsday() : Promise<string> {
		if (this.DoomsdayClock.isMaxed()) {
			await this.DoomsdayClock.clear();
		} else {
			await this.DoomsdayClock.inc();
		}
		let doomsdayMsg = `<hr> <div class="doomsday"> <b>Doomsday</b>  ${this.DoomsdayClock.amt} / ${this.DoomsdayClock.max} </div>`;
		if (this.DoomsdayClock.isMaxed()) {
			doomsdayMsg = `<hr><div class="doomsday"><h2> Doomsday</h2> Doomsday is here! Succeed or Something horrible happens!</div>`;
		}
		return doomsdayMsg;
	}

	static determineWeather( date: Readonly<CalendarDate>) : WeatherType {
		const {day, month, year} = date;
		const str = `${year}-${day}-${month}`;
		const rng = new SeededRandom(str);
		// const hash = this.hash(str);
		const rand = rng.die(2,6);
		// const rand = 2 + (hash[0] % 6) + (hash[1] % 6) ;
		let prevWeather :WeatherType = "cloudy";
		if (rand > 10) {
			prevWeather = this.determineWeather(this.#calcPrevDay(date));
		}
		const currWeather = this.#weatherCompute(rand, prevWeather);
		return currWeather;
	}

	static #weatherCompute(rand: number, currentWeather: WeatherType) : WeatherType {
		let weather : WeatherType;
		const season = window.SimpleCalendar!.api.getCurrentSeason().name;
		switch (rand) {
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
				PersonaError.softFail(`Odd Weather Result for random: ${rand}`);
				weather = "cloudy";
		}
		if (season == "Winter" && weather == "rain") {
			weather = "snow";
		}
		return weather;
	}

	static weatherFrequency() {
		const weatherTypes : Partial<Record<WeatherType, number>> = {};
		const data = this.weatherReport(150);
		for (const weather of data) {
			const curr = weatherTypes[weather] ?? 0;
			weatherTypes[weather] = curr +1;
		}
		console.log(weatherTypes);
	}

	//returns the day after the current date
	static #calcNextDay (date: Readonly<CalendarDate>) : CalendarDate {
		const months = window.SimpleCalendar?.api.getAllMonths();
		if (!months) {throw new PersonaError("Calendar Module not loaded");}
		const currMonth = months[date.month];
		let {day, month, year} = date;
		day += 1;
		if (day >= currMonth.numberOfDays) {
			day = 0;
			month += 1;
		}
		if (month >= months.length) {
			month = 0;
			year ++;
		}
		return {day, month, year};
	}

	static #calcPrevDay (date: Readonly<CalendarDate>) : CalendarDate {
		const months = window.SimpleCalendar?.api.getAllMonths();
		if (!months) {throw new PersonaError("Calendar Module not loaded");}
		let {day, month, year} = date;
		day -= 1;
		if (day >= 0) {
			return {day, month, year};
		}
		//Day must be less than 0
		month -= 1;
		if (month < 0) {
			month = months.length - 1;
		}
		day = months[month].numberOfDays - 1;
		return {day, month, year};
	}

	// static hash(str: string) {
	// 	let h1 = 1779033703, h2 = 3144134277,
	// 	h3 = 1013904242, h4 = 2773480762;
	// 	for (let i = 0, k; i < str.length; i++) {
	// 		k = str.charCodeAt(i);
	// 		h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
	// 		h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
	// 		h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
	// 		h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
	// 	}
	// 	h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
	// 	h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
	// 	h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
	// 	h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
	// 	h1 ^= (h2 ^ h3 ^ h4), h2 ^= h1, h3 ^= h1, h4 ^= h1;
	// 	return [h1>>>0, h2>>>0, h3>>>0, h4>>>0];
	// }

	static getWeather() : WeatherType {
		const weather = PersonaSettings.get("weather");
		if (WEATHER_TYPE_LIST.includes(weather as any)) {
			return weather as typeof WEATHER_TYPE_LIST[number];
		}
		return "cloudy";
	}

	static weatherReport(days: number = 5) : WeatherType[] {
		let day : CalendarDate | undefined = window.SimpleCalendar?.api.currentDateTime();
		if (!day) {throw new PersonaError("Can't get weather report as calendar can't be reached");}
		const arr : WeatherType[]  = [];
		while (days-- > 0) {
			day = this.#calcNextDay(day);
			const weather = this.determineWeather(day);
			arr.push(weather);
		}
		return arr;
	}

	static async setWeather(weather: WeatherType) {
		await PersonaSettings.set("weather", weather);
		PersonaSFX.onWeatherChange(weather);
	}

	static getDateString() : string {
		const calendar = window.SimpleCalendar;
		if (!calendar) {return "ERROR";}
		const day = calendar.api.currentDateTimeDisplay();
		let daystr = day.date;
		daystr = daystr.substring(0, daystr.length -6);
		daystr =`${this.weekday()}, ${daystr}`;
		return daystr;
	}

	static getWeatherIcon(weather ?: WeatherType) : JQuery {
		if (weather == undefined) {
			weather = PersonaCalendar.getWeather();
		}
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

	static async openWeatherForecast() {
		const weatherReport = PersonaCalendar.weatherReport(4)
			.map(weather =>` <span class="weather-icon"> ${PersonaCalendar.getWeatherIcon(weather).get(0)?.outerHTML} </span>`)
			.join("");
		const msg = `<h2> Upcoming Weather </h2> ${weatherReport}`;
		const messageData : Foundry.MessageData = {
			speaker: {alias: "Weather Forecast"},
			content: msg,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
			whisper: [game.user],
		};
		await ChatMessage.create(messageData, {});
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

});

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


type CalendarDate = {day: number, year:number, month: number}


//@ts-ignore
window.PersonaCalendar = PersonaCalendar;
