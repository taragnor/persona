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

declare global {
	interface HOOKS {
		"personaCalendarAdvance": () => unknown;
	}
}

export class PersonaCalendar {

	static get DoomsdayClock() {
		return DoomsdayClock.instance;
	}

	static weekday() : SimpleCalendar.WeekdayName {
		if (!window.SimpleCalendar)
			{throw new PersonaError("Simple Calendar isn't enabled!");}
		return window.SimpleCalendar.api.getCurrentWeekday().name;
	}

	static getSeason() : SeasonName {
		if (window.SimpleCalendar) {
			return window.SimpleCalendar.api.getCurrentSeason().name;
		}
		if (game.seasonsStars) {
			const date= game.seasonsStars.api.getCurrentDate();
			const season = game.seasonsStars.api.getSeasonInfo(date, date.calendar.id).name;
			if (season) {
				return season as SeasonName;
			}
			throw new PersonaError("Error getting season from Stars and Seasons");
		}
		throw new PersonaError("No Calendar system found");
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

	static async #advanceDay(amt: number = 1): Promise<boolean> {
		if (window.SimpleCalendar) {
			return await this.#advanceSimpleCal(amt);
		}
		if (game.seasonsStars) {
			return await this.#advanceSeasonStars(amt);
		}
			throw new PersonaError("No Calendar system found");
	}


	static async #advanceSeasonStars(amt: number = 1) : Promise<boolean> {
		if (!game.seasonsStars) {
			throw new PersonaError("Seasons and Stars not present");
		}
		await game.seasonsStars.api.advanceDays(amt);
		return true;
	}

	static async #advanceSimpleCal(amt: number = 1) : Promise<boolean> {
		if (!window.SimpleCalendar) {
			throw new PersonaError("Simple calendar not present");
		}
		const calendar = window?.SimpleCalendar?.api;
		return await calendar.changeDate({day:amt});
	}

	static getCurrentDate() : DateObject {
		if (window.SimpleCalendar) {
			return window.SimpleCalendar.api.currentDateTime();
		}
		if (game.seasonsStars) {
			return game.seasonsStars.api.getCurrentDate();
		}
		throw new PersonaError("No Calendar system found");
	}

	static getDateString() : string {
		if (window.SimpleCalendar) {
			const calendar = window?.SimpleCalendar?.api;
			const date = calendar.currentDateTimeDisplay().date;
			return date;
		}
		if (game.seasonsStars) {
			const date = game.seasonsStars.api.getCurrentDate();
			return game.seasonsStars.api.formatDate(date);
		}
			throw new PersonaError("No Calendar system found");
	}

	static getCurrentWeekday() : WeekdayName {
		if (window.SimpleCalendar) {
			return window.SimpleCalendar.api.getCurrentWeekday().name;
		}
		if (game.seasonsStars) {
			const {weekday, calendar}= game.seasonsStars.api.getCurrentDate();
			const weekdayObj = calendar.weekdays[weekday];
			if (weekdayObj) {
				return weekdayObj.name as WeekdayName;
			}
		}
			throw new PersonaError("No Calendar system found");
	}

	static async advanceCalendar() {
		const original_Weekday = this.getCurrentWeekday();
		let weekday = original_Weekday;
		let sleepMult = .01;
		try {
			while (weekday == original_Weekday) {
				await sleep(500 * sleepMult);
				// const ret = await calendar.changeDate({day:1});
				const ret = await this.#advanceDay(1);
				await sleep(2000 * sleepMult);
				if (ret == false) {
					throw new PersonaError("Calendar function returned false for some reason");
				}
				await sleep(500 * sleepMult);
				weekday = this.getCurrentWeekday();
				if (weekday == original_Weekday) {
					if (sleepMult >= 6) {
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
		const rolls: Roll[] = [];
		const requireManual = !(await this.advanceCalendar());
		const date = this.getDateString();
		const weekday = this.getCurrentWeekday();
		const newWeather =  this.determineWeather(this.getCurrentDate());
		await this.setWeather(newWeather);
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
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			rolls,
		};
		await ChatMessage.create(msgData,{} );
		Hooks.callAll("personaCalendarAdvance");
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
		const rand = rng.die(2,6);
		let prevWeather :WeatherType = "cloudy";
		if (rand > 10) {
			prevWeather = this.determineWeather(this.#calcPrevDay(date));
		}
		const currWeather = this.#weatherCompute(rand, prevWeather);
		return currWeather;
	}

	static #weatherCompute(rand: number, currentWeather: WeatherType) : WeatherType {
		let weather : WeatherType;
		const season = this.getSeason();
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
		const d = game.seasonsStars!.api.getCurrentDate();
		const months = d.calendar.months;
		if (!months) {throw new PersonaError("Calendar Module not loaded");}
		const currMonth = months[date.month];
		let {day, month, year} = date;
		day += 1;
		if (day >= currMonth.days) {
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
		const d = game.seasonsStars!.api.getCurrentDate();
		const months = d.calendar.months;
		let {day, month} = date;
		const {year} = date;
		day -= 1;
		if (day >= 0) {
			return {day, month, year};
		}
		//Day must be less than 0
		month -= 1;
		if (month < 0) {
			month = months.length - 1;
		}
		day = months[month].days - 1;
		return {day, month, year};
	}

	static getWeather() : WeatherType {
		const weather = PersonaSettings.get("weather");
		if (WEATHER_TYPE_LIST.includes(weather)) {
			return weather;
		}
		return "cloudy";
	}

	static weatherReport(days: number = 5) : WeatherType[] {
		let day = this.getCurrentDate();
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
		await PersonaSFX.onWeatherChange(weather);
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
		throw new PersonaError(`Unknwon weather type ${weather as string}`);
	}

	static async openWeatherForecast() {
		const weatherReport = PersonaCalendar.weatherReport(4)
			.map(weather =>` <span class="weather-icon"> ${PersonaCalendar.getWeatherIcon(weather).get(0)?.outerHTML} </span>`)
			.join("");
		const msg = `<h2> Upcoming Weather </h2> ${weatherReport}`;
		const messageData : Foundry.MessageData = {
			speaker: {alias: "Weather Forecast"},
			content: msg,
			style: CONST.CHAT_MESSAGE_STYLES.WHISPER,
			whisper: [game.user],
		};
		await ChatMessage.create(messageData, {});
	}

}

type CalendarDate = {day: number, year:number, month: number}


//@ts-expect-error adding to global window
window.PersonaCalendar = PersonaCalendar;


type DateObject = {
	day: number,
	month: number,
	year: number,
}

	type WeekdayName= "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

type SeasonName = "Winter" | "Summer" | "Fall" | "Spring";
