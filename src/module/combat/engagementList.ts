import { PersonaCombat } from "./persona-combat.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaError } from "../persona-error.js";
import { PToken } from "./persona-combat.js";

export class EngagementList {
	parent : PersonaCombat;

	constructor(parent: PersonaCombat) {
		this.parent = parent;
	}

	get data() : CombatantId[][] {
		return this.parent.getFlag("persona", "engageList");
	}

	async refreshList() {
		let data = this.data;
		data = data.map ( engagement => {
			return engagement.filter( cId => {
				const comb = this.getCombatant(cId);
				if (!comb.actor) return false;
				return comb.actor.canEngage();
			})
		})
		await this.storeData(data);
	}

	getCombatant(id: CombatantId) : Combatant<PersonaActor> {
		const comb =  this.parent.combatants.get(id);
		if (!comb) {
			throw new PersonaError(`Can't find combanat for id ${id}`);
		}
		return comb;
	}

	async storeData(data: CombatantId[][] ) : Promise<void> {
		await this.parent.setFlag("persona", "engageList", data);
	}

	findEngagement( combatant: Combatant<PersonaActor>) : CombatantId[] {
		const engagement = this.data.find( x=> x.includes(combatant.id));
		if (!engagement)  {
			return [combatant.id];
		}
		return engagement;
	}

	async addToEngagedList(combatant: Combatant<PersonaActor>) : Promise<void> {
		const engageBattle = this.data.find( x=> x.includes(combatant.id));
		if (!engageBattle)  {
			const x = this.data;
			x.push([combatant.id]);
			await this.storeData(x);
		}
	}

	async setEngageWith(combatant1: Combatant<PersonaActor>, combatant2: Combatant<PersonaActor>) {
		const engagement = this.findEngagement(combatant2);
		// const combatantOne = this.combatants.find( x=> x.token._object.actor.id == tokenOne.id);
		if (!engagement.includes(combatant1.id)) {
			engagement.push(combatant1.id);
			if (!this.data.includes(engagement))
				this.data.push(engagement)
			await this.storeData(this.data);//if this doesn't work may need to do something else here
		}
	}

	async breakOffEngagement(combatant: Combatant<PersonaActor>) {
		const engagement = this.findEngagement(combatant);
		if (engagement.length > 1) {
			engagement.splice(engagement.indexOf( combatant.id ), 1);
			await this.addToEngagedList(combatant);
		}
	}

}

type CombatantId = string;
