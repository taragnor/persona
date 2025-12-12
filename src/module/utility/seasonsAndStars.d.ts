interface Game {
	seasonsStars?: {
		api: SeasonsAndStars.API;
	}
}


namespace SeasonsAndStars {
	interface API {
		advanceDays (amt: number): Promise<void>;
		getCurrentDate() : DateObject;
		formatDate(date: DateObject, options?: unknown): string;
		getSeasonInfo(date: DateObject, calendarId: Calendar["id"]) : SeasonInfo;
	}

	interface DateObject {
		calendar: Calendar;
		day: number;
		month: number;
		year: number;
		weekday: number;
	}


	interface Calendar {
		id: string;
		months: (CalendarObject & {days: number})[];
		weekdays: CalendarObject[];
	}

	interface CalendarObject {
		name: string;
		abbrev: string;
		description: string;
	}

	interface SeasonInfo {
		name: string;
		icon: string;

	}

}
