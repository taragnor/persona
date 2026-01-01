import { EnhancedSourcedConsequence, NonDeprecatedConsequence } from "../../config/consequence-types.js";
import {NonDeprecatedPrecondition} from "../../config/precondition-types.js";
import {PersonaAE} from "../active-effect.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {CETypes, ConditionalEffectManager} from "../conditional-effect-manager.js";
import {ModifierContainer, PersonaItem} from "../item/persona-item.js";
import {testPrecondition} from "../preconditions.js";

export class ConditionalEffectC {
	_preconditions : SourcedPrecondition<NonDeprecatedPrecondition<Precondition>>[];
	_consequences: SourcedConsequence<NonDeprecatedConsequence>[];
	_isEmbedded : boolean;
	_source: U<ModifierContainer>;
	_owner: U<UniversalActorAccessor<PersonaActor>>;
	_realSource: U<ModifierContainer>;
	_original : CondEffectObject | SkillCard;
	_conditionalType: typeof CETypes[number];

	get conditionalType () {
		return this._conditionalType;
	}

	get name() : string {
		let ret = "";
		if (this._realSource && this._realSource != this._source) {
			ret += this._realSource.name;
		}
		if (this._source) {
			ret += ret.length > 0 ? ` (${this._source.name})` : this._source.name;
		}
		if (ret.length == 0) {
			return "unknown";
		}
		return ret;
	}

	get conditions() {
		return this._preconditions;
	}

	get consequences() {
		return this._consequences;
	}

	get isDefensive(): boolean {
		return this._conditionalType == "defensive";
	}

	get isEmbedded(): boolean {
		return this._isEmbedded;
	}

	get source() { return this._source;}
	get realSource() { return this._realSource;}
	get owner() { return this._owner; }

	equals( other: ConditionalEffectC) : boolean {
		return this._original == other._original;
	}

	getActiveConsequences(situation: Situation) : EnhancedSourcedConsequence<NonDeprecatedConsequence>[] {
		const source = this.source;
		if (!this.conditions
			.every( cond=>testPrecondition(cond, situation))
		) {return [];}
		return this.consequences.map( cons => ({
			...cons,
			source,
			owner: this.owner,
		}));
	}

	#determineConditionalType (ce: CondEffectObject, conditions: SourcedConditionalEffect["conditions"], consequences : SourcedConditionalEffect["consequences"], sourceItem: N<ConditonalEffectHolderItem> ) : this["_conditionalType"] {
		let condType : this["_conditionalType"] = "unknown";
		const forceDefensive = (sourceItem?.isDefensive)
			? sourceItem.isDefensive()
			: false;
		const isDefensive= (ce.isDefensive || forceDefensive) ?? false;
		const isEmbedded = ce.isEmbedded ?? false;
		switch (true) {
			case forceDefensive || ce.isDefensive:
				return "defensive";
			default:
				condType = !forceDefensive ? ConditionalEffectManager.getConditionalType({conditions, consequences, isDefensive, isEmbedded}, sourceItem): "defensive";

				if (condType == "unknown" && sourceItem) {
					return (sourceItem.defaultConditionalEffectType) ? sourceItem.defaultConditionalEffectType() : "passive";
				}
		}
		return condType;
	}

	constructor (card: SkillCard);
	constructor (ce: CondEffectObject, sourceItem: N<ConditonalEffectHolderItem> , sourceActor: N<PersonaActor>, realSource ?: ConditonalEffectHolderItem);
	constructor (ce: CondEffectObject | SkillCard, sourceItem?: N<ConditonalEffectHolderItem> , sourceActor?: N<PersonaActor>, realSource ?: ConditonalEffectHolderItem) {
		if (ce instanceof PersonaItem)  {
			this._generateSkillCardTeachEffect(ce);
			return;
		}
		this._original = ce;
		this._preconditions = ConditionalEffectManager.getConditionals(ce.conditions, sourceItem!, sourceActor!, realSource);
		this._consequences = ConditionalEffectManager.getConsequences(ce.consequences, sourceItem!, sourceActor!, realSource);
		this._isEmbedded = ce.isEmbedded ?? false;
		this._conditionalType = this.#determineConditionalType(ce, this._preconditions, this._consequences, sourceItem!);
		this._owner= sourceActor?.accessor;
		this._source= sourceItem != null ? sourceItem : undefined;
		this._realSource= realSource;
	}

	private _generateSkillCardTeachEffect(card: SkillCard) {
		this._original = card;
		this._source = card;
		this._owner = card.parent?.accessor;
		this._isEmbedded= false;
		this._conditionalType = "on-use";
		this._realSource =undefined;
		if (!card.system.skillId) {
			this._preconditions= [];
			this._consequences= [];
			return;
		}
		this._preconditions = [
			{
				type: 'always',
				source: card,
				owner: card.parent?.accessor,
				realSource: undefined,
			} as const
		];
		this._consequences= [
			{
				type: 'teach-power',
				id: card.system.skillId,
				source: card,
				owner: card.parent?.accessor,
				realSource: undefined,
				applyTo: "user",
			} satisfies SourcedConditionalEffect["consequences"][number]
		];
	}

}

type CondEffectObject = ConditionalEffect;


type ConditonalEffectHolderItem = ModifierContainer & (PersonaItem | PersonaAE) & Partial<{isDefensive : () => boolean, defaultConditionalEffectType: () => TypedConditionalEffect["conditionalType"]}> ;

