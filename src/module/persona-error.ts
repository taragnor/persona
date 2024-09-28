export class PersonaError extends Error {

	constructor (errortxt: string) {
		super(errortxt);
		ui.notifications.error(errortxt);
		console.error(errortxt);
	}

	static softFail(errortxt: string) {
		ui.notifications.error(errortxt);
		console.error(errortxt);
	}

}
