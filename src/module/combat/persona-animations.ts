import {DAMAGE_LEVELS, RealDamageType} from "../../config/damage-types.js";
import {PersonaError} from "../persona-error.js";
import {AttackResult} from "./combat-result.js";
import {PToken} from "./persona-combat.js";

export class PersonaAnimation {

	usable: Usable;
	damageType: RealDamageType;
	targets: PToken[];
	attacker: PToken;
	result: AttackResult["result"];

	constructor (usable: Usable, damageType: RealDamageType, attacker : PToken, target: PToken, result: AttackResult["result"] ) {
		this.usable = usable;
		this.damageType = damageType;
		this.targets = [target];
		this.attacker = attacker;
		this.result = result;
	}

	static async onUsePower(usableOrCard: UsableAndCard, damageType: RealDamageType,attacker: PToken,  targets: PToken, result: AttackResult["result"]) : Promise<void> {
		if (Sequence == undefined) {return;}
		if (usableOrCard.isSkillCard()) {return;}
		const anim = new PersonaAnimation(usableOrCard, damageType, attacker, targets, result);
		try {
			switch(result) {
				case "hit":
				case "miss":
				case "crit":
					await anim.play();
					break;
				case "reflect":
				case "block":
				case "absorb":
					await anim.onResist();
			}
		} catch(e) {
			PersonaError.softFail(`problem with animation`, e);
		}
	}

	private async onResist() {
		switch (this.result) {
			case "absorb":
				await new Sequence().effect()
					.file(ABSORB)
					.duration(1000)
					.atLocation(this.target)
					.scaleToObject(1)
					.play();
				break;
			case "reflect":
				await new Sequence().effect()
					.file("jb2a.icon.shield.green")
					.duration(2000)
					.atLocation(this.target)
					.scaleToObject(1)
					.play();
				break;
			case "block": {
				const eff= new Sequence().effect()
				.file("jb2a.icon.shield.green")
				.duration(2000)
				.atLocation(this.target)
				.scaleToObject(1);
				await PersonaAnimation.appendScrollingText(eff, "BLOCK", this.target).delay(300).play();
				break;
			}
			case "miss":
				await PersonaAnimation.appendScrollingText(new Sequence(), "Miss", this.target).play();
				break;
			case "hit":
			case "crit":
				throw new PersonaError("Hit or Crit shoiuldn't be called in the resist context");
			default:
				this.result satisfies never;
		}
	}

	get target() { return this.targets.at(0)!;}

	// get scale() {
	// 	const baseScale =BASE_VALUES[this.damageType].scale;
	// 	const scaleMult = this.usable.isPower() ? SCALE_MULT[this.usable.system.damageLevel] : SCALE_MULT["light"];
	// 	return baseScale * scaleMult;
	// }

	// get duration() {
	// 	return BASE_VALUES[this.damageType].duration;
	// }

	// get fadeOut() {
	// 	return BASE_VALUES[this.damageType].fadeOut;
	// }

	// get fadeIn() {
	// 	return BASE_VALUES[this.damageType].fadeIn ?? 0;
	// }

	// get fileName() {
	// 	return BASE_VALUES[this.damageType].fileName;
	// }

	// get isProjectile() {
	// 	return BASE_VALUES[this.damageType].projectile ?? false;
	// }

	// get playbackRate() {
	// 	return BASE_VALUES[this.damageType].playbackRate ?? 0;
	// }

	// get filename() {
	// 	return BASE_VALUES[this.damageType].fileName ?? "";
	// }

	get animData() : BasicAnimationData[] {
		const x = BASE_VALUES[this.damageType];
		if (Array.isArray(x)) {return x;}
		return [x];
	}

	private async play() {
		if (this.damageType == "all-out") {
			return this.allOutAttack();
		}
		if (this.damageType == "none" && !this.usable.isInstantDeathAttack()) {
			return this.onSupportPower();
		}
		const promises = this.animData.flatMap( animData => {
			if (animData.fileName == "") {return [];}
			if (animData.hitOnly == true
				&& this.result != "hit"
				&& this.result != "crit"
			) {
				return [];
			}
			return this.targets.map( token=>
				animData.isProjectile
				? this.projectileAnimation(animData, this.attacker, token)
				: this.basicAnimationOnTarget(animData, token)
			)
				.map( x=> this.result == "miss" ? x.missed() : x)
				.map( x=> this.result == "crit" ? PersonaAnimation.appendCriticalHit(x) : x)
				.map ( x=> x.delay(500))
				.map( x=> x.play());
			;
		});
		await Promise.allSettled(promises);
	}

