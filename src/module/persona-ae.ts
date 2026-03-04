import { PersonaRoller } from "./persona-roll.js";
import { FatigueStatusId } from "../config/status-effects.js";
import { statusMap } from "../config/status-effects.js";
import { PersonaDB } from "./persona-db.js";
import { StatusDurationType } from "../config/status-effects.js";
import { GetEffectsOptions, ModifierContainer, PersonaItem} from "./item/persona-item.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaError } from "./persona-error.js";
import { StatusEffectId } from "../config/status-effects.js";
import {ModifierTarget} from "../config/item-modifiers.js";
import {ModifierListItem} from "./combat/modifier-list.js";
import {TriggeredEffect} from "./triggered-effect.js";
import {ConditionalEffectC} from "./conditionalEffects/conditional-effect-class.js";


export class PersonaAE extends ActiveEffect<PersonaActor, PersonaItem> implements ModifierContainer<PersonaAE> {

	declare statuses: Set<StatusEffectId>;
	_flaggedDeletion: boolean;

	static async applyHook (this: never, _actor: PersonaActor, _change: Foundry.AEChange, _current: unknown, _delta: unknown, _changes: Record<string, unknown> ) {
		//*changes object is a record of valeus taht may get changed by applying the AE;
		// example: changes["system.hp"] = 25
	}

	get displayedName() {
		return game.i18n.localize(this.name);
	}

	override apply( actor: Actor, change: Foundry.AEChange) {
		if (typeof change.value == "string" && change.value.startsWith("system.")) {
			const val = foundry.utils.getProperty(actor, change.value) as unknown;
			if (val != undefined && typeof val == "string" || typeof val == "number") {
				const modChange = {
					...change,
					value: String(val),
				};
				return super.apply(actor, modChange);
			}
		}
		return super.apply(actor, change);
	}

	get potency(): number {
		try {
			const potency = Number(this.getFlag<string>("persona", "potency"));
			return potency ?? 0;
		} catch {
			PersonaError.softFail("Can't convert Potency for status");
			return 0;
		}
	}

	get statusDuration() : StatusDuration {
		const duration =  this.getFlag<StatusDuration | StatusDuration["dtype"]>("persona", "duration");
		if (!duration) {
			return {
				dtype: "permanent"
			};
		}
		if (typeof duration == "string") {
			return {
				dtype: duration
			} as StatusDuration;
		}
		if (duration && duration.dtype) {
			return duration;
		}
		PersonaError.softFail(`Unable to convert DurationType ${duration as string}`);
		return duration;
	}

	statusHasTag(tag: StatusEffectObject["tags"][number]): boolean {
		for (const status of this.statuses) {
			const stData = statusMap.get(status);
			if (!stData) {continue;}
			const tags = stData.tags;
			if (tags.includes(tag))
			{return true;}
		}
		return false;
	}

	get statusTags() : Tag[] {
		return Array.from(
			this.statuses.values()
			.map( st => PersonaDB
				.allTagLinks()
				.get(st)
			)
			.filter( x=> x != undefined)
		);
	}

	statusDurationString() : string {
		const dur = this.statusDuration;
		switch (dur.dtype) {
			case "permanent":
				return "Permanent";
			case "expedition":
				return "Ends on Return from MV";
			case "X-exploration-turns":
				return `Ends in ${dur.amount} exploration turns`;
			case "combat":
				return `Ends at end of Combat`;
			case "save":
				return `${dur.saveType} save ends`;
			case "3-rounds":
			case "X-rounds":
				return `Lasts ${dur.amount ?? 3} rounds`;
			case "X-days":
				return `Lasts ${dur.amount} days`;
			case "UEoNT":
				return `Lasts until end of Next turn`;
			case "USoNT":
				return `Lasts until start of Next Turn`;
			case "UEoT":
				return `Lasts Until end of turn`;
			case "instant":
				return `Instant`;
			case "anchored":
				return `Special non-standard Duration`;
			default:
				dur satisfies never;
				return `ERROR`;
		}
	}

