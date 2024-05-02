import { PersonaError } from "../persona-error.js";
import { HTMLTools } from "../utility/HTMLTools.js";
import { SEARCH_ACTIONS } from "../../config/search-actions.js";
import { SearchAction } from "../../config/search-actions.js";
import { HBS_TEMPLATES_DIR } from "../../config/persona-settings.js";
import { PC } from "../actor/persona-actor.js";
import { PersonaSockets } from "../persona.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { UniversalActorAccessor } from "../utility/db-accessor.js";

export class SearchMenu {
	private static dialog: Dialog | undefined = undefined;
	static progress = {
		treasuresFound: 0,
			hazardFound: false,
			secretFound: false
	} ;
	static promises : undefined | {
		resolve: (data: SearchResult[] | PromiseLike<SearchResult[]>) => void;
		reject: (reason: any) => void;
	};
	static data: null | SearchUpdate = null;

	static isOpen() : boolean {
		return !!this.dialog;
	}

	static async start() : Promise<void> {
		this.progress = {
			treasuresFound: 0,
			hazardFound: false,
			secretFound: false
		}
		const searchOptions =  await this.searchOptionsDialog();
		while (true) {
			const results = await this.openSearchWindow(searchOptions);
			if (results.some( res => res.declaration == "leave")) {
				this.leaveRoom(searchOptions);
				break;
			}
			this.execSearch(results, searchOptions);
		}

	}

	static leaveRoom(options: SearchOptions) {
		const progress = this.progress;
		ui.notifications.notify("left the room");
	}

	static execSearch(results : SearchResult[], options: SearchOptions) {
		ui.notifications.notify("executing search");
	}

