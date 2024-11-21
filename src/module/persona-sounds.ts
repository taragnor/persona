import { waitUntilTrue } from "./utility/async-wait.js";
import { Helpers } from "./utility/helpers.js";

const SOUNDS = {

	"fire": "",
	"absorb": "atk-absorb.m4a.mp3",
	"dark": "atk-dark.m4a.mp3",
	"heal": "atk-heal.m4a.mp3",
	"cold": "atk-ice.m4a.mp3",
	"light": "atk-light.m4a.mp3",
	"debuff": "atk-debuff.mp3",
	"block": "atk-block.m4a.mp3",
	"physical": "atk-blunt.mp3",
	"buff": "atk-buff.m4a.mp3",
	"raise": "atk-raise-dead.m4a.mp3",
	"reflect": "atk-reflect.m4a.mp3",
	"lightning": "atk-thunder.m4a.mp3",
	"wind": "atk-wind.m4a.mp3",
	"miss": "",
	"all-out prompt": "atk-all-out-prompt.mp3",
	"all-out" : "atk-all-out.mp3",
	"untyped": "atk-almighty.mp3",
	"defense-nerf": "atk-debuff.mp3",
	"attack-nerf": "atk-debuff.mp3",
	"damage-nerf": "atk-debuff.mp3",
	"scan": "scan.mp3",
} as const;

export type ValidSound = keyof typeof SOUNDS;


export class PersonaSounds {

	static async play(filename: string, volume = 1.0, recipients:string[] | false =[]) : Promise<void> {
		if (!filename) return;
		console.debug(`playing ${filename}`);
		const socketOpts = (recipients && recipients.length) ? { recipients} : false;
		const src  = `systems/persona/sound/${filename}`;
		try {
		const sound = await foundry.audio.AudioHelper.play( {
			src,
			volume,
			loop: false
		}, socketOpts);
		if (sound) {
				await waitUntilTrue( () => !sound.playing);
		}
		} catch (e) {
			ui.notifications.error(`Trouble playing sound ${filename}`);
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

//@ts-ignore
window.PersonaSounds = PersonaSounds;