	get isDistracting() : boolean {
		return this.statusHasTag("distracting");
	}

	get isIncapacitating() : boolean {
		return this.statusHasTag("incapacitating");
	}

	get isBaneful() :boolean {
		return this.statusHasTag("baneful");
	}

	async setPotency(potency: number) : Promise<void> {
		await this.setFlag("persona", "potency", potency);
	}

	durationFix(duration: TurnEndDuration) : void {
		if (duration.anchorStatus) {return;}
		const owner = duration.actorTurn ? PersonaDB.findActor(duration.actorTurn) : this.parent;
		if (!(owner instanceof PersonaActor)) { return;}
		const combat = game.combat;
		if (!combat) {
			duration.dtype = "UEoT";
			return;
		}
		if (combat.combatant?.actor != owner) {
			duration.dtype = "UEoT";
		}
	}

	async mergeDuration(newDuration : StatusDuration) : Promise<void> {
		if (newDuration.dtype == "UEoNT") {
			this.durationFix(newDuration);
		}
		if (!this.durationLessThanOrEqualTo(newDuration)) {
			return;
		}
		const oldDuration = this.statusDuration;
		switch (newDuration.dtype) {
			case "UEoNT":
			case "USoNT":
			case "UEoT": {
				if (newDuration.anchorStatus) {return;}
				if (!newDuration.actorTurn) {return;}
				const actorTurn = PersonaDB.findActor(newDuration.actorTurn);
				if (actorTurn == this.parent) {break;}
				const anchor = await this.createAnchoredHolder(newDuration);
				if (!anchor) {break;}
				const anchorD : StatusDuration = {
					dtype: "anchored",
					anchor: anchor.accessor,
				};
				await this.setFlag("persona", "duration", anchorD);
				return;
			}
			case "X-rounds":
			case "3-rounds":
				if ("amount" in oldDuration) {
					oldDuration.amount+= newDuration.amount;
					await this.setFlag("persona", "duration", oldDuration);
					return;
				}
				break;
			default:
				break;
		}
		await this.setFlag("persona", "duration", newDuration);
	}


	async setDuration(duration: StatusDuration, options: DurationOptions = {}) : Promise<void> {
		if (duration.dtype == "UEoNT") {
			this.durationFix(duration);
		}
		duration = {
			...duration,
			...options,
		};
		switch (duration.dtype) {
			case "UEoNT":
			case "USoNT":
			case "UEoT": {
				if (duration.anchorStatus) {break;}
				if (!duration.actorTurn) {break;}
				const actorTurn = PersonaDB.findActor(duration.actorTurn);
				if (actorTurn == this.parent) {break;}
				const anchor = await this.createAnchoredHolder(duration);
				if (!anchor) {break;}
				const newDuration : StatusDuration = {
					dtype: "anchored",
					anchor: anchor.accessor,
				};
				await this.setFlag("persona", "duration", newDuration);
				return;
			}
			default:
				break;
		}
		await this.setFlag("persona", "duration", duration);
	}

	async setEmbeddedEffects( effects: readonly SourcedConditionalEffect[])  : Promise<this> {
		const effectsRedux : ConditionalEffect[]= effects
		.map( eff=> {
			return {
				...eff,
				conditions: eff.conditions
				.map (cond => {
					return  {
						...cond,
						owner: null,
						realSource: null,
						source: null,
					};
				}),
				consequences: eff.consequences
				.map( cons => {
					return  {
						...cons,
						owner: null,
						realSource: null,
						source: null,
					};
				}),
				owner: null,
				realSource: null,
				source: null,
			};
		});
		const effectString = JSON.stringify(effectsRedux);
		await this.setFlag("persona", "embeddedEffects", effectString);
		return this;
	}

