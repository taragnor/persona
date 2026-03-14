class Sequence {
	scrollingText(): ScrollingTextProxy;
	effect() : EffectProxy;
  sound() : SoundProxy;
	play(inOptions?: InOptions) : Promise<void>;
	delay(randomLow: number, randomHigh: number): this;
	delay(num: number): this;
	scrollingText(): ScrollingTextProxy;
	duration(ms: number): this;
	addSequence <T extends SequencerBase>( seq : T) : T;
}


interface EffectProxy extends Sequence {
	file(name: string) : this;
	atLocation(token: Token | TokenDocument, options?: LocationOptions) : this;
	scale(scale: number): this;
	/** persists until deleted */
	persist() : this;
	fadeIn(ms: number) : this;
	fadeOut(ms: number, options?: FadeOptions): this;
	/** used for ray effects this targets them*/
	stretchTo(token: Token | TokenDocument, options?: LocationOptions) : this;
	playbackRate(multipier: number): this;
	belowTokens(): this;
	scaleToObject(num: number): this;
	opacity(percent: num) : this;
	randomSpriteRotation() : this;
	aboveInterface(): this;
	screenSpace(): this;
	waitUntilFinished(timeOffset: number) : this;

	/** target a location near but not at the target*/
	missed(): this;
}

interface SoundProxy extends Sequence {
  file(name: string) : this;
  fadeInAudio(ms: number) : this;
  fadeOutAudio(ms: number) : this;
}

interface FadeOptions {
	ease: "linear",
	delay: number,
}

interface LocationOptions {
	randomOffset ?: number | boolean;
}

interface ScrollingTextProxy extends Sequence {
	text(txt: string, style?: TextStyle) : this;
	atLocation(token: Token | TokenDocument, options?: LocationOptions) : this;
}

interface InOptions {
  remote ?: boolean;
  preload ?: boolean;
  local ?: boolean;
}

interface TextStyle {
	/** color */
	"fill": string;
	"fontFamily": string;
	"fontSize": number;
	"strokeThickness": number;
}

