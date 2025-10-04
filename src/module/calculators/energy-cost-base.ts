export class EnergyCostBase {
	energyRequired: number =0;
		energyCost: number = 0;

	constructor (energyRequired: number, energyCost:number) {
		this.energyRequired = energyRequired;
		this.energyCost = energyCost;
	}

	add(this: Readonly<EnergyCostBase>, val: number): EnergyCostBase;
	add(this: Readonly<EnergyCostBase>, cost: EnergyCostBase) : EnergyCostBase;
	add(this: Readonly<EnergyCostBase>, costOrInt: number | Readonly<EnergyCostBase>) : EnergyCostBase;
	add(this: Readonly<EnergyCostBase>, costOrInt: number | Readonly<EnergyCostBase>) : EnergyCostBase {
		if (typeof costOrInt == "number") {
			return new EnergyCostBase (
				this.energyRequired + costOrInt,
				this.energyCost + costOrInt,
			);
		}
		return new EnergyCostBase (
			this.energyRequired + costOrInt.energyRequired,
			this.energyCost + costOrInt.energyCost,
		);
	}

}

