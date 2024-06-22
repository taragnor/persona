interface Window {
	SimpleCalendar?: {
		api: SimpleCalendar.SimpleCalendarAPI;
	}
}

namespace SimpleCalendar {

	type SimpleCalendarAPI = {
		getCurrentWeekday() : { name: WeekdayName, abbreviation: string},
		/** adds dateobject to current date, doesn't set.
	example: {day:1} adances day by 1*/
		changeDate(data: Partial<DateObject>): Promise<boolean>;
		currentDateTimeDisplay(): DisplayableDateTime;
		getCurrentSeason() : {name: SeasonName}

	}

	type DateObject = {
		day: number,
		hour: number,
		minute: number,
		second: number,
		month: number,
		year: number,
	}

	type DisplayableDateTime ={
		date: string,
		time: string
	}

	type WeekdayName= "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

	type SeasonName= "Spring" | "Fall" | "Summer" | "Winter";

}
