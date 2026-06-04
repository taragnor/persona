import {PersonaEffectContainerBaseSheet} from "./effect-container.js";

export class CarryableSheet extends PersonaEffectContainerBaseSheet {
  declare item: Carryable;

	override async getData() {
		const data = await super.getData();
		return data;
	}

}
