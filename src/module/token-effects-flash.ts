import {PersonaActor} from "./actor/persona-actor.js";
import {PersonaAE} from "./persona-ae.js";
import {PersonaToken} from "./persona-token.js";

export class TokenEffectsFlash {

  static init() {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const oldDrawEffect = Token.prototype._drawEffect;
    Token.prototype._drawEffect = async function (this: Token<PersonaActor>, src: string, tint: N<PIXI.ColorSource>) : Promise<U<PIXI.Sprite>> {
      const sprite = await (oldDrawEffect.call(this, src, tint) as ReturnType<typeof oldDrawEffect>);
      if (!sprite) {return sprite;}
      const arr = flashMap.get(this) ?? [];
      const effect= this.document.actor?.effects.find( eff=> eff.icon == src);
      if (!effect) {return sprite;}
      arr.push( [sprite, effect]);
      flashMap.set(this, arr);
      // Debug(sprite);
      return sprite;
    };
    // game.canvas.app.ticker.add( handleFlash);
  }

}

Hooks.on("ready", () => {
    game.canvas.app.ticker.add( handleFlash);
});

const flashMap : WeakMap<Token<PersonaActor>, ([PIXI.Sprite, PersonaAE])[]> = new WeakMap();

let time = 0;
function handleFlash( delta: number) : void {
  time += 0.05 * delta;
  game.scenes.current.tokens.forEach( (tok: PersonaToken) => {
    if (!tok.object) {return;}
    const sprites= flashMap.get(tok.object) ?? [];
    sprites.forEach( ([sprite, effect]) => {
      if (effect.aboutToExpire) {
        sprite.alpha = 0.5 + Math.sin(time) * 0.5;
      }
    });
  });
}

//@ts-expect-error adding to global scope
window.flashMap = flashMap;
