import {PersonaError} from "../persona-error.js";

export interface CalendarBridge {
  getSeason() : SeasonName;
  advanceDay(amt: number) : Promise<boolean>;
  getCurrentDate(): DateObject;
  getDateString() : string;
  getCurrentWeekday(): WeekdayName;
  calcPreviousDay(date: Readonly<CalendarDate>): CalendarDate;
  monthsList(): Month[];
}

export type SeasonName = "Winter" | "Summer" | "Fall" | "Spring";

type WeekdayName= "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

export type DateObject = {
	day: number,
	month: number,
	year: number,
}

type CalendarDate = {day: number, year:number, month: number}

type Month= {name: string,
  days: number,
};

export class CalendariaBridge implements CalendarBridge {

  api: NonNullable<Window["CALENDARIA"]>["api"];

  constructor() {
    if (!window.CALENDARIA) {
      throw new PersonaError("Calendaria not detected");
    }
    this.api = window.CALENDARIA?.api;
  }

  getSeason() : SeasonName {
    const season = this.api.getActiveCalendar().getCurrentSeason().name;
    if (season == "Autumn") {return "Fall";}
    return season;
  }

  getCurrentDate() : DateObject {
    return this.api.getCurrentDateTime();
  }

  getDateString() : string {
    return this.api.formatDate();
  }

  getCurrentWeekday() : WeekdayName {
    return this.api.getCurrentWeekday().name;
  }


  monthsList() : Month[] {
    const c= this.api.getActiveCalendar();
    return c.monthsArray;
  }

  async advanceDay(amt: number = 1) : Promise<boolean> {
    await this.api.advanceTime({day:amt});
    return true;
  }

  calcPreviousDay (date: Readonly<CalendarDate>) : CalendarDate {
    const api = this.api;
    const c = api.getActiveCalendar();
    const months = c.monthsArray;
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

}


