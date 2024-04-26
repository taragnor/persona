import { Helpers } from "./utility/helpers.js";

const SOUNDS = {

	"fire": "",
	"absorb": "atk-absorb.m4a.mp3",
	"dark": "atk-dark.m4a.mp3",
	"heal": "atk-heal.m4a.mp3",
	"cold": "atk-ice.m4a.mp3",
	"light": "atk-light.m4a.mp3",
	"debuff": "atk-debuff.m4a.mp3",
	"block": "atk-block.m4a.mp3",
	"physical": "atk-phys.m4a.mp3",
	"buff": "atk-buff.m4a.mp3",
	"raise": "atk-raise-dead.m4a.mp3",
	"reflect": "atk-reflect.m4a.mp3",
	"lightning": "atk-thunder.m4a.mp3",
	"wind": "atk-wind.m4a.mp3",
	"miss": "",
	"all-out prompt": "atk-all-out-prompt.mp3"

} as const;


export class PersonaSounds {

	static async play(filename: string, volume = 1.0, recipients:string[] | false =[]) {
		if (!filename) return;
		const socketOpts = (recipients && recipients.length) ? { recipients} : false;
		const src  = `systems/persona/sound/${filename}`;
		return await AudioHelper.play( {
			src,
			volume,
			loop: false
		}, socketOpts);
	}

	static async newSocialLink() {
		await PersonaSounds.play("newsociallink2.wav.mp3", 1.0, game.users.contents.map( x=> x.id));
	}

	static async socialLinkUp() {
		await PersonaSounds.play("sociallinkrankup.wav.mp3", 1.0, game.users.contents.map( x=> x.id));

	}

	static async socialLinkMax() {
		await PersonaSounds.play("sociallinkmax.wav.mp3", 1.0, game.users.contents.map( x=> x.id));

	}
	static async socialBoostJingle(amt: 1 | 2 | 3) {
		await PersonaSounds.play(`sociallinkjingle${String(amt)}.wav.mp3`, 1.0, game.users.contents.map( x=> x.id));

	}

	static async socialLinkReverse() {
		await PersonaSounds.play(`sociallinkreverse.wav.mp3`, 1.0, game.users.contents.map( x=> x.id));
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