	static async searchOptionsDialog() : Promise<SearchOptions> {
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

	static async openSearchWindow(options: SearchOptions): Promise<SearchResult[]> {
		if (!game.user.isGM){
			ui.notifications.error("Only the GM can call this function");
			return [];
		}
		let searchUpdate: SearchUpdate ={
			results: this.generateOriginalSearchResults(),
			options
		};
		this.onSearchUpdate(searchUpdate);
		return new Promise( (res, rej) => {
			this.promises = {
				resolve: res,
				reject: rej,
			};
		});
	}

	private static generateOriginalSearchResults() : SearchResult[] {
		return (game.scenes.active.tokens.contents as TokenDocument<PersonaActor>[])
			.filter( x=> x.actor
				&& x.actor.system.type == "pc"
				&& x.actor.focii.length > 0 //check to eliminate crunched party token
			)
			.flatMap( tok=> {
				const actor = tok.actor! as PC;
				const activePlayers = game.users.contents
					.filter( user => user.active && !user.isGM);
				const owner = activePlayers
					.find( user => user.character == actor)
					?? activePlayers.find( user=> actor.testUserPermission(user, "OWNER")) 
					?? game.users.find(x=> x.isGM && x.active);
				if (!owner) return [];
				const ret : SearchResult = {
					searcher: {
						actor: {
							token: undefined,
							actorId: actor.id,
						},
						name: actor.displayedName,
						ownerId: owner.id,
						ownerName: owner.name,
					},
					declaration: "undecided"
				}
				return [ret];
			});
	}

	private static sendUpdate() {
		if (this.data)
			PersonaSockets.simpleSend("SEARCH_UPDATE", this.data, game.users.contents.filter(x=> x.active).map( x=> x.id));
	}

	static async onSearchUpdate(updateData  : SearchUpdate, send: boolean  = true) {
		this.data = updateData;
		if (!this.isOpen()) {
			this.openDialog(updateData);
		} else {
			this.updateDialog();
		}
		if (send)
			this.sendUpdate();
	}

	private static async openDialog( updateData: SearchUpdate) : Promise<Dialog> {
		const html = await this.renderTemplate();
		this.dialog = new Dialog( {
			title: "Search Actions",
			content: html,
			render: (html) => this.setListeners(html),
			buttons: {},
			close: () => this.isOpen() ? this.openDialog(this.data!) : this.closeDialog(),
		}, {});
		this.dialog.render(true);
		this.data = updateData;
		return this.dialog;
	}

	static closeDialog() {
		this.data = null;
		this.dialog = undefined;
	}

	private static async updateDialog() {
		if (!this.dialog) throw new PersonaError("Dialog isn't open!");
		if (!this.data) throw new PersonaError("Can't find Data");
		ui.notifications.notify("Updating Dialog");
		const html = await this.renderTemplate();
		this.dialog.element.find(".dialog-content").children().replaceWith(html);
		this.setListeners(this.dialog.element);
		if ( this.checkResolution())
			this.close();
	}

	private static checkResolution() : boolean{
		if (!this.data) return false;
		const results = this.data.results;
		if (results.some (res => res.declaration == "undecided" || res.declaration == "disconnected")){ 
			return false;
		}
		const leavers = results.filter(res => res.declaration == "leave");
		if (leavers.length > 0) {
			return leavers.length >= results.length / 2;
		}
		return true;
	}

	static close() {
		if (!this.promises && game.user.isGM)
			throw new PersonaError("No promise data found!")
		if (!this.data)
			throw new PersonaError("No data found!")
		if (this.promises) {
			this.promises.resolve(this.data.results);
			this.promises = undefined;
		}
		const dialog = this.dialog;
		this.dialog = undefined;
		this.data = null;
		if (dialog)
			dialog.close();
	}

	private static async renderTemplate() : Promise<string> {
		const updateData = this.data!;
		const html = await renderTemplate( `${HBS_TEMPLATES_DIR}/dialogs/search-dialog.hbs`, {data: updateData, SEARCH_ACTIONS});
		return html;
	}

	private static setListeners(html: string | JQuery<HTMLElement>) {
		if (typeof html == "string")
			html = $(html);
		html.find(".action-choice").on("change", ev=> {
			ev.preventDefault();
			ev.stopPropagation();
			const target = $(ev.currentTarget);
			const actorId = HTMLTools.getClosestData(ev, "actorId");
			const newAction = String(target.val());
			if (!this.data) {
				throw new PersonaError(`No Data Found`);
				}
			const sdata = this.data.results.find( res => res.searcher.actor.actorId == actorId);
			if (!sdata) {
				throw new PersonaError(`Can't find actor ${actorId}`);
			}
			sdata.declaration = newAction as SearchAction;
			this.onSearchUpdate(this.data);
		});
	}


	static onUserConnect(_user: FoundryUser) {
		if (this.isOpen() && this.data) {
			this.onSearchUpdate(this.data);
		}
	}

	 static onUserDisconnect(user: FoundryUser) {
		if (this.isOpen() && this.data) {
			const results = this.data.results;
			results.filter( item => item.searcher.ownerId == user.id)
			.forEach( item => item.declaration = "disconnected");
			this.onSearchUpdate(this.data);
		}
	}

} // end of class

Hooks.on("userConnected", (user: FoundryUser, isConnectionEvent: boolean) => {
	if (game.user.isGM && SearchMenu.isOpen()) {
		if (isConnectionEvent) {
			SearchMenu.onUserConnect(user);
		} else {
			SearchMenu.onUserDisconnect(user);
		}
	}
});


type SearchOptions = {
	treasureRemaining: number;
	stopOnHazard?: boolean;
	isHazard: boolean;
	isSecret: boolean;
};

type SearchResult = {
	searcher : SearcherData;
	result?: "nothing" | "treasure" | "hazard";
	declaration: SearchAction ;
};

type SearcherData = {
	actor: UniversalActorAccessor<PersonaActor>;
	name: string;
	ownerId: string;
	ownerName: string;
}

type SearchUpdate = {
	results: SearchResult[];
	options: SearchOptions;
};

Hooks.on("socketsReady", () => PersonaSockets.setHandler("SEARCH_UPDATE", (x: SearchUpdate) => SearchMenu.onSearchUpdate( x, false))
);


declare global {
	export interface SocketMessage {
		"SEARCH_UPDATE": SearchUpdate;
	}
}

