import {PersonaActor} from "./actor/persona-actor.js";

export class PersonaToken extends TokenDocument<PersonaActor> {
	 DOWNED_OPACITY = 0.5 as const;
	 FULL_FADE_OPACITY = 0.2 as const;
	 _oldAlpha: U<number>;

	 // eslint-disable-next-line @typescript-eslint/no-explicit-any
	 constructor(...args: any[]) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			super(...args);
			if (this._oldAlpha == undefined) {
				 console.log(`Old alpha not set on ${this.name}`);
			}

	 }

	 override get alpha() : number{
			if (this.hidden) {return this.oldAlpha();}
			const actor = this.actor;
			if  (!actor || !actor.isValidCombatant()) {return this.oldAlpha();}
			const opacity = actor.hp > 0 ? 1.0 : (actor.isFullyFaded() ? this.FULL_FADE_OPACITY : this.DOWNED_OPACITY);
			if (opacity != 1 && opacity != this.DOWNED_OPACITY) {console.log( `{$this.name} OPacity is ${opacity}`);}
			return opacity;
	 }

	 private oldAlpha() : number {
			return this._oldAlpha ?? (this._source.alpha as number) ?? 1;
	 }

	 override set alpha(val: number) {
			if (Number.isNaN(val)) {
				 debugger;
			}
			console.log(`Setting Alpha on ${this.name} ${val}`);
			this._oldAlpha = val;
	 }

	 // override prepareBaseData() : void {
			// super.prepareBaseData();
			// this.setOpacity();
	 // }

	 // setOpacity() : void {
			// if (this.hidden) {return;}
			// const actor = this.actor;
			// if  (!actor || !actor.isValidCombatant()) {return;}
			// const opacity = actor.hp > 0 ? 1.0 : (actor.isFullyFaded() ? this.FULL_FADE_OPACITY : this.DOWNED_OPACITY);
			// this.alpha = opacity;
	 // }

}

Hooks.on( "updateActor", (actor : PersonaActor, diff) => {
	 if (!actor.isValidCombatant()) {return;}
	 if ((diff as typeof actor)?.system?.combat?.hp != undefined) {
			actor.getDependentTokens().forEach( tok => tok.object?.refresh());
	 }

});
