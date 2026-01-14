import { waitUntilTrue } from "./utility/async-wait.js";
import { Helpers } from "./utility/helpers.js";

const SOUNDS = {

	"fire": "atk-fire.mp3",
	"absorb": "atk-absorb.m4a.mp3",
	"dark": "atk-dark.m4a.mp3",
	"heal": "atk-heal.m4a.mp3",
	"cold": "atk-ice.mp3",
	"light": "atk-light.m4a.mp3",
	"debuff": "atk-debuff.mp3",
	"block": "atk-block.m4a.mp3",
	"physical": "atk-blunt.mp3",
	"buff": "atk-buff.m4a.mp3",
	"raise": "atk-raise-dead.m4a.mp3",
	"reflect": "atk-reflect.m4a.mp3",
	"lightning": "atk-lightning.mp3",
	"gun-single": "gun-single-shot.mp3",
	"gun-auto": "gun-auto.mp3",
	"wind": "atk-wind.m4a.mp3",
	"miss": "",
	"all-out prompt": "atk-all-out-prompt.mp3",
	"all-out" : "atk-all-out.mp3",
	"untyped": "atk-almighty.mp3",
	"defense-nerf": "atk-debuff.mp3",
	"attack-nerf": "atk-debuff.mp3",
	"damage-nerf": "atk-debuff.mp3",
	"scan": "scan.mp3",
	"level-up": "P4 Level up.mp3",
} as const;


export type ValidSound = keyof typeof SOUNDS;



export class PersonaSounds {

	static async init() {
		for  (const src of Object.values(SOUNDS)) {
			if (src) {
				await this.preloadSnd(src);
			}
		}
	}


	static FXVolume() : number {
		return game.settings.get("core", "globalAmbientVolumen");
	}

	static async playFileAll(src: string, volume= 1.0): Promise<void> {
		const recipients = game.users
		.filter (x=>x.active)
		.map (x => x.id);
		const sound = await this.playFree(src, volume, recipients);
		if (sound) {
			await waitUntilTrue( () => !sound.playing);
		}
	}

	static async playFileSelf(src: string, volume= 1.0): Promise<void> {
		const recipients = [game.user.id];
		const sound = await this.playFree(src, volume, recipients);
		if (sound) {
			await waitUntilTrue( () => !sound.playing);
		}
	}

	static async playFile(src: string, volume= 1.0, recipients: string[] | false = []): Promise<void> {
		const sound = await this.playFree(src, volume, recipients);
		if (sound) {
			await waitUntilTrue( () => !sound.playing, 25);
		}
	}

	static async preloadSnd(filename: string) {
		const src  = `systems/persona/sound/${filename}`;
		return foundry.audio.AudioHelper.preloadSound(src);
	}

	static async play(filename: string, volume = 1.0, recipients:string[] | false =[]) : Promise<void> {
		if (!filename) {return;}
		const src  = `systems/persona/sound/${filename}`;
		return this.playFile(src, volume, recipients);
	}

	static async playFree(filename: string, volume = 1.0, recipients:string[] | false =[]): Promise<FOUNDRY.AUDIO.Sound | undefined> {
		try {
			if (!filename) {return;}
			const socketOpts = (recipients && recipients.length) ? { recipients} : false;
			const src = filename;
			console.debug(`playing ${src}`);
			const sound = await foundry.audio.AudioHelper.play( {
				src,
				volume,
				loop: false
			}, socketOpts);
			return sound;
		} catch  {
			const msg =`Trouble playing sound ${filename}`;
			ui.notifications.error(msg);
			console.warn(msg);
		}

	}

	static isValidSound(s: string): s is ValidSound {
		return s in SOUNDS;
	}

	static async newSocialLink() {
		return await PersonaSounds.play("newsociallink2.wav.mp3", 1.0, game.users.contents.map( x=> x.id));
	}

	static async socialLinkUp() {
		return await PersonaSounds.play("sociallinkrankup.wav.mp3", 1.0, game.users.contents.map( x=> x.id));

	}

	static async socialLinkMax() {
		return await PersonaSounds.play("sociallinkmax.wav.mp3", 1.0, game.users.contents.map( x=> x.id));

	}
	static async socialBoostJingle(amt: 1 | 2 | 3) {
		return await PersonaSounds.play(`sociallinkjingle${String(amt)}.wav.mp3`, 1.0, game.users.contents.map( x=> x.id));

	}

	static async socialLinkReverse() {
		return await PersonaSounds.play(`sociallinkreverse.wav.mp3`, 1.0, game.users.contents.map( x=> x.id));
	}

	static async skillBoost (amt: 1 | 2 | 3) {
		for (let i = 0; i< amt; i++) {
			await PersonaSounds.play(`skillup.mp3`, 1.0, game.users.contents.map( x=> x.id));
			await Helpers.sleep(1);
		}
	}

	static async ching() {
			return await PersonaSounds.play(`ching.mp3`, 1.0, game.users.contents.map( x=> x.id));
	}

	static async playBattleSound(sound: keyof typeof SOUNDS, volume = 1.0) {
		const fname = SOUNDS[sound];
		return await PersonaSounds.play(fname, volume, game.users.contents.map(x=> x.id));
	}

}

Hooks.on("ready",function () {void PersonaSounds.init();});

//@ts-expect-errora putting this in global for debugging purposes
window.PersonaSounds = PersonaSounds;
