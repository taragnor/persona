import {PC, Shadow} from "../module/actor/persona-actor.js";
import {ConditionalEffectManager} from "../module/conditional-effect-manager.js";
import {Persona} from "../module/persona-class.js";
import {PersonaDB} from "../module/persona-db.js";
import {testPreconditions} from "../module/preconditions.js";
import {TarotCard} from "./tarot.js";

type TarotTable = Record<TarotCard, U<TarotCard>>;

const FoolTable : TarotTable = {
	"": undefined,
	Fool: "Fool",
	Magician: "Death",
	HighPriestess: "Moon",
	Empress: "HangedMan",
	Emperor: "Temperance",
	Hierophant: "Hermit",
	Lovers: "Chariot",
	Chariot: "Moon",
	Justice: "Star",
	Hermit: "HighPriestess",
	WheelOfFortune: "World",
	Strength: "Death",
	HangedMan: "Tower",
	Death: "Strength",
	Temperance: "Hierophant",
	Devil: "Temperance",
	Tower: "Empress",
	Star: "Magician",
	Moon: "Justice",
	Sun: "Justice",
	Judgment: "Sun",
	World: "Hierophant",
};


const MagicianTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: "Magician",
	HighPriestess: "Temperance",
	Empress: "Justice",
	Emperor: undefined,
	Hierophant: "Death",
	Lovers: "Devil",
	Chariot: "HighPriestess",
	Justice: "Emperor",
	Hermit: "Lovers",
	WheelOfFortune: "Justice",
	Strength: "Fool",
	HangedMan: "Empress",
	Death: "Hermit",
	Temperance: "Chariot",
	Devil: "Hierophant",
	Tower: "Temperance",
	Star: "HighPriestess",
	Moon: "Lovers",
	Sun: "Hierophant",
	Judgment: "Strength",
	World: "Moon",
};

const PriestessTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: "HighPriestess",
	Empress: "Emperor",
	Emperor: "Empress",
	Hierophant: "Magician",
	Lovers: "WheelOfFortune",
	Chariot: "Hierophant",
	Justice: "Death",
	Hermit: "Temperance",
	WheelOfFortune: "Magician",
	Strength: "Devil",
	HangedMan: "Empress",
	Death: "Magician",
	Temperance: "Devil",
	Devil: "Moon",
	Tower: "HangedMan",
	Star: "Hermit",
	Moon: "Hierophant",
	Sun: "Chariot",
	Judgment: "Justice",
	World: "Justice",
};

const EmpressTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: "Empress",
	Emperor: "Justice",
	Hierophant: "Fool",
	Lovers: "Judgment",
	Chariot: "Star",
	Justice: "Lovers",
	Hermit: "Strength",
	WheelOfFortune: "Hermit",
	Strength: "World",
	HangedMan: "HighPriestess",
	Death: "Fool",
	Temperance: "World",
	Devil: "Sun",
	Tower: "Emperor",
	Star: "Lovers",
	Moon: "WheelOfFortune",
	Sun: "Tower",
	Judgment: "Emperor",
	World: "HangedMan"
};

const EmperorTable : TarotTable =  {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: "Emperor",
	Hierophant: "WheelOfFortune",
	Lovers: "Fool",
	Chariot: "World",
	Justice: "Chariot",
	Hermit: "Hierophant",
	WheelOfFortune: "Sun",
	Strength: "Tower",
	HangedMan: "Devil",
	Death: "Hermit",
	Temperance: "Devil",
	Devil: "Justice",
	Tower: "Star",
	Star: "Lovers",
	Moon: "Tower",
	Sun: "Judgment",
	Judgment: "HighPriestess",
	World: "Lovers"
};

const HierophantTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: "Hierophant",
	Lovers: "Strength",
	Chariot: "Star",
	Justice: "HangedMan",
	Hermit: "World",
	WheelOfFortune: "Justice",
	Strength: "Sun",
	HangedMan: "Fool",
	Death: "Chariot",
	Temperance: "Death",
	Devil: "HangedMan",
	Tower: "Judgment",
	Star: "Tower",
	Moon: "HighPriestess",
	Sun: "Lovers",
	Judgment: "World",
	World: "Justice"
};

const LoversTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: "Lovers",
	Chariot: "Temperance",
	Justice: "Judgment",
	Hermit: "Chariot",
	WheelOfFortune: "Strength",
	Strength: "Death",
	HangedMan: "Empress",
	Death: "Temperance",
	Temperance: "Strength",
	Devil: "Moon",
	Tower: "Empress",
	Star: "World",
	Moon: "Magician",
	Sun: "Empress",
	Judgment: "HangedMan",
	World: "Tower"
};

const ChariotTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: "Chariot",
	Justice: "Moon",
	Hermit: "Devil",
	WheelOfFortune: undefined,
	Strength: "Hermit",
	HangedMan: "Fool",
	Death: "Devil",
	Temperance: "Strength",
	Devil: "Temperance",
	Tower: "WheelOfFortune",
	Star: "Moon",
	Moon: "Lovers",
	Sun: "HighPriestess",
	Judgment: undefined,
	World: "Sun"
};


const JusticeTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: "Justice",
	Hermit: "Magician",
	WheelOfFortune: "Emperor",
	Strength: undefined,
	HangedMan: "Lovers",
	Death: "Fool",
	Temperance: "Emperor",
	Devil: "Fool",
	Tower: "Sun",
	Star: "Empress",
	Moon: "Devil",
	Sun: "HangedMan",
	Judgment: undefined,
	World: "Sun"
};

const HermitTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: "Hermit",
	WheelOfFortune: "Star",
	Strength: "Hierophant",
	HangedMan: "Star",
	Death: "Strength",
	Temperance: "Strength",
	Devil: "HighPriestess",
	Tower: "Judgment",
	Star: "Strength",
	Moon: "HighPriestess",
	Sun: "Devil",
	Judgment: "Emperor",
	World: "Judgment"
};

const FortuneTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: "WheelOfFortune",
	Strength: undefined,
	HangedMan: "Emperor",
	Death: "Star",
	Temperance: "Empress",
	Devil: "Hierophant",
	Tower: "HangedMan" ,
	Star: "Devil",
	Moon: "Sun",
	Sun: "Star",
	Judgment: "Tower",
	World: "Judgment"
};


const StrengthTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: "Strength",
	HangedMan: "Temperance",
	Death: "Hierophant",
	Temperance: "Chariot",
	Devil: "Death",
	Tower: "Judgment",
	Star: "Moon",
	Moon: "Magician",
	Sun: "Moon",
	Judgment: undefined,
	World: "Star",
};

const HangedManTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: undefined,
	HangedMan: "HangedMan",
	Death: "Temperance",
	Temperance: "Hierophant",
	Devil: "Chariot",
	Tower: "Death",
	Star: "Moon",
	Moon: "Magician",
	Sun: "Moon",
	Judgment: "Star",
	World: "Star",
};

const DeathTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: undefined,
	HangedMan: undefined,
	Death: "Death",
	Temperance: "HangedMan",
	Devil: "Chariot",
	Tower: "Sun",
	Star: undefined,
	Moon: "Hierophant",
	Sun: "HighPriestess",
	Judgment: undefined,
	World: "Magician"
};

const TemperanceTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: undefined,
	HangedMan: undefined,
	Death: undefined,
	Temperance: "Temperance",
	Devil: "Fool",
	Tower: "WheelOfFortune",
	Star: "Sun",
	Moon: undefined,
	Sun: "Magician",
	Judgment: "Hermit",
	World: "Fool"
};

const DevilTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: undefined,
	HangedMan: undefined,
	Death: undefined,
	Temperance: undefined,
	Devil: "Devil",
	Tower: "Magician",
	Star: "Strength",
	Moon: "Hermit",
	Sun: "Lovers",
	Judgment: "Lovers",
	World: "Chariot"
};

const TowerTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: undefined,
	HangedMan: undefined,
	Death: undefined,
	Temperance: undefined,
	Devil: undefined,
	Tower: "Tower",
	Star: undefined,
	Moon: "Hermit",
	Sun: "Emperor",
	Judgment: "Moon",
	World: "Death",
};

const StarTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: undefined,
	HangedMan: undefined,
	Death: undefined,
	Temperance: undefined,
	Devil: undefined,
	Tower: undefined,
	Star: "Star",
	Moon: "Temperance",
	Sun: "Judgment",
	Judgment: "WheelOfFortune",
	World: "Sun"
};

const MoonTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: undefined,
	HangedMan: undefined,
	Death: undefined,
	Temperance: undefined,
	Devil: undefined,
	Tower: undefined,
	Star: undefined,
	Moon: "Moon",
	Sun: "Empress",
	Judgment: "Fool",
	World: "Temperance"
};


const SunTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: undefined,
	HangedMan: undefined,
	Death: undefined,
	Temperance: undefined,
	Devil: undefined,
	Tower: undefined,
	Star: undefined,
	Moon: undefined,
	Sun: "Sun",
	Judgment: "Death",
	World: "Emperor"
};

const JudgmentTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: undefined,
	HangedMan: undefined,
	Death: undefined,
	Temperance: undefined,
	Devil: undefined,
	Tower: undefined,
	Star: undefined,
	Moon: undefined,
	Sun: undefined,
	Judgment: "Judgment",
	World: "Devil"
};

const WorldTable : TarotTable = {
	"": undefined,
	Fool: undefined,
	Magician: undefined,
	HighPriestess: undefined,
	Empress: undefined,
	Emperor: undefined,
	Hierophant: undefined,
	Lovers: undefined,
	Chariot: undefined,
	Justice: undefined,
	Hermit: undefined,
	WheelOfFortune: undefined,
	Strength: undefined,
	HangedMan: undefined,
	Death: undefined,
	Temperance: undefined,
	Devil: undefined,
	Tower: undefined,
	Star: undefined,
	Moon: undefined,
	Sun: undefined,
	Judgment: undefined,
	World: "World"
};


export class FusionTable {

	private static _table : Record<TarotCard, TarotTable> = {
		"": FoolTable,
		Fool: FoolTable,
		Magician: MagicianTable,
		HighPriestess: PriestessTable,
		Empress: EmpressTable,
		Emperor: EmperorTable,
		Hierophant: HierophantTable,
		Lovers: LoversTable,
		Chariot: ChariotTable,
		Justice: JusticeTable,
		Hermit: HermitTable,
		WheelOfFortune: FortuneTable,
		Strength: StrengthTable,
		HangedMan: HangedManTable,
		Death: DeathTable,
		Temperance: TemperanceTable,
		Devil: DevilTable,
		Tower: TowerTable,
		Star: StarTable,
		Moon: MoonTable,
		Sun: SunTable,
		Judgment: JudgmentTable,
		World: WorldTable,
	};

	static fusionResult(p1: Shadow, p2: Shadow) : U<Shadow> {
		const targetArcana = this._arcanaResult(p1, p2);
		if (!targetArcana) {return undefined;}
		const targetLevel1 =  p1.startingLevel;
		const targetLevel2 =  p2.startingLevel;
		if (p1.tarot == p2.tarot) {
			const targetLevel = Math.max(targetLevel1, targetLevel2);
			return this.#downwardFusion(targetArcana, targetLevel);
		} else {
			const targetLevel = Math.floor((targetLevel1 + targetLevel2)/2);
			return this.#upwardFusion(targetArcana, targetLevel);
		}
	}

