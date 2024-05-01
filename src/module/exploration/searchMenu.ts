import { HBS_TEMPLATES_DIR } from "../../config/persona-settings.js";
export class SearchMenu {

	static async searchOptionsDialogue() : Promise<SearchOptions> {
		let options = {
			treasureRemaining: 3,
			stopOnHazard: false,
			isHazard: false,
			isSecret: false
		};
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/dialogs/searchOptions.hbs`, {options});
		return await new Promise( (res , rej) => {
			const dialog = new Dialog( {
				title: "Search Options",
				content: html,
				close: () => rej ("Closed"),
				buttons: {
					submit: {
						label: "Submit",
						callback: (html: string) => {
							console.log(html);
							options.isSecret = $(html).find("#isSecret").is(":checked");
							options.isHazard = $(html).find("#isHazard").is(":checked");
							options.stopOnHazard = $(html).find("#stopOnHazard").is(":checked");
							options.treasureRemaining = Number($(html).find(".treasureRemaining").val());
							res(options);
						}
					}
				}
			}, {});
			dialog.render(true);
		});
	}

} // end of class


type SearchOptions = {
	treasureRemaining: number;
	stopOnHazard?: boolean;
	isHazard: boolean;
	isSecret: boolean;
}


