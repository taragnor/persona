export const FREQUENCY = {
	0: "Never",
	0.10: "Very Rare",
	0.25: "Rare",
	0.75: "Less Frequent",
	1: "Normal",
	1.5: "More Frequent",
	3: "Common",
	10: "Super Common",
	10000 : "Always",
} as const;

export const OLD_FREQUENCY = {
	0: "Never",
	0.05: "Very Rare",
	0.2: "Rare",
	0.5: "Less Frequent",
	1: "Normal",
	2: "More Frequent",
	5: "Common",
	10: "Super Common",
	100 : "Always",
} as const;

export function frequencyConvert (x: number) : number {
	const convertType= (OLD_FREQUENCY[x as keyof typeof OLD_FREQUENCY])
	if (!convertType)  return x;

	for (const [num, stringType] of Object.entries(FREQUENCY))  {
		if (stringType == convertType) {
			return Number(num);
		}
	}
	console.warn(`Uncovered Case in freuency Covert ${x}`);
	return x;
	// switch (x) {
	// 	case 0.05: return 0.1;
	// 	case 0.2: return 0.25;
	// 	case 0.5: return 0.75;
	// 	case 2: return 1.5;
	// 	case 5: return 3;
	// 	case 10: return 10;
	// 	case 100: return 10000;
	// 	default:
	// 		return x;
	// }

}