	static appendCriticalHit<T extends SequencerBase>(seq: T) {
		return seq.effect()
		.file(CRITICAL_HIT)
		.delay(750)
		.playbackRate(0.75)
		.scaleToObject(1.2)
		.aboveInterface();
	}

	private async onSupportPower() {
		const usable = this.usable;
		if (this.result != "hit" && this.result != "miss") {
			return;
		}
		switch (true) {
			case usable.hasTag("status-removal"):
				await new Sequence().effect()
					.atLocation(this.target)
					.file(SWIRLING_SPARKLES)
					.scaleToObject(1.5)
					.play();
				break;
			case usable.hasTag("buff"):
				await new Sequence().effect()
					.atLocation(this.target)
					.file(BUFF)
					.scaleToObject(1)
					.play();
				break;
			case usable.hasTag("debuff"):
				await new Sequence().effect()
					.atLocation(this.target)
					.file(DEBUFF)
					.scaleToObject(1)
					.play();
				break;
		}
	}

	private async allOutAttack() {
		const TOTAL_CYCLES = 5;
		const sequences : EffectProxy[] = [];
		for (let x = 0; x< TOTAL_CYCLES; ++x) {
			const cycleSeq = this.targets.flatMap( target =>
				ALL_OUT_ANIMATIONS
				.map( component => this.fromAnimationData(component, target))
				.map( anim => anim.randomSpriteRotation())
			)
				.map( seq => seq.delay(x * 900));
			sequences.push(...cycleSeq);
		}
		const promises = sequences.map (x=> x.play());
		await Promise.allSettled(promises);
	}


	private fromAnimationData(data: BasicAnimationData, target: PToken) {
		if (data.fileName.length == 0) {throw new PersonaError("Bad animation, no filename");}
		const locationData =  data.randomOffsetPercent
			? {randomOffset: data.randomOffsetPercent}
			: {};
		return this.loadAnimationData(data)
			.atLocation(target, locationData);
	}

	private loadAnimationData (animData: BasicAnimationData, sequence : SequencerBase = new Sequence()) {
		const scale = this.scale(animData);
		let seq = sequence.effect();
		seq= seq
			.file(animData.fileName)
			.fadeOut(animData.fadeOut ?? 0)
			.fadeIn(animData.fadeIn ?? 0)
			.opacity(animData.opacity ?? 1)
			.playbackRate(animData.playbackRate ?? 1);
		if (animData.duration) {
			seq = seq.duration(animData.duration);
		}
		if (animData.delay) {
			seq = seq.delay(animData.delay);
		}
		if (scale) {
			seq = seq.scale(scale);
		}
		if (animData.objectScale) {
			seq = seq.scaleToObject(animData.objectScale);
		}
		return seq;
	}

	scale(animData : BasicAnimationData) : U<number>{
		// const baseScale = BASE_VALUES[this.damageType].scale;
		const baseScale = animData.scale;
		if (!baseScale) {return undefined;}
		const scaleMult = this.usable.isPower() ? SCALE_MULT[this.usable.system.damageLevel] : SCALE_MULT["light"];
		return baseScale * scaleMult;
	}

	private basicAnimationOnTarget(animData: BasicAnimationData, target: TokenDocument | Token) {
		const locationData =  animData.randomOffsetPercent
			? {randomOffset: animData.randomOffsetPercent}
			: {};
		return this.loadAnimationData(animData)
			.atLocation(target, locationData);
	}

	private projectileAnimation (animData: BasicAnimationData, source: TokenDocument | Token, target: TokenDocument | Token)  {
		return this.basicAnimationOnTarget(animData, source)
			.stretchTo(target);
	}

	static async floatingDamageNumbers(target: PToken, hp_change: number) {
		if (hp_change == 0) {return;}
		const color = hp_change > 0 ? "green" : "red";
		const txt = String(Math.abs(hp_change));
		await this.appendScrollingText(new Sequence(), txt, target, color)
		.play();
	}

	static appendScrollingText<T extends SequencerBase>(seq: T, txt: string, location: PToken, color = "white") {
		const style = {
			fill: color,
			// fontFamily: "Arial Black",
			fontFamily: "Almendra",
			fontSize: 38,
			strokeThickness: 4,
		};
		return seq.scrollingText()
			.atLocation(location)
			.delay(300)
			.text(txt, style);
	}
}

interface BasicAnimationData {
	fileName: string;
	duration?: number;
	objectScale?: number;
	scale?: number;
	fadeOut?: number;
	isProjectile?: boolean;
	fadeIn?: number;
	playbackRate?: number;
	randomOffsetPercent ?: number;
	opacity?: number;
	hitOnly ?: boolean;
	delay ?: number;
}

