export class NumberTools {

	static signed(num: number) : string {
		return new Intl.NumberFormat("en-US", {
			signDisplay: "exceptZero"
		}).format(num);
	}

  static percentToDecimalPlaces(decimalNum:number,  decimalPlaces: number) : number {
    const percent = decimalNum * 100;
    return this.roundToDecimalPlaces(percent, decimalPlaces);
  }

  static roundToDecimalPlaces(num: number, decimalPlaces : number): number {
    const mult = Math.pow(10, decimalPlaces);
    return Math.round(num * mult) / mult;
  }

}