	getEmbeddedEffects(sourceActor: PersonaActor | null, options: GetEffectsOptions = {}) : ConditionalEffectC[] {
		const {CETypes} = options;
		const effects = this.getFlag("persona", "embeddedEffects") as string;
		if (!effects) {
			return [];
		}
		const effectsArr = JSON.parse(effects) as SourcedConditionalEffect[];
		const sourceActorAcc = sourceActor?.accessor ?? undefined;
		const effectsArrModified : SourcedConditionalEffect[]=  effectsArr
			.map ( eff => {
				const conditions:  SourcedConditionalEffect["conditions"] = eff.conditions.map( cond => {
					return { ...cond, owner: sourceActorAcc, source: this, realSource: this, };
				});
				const consequences : SourcedConditionalEffect["consequences"] = eff.consequences.map( cons => { return { ...cons, owner: sourceActorAcc, source: this, realSource: this, };
				});
				return {
					...eff,
					conditions,
					consequences,
					owner: sourceActorAcc,
					source: this,
					realSource: this,
				};
			});
		if (CETypes == undefined || CETypes.length == 0){
			return effectsArrModified
				.map( x=> new ConditionalEffectC(x, this, sourceActor, this));
		}
		return effectsArrModified
			.filter( x=> CETypes.includes(x.conditionalType))
			.map( x=> new ConditionalEffectC(x, this, sourceActor, this));
	}

	get accessor() : UniversalAEAccessor<this> {
		return PersonaDB.getUniversalAEAccessor(this);
	}

	async createAnchoredHolder(duration: StatusDuration) : Promise<PersonaAE | null> {
		const origDuration = duration;
		switch (origDuration.dtype) {
			case "UEoNT":
			case "USoNT":
			case "UEoT": {
				const anchorHolderAcc = origDuration.actorTurn;
				if (!anchorHolderAcc) {return null;}
				const anchorHolder = PersonaDB.findActor(anchorHolderAcc);
				if (anchorHolder == this.parent) {return null;}
				const duration :StatusDuration = {
					dtype: origDuration.dtype,
					anchorStatus: this.accessor,
				};
				const anchored = {
					name: `Anchor for ${this.name}`,
				};
				try {
					const newEffect = (await  anchorHolder.createEmbeddedDocuments("ActiveEffect", [anchored]))[0] as PersonaAE;
					await newEffect.setDuration(duration);
					return newEffect;
				} catch (e) {
					if (!game.user.isGM) {
						PersonaError.softFail("Problems creating Anchor status, probably ownership issues");
					} else {
						PersonaError.softFail(`Unknown Error: ${(e as Error).toString()}`);
					}
					return null;
				}
			}
			default:
				PersonaError.softFail(`Wrong Duraton Type, can't create Anchored : ${origDuration.dtype}`);
				return null;
		}
	}

	/** when the statuses natural duration ends*/
	async endStatusTimeout() : Promise<void> {
		if (this.parent instanceof PersonaActor && this.parent.isValidCombatant()) {
			const activeDuration = game.combat && "amount" in this.statusDuration ? game.combat.round - this.duration.startRound : undefined ;
			const situation : Situation = {
				trigger: "on-active-effect-time-out",
				triggeringUser: game.user,
				activeEffect: this.accessor,
				user: this.parent.accessor,
				triggeringCharacter: this.parent.accessor,
				activeDuration
			};
			await TriggeredEffect.autoApplyTrigger("on-active-effect-time-out", this.parent, situation);
		}
	const duration = this.statusDuration;
	switch (duration.dtype) {
		case "USoNT":
		case "UEoNT":
		case "UEoT": {
			const acc = duration.anchorStatus;
			if (!acc) {break;}
			try {
				const anchorStatus = PersonaDB.findAE(acc);
				await anchorStatus?.endStatusTimeout();
			} catch (e) {
				console.log(e);
			}
			break;
		}
		default:
			break;
	}
	await this.delete();
	}

