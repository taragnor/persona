export class PersonaSounds {

	static async play(filename: string, volume = 1.0, recipients:string[] =[]) {
		const socketOpts = (recipients.length) ? { recipients} : false;
		const src  = `systems/persona/sound/${filename}`;
		await AudioHelper.play( {
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

}

//@ts-ignore
window.PersonaSounds = PersonaSounds;
