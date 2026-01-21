/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { PersonaRoller } from "../../persona-roll.js";
import { Logger } from "../../utility/logger.js";
import { PersonaError } from "../../persona-error.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaActor } from "../persona-actor.js";
import { PersonaSocial } from "../../social/persona-social.js";
import { SocialStat } from "../../../config/student-skills.js";
import { STUDENT_SKILLS_LIST } from "../../../config/student-skills.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaDB } from "../../persona-db.js";
import { PCLikeSheet } from "./pc-like-sheet.js";
import { Persona } from "../../persona-class.js";
import {HypotheticalPersona} from "../../pre-fusion-persona.js";
import {PersonaCompendium} from "../../persona-compendium.js";

export class PCSheet extends PCLikeSheet {
	declare actor: Subtype<PersonaActor, "pc">;


	personaMoveSelector : U<Persona> = undefined;
	selectedFusion:  U<HypotheticalPersona> = undefined;
	selectedCompendium: U<Persona> = undefined;

	static override get defaultOptions() {
		const def = super.defaultOptions;
		return foundry.utils.mergeObject(def, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/pc-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [
				{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat"},
				{navSelector: ".secondary-tabs", contentSelector: ".inner-body", initial: "SL"},
				{navSelector: ".inventory-tabs", contentSelector: ".inventory-body", initial: "consumables"},
				{navSelector: ".persona-tabs", contentSelector: ".persona-body", initial: "personaList"}
			],
		});
	}

	override async getData() {
		await PersonaDB.waitUntilLoaded();
		const data = await super.getData();
		return data;
	}