	async onAEDelete() : Promise<void> {
		if (!game.user.isGM) {return;}
		if (this.parent instanceof PersonaActor && this.parent.isValidCombatant()) {
			const activeDuration = game.combat && "amount" in this.statusDuration ? game.combat.round - this.duration.startRound : undefined ;
			const situation : Situation = {
				trigger: "on-active-effect-end",
				triggeringUser: game.user,
				activeEffect: this.accessor,
				user: this.parent.accessor,
				triggeringCharacter: this.parent.accessor,
				activeDuration
			};
			await TriggeredEffect.autoApplyTrigger("on-active-effect-end", this.parent, situation);
		}
		const duration = this.statusDuration;
		switch (duration.dtype) {
			case "USoNT":
			case "UEoNT":
			case "UEoT": {
				const acc = duration.anchorStatus;
				if (!acc) {break;}
				try {
					const anchorStatus = PersonaDB.findAE(acc);
					if (anchorStatus) {
						await anchorStatus.delete();
					}
				} catch (e) {
					console.log(e);
				}
				break;
			}
			default:
				break;
		}
	}

	/** returns true if the status expires*/
	async onStartCombatTurn() : Promise<boolean> {
		const duration = this.statusDuration;
		if (this.statuses.has("blocking")) {
			await this.endStatusTimeout();
			return true;
		}
		if (this.statuses.has("bonus-action")) {
			await this.endStatusTimeout();
			return true;
		}

		switch (duration.dtype) {
			case "instant":
				await this.endStatusTimeout();
				return true;
			case "X-rounds":
			case "3-rounds":
				if (this.duration.startRound + duration.amount >= (game.combat!.round ?? 0)) {
					return false;
				}
				await this.endStatusTimeout();
				return true;
			case "USoNT":
				await this.endStatusTimeout();
				return true;
			case "save": {
				const owner = this.parent;
				if (owner instanceof PersonaActor && owner.isSoloType()) {
					return await this.saveVsSaveEffects();
				}
				return false;
			}
			case "permanent":
			case "X-exploration-turns":
			case "expedition":
			case "combat":
			case "X-days":
			case "anchored":
			case "UEoNT":
			case "UEoT":
				return false;
			default:
				duration satisfies never;
				return false;
		}
	}

	removesOnKO() : boolean {
		const duration = this.statusDuration;
		if (duration.clearOnDeath) { return true;}
		if (this.statuses.size == 0) {return false;}
		if (this.statusDuration.dtype == "instant") {return false;}
		if (!this.durationLessThanOrEqualTo({ dtype: "combat"})) {return false;}
		return Array.from(this.statuses).some( st=> {
			const status = CONFIG.statusEffects.find( x=> x.id == st);
			if (st == "sticky") {return false;}
			const tags = status?.tags;
			if (!status || !tags) {return false;}
			if (tags.includes("identifier")) {return false;}
			if (tags.includes("fade")) {return false;}
			if (tags.includes("downtime")) {return false;}
			return true;
		});
	}

	async saveVsSaveEffects(): Promise<boolean> {
		const duration = this.statusDuration;
		switch (duration.dtype) {
			case "save":
				break;
			case "permanent":
			case "expedition":
			case "combat":
			case "X-exploration-turns":
			case "X-rounds":
			case "X-days":
			case "UEoNT":
			case "USoNT":
			case "UEoT":
			case "instant":
			case "3-rounds":
			case "anchored":
				return false;
			default:
				duration satisfies never;
				PersonaError.softFail(`Bad Duration ${(duration as StatusDuration).dtype}`);
				return false;
		}
		if (this.statuses.has("charmed")) {return false;}
		const actor = this.parent instanceof PersonaActor ? this.parent : null;
		if (!actor) {return false;}
		if (!actor.isValidCombatant()) {return false;}
		const DC = this.statusSaveDC;
		const bundle = await PersonaRoller.rollSave(actor, { DC, label: this.name, saveVersus: this.statusId, rollTags: [] } );
		if (bundle.success) { await this.endStatusTimeout();}
		await bundle.toModifiedMessage(true);
		return bundle.success ?? false;
	}



