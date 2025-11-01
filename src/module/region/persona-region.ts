/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { PresenceRollData } from "../metaverse.js";
import { EncounterOptions } from "../metaverse.js";
import { PersonaScene } from "../persona-scene.js";
import { Helpers } from "../utility/helpers.js";
import { ModifierList } from "../combat/modifier-list.js";
import { TriggeredEffect } from "../triggered-effect.js";
import { Shadow } from "../actor/persona-actor.js";
import { PersonaSockets } from "../persona.js";
import { Metaverse } from "../metaverse.js";
import { PersonaError } from "../persona-error.js";
import { localize } from "../persona.js";
import { UniversalModifier } from "../item/persona-item.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { PersonaDB } from "../persona-db.js";
import {EnchantedTreasureFormat, TreasureSystem} from "../exploration/treasure-system.js";
import {ValidAttackers} from "../combat/persona-combat.js";

declare global {
	interface SocketMessage {
"SEARCH_REQUEST" : {regionId: string};
	}
}

const PLAYER_VISIBLE_MOD_LIST = [
	"treasure-poor", //1d10 treasure
	"treasure-rich", //1d20+5 treasure
	"treasure-ultra", //1d10+15 treasure
	"hazard-on-2",
	// "no-tension-roll",// don't roll tension after
	"safe",//can't search and no random encounter rolls
	"bonus-on-6", //+5 treasure on 6 search
	"fixed-treasure", // Treasure is static
	"treasure-refresh", // Treasure refreshes on enter metaverse
	"no-tension-increase", //no tension increase after search

] as const;

const PLAYER_HIDDEN_MOD_LIST = [
	"stop-on-hazard",
] as const;

const SPECIAL_MOD_LIST = [
	...PLAYER_VISIBLE_MOD_LIST,
	...PLAYER_HIDDEN_MOD_LIST,
] as const;

type SpecialMod = typeof SPECIAL_MOD_LIST[number];

const SPECIAL_MODS = Object.fromEntries(
	SPECIAL_MOD_LIST.map( x=> [x, `persona.specialRoomMods.${x}`])
);

const SECRET_CHOICES_LIST = [
	"found",
	"none",
	"hidden",
	"found-repeatable",
	"hidden-repeatable",
] as const;

type SecretChoice = typeof SECRET_CHOICES_LIST[number];

const SECRET_CHOICES = Object.fromEntries(
	SECRET_CHOICES_LIST.map( x=> [x, `persona.secretChoices.${x}`])
);

type RegionData = {
	ignore: boolean,
	secret: SecretChoice,
	hazard: SecretChoice,
	secretDetails: string,
	hazardDetails: string,
	treasures: {
		found: number,
		max: number,
	},
	roomEffects: Item["id"][],
	pointsOfInterest: string[],
	specialMods: SpecialMod[],
	concordiaPresence: number,
	shadowPresence: number,
	secretNotes: string,
	challengeLevel: number,
}

export class PersonaRegion extends RegionDocument {

	declare parent: PersonaScene;

	#changeBuffer : RegionData | undefined = undefined;
	declare tokens: Set<TokenDocument<PersonaActor>>;

	defaultRegionData() : RegionData {
		return {
			ignore: false,
			secret: "none",
			hazard: "none",
			secretDetails: "",
			hazardDetails: "",
			treasures : {
				found: 0,
				max: 0,
			},
			roomEffects: [],
			pointsOfInterest: [],
			specialMods: [],
			concordiaPresence: 0,
			shadowPresence: 0,
			secretNotes: "",
			challengeLevel: 1,
		} as const;
	}

	get regionData(): RegionData {
		const regionData = this.getFlag("persona", "RegionData");
		const defaultRegion = this.defaultRegionData();
		if (!regionData) {return defaultRegion;}
		foundry.utils.mergeObject(regionData, defaultRegion, {insertKeys: true, overwrite: false});
		return regionData as RegionData;
	}


	get challengeLevel(): number {
		return this.regionData.challengeLevel ?? 1;

	}

	hasModifier(mod: SpecialMod) : boolean {
		return this.regionData.specialMods.includes(mod);
	}

	get secret(): string {
		return localize(
			SECRET_CHOICES[ this.regionData.secret ?? "none"]
		);
	}

