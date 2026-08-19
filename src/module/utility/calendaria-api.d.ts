interface Window {
  CALENDARIA ?: {
    api: Calendaria.API;
  }
}


namespace Calendaria {
  interface API {
getCurrentDateTime(): DateObject;
    /** example advanceTime({day : 1, hour: 6})*/
    advanceTime(action : Partial<DateObject>, options ?: AdvanceOptions): Promise<void>;
    /** example setDateTime({ year: 1492, month: 5, day: 15, hour: 10, minute: 30 })*/
    setDateTime(dateTime: Partial<DateObject>, options ?: AdvanceOptions): Promise<void>;
    getActiveCalendar(): CalendarData;
    getCurrentWeekday(): WeekDay;
    formatDate(): string;

  }

  type DateObject = {
    day : number,
    hour : number,
    // leapYear : boolean,
    minute : number,
    month : number,
    season : number,
    second : number,
    year : number,
  }

  interface CalendarData {
    seasonsArray: SeasonData[];
    currentDate: CurrentDate;
    getCurrentSeason(): SeasonData;
    weekdaysArray: WeekDay[];
    monthsArray: Month[];
  }

  interface AdvanceOptions {
    cinematic: boolean;
  }

  interface SeasonData {
    name: SeasonName;
    dayStart: number;
    dayEnd: number;
  }

  interface CurrentDate {
    day: number;
    dayOfMonth : number;
    hour : number;
    minute : number;
    month : number;
    year : number;
  }

  interface Month {
    name: string;
    days: number;
  }

  interface WeekDay {
    name: WeekdayName;

  };

  type SeasonName = "Spring" | "Summer" | "Autumn" | "Winter";

	type WeekdayName= "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

}
