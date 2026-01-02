class Sequence implements SequencerBase {
	effect() : EffectProxy;
	scrollingText(): ScrollingTextProxy;
	play() : Promise<void>;
	delay(randomLow: number, randomHigh: number): this;
	delay(num: number): this;
}

interface SequencerBase {
	effect() : EffectProxy;
	play() : Promise<void>;
	delay(randomLow: number, randomHigh: number): this;
	delay(num: number): this;
	scrollingText(): ScrollingTextProxy;
}

interface EffectProxy extends SequencerBase {
	file(name: string) : this;
	atLocation(token: Token | TokenDocument, options?: LocationOptions) : this;
	scale(scale: number): this;
	duration(ms: number): this;
	/** persists until deleted */
	persist() : this;
	fadeIn(ms: number) : this;
	fadeOut(ms: number, options?: FadeOptions): this;
	/** used for ray effects this targets them*/
	stretchTo(token: Token | TokenDocument) : this;
	playbackRate(multipier: number): this;
	belowTokens(): this;
	scaleToObject(num: number): this;
	opacity(percent: num) : this;
	randomSpriteRotation() : this;
	aboveInterface(): this;
	screenSpace(): this;

	/** target a location near but not at the target*/
	missed(): this;
}

interface FadeOptions {
	ease: "linear",
	delay: number,
}

interface LocationOptions {
	randomOffset ?: number | boolean;
}

interface ScrollingTextProxy extends SequencerBase {
	text(txt: string, style?: TextStyle) : this;
	atLocation(token: Token | TokenDocument, options?: LocationOptions) : this;
}

interface TextStyle {
	/** color */
	"fill": string;
	"fontFamily": string;
	"fontSize": number;
	"strokeThickness": number;
}