	get hazard(): string {
		return localize(
			SECRET_CHOICES[ this.regionData.hazard ?? "none"]
		);
	}

	get concordiaPresence(): number {
		return Number(this.regionData.concordiaPresence ?? 0);
	}

	get shadowPresence(): number {
		if (this.regionData.shadowPresence)
			{return Number(this.regionData.shadowPresence);}
		else {return 0;}
	}

	get isSafe() : boolean {
		return this.hasModifier("safe");
	}

	async secretFound() {
		return await this.secretHazardFound("secret");
	}

	async hazardFound() {
		return await this.secretHazardFound("hazard");
	}

	async secretHazardFound(field: "secret" | "hazard") {
		const regionData = this.regionData;
		const fieldValue = regionData[field];
		switch (fieldValue) {
			case "found":
				return;
			case "hidden":
				regionData[field] = "found";
				break;
			case "none":
				PersonaError.softFail("Found hazard but there is none to find?");
				return;
			case "found-repeatable":
				break;
			case "hidden-repeatable":
				regionData[field] = "found-repeatable";
				break;
			default:
				fieldValue satisfies never;
				return;
		}
		await this.setRegionData(regionData);
	}

	// async treasureFound(searchRoll: number): Promise<Roll | undefined> {
	async treasureFound(searchRoll: number, searcher: ValidAttackers): Promise<U<EnchantedTreasureFormat>> {
		const regionData = this.regionData;
		const searchBonus = searcher.getPersonalBonuses("treasure-roll-bonus").total( {user: searcher.accessor});
		if (this.treasuresRemaining <= 0) {
			PersonaError.softFail("Can't find a treasure in room with no treasure left");
			return undefined;
		}
		regionData.treasures.found += 1;
		await this.setRegionData(regionData);
		return this.#treasureRoll(searchRoll, searchBonus);
	}

	#treasureRoll(searchRoll: number, personalModifier : number = 0) : U<EnchantedTreasureFormat> {
		const treasureLevel = this.parent.treasureLevel;
		if (treasureLevel <= 0) {return undefined;}
		const mods = this.regionData.specialMods;
		let treasureMod = personalModifier ?? 0;
		let treasureMin = 1;

