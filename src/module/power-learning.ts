import {PROBABILITIES_POWER_RARITY, Probability} from "../config/probability.js";
import {SLOTTYPES} from "../config/slot-types.js";
import {PersonaDB} from "./persona-db.js";
import {PersonaError} from "./persona-error.js";
import {localize} from "./persona.js";
import {Logger} from "./utility/logger.js";

export class PowerLearningSystem< T extends ValidAttackers = ValidAttackers> {

	actor: T;

	constructor (actor: T) {
		this.actor = actor;
	}

	async onLevelUp_checkLearnedPowers( newLevel: number, logChanges= true) : Promise<void> {
		if (!newLevel) {return;}
		const actor = this.actor;
		const powersToLearn = actor.powerLearningList
		.slice()
		.sort( (a,b) => a.level - b.level);
		for (const powerData of powersToLearn) {
			if (newLevel < (powerData.level ?? Infinity) ){
				continue; }
			await this.learnPower(powerData.power, logChanges);
		}
		if (actor.isCustomPersona()) {
			await this.customPersona_learnedPowersMsg( newLevel);
		}
		await actor.update( {"system.combat.lastLearnedLevel": newLevel});
	}

	powerLearningList() : readonly Readonly<{power: Power, level: number}>[] {
		const actor = this.actor;
		const lastLearn = actor.system.combat.lastLearnedLevel <= 1 ? actor.startingLevel : actor.system.combat.lastLearnedLevel;
		return this.powerLearningListFull()
			.filter( x=> x.level > lastLearn)
			.filter( x=> actor.checkPowerLegality(x.power ));
	}

  powerLearningListFull() : readonly Readonly<{power: Power, level: number}>[] {
    const actor = this.actor;
    let powerList = actor.system.combat.powersToLearn;
    const baseShadow = actor.isShadow() ? actor.baseShadow() : undefined;
    if (baseShadow) {
      powerList = baseShadow.system.combat.powersToLearn;
    }
    // if (actor.isShadow()) {
    // const baseId= (actor.system.personaConversion.baseShadowId);
    // if (baseId) {
    // 	const baseShadow = PersonaDB.getActorById(baseId);
    // 	if (baseShadow && baseShadow.isShadow()) {
    // 		powerList = baseShadow.system.combat.powersToLearn;
    // 	}
    // }
    // }
    return powerList
      .sort( (a,b) => a.level - b.level)
      .map( data => {
        const power = PersonaDB.getPower(data.powerId);
        return {
          power,
          level: data.level,
        };
      })
      .filter ( x=> x.power) as {power: Power, level: number}[];
  }

	async customPersona_learnedPowersMsg(newLevel: number) {
		if (!this.actor.isCustomPersona()) {return;}
		const actor = this.actor;
		const lastLearn = actor.system.combat.lastLearnedLevel <= 1 ? actor.startingLevel: actor.system.combat.lastLearnedLevel;
		const learned =	this.customPersonaLearningList()
			.filter( x=> x.level > lastLearn && x.level <= newLevel);
		if (learned.length == 0) {return;}
			// .map ( x=> ` ${localize(PROBABILITIES_POWER_RARITY[x.rarity])} ${localize( SLOTTYPES[x.slot])} Power (Custom Persona Elective Choice)`);
		for (const power of learned) {
			await Logger.sendToChat( `${actor.name} learned ${power.txt} (Custom Persona Elective Choice)`);
		}
	}

	prettyPrintCustomPower(pwrEntry : {slot: number, rarity: Probability}) : string {
		const x = pwrEntry;
		return ` ${localize(PROBABILITIES_POWER_RARITY[x.rarity])} ${localize( SLOTTYPES[x.slot])} Power`;
	}

