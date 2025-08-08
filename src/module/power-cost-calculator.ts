import { Power } from "./item/persona-item.js";

class PowerCostCaluclator {

	static powerLevel_simpleDamage(pwr : Power) : PowerCost {
		const baselevel = pwr.system.damageLevel;
		const dmgType = pwr.system.dmg_type;
		let mult = 0;
		//Almighty mod
		mult = dmgType == "untyped" ? 3 : 1;

		throw new Error ("not yet finished");

	}

}


type PowerCost = {
	mp: number,
	energyReq: number,
	eneryMin: number,

}

