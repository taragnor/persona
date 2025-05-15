import { HTMLTools } from "../module/utility/HTMLTools.js";

export const WEATHER_TYPE_LIST = [
	"cloudy",
	"sunny",
	"lightning",
	"rain",
	"snow",
	"windy",
	"fog",
] as const;

export type WeatherType = typeof WEATHER_TYPE_LIST[number];

export const WEATHER_TYPES = HTMLTools.createLocalizationObject(WEATHER_TYPE_LIST, "persona.weather");
// export const WEATHER_TYPES = Object.fromEntries(
// 	WEATHER_TYPE_LIST.map( a=> [a, `persona.weather.${a}`])
// );