	customPersonaLearningList () {
		// const common : CustomPersonaLearningList[number]["rarity"] = "normal" as const;
		// const uncommon : CustomPersonaLearningList[number]["rarity"] = "normal-minus" as const;
		// const capstone : CustomPersonaLearningList[number]["rarity"] = "never" as const;
		// const rare : CustomPersonaLearningList[number]["rarity"] = "rare-plus" as const;
		const actor = this.actor;
		const lastLearn = actor.system.combat.lastLearnedLevel <= 1 ? actor.startingLevel: actor.system.combat.lastLearnedLevel;
		// const baseList : CustomPersonaLearningList= {
		// 	1: {slot: 0, rarity: common},
		// 	7: {slot: 0, rarity: common},
		// 	14: {slot: 0, rarity: uncommon},
		// 	21: {slot: 1, rarity: common},
		// 	28: {slot: 1, rarity: common},
		// 	35: {slot: 1, rarity: uncommon},
		// 	42: {slot: 2, rarity: common},
		// 	49: {slot: 2, rarity: common},
		// 	56: {slot: 2, rarity: uncommon},
		// 	63: {slot: 3, rarity: common},
		// 	70: {slot: 3, rarity: common},
		// 	77: {slot: 3, rarity: uncommon},
		// 	84: {slot: 3, rarity: rare},
		// 	92: {slot: 3, rarity: capstone},
		// 	100: {slot :3, rarity: "rare"},
		// } as const;
    const baseList = this.actor.basePersona.hasTag("lone-persona") ? PowerLearningSystem.lonePersonaCustomLearningList() : PowerLearningSystem.multiPersonaCustomList();
		const retList = Object.entries(baseList)
			.map( ([k,v]) => ({ level: Number(k), ...v, txt: this.prettyPrintCustomPower(v)}))
			.filter( x=> x.level > lastLearn)
			.sort( (a,b) => a.level - b.level);
		return retList;
	}

  private static lonePersonaCustomLearningList() : CustomPersonaLearningList{
		const common : CustomPersonaLearningList[number]["rarity"] = "normal" as const;
		const uncommon : CustomPersonaLearningList[number]["rarity"] = "normal-minus" as const;
		const capstone : CustomPersonaLearningList[number]["rarity"] = "never" as const;
		const rare : CustomPersonaLearningList[number]["rarity"] = "rare-plus" as const;
		const exotic : CustomPersonaLearningList[number]["rarity"] = "rare" as const;
		const baseList : CustomPersonaLearningList= {
			1: {slot: 0, rarity: common},
			6: {slot: 0, rarity: common},
			12: {slot: 0, rarity: uncommon},
			18: {slot: 0, rarity: rare},
			24: {slot: 1, rarity: common},
			30: {slot: 1, rarity: uncommon},
			36: {slot: 1, rarity: rare},
			42: {slot: 2, rarity: common},
			48: {slot: 2, rarity: uncommon},
			54: {slot: 2, rarity: rare},
			60: {slot: 3, rarity: common},
			66: {slot: 3, rarity: common},
			72: {slot: 3, rarity: uncommon},
			78: {slot: 3, rarity: rare},
			82: {slot: 3, rarity: rare},
			88: {slot: 3, rarity: capstone},
      94: {slot: 3, rarity: exotic} ,
      98: {slot: 3, rarity: exotic},
		} as const;
    return baseList;
  }

  private static multiPersonaCustomList() : CustomPersonaLearningList{
		const common : CustomPersonaLearningList[number]["rarity"] = "normal" as const;
		const uncommon : CustomPersonaLearningList[number]["rarity"] = "normal-minus" as const;
		const capstone : CustomPersonaLearningList[number]["rarity"] = "never" as const;
		const rare : CustomPersonaLearningList[number]["rarity"] = "rare-plus" as const;
		const exotic : CustomPersonaLearningList[number]["rarity"] = "rare" as const;
		const baseList : CustomPersonaLearningList= {
			1: {slot: 0, rarity: common},
			7: {slot: 0, rarity: common},
			14: {slot: 0, rarity: uncommon},
			21: {slot: 1, rarity: common},
			28: {slot: 1, rarity: common},
			35: {slot: 1, rarity: uncommon},
			42: {slot: 2, rarity: common},
			49: {slot: 2, rarity: common},
			56: {slot: 2, rarity: uncommon},
			63: {slot: 3, rarity: common},
			70: {slot: 3, rarity: common},
			77: {slot: 3, rarity: uncommon},
			84: {slot: 3, rarity: rare},
			92: {slot: 3, rarity: capstone},
			100: {slot :3, rarity: exotic},
		} as const;
    return baseList;
  }

