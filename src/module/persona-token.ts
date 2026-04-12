import {PersonaActor} from "./actor/persona-actor.js";
import {PersonaDB} from "./persona-db.js";
import {PersonaError} from "./persona-error.js";

export class PersonaToken extends TokenDocument<PersonaActor> {
	 DOWNED_OPACITY = 0.55 as const;
	 FULL_FADE_OPACITY = 0.20 as const;
	 _oldAlpha: U<number>;

	 override get alpha() : number{
			if (this.hidden) {return this.oldAlpha();}
			const actor = this.actor;
			if  (!actor || !actor.isValidCombatant()) {return this.oldAlpha();}
			const opacity = actor.hp > 0 ? 1.0 : (actor.isFullyFaded() ? this.FULL_FADE_OPACITY : this.DOWNED_OPACITY);
			return opacity;
	 }

	 private oldAlpha() : number {
			return this._oldAlpha ?? (this._source.alpha as number) ?? 1;
	 }

	get accessor() : UniversalTokenAccessor<typeof this> {
		return PersonaDB.getUniversalTokenAccessor(this);
	}
	 override set alpha(val: number) {
			if (Number.isNaN(val)) {
				 PersonaError.softFail("NaN result");
			}
			this._oldAlpha = val;
	 }
}

Hooks.on( "updateActor", (actor : PersonaActor, diff) => {
	 if (!actor.isValidCombatant()) {return;}
	 if ((diff as typeof actor)?.system?.combat?.hp != undefined) {
			actor.getDependentTokens().forEach( tok => tok.object?.refresh());
	 }

});
