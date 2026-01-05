import {FusionTable} from "../config/fusion-table.js";
import {PCSheet} from "./actor/sheets/pc-sheet.js";
import {Persona} from "./persona-class.js";
import {PersonaDB} from "./persona-db.js";
import {removeDuplicates} from "./utility/array-tools.js";
import {HTMLTools} from "./utility/HTMLTools.js";

export class HypotheticalPersona extends Persona<PC> {
	declare source: Shadow;
	components: Shadow[];
	inherited: Power[] = [];
	constructor(result: Shadow, user :PC, components: Shadow[]) {
		super(result, user, result.startingPowers);
		this.components = components;
	}


	skillsToInherit(): number {
		return FusionTable.numOfInheritedSkills(this.components, this.source);
	}

	override get isHypothetical() : boolean {
		return true;
	}

	get canInitiateFusion() : boolean {
		if (!this.isHypothetical) { return false;}
		if (!this.user.isPC()) {return false;}
		return this.level <= this.user.level;
	}

	async fusionProcess( sheetToUpdate: PCSheet) {
		const maxSkillsToPick = this.skillsToInherit();
		while (this.inherited.length < maxSkillsToPick) {
			const skill = await this.selectSkillToInherit();
			if (skill) {
				this.inherited.push(skill);
			} else {
				if (this.inherited.length == 0) {
					ui.notifications.notify("Fusion Aborted");
					return;
				}
				this.inherited.pop();
			}
			void sheetToUpdate.render(false);
		}
		await this.completeFusion();
	}

	override get mainPowers(): Power[] {
		const base= super.mainPowers;
		return base.concat(this.inherited);
	}


	async completeFusion() {
		ui.notifications.notify("Complete fusion not yet defined");
	}

	async selectSkillToInherit() : Promise<N<Power>> {
		const currentPowers= this.powers;
		const inheritableSkills = this.components
		.flatMap( shadow => shadow.mainPowers
			.filter( pwr => !pwr.hasTag("non-inheritable") && !pwr.hasTag("shadow-only"))
			.filter( pwr => !currentPowers.includes(pwr))
		);
		const finalList = Object.fromEntries(
			removeDuplicates(inheritableSkills)
			.map (pwr => [pwr.id, pwr.name])
		);
		const choice = await HTMLTools.singleChoiceBox(finalList);
		if (!choice) {return null;}
		const chosenPower = PersonaDB.getPower(choice);
		return chosenPower ?? null;
	}



}