	async learnPower(power: Power, logChanges = true): Promise<boolean> {
		const actor = this.actor;
		try {
			if (power.isNavigator()) {
				if (!actor.isNPCAlly()) {
					PersonaError.softFail("Only NPC Allies can learn Navigator skills!");
					return false;
				}
				await (this as PowerLearningSystem<NPCAlly>).addNavigatorSkill(power);
				return true;
			}
			if (actor.knowsPowerInnately(power)) {
				ui.notifications.notify(`You already know ${power.displayedName}`);
				return true;
			}
			if (await this.tryToAddToMain(power, logChanges)) {
				return true;
			}
			if (await this.tryToAddToSideboard(power, logChanges)) {
				return true;
			}
			await this.tryToAddToLearnedPowersBuffer(power, logChanges);
			return true;
		} catch (e) {
			if (e instanceof Error) {
				PersonaError.softFail(`There was a problem adding power to ${actor.name}: ${e.toString()} `);
			}
			return false;
		}
	}

	async tryToAddToMain( power: Power, logChanges = true) : Promise<boolean> {
		const actor = this.actor;
		const powers = actor.system.combat.powers;
		if (this.hasSpaceToAddPowerToMain()) {
			powers.push(power.id);
			await actor.update( {"system.combat.powers": powers});
			if (actor.isShadow() && !actor.isPersona() && !actor.isDMon()) {
				await this.addLearnedPower(power, actor.level);
			}
			if (logChanges && actor.hasPlayerOwner) {
				await Logger.sendToChat(`${actor.name} learned Power: ${power.detailedName}`);
			}
			return true;
		}
		return false;
	}

  canLearnNewSkill() : boolean {
    const actor = this.actor;
    const persona = actor.basePersona;
    return persona.maxPowers - persona.mainPowers.length - persona.sideboardPowers.length >= 0;
  }

	async tryToAddToSideboard( power: Power, logChanges: boolean) : Promise<boolean> {
		const actor = this.actor;
		if (actor.isShadow()) {return false;}
		const sideboard =  actor.system.combat.powers_sideboard;
		if (this.hasSpaceToAddToSideboard()) {
			sideboard.push(power.id);
			await actor.update( {"system.combat.powers_sideboard": sideboard});
			if (logChanges && actor.hasPlayerOwner) {
				await Logger.sendToChat(`${actor.name} learned Power: ${power.detailedName} (placed in sideboard)`);
			}
			return true;
		}
		return false;
	}

  isSwappable(pwr: Power) : boolean {
    if (pwr.hasTag("swappable")) {
      return true;
    }
    if (!this.actor.isCustomPersona()) {
      return false;
    }
    return true; //TOOD: put actual restriction
  }

	async tryToAddToLearnedPowersBuffer( power: Power, logChanges: boolean) : Promise<boolean> {

		const actor = this.actor;
    const persona = actor.basePersona;
		const buffer= actor.system.combat.learnedPowersBuffer;
		buffer.push(power.id);
		await actor.update( {"system.combat.learnedPowersBuffer": buffer});
		const maxMsg = `<br>${persona.name} has exceeded their allowed number of powers (${persona.maxPowers})  and must forget one or more powers.`;
		if (logChanges) {
			await Logger.sendToChat(`${actor.name} learned ${power.name} ${maxMsg}` , actor);
		}
		return true;
		// }
	}