	/** returns true if the status expires*/
	async onEndCombatTurn() : Promise<boolean> {
		const duration = this.statusDuration;
		switch (duration.dtype) {
			case "UEoNT":
				duration.dtype = "UEoT";
				await this.setDuration(duration);
				return false;
			case "UEoT":
				await this.delete();
				return true;
			case "save":
				return await this.saveVsSaveEffects();
			case "permanent":
			case "expedition":
			case "X-exploration-turns":
			case "combat":
			case "X-rounds":
			case "X-days":
			case "USoNT":
			case "instant":
			case "3-rounds":
			case "anchored":
				return false;
			default:
				duration satisfies never;
				PersonaError.softFail(`Weird Duration: ${(duration as StatusDuration)?.dtype}`);
				return false;
		}
	}

	async onKO() {
		if (this.removesOnKO()) {
			await this.delete();
			return true;
		}
		return false;
	}

	async onEndDay(): Promise<boolean> {
		const duration = this.statusDuration;
		switch (duration.dtype) {
			case "X-days":
				if (duration.amount <= 0) {
					await this.delete();
					return true;
				}
				duration.amount -= 1;
				await this.setDuration(duration);
				return false;
			case "anchored":
			case "permanent":
				return false;
			case "expedition":
			case "combat":
			case "X-rounds":
			case "X-exploration-turns":
			case "USoNT":
			case "save":
			case "UEoNT":
			case "UEoT":
			case "instant":
			case "3-rounds":
				await this.delete();
				return true;
			default:
				duration satisfies never;
				return false;
		}
	}

	async onEndSocialTurn(): Promise<boolean> {
		const duration = this.statusDuration;
		switch (duration.dtype) {
			case "X-days":
			case "anchored":
			case "permanent":
				return false;
			case "X-exploration-turns":
			case "expedition":
			case "combat":
			case "X-rounds":
			case "USoNT":
			case "save":
			case "UEoNT":
			case "UEoT":
			case "instant":
			case "3-rounds":
				await this.delete();
				return true;
			default:
				duration satisfies never;
				return false;
		}
	}

	async onEndCombat() : Promise<void> {
		const dur: StatusDuration = {
			dtype: "combat"
		};
		if (this.durationLessThanOrEqualTo(dur)) {
			await this.delete();
		}
	}

	async onMetaverseTimeAdvance() : Promise<boolean> {
		const duration = this.statusDuration;
		switch (duration.dtype) {
			case "X-days":
			case "anchored":
			case "permanent":
			case "expedition":
				return false;
			case "X-exploration-turns":
				if (duration.amount <= 0) {
					await this.delete();
					return true;
				}
				duration.amount -= 1;
				await this.setDuration(duration);
				return false;
			case "combat":
			case "X-rounds":
			case "USoNT":
			case "save":
			case "UEoNT":
			case "UEoT":
			case "instant":
			case "3-rounds":
				await this.delete();
				return true;
			default:
				duration satisfies never;
				return false;
		}
	}

		async onCalendarAdvance() : Promise<boolean> {
		const duration = this.statusDuration;
			if (duration.dtype == "X-days") {
				if (duration.amount <= 0) {
					await this.delete();
					return true;
				}
				duration.amount -= 1;
				await this.setDuration(duration);
				return false;
				;
			}
			if (this.durationLessThanOrEqualTo({dtype: "X-days", amount: 0})) {
				await this.delete();
				return true;
			}
			return false;
		}

	get isFatigueStatus(): boolean {
		return this.getFatigueStatus() != undefined;
	}

	getFatigueStatus() : FatigueStatusId | undefined {
		for (const x of this.statuses.keys()) {
			if (statusMap.get(x)?.tags?.includes("fatigue")) {
				return x as FatigueStatusId;
			}
		}
		return undefined;
	}