	override async _onDropActor(_event: Event, actorD: unknown)
	{
		//@ts-expect-error using weird function
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const actor : PersonaActor = await Actor.implementation.fromDropData(actorD) as PersonaActor;
		switch (actor.system.type) {
			case "pc" :{
				await this.actor.createSocialLink(actor as PC);
				return undefined;
			}
			case "shadow":
				await this.actor.addPersona(actor as Shadow);
				return undefined;
			case "tarot":
				break;
			case "npcAlly":
			case "npc":
				//create a social link
				await this.actor.createSocialLink(actor as NPC);
				return undefined;
			default:
				actor.system satisfies never;
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				throw new Error(`Unknown unsupported type ${actor.system["type"]}`);
		}
		return super._onDropActor(_event, actorD);
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".refreshLink").on("click", this.refreshLink.bind(this));
		html.find(".useInspiration").on("click", this.useInspiration.bind(this));
		html.find(".useRecovery").on("click", this.useRecovery.bind(this));
		html.find(".addSocialRank").on("click", this.addSocialRank.bind(this));
		html.find(".removeSocialRank").on("click", this.reduceSocialRank.bind(this));
		html.find(".add-progress-token").on("click", this.addProgressTokens.bind(this));
		html.find(".social-link .name").on("click", this.openSL.bind(this));
		html.find(".job .name").on("click", this.openJob.bind(this));
		html.find(".rem-progress-token").on("click", this.removeProgressTokens.bind(this));
		html.find(`.social-stat .roll-icon`).on("click", this.rollSocial.bind(this));
		html.find(`.social-stat .social-boost`).on("click", this.socialBoost.bind(this));
		html.find(`.social-stat .social-minus`).on("click", this.socialMinus.bind(this));
		html.find(`.spend-money`).on('click', this.spendMoney.bind(this));
		html.find(`.gain-money`).on('click', this.gainMoney.bind(this));
		html.find(".draw-social-card").on("click", this.drawSocialCard.bind(this));
		html.find(".draw-activity-card").on("click", this.drawActivityCard.bind(this));
		html.find(".engage-minor-action").on("click", this.doMinorAction.bind(this));
		html.find(".relationship-type").on("change", this.relationshipTypeChange.bind(this));
		html.find(".add-strike").on("click", this.addStrike.bind(this));
		html.find(".rem-strike").on("click", this.removeStrike.bind(this));
		html.find(".init-social-link").on("click", this.startSocialLink.bind(this));
		html.find(".move-to-sideboard").on("click", this.movePowerToSideboard.bind(this));
		html.find(".move-to-main").on("click", this.movePowerToMain.bind(this));
		html.find(".swap-persona").on("click", (ev) => void this.selectPersonaForSideboardMove(ev));
		html.find("li.fusion-option").on("click", (ev) => void this.fusionOptionSelect(ev));
		html.find(".persona-compendium li.compendium-entry .persona-name").on("click", (ev) => void this.compendiumOptionSelect(ev));
		html.find(".fusions-list .persona-viewer .back").on("click", ev => void this.clearFusionSelect(ev));
		html.find(".fusions-list .persona-viewer .fuse-persona").on("click", ev => void this._initiateFusion(ev));
		html.find(".persona-viewer .summon-persona").on("click", ev => void this._summonPersona(ev));
		html.find(".persona-compendium .persona-viewer .back").on("click", ev => void this.clearCompendiumSelect(ev));
	}

	async rollSocial (ev: JQuery.Event) {
		const socialStat = HTMLTools.getClosestData<SocialStat>(ev, "socialSkill");
		if (!STUDENT_SKILLS_LIST.includes(socialStat)) {
			throw new PersonaError(`Invalid student skill: ${socialStat}.`);
		}
		const roll = await PersonaRoller.rollSocialStat(this.actor, socialStat, {DC: undefined, label: undefined, rollTags:[], askForModifier: true} );
		await roll.toModifiedMessage(false);
	}

	async socialBoost (ev: JQuery.Event) {
		const socialStat = HTMLTools.getClosestData<SocialStat>(ev, "socialSkill");
		if (!STUDENT_SKILLS_LIST.includes(socialStat)) {
			throw new PersonaError(`Invalid student skill: ${socialStat}.`);
		}
		await PersonaSocial.boostSocialSkill(this.actor, socialStat);
	}

	async socialMinus (ev: JQuery.Event) {
		const socialStat = HTMLTools.getClosestData<SocialStat>(ev, "socialSkill");
		if (!STUDENT_SKILLS_LIST.includes(socialStat)) {
			throw new PersonaError(`Invalid student skill: ${socialStat}.`);
		}
		await PersonaSocial.lowerSocialSkill(this.actor, socialStat);
	}

	async refreshLink(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const link = this.actor.socialLinks.find(x=> x.actor.id == linkId);
		const npc = link?.actor;
		if (!npc) {
			throw new PersonaError(`Couldn't find NPC with Id ${linkId}`);
		}
		const amount = await HTMLTools.singleChoiceBox({
			1: "1",
			2: "2",
			3: "3",
			9999: "All",
		}, {default: 1, title: "Refresh Inspiration from Link"});

		if (!amount) {return;}
		await Logger.sendToChat(`Added ${Number(amount)} inpiration for ${npc.name} (was ${link.inspiration})`, this.actor);
		await this.actor.addInspiration(npc.id, Number(amount));
	}

	async useInspiration(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const npc = this.actor.socialLinks.find(x=> x.actor.id == linkId)?.actor;
		if (!npc) {
			throw new PersonaError(`COuldn't find NPC with Id ${linkId}`);
		}
		await this.actor.spendInspiration(npc, 1);
		await Logger.sendToChat(`Spent an inpiration for ${npc.name}`, this.actor);
	}

	async useRecovery(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		await this.actor.spendRecovery(linkId);
	}


	async addSocialRank(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const link = this.actor.socialLinks.find( x=> x.actor.id == linkId);
		if (!link) {
			throw new PersonaError(`Can't find Actor for SL ${linkId}`);
		}
		if (await HTMLTools.confirmBox("Riase SL", `Raise SL for link ${link.actor.name}`)) {
			await this.actor.increaseSocialLink(linkId);
		}
	}

	async reduceSocialRank(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const link = this.actor.socialLinks.find( x=> x.actor.id == linkId);
		if (!link) {
			throw new PersonaError(`Can't find Actor for SL ${linkId}`);
		}
		if (await HTMLTools.confirmBox("Lower SL", `Lower SL for link ${link.actor.name}`)) {
			await this.actor.decreaseSocialLink(linkId);
		}
	}

	async addProgressTokens(event: JQuery.ClickEvent) {
		const choice = await HTMLTools.singleChoiceBox({
			1: "1",
			2: "2",
			3: "3",
			4: "4",
		}, {default: 1, title: "Add Social Boost"});
		if (choice == null) {return;}
		if ($(event.currentTarget).closest(".social-link").length > 0) {
			const linkId= String(HTMLTools.getClosestData(event, "linkId"));
			await this.actor.socialLinkProgress(linkId, Number(choice));
			return;
		}
		if ($(event.currentTarget).closest(".job").length > 0) {
			const activityId= String(HTMLTools.getClosestData(event, "activityId"));
			await this.actor.activityProgress(activityId, Number(choice));
		}
	}

	async removeProgressTokens(event: JQuery.ClickEvent) {
		const choice = await HTMLTools.singleChoiceBox({
			1: "1",
			2: "2",
			3: "3",
			4: "4",
			5: "5",
			9999: "All",
		}, {default: 1, title: "Remove Social Boosts"});
		if (choice == null) {return;}
		if ($(event.currentTarget).closest(".social-link").length > 0) {
			const linkId= String(HTMLTools.getClosestData(event, "linkId"));
			await this.actor.socialLinkProgress(linkId, -Number(choice));
		}
		if ($(event.currentTarget).closest(".job").length > 0) {
			const activityId= String(HTMLTools.getClosestData(event, "activityId"));
			await this.actor.activityProgress(activityId, -Number(choice));
		}
	}

	async #modStrike(event: JQuery.ClickEvent, amt: number) {
		if ($(event.currentTarget).closest(".social-link").length > 0) {
			const linkId= String(HTMLTools.getClosestData(event, "linkId"));
			await this.actor.activityStrikes(linkId, amt);
		}
		if ($(event.currentTarget).closest(".job").length > 0) {
			const activityId= String(HTMLTools.getClosestData(event, "activityId"));
			await this.actor.activityStrikes(activityId, amt);
		}

	}

	async addStrike(event: JQuery.ClickEvent) {
		await this.#modStrike(event, 1);
	}

	async removeStrike(event: JQuery.ClickEvent) {
		await this.#modStrike (event, -1);

	}

	async relationshipTypeChange(event: JQuery.ChangeEvent) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const newval = $(event.currentTarget).find(":selected").val();
		if (!newval) {return;}
		await this.actor.setRelationshipType(linkId, String(newval));
	}



	async openSL(ev: Event) {
		const linkId= String(HTMLTools.getClosestData(ev, "linkId"));
		const link = this.actor.socialLinks.find( link=> link.actor.id == linkId);
		if (link && link.actor != this.actor) {
			await link.actor.sheet.render(true);
		}
	}

	async openJob(ev: Event) {
		const jobId= String(HTMLTools.getClosestData(ev, "activityId"));
		const job = PersonaDB.allActivities().find(x=> x.id == jobId);
		if (job){
			await job.sheet.render(true);
		}
	}

	async gainMoney(_ev: Event) {
		const x = await HTMLTools.getNumber("Amount to gain");
		if (x <= 0) {return;}
		await this.actor.gainMoney(x, true);
	}

	async spendMoney(_ev: Event) {
		const x = await HTMLTools.getNumber("Amount to spend");
		if (x <= 0) {return;}
		await this.actor.spendMoney(x);
		// await Logger.sendToChat(`${this.actor.name} Spent ${x} resource points`);
	}

	async drawActivityCard (event: JQuery.ClickEvent) {
		const activityId= String(HTMLTools.getClosestData(event, "activityId"));
		const activity = PersonaDB.allActivities().find(x => x.id == activityId);
		if (activity &&
			await HTMLTools.confirmBox("Social Card", "Draw Activity Card?")) {
			await PersonaSocial.chooseActivity(this.actor, activity, {noDegrade:true});
		}
	}

	async doMinorAction(event: JQuery.ClickEvent) {
		const minorId= String(HTMLTools.getClosestData(event, "minorActionId"));
		const minorAction= this.actor.downtimeMinorActions.find(x=> x.id == minorId);
		if (! minorAction) {
			throw new PersonaError(`Can't find Minor Action Id: ${minorId}`);
		}
		if (minorAction.isUsableType()) {
			if (await HTMLTools.confirmBox("Minor Action", `Use ${minorAction.name}?`)) {
				await this._useItemOrPower(minorAction);
			}
			return;
		}
		if (minorAction.isSocialCard()) {
			if (await HTMLTools.confirmBox("Minor Action", `Perform Minor Action: ${minorAction.name}?`)) {
				await PersonaSocial.chooseActivity(this.actor, minorAction, {noDegrade:true});
			}
			return;
		}
	}

	async drawSocialCard(event: JQuery.ClickEvent) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const link = PersonaSocial.lookupSocialLink(this.actor, linkId);
		if (link &&
			await HTMLTools.confirmBox("Social Card", "Draw Social Card?")) {
			await PersonaSocial.chooseActivity(this.actor, link.actor, {noDegrade:true});
		}
	}


	async startSocialLink(event: JQuery.ClickEvent) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		await PersonaSocial.startSocialLink(this.actor, linkId);

	}

	async movePowerToSideboard( event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData<Power["id"]>(event, "powerId");
		await this.actor.movePowerToSideboard(powerId);
	}

	async movePowerToMain( event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData<Power["id"]>(event, "powerId");
		await this.actor.retrievePowerFromSideboard(powerId);
	}

	async selectPersonaForSideboardMove(event: JQuery.ClickEvent) {
		const personaId = HTMLTools.getClosestData(event, "personaId");
		if (personaId == this.actor.id) {return;}
		const persona = this.actor.personaList.find( x=> x.source.id == personaId) ?? this.actor.sideboardPersonas.find(x=> x.source.id == personaId) ;
		if (!persona) {return;}
		if (this.personaMoveSelector == undefined) {
			this.personaMoveSelector = persona;
			await this.render(false);
			return;
		}
		if (this.personaMoveSelector.equals(persona)) {
			this.personaMoveSelector = undefined;
			await this.render(false);
			return;
		}
		const target1= this.personaMoveSelector;
		this.personaMoveSelector = undefined;
		await this.actor.swapPersona(target1, persona);
	}

	async fusionOptionSelect (ev: JQuery.ClickEvent) {
		const shadowId = HTMLTools.getClosestData(ev, "shadowId");
		const shadow = PersonaDB.getActorById(shadowId) as Shadow;
		if (!shadow) {
			throw new PersonaError(`Couldn't find Shadow ${shadowId}`);
		}
		//get components
		const componentIds: string[] = [];
		$(ev.currentTarget).find("[data-shadow-component-id]")
			.each( function () {
				const x = $(this).data('shadow-component-id') as unknown;
				if (x && typeof x == "string" && x.length > 0) {
					componentIds.push(x);
				}
			});
		const components = componentIds
			.map(id => PersonaDB.getActorById(id))
			.filter( act => act != undefined)
			.filter( act => act instanceof PersonaActor && act.isShadow());
		if (components.length < 2) {
			throw new PersonaError("Error getting shadow components for fusion");
		}
		this.selectedFusion = new HypotheticalPersona(shadow, this.actor, components);
		await this.render(false);
	}

	async compendiumOptionSelect(ev: JQuery.ClickEvent) {
		const shadowId = HTMLTools.getClosestData(ev, "personaId");
		const shadow = PersonaDB.getActorById(shadowId) as Shadow;
		if (!shadow) {
			throw new PersonaError(`Couldn't find Shadow ${shadowId}`);
	}
		this.selectedCompendium = new Persona(shadow, this.actor, shadow.startingPowers);
		await this.render(false);
	}

	async clearFusionSelect (_ev ?: JQuery.ClickEvent) {
		this.selectedFusion = undefined;
		await this.render(false);
	}

	private async _initiateFusion(_ev: JQuery.ClickEvent) {
		const fusion = this.selectedFusion;
		if (!fusion) {
			throw new PersonaError("No Selected Persona for fusion");
		}
		const fused = await fusion.fusionProcess(this);
		if (!fused) {return;}
		this.selectedFusion = undefined;
		await this.render(false);
	}

	async clearCompendiumSelect(_ev ?: JQuery.ClickEvent) {
		this.selectedCompendium = undefined;
		await this.render(false);
	}

	async _summonPersona (_ev ?: JQuery.ClickEvent) {
		const selected=  this.selectedCompendium;
		if (!selected || !selected.source.isShadow()) {return;}
		const hasDuplicate = this.actor.sideboardPersonas.concat (this.actor.personaList).some(x => x.compendiumEntry && x.compendiumEntry == selected.source);
		if (hasDuplicate) {
			ui.notifications.notify("Can't summon, as you alerady have a persona of this type on your roster");
			return;
		}
		const cost = selected.source.summoningCost;
		const confirm = await HTMLTools.confirmBox("Summon Persona", `Really summon ${selected.name} for ${cost}R?`);
		if (!confirm) {return;}
		await this.actor.spendMoney(cost);
		const summoned = await PersonaCompendium.retrieveFromCompendium(selected.source, this.actor);
		await this.actor.addPersona(summoned);
		await this.render(false);
		await Logger.sendToChat(`${this.actor.name} summoned ${summoned.name} L${summoned.level} from Compendium for ${cost}.`);
	}
}
