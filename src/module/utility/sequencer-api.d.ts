class Sequence {
	effect() : EffectProxy;
}

interface EffectProxy {
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
	delay(randomLow: number, randomHigh: number): this;
	delay(num: number): this;
	opacity(percent: num) : this;
	randomSpriteRotation() : this;
	aboveInterface(): this;
	screenSpace(): this;

	/** target a location near but not at the target*/
	missed(): this;
	play() : Promise<void>;
}

interface FadeOptions {
	ease: "linear",
	delay: number,
}

interface LocationOptions {
	randomOffset ?: number | boolean;

}