	hasSpaceToAddPowerToMain() : boolean {
		const actor = this.actor;
		const powers = actor.mainPowers;
		return (powers.length < actor.basePersona.maxMainPowers);
	}

	hasSpaceToAddToSideboard(): boolean {
		const actor = this.actor;
		if (actor.isShadow()) {return false;}
		const sideboard = actor.sideboardPowers;
		return (sideboard.length < actor.basePersona.maxSideboardPowers);
	}

	async addLearnedPower( power: Power, level = 99) : Promise<void> {
		const actor = this.actor;
		const arr = actor.system.combat.powersToLearn;
		arr.push( { powerId: power.id, level});
		await actor.update({ "system.combat.powersToLearn": arr});
	}

	async addNavigatorSkill(this: PowerLearningSystem<NPCAlly>, pwr: Power) {
		const actor = this.actor;
		actor.system.combat.navigatorSkills.pushUnique(pwr.id);
		await actor.update( {"system.combat.navigatorSkills" : actor.system.combat.navigatorSkills});
		await Logger.sendToChat(`${actor.name} added Navigator skill: ${pwr.name}` , actor);
	}

	private async promotePowers_sideboardToMain() {
		const actor = this.actor;
		if (!actor.hasPowerSideboard) { return false;}
		while (this.hasSpaceToAddPowerToMain()) {
			const sideboard = actor.sideboardPowers.at(0);
			if (sideboard && actor.isPC()) {
				await actor.retrievePowerFromSideboard(sideboard.id);
				continue;
			}
			break;
		}
	}

	private async promotePowers_learnedToMain() {
		const actor = this.actor;
		while (this.hasSpaceToAddPowerToMain()) {
			const bufferPower = actor.learnedPowersBuffer.at(0);
			if (bufferPower) {
				await this.moveFromBufferToMain( bufferPower);
				continue;
			}
			break;
		}
	}

	private async promotePowers_learnedToSideboard() {
		const actor = this.actor;
		if (!actor.hasPowerSideboard) { return false;}
		while (this.hasSpaceToAddToSideboard()) {
			const bufferPower = actor.learnedPowersBuffer.at(0);
			if (bufferPower && !actor.isShadow()) {
				await (this as PowerLearningSystem<PC | NPCAlly>).moveFromBufferToSideboard(bufferPower);
				continue;
			}
			break;
		}

	}

	 async promotePowers() {
		await this.promotePowers_learnedToMain();
		await this.promotePowers_sideboardToMain();
		await this.promotePowers_learnedToSideboard();
	}

	async moveFromBufferToSideboard(this: PowerLearningSystem<PC | NPCAlly>, power : Power) {
		const actor = this.actor;
		let buffer = actor.system.combat.learnedPowersBuffer;
		const sideboard = actor.system.combat.powers_sideboard;
		sideboard.push(power.id);
		buffer = buffer.filter(x=> x != power.id);
		await actor.update( {"system.combat.powers_sideboard": sideboard});
		await actor.update( {"system.combat.learnedPowersBuffer": buffer});
	}