	durationLessThanOrEqualTo(x : StatusDuration): boolean {
		return PersonaAE.durationLessThanOrEqualTo(this.statusDuration, x);
	}

	static durationLessThanOrEqualTo (a: StatusDuration, b: StatusDuration): boolean {
		return  PersonaAE.getStatusValue(a) <= PersonaAE.getStatusValue(b);
	}

	get statusId() : StatusEffectId | undefined {
		for (const status of this.statuses) {
			return status;
		}
		return undefined;
	}

	get isStatus() : boolean {
		return this.statuses.size > 0;
	}


	get isDowntimeStatus(): boolean {
		if (this.statuses.size < 1) {return false;}
		const downtime = CONFIG.statusEffects.filter(x => x.tags.includes("downtime"));
		return downtime.some( st => this.statuses.has(st.id as StatusEffectId) );
	}

	static getStatusValue (duration : StatusDuration) : number {
		switch (duration?.dtype) {
			case "permanent":
			case undefined: //custom statuses player added
			case "anchored":
				return Infinity;
			case "X-days":
				return 101 + duration.amount * 100;
			case "expedition":
				return 100;
			case "X-exploration-turns":
				return 51 + (duration.amount * .01);
			case "combat":
				return 50;
			case "3-rounds":
			case "X-rounds":
				return 8 + (duration.amount * .01);
			case "save":
				switch (duration.saveType) {
					case "hard":
						return 6;
					case "normal":
						return 5;
					case "easy":
						return 4;
					default:
						duration.saveType satisfies never;
						PersonaError.softFail(`Unknown duration type ${duration.saveType as string}`);
						return 4;
				}
			case "UEoNT":
				return 3;
			case "USoNT":
				return 2;
			case "UEoT":
				return 1;
			case "instant":
				return 1;
			default:
				duration satisfies never;
				PersonaError.softFail(`Unknwon duration ${duration as string}`);
				return 100;
		}
	}

	get linkedFlagId() : undefined | string {
		return this.getFlag<string>("persona", "linkedEffectFlag") ?? undefined;
	}

	async linkToEffectFlag( flagId: string) {
		await this.setFlag("persona", "linkedEffectFlag", flagId);
	}


	hasEffects() : boolean {
		return this.getEffects(null).length > 0;
	}

	getEffects(sourceActor: Option<PersonaActor>, options:GetEffectsOptions = {}): ConditionalEffectC[] {
		if (!sourceActor) {
			sourceActor = this.parent instanceof PersonaActor ? this.parent : sourceActor;
		}
		const actor = this.parent instanceof PersonaActor ? this.parent : null;
		return this.getLinkedTags().flatMap( tag => tag.getEffects(sourceActor, options))
		.concat(
			this.getEmbeddedEffects(actor, options)
		);
	}




	static async onPreDelete(this: never, effect: PersonaAE) {
		const flag = effect.linkedFlagId;
		try {
			// await effect.unsetFlag("persona", "LinkedEffectFlag");
		} catch (e)  {
			console.log(e);
		}
		if (flag && effect.parent instanceof PersonaActor) {
			effect["_flaggedDeletion"] = true;
			await effect.parent.setEffectFlag({flagId: flag, state: false});
		}
	}

	get statusSaveDC(): number {
		if (this.statusDuration.dtype != "save") {
			return 2000;
		}
		switch (this.statusDuration.saveType) {
			case "hard":
				return 16;
			case "normal":
				return 11;
			case "easy":
				return 6;
			default:
				this.statusDuration.saveType satisfies never;
				return 1000;
		}
	}

	async markAsFlag(id: string) {
		await this.setFlag("persona", "flagId", id);
	}

	get flagId() : string | undefined {
		const flag = this.getFlag<string>("persona", "flagId");
		if (flag == undefined) {return undefined;}
		return flag.toLowerCase();
	}

