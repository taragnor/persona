import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import {ConditionalEffectManager} from "../../conditional-effect-manager.js";
import {SocialCardEventDM} from "../../datamodel/item-types.js";
import {PersonaError} from "../../persona-error.js";
import {HTMLTools} from "../../utility/HTMLTools.js";
import {PersonaEffectContainerBaseSheet} from "./effect-container.js";
import {PersonaSocialCardSheet} from "./social-card-sheet.js";

export class CardEventSheet extends FormApplication<SocialCardEventDM> {
	_event: SocialCardEventDM;
	_card: SocialCard;
	private _eventIndex : number;

	constructor (item: SocialCardEventDM, containingCard: SocialCard,  options ?:ApplicationV1Options) {
		super(item, options);
		this._card = containingCard;
		this._event = item;
		if (!(item instanceof SocialCardEventDM)) {
			this._collectDebugInfo();
			throw new PersonaError("Item isn't a socialcard event DM");
		}
		this._eventIndex = item.parentIndex() ?? -1;
		if (this._eventIndex < 0) {
			this._collectDebugInfo();
			throw new PersonaError("Something bad happened with getting the index of  event");
		}
		Debug(this);
	}

	private _collectDebugInfo() {
		Debug(this._card);
		Debug(this._event);
		console.log(this._event);
		console.log(this._card);

	}

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "event"],
			template: `${HBS_TEMPLATES_DIR}/card-event-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [],
			submitOnChange: true,
			closeOnSubmit: false,
			submitOnClose: true,
		});
	}

	get card() {
		return this._card;
	}

	get item() {
		return this._card;
	}

	get event() : SocialCardEventDM {
		if (this._event instanceof SocialCardEventDM) {
		return this._event;
		} else {
			console.log("ERROR");
			console.log(this._event);
			throw new PersonaError("Event is bugged");
		}
	}

	override activateListeners(html: JQuery) {
		//TODO for next time, need listeners to do conditional events and event tags
		super.activateListeners(html);
		ConditionalEffectManager.applyHandlers(html, this.event as unknown as FoundryDocument);
		html.find(".eventTags .addTag").on("click", (ev) => void this.addEventTag(ev));
		html.find(".eventTags .delTag").on("click", (ev) => void this.deleteEventTag(ev));
	}

	get eventIndex() {
		const index=  this.event.parentIndex();
		if (index == undefined)  {
			Debug(this.event);
			throw new PersonaError("Something bad happened with getting the index of  event");
		}
		return index;
	}

	async addEventTag(_ev: JQuery.ClickEvent) {
		await this.#refreshEventTag( () =>
			this.item.addEventTag(this.eventIndex)
		);
		this.render(false);
	}


	async #refreshEventTag<T, F extends (() => T)>( fn: F) : Promise<T> {
		const index = this.eventIndex;
		const ret = await fn();
		this._event =  this.card.system.events[index] as unknown as SocialCardEventDM;
		if (!(this.event instanceof SocialCardEventDM)) {
			console.log("Problem Encountered");
			console.log(this.card);
			console.log(this._event);
			ui.notifications.warn(`Problem with event not being a socialcardEventDM, index ${index}`);
		}
		return ret;
	}

	async deleteEventTag(ev: JQuery.ClickEvent) {
		const eventIndex = this.eventIndex;
		const tagIndex = HTMLTools.getClosestDataNumber(ev, "tagIndex");
		if (eventIndex != undefined && tagIndex != undefined) {
			await this.#refreshEventTag(
				() => this.item.deleteEventTag(eventIndex, tagIndex)
			);
			this.render(false);
			return;
		}
		ui.notifications.warn("something went wrong with adding tag");
	}

	override async getData(options: Record<string, unknown>) {
		const data= await super.getData(options);
		return {
			POWERSTUFF :  PersonaEffectContainerBaseSheet.powerStuff,
			SOCIAL_DATA : PersonaSocialCardSheet.socialData(),
			event : this.event,
			item : this._card,
			...data,
		};
	}

	override async _updateObject(_event: JQuery.SubmitEvent, formData: Record<string, unknown>) {
		try {
			const ret = await this.#refreshEventTag( () =>
				this.event.update(formData)
			);
			// await this._card.sheet.render(false);
		} catch (e) {
			console.log("Form Data");
			console.log(formData);
			throw e;
		}
	}

}
