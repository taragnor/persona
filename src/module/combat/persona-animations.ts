import {DAMAGE_LEVELS, RealDamageType} from "../../config/damage-types.js";
import {PersonaError} from "../persona-error.js";
import {PToken} from "./persona-combat.js";

export class PersonaAnimation {

	usable: Usable;
	damageType: RealDamageType;
	targets: PToken[];
	attacker: PToken;

	constructor (usable: Usable, damageType: RealDamageType, attacker : PToken, targets: PToken[] ) {
		this.usable = usable;
		this.damageType = damageType;
		this.targets = targets;
		this.attacker = attacker;
	}

	static async onUsePower(usableOrCard: UsableAndCard, damageType: RealDamageType,attacker: PToken,  targets: PToken[]) : Promise<void> {
		if (Sequence == undefined) {return;}
		if (usableOrCard.isSkillCard()) {return;}
		const anim = new PersonaAnimation(usableOrCard, damageType, attacker, targets);
		try {
			await anim.play();
		} catch(e) {
			PersonaError.softFail(`problem with animation`, e);
		}
	}

	get scale() {
		const baseScale =BASE_VALUES[this.damageType].scale;
		const scaleMult = this.usable.isPower() ? SCALE_MULT[this.usable.system.damageLevel] : SCALE_MULT["light"];
		return baseScale * scaleMult;
	}

	get duration() {
		return BASE_VALUES[this.damageType].duration;
	}

	get fadeOut() {
		return BASE_VALUES[this.damageType].fadeOut;
	}

	get fadeIn() {
		return BASE_VALUES[this.damageType].fadeIn ?? 0;
	}

	get fileName() {
		return BASE_VALUES[this.damageType].fileName;
	}

	get isProjectile() {
		return BASE_VALUES[this.damageType].projectile ?? false;
	}

	get playbackRate() {
		return BASE_VALUES[this.damageType].playbackRate ?? 0;
	}

	get filename() {
		return BASE_VALUES[this.damageType].fileName ?? "";
	}

	get animData() {
		return BASE_VALUES[this.damageType];
	}

	async play() {
		if (this.damageType == "all-out") {
			return this.allOutAttack();
		}
		if (this.fileName == "" || this.scale == 0) {return;}
		const promises = this.targets.map( token=>
			this.isProjectile
			? this.projectileAnimation(this.attacker, token)
			: this.basicAnimationOnTarget(token)
		)
			.map( x=> x.play());
		;
		await Promise.allSettled(promises);
	}

	async allOutAttack() {
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


	fromAnimationData(data: BasicAnimationData, target: PToken) {
		if (data.fileName.length == 0) {throw new PersonaError("Bad animation, no filename");}
		const locationData =  this.animData.randomOffsetPercent
			? {randomOffset: this.animData.randomOffsetPercent}
			: {};
		return new Sequence() .effect()
			.file(data.fileName)
			.scale(data.scale)
			.duration(data.duration)
			.fadeOut(data.fadeOut)
			.fadeIn(data.fadeIn ?? 0)
			.opacity(data.opacity ?? 1)
			.playbackRate(data.playbackRate ?? 1)
			.atLocation(target, locationData);
	}

	loadAnimationData () {
		return new Sequence() .effect()
			.file(this.filename)
			.scale(this.scale)
			.duration(this.duration)
			.fadeOut(this.fadeOut)
			.fadeIn(this.fadeIn)
			.opacity(this.animData.opacity ?? 1)
			.playbackRate(this.playbackRate);
	}

	basicAnimationOnTarget(target: TokenDocument | Token) {
		const locationData =  this.animData.randomOffsetPercent
			? {randomOffset: this.animData.randomOffsetPercent}
		: {};
		return this.loadAnimationData()
			.atLocation(target, locationData);
	}

	projectileAnimation (source: TokenDocument | Token, target: TokenDocument | Token)  {
		return this.basicAnimationOnTarget(source)
			.stretchTo(target);
	}
}

interface BasicAnimationData {
	fileName: string;
	scale: number;
	duration: number;
	fadeOut: number;
	projectile?: boolean;
	fadeIn?: number;
	playbackRate?: number;
	randomOffsetPercent ?: number;
	opacity?: number;
}

const BASE_VALUES : Record<RealDamageType, BasicAnimationData> = {
	physical: {
		fileName: "jb2a.melee_attack.01.magic_sword.yellow.01",
		scale: 0.9,
		duration: 1000,
		fadeOut: 250,
	},
	gun: {
		fileName: "jb2a.ranged.01.projectile.01.dark_orange",
		scale: 1,
		duration: 500,
		fadeOut: 100,
		projectile: true,
	},
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