	isFlag(flagId ? : string) : boolean {
		if (
			this.getFlag<string>("persona", "linkedEffectFlag") == undefined
			&& this.flagId == undefined
		)
		{return false;}
		if (!flagId)  {return true;}
		return flagId.toLowerCase() == this.flagId;
	}

	async AEtestEffect() {
		let changes= this.changes;
		changes = [
			{
				key: "",
				mode: CONST.ACTIVE_EFFECT_MODES.ADD,
				priority: 0,
				value: ""
			}
		];
		await this.update({"changes": changes});
	}

	getModifier(bonusTypes: ModifierTarget[] | ModifierTarget, sourceActor: PersonaActor | null = this.parent instanceof PersonaActor ? this.parent : null): ModifierListItem[] {
		return this.getLinkedTags().flatMap( tag => tag.getModifier(bonusTypes, sourceActor));
	}

	getLinkedTags() : Tag[] {
		const statusEffects = this.statuses.values().map( status =>  PersonaDB.allTagLinks().get(status))
			.filter( x=> x != undefined);
		return Array.from(statusEffects);
	}

}


// eslint-disable-next-line @typescript-eslint/unbound-method
Hooks.on("preDeleteActiveEffect", PersonaAE.onPreDelete);

// eslint-disable-next-line @typescript-eslint/unbound-method
Hooks.on("applyActiveEffect", PersonaAE.applyHook);

//Sachi told me to disable this because it sucks apparently
CONFIG.ActiveEffect.legacyTransferral = false;

export type StatusDuration = (StatusDuration_Basic | StatusDuration_NonBasic) & DurationOptions;

type StatusDuration_Basic = {
	dtype: Exclude<StatusDurationType, StatusDuration_NonBasic["dtype"] | DeprecatedDurations["dtype"]>;
};

type StatusDuration_NonBasic = Numeric_Duration
	|  TurnEndDuration
	| SaveDuration
	| AnchoredStatus

type Numeric_Duration = {
	dtype : Extract<StatusDurationType, "3-rounds" | "X-rounds" | "X-days" | "X-exploration-turns">
	amount: number,
}

export type TurnEndDuration = {
	dtype : Extract<StatusDurationType, "UEoNT" | "USoNT" | "UEoT">,
	actorTurn ?: UniversalActorAccessor<PersonaActor>,
	anchorStatus ?: UniversalAEAccessor<PersonaAE>,
};

type SaveDuration = {
	dtype: "save",
	saveType : "easy" | "normal" | "hard",
};

type DeprecatedDurations = {
	dtype: Extract<StatusDurationType, "presave-easy" | "presave-hard" | "presave-normal" | "save-normal" | "save-easy" | "save-hard">
}

type AnchoredStatus = {
	dtype: Extract<StatusDurationType, "anchored">,
	anchor : UniversalAEAccessor<PersonaAE>,
}


Hooks.on("createActiveEffect", async function (eff: PersonaAE) {
	if (eff.isFatigueStatus) {
		const parent = eff.parent;
		if (parent instanceof PersonaActor) {
			await parent.setAlteredFatigue();
		}
	}
});

Hooks.on("deleteActiveEffect", async function (eff: PersonaAE) {
	if (!game.user.isGM) {return;}
	if (eff.isFatigueStatus) {
		const parent = eff.parent;
		if (parent instanceof PersonaActor) {
			await parent.setAlteredFatigue();
		}
	}
	await eff.onAEDelete();

});


type DurationOptions = {
	clearOnDeath?: boolean;

}

//@ts-expect-error adding to global scope
window.testAE = async function testAE(actor: PersonaActor, name : string = "TEST") {
	const flag = await actor.createEffectFlag(name, name);
	const changes : Foundry.AEChange[] = [
		{
			key: "courage",
			mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
			value: "system.skills.courage",
			priority: 0,
		}, {
			key: "courage",
			mode: CONST.ACTIVE_EFFECT_MODES.ADD,
			value: "system.skills.diligence",
			priority: 1,
		}
	];
	await flag.update({"changes": changes});
};