		switch (true) {
			case mods.includes("treasure-poor"):
				treasureMod = -35;
				break;
			case mods.includes("treasure-rich"):
				treasureMod = +10;
				treasureMin = 25;
				break;
			case mods.includes("treasure-ultra"):
				treasureMod = 20;
				treasureMin = 50;
				break;
			case mods.includes("bonus-on-6") && searchRoll == 6:
				treasureMod += 10;
				treasureMin += 50;
				break;
			default:
				break;
		}
		return TreasureSystem.generate(treasureLevel, treasureMod, treasureMin);
	}
	// async #treasureRoll(searchRoll: number) : Promise<Roll> {
	// 	const mods = this.regionData.specialMods;
	// 	let expr : string;
	// 	switch (true) {
	// 		case mods.includes("treasure-poor"):
	// 			expr = "1d10";
	// 			break;
	// 		case mods.includes("treasure-rich"):
	// 			expr = "1d20+5";
	// 			break;
	// 		case mods.includes("treasure-ultra"):
	// 			expr = "1d10+15";
	// 			break;
	// 		case mods.includes("bonus-on-6") && searchRoll == 6:
	// 			expr = "1d20+5";
	// 			break;
	// 		default:
	// 			expr = "1d20";
	// 			break;
	// 	}
	// 	const roll = new Roll(expr);
	// 	await roll.evaluate();
	// 	return roll;
	// }

	get treasuresRemaining(): number {
		const t= this.regionData.treasures;
		return t.max - t.found;
	}

	get allRoomEffects() : UniversalModifier[] {
		return this.parent.sceneEffects.concat(this.personalRoomEffectsOnly());
	}

	personalRoomEffectsOnly(): UniversalModifier[] {
		return this.regionData.roomEffects.flatMap ( id=> {
			if (!id) {return [];}
			const mod = PersonaDB.getRoomModifiers().find(x=> x.id == id);
			if (mod) {return [mod];}
			else {return [];}
		});
	}

	get specialMods() : string[] {
		return this.regionData.specialMods
			.filter( x=> x && (game.user.isGM || PLAYER_VISIBLE_MOD_LIST.includes(x as typeof PLAYER_VISIBLE_MOD_LIST[number])))
			.map( x=> game.i18n.localize(SPECIAL_MODS[x]));
	}

	get pointsOfInterest(): string[] {
		return this.regionData.pointsOfInterest
			.filter(x=> x);
	}

	encounterList(): Shadow[] {
		const baseList = this.parent.encounterList();
		// const regionRange = this.EnemyDifficultyRange;
		return baseList;
	}

	get EnemyDifficultyRange(): {low:number, high:number} {
		const diffLevel = this.regionData.challengeLevel + this.parent.challengeLevel;
		//TODO: replace with real range after difficult is properly set in scene
		const diffRange = 9999;
		return {
			low:	diffLevel - diffRange,
			high: diffLevel + diffRange,
		};
	}

	async onEnterRegion(token: TokenDocument<PersonaActor>) {
		console.debug(`Region Entered: ${this.name}`);
		if (!token.actor?.isPC()) {return;}
		const tokens = Array.from(this.tokens);
		const situation : Situation = {
			trigger: "on-enter-region",
			triggeringRegionId: this.id,
			triggeringCharacter: token.actor.accessor,
			triggeringUser: game.user,
		};
		await TriggeredEffect.autoApplyTrigger("on-enter-region", token.actor, situation);
		if (tokens.some(t => t.actor?.isShadow() && !t.hidden) ) {return;}
		await this.presenceCheck("wandering");
		await Metaverse.passMetaverseTurn();
	}

	/** for batch_adding */
	async addRoomModifier(mod: UniversalModifier | string) {
		if (typeof mod == "string") {
			const item = PersonaDB.allItems().find( x=> x.name == mod);
			if (!mod) {throw new Error("Modifier Not found");}
			mod = item as UniversalModifier;
		}
		if (mod?.system?.type != "universalModifier") {throw new PersonaError("Not a modifier");}
		if (mod.system.scope != "room")  {throw new PersonaError("Not a Room Effect");}
		const data = this.regionData;
		if (data.roomEffects.includes( mod.id)) {
			return false;
		}
		data.roomEffects = data.roomEffects.filter(x=> x);
		if (data.roomEffects.length >= 4) {
			ui.notifications.warn("${this.name} ${this.id} Effects full");
			return false;
		}
		data.roomEffects.push(mod.id);
		await this.setRegionData(data);
		return true;
	}

	async removeRoomModifier(mod: UniversalModifier) {
		if (mod?.system?.type != "universalModifier") {throw new PersonaError("Not a modifier");}
		if (mod.system.scope != "room")  {throw new PersonaError("Not a Room Effect");}
		const data = this.regionData;
		if (!data.roomEffects.includes( mod.id)) {
			return false;
		}
		data.roomEffects = data.roomEffects.filter(x=> x != mod.id);
		await this.setRegionData(data);
		return true;
	}

	async presenceCheck(battleType: PresenceRollData["encounterType"], modifier = 0) : Promise<boolean> {
		const presence = await Metaverse.presenceCheck(battleType, this, undefined, modifier);
		if (!presence) {return false;}
		let shadowType : Shadow["system"]["creatureType"] | undefined = undefined;
		switch (presence) {
			case "shadows":
				shadowType = "shadow";
				break;
			case "daemons":
				shadowType = "daemon";
				break;
			case "any":
				break;
			default:
				presence satisfies never;
		}
		const situation : Situation = {
			trigger: "on-presence-check",
			triggeringUser: game.user,
			triggeringRegionId : this.id,
		};
		const modifiers = [
			...PersonaDB.getGlobalModifiers(),
			...this.allRoomEffects,
		];
		const sizeMod = new ModifierList(
			modifiers.flatMap( x=> x.getModifier("encounterSize", null))
		).total(situation);
		const hardMod = new ModifierList(
			modifiers.flatMap( x=> x.getModifier("hardMod", null))
		).total(situation);
		const mixedMod = new ModifierList(
			modifiers.flatMap( x=> x.getModifier("mixedMod", null))
		).total(situation);
		let encounterType : EncounterOptions["encounterType"] = undefined;
		switch (battleType) {
			case "secondary":
				encounterType = "standard";
				break;
		}
		const options : EncounterOptions = {
			sizeMod,
			encounterType,
			frequencies: {
				hard: hardMod,
				mixed: mixedMod,
			},
		};
		const encounter = Metaverse.generateEncounter(shadowType, options);
		await Metaverse.printRandomEncounterList(encounter);
		return true;
	}

	async setRegionData(data: RegionData) {
		if (!this.isOwner) {return;}
		await this.setFlag("persona", "RegionData", data);
	}

	async setShadowPresence(newPresence: number) {
		const rdata = this.regionData;
		rdata.shadowPresence = newPresence;
		await this.setRegionData(rdata);
	}

	async setConcordiaPresence(newPresence: number) {
		const rdata = this.regionData;
		rdata.concordiaPresence = newPresence;
		await this.setRegionData(rdata);
	}

	formEntryField(field: keyof RegionData) {
		const element = $("<div>");
		element.append($("<label>").text(
			game.i18n.localize(`persona.roomAttribute.${field}`)
		));
		const fieldClass = `field-${field}`;
		switch (field) {
			case "ignore": {
				const val = this.regionData[field];
				const check = $(`<input type="checkbox">`)
				.prop("checked", val)
				.addClass(fieldClass)
				.on("change", this.#refreshRegionData.bind(this));
				element.append(check);
				break;
			}
			case "secretDetails":
			case "hazardDetails": {
				const val = this.regionData[field];
				const input = $(`<input type="text">`).val(val ?? "").addClass(fieldClass)
				.on("change", this.#refreshRegionData.bind(this));
				element.append(input);
				break;
			}
			case "secret":
			case "hazard": {
				const val = this.regionData[field];
				const select = $("<select>")
				.addClass(fieldClass)
				.on("change", this.#refreshRegionData.bind(this))
				;
				const options = Object.entries(SECRET_CHOICES)
				.map( ([k,v]) => {
					const item = $("<option>").val(k).text(game.i18n.localize(v));
					if (k == val) {
						item.prop("selected", true);
					}
					return item;
				});
				for (const i of options) {
					select.append(i);
				}
				element.append(select);
				break;
			}
			case "treasures": {
				const val = this.regionData[field];
				const subdiv = $("<div>");
				subdiv.append($("<label>").text("Found"));
				subdiv.append(
					$(`<input type="number">`).addClass(`${fieldClass}-found`).val(val.found ?? 0)
					.on("change", this.#refreshRegionData.bind(this))

				);
				subdiv.append($("<label>").text("Max"));
				subdiv.append(
					$(`<input type="number">`).addClass(`${fieldClass}-max`).val(val.max ?? 0)
					.on("change", this.#refreshRegionData.bind(this))
				);
				element.append(subdiv);
				break;
			}
			case "roomEffects": {
				const val = this.regionData[field];
				for (const i of [0,1,2,3]) {
					element.append(this.#roomEffectSelector(val.at(i), fieldClass));
				}
				break;
			}
			case "pointsOfInterest": {
				const val = this.regionData[field];
				for (const i of [0,1,2,3]) {
					element.append(
						$(`<input type="text">`).val(val.at(i) ?? "").addClass(fieldClass)
						.on("change", this.#refreshRegionData.bind(this))

					);
				}
				break;
			}
			case "specialMods": {
				const val = this.regionData[field];
				for (const i of [0,1,2,3]) {
					const select = $("<select>")
						.addClass(fieldClass)
						.on("change", this.#refreshRegionData.bind(this))
					;
					const emptyOption = $("<option>").val("").text("-");
					select.append(emptyOption);
					for (const [k,v] of Object.entries(SPECIAL_MODS)) {
						const mod = $("<option>").val(k).text(localize(v)).prop("selected", val.at(i) == k);
						select.append(mod);
					}
					element.append(select);
				}
				break;
			}
			case "concordiaPresence": {
				const val = this.regionData[field];
				element.append(
					$(`<input type="number">`).addClass(`${fieldClass}`).val(val ?? 0)
					.on("change", this.#refreshRegionData.bind(this))
				);
				break;
			}
			case "shadowPresence": {
				const val = this.regionData[field];
				element.append(
					$(`<input type="number">`).addClass(`${fieldClass}`).val(val ?? 0)
					.on("change", this.#refreshRegionData.bind(this))
				);
				break;
			}
			case "challengeLevel": {
				const val = this.regionData[field];
				element.append(
					$(`<input type="number">`).addClass(`${fieldClass}`).val(val ?? 0)
					.on("change", this.#refreshRegionData.bind(this))
				);
				break;
			}
			case "secretNotes": {
				const val = this.regionData[field];
				element.append(
					$(`<textarea>`).addClass(`${fieldClass}`)
					.val(val ?? "")
					.on("change", this.#refreshRegionData.bind(this))
				);
				break;
			}
			default:
				field satisfies never;
				return $("<div>").text("ERROR");
		}
		return element;
	}

	#roomEffectSelector(selected : string | undefined, classString: string) {
		const select = $("<select>").addClass(classString)
			.on("change", this.#refreshRegionData.bind(this))
		;
		const emptyOption = $("<option>").val("").text("-");
		select.append(emptyOption);
		const options = PersonaDB.getRoomModifiers().map(
			item => $("<option>").val(item.id).text(item.name).prop("selected", item.id == selected)
		);
		for (const i of options) {
			select.append(i);
		}
		return select;
	}

	#refreshRegionData(event: JQuery.ChangeEvent) {
		const topLevel  = $(event.currentTarget).closest(".tab.region-identity");
		const data = this.regionData;
		for( const key of Object.keys(data)) {
			const k = key as keyof RegionData;
			const fieldClass = `field-${k}`;
			switch (k) {
				case "ignore": {
					const input = topLevel.find(`.${fieldClass}`).prop("checked");
					(data[k] as unknown) = input;
					break;
				}
				case "secretDetails":
				case "hazardDetails":
				case "secret":
				case "hazard":
				case "secretNotes":{
					const input = topLevel.find(`.${fieldClass}`).val();
					if (input != undefined) {
						(data[k] as unknown) = input;
					}
					break;
				}
				case "challengeLevel":
				case "shadowPresence":
				case "concordiaPresence": {
					const input = topLevel.find(`.${fieldClass}`).val();
					if (input != undefined) {
						(data[k] as unknown) = Number(input ?? 0);
					}
					break;
				}
				case "roomEffects":
				case "pointsOfInterest":
				case "specialMods": {
					const inputs = topLevel.find(`.${fieldClass}`)
					.map( function () {
						return $(this).val();
					})
					.toArray();
					if (inputs != undefined) {
						(data[k] as unknown) = inputs;
					}
					break;
				}
				case "treasures": {
					const max = Number(topLevel.find(`.${fieldClass}-max`).val());
					const found = Number(topLevel.find(`.${fieldClass}-found`).val());
					data[k]= {
						found,
						max
					};
					break;
				}
				default:
					k satisfies never;
			}
		}
		this.#changeBuffer = data;
		// this.setRegionData(data);
	}

	async processInputBuffer() : Promise<void> {
		const buffer = this.#changeBuffer;
		if (buffer == undefined) {return;}
		await this.setRegionData(buffer);
		this.#changeBuffer = undefined;
	}

	formFields() {
		const data = this.regionData;
		const div = $("<div>");
		const fields= Object.keys(data).map( k=> this.formEntryField(k as keyof RegionData));
		for (const f of fields) {
			div.append(f);
		}
		return div;
	}

	static async updateRegionDisplay(token: TokenDocument<PersonaActor>, tokenMove: boolean = true) {
		const scene = token.parent;
		const region = scene.regions.find( (region : PersonaRegion) => region.tokens.has(token) && !region?.regionData?.ignore);
		if (!region || game?.combat?.active) {
			clearRegionDisplay();
			return;
		}
		//TODO: refactor into onMove, onSelect and actual updateRegion functions
		await updateRegionDisplay(region as PersonaRegion);
		const lastRegion = PersonaSettings.get("lastRegionExplored");
		if (tokenMove && lastRegion != region.id) {
			if (game.user.isGM) {
				await PersonaSettings.set("lastRegionExplored", region.id);
				await (region as PersonaRegion).onEnterRegion(token);
			}
		}
	}

	async onEnterMetaverse() : Promise<void> {
		const data = this.regionData;
		const refresh = data.specialMods.includes("treasure-refresh");
		if (refresh) {
			if (data.treasures.found > 0) {
				data.treasures.found = 0;
				await this.setRegionData(data);
				console.debug(`Refreshing Treasures for : ${this.name}`);
			}
		}
	}

	async onExitMetaverse() : Promise<void> {

	}

} //end of class


Hooks.on("closeRegionConfig", async (app) => {
	const region = app.document as PersonaRegion;
	await region.processInputBuffer();
});

//Append Region Configuraton dialog
Hooks.on("renderRegionConfig", async (app, html) => {
	const appendPoint = $(html).find(".tab.region-identity");
	if (appendPoint.length != 1) {
		throw new Error(`Append Point Length equals ${appendPoint.length}`);
	}
	const region = app.document as PersonaRegion;
	await region.processInputBuffer();
	appendPoint.append($("<hr>"))
		.append(region.formFields());

	//@ts-expect-error not in foundrytypes
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call
	app.setPosition({ height: 'auto' });
});

Hooks.on("updateRegion", async (region) => {
	const lastRegion = PersonaSettings.get("lastRegionExplored");
	if (region.id == lastRegion) {
		await updateRegionDisplay(region as PersonaRegion);
	}
});

Hooks.on("updateToken", async (token: TokenDocument<PersonaActor>, changes) => {
	const actor = token.actor as PersonaActor;
	if (!actor) {return;}
	if (token.hidden) {return;}
	if (actor.system.type != "pc" || !actor.hasPlayerOwner) {
		return;
	}
	if ((changes.x ?? changes.y) == undefined)
		{return;}
	const scene = token.parent;
	if (!scene) {return;}
	await PersonaRegion.updateRegionDisplay(token);
});

Hooks.on("updateCombat", (_combat) => {
	clearRegionDisplay();
});


function clearRegionDisplay() {
	const infoPanel = $(document).find(".region-info-panel");
	if (infoPanel.length) {
		infoPanel.remove();
	}
}

async function updateRegionDisplay (region: PersonaRegion) {
	const html = await foundry.applications.handlebars.renderTemplate("systems/persona/other-hbs/region-panel.hbs", {region, data: region.regionData});
	let infoPanel = $(document).find(".region-info-panel");
	if (infoPanel.length == 0) {
		infoPanel = $("<section>").addClass("region-info-panel");
		const chatNotifications = $(document).find("#interface #ui-right-column-1 #chat-notifications");
		const chatContainer= $("<div>")
			.addClass("region-chat-container");
		$(document).find("#interface #ui-right-column-1").prepend(chatContainer);
		const chatNotificationsContainer = $("<div>").addClass("chat-notifications-container");
		chatNotificationsContainer.append(chatNotifications);
		chatContainer.append(infoPanel)
			.append(chatNotificationsContainer);
	}
	infoPanel.empty();
	infoPanel.html(html);
	infoPanel.find(".search-button").on("click", searchButton);
	infoPanel.find(".crunch-button").on("click", Metaverse.toggleCrunchParty.bind(Metaverse));
}

function searchButton(_ev: JQuery.ClickEvent) {
	if (game.user.isGM) {
		void Metaverse.searchRoom();
		return;
	}
	Helpers.pauseCheck();
	const region = Metaverse.getRegion();
	if (!region) {
		throw new PersonaError("Can't find region");
	}
	const data = {regionId: region.id};
	PersonaSockets.simpleSend("SEARCH_REQUEST", data, game.users.filter(x=> x.isGM && x.active).map(x=> x.id));
}

Hooks.on("socketsReady", () => {
	PersonaSockets.setHandler("SEARCH_REQUEST", async function (data) {
		const region = game.scenes.current.regions.find( r=> data.regionId == r.id);
		if (!region) {throw new PersonaError(`Can't find region ${data.regionId}`);}
		await Metaverse.searchRegion(region as PersonaRegion);
	});
});

Hooks.on("canvasInit", () => {
	clearRegionDisplay();
});

Hooks.on("controlToken", async (token : Token<PersonaActor>) => {
	const actor = token?.document?.actor;
	if (!actor) {return;}
	if (actor.isPC()) {
		await PersonaRegion.updateRegionDisplay(token.document, false);
	}

});



