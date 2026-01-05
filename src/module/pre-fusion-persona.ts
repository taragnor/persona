import {FusionTable} from "../config/fusion-table.js";
import {LevelUpCalculator} from "../config/level-up-calculator.js";
import {PCSheet} from "./actor/sheets/pc-sheet.js";
import {ActorConverters} from "./converters/actorConverters.js";
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

	async fusionProcess( sheetToUpdate: PCSheet) : Promise<U<Shadow>> {
		const maxSkillsToPick = this.skillsToInherit();
		while (this.inherited.length < maxSkillsToPick) {
			const skill = await this.selectSkillToInherit();
			if (skill) {
				this.inherited.push(skill);
			} else {
				if (this.inherited.length == 0) {
					ui.notifications.notify("Fusion Aborted");
					return undefined;
				}
				this.inherited.pop();
			}
			void sheetToUpdate.render(false);
		}
		if (await HTMLTools.confirmBox("Finalize Fusion", "Finalize this fusion?")) {
			return await this.completeFusion();
		}
		this.inherited.pop();
		void sheetToUpdate.render(false);
		return await this.fusionProcess(sheetToUpdate);
	}

	override get mainPowers(): Power[] {
		const base= super.mainPowers;
		return base.concat(this.inherited);
	}

	get fusionXPBoost(): number {
		if (!this.tarot) {return 0;}
		if (!this.isHypothetical) {return 0;}
		const SL = this.user.getSocialSLWith(this.tarot);
		if (SL == 0) {return 0;}
		const situation : Situation = {
			user: this.user.accessor,
		};
		const XPBoost = this.user.getPersonalBonuses("fusion-xp-boost-sl-percent").total(situation, "standard");
		if (XPBoost <= 0) {return 0;}
		const levels = XPBoost * SL;
		const XPGain = LevelUpCalculator.XPToGainXLevels(this.totalXP, levels);
		return XPGain;
	}

	private async completeFusion() : Promise<Shadow> {
		const shadow = await this.createNewFusedPersona();
		await this.destroyComponents();
		await this.user.addPersona(shadow);
		await this.fusionMsg(shadow);
		await this.user.sheet.render(false);
		return shadow;
	}

	private async createNewFusedPersona() : Promise<Shadow>{
		const persona= await ActorConverters.toPersona(this.source, this.user);
		const basePowerSet = this.mainPowers.map( pwr => pwr.id);
		const bonusXP = this.fusionXPBoost;
		await persona.update( {"system.combat.powers": basePowerSet});
		await persona.basePersona.increaseXP(bonusXP);
		ui.notifications.notify( `created ${persona.name} as ${this.user.name}'s persona`);
		return persona;
	}

	private async destroyComponents() {
		this.components
			.filter( x=> x.isPersona()) //want to prevent any chance of deleting a base shadow
			.forEach( x =>
				console.log(`Simulated Delete of ${x.name}`)
			);
	}

	async fusionMsg(newPersona : Shadow) {
		const componentNames = this.components.map( x=> x.name).join(" ,");
		const content = `
		<h2> Fusion </h2>
		<div>Fused Personas: ${componentNames}</div>
		<div>Result: ${newPersona.name}</div>
		<div>Powers: ${newPersona.basePersona.mainPowers.map(x=> x.name).join (", ")} </div>
		<div> NOTE: GM must manually delete component personas</div>
		`;
		const data : MessageData = {
			speaker: {
				scene: game.scenes.current.id,
				actor: this.user.id,
				token: undefined,
			},
			user: game.user,
			content,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		await ChatMessage.create(data);
	}

	private async selectSkillToInherit() : Promise<N<Power>> {
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
