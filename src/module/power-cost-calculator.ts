import {HPCostCalculator} from "./calculators/hpcost-calculator.js";
import {MPCostCalculator} from "./calculators/mpcost-calculator.js";
import {EnergyClassCalculator} from "./calculators/shadow-energy-cost-calculator.js";
import {Power} from "./item/persona-item.js";

export class PowerCostCalculator {

	static calcHPPercentCost(power: Power) : number {
		return HPCostCalculator.calcHPPercentCost(power);
	}

	static calcMPCost(power: Power) : number {
		return MPCostCalculator.calcMPCost(power);
	}

	static calcEnergyCost (power: Power, shadow: Shadow) : ReturnType<typeof EnergyClassCalculator["calcEnergyCost"]> {
		return EnergyClassCalculator.calcEnergyCost(power, shadow);

	}


}