const BASE_VALUES : Record<RealDamageType, BasicAnimationData | BasicAnimationData[] > = {
	physical: [{
		fileName: "jb2a.melee_attack.01.magic_sword.yellow.01",
		scale: 0.9,
		duration: 1000,
		fadeOut: 250,
	}, {
		fileName: "jb2a.impact",
		objectScale: 0.5,
		duration: 1000,
		fadeOut: 250,
		hitOnly: true,
		delay: 500,
	},

	],
	gun: [{
		fileName: "jb2a.ranged.01.projectile.01.dark_orange",
		scale: 1,
		duration: 500,
		fadeOut: 100,
		isProjectile: true,
	}, {
		fileName: "jb2a.impact",
		objectScale: 0.5,
		duration: 1000,
		fadeOut: 250,
		hitOnly: true,
		delay: 500,

	}],
	fire: {
		fileName: "jb2a.eruption.orange",
		scale: 0.2,
		duration: 1500,
		fadeOut: 500,
	},
	cold: {
		fileName: "jb2a.aura_themed.01.inward.complete.cold.01.blue",
		scale: 0.15,
		duration: 2250,
		fadeOut: 500,
	},
	wind: {
		fileName: "jb2a.whirlwind.bluegrey",
		scale: 0.2,
		duration: 3500,
		fadeOut: 750,
	},
	lightning: {
		fileName: "jb2a.lightning_strike",
		scale: 0.3,
		duration: 700,
		fadeOut: 100,
	},
	light: {
		fileName: "jb2a.sacred_flame.target.yellow",
		scale: 0.6,
		duration: 2500,
		fadeOut: 1250,
	},
	dark: {
		fileName: "jb2a.sphere_of_annihilation.600px.purple",
		scale: 0.15,
		duration: 1500,
		fadeOut: 1750,
	},
	untyped: {
		fileName: "jb2a.explosion.04.blue",
		scale: 0.7,
		duration: 1000,
		fadeOut: 300,
		fadeIn: 300,
		playbackRate: 0.6,
	},
	healing: {
		fileName: "jb2a.healing_generic.400px.green",
		scale: 0.4,
		duration: 2000,
		fadeOut: 750,
	},
	"all-out": {
		fileName: "",
		scale: 0,
		duration: 0,
		fadeOut: 0,
	},
	none: {
		fileName: "",
		scale: 0,
		duration: 0,
		fadeOut: 0,
	},
};

const ALL_OUT_ANIMATIONS : BasicAnimationData[] = [
	{
		fileName: "jb2a.flurry_of_blows.physical",
		scale: 1.0,
		duration: 1200,
		fadeOut: 250,
		randomOffsetPercent: 0.15,
	}, {
		fileName: "jb2a.impact.008.orange",
		scale: .4,
		duration: 500,
		fadeOut: 250,
		randomOffsetPercent: 0.15,

	}, {
		fileName: "jb2a.flurry_of_blows.physical",
		scale: 1.2,
		duration: 1000,
		fadeOut: 250,
		randomOffsetPercent: 0.15,
		playbackRate: 1.2,
	}, {
		fileName: "jb2a.flurry_of_blows.physical",
		scale: 1.1,
		duration: 1200,
		fadeOut: 250,
		randomOffsetPercent: 0.15,
		playbackRate: 0.8,
	}, {
		fileName: "jb2a.ambient_fog.001.loop.small.white",
		scale: 0.7,
		duration: 2500,
		fadeIn: 300,
		fadeOut: 300,
		randomOffsetPercent: 0.2,
		playbackRate: 1.0,
		opacity: 0.6,
	}

];

const SCALE_MULT : Record<keyof typeof DAMAGE_LEVELS, number> = {
	light: 0.75,
	none: 0,
	"-": 0,
	fixed: 1,
	miniscule: 0.5,
	basic: 0.6,
	medium: 1,
	heavy: 1.25,
	severe: 1.5,
	colossal: 1.8,
};


const BUFF = "jb2a.healing_generic.03.burst.bluegreen";

const ABSORB = "jb2a.cast_generic.01";
const IMPACT = "jb2a.impact";
const FIREWORK = "jb2a.firework";
const SWIRLING_SPARKLES = "jb2a.swirling_sparkles";

const MISS = "jb2a.ui.miss.white";
const CRITICAL_HIT = "jb2a.ui.critical.red";
const DEBUFF = "jb2a.cast_generic.sound.01";