	async moveFromBufferToMain( power : Power) {
		const actor = this.actor;
		let buffer = actor.system.combat.learnedPowersBuffer;
		const mainPowers = actor.system.combat.powers;
		mainPowers.push(power.id);
		buffer = buffer.filter(x=> x != power.id);
		await actor.update( {"system.combat.powers": mainPowers});
		await actor.update( {"system.combat.learnedPowersBuffer": buffer});
	}

async checkForMissingLearnedPowers() {
	const actor = this.actor;
	if (!actor.isShadow()) {return;}
	const powers = actor.system.combat.powers;
	const learned= actor.powerLearningList;
	const missing = powers
		.filter( pwr => !learned
			.some(learnedPwr => learnedPwr.power.id == pwr))
		.map (pwr=> PersonaDB.getPower(pwr))
		.filter (pwr=> pwr != undefined);
	for (const pwr of missing) {
		await this.addLearnedPower(pwr, actor.system.personaConversion.startingLevel ?? actor.system.combat.personaStats.pLevel);
	}
}

async deletePower(id: Power["id"] ) {
	const actor = this.actor;
  const item = actor.items.find(x => x.id == id);
  if (item) {
    await item.delete();
    return true;
  }
  const result = await this.deletefromLearnBuffer(id)
    || await this.deleteFromMainPowers(id)
    || (actor.isNPCAlly() ? await this.deleteNavigatorSkill(id) : undefined)
    || (!actor.isShadow() ? await this.deleteFromSideboard(id) : false) ;
  await this.promotePowers();
  return result;
}

async deleteLearnablePower( id: Power["id"]) : Promise<void> {
	const actor = this.actor;
	let learnables = actor.system.combat.powersToLearn;
	learnables = learnables.filter(x=> x.powerId != id);
	await actor.update({"system.combat.powersToLearn": learnables});
}

async deletefromLearnBuffer( id: Power["id"]) : Promise<boolean> {
	const actor = this.actor;
	let buffer = actor.system.combat.learnedPowersBuffer;
	const power = PersonaDB.getItemById(id) as Power;
	if (buffer.includes(id)) {
		buffer = buffer.filter( x=> x != id);
		await actor.update( {"system.combat.learnedPowersBuffer": buffer});
		await Logger.sendToChat(`${actor.name} chose to forget new power:  ${power.detailedName}` , actor);
		return true;
	}
	return false;
}

async deleteFromMainPowers( id: Power["id"]) : Promise<boolean> {
	const actor = this.actor;
	let powers = actor.system.combat.powers;
	const power = PersonaDB.getItemById(id) as Power;
	if (powers.includes(id)) {
		powers = powers.filter( x=> x != id);
		await actor.update( {"system.combat.powers": powers});
		// await this.checkMainPowerEmptySpace();
		if (actor.hasPlayerOwner) {
			await Logger.sendToChat(`${actor.name} deleted power ${power.detailedName}` , actor);
		}
		return true;
	}
	return false;
}

async deleteFromSideboard( id: Power["id"]) : Promise<boolean> {
	const actor = this.actor;
  if (!actor.isPC()) {return false;}
	let sideboard = actor.system.combat.powers_sideboard;
	if (sideboard && sideboard.includes(id)) {
		const power = PersonaDB.getItemById(id) as Power;
		sideboard = sideboard.filter( x=> x != id);
		await actor.update( {"system.combat.powers_sideboard": sideboard});
		await Logger.sendToChat(`${actor.name} deleted sideboard power ${power.detailedName}` , actor);
		return true;
	}
	return false;
}

	async deleteNavigatorSkill(powerId: Power["id"] ) : Promise<boolean> {
	const actor = this.actor;
    if (!actor.isNPCAlly()){ return false;}
		if (!actor.system.combat.navigatorSkills.find( x=> powerId == x)) {return false;}
		const power = actor.navigatorSkills.find( x=> x.id == powerId);
		actor.system.combat.navigatorSkills= actor.system.combat.navigatorSkills.filter(x=> x != powerId);
		await actor.update( {"system.combat.navigatorSkills" : actor.system.combat.navigatorSkills});
		await Logger.sendToChat(`${actor.name} deleted Navigator skill ${power?.name ?? "unknown power"}` , actor);
		return true;
	}

static PersonasThatKnowPower(power: Power) {
  return PersonaDB.possiblePersonas()
  .filter( persona => persona.powerLearningListFull
    .some (x=> x.power == power)
  );
}

}

type CustomPersonaLearningList= Record<number, {slot: keyof typeof SLOTTYPES, rarity: keyof typeof PROBABILITIES_POWER_RARITY}>;