	static #downwardFusion(targetArcana: TarotCard, targetLevel : number) : U<Shadow> {
		const shadowList = this.fusionTargetsByLevel(targetArcana, 2, targetLevel-1);
		if (!shadowList || shadowList.length == 0) {return undefined;}
		shadowList.sort( (a,b)=> a.startingLevel - b.startingLevel);
		return shadowList.at(0);
	}

	static fusionTargetsByLevel (targetArcana: TarotCard, min: number = 2, max: number = 999) : Shadow[] {
		return PersonaDB.possiblePersonasByStartingLevel(min,max)
		?.filter(shadow =>
			shadow.system.creatureType != "daemon"
			&& shadow?.tarot?.name == targetArcana
			&& shadow.startingLevel <= max
			&& shadow.startingLevel >= min
		);
	}

	static #upwardFusion(targetArcana: TarotCard, targetLevel : number) : U<Shadow> {
		const shadowList = this.fusionTargetsByLevel(targetArcana, targetLevel, 100);
		if (!shadowList || shadowList.length == 0) {return undefined;}
		shadowList.sort( (a,b)=> a.startingLevel - b.startingLevel);
		return shadowList.at(0);
	}

	static fusionCombinationsInto(fusionTarget: Shadow, min=2, max= 999) : [Shadow, Shadow][] {
		const retList : [Shadow, Shadow][] = [];
		const possibles = PersonaDB.possiblePersonas()
			.filter (x=>
				x.startingLevel >= min
				&& x.startingLevel <= max
				&& x!= fusionTarget);
		for (let persona = possibles.pop(); persona != undefined; persona = possibles.pop()) {
			const filteredPossibles = possibles
				.filter ( x=> this._arcanaResult(persona, x) == fusionTarget?.tarot?.name);
			for (const p2 of filteredPossibles) {
				const fusion = FusionTable.fusionResult(persona, p2);
				if (fusion && fusion == fusionTarget) {
					retList.push([persona, p2]);
				}
			}
		}
		return retList;
	}

	private static _arcanaResult(p1: Shadow, p2: Shadow) : U<TarotCard>{
		const T1 = (p1?.tarot?.name as TarotCard)  ?? "";
		const T2 = (p2?.tarot?.name as TarotCard)  ?? "";
		const possible =  this._table[T1][T2];
		if (possible) {return possible;}
		const reversed = this._table[T2][T1];
		if (reversed) {return reversed;}
		return undefined;
	}

	private static numOfInheritedSkills(p1: Shadow, p2: Shadow, result: Shadow) : number {
		const totalSkills = p1.mainPowers.length + p2.mainPowers.length;
		const startingSkills = result.startingPowers.length;
		const max = 8 - startingSkills;
		const learnedMax = Math.max(1, Math.ceil(totalSkills/2) - startingSkills);
		return Math.min(max, learnedMax);
	}

	static fusionCombinationsOutOf(personas: readonly Persona[], raw= false) : FusionCombination[] {
		const possibles : Shadow[] = personas
			.map( x=> x.source as Shadow)
			.filter( x=> x.isShadow() && !x.isCustomPersona()) ;
		const arr : FusionCombination[] = [];
		for (let p1 = possibles.pop(); p1 != undefined; p1 = possibles.pop()) {
			for (const p2 of possibles) {
				const result = this.fusionResult(p1, p2);
				if (!result) {
					if (!raw) {continue;}
					arr.push( {
						result,
						components: [p1, p2],
						inheritedSkills: 0,
						resultArcana: this._arcanaResult(p1, p2) ?? "",
					});
					continue;
				}
				const inheritedSkills = this.numOfInheritedSkills(p1, p2, result);
				arr.push( {
					result,
					components: [p1, p2],
					inheritedSkills,
					resultArcana: result.tarot?.name as TarotCard ?? "",
				});
			}
		}
		return arr;
	}

	static meetsConditionsToFuse(fusionResult: Shadow, fusor: PC) : boolean {
		const fusionConditions = ConditionalEffectManager.getConditionals(fusionResult.system.personaConversion.fusionConditions, null, fusionResult, null);
		const situation = {
			user: fusor.accessor,
			target: fusionResult.accessor,
		};
		return testPreconditions(fusionConditions, situation);
	}

} // end of class

// @ts-expect-error adding to global state
window.FusionTable = FusionTable;

export type FusionCombination = {
	components: Shadow[],
	result: U<Shadow>,
	inheritedSkills: number,
	resultArcana: TarotCard,
}
