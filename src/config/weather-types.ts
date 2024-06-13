const WEATHER_TYPE_LIST = [
	"cloudy",
	"sunny",
	"lightning",
	"rain",
	"snow",
	"windy",
] as const;

export type WeatherType = keyof typeof WEATHER_TYPE_LIST;

export const WEATHER_TYPES = Object.fromEntries(
	WEATHER_TYPE_LIST.map( a=> [a, `persona.weather.${a}`])

);


