export class NumberTools {

	static signed(num: number) : string {
		return new Intl.NumberFormat("en-US", {
			signDisplay: "exceptZero"
		}).format(num);
	}

}
