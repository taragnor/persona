import { FatigueStatusId } from "../config/status-effects.js";
import { statusMap } from "../config/status-effects.js";
import { PersonaDB } from "./persona-db.js";
import { PC } from "./actor/persona-actor.js";
import { Shadow } from "./actor/persona-actor.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { UniversalAEAccessor } from "./utility/db-accessor.js";
import { UniversalActorAccessor } from "./utility/db-accessor.js";
import { StatusDurationType } from "../config/status-effects.js";
import { PersonaItem } from "./item/persona-item.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaError } from "./persona-error.js";
import { StatusEffectId } from "../config/status-effects.js";


export class PersonaAE extends ActiveEffect<PersonaActor, PersonaItem> {

	declare statuses: Set<StatusEffectId>;

	static async applyHook (_actor: PersonaActor, _change: Foundry.AEChange, _current: any, _delta: any, _changes: Record<string, any> ) {
		//*changes object is a record of valeus taht may get changed by applying the AE;
		// example: changes["system.hp"] = 25
	}

	get displayedName() {
		return game.i18n.localize(this.name);
	}

	get potency(): number {
		try {
			const potency = Number(this.getFlag<string>("persona", "potency"));
			return potency ?? 0;
		} catch (e) {
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
			} as any;
		}
		return duration;
	}

	statusHasTag(tag: StatusEffectObject["tags"][number]): boolean {
		for (const status of this.statuses) {
			const stData = statusMap.get(status);
			if (!stData) continue;
			const tags = stData.tags;
			if (tags.includes(tag))
				return true;
		}
		return false;
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
		if (duration.anchorStatus) return;
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

	async setDuration(duration: StatusDuration) : Promise<void> {
		if (duration.dtype == "UEoNT") {
			this.durationFix(duration);
		}
		switch (duration.dtype) {
			case "UEoNT":
			case "USoNT":
			case "UEoT":
				if (duration.anchorStatus) {break;}
				if (!duration.actorTurn) {break;}
				const actorTurn = PersonaDB.findActor(duration.actorTurn);
				if (actorTurn == this.parent) {break;}
				const anchor = await this.createAnchoredHolder(duration);
				if (!anchor) {break;}
				const newDuration : StatusDuration = {
					dtype: "anchored",
					anchor: anchor.accessor,
				}
				await this.setFlag("persona", "duration", newDuration);
				return;
			default:
				break;

		}
		await this.setFlag("persona", "duration", duration);
	}

	get accessor() : UniversalAEAccessor<this> {
		return PersonaDB.getUniversalAEAccessor(this);
	}

	async createAnchoredHolder(duration: StatusDuration) : Promise<PersonaAE | null> {
		const origDuration = duration;
		switch (origDuration.dtype) {
			case "UEoNT":
			case "USoNT":
			case "UEoT":
				const anchorHolderAcc = origDuration.actorTurn;
				if (!anchorHolderAcc) return null;
				const anchorHolder = PersonaDB.findActor(anchorHolderAcc);
				if (anchorHolder == this.parent) return null;
				const duration :StatusDuration = {
					dtype: origDuration.dtype,
					anchorStatus: this.accessor,
				}
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
						PersonaError.softFail(`Unknown Error: ${e.toString()}`)
					}
					return null;
				}
			default:
				PersonaError.softFail(`Wrong Duraton Type, can't create Anchored : ${origDuration.dtype}`);
				return null;
		}
	}

	/** returns true if the status expires*/
	async onStartCombatTurn() : Promise<boolean> {
		const duration = this.statusDuration;
		switch (duration.dtype) {
			case "instant":
				await this.delete();
				return true;
			case "X-rounds":
			case "3-rounds":
				if (duration.amount <= 0) {
					await this.delete();
					return true;
				}
				duration.amount -= 1;
				await this.setDuration(duration);
				return false;
			case "USoNT":
				await this.delete();
				return true;
			case "save":
				const owner = this.parent;
				if (owner instanceof PersonaActor && owner.isSoloType()) {
					return await this.saveVsSaveEffects();
				}
				return false;
			case "permanent":
			case "expedition":
			case "combat":
			case "X-rounds":
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

	removesOnDown() : boolean {
		if (this.statuses.size == 0) return false;
		if (this.statusDuration.dtype == "instant") return false;
		if (!this.durationLessThanOrEqualTo({ dtype: "combat"})) return false;
		return Array.from(this.statuses).some( st=> {
			const status = CONFIG.statusEffects.find( x=> x.id == st)
			const tags = status?.tags;
			if (!status || !tags) return false;
			if (tags.includes("fade")) return false;
			if (tags.includes("downtime")) return false;
			return true;
		});
	}

	async saveVsSaveEffects(): Promise<boolean> {
		const duration = this.statusDuration;
		if (duration.dtype != "save") {return false;}
		if (this.statuses.has("charmed")) return false;
		const actor = this.parent instanceof PersonaActor ? this.parent : null;
		if (!actor) return false;
		if (actor.isValidCombatant()) {return false;}
		const DC = this.statusSaveDC;
		const {success} = await PersonaCombat.rollSave(actor as (PC | Shadow), { DC, label: this.name, saveVersus: this.statusId })
		if (success) { await this.delete();}
		return success;
	}

	override async delete() {
		const duration = this.statusDuration;
		switch (duration.dtype) {
			case "USoNT":
			case "UEoNT":
			case "UEoT":
				const acc = duration.anchorStatus;
				if (!acc) break;
				const anchorStatus = PersonaDB.findAE(acc);
				await anchorStatus?.delete();
				break;
			default:
				break;
		}
		super.delete();
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
				return false;
		}
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
		return  PersonaAE.getStatusValue(this.statusDuration) <= PersonaAE.getStatusValue(x);
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
		if (this.statuses.size < 1) return false;
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
				return duration.amount * 100;
			case "expedition":
				return 100;
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
						PersonaError.softFail(`Unknown duration type ${duration.saveType}`);
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
				PersonaError.softFail(`Unknwon duration ${duration}`);
				return 100;
		}
	}

	get linkedFlagId() : undefined | string {
		return this.getFlag<string>("persona", "linkedEffectFlag") ?? undefined;
	}

	async linkToEffectFlag( flagId: string) {
		await this.setFlag("persona", "linkedEffectFlag", flagId);
	}

	static async onPreDelete(effect: PersonaAE) {
		const flag = effect.linkedFlagId;
		try {
			// await effect.unsetFlag("persona", "LinkedEffectFlag");
		} catch (e)  {
			console.log(e);
		}
		if (flag && effect.parent instanceof PersonaActor) {
			(effect as any)["_flaggedDeletion"] = true;
			await effect.parent.setEffectFlag(flag, false);
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
		if (flag == undefined) return flag;
		return flag.toLowerCase();
	}

	isFlag(flagId ? : string) : boolean {
		if (
			this.getFlag<string>("persona", "linkedEffectFlag") == undefined
			&& this.flagId == undefined
		)
			return false;
		if (!flagId)  return true;
		return flagId.toLowerCase() == this.flagId;
	}

	AEtestEffect() {
		let changes= this.changes;
		changes = [
			{
				key: "",
				mode: CONST.ACTIVE_EFFECT_MODES.ADD,
				priority: 0,
				value: ""
			}
		];
		this.update({"changes": changes});
	}

}

Hooks.on("preDeleteActiveEffect", PersonaAE.onPreDelete);

Hooks.on("applyActiveEffect", PersonaAE.applyHook);

//Sachi told me to disable this because it sucks apparently
CONFIG.ActiveEffect.legacyTransferral = false;

export type StatusDuration = StatusDuration_Basic | StatusDuration_NonBasic;

type StatusDuration_Basic = {
	dtype: Exclude<StatusDurationType, StatusDuration_NonBasic["dtype"] | DeprecatedDurations["dtype"]>;
};

type StatusDuration_NonBasic = Numeric_Duration
	|  TurnEndDuration
	| SaveDuration
	| AnchoredStatus

type Numeric_Duration = {
	dtype : Extract<StatusDurationType, "3-rounds" | "X-rounds" | "X-days">
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
	if (eff.isFatigueStatus) {
		const parent = eff.parent;
		if (parent instanceof PersonaActor) {
			await parent.setAlteredFatigue();
		}
	}
});

