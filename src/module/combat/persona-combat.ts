/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { ValidSocialTarget } from '../social/persona-social.js';
import { EvaluatedDamage } from './damage-calc.js';
import { ConsequenceAmount, EnhancedSourcedConsequence, NonDeprecatedConsequence} from '../../config/consequence-types.js';
import { DamageCalculation } from './damage-calc.js';
import { sleep } from '../utility/async-wait.js';
import { CardTag } from '../../config/card-tags.js';
import { RollTag } from '../../config/roll-tags.js';
import { RollSituation } from '../../config/situation.js';
import { Persona } from '../persona-class.js';
import { PersonaScene } from '../persona-scene.js';
import { PersonaItem, Power } from '../item/persona-item.js';
import { UsableAndCard } from '../item/persona-item.js';
import { NPCAlly } from '../actor/persona-actor.js';
import { PC } from '../actor/persona-actor.js';
import { AnyStringObject } from '../../config/precondition-types.js';
import { randomSelect } from '../utility/array-tools.js';
import { CombatHooks } from './combat-hooks.js';
import { DamageConsequence } from '../../config/consequence-types.js';
import { TriggeredEffect } from '../triggered-effect.js';
import { Shadow } from '../actor/persona-actor.js';
import { PersonaCalendar } from '../social/persona-calendar.js';
import { ConsTarget } from '../../config/consequence-types.js';
import { PersonaSocial } from '../social/persona-social.js';
import { UniversalModifier } from '../item/persona-item.js';
import { PersonaSFX } from './persona-sfx.js';
import { PersonaSettings } from '../../config/persona-settings.js';
import { RealDamageType } from '../../config/damage-types.js';
import { ModifierContainer } from '../item/persona-item.js';
import { Consequence } from '../../config/consequence-types.js';
import { TurnAlert } from '../utility/turnAlert.js';
import { EngagementChecker } from './engageChecker.js';
import { Metaverse } from '../metaverse.js';
import { StatusEffectId } from '../../config/status-effects.js';
import { CanceledDialgogError, HTMLTools } from '../utility/HTMLTools.js';

import { PersonaError } from '../persona-error.js';
import { CombatResult } from './combat-result.js';
import { PersonaActor } from '../actor/persona-actor.js';
import { ModifierList } from './modifier-list.js';
import { AttackResult } from './combat-result.js';
import { Usable } from '../item/persona-item.js';
import { PersonaDB } from '../persona-db.js';
import { RollBundle } from '../persona-roll.js';
import { EngagementList } from './engagementList.js';
import { OtherEffect } from '../../config/consequence-types.js';
import { Consumable } from '../item/persona-item.js';
import {Defense} from '../../config/defense-types.js';
import {getActiveConsequences} from '../preconditions.js';
import {ModifierTarget} from '../../config/item-modifiers.js';
import {Calculation} from '../utility/calculation.js';
import {FinalizedCombatResult} from './finalized-combat-result.js';
import {CombatScene} from './combat-scene.js';

declare global {
	interface SocketMessage {
'QUERY_ALL_OUT_ATTACK' : Record<string, never>;
	}
}

declare global {
	interface HOOKS {
		'onUsePower': (power: UsableAndCard, user: PToken, defender: PToken) => unknown;
	}
}

type AttackRollType = 'activation' | 'standard' | 'reflect' | 'iterative' | number; //number is used for bonus attacks


export class PersonaCombat extends Combat<ValidAttackers> {
	// declare combatants: Collection<Combatant<ValidAttackers>>;
	// engagedList: Combatant<PersonaActor>[][] = [];
	static CRIT_MAX = 10 as const;
	_engagedList: EngagementList;
	static customAtkBonus: number = 0;
	consecutiveCombat: number =0;
	defeatedFoes : ValidAttackers[] = [];
	lastActivationRoll: number;

	constructor (...args: unknown[]) {
		super(...args);
		this.consecutiveCombat = 0;
		this.defeatedFoes = [];
	}

	hasCombatantRanStartCombatTrigger(combatant: Combatant<ValidAttackers>) : boolean {
		const startedList = this.getFlag<Combatant['id'][]>('persona', 'startedCombatList') ?? [];
		return startedList.includes(combatant.id);
	}

	async setCombatantRanStartCombatTrigger(combatant: Combatant<ValidAttackers>) {
		const startedList = this.getFlag<Combatant['id'][]>('persona', 'startedCombatList') ?? [];
		startedList.pushUnique(combatant.id);
		await this.setFlag('persona', 'startedCombatList', startedList);
	}


	async runAllCombatantStartCombatTriggers() {
		const combatants = this.combatants
			.filter( c => c.actor != undefined
				&& !this.hasCombatantRanStartCombatTrigger(c));
		for (const comb of combatants) {
			await this.runCombatantStartCombatTriggers(comb);
		}
	}

	async runCombatantStartCombatTriggers(comb: Combatant<ValidAttackers>) {
		if (!comb.actor) {return;}
		if (!game.user.isGM) {return;}
		if (this.hasCombatantRanStartCombatTrigger(comb)) {
			return;
		}
		await this.setCombatantRanStartCombatTrigger(comb);
		const token = comb.token as PToken;
		const situation : Situation = {
			activeCombat : true,
			user: comb.actor.accessor,
			triggeringCharacter: comb.actor.accessor,
		};
		const CR = await TriggeredEffect
			.autoTriggerToCR('on-combat-start', token.actor, situation);
		if (CR) {
			await CR?.toMessage('Triggered Effect', token.actor);
		}
	}

	get validEngagementCombatants(): PersonaCombatant[] {
		return this.combatants.contents.filter( comb => {
			const actor = comb.token.actor;
			if (!actor) {return false;}
			if (actor.hasStatus('charmed')) {return false;}
			if (!actor.isAlive()) {return false;}
			return true;
		}) as PersonaCombatant[];

	}

	override async startCombat() {
		let msg = '';
		this._engagedList = new EngagementList(this);
		await this._engagedList.flushData();
		const assumeSocial = !(this.combatants.contents.some(comb=> comb.actor && comb.actor.system.type == 'shadow'));
		const regionMods: UniversalModifier["id"][] = [];
		const region = Metaverse.getRegion();
		if (region) {
			regionMods.push(...region.parent.getRoomEffects());
		} else {
		const rmods = (game.scenes.current as PersonaScene).getRoomEffects();
			regionMods.push(...rmods);
		}
		// const regionMods = Metaverse.getRegion()?.roomEffects.map(x=> x.id) ?? [];
		const combatInit = await this.roomEffectsDialog(regionMods, assumeSocial);
		await this.setSocialEncounter(combatInit.isSocialScene);
		if (combatInit.isSocialScene != this.isSocial) {
			throw new PersonaError('WTF Combat not updating!');
		}
		if (combatInit.isSocialScene) {
			if (PersonaSettings.debugMode() === false) {
				await Metaverse.exitMetaverse();
			}
			await PersonaSocial.startSocialCombatRound(combatInit.disallowMetaverse, combatInit.advanceCalendar);
		}
		const mods = combatInit.roomModifiers;
		await this.setRoomEffects(mods);
		await this.setEscalationDie(0);

		msg += this.roomEffectsMsg();
		if (msg.length > 0) {
			const messageData: MessageData = {
				speaker: {alias: 'Combat Start'},
				content: msg,
				style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			};
			await ChatMessage.create(messageData, {});
		}
		const starters = this.combatants.contents.map( comb => comb?.actor?.onCombatStart())
			.filter (x=> x != undefined);
		await Promise.all(starters);
		void this.refreshActorSheets();
		const unrolledInit = this.combatants
			.filter( x=> x.initiative == undefined)
			.map( c=> c.id);
		if (!this.isSocial) {
			await TriggeredEffect.autoApplyTrigger('on-combat-start-global');
		}
		if (unrolledInit.length > 0) {
			await this.rollInitiative(unrolledInit);
		}
		return await super.startCombat();
	}

	override async delete() : Promise<void> {
		await this.onEndCombat();
		return await super.delete();
	}

	async onEndCombat() : Promise<void> {
		if (!game.user.isGM) {return;}
		void this.refreshActorSheets();
		await this.generateTreasureAndXP();
		if (this.isSocial && await HTMLTools.confirmBox('Enter Meta', 'Enter Metaverse?', true)) {
			await Metaverse.enterMetaverse();
		}
		await this.combatantsEndCombat();
		if (this.didPCsWin()) {
			await this.clearFoes();
		}
	}

	didPCsWin(): boolean {
		const actorList = this.combatants.contents
			.map( x=> x?.actor)
			.filter (x=> x !== undefined);
		const isPCStanding = actorList
			.some ( c=> c.isAlive() && c.getAllegiance() === 'PCs');
		const isShadowStanding = actorList
			.some ( c=> c.isAlive() && c.getAllegiance() === 'Shadows');
		const PCsWin = isPCStanding && !isShadowStanding;
		return PCsWin;
	}

	async combatantsEndCombat() : Promise<void> {
		await this.endCombatTriggers();
		await this.reviveFallenActors();
		const promises = this.combatants.contents.map( async (c) => {
			try {
				await c.actor?.onEndCombat();
			} catch (e) {
				PersonaError.softFail(e);
				console.warn(e);
			}
		});
		const nav = PersonaDB.getNavigator();
		if (nav) {
			await nav.onEndCombat();
		}
		await Promise.allSettled(promises);
	}

	async reviveFallenActors(): Promise<void> {
		const promises = this.combatants.contents
		.filter( combatant=> combatant.actor != undefined
			&& !combatant.actor.hasStatus('full-fade')
		)
		.map( async (combatant) => {
			const actor = combatant.actor!;
			if (actor.isFading()) {
				await actor.modifyHP(1);
			}
		});
		await Promise.allSettled(promises);
	}

	async endCombatTriggers() : Promise<void> {
		if (this.isSocial) {return;}
		const PCsWin = this.didPCsWin();
		const promises = this.combatants
		.filter (x=> x.actor != undefined)
		.map( async (comb) => {
			const situation : Situation = {
				trigger: 'on-combat-end',
				triggeringUser: game.user,
				hit: PCsWin,
				triggeringCharacter: comb.actor!.accessor,
				user: comb.actor!.accessor,
			};
			const CR =  await TriggeredEffect.autoTriggerToCR('on-combat-end', comb.actor, situation);
			return await CR?.toMessage('End Combat Triggered Effect', comb.actor);
		});
		await Promise.allSettled(promises);
		const CR = await TriggeredEffect.autoTriggerToCR('on-combat-end-global');
		await CR?.toMessage('End Combat Global Trigger', undefined);
	}

	async checkEndCombat() : Promise<boolean> {
		if (this.isSocial) {return false;}
		const winner = this.combatants.find(x=>
			x.actor != undefined
			&& x.actor.isAlive()
			&& !this.getAllies(x)
			.some( ally => ally.actor && ally.actor.hasStatus('charmed'))
			&& !this.getFoes(x)
			.some(f => !f.isDefeated)
		);
		if (winner) {
			if (await this.endCombat()) {
				return true;
			}
		}
		return false;
	}

	async refreshActorSheets(): Promise<void> {
		for (const comb of this.combatants) {
			const actor= comb.token?.actor;
			if (!actor) {continue;}
			if (actor.sheet._state > 0) {
				await actor.sheet?.render(true);
			}
		}
	}

	override async endCombat() : Promise<boolean> {
		const dialog = await HTMLTools.confirmBox('End Combat', 'End Combat?');
		if (dialog == false) {return false;}
		const nextCombat = await this.checkForConsecutiveCombat();
		if (!nextCombat) {
			await this.delete();
			return true;
		}
		await this.prepareForNextCombat();
		return true;
	}

	async prepareForNextCombat() {
		const actors = await this.clearFoes();
		this.defeatedFoes = this.defeatedFoes.concat(actors);
		for (const comb of this.combatants) {
			try {
				const actorType = comb.actor?.system?.type;

				switch (actorType) {
					case 'pc':
					case'npcAlly':
						await comb.update({'initiative': null});
						break;
					case 'shadow':
						break;
					case undefined:
						break;
					default:
						actorType satisfies never;
						PersonaError.softFail(`${actorType as string} is an invalid Actor type for a combatant`);
						break;
				}
			} catch {
				PersonaError.softFail(`Error resetting initiative for ${comb?.name}`);
			}
		}
		await this.update({ 'round': 0, });
	}

	async clearFoes() : Promise<ValidAttackers[]> {
		if (this.isSocial) {return [];}
		const combatantsToDelete = this.combatants
		.filter(x => x.token != undefined
			&& x.actor != undefined
			&& !x.actor.isAlive()
			&& x.actor.system.type == 'shadow'
			&& !x.token.isLinked);
		const tokensToDelete = combatantsToDelete.map( x=> x.token.id);
		await game.scenes.current.deleteEmbeddedDocuments('Token', tokensToDelete);
		return combatantsToDelete.flatMap(x=> x.actor ? [x.actor] : []);
	}

	async checkForConsecutiveCombat() : Promise<boolean> {
		try {
			const region = CombatScene.instance && game.scenes.active == CombatScene.instance.scene ? CombatScene.instance.region : Metaverse.getRegion();
			if (!region)  {return false;}
			this.consecutiveCombat += 1;
			const check = await region.presenceCheck('secondary', -this.consecutiveCombat);
			if (!check) {
				this.consecutiveCombat = 0;
				return false;
			}
			return true;
		} catch (e) {
			if (e instanceof Error) {
				PersonaError.softFail(`Error with checking for consecutive combats: ${e.message}`, e);
			}
			this.consecutiveCombat = 0;
			return false;
		}
	}

	validCombatants(attacker?: PToken): Combatant<ValidAttackers>[] {
		const challenged = attacker?.actor.hasStatus('challenged');
		return this.combatants.contents.filter( x=> {
			if (!x.actor) {return false;}
			if (attacker == x.token) {return true;}
			if (challenged || x.actor.hasStatus('challenged')) {
				if (!this.isEngaging(PersonaDB.getUniversalTokenAccessor(attacker!), PersonaDB.getUniversalTokenAccessor(x.token as PToken))) {
					return false;
				}
			}
			return true;
		}) as Combatant<ValidAttackers>[];
	}

	async ensureSheetOpen(combatant: Combatant<ValidAttackers>) {
		if (!combatant.actor) {return;}
		for (const comb of this.combatants) {
			if (comb != combatant && comb.actor && comb.actor.sheet._state >= 0)
			{comb.actor.sheet.close();}
		}
		if (combatant.actor.sheet._state <= 0) {
			await combatant.actor.sheet.render(true);
		}
	}

	async startCombatantTurn( combatant: Combatant<PersonaActor>){
		if (!PersonaCombat.isPersonaCombatant(combatant)) {return;}
		const baseRolls : Roll[] = [];
		const rolls : RollBundle[] = [];
		const actor = combatant.actor;
		if (!actor) {return;}
		if (actor.isOwner && !game.user.isGM)
		{TurnAlert.alert();}
		if (!game.user.isGM) {return;}
		if (await this.checkEndCombat() == true) {
			return;
		}
		await actor.refreshActions();
		if (!combatant.actor?.hasPlayerOwner) {
			await this.ensureSheetOpen(combatant);
		}
		let startTurnMsg = [ `<u><h2> Start of ${combatant.token.name}'s turn</h2></u><hr>`];
		const engaged = this.getAllEngagedEnemies(combatant);
		if (engaged.length > 0) {
			const engagedMsg  = `<div> <b>Engaged By:</b> ${engaged.map(x=> x.name).join(', ')}</div>`;
			startTurnMsg.push(engagedMsg);
		}
		startTurnMsg = startTurnMsg.concat(
			await (actor as PC | Shadow).onStartCombatTurn(),
			this.handleStartTurnEffects(combatant),
		);
		await this.execStartingTrigger(combatant);
		const openingReturn = await this.execOpeningRoll(combatant);
		if (openingReturn) {
			const {data, roll} = openingReturn;
			const openerMsg = await foundry.applications.handlebars.renderTemplate('systems/persona/parts/openers-list.hbs', {roll, openers: data, combatant});
			startTurnMsg.push(openerMsg);
			baseRolls.push(roll);
		}
		const speaker = {alias: 'Combat Turn Start'};
		const messageData = {
			speaker: speaker,
			content: startTurnMsg.join('<br>'),
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			rolls: rolls.map(r=> r.roll).concat(baseRolls),
			sound: rolls.length + baseRolls.length > 0 ? CONFIG.sounds.dice : undefined
		};
		const msg = await ChatMessage.create(messageData, {});
		const actorOwner = actor.getPrimaryPlayerOwner();
		if (actorOwner) {
			await sleep(2000);
			await msg.update({'author': actorOwner});
		}
	}

	static addOpeningActionListeners(elem: JQuery) : void {
		elem.find('a.option-target').on('click', this.activateTargettedOpener.bind(this));
		elem.find('a.simple-action').on('click', this.activateGeneralOpener.bind(this));

	}

	static async activateGeneralOpener (ev: JQuery.ClickEvent) {
		if (!await HTMLTools.confirmBox('use this opener?', 'use this opener?')) {return;}
		const combatantId = HTMLTools.getClosestData(ev,'combatantId');
		const powerId = HTMLTools.getClosestDataSafe(ev,'powerId', '');
		const combatant = this.#ensureActivatingCharacterValid(combatantId);
		const options = HTMLTools.getClosestDataSafe(ev, 'optionEffects', '');
		if (!combatant) {return;}
		if (!powerId) {
			this.execSimpleAction(options);
			await this.chooseOpener(ev);
			return;
		}
		const power = combatant.actor.getUsableById(powerId);
		if (!power) { return; }
		if (power && combatant.actor?.canUseOpener()) {
			await this.usePower(combatant.token as PToken, power);
			await this.chooseOpener(ev);
		} else {
			ui.notifications.warn("Can't use opener here");
		}
	}

	static execSimpleAction(options: string) {
		options = options.trim();
		if (options.length == 0) {return;}
		switch (options.trim() as OptionEffect) {
			case 'disengage':
				//TODO handle disengage later
		}
		ui.notifications.notify('Executing simple action');
	}

	static async activateTargettedOpener( ev: JQuery.ClickEvent) {
		if (!await HTMLTools.confirmBox('use this opener?', 'use this opener?')) {return;}
		const combatantId = HTMLTools.getClosestData(ev,'combatantId');
		const powerId = HTMLTools.getClosestData(ev,'powerId');
		const targetId = HTMLTools.getClosestData(ev,'targetId');
		const combatant = this.#ensureActivatingCharacterValid(combatantId);
		if (!combatant) {return;}
		const power = combatant.actor.getUsableById(powerId);
		if (!power) { return; }
		const target = combatant.parent?.combatants.find(c=> c.id == targetId);
		if (!target) {
			PersonaError.softFail(`Cant find target Id ${targetId}`);
			return;
		}
		if (combatant.actor?.canUseOpener()) {
			await this.usePower(combatant.token as PToken, power, [(target as PersonaCombatant).token]);
			await this.chooseOpener(ev);
		}
	}

	static async chooseOpener(event: JQuery.ClickEvent) {
		const actionName = $(event.currentTarget).parents('li.opener-option').find('.option-name').text().trim();
		const chatMsgId = HTMLTools.getClosestData(event, 'messageId');
		const msg = game.messages.get(chatMsgId);
		if (!msg) {return;}
		const choice = $(`<div class='opener-choice'>
			<span>Chosen Opener:</span>
			<span>${actionName}</span>
			</div>`);
		const targetToReplace = $(msg.content).find('.opener-choices');
		const replacedData = targetToReplace.empty();
		replacedData.append(choice);
		const newContent = replacedData
			.parents().last().html();
		if (newContent) {
			await msg.update( {'content': newContent});
		}
	}

	static #ensureActivatingCharacterValid(combatantId: PersonaCombatant['id']): PersonaCombatant | undefined {
		const currentCombat = game.combat as PersonaCombat | undefined;
		const combatant = currentCombat?.combatant;
		if (!currentCombat || !combatant || !combatant.actor) {return;}
		if (combatant?.id != combatantId) {
			ui.notifications.warn('Not your turn');
			return;
		}
		return combatant as PersonaCombatant;
	}


	async execStartingTrigger(combatant: PersonaCombat['combatant']) {
		const triggeringCharacter  = (combatant as Combatant<ValidAttackers>)?.token?.actor;
		if (triggeringCharacter != undefined) {
			for (const user of this.combatants) {
				if (user.token.actor == undefined) {continue;}
				const situation : Situation = {
					trigger: "start-turn",
					triggeringCharacter: triggeringCharacter.accessor,
					triggeringUser: game.user,
					user: user.token.actor.accessor,
					activeCombat: true,
				};
				await TriggeredEffect.execCombatTrigger('start-turn', user.token.actor, situation);
				// console.log(`Triggering Start turn for ${triggeringCharacter.name} on ${user.name}`);
			}
		}
	}


	async execOpeningRoll( combatant: PersonaCombatant) : Promise<{data: OpenerOptionsReturn[], roll: Roll} | null> {
		const returns :OpenerOptionsReturn[]= [];
		if (this.isSocial) {return null;}
		const actor = combatant.actor;
		if (!actor) {return null;}
		const openingRoll = new Roll('1d20');
		await openingRoll.roll();
		const rollValue = openingRoll.total;
		const situation : Situation = {
			user: actor.accessor,
			naturalRoll: rollValue,
			rollTags: ['opening'],
			rollTotal: rollValue,
			activeCombat: true,
		};
		returns.push(
			await this.fadingRoll(combatant, situation),
			this.mandatoryOtherOpeners(combatant, situation),
			this.sleepEffect(combatant),
			this.saveVsDizzy(combatant, situation),
			this.saveVsFear(combatant, situation),
			// this.saveVsDespair(combatant, situation),
			this.saveVsConfusion(combatant, situation),
			this.saveVsCharm(combatant, situation),
			this.rageOpener(combatant, situation),
			this.disengageOpener(combatant, situation),
			this.otherOpeners(combatant, situation),
		);
		const mandatory = returns.find(r => r.options.some( o=> o.mandatory));
		if (mandatory) {
			return  {
				roll: openingRoll,
				data: [{
					msg: mandatory.msg,
					options: [mandatory.options.find(x=> x.mandatory)!],
				}]
			};
		};
		const data = returns.filter(x=> x.msg.length > 0);
		return {
			roll: openingRoll,
			data,
		};
	}

	mockOpeningSaveTotal( combatant: Combatant<ValidAttackers> , situation: Situation, status: StatusEffectId) : number | undefined {
		const rollValue = situation.naturalRoll ?? -999;
		if (!combatant.actor) {return undefined;}
		const statusEffect = combatant.actor.getStatus(status);
		if (!statusEffect && status != 'fading') {return undefined;}
		const saveSituation : Situation = {
			...situation,
			saveVersus: status
		};
		const saveBonus = combatant.actor.persona().getBonuses('save').total(saveSituation);
		return saveBonus + rollValue;
	}

	sleepEffect( combatant: Combatant<ValidAttackers>) : OpenerOptionsReturn {
		const options : OpenerOptionsReturn['options'] = [];
		const msg : string[] = [];
		if (!combatant?.actor?.hasStatus('sleep'))  {
			return {msg, options};
		}
		msg.push('Sleeping');
		options.push({
			optionName: 'Sleep Soundly',
			mandatory: true,
			optionEffects: [],
		});
		return {msg, options};
	}

	saveVsCharm ( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
		const options : OpenerOptionsReturn['options'] = [];
		const msg : string[] = [];
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'charmed');
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Charm (${saveTotal}) -->`);
		switch (true) {
			case (saveTotal >= 16): {
				msg.push('Success (Remove Charm)');
				options.push({
					optionName: 'Clear Charm and act normally (Lose opening action)',
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			case (saveTotal >= 11): {
				msg.push('Success (Dazed)');
				options.push({
					optionName: 'You stand around and do nothing',
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			case (saveTotal < 6) : {
				msg.push('Failure (Buff, Heal or attack)');
				options.push({
					optionName: 'Charmed',
					toolTip: 'The enemy chooses your action , causing you to cast a single target healing or buffing effect on an enemy or making a basic attack against an ally',
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			default:
				msg.push('Failure (Basic Attack)');
				options.push({
					optionName: "Basic Attack against an ally of the enemy's choice",
					mandatory: true,
					optionEffects: [],
				});
		}
		return {msg, options};
	}

	saveVsConfusion ( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
		const options : OpenerOptionsReturn['options'] = [];
		const msg : string[] = [];
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'confused');
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Confusion (${saveTotal}) -->`);
		switch (true) {
			case (saveTotal >= 16):{
				msg.push('Success');
				break;
			}
			case (saveTotal <= 5):{
				msg.push('Failure (Miss Turn + lose 10% Resources)');
				options.push({
					optionName: 'Throw Away Money (Miss Turn + lose 10% Resources)',
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			default:
				msg.push('Failure (Miss Turn)');
				options.push({
					optionName: 'Stand around confused (Miss Turn)',
					mandatory: true,
					optionEffects: [],
				});
		}
		return {msg, options};
	}

	saveVsDespair ( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
		const options : OpenerOptionsReturn['options'] = [];
		const msg : string[] = [];
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'despair');
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Despair (${saveTotal}) -->`);
		switch (true) {
			case (saveTotal >= 11):{
				msg.push('Success');
				break;
			}
			default:
				msg.push('Failure (Miss Turn)');
				options.push({
					optionName: 'Wallow in Despair (Miss Turn)',
					mandatory: true,
					optionEffects: [],
				});
		}
		return {msg, options};
	}

	saveVsDizzy( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
		const options : OpenerOptionsReturn['options'] = [];
		const msg : string[] = [];
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'dizzy');
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Dizzy (${saveTotal}) -->`);
		if (saveTotal >= 6){
			msg.push('Success');
			return {msg, options};
		}
		msg.push('Do Nothing (Miss Turn)');
		options.push({
			optionName: 'Why is Everything Spinning?',
			mandatory: true,
			optionEffects: [],
		});
		return {msg, options};
}

	saveVsFear( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
		const options : OpenerOptionsReturn['options'] = [];
		const msg : string[] = [];
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'fear');
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Fear (${saveTotal}) -->`);
		switch (true) {
			case (saveTotal >= 11):{
				msg.push('Success');
				break;
			}
			case (saveTotal <= 2) : {
				msg.push('Failure (Flee)');
				options.push({
					optionName: 'Flee from Combat',
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			default:
				msg.push('Failure (Miss Turn)');
				options.push({
					optionName: 'Cower in Fear (Miss Turn)',
					mandatory: true,
					optionEffects: [],
				});
		}
		return {msg, options};
	}

	rageOpener( combatant: Combatant<ValidAttackers> , _situation: Situation) : OpenerOptionsReturn {
		const msg : string[] = [];
		const options : OpenerOptionsReturn['options'] = [];
		if (combatant?.actor?.hasStatus('rage')) {
			msg.push('Battle Rage');
			options.push({
				optionName: 'Attack nearest random enemy',
				mandatory: true,
				optionEffects: [],
			});
		}
		return {msg, options};
	}

	disengageOpener( combatant: PersonaCombatant, situation: Situation) :OpenerOptionsReturn {
		const options : OpenerOptionsReturn['options'] = [];
		const msg : string[] = [];
		const rollValue = situation.naturalRoll ?? -999;
		if (!situation.rollTags?.includes('opening')) {return {msg, options};}
		if (!combatant.actor?.isCapableOfAction()
			|| combatant.actor?.hasStatus('challenged')
		) {
			return {msg, options};
		}
		const accessor = PersonaDB.getUniversalTokenAccessor(combatant.token as PToken);
		if (!this.isEngagedByAnyFoe(accessor)) {
			const ret : OpenerOptionsReturn = {
				msg, options
			};
			return ret;
		}
		const alliedDefenders = this.getAlliedEngagedDefenders(accessor);
		if (alliedDefenders.length > 0) {
			msg.push(`Can Freely disengage thanks to ${alliedDefenders.map(x=> x.name).join(', ')}`);
			return {msg, options};
		}
		if (!combatant.actor) {return { msg, options};}
		const disengageBonus = combatant.actor.persona().getBonuses('disengage').total(situation);
		const disengageTotal = disengageBonus + rollValue;
		msg.push( `Disengage Total: ${disengageTotal}`);
		switch (true) {
			case disengageTotal >= 16 :
				options.push( {
					optionName: 'Expert Disengage',
					optionEffects: ['disengage'],
					mandatory: false,
				});
				break;
			case disengageTotal >= 11: {
				const enemyDefenders = this.getEnemyEngagedDefenders(combatant);
				if (enemyDefenders.length == 0) {
					options.push( {
						optionName: 'Standard Disengage',
						optionEffects: ['disengage'],
						mandatory: false,
					});
				}
				break; 
			}
		}
		return { msg, options};
	}

	getOpenerPrintableName(usable: Usable, targetList: PersonaCombatant[]) : string  | undefined {
		const targets= targetList.map( target=> target.name);
		return `${usable.displayedName.toString()} (${targets.join(', ')}): ${usable.system.description}`;
	}

	mandatoryOtherOpeners( combatant: Combatant<ValidAttackers> , situation: Situation): OpenerOptionsReturn {
		let options : OpenerOptionsReturn['options'] = [];
		const msg : string[] = [];
		if (!combatant.actor) {return { msg, options};}
		const mandatoryActions = combatant.actor.openerActions.filter( x=> x.hasTag('mandatory'));
		const usableActions = mandatoryActions
			.filter( action => {
				const useSituation : Situation = {
					...situation,
					usedPower: action.accessor,
				};
				return action.testOpenerPrereqs(useSituation, combatant.actor!);
			});
		options = usableActions
			.flatMap( action =>  {
				const targets= this.getValidTargetsFor(action, combatant, situation);
				if (targets.length == 0) {return [];}
				return [{
					mandatory: action.hasTag('mandatory'),
					optionName: action.name,
					toolTip: action.system.description,
					optionEffects: []
				}] satisfies OpenerOption[];
			});
		if (options.length > 0) {
			msg.push('Special Actions');
		}
		return {msg, options};
	}

	otherOpeners( combatant: Combatant<ValidAttackers> , situation: Situation): OpenerOptionsReturn {
		let options : OpenerOptionsReturn['options'] = [];
		const msg : string[] = [];
		const actor = combatant.actor;
		if (!actor) {return { msg, options};}
		if (!actor.isCapableOfAction()) {
			return {msg, options};
		}
		const openerActions = actor.openerActions;
		const usableActions = openerActions
			.filter( action => {
				const useSituation : Situation = {
					...situation,
					usedPower: action.accessor,
				};
				if (!actor.persona().canPayActivationCost(action)) {return false;}
				return action.testOpenerPrereqs(useSituation, combatant.actor!);
			});
		options = usableActions
			.flatMap<OpenerOption>( action =>  {
				const targets= this.getValidTargetsFor(action, combatant, situation);
				if (targets.length == 0) {return [];}
				// const printableName = this.getOpenerPrintableName(action, targets);
				return [{
					mandatory: action.hasTag('mandatory'),
					optionName: action.name,
					toolTip: action.system.description,
					// optionTxt: printableName ?? "",
					optionEffects: [],
					power: {
						powerId: action.id,
						targets: action.requiresTargetSelection() ? targets: undefined,
					}
				}] satisfies OpenerOption[];
			});
		if (options.length > 0) {
			msg.push('Other Available Options');
		}
		return {msg, options};
	}

	static isSameTeam( one: PToken | Combatant<ValidAttackers> | ValidAttackers, two: PToken | Combatant<ValidAttackers> | ValidAttackers) : boolean {
		const actor1 = one instanceof PersonaActor ? one: one.actor;
		const actor2 = two instanceof PersonaActor ? two: two.actor;
		if (!actor1 || !actor2) {return false;}
		return actor1.getAllegiance() == actor2.getAllegiance();
	}

	toCombatant(c: IntoCombatant) : PersonaCombatant | undefined {
		if (c instanceof Combatant) {return c;} 
		if (PersonaDB.isTokenAccessor(c))  {
			const tok= PersonaDB.findToken(c);
			return this.findCombatant(tok);
		}
		if (PersonaDB.isActorAccessor(c)) {
			const actor = PersonaDB.findActor(c);
			return this.findCombatant(actor);
		}
		throw new Error('Illegal Argument passed to toCombatant');
	}

	getEnemyEngagedDefenders(x: IntoCombatant) : PersonaCombatant[] {
		const comb = this.toCombatant(x);
		if (!comb) {
			PersonaError.softFail("Can't find Combatant", x);
			return [];
		}
		const meleeCombatants = EngagementChecker.listOfCombatantsInMelee(comb, this);
		return meleeCombatants
			.filter( x=> x.actor && x.actor.hasDefenderAura()
				&& !PersonaCombat.isSameTeam(comb,x )
				&& x.actor.canEngage()
			);


	}

	getAlliedEngagedDefenders(Tacc: UniversalTokenAccessor<PToken>) : PersonaCombatant[];
	getAlliedEngagedDefenders(comb: PersonaCombatant  ) : PersonaCombatant[];
	getAlliedEngagedDefenders(Tacc: UniversalTokenAccessor<PToken> | PersonaCombatant) : PersonaCombatant[] {
		const comb = this.toCombatant(Tacc);
		if (!comb) {
			PersonaError.softFail("Can't find Combatant", Tacc);
			return [];
		}
		const meleeCombatants = EngagementChecker.listOfCombatantsInMelee(comb, this);
		return meleeCombatants
			.filter( x=> x.actor && x.actor.hasDefenderAura()
				&& PersonaCombat.isSameTeam(comb,x )
				&& x.actor.canEngage()
			);
	}

	getValidTargetsFor(usable: Usable, user: Combatant<ValidAttackers>, situation: Situation): PersonaCombatant[] {
		const userActor = user.token.actor;
		if (!userActor) {return [];}
		return this.combatants
			.filter( comb =>  {
				const targetActor = comb.token.actor;
				if (!targetActor) {return false;}
				if (!PersonaCombat.isPersonaCombatant(comb)) {return false;}
				return this.isValidTargetFor( usable, user, comb, situation);
			}) as PersonaCombatant[];
	}

	static isPersonaCombatant(comb: Combatant<PersonaActor>) : comb is PersonaCombatant {
		return comb.actor?.isValidCombatant() == true;
	}

	isValidTargetFor(usable: Usable, user: Combatant<ValidAttackers>, target: Combatant<ValidAttackers>, situation: Situation): boolean {
		const userActor = user.token.actor;
		const targetActor = target.token.actor;
		if (!userActor || !targetActor) {return false;}
		if (!usable.isValidTargetFor(userActor, targetActor, situation))
		{return false;}
		const targetChallenged = targetActor.hasStatus('challenged');
		const userChallenged = userActor.hasStatus('challenged');
		if (userChallenged) {
			if (!targetChallenged) {return false;}
			if (!this.isInChallengeWith(user, target))
			{return false;}
		} else {
			if (targetChallenged) {return false;}
		}
		return true;
	}

	isInChallengeWith(user: Combatant<ValidAttackers>, target: Combatant<ValidAttackers>) : boolean {
		const userActor = user.token.actor;
		const targetActor = target.token.actor;
		if (!userActor || !targetActor) {return false;}
		if (!userActor.hasStatus('challenged'))
		{return false;}
		if (!targetActor.hasStatus('challenged'))
		{return false;}
		return EngagementChecker.isWithinEngagedRange(user.token as PToken, target.token as PToken);

	}

	getAllEngagedEnemies(subject: PersonaCombatant): PersonaCombatant[] {
		return EngagementChecker.getAllEngagedEnemies(subject, this);
	}
	getDisengageDC(combatant: PersonaCombatant) : number {
		if (!combatant.token) {return 11;}
		const list = EngagementChecker.getAllEngagedEnemies(combatant, this);
		for (const item of list) {
			if (item.actor && item.actor.hasDefenderAura()) {return 16;}
		}
		return 11;
	}

	async skipBox(msg: string) {
		if (await HTMLTools.confirmBox(msg, msg)) {
			await this.nextTurn();
		}
	}

	async endTurn(combatant: Combatant<ValidAttackers>) {
		const actor = combatant.actor;
		if (!actor) {return;}
		if (!actor.isOwner) {return;}
		if (this.isSocial) {
			if (!actor.isPC()) {return;}
			await PersonaSocial.endSocialTurn(actor);
			return;
		}
		const triggeringCharacter  = (combatant)?.token?.actor?.accessor;
		if (triggeringCharacter) {
			for (const user of this.combatants) {
				if (user.token.actor == undefined) {continue;}
				const situation : Situation = {
					trigger: 'end-turn',
					triggeringUser: game.user,
					triggeringCharacter,
					user: user.token.actor.accessor,
					activeCombat: true,
				};
				const CR = await TriggeredEffect.autoTriggerToCR('end-turn', user.actor, situation);
				await CR?.toMessage('On End Turn', combatant.actor);
				// await PersonaCombat.execTrigger("end-turn", user.token.actor as ValidAttackers, situation);
			}
		}
		const notes = await actor?.onEndCombatTurn() ?? [];
		if (notes.length > 0) {
			const messageData: MessageData = {
				speaker: {alias: 'End of Turn'},
				content: notes.join('<br>'),
				style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			};
			await ChatMessage.create(messageData, {});
		}
	}

	async fadingRoll( combatant: Combatant<ValidAttackers> , situation: Situation) : Promise<OpenerOptionsReturn> {
		const options : OpenerOptionsReturn['options'] = [];
		const msg : string[] = [];
		if (!situation.rollTags?.includes('opening')) {return {msg, options};}
		const actor = combatant.actor;
		if (
			!actor
			|| actor.hp > 0
			|| actor.isShadow()
		) {return  {msg, options}; }
		if (!actor.isUsingMetaPod()) {
			msg.push(`${combatant.name} is currently downed (no safety systems)`);
			options.push({
				optionName: 'Lie there helplessly (fight in spirit only)',
				mandatory: true,
				optionEffects: [],
			});
			return { msg, options};
		}
		if (actor.hasStatus('full-fade')) {
			msg.push(`${combatant.name} is completely faded...`);
			options.push({
				optionName: 'Completely Faded (Help in Spirit only)',
				mandatory: true,
				optionEffects: [],
			});
			return { msg, options};
		}
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'fading');
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Fading (${saveTotal}) -->`);
		switch (true) {
			case situation.naturalRoll == 20
					&& (actor as PC).getSocialSLWithTarot('Star') >= 3: {
						msg.push('Critical Success');
						options.push({
							optionName: 'Star Benefit ( get up at 1 HP)',
							mandatory: true,
							optionEffects: [],
						});
						break;
					}
			case (saveTotal >= 11):{
				msg.push('Success');
				options.push({
					optionName: `${actor.hasStatus('fading') ? 'Barely ' : ''}Hanging On (Help in Spirit Only)`,
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			default: {
				msg.push('Failure');
				await actor.increaseFadeState();
				const fadeState = actor.hasStatus('fading') ? 'Starting to Fade Away' : 'Fully Fade Away (Ejected from Metaverse)';
				options.push({
					optionName: `${fadeState} (Help in Spirit Only)`,
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
		}
		return { msg, options};
	}

	handleStartTurnEffects(combatant: Combatant<ValidAttackers>): string[] {
		const actor= combatant.actor;
		if (!actor) {return [];}
		const Msg: string[] = [];
		const debilitatingStatuses :StatusEffectId[] = [
			'sleep',
			'shock'
		];
		const debilitatingStatus = actor.effects.find( eff=> debilitatingStatuses.some( debil => eff.statuses.has(debil)));
		if (debilitatingStatus) {
			const msg =  `${combatant.name} can't take actions normally because of ${debilitatingStatus.name}`;
			Msg.push(msg) ;
			if (actor.system.type == 'shadow') {
				void this.skipBox(`${msg}. <br> Skip turn?`); //don't await this so it processes the rest of the code
			}
		}
		const despair = actor.hasStatus('despair');
		const burnStatus = actor.effects.find( eff=> eff.statuses.has('burn'));
		if (burnStatus) {
			const damage = burnStatus.potency;
			Msg.push(`${combatant.name} is burning and will take ${damage} damage at end of turn. (original Hp: ${actor.hp})`);
		}
		if (despair && actor.isPC()) {
			const drain = actor.despairMPDamage();
			Msg.push(`${combatant.name} is feeling despair and will lose ${drain} MP at end of turn. (original MP: ${actor.mp}`);
		}
		const poisonStatus = actor.effects.find( eff=> eff.statuses.has('poison'));
		if (poisonStatus) {
			const damage = actor.getPoisonDamage();
			Msg.push(`${combatant.name} is poisoned and will take ${damage} damage on each action. (original Hp: ${actor.hp})`);
		}
		return Msg;
	}

	get engagedList() : EngagementList {
		if (!this._engagedList)  {
			this._engagedList = new EngagementList(this);
		}
		return this._engagedList;
	}

	static async checkPowerPreqs(attacker: PToken, power: UsableAndCard) : Promise<boolean> {
		const combat = game.combat as PersonaCombat;
		if (combat && !combat.turnCheck(attacker, power)) {
			if (!game.user.isGM) {
				ui.notifications.warn("It's not your turn!");
				return false;
			} else {
				if (!await HTMLTools.confirmBox('Out of turn Action', "It's not your turn, act anyway?")) {
					return false;
				}
			}
		}
		if (!attacker.actor.persona().canPayActivationCost(power)) {
			ui.notifications.notify("You can't pay the activation cost for this power");
			return false;
		}
		if (!attacker.actor.persona().canUsePower(power)) {
			ui.notifications.notify("You can't Use this power");
			return false;
		}
		return true;
	}

static async usePower(attacker: PToken, power: UsableAndCard, presetTargets ?: PToken[], options : CombatOptions = {}) : Promise<FinalizedCombatResult> {
	if (attacker instanceof Token) {
		throw new Error('Actual token found instead of token document');
	}
	if (!options.ignorePrereqs && !await this.checkPowerPreqs(attacker, power)) {
		return new CombatResult().finalize();
	}
	try {
		const targets = presetTargets ? presetTargets :  this.getTargets(attacker, power);
		if (!power.isSkillCard() && targets.some( target => target.actor.system.type == 'shadow' ) && (power).system.targets != 'self' ) {
			this.ensureCombatExists();
		}
		if (options.askForModifier) {
			this.customAtkBonus = await HTMLTools.getNumber('Attack Modifier');
		} else {
			this.customAtkBonus = 0;
		}
		const result = new CombatResult();
		if (!options.simulated) { await PersonaSFX.onUsePower(power);}
		result.merge(await this.usePowerOn(attacker, power, targets, 'standard', options));
		const costs = await this.#processCosts(attacker, power, result.getOtherEffects(attacker.actor));
		result.merge(costs);
		const finalizedResult = result.finalize();
		if (options.simulated) { return finalizedResult;}
		if (!power.isOpener())  {
			await attacker.actor.expendAction();
		}
		await attacker.actor.removeStatus('baton-pass');
		await finalizedResult.toMessage(power.name, attacker.actor);
		await sleep(750); //allopw bonus action statuses and such to be placed;
		await this.postActionCleanup(attacker, result);
		return finalizedResult;
	} catch(e) {
		if (e instanceof CanceledDialgogError) {
			throw e;
		}
		console.log(e);
		throw e;
	}
}

	static async postActionCleanup(attacker: PToken, result: CombatResult ) {
		await this.afterActionTriggered(attacker, result);
		const power = result.power;
		if (!power) {return;}
		const combat= game.combat as PersonaCombat | undefined;
		if (!combat?.combatant || !PersonaCombat.isPersonaCombatant(combat.combatant)) {return;}
		if (combat && combat.combatant?.token == attacker) {
			const shouldEndTurn =
				(
					combat.hasRunOutOfActions(combat.combatant)
					|| power == PersonaDB.getBasicPower('All-out Attack')
				) ;
			const autoEndTurn = PersonaSettings.autoEndTurn() && shouldEndTurn;
			if (shouldEndTurn) {
				if (autoEndTurn) {
					if (combat.forceAdvanceTurn) {
						await combat.setForceEndTurn(false);
					}
					await combat.nextTurn();
					return;
				}
				await combat.displayEndTurnMessage();
			} else {
				await this.displayActionsRemaining(combat.combatant);
			}
		}
	}

	static async displayActionsRemaining(combatant: PersonaCombatant) : Promise<ChatMessage> {
		const token = combatant?.token as PToken;
		const boldName = `<b>${token.name}</b>`;
		const actor = combatant.actor;
		const actionsRemaining = actor.actionsRemaining + ( actor.hasStatus('bonus-action') ? 1 : 0);
		const content = `<div>${boldName} has ${actionsRemaining} actions remaining.</div>`;
		const messageData: Foundry.MessageData = {
			speaker: {
				alias: actor.displayedName ?? 'ERROR'
			},
			content,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		return await ChatMessage.create(messageData, {});
	}

	hasRunOutOfActions(combatant: Combatant<ValidAttackers>) : boolean {
		if (!combatant.actor) {return false;}
		const moreActions = combatant.actor.actionsRemaining || combatant.actor.hasStatus('bonus-action');
		const shouldEndTurn =
			(
				!moreActions
				|| this?.forceAdvanceTurn
			);
		return shouldEndTurn;
	}

	async displayEndTurnMessage(): Promise<ChatMessage | null>  {
		const combatant = this.combatant;
		const actor = combatant?.actor;
		const token = combatant?.token as PToken;
		if (!actor || !token)  {
			PersonaError.softFail('No actor for endTurn Message');
			return null;
		}
		const boldName = `<b>${token.name}</b>`;
		let content = `<div>${boldName} has run out of actions.</div>`;
		const pushMsg = `<div> ${boldName} can take an additional action by pushing themself, but this inflicts 1 fatigue level`;
		if (actor.fatigueLevel > 0 ) {
			content = content  + pushMsg;
		}
		if (actor.canEngage() && !this.isEngagedByAnyFoe(PersonaDB.getUniversalTokenAccessor(token))) {
			content += `<div> ${boldName} can choose target to engage</div>`;
		}
		content = `<div class="end-turn-msg"> ${content} </div>`;
		const messageData: Foundry.MessageData = {
			speaker: {
				alias: actor.displayedName ?? 'ERROR'
			},
			content,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		return await ChatMessage.create(messageData, {});
	}

	get forceAdvanceTurn() : boolean {
		return this.getFlag<boolean>('persona', 'autoEndTurn') ?? false;
	}

	async setForceEndTurn(val = true): Promise<void> {
		await this.setFlag('persona', 'autoEndTurn', val);
	}

	static async afterActionTriggered(attacker: PToken, combatResult: CombatResult) {
		const situation : Situation = {
			trigger: 'on-use-power',
			user: attacker.actor.accessor,
			usedPower: combatResult.power?.accessor,
			triggeringCharacter : attacker.actor.accessor,
			triggeringUser: game.user,
			combatResult,
		};
		await TriggeredEffect.execCombatTrigger('on-use-power', attacker.actor, situation);

	}

	static async getSimulatedResult(attacker: PToken, power: UsableAndCard, target: PToken, situation : AttackResult['situation']) : Promise<CombatResult>;
	static async getSimulatedResult(attacker: PToken, power: UsableAndCard, target: PToken, simNaturalRoll: number) : Promise<CombatResult>;
	static async getSimulatedResult(attacker: PToken, power: UsableAndCard, target: PToken, simSitOrNat: AttackResult['situation'] |  number) : Promise<CombatResult> {
		let situation : AttackResult['situation'];
		const combat = game.combat as PersonaCombat | undefined;
		if (typeof simSitOrNat == 'number') {
			const simNaturalRoll = simSitOrNat;
			situation = {
				user: attacker.actor.accessor,
				usedPower: PersonaDB.getUniversalItemAccessor(power),
				attacker: attacker.actor.accessor,
				target: target.actor.accessor,
				naturalRoll: simNaturalRoll,
				rollTags: ['attack'],
				rollTotal: simNaturalRoll,
				hit: true,
				addedTags: ['pierce'],
				criticalHit: false,
				activeCombat:combat && !combat.isSocial ? Boolean(combat.combatants.find( x=> x.actor?.system.type != attacker.actor.system.type)): false ,
			};
		} else {
			situation = simSitOrNat;
		}

		const simAtkResult : AttackResult = {
			result: 'hit',
			target: PersonaDB.getUniversalTokenAccessor(target),
			attacker: PersonaDB.getUniversalTokenAccessor(attacker),
			power: PersonaDB.getUniversalItemAccessor(power),
			ailmentRange: undefined,
			instantKillRange: undefined,
			situation,
			roll: null,
			critBoost: 0,
			// printableModifiers: []
		};
		const CR = await this.processEffects(simAtkResult);
		return CR;
	}

	static async usePowerOn(attacker: PToken, power: UsableAndCard, targets: PToken[], rollType : AttackRollType, options: CombatOptions = {}, modifiers: ModifierList = new ModifierList()) : Promise<CombatResult> {
		let i = 0;
		const result = new CombatResult();
		for (const target of targets) {
			let num_of_attacks = 1;
			if (power.isPower()) {
				const min = power.system.attacksMin ?? 1;
				const max = power.system.attacksMax ?? 1;
				num_of_attacks = Math.floor(min + (Math.random() * (max - min+1)));
			}
			for (let atkNum = 0; atkNum < num_of_attacks; atkNum++) {
				rollType = atkNum > 0 ? 'iterative': rollType;
				const atkResult = await this.processAttackRoll( attacker, power, target, modifiers, rollType == 'standard' && i==0 ? 'activation' : rollType, options);
				const this_result = await this.processEffects(atkResult);
				result.merge(this_result);
				if (atkResult.result == 'reflect') {
					result.merge(await this.usePowerOn(attacker, power, [attacker], 'reflect'));
				}
				const extraAttacks = this_result.findEffects('extra-attack');
				for (const extraAttack of extraAttacks)
				{
					const bonusRollType = typeof rollType != 'number' ? 0: rollType+1;
					const mods = new ModifierList();
					//TODO BUG: Extra attacks keep the main inputted modifier
					if (extraAttack.iterativePenalty) {
						mods.add('Iterative Penalty', (bonusRollType + 1) * extraAttack.iterativePenalty);
					}
					if (bonusRollType < extraAttack.maxChain) {
						const extra = await this.usePowerOn(attacker, power, [target], bonusRollType, options, mods);
						result.merge(extra);
					}
				}
				const execPowers = this_result.findEffects('use-power');
				for (const usePower of execPowers) {
					//TODO BUG: Extra attacks keep the main inputted modifier
					const newAttacker = this.getPTokenFromActorAccessor(usePower.newAttacker);
					const execPower = PersonaDB.allPowers().get( usePower.powerId);
					if (execPower && newAttacker) {
						const altTargets= this.getAltTargets(newAttacker, atkResult.situation, usePower.target );
						const newTargets = this.getTargets(newAttacker, execPower, altTargets);
						const extraPower = await this.usePowerOn(newAttacker, execPower, newTargets, 'standard', options);
						result.merge(extraPower);
					}
				}
				Hooks.callAll('onUsePower', power, attacker, target);
				i++;
			}
		}
		this.computeResultBasedEffects(result);
		return result;
	}

	static getPTokenFromActorAccessor(acc: UniversalActorAccessor<PersonaActor>) : PToken | undefined {
		const combat = game.combat;
		if (acc.token) {
			return PersonaDB.findToken(acc.token) as PToken;
		}
		const actor = PersonaDB.findActor(acc);
		if (combat)  {
			const comb = combat.combatants.find( c=> c.actor == actor);
			if (comb) {return comb.token as PToken;}
		}
		const tok = game.scenes.current.tokens.contents.find( tok => tok.actor == actor);
		if (tok) {return tok as PToken;}
		return undefined;
	}

	static computeResultBasedEffects(result: CombatResult) {
		//TODO: Put code to check for miss all targets in ehere
		return result;
	}

	static async processSkillCard( attacker: PToken, usableOrCard: UsableAndCard, target: PToken, situation: Situation) : Promise<AttackResult | null> {
		if (usableOrCard.system.type != 'skillCard') {
			return null;
		}
		const r = await new Roll('1d20').roll();
		const emptyList = new ModifierList();
		const roll = new RollBundle('Activation Roll Skiill Card', r, attacker.actor.system.type == 'pc', emptyList, situation);
		const combatRollSituation : CombatRollSituation = {
			...situation,
			naturalRoll: r.total,
			rollTags: [],
			rollTotal: r.total,
		};
		const res : AttackResult = {
			result: 'hit',
			target: PersonaDB.getUniversalTokenAccessor(target),
			attacker: PersonaDB.getUniversalTokenAccessor(attacker),
			power: usableOrCard.accessor,
			ailmentRange: undefined,
			instantKillRange: undefined,
			situation: combatRollSituation,
			roll,
			critBoost: 0,
			// printableModifiers: []
		};
		return res;
	}

	static processAttackNullifiers(attacker : PToken , power :Usable, target: PToken, baseData: Pick<AttackResult, 'attacker' | 'target'  | 'power' | 'roll'>, situation: Situation & RollSituation, rollType: AttackRollType): AttackResult | null
	{
		const naturalAttackRoll = situation.naturalRoll;
		const element = power.getDamageType(attacker.actor);
		const targetP = target.actor.persona();
		const resist = targetP.elemResist(element);
		const pierce = power.hasTag('pierce');
		switch (resist) {
			case 'reflect': {
				return {
					result: rollType != 'reflect' ? 'reflect': 'block',
					// printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					ailmentRange: undefined,
					instantKillRange: undefined,
					situation: {
						hit: false,
						criticalHit: false,
						...situation,
					},
					...baseData,
				};
			}
			case 'block': {
				if (pierce) {return null;}
				return {
					result: 'block',
					ailmentRange: undefined,
					instantKillRange: undefined,
					// printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					situation: {
						hit: false,
						criticalHit: false,
						...situation,
					},
					...baseData,
				};
			}
			case 'absorb' : {
				if (pierce) {return null;}
				return {
					result: 'absorb',
					ailmentRange: undefined,
					instantKillRange: undefined,
					// printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					situation: {
						...situation,
						hit: true,
						criticalHit: false,
						isAbsorbed: true,
					},
					...baseData,
				};
			}
		}
		if (target.actor.hasStatus('phys-shield') && power.canBeReflectedByPhyiscalShield(attacker.actor)) {
			return {
				result: rollType != 'reflect' ? 'reflect': 'block',
				// printableModifiers: [],
				ailmentRange: undefined,
				instantKillRange: undefined,
				validAtkModifiers: [],
				validDefModifiers: [],
				critBoost: 0,
				situation: {
					hit: false,
					criticalHit: false,
					...situation,
					naturalRoll: naturalAttackRoll,
				},
				...baseData,
			};
		}
		if (target.actor.hasStatus('magic-shield') && power.canBeReflectedByMagicShield(attacker.actor)) {
			return {
				result: rollType != 'reflect' ? 'reflect': 'block',
				// printableModifiers: [],
				ailmentRange: undefined,
				instantKillRange: undefined,
				validAtkModifiers: [],
				validDefModifiers: [],
				critBoost: 0,
				situation: {
					hit: false,
					criticalHit: false,
					...situation,
					naturalRoll: naturalAttackRoll,
				},
				...baseData,
			};
		}
		return null;
	}

static async processAttackRoll( attacker: PToken, usableOrCard: UsableAndCard, target: PToken, modifiers: ModifierList, rollType: AttackRollType, options: CombatOptions = {}) : Promise<AttackResult> {
	const combat = game.combat as PersonaCombat | undefined;
	const attackerPersona = attacker.actor.persona();
	const targetPersona = target.actor.persona();
	const rollTags: NonNullable<Situation['rollTags']> = ['attack'];
	const activationRoll = rollType == 'activation';
	if (activationRoll) {
		rollTags.push('activation');
	}
	const baseSituation : Situation = {
		target: target.actor.accessor,
		usedPower: PersonaDB.getUniversalItemAccessor(usableOrCard),
		user: PersonaDB.getUniversalActorAccessor(attacker.actor),
		rollTags,
		attacker: attacker.actor.accessor,
		activeCombat:combat ? Boolean(combat.combatants.find( x=> x.actor?.system.type != attacker.actor.system.type)): false ,
	};
	const cardReturn = await this.processSkillCard(attacker, usableOrCard, target, baseSituation);
	if (cardReturn) {return cardReturn;}
	const power = usableOrCard as Usable;
	const element = power.getDamageType(attacker.actor);
	const resist = targetPersona.elemResist(element);
	const def = power.system.defense;
	const r = await (options.setRoll ? new Roll(`0d1+${options.setRoll}`).roll():  new Roll('1d20').roll());
	if (activationRoll) {
		const combat = game.combat as PersonaCombat;
		if (combat && !combat.isSocial) {
			combat.lastActivationRoll = r.total;
		}
	}
	const attackbonus = this.getAttackBonus(attackerPersona, power, target, modifiers);
	if (rollType == 'reflect' && (def == "fort" || def =="ref")) {
		attackbonus.add(1, 15, 'Reflected Attack',"add");
	}
	const cssClass= (!target.actor.isPC()) ? 'gm-only' : '';
	const roll = new RollBundle('Temp', r, attacker.actor.system.type == 'pc', attackbonus, baseSituation);
	const naturalAttackRoll = roll.dice[0].total;
	// situation.naturalRoll = naturalAttackRoll;
	const defenseCalc = targetPersona.getDefense(def).eval(baseSituation);
	const defenseVal = def != 'none' ? defenseCalc.total: 0;
	const validDefModifiers = def != 'none' ? defenseCalc.steps: [];
	const defenseStr =`<span class="${cssClass}">(${defenseVal})</span>`;
	const rollName =  `${attacker.name} (${power.name}) ->  ${target.name} vs. ${power.targettedDefenseLocalized()} ${defenseStr}`;
	roll.setName(rollName);
	const baseData = {
		roll,
		attacker: PersonaDB.getUniversalTokenAccessor(attacker) ,
		target: PersonaDB.getUniversalTokenAccessor(target),
		power: PersonaDB.getUniversalItemAccessor(power)
	} satisfies Pick<AttackResult, 'attacker' | 'target'  | 'power' | 'roll'>;
	const total = roll.total;
	const situation : CombatRollSituation = {
		...baseSituation,
		naturalRoll: naturalAttackRoll,
		rollTags,
		rollTotal: roll.total,
		withinAilmentRange: false,
	};
	const testNullify = this.processAttackNullifiers(attacker, power, target, baseData, situation, rollType);
	if (testNullify)  {
		return testNullify;
	}
	const resolvedAttackMods = attackbonus.eval(situation);
	const validAtkModifiers = resolvedAttackMods.steps;
	const ailmentRange = this.#calculateAilmentRange(attackerPersona, targetPersona, power, baseSituation);
	const instantDeathRange = this.#calculateInstantDeathRange(attackerPersona, targetPersona, power, baseSituation);
	if (def == 'none') {
		situation.hit = true;
		return {
			result: 'hit',
			critBoost: 0,
			// printableModifiers,
			validAtkModifiers,
			validDefModifiers: [],
			situation,
			ailmentRange,
			instantKillRange: instantDeathRange,
			...baseData,
		} satisfies AttackResult;
	}
	situation.resisted = resist == 'resist' && !power.hasTag('pierce');
	situation.struckWeakness = resist == 'weakness';
	const critBoostMod = this.calcCritModifier(attacker.actor, target.actor, power, situation);
	const rageOrBlind = attacker.actor.hasStatus('rage') || attacker.actor.hasStatus('blind');
	const critMin = situation.resisted ? -999 : 0;
	const critResolved = critBoostMod.eval(situation);
	const critBoost = Math.clamp(critResolved.total, critMin, PersonaCombat.CRIT_MAX);
	const critPrintable = critResolved.steps;
	const autoHit = rollType == "reflect" && !power.isInstantDeathAttack() && !power.isAilment();
	const Mod20 = naturalAttackRoll == 20 ? 3 : 0;
	// const autoHit = naturalAttackRoll == 20;
	if (!autoHit &&
		(naturalAttackRoll == 1
			|| (total+Mod20) < defenseVal
			|| (rageOrBlind && naturalAttackRoll % 2 == 1)
		)
	) {
		situation.hit = false;
		situation.criticalHit = false;
		return {
			result: 'miss',
			defenseValue: defenseVal,
			hitWeakness: situation.struckWeakness ?? false,
			hitResistance: situation.resisted ?? false,
			// printableModifiers,
			validAtkModifiers,
			validDefModifiers,
			ailmentRange,
			instantKillRange: instantDeathRange,
			critBoost,
			critPrintable,
			situation,
			...baseData,
		};
	}
	let withinInstantKillRange = false;
	if (power.system.defense == "kill" && naturalAttackRoll > 5) {
		withinInstantKillRange = true;
	} else {
		const IKDefense = targetPersona.getDefense("kill").eval(situation).total;
		if (instantDeathRange) {
			withinInstantKillRange = naturalAttackRoll > 5
				&& this.withinRange(naturalAttackRoll, instantDeathRange)
				&& total > IKDefense;
		}
	}
	let withinAilmentRange = false;
	if (power.system.defense == "ail") {
		withinAilmentRange = true;
	} else {
		withinAilmentRange = this.withinRange(naturalAttackRoll, ailmentRange);
	}
	situation["withinAilmentRange"]= withinAilmentRange;
	situation["withinInstantKillRange"] = withinInstantKillRange;
	const canCrit = typeof rollType == 'number' || rollType == 'iterative' ? false : true;
	const cancelCritsForInstantDeath = false;
	if (naturalAttackRoll + critBoost >= 20
		&& total >= defenseVal
		&& (!power.isMultiTarget() || naturalAttackRoll % 2 == 0)
		&& !target.actor.hasStatus('blocking')
		&& !power.hasTag('no-crit')
		&& canCrit
		&& !cancelCritsForInstantDeath
	) {
		situation.hit = true;
		situation.criticalHit  = true;
		return {
			result: 'crit',
			defenseValue: defenseVal,
			hitWeakness: situation.struckWeakness ?? false,
			hitResistance: situation.resisted ?? false,
			validAtkModifiers,
			validDefModifiers,
			ailmentRange,
			instantKillRange: instantDeathRange,
			// printableModifiers,
			critBoost,
			critPrintable,
			situation,
			...baseData,
		};
	} else {
		situation.hit = true;
		situation.criticalHit = false;
		return {
			result: 'hit',
			defenseValue: defenseVal,
			hitWeakness: situation.struckWeakness ?? false,
			hitResistance: situation.resisted ?? false,
			validAtkModifiers,
			ailmentRange,
			instantKillRange: instantDeathRange,
			validDefModifiers,
			// printableModifiers,
			critBoost,
			critPrintable,
			situation,
			...baseData,
		};
	}
}

static #calculateAilmentRange( attackerPersona: Persona, targetPersona: Persona, power: Usable, situation: Situation) : U<{low: number, high:number}> {
	const ailmentMods =
	attackerPersona.getBonuses('afflictionRange').concat(
		targetPersona.getBonuses('ail')
	);
	const calc = attackerPersona.combatStats.ailmentBonus();
	calc.add(1, -targetPersona.combatStats.ailmentResist().eval(situation).total, "Target Ailment Resistance", "add");
	calc.add(1, ailmentMods, "mods", "add");
	const calcResolved = calc.eval(situation);
	const total = calcResolved.total;
	if (PersonaSettings.debugMode()) {
		const steps = calcResolved.steps;
		console.debug(steps);
	}
	const ailmentRange = power.ailmentRange;
	if (!ailmentRange) {return undefined;}
	ailmentRange.low -= total;
	if (ailmentRange.low > ailmentRange.high) {return undefined;}
	return ailmentRange;
}

private static withinRange(num: number, range: U<{low: number, high: number}>) : boolean {
	if (range == undefined) {return false;}
	return num >= range.low
		&& num <= range.high;

}

	static #calculateInstantDeathRange(  attackerPersona: Persona, targetPersona: Persona, power: Usable, situation: Situation) : U<{low: number, high:number}> {
		if (!power.isInstantDeathAttack()) {return undefined
			;}
		if (!power.canDealDamage()) {return {low: 5, high: 99};}
		const instantDeathMods =
			attackerPersona.getBonuses('instantDeathRange');
		const killDefense =
			targetPersona.getBonuses('kill').total(situation);
		const instantDeathBonus = attackerPersona.combatStats.instantDeathBonus();
		instantDeathBonus.add(1, -targetPersona.combatStats.instantDeathResist().eval(situation).total, "Target Mods", "add");
		//think this is already factored in
		// const elemResMod = this.resistIKMod(targetPersona, power);
		// instantDeathBonus.add(1, -elemResMod, "Affinity Mod");
		instantDeathMods.add("Misc Mods to kill defense", -killDefense);
		instantDeathBonus.add(1, instantDeathMods, "MOds", "add");

		const resolved = instantDeathBonus.eval(situation);
		const total = resolved.total;
		const steps = resolved.steps;
		console.debug(steps);
		const deathRange = power.instantDeathRange;
		if (deathRange) {
			deathRange.low -= total;
			deathRange.low = Math.max(deathRange.low, 6);
			if (deathRange.high - deathRange.low <= 0) {
				return undefined;
			}
		}
		return deathRange;
	}

static resistIKMod(targetPersona: Persona, power: Usable) : number {
	const fn = function (elem: RealDamageType) {
		const resist = targetPersona.elemResist(elem);
		switch (resist) {
			case "weakness":
				return -3;
			case "normal":
				return 0;
			case "resist": return 3;
			case "block":
			case "absorb":
			case "reflect": return 9999;
			default:
				resist satisfies never;
				return 0;
		}
	};
	let ret = 0;
	if (power.hasTag("dark")) {
		ret += fn ("dark");
	}
	if (power.hasTag("light")) {
		ret += fn ("light");
	}
	return ret;

}

	static calcCritModifier( attacker: ValidAttackers, target: ValidAttackers, power: Usable, situation: Situation, ) : Calculation {
		const critBoostMod = power.critBoost(attacker);
		const critResist = target.persona().critResist().eval(situation).total;
		critBoostMod.add(1, -critResist, 'Enemy Critical Resistance',"add");
		return critBoostMod;
	}

	static async processEffects(atkResult: AttackResult) : Promise<CombatResult> {
		const CombatRes = new CombatResult();
		const {result } = atkResult;
		switch (result) {
			case 'reflect': {
				const reflectRes = new CombatResult(atkResult);
				const targetActor = PersonaDB.findToken(atkResult.target).actor;
				const power = PersonaDB.findItem(atkResult.power);
				const attacker = PersonaDB.findToken(atkResult.attacker);
				if ( targetActor.hasStatus('magic-shield') && power.canBeReflectedByMagicShield(attacker.actor)) {
					const cons : SourcedConsequence = {
						type: 'removeStatus',
						owner: targetActor.accessor,
						statusName: 'magic-shield',
						source: power,
						realSource: undefined,
					};
					await reflectRes.addEffect(atkResult, targetActor, cons, atkResult.situation );
				}
				if (targetActor.hasStatus('phys-shield') && power.canBeReflectedByPhyiscalShield(attacker.actor)) {
					const cons : SourcedConsequence = {
						type: 'removeStatus',
						owner: targetActor.accessor,
						statusName: 'phys-shield',
						source: power,
						realSource: undefined,
					};
					await reflectRes.addEffect(atkResult, targetActor, cons, atkResult.situation);
				}
				CombatRes.merge(reflectRes);
				return CombatRes; }
			case 'block': {
				const blockRes = new CombatResult(atkResult);
				CombatRes.merge(blockRes);
				return CombatRes; }
			case 'hit':
			case 'miss':
			case 'crit':
			case 'absorb':
				break;
			default:
				result satisfies never;
				PersonaError.softFail(`Unknown hit result ${result as string}`);
		}
		const powerEffects = await this.processPowerEffectsOnTarget(atkResult);
		CombatRes.merge(powerEffects);
		return CombatRes;
	}

static async processPowerEffectsOnTarget(atkResult: AttackResult) : Promise<CombatResult> {
	const {situation} = atkResult;
	const power = PersonaDB.findItem(atkResult.power);
	const attacker = PersonaDB.findToken(atkResult.attacker);
	const target = PersonaDB.findToken(atkResult.target);
	const attackerEffects= attacker.actor.getEffects(['passive']);
	const defenderEffects = target.actor.getEffects(['defensive']);
	const sourcedEffects =
	[ ...power.getEffects(attacker.actor, {CETypes: ['on-use', 'passive']}) ]
	.concat(attackerEffects)
	.concat(defenderEffects);

	const CombatRes = new CombatResult(atkResult);
	const consequences = sourcedEffects.flatMap( eff => getActiveConsequences(eff, situation));
	const res = await this.consequencesToResult(consequences, power,  situation, attacker.actor, target.actor, atkResult);
	CombatRes.merge(res);
	return CombatRes;
}

	static async consequencesToResult(cons: SourcedConsequence<NonDeprecatedConsequence>[], power: U<ModifierContainer>, situation: Situation, attacker: ValidAttackers | undefined, target: ValidAttackers | undefined, atkResult: AttackResult | null): Promise<CombatResult> {
		const CombatRes = new CombatResult(atkResult);
		try {
			const x = this.ProcessConsequences(power, situation, cons, attacker, target, atkResult);
			// CombatRes.escalationMod += x.escalationMod;
			const result = await this.getCombatResultFromConsequences(x.consequences, situation, attacker, target, atkResult);
			CombatRes.merge(result);
		}
		catch (e) {
			PersonaError.softFail("Error turning consequence into Result", e, cons);

		}
		return CombatRes;
	}

	static async getCombatResultFromConsequences(consList: ConsequenceProcessed['consequences'], situation: Situation, _attacker: ValidAttackers | undefined, _target : ValidAttackers | undefined, atkResult ?: AttackResult | null ) : Promise<CombatResult> {
		const result = new CombatResult(atkResult);
		for (const cons of consList) {
			if (cons.applyTo == 'global') {
				await result.addEffect(atkResult, undefined, cons.cons, situation);
				continue;
			}
			await result.addEffect(atkResult, cons.applyTo, cons.cons, situation);
		}
		return result;
	}

	static createTargettingContextList(situation: Partial<Situation>, cons : Consequence | null) : TargettingContextList {
		const {target, attacker, user, cameo} = situation;
		const triggeringCharacter = 'triggeringCharacter' in situation ? situation.triggeringCharacter : undefined;
		const owner = [];
		if (cons && cons.actorOwner) {
			if (cons.actorOwner)
			{owner.push(cons.actorOwner);}
		}
		const foes :TargettingContextList['all-foes'] = [];
		const allies : TargettingContextList['all-allies'] = [];
		if (attacker && game.combat) {
			const attackerToken = this.getPTokenFromActorAccessor(attacker);
			if (attackerToken) {
				foes.push(...this
					.getAllEnemiesOf(attackerToken)
					.map( x=> x.actor.accessor)
				);
			}
			if (attackerToken) {
				allies.push(...this
					.getAllAlliesOf(attackerToken)
					.map( x=> x.actor.accessor)
				);
			}
		}

		const allInRegion :TargettingContextList['all-in-region'] = [];
		const id = ('triggeringRegionId' in situation)? situation.triggeringRegionId : undefined;
		const region = Metaverse.getRegion(id);
		if (region)  {
			const tokens = Array.from(region.tokens);
			const actors = tokens
				.filter( x=> x.actor && x.actor.isValidCombatant())
				.map( x=> (x.actor as ValidAttackers).accessor);
			allInRegion.push(...actors);
		}

		const nav = PersonaDB.getNavigator();
		const context : TargettingContextList = {
			target: target ? [target] : [],
			owner,
			attacker: attacker ? [attacker] : [],
			user: user ? [user] : [],
			'triggering-character': triggeringCharacter ? [triggeringCharacter] : [],
			cameo: cameo ? [cameo] : [],
			'all-allies': allies,
			'all-foes': foes,
			'all-in-region': allInRegion,
			navigator: nav ? [nav.accessor] : [],
		};
		return context;
	}

	static solveEffectiveTargets< T extends keyof Omit<TargettingContextList, "situation">>(applyTo :T, situation: Situation, cons?: SourcedConsequence) : (ValidAttackers | ValidSocialTarget)[]  {
		switch (applyTo) {
			case 'target' : {
				const target = situation.target
				? PersonaDB.findActor(situation.target)
				: situation.socialTarget
				? PersonaDB.findActor(situation.socialTarget)
				: undefined;
				return target ? [target]: []; }
			case 'attacker': {
				const attacker = situation.attacker ? PersonaDB.findActor(situation.attacker) : undefined;
				return attacker ? [attacker]: []; }
			case 'owner':
				if (cons) {
					if (cons.actorOwner) {
						const pt =  this.getPTokenFromActorAccessor(cons.actorOwner);
						if (pt && pt.actor) {return [pt.actor];}
					}
					if (cons.owner) {
						const pt =  this.getPTokenFromActorAccessor(cons.owner);
						if (pt && pt.actor) {return [pt.actor];}
					}
					else {return [];}
				}
				ui.notifications.notify("Can't find Owner of Consequnece");
				return [];
			case 'user': {
				if (!situation.user) {return [];}
				if (situation.user) {
					const userToken  = this.getPTokenFromActorAccessor(situation.user);
					if (userToken)  { return [userToken.actor];}
					const userActor = PersonaDB.findActor(situation.user);
					if (userActor) {return [userActor];}
				}
				if (cons && cons.owner) {
					const owner =  PersonaDB.findActor(cons.owner);
					if (owner) {return [owner as ValidAttackers];}
				}
				return [];
			}
			case 'triggering-character': {
				const triggerer = 'triggeringCharacter' in situation? situation.triggeringCharacter: undefined;
				if (!triggerer) {
					PersonaError.softFail(`Can't target triggering character for ${situation.trigger}`, situation);
					return [];
				}
				const token = this.getPTokenFromActorAccessor(triggerer);
				if (token) { return [token.actor];}
				const actor = PersonaDB.findActor(triggerer);
				if (actor) { return [actor];}
				return [];
			}
			case 'cameo': {
				const cameo = 'cameo' in situation && situation.cameo ? PersonaDB.findActor(situation.cameo) : undefined;
				return cameo ? [cameo] : []; }
			case 'all-foes': {
				const attacker = situation.attacker ? PersonaDB.findActor(situation.attacker) : undefined;
				if (!attacker) {return [];}
				const attackerToken = this.getPTokenFromActorAccessor(attacker.accessor);
				if (!attackerToken) {return [];}
				return this.getAllEnemiesOf(attackerToken).map( x=> x.actor);
			}
			case 'all-allies': {
				const attacker = situation.attacker ? PersonaDB.findActor(situation.attacker) : undefined;
				if (!attacker) {return [];}
				const attackerToken = this.getPTokenFromActorAccessor(attacker.accessor);
				if (!attackerToken) {return [];}
				return this.getAllAlliesOf(attackerToken)
				.map( x=> x.actor);
			}
			case undefined: {
				const target = situation.target ? PersonaDB.findActor(situation.target) : undefined;
				return target ? [target] : []; } //default to target since this is old material
			case 'all-in-region': {
				let id : string | undefined;
				if ('triggeringRegionId' in situation) {
					id = situation.triggeringRegionId;
				}
				const region = Metaverse.getRegion(id);
				if (!region) {return [];}
				const tokens = Array.from(region.tokens);
				const actors = tokens
				.filter( x=> x.actor && x.actor.isValidCombatant())
				.map( x=> x.actor! as ValidAttackers);
				return actors;
			}
			case "navigator": {
				const nav = PersonaDB.getNavigator();
				return nav ? [nav] : [];
			}
			default:
				applyTo satisfies never;
				return [];
		}
	}

	static processConsequences_simple(consequence_list: SourcedConsequence<NonDeprecatedConsequence>[], situation: Situation): ConsequenceProcessed {
		let consequences : ConsequenceProcessed['consequences'] = [];
		for (const cons of consequence_list) {
			const applyTo = cons.applyTo ?? (cons.applyToSelf ? 'owner' : 'target');
			const consTargets = PersonaCombat.solveEffectiveTargets(applyTo, situation, cons) as ValidAttackers[];
			consequences= consequences.concat(this.processConsequence_simple(cons, consTargets));
		}
		return {
			consequences
		};
	}


	static ProcessConsequences(power: U<ModifierContainer>, situation: Situation, relevantConsequences: SourcedConsequence<NonDeprecatedConsequence>[], attacker: ValidAttackers | undefined, target: ValidAttackers | undefined, atkresult : Partial<AttackResult> | null)
	: ConsequenceProcessed {
		let consequences : ConsequenceProcessed['consequences']= [];
		for (const cons of relevantConsequences) {
			const sourcedC = {
				...cons,
			};
			if (attacker) {
				const newCons = this.processConsequence(power, situation, sourcedC, attacker, target, atkresult);
				consequences = consequences.concat(newCons);
			} else {
				const applyTo = sourcedC.applyTo ?? (sourcedC.applyToSelf ? 'owner' : 'target');
				const consTargets = PersonaCombat.solveEffectiveTargets(applyTo, situation, cons) as ValidAttackers[];
				const newCons = this.processConsequence_simple( sourcedC, consTargets);
				consequences = consequences.concat(newCons);
			}
		}
		return {consequences} satisfies ConsequenceProcessed;
	}

	static processConsequence( power: U<ModifierContainer>, situation: Situation, cons: SourcedConsequence<NonDeprecatedConsequence>, attacker: ValidAttackers, _target : ValidAttackers | undefined, atkresult ?: Partial<AttackResult> | null) : ConsequenceProcessed['consequences'] {
		//need to fix this so it knows who the target actual is so it can do a proper compariosn, right now when applying to Self it won't consider resistance or consider the target's resist.
		const applyTo = cons.applyTo ?? (cons.applyToSelf ? 'owner' : 'target');
		const consTargets = PersonaCombat.solveEffectiveTargets(applyTo, situation, cons) as ValidAttackers[];
		const applyToSelf = cons.applyToSelf ?? (cons.applyTo == 'attacker' || cons.applyTo =='user' || cons.applyTo == 'owner');
		const absorb = (situation.isAbsorbed && !applyToSelf) ?? false;
		const block = atkresult && atkresult.result == 'block' && !applyToSelf;
		// const applyTo = cons.applyTo ? cons.applyTo : (applyToSelf ? "owner" : "target");
		switch (cons.type) {
			case 'damage-new':
				return this.processConsequence_damage(cons, consTargets, attacker, power, situation);
			case 'none':
			case 'modifier':
				break;
			case 'addStatus': case 'removeStatus':
				if (!applyToSelf && (absorb || block)) {return [];}
				return consTargets.map( target => {
					return  {applyTo: target ,cons};
				});
			default:
				return this.processConsequence_simple(cons, consTargets);
		}
		return [];
	}

static processConsequence_damage( cons: SourcedConsequence<DamageConsequence>, targets: ValidAttackers[], attacker: ValidAttackers, powerUsed: U<ModifierContainer>, situation: Situation) : ConsequenceProcessed['consequences'] {
	const consList : ConsequenceProcessed['consequences'] = [];
	let dmgCalc: U<DamageCalculation>;
	let dmgAmt : ConsequenceAmount = 0;
	let damageType : U<RealDamageType> = cons.damageType != "by-power" ? cons.damageType : "none";
	const power = powerUsed instanceof PersonaItem && powerUsed.isUsableType() ? powerUsed : undefined;
	if (power && power.isUsableType()) {
		damageType = cons.damageType != 'by-power' && cons.damageType != undefined ? cons.damageType : power.getDamageType(attacker);
	}
	const mods : EnhancedSourcedConsequence<DamageConsequence>['modifiers'] = [];
	cons = {
		...cons,
		damageType,
	};
	switch (cons.damageSubtype) {
		case "set-to-const":
		case "set-to-percent": {
			const consArray   = targets
			.map( target => {
				return {
					applyTo: target, 
					cons: cons,
				};
			});
			return consArray;
		}
	}
	if (cons.damageType == undefined) {
		PersonaError.softFail(`Damage type is undefined for ${power?.name ?? "Undefined Power"}`, cons);
		return [];
	}
	switch (cons.damageSubtype) {
		case 'low':
		case 'high':
		case 'odd-even': {
			if (!power) {return [];}
			if (situation.naturalRoll == undefined) {
				PersonaError.softFail(`Can't get odd even for damage of ${power.displayedName.toString() }` );
				return [];
			}
			dmgCalc = power.damage.getDamage(power, attacker.persona(), situation, cons.damageType);
			const evenRoll = (situation.naturalRoll ?? 0) % 2 == 0;
			if ( cons.damageSubtype == "high" || (cons.damageSubtype == "odd-even" && evenRoll)) {
				dmgCalc.setApplyEvenBonus();
			}
			break;
		}
		case 'multiplier':
			return targets.map( applyTo => ({applyTo, cons, })
			);
		case 'allout': {
			const combat = game.combat as PersonaCombat;
			if (combat) {
				const userTokenAcc = combat.getToken(situation.user);
				if (!userTokenAcc) {
					PersonaError.softFail(`Can't calculate All out damage - no token for ${situation?.user?.actorId ?? 'Null user'}`);
					break;
				}
				const userToken = PersonaDB.findToken(userTokenAcc);
				const allOutDmg = PersonaCombat.calculateAllOutAttackDamage(userToken, situation as AttackResult['situation']);
				dmgCalc = new DamageCalculation("all-out");
				for (const AOD of allOutDmg) {
					const source = {
						displayedName: `${AOD.contributor.displayedName} (${AOD.stack.join(', ')})`,
					};
					dmgCalc.add("base", AOD.amt, source.displayedName);
				}
				const evenRoll = (situation.naturalRoll ?? 0) % 2 == 0;
				if ( evenRoll) {
					dmgCalc.setApplyEvenBonus();
				}
				break;
			} else {
				return [];
				//bailout since no combat and can't calc all out.
			}
		}
		case 'constant':
			dmgAmt = cons.amount;
			break;
		case 'percentage-current':
		case 'percentage':
			dmgAmt = cons.amount;
			break;
		case 'mult-stack':
			dmgAmt =  cons.amount;
			break;
		default:
			cons.damageSubtype satisfies never;
	}
	if (dmgAmt || dmgCalc) {
		for (const applyTo of targets) {
			const piercePower = power && power.hasTag('pierce');
			const pierceTag = 'addedTags' in situation && situation.addedTags && situation.addedTags.includes('pierce');
			if (!piercePower && !pierceTag) {
				const resist = applyTo.persona().elemResist(damageType);
				if (resist == 'resist') {
					mods.push('resisted');
				}
				if (resist == 'absorb') {
					mods.push('absorbed');
				}
				if (resist == 'block') {
					mods.push('blocked');
				}
			}
			if (dmgCalc) {
				dmgCalc.setDamageType(damageType);
			}
			const consItems = targets.map( target => {
				const DC = dmgCalc != undefined ? dmgCalc.clone(): undefined;
				if (DC && power) {
					const DR = target.persona().combatStats.damageReduction(damageType, power);
					DC.merge(DR);
				};
				return {
					applyTo: target,
					cons: {
						...cons,
						modifiers: mods,
						amount: dmgAmt,
						calc: DC
					}
				};
			});
			consList.push(...consItems);
		}
	}
	return consList;
}

static processConsequence_simple( cons: SourcedConsequence<NonDeprecatedConsequence>, targets: ValidAttackers[]) :ConsequenceProcessed['consequences'] {
	switch (cons.type) {
		case 'damage-new':
			PersonaError.softFail(`Process Consequence Simple does not handle ${cons.type}`);
			return [];
		case 'addStatus':
		case 'removeStatus':
			return targets.map( applyTo => ({applyTo, cons}));
		case 'none':
		case 'modifier':
		case 'modifier-new':
		case 'add-creature-tag':
			break;
		case 'extraAttack' :
		case 'expend-slot':
			return targets.map( applyTo => ({applyTo, cons}));
		case 'other-effect':
		case 'set-flag':
		case 'add-power-to-list':
		case 'add-talent-to-list':
		case "inventory-action":
			return targets.map( applyTo => ({applyTo, cons}));
		case 'raise-resistance':
		case 'lower-resistance':
		case 'raise-status-resistance':
		case 'inspiration-cost':
		case 'use-power':
		case 'scan':
		case 'alter-energy':
		case 'alter-mp':
			return targets.map( applyTo => ({applyTo, cons}));
		case 'social-card-action':
		case 'extraTurn':
			return targets.map( applyTo => ({applyTo, cons}));
		case 'teach-power':
		case 'combat-effect':
			return targets.map( applyTo => ({applyTo, cons}));
		case 'alter-variable':
			return targets.map( applyTo => ({applyTo, cons}));
		case 'perma-buff':
		case 'alter-fatigue-lvl':
		case "gain-levels":
			return targets.map( applyTo => ({applyTo, cons}));
		case 'play-sound':
			return [{applyTo: 'global', cons}];
		case 'display-msg':
			if (cons.newChatMsg) {
				return [{applyTo: 'global', cons}];
			} else {
				return targets.map( applyTo => ({applyTo, cons}));
			}
		case 'dungeon-action':
			return [{applyTo: 'global', cons}];
		case 'expend-item': {
			const source = cons.source;
			if (!(source instanceof PersonaItem)) {return [];}
			if (! (source.isConsumable() || source.isSkillCard())) {
				return [];
			}
			const itemAcc = source.accessor;
			return targets.map( applyTo => {
				return {applyTo,
					cons: {
						type: 'expend-item',
						itemAcc,
						source: cons.source,
						owner: cons.owner,
						realSource: undefined,
					}
				};
			});
		}
		case "cancel":
			return [{applyTo: 'global', cons}];
		default:
			cons satisfies never;
			break;
	}
	return [];
}

static async #processCosts(attacker: PToken , usableOrCard: UsableAndCard, _costModifiers: OtherEffect[]) : Promise<CombatResult> {
	const situation : Situation = {
		user: attacker.actor.accessor,
		attacker: attacker.actor.accessor,
		usedPower: usableOrCard.accessor,
	};
	const res = new CombatResult();
	switch (usableOrCard.system.type) {
		case 'power': {
			const power  = usableOrCard as Power;
			if (power.system.subtype == 'social-link') {
				if (power.system.inspirationId) {
					await res.addEffect(null, attacker.actor, {
						type:'inspiration-cost',
						amount: power.system.inspirationCost,
						socialLinkIdOrTarot: power.system.inspirationId as unknown as AnyStringObject,
						source: usableOrCard,
						owner: attacker.actor.accessor,
						realSource: undefined,
					}, situation);
				}
			}
			if (!attacker.actor.isShadow() && power.hpCost()) {
				const deprecatedConvert = DamageCalculation.convertToNewFormConsequence({
					type: 'hp-loss',
					damageType: 'none',
					amount: power.modifiedHpCost(attacker.actor.persona()),
					source: usableOrCard,
					owner: attacker.actor.accessor,
					realSource: undefined,
				}, power.getDamageType(attacker.actor));
				await res.addEffect(null, attacker.actor, deprecatedConvert, situation );
			}
			if (!attacker.actor.isShadow()
				&& power.system.subtype == 'magic'
				&& power.mpCost(attacker.actor.persona()) > 0) {
				await res.addEffect(null, attacker.actor, {
					type: 'alter-mp',
					subtype: 'direct',
					amount: -power.mpCost(attacker.actor.persona()),
					source: usableOrCard,
					owner: attacker.actor.accessor,
					realSource: undefined,
				}, situation);
			}
			if (attacker.actor.isShadow()) {
				if (power.energyCost(attacker.actor.persona()) > 0) {
					await res.addEffect(null, attacker.actor, {
						type: 'alter-energy',
						amount: -power.energyCost(attacker.actor.persona()),
						source: usableOrCard,
						owner: attacker.actor.accessor,
						realSource: undefined,

					}, situation);
				}
			}
		}
			break;
		case 'skillCard':
		case 'consumable' :{
			const consumable = usableOrCard as Consumable;
			if (consumable.isSkillCard()
				|| consumable.system.subtype == 'consumable') {
				await res.addEffect(null, attacker.actor, {
					type: 'expend-item',
					source: usableOrCard,
					owner: attacker.actor.accessor,
					realSource: undefined,
				}, situation);
			}
			break;
		}
		default:
			usableOrCard.system satisfies never;
	}
	return res;
}

static getAttackBonus(attackerP: Persona, power: Usable, target: PToken | undefined, modifiers ?: ModifierList) : Calculation {
	const attackBonus = this.getBaseAttackBonus(attackerP, power);
	attackBonus.add(1, this.customAtkBonus ?? 0, 'Custom modifier', "add");
	const defense = this.getDefenderAttackModifiers(target, power.system.defense, power);
	attackBonus.add(1, defense, "Defense MOds", "add");
	// attackBonus = attackBonus.concat(defense);
	if (modifiers) {
		attackBonus.add(1, modifiers, "Extra Mods", "add");
		// attackBonus = attackBonus.concat(modifiers);
	}
	return attackBonus;
}

static getDefenderAttackModifiers(target: PToken | undefined, defense : Defense, power: Usable) : ModifierList {
	if (!target || defense == "none") {return new ModifierList();}
	const vectors : ModifierTarget[] = ['allAtk'];
	if (power.isMagicSkill())  {
		vectors.push("magAtk");
	}
	if (power.isWeaponSkill())  {
		vectors.push("wpnAtk");
	}
	const defenseMod = new ModifierList(
		PersonaItem.getModifier(
			target.actor.persona().defensiveModifiers(),
			['allAtk']
		)
		// .flatMap (item => item.getModifier(['allAtk', defense], target.actor))
	);
	return defenseMod;
}

static getBaseAttackBonus(attackerPersona: Persona, power:Usable): Calculation {
	let modList = new ModifierList();
	const calc = new Calculation(0, 3);
	// modList.add('Power attack modifier', power.system.atk_bonus);
	calc.add(1, power.system.atk_bonus,`${power.name} attack bonus`, "add");

	switch (power.system.defense) {
		case "none":
			return calc;
		case "ref": {// weapon attack
			calc.merge(attackerPersona.wpnAtkBonus());
			modList =  modList.concat(new ModifierList(power.getModifier('wpnAtk', attackerPersona.user)));
			break;
		}
		case "fort": //magic attack
			calc.merge(attackerPersona.magAtkBonus());
			modList = modList.concat(new ModifierList(power.getModifier('magAtk', attackerPersona.user)));
			break;
		case "kill": {
			calc.merge(attackerPersona.instantDeathAtkBonus());
			const ID_Bonus = power.baseInstantKillBonus();
			modList.add(`${power.displayedName.toString()} Bonus`, ID_Bonus);
			modList = modList.concat(new ModifierList(power.getModifier('instantDeathRange', attackerPersona.user)));
			break;
		}
		case "ail": {
			calc.merge(attackerPersona.ailmentAtkBonus());
			const Ail_Bonus = power.baseAilmentBonus();
			modList.add(`${power.displayedName.toString()} Bonus`, Ail_Bonus);
			modList = modList.concat(new ModifierList(power.getModifier('afflictionRange', attackerPersona.user)));
			break;
		}
		default:
			power.system.defense satisfies never;
	}
	modList =  modList.concat(new ModifierList(power.getModifier('allAtk', attackerPersona.user)));
	return calc.add(1, modList, "Mods", "add");
	// return modList;
}

static getAltTargets ( attacker: PToken, situation : Situation, targettingType :  ConsTarget) : PToken[] {
	const attackerType = attacker.actor.getAllegiance();
	switch (targettingType) {
		case 'target': {
			if (!situation.target) {return [];}
			const token = this.getPTokenFromActorAccessor(situation.target);
			if (token) {return [token];} else {return [];}
		}
		case 'owner':
			return [attacker];
		case 'attacker': {
			if (!situation.attacker) {return [];}
			const token = this.getPTokenFromActorAccessor(situation.attacker);
			if (token) {return [token];} else {return [];}
		}
		case 'all-enemies': {
			const combat = this.ensureCombatExists();
			const targets = combat.combatants.filter( x => {
				const actor = x.actor;
				if (!actor || !(actor).isAlive())  {return false;}
				return ((x.actor as ValidAttackers).getAllegiance() != attackerType);
			});
			return targets.map( x=> x.token as PToken);
		}
		case 'all-allies': {
			return this.getAllAlliesOf(attacker);
		}
		case 'all-foes':{
			return this.getAllEnemiesOf(attacker);
		}
		case 'all-combatants': {
			const combat = game.combat as PersonaCombat;
			if (!combat) {return [];}
			return combat.validCombatants(attacker).flatMap( c=> c.actor ? [c.token as PToken] : []);
		}
		case 'user': {
			if (!situation.user) {return [];}
			const token = this.getPTokenFromActorAccessor(situation.user);
			if (token) {return [token];} else {return [];}
		}
		case 'triggering-character': {
			if (!('triggeringCharacter' in  situation)) {return [];}
			if (!situation.triggeringCharacter) {return [];}
			const token = this.getPTokenFromActorAccessor(situation.triggeringCharacter);
			if (token) {return [token];} else {return [];}
		}
		case 'cameo': {
			return [];
		}
		case 'all-in-region':
			PersonaError.softFail('all-in-region does not support alt targets');
			return [];
		case "navigator":
			PersonaError.softFail(`navigator doesn't support alt targets`);
			return [];
		default:
			targettingType satisfies never;
			return [];
	}
}

getAllEnemiesOf(token: PToken) : PToken [] {
	const attackerType = token.actor.getAllegiance();
	const targets = this.validCombatants(token).filter( x => {
		const actor = x.actor;
		if (!actor || !actor.isAlive())  {return false;}
		return (x.actor && x.actor.getAllegiance() != attackerType);
	});
	return targets.map( x=> x.token as PToken);

}

static getAllEnemiesOf(token: PToken) : PToken [] {
	const combat= this.ensureCombatExists();
	return combat.getAllEnemiesOf(token);
}

/** returns self and all allies */
static getAllAlliesOf(token: PToken) : PToken[] {
	const attackerType = token.actor.getAllegiance();
	const combat= game.combat as PersonaCombat;
	const tokens = combat
		? ( combat.validCombatants(token)
			.filter( x=> x.actor)
			.map(x=> x.token))
		: (game.scenes.current.tokens
			.filter( (x : TokenDocument<PersonaActor>) => x.actor != undefined && (x.actor?.isPC() || x.actor?.isNPCAlly())
			));
	const targets= tokens.filter( x => {
		const actor = x.actor as ValidAttackers | undefined;
		if (!actor)  {return false;}
		if (!actor.isAlive()) {return false;}
		if (actor.isFullyFaded()) {return false;}
		return (actor.getAllegiance() == attackerType);
	});
	return targets.map( x=> x as PToken);
}

static selectedPTokens(): PToken[] {
	return Array.from(game.user.targets)
		.map(x=> x.document)
		.filter(x=> x.actor != undefined && x.actor instanceof PersonaActor && x.actor.isValidCombatant()) as PToken[];
}

static getTargets(attacker: PToken, power: UsableAndCard, altTargets?: PToken[]): PToken[] {
	const selected = altTargets != undefined
		? altTargets
		: this.selectedPTokens();
	const combat = game.combat as PersonaCombat | undefined;
	if (combat) {
		const attackerActor = attacker.actor;
		for (const target of selected) {
			const targetActor = target.actor;
			const engagingTarget  = combat.isInMeleeWith(attacker, target) ?? false;
			if (attacker.id == target.id) {continue;}
			if (attackerActor.hasStatus('challenged') && !engagingTarget) {
				throw new TargettingError("Can't target non-engaged when challenged");
			}
			if (targetActor.hasStatus('challenged') && !engagingTarget) {
				throw new TargettingError("Can't target a challenged target you're not engaged with");
			}
			const situation : Situation = {
				user: attacker.actor.accessor,
				attacker: attacker.actor.accessor,
				target: target.actor.accessor,
				usedPower: power.accessor,
				activeCombat: true,
			};
			const canUse = power.targetMeetsConditions(attacker.actor, targetActor, situation);
			if (!canUse) {
				throw new TargettingError('Target doesn\'t meet custom Power conditions to target');
			}
		}
	}
	const attackerType = attacker.actor.getAllegiance();
	const targets = 'targets' in power.system ? power.system.targets : 'self';
	switch (targets) {
		case '1-random-enemy': {
			const list = this.getAllEnemiesOf(attacker)
			.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
			return [randomSelect(list)];
		}
		case '1-engaged':
		case '1-nearby':
			this.checkTargets(1,1, selected, true);
			return selected;
		case '1-nearby-dead':
			this.checkTargets(1,1, selected, false);
			return selected;
		case 'all-enemies': {
			return this.getAllEnemiesOf(attacker)
			.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
		}
		case 'all-dead-allies': {
			const combat = this.ensureCombatExists();
			const targets = combat.validCombatants(attacker)
			.filter( x => {
				const actor = x.actor;
				if (!actor) {return false;}
				if ((actor).isAlive()) {return false;}
				if ((actor).isFullyFaded()) {return false;}
				return ((x.actor as ValidAttackers).getAllegiance() == attackerType);
			});
			return targets.map( x=> x.token as PToken);
		}
		case 'all-allies': {
			return this.getAllAlliesOf(attacker)
			.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
		}
		case 'self': {
			return [attacker]
			.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
		}
		case '1d4-random':
		case '1d4-random-rep':
		case '1d3-random-rep':
		case '1d3-random':
			throw new TargettingError('Targetting type not yet implemented');
		case 'all-others': {
			const combat= this.ensureCombatExists();
			return combat.validCombatants(attacker)
			.filter( x=> x.token != attacker
				&& x?.actor?.isAlive())
			.map( x=> x.token as PToken)
			.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
			;
		}
		case 'everyone':{
			const combat= this.ensureCombatExists();
			return combat.validCombatants(attacker)
			.filter( x=> x?.actor?.isAlive())
			.map( x=> x.token as PToken)
			.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
		}
		case 'everyone-even-dead': {
			const combat= this.ensureCombatExists();
			return combat.validCombatants(attacker)
			.filter( x=> x.actor && !x.actor.isFullyFaded())
			.map( x=> x.token as PToken)
			.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
		}
		default:
			targets satisfies never;
			throw new TargettingError(`targets ${targets as string} Not yet implemented`);
	}
}

static canBeTargetted(token : PToken) : boolean {
	return token.actor && !token.actor.hasStatus('protected');
}

static checkTargets(min: number, max: number, targets: PToken[], aliveTargets: boolean) {
	if (!targets.every(x=> PersonaCombat.canBeTargetted(x))) {
		const error = 'Selection includes an untargettable target';
		throw new TargettingError(error);
	}
	const selected = targets
		.filter(x=> aliveTargets ? x.actor.isAlive() : (!x.actor.isAlive() && !x.actor.isFullyFaded()));
	if (selected.length == 0)  {
		const error = 'Requires Target to be selected';
		throw new TargettingError(error);
	}
	if (selected.length < min) {
		const error = 'Too few targets selected';
		ui.notifications.warn(error);
		throw new TargettingError(error);
	}
	if (selected.length > max) {
		const error = 'Too many targets selected';
		ui.notifications.warn(error);
		throw new TargettingError(error);
	}
}

static ensureCombatExists() : PersonaCombat {
	const combat = game.combat;
	if (!combat) {
		const error = 'No Combat';
		throw new PersonaError(error);
	}
	return combat as PersonaCombat;
}

getEscalationDie() : number {
	return (this.getFlag('persona', 'escalation') as number) ?? -1;
}

async incEscalationDie() : Promise<void> {
	await this.setEscalationDie(Math.min(this.getEscalationDie() +1, 6));
}

async decEscalationDie() : Promise<void> {
	await  this.setEscalationDie(Math.max(this.getEscalationDie() - 1, 0));
}

async setEscalationDie(val: number) : Promise<void> {
	const clamp = Math.clamp(val,0,6);
	await this.setFlag('persona', 'escalation', clamp);
}

async setSocialEncounter(isSocial: boolean) {
	await this.setFlag('persona', 'isSocial', isSocial);
}

get isSocial() : boolean {
	return this.getFlag('persona', 'isSocial') ?? false;
}

isEngagedByAnyFoe(subject: UniversalTokenAccessor<PToken>) : boolean {
	const comb = this.findCombatant(subject);
	if (!comb) {return false;}
	return EngagementChecker.isEngagedByAnyFoe(comb, this);
}

isInMeleeWith (token1: UniversalTokenAccessor<PToken> | PToken, token2: UniversalTokenAccessor<PToken> | PToken) : boolean {
	const c1 = token1 instanceof TokenDocument ? this.findCombatant(token1) : this.findCombatant(token1);
	if (!c1) {
		PersonaError.softFail("Can't find combatant");
		return false;
	}
	// const c2 = token2 instanceof Token ? token2 : this.findCombatant(token2 as UniversalTokenAccessor<PToken>);
	const c2 = token2 instanceof TokenDocument ? this.findCombatant(token2) : this.findCombatant(token2);
	if (!c2) {
		PersonaError.softFail("Can't find combatant");
		return false;
	}
	const melee = EngagementChecker.listOfCombatantsInMelee(c1, this);
	return melee.includes(c2);
}

isEngaging(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
	const c1 = this.findCombatant(token1);
	const c2 = this.findCombatant(token2);
	if (!c2 || !c1) {
		PersonaError.softFail("Can't find combatant");
		return false;
	}
	return EngagementChecker.isEngaging(c1, c2, this);
}

isEngagedBy(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
	const c1 = this.findCombatant(token1);
	const c2 = this.findCombatant(token2);
	if (!c2 || !c1) {
		PersonaError.softFail("Can't find combatant");
		return false;
	}
	return EngagementChecker.isEngagedBy(c1, c2, this);
}

getCombatantFromTokenAcc(acc: UniversalTokenAccessor<PToken>): Combatant<ValidAttackers> {
	const token = PersonaDB.findToken(acc);
	const combatant = this.combatants.find( x=> x?.actor?.id == token.actor.id);
	if (!combatant) {
		throw new PersonaError(`Can't find combatant for ${token.name}. are you sure this token is in the fight? `);
	}
	return combatant;
}

async setEngageWith(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) {
	const c1 = this.getCombatantFromTokenAcc(token1);
	const c2 = this.getCombatantFromTokenAcc(token2);
	await this.engagedList.setEngageWith(c1, c2);
}

/** returns pass or fail */
// static async rollSave (actor: ValidAttackers, {DC, label, askForModifier, saveVersus, modifier} :SaveOptions) : Promise<{success:boolean, total:number, natural: number}> {
//    const difficulty = DC ? DC : 11;
//    const mods = actor.getSaveBonus();
//    if (modifier) {
//       mods.add("Modifier", modifier);
//    }
//    if (askForModifier) {
//       const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
//       mods.add("Custom modifier", customMod);
//    }
//    const situation : Situation = {
//       user: PersonaDB.getUniversalActorAccessor(actor),
//       saveVersus: saveVersus ? saveVersus : undefined,
//    }
//    const difficultyTxt = DC == 11 ? "normal" : DC == 16 ? "hard" : DC == 6 ? "easy" : "unknown difficulty";
//    const labelTxt = `Saving Throw (${label ? label + " " + difficultyTxt : ""})`;
//    const r = await new Roll("1d20").roll();
//    const roll = new RollBundle(labelTxt, r, actor.system.type == "pc", mods, situation);
//    await roll.toModifiedMessage();
//    return {
//       success: roll.total >= difficulty,
//       total: roll.total,
//       natural: roll.natural,
//    }
// };

static async disengageRoll( actor: ValidAttackers, DC = 11) : Promise<{total: number, rollBundle: RollBundle, success: boolean}> {
	const situation : Situation = {
		user: PersonaDB.getUniversalActorAccessor(actor),
	};
	const mods = actor.getDisengageBonus();
	const labelTxt = 'Disengage Check';
	const roll = new Roll('1d20');
	await roll.roll();
	const rollBundle = new RollBundle(labelTxt, roll, actor.system.type == 'pc', mods, situation);
	return {
		total: rollBundle.total,
		rollBundle,
		success: rollBundle.total >= DC,
	};
}

/** return true if the token has any enemies remainig*/
enemiesRemaining(token: PToken) : boolean{
	return this.combatants.contents.some(x=> x.token.actor && x.token.actor.system.type != token.actor.system.type);
}

/**return true if the target is eligible to use the power based on whose turn it is
 */
turnCheck(token: PToken, power: UsableAndCard): boolean {
	if (this.isSocial) {return true;}
	if (!this.combatant) {return false;}
	if (token.actor.hasStatus('baton-pass'))
	{return true;}
	if (token.actor.hasStatus('bonus-action'))
	{return true;}
	if (power.isTeamwork() ) {
		if ( this.combatant.actor?.hasStatus('bonus-action') && this.combatant.token.id != token.id) {
			return true;
		}
		ui.notifications.warn("Can't use a teamwork move here.");
		return false;
	}
	return (this.combatant.token.id == token.id);
}

static async allOutAttackPrompt() {
	if (!PersonaSettings.get('allOutAttackPrompt'))
	{return;}
	const combat= this.ensureCombatExists();
	const comb = combat?.combatant as Combatant<ValidAttackers> | undefined;
	const actor = comb?.actor;
	if (!comb || !actor) {return;}
	if (!actor.canAllOutAttack()) {return;}
	const allies = combat.getAllies(comb)
		.filter(comb=> comb.actor && comb.actor.isCapableOfAction() && !comb.actor.isDistracted());
	const numOfAllies = allies.length;
	if (numOfAllies < 1) {
		ui.notifications.notify('Not enough allies to all out attack!');
		return;
	}
	if (!comb || !actor?.isOwner) {return;}
	void PersonaSFX.onAllOutPrompt();
	if (!await HTMLTools.confirmBox('All out attack!', `All out attack is available, would you like to do it? <br> (active Party members: ${numOfAllies})`)
	) {return;}
	if (!actor.hasStatus('bonus-action')) {ui.notifications.warn('No bonus action');}
	const allOutAttack = PersonaDB.getBasicPower('All-out Attack');
	if (!allOutAttack) {throw new PersonaError("Can't find all out attack in database");}
	await PersonaCombat.usePower(comb.token as PToken, allOutAttack);
}

findCombatant(acc :UniversalTokenAccessor<TokenDocument<ValidAttackers>>) : PersonaCombatant | undefined;
findCombatant(actor: ValidAttackers): PersonaCombatant | undefined;
findCombatant(comb :PersonaCombatant) : PersonaCombatant | undefined;
findCombatant(token :PToken) : PersonaCombatant | undefined;
findCombatant(thing :PToken | PersonaCombatant | UniversalTokenAccessor<TokenDocument<ValidAttackers>> | ValidAttackers) : Combatant<ValidAttackers> | undefined {
	const validCombatants = this.validCombatants();
	switch (true) {
		case thing instanceof Combatant: {
			return validCombatants.find( comb=> comb == thing);
		}
		case thing instanceof TokenDocument: {
			return validCombatants.find( comb=> comb.token == thing);
		}
		case thing instanceof Actor: {
			return validCombatants.find( comb=> comb.actor == thing);
		}
		default: {
			const tokenDoc = PersonaDB.findToken(thing);
			return validCombatants.find( comb=> comb.token != undefined && comb.token == tokenDoc); 
		}
	}
}

getAllies(comb: Combatant<ValidAttackers>) : Combatant<ValidAttackers>[] {
	const allegiance = comb.actor?.getAllegiance();
	if (!allegiance) {return [];}
	return this.validCombatants().filter( c => c.actor != null
		&& (c.actor.getAllegiance() == allegiance)
		&& c != comb);
}

getFoes(comb: Combatant<ValidAttackers>) : Combatant<ValidAttackers>[] {
	const allegiance = comb.actor?.getAllegiance();
	if (!allegiance) {return [];}
	return this.validCombatants().filter( c => c.actor != null
		&& (c.actor.getAllegiance() != allegiance)
		&& c != comb);
}

static calculateAllOutAttackDamage(attacker: PToken, situation: AttackResult['situation']) :{contributor: ValidAttackers, amt: number, stack: EvaluatedDamage['str']}[] {
	const attackLeader = PersonaDB.findActor(situation.attacker!);
	const combat = game.combat as PersonaCombat | undefined;
	if (!combat)
	{return [];}
	const attackerComb = combat.findCombatant(attacker);
	if (!attackerComb) {return [];}
	const attackers = [
		attackerComb,
		...combat.getAllies(attackerComb)
	].flatMap (c=>c.actor?  [c.actor] : []);
	if (PersonaSettings.debugMode()) {
		console.debug(`All out attack leader ${attacker.name}`);
	}
	const list : Awaited<ReturnType<typeof PersonaCombat['calculateAllOutAttackDamage']>> = [];
	for (const actor of attackers) {
		if (!actor.canAllOutAttack()) {continue;}
		const mult = actor == attackLeader ? 1 : (1/2);
		const damageCalc = this.individualContributionToAllOutAttackDamage(actor, situation);
		const result = damageCalc.eval();
		if (result == undefined || result.hpChange == 0) {
			PersonaError.softFail('Allout contribution for ${actor.name} was 0 or undefined');
			continue;
		}
		const contribution= Math.round(Math.abs(result.hpChange) * mult);
		list.push(
			{
				contributor: actor,
				amt: contribution,
				stack: result.str,
			}
		);
	}
	return list;
}

static individualContributionToAllOutAttackDamage(actor: ValidAttackers, situation: AttackResult['situation']) : DamageCalculation {
	if (!actor.canAllOutAttack()) {
		return new DamageCalculation("physical");
	}
	const basicAttack = PersonaDB.getBasicPower('Basic Attack');
	if (!basicAttack) {
		PersonaError.softFail("Can't find Basic attack power");
		return new DamageCalculation("physical");
	}
	const damage = basicAttack.damage.getDamage(basicAttack, actor.persona(), situation);
	return damage;
}

getToken( acc: UniversalActorAccessor<PersonaActor>  | undefined): UniversalTokenAccessor<PToken> | undefined {
	if (!acc) {return undefined;}
	if (acc.token) {return acc.token as UniversalTokenAccessor<PToken>;}
	const token = this.combatants.find( comb=> comb?.actor?.id == acc.actorId && comb.actor.token == undefined)?.token;
	if (token && token.actor) {return PersonaDB.getUniversalTokenAccessor(token as PToken);}
	return undefined;
}

getRoomEffects() : UniversalModifier[] {
	const effectIds= this.getFlag<string[]>('persona', 'roomEffects');
	const allRoomEffects = PersonaDB.getSceneAndRoomModifiers();
	if (!effectIds) {return [];}
	return effectIds.flatMap(id=> {
		const effect = allRoomEffects.find(eff => eff.id == id);
		return effect ? [effect] : [];
	});
}

static getRoomModifiers(persona: Persona) {
	const user = persona.user;
	return (game.combats.contents as PersonaCombat[])
		.filter(combat => combat.combatants.contents
			.some( comb => comb.actor == user)
		).flatMap( combat=> combat.getRoomEffects());
}

async alterRoomEffects() {
	const initial = this.getRoomEffects().map( x=> x.id);
	const result = await this.roomEffectsDialog(initial, false);
	await this.setRoomEffects(result.roomModifiers);
	const msg = this.roomEffectsMsg();
	const messageData: MessageData = {
		speaker: {alias: 'Room Effects Update'},
		content: msg,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER,
	};
	await ChatMessage.create(messageData, {});
}

roomEffectsMsg(): string {
	const mods = this.getRoomEffects();
	if (mods.length == 0) {
		return '';
	}
	let msg = '';
	msg += '<u><h2>Room Effects</h2></u><ul>';
	msg += mods.map( x=> `<li><b>${x.name}</b> : ${x.system.description}</li>`).join('');
	msg += '</ul>';
	return msg;
}

async setRoomEffects(effects: ModifierContainer[]) {
	await this.setFlag('persona', 'roomEffects', effects.map(eff=> eff.id));
}

async roomEffectsDialog(initialRoomModsIds: string[] = [], startSocial: boolean) : Promise<DialogReturn> {
	const roomMods = PersonaDB.getSceneAndRoomModifiers();
	const ROOMMODS = Object.fromEntries(roomMods.map( mod => [mod.id, mod.name]));
	const html = await foundry.applications.handlebars.renderTemplate('systems/persona/sheets/dialogs/room-effects.hbs', {
		ROOMMODS : {
			'': '-',
			...ROOMMODS
		},
		roomMods: initialRoomModsIds,
		startSocial,
	});
	return new Promise( (conf, rej) => {
		const dialogOptions : DialogOptions = {
			title: 'room Effects',
			content: html,
			close: () => rej(new Error('Closed')),
			buttons: {
				'ok': {
					label: 'ok',
					callback: (html: string) => {
						const mods : UniversalModifier[] = [];
						$(html)
							.find('select.room-mod')
							.find(':selected')
							.each( function ()  {
								const id= String( $(this).val());
								const mod = roomMods.find(x=> x.id == id);
								if (mod) {
									mods.push(mod);
								}
							});
						const isSocialScene = $(html).find('.social-round').is(':checked');
						const advanceCalendar = $(html).find('.advance-calendar').is(':checked');
						const disallowMetaverse = $(html).find('.disallow-metaverse').is(':checked');
						const ret : DialogReturn = {
							roomModifiers: mods,
							isSocialScene,
							advanceCalendar,
							disallowMetaverse,
						};
						conf(ret);
					},
				}
			}
		};
		const dialog = new Dialog( dialogOptions, {});
		dialog.render(true);
	});
}

debug_engageList() {
	const list = [] as string[];
	const combs= this.combatants;
	for (const comb of combs) {
		const combAcc = PersonaDB.getUniversalTokenAccessor(comb.token as PToken);
		const foeEng = this.isEngagedByAnyFoe(combAcc) ? '*' : '';
		const engagedBy = combs
			.filter( c => this.isEngagedBy(combAcc, PersonaDB.getUniversalTokenAccessor(c.token as PToken)))
			.map(c=> c.name);
		list.push(`${comb.name}${foeEng} Engaged By: ${engagedBy.join(' , ')}`);
		const engaging = combs
			.filter( c=> this.isEngaging(combAcc, PersonaDB.getUniversalTokenAccessor(c.token as PToken)))
			.map( c=> c.name);
		list.push(`${comb.name}${foeEng} is Engaging: ${engaging.join(' , ')}`);
	}
	console.log(list.join('\n'));
}

async generateTreasureAndXP() {
	if (this.isSocial) {return;}
	if (this.didPCsWin() == false) {return;}
	const actors = this.combatants
		.contents.flatMap( x=> x?.actor ? [x.actor] : [] );
	const shadows= actors
		.filter (x => x.system.type == 'shadow');
	if (shadows.some(x=> !x.hasPlayerOwner && x.hp > 0)) {
		return;
	}
	const defeatedFoes = this.defeatedFoes.concat(shadows);
	for (const foe of defeatedFoes) {
		await foe.onDefeat();
	}
	this.defeatedFoes = [];
	const pcs = actors.filter( x => x.isPC());
	const party = actors.filter( x=> x.isPC() ||  x.isNPCAlly() || (x.isDMon() && x.hasPlayerOwner));
	try {
		await Metaverse.awardXP(defeatedFoes as Shadow[], party);
	} catch  {
		PersonaError.softFail('Problem with awarding XP');
	}
	try{
		const treasure = await Metaverse.generateTreasure(defeatedFoes);
		await Metaverse.printTreasure(treasure);
		await Metaverse.distributeMoney(treasure.money, pcs);
	} catch  {
		PersonaError.softFail('Problem with generating treasure');
	}
}

displayCombatHeader(element : JQuery<HTMLElement>) {
	try {
		if ($(element).find('.escalation-die').length == 0) {
			// const escalation = `
			// 			<div class="escalation-tracker">
			// 				 <span class="title"> Escalation Die: </span>
			// 				 <span class="escalation-die">N/A
			// 			</div>
			// `;
			const escalationTracker = `
				 <div class="combat-info flexrow">
					 <div class="weather-icon">
					 </div>
					 <div class="region-treasures">
					 </div>
				 </div>
						`;
			element.find('.combat-tracker-header').append(escalationTracker);
		}
		const weatherIcon = PersonaCalendar.getWeatherIcon();
		element.find('div.weather-icon').append(weatherIcon);
		const treasures = Metaverse.getRegion()?.treasuresRemaining;
		if (treasures && treasures >= 0) {
			element.find('div.region-treasures').append(`<span> Treasures Remaining ${treasures} </span>`);
		}
		element.find('div.weather-icon').append(weatherIcon);
		// const escalationDie = String(this.getEscalationDie());
		// element.find('.escalation-die').text(escalationDie);
	} catch (e) {
		PersonaError.softFail("Can't display Combat Tracker stuff", e);
	}
	this.displayRoomEffectChanger(element);
}

displayRoomEffectChanger(element: JQuery<HTMLElement>) {
	if (element.find('.room-effects-button').length == 0) {
		const button = $( `
				 <button>
				 <i class="fa-solid fa-wand-magic-sparkles"></i>
				 </button>
`).addClass('room-effects-button');
		if (game.user.isGM) {
			button.on('click', this.alterRoomEffects.bind(this));
		} else {
			button.on('click', this.showRoomEffects.bind(this));
		}
		element.find('.combat-info').append(button);
	}
}

async showRoomEffects() {
	const msg = this.roomEffectsMsg();
	const messageData: MessageData = {
		speaker: {alias: 'Room Effects'},
		whisper: [game.user],
		content: msg,
		style: CONST.CHAT_MESSAGE_STYLES.WHISPER,
	};
	await ChatMessage.create(messageData, {});
}

override async rollInitiative(ids: string[], {formula=null, updateTurn=true, messageOptions={}}={}) {

	// Structure input data
	ids = typeof ids === 'string' ? [ids] : ids;
	const currentId = this.combatant?.id;

	// Iterate over Combatants, performing an initiative roll for each
	const updates = [];
	const rolls :{ combatant: Combatant, roll: Roll}[]= [];
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	for ( const [_i, id] of ids.entries() ) {

		// Get Combatant data (non-strictly)
		const combatant = this.combatants.get(id);
		if ( !combatant?.isOwner ) {continue;}

		// Produce an initiative roll for the Combatant
		const roll = combatant.getInitiativeRoll(formula);
		await roll.evaluate();
		rolls.push({combatant, roll});
		updates.push({_id: id, initiative: roll.total});

	}
	if ( !updates.length ) {return this;}

	// Update multiple combatants
	await this.updateEmbeddedDocuments('Combatant', updates);

	// Ensure the turn order remains with the same combatant
	if ( updateTurn && currentId ) {
		await this.update({turn: this.turns.findIndex(t => t.id === currentId)});
	}

	await this.generateInitRollMessage(rolls, messageOptions);
	// Create multiple chat messages
	// await ChatMessage.implementation.create(messages);
	return this;
}

async onFollowUpAction(token: PToken, activationRoll: number) {
	console.debug('Calling On Follow Up Action');
	const combatant = token.object ? this.getCombatantByToken(token): null;
	if (!combatant || !combatant.actor) {return;}
	if (combatant.actor && combatant.actor.hasStatus('down')) {return;}
	const combat = combatant.parent as PersonaCombat | undefined;
	if (!combat) {return;}
	const allies = this.getAllies(combatant as Combatant<ValidAttackers>)
		.filter (ally => ally.actor?.canTakeFollowUpAction());
	const followups = this.getUsableFollowUps(token, activationRoll).join('');
	const validTeamworkAllies = allies
		.flatMap( ally => {
			if (ally == combatant) {return [];}
			const actor = ally.actor;
			if (!actor || !actor.teamworkMove ) {return [];}
			if (!actor.persona().canUsePower(actor.teamworkMove, false)) {return [];}
			const situation : CombatRollSituation = {
				naturalRoll: activationRoll,
				rollTags: ['attack', 'activation'],
				rollTotal : activationRoll,
				user: actor.accessor,
			};
			if (!actor.teamworkMove.testTeamworkPrereqs(situation, actor)) {return [];}
			const targets = combat.getValidTargetsFor(actor.teamworkMove, combatant as Combatant<ValidAttackers>, situation);
			if (targets.length == 0) {return [];}
			return [ally];
		});
	const allout = (combat.getAllEnemiesOf(token)
		.every(enemy => enemy.actor.hasStatus('down'))
		&& combatant.actor.canAllOutAttack())
		? '<li> All out attack </li>'
		: '';
	const listItems = validTeamworkAllies
		.map( ally => {
			const power = ally.actor!.teamworkMove!;
			return `<li>${power.name} (${ally.name})</li>`;
		}).join('');
	const teamworkList = !combatant.actor.isDistracted() ? listItems: '';
	const msg = `<h2> Valid Follow Up Actions </h2>
<ul>
			<li> Act again </li>
			${allout}
			${followups}
			${teamworkList}
			</ul>
`;
	const messageData: MessageData = {
		speaker: {alias: 'Follow Up Action'},
		content: msg,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER,
	};
	await ChatMessage.create(messageData, {});
}

getUsableFollowUps(token: PToken, activationRoll: number) : string []{
	const combatant = token.object ? this.getCombatantByToken(token): null;
	if (!combatant || !combatant.actor) {return [];}
	const actor = combatant.actor;
	const situation : CombatRollSituation = {
		naturalRoll: activationRoll,
		rollTags: ['attack', 'activation'],
		rollTotal: activationRoll,
		user: actor.accessor,
	};
	const persona = actor.persona();
	const followUpMoves = actor.powers
		.filter(pwr => pwr.isFollowUpMove()
			&& persona.canPayActivationCost(pwr)
			&& pwr.testFollowUpPrereqs(situation, actor)
		);
	const followup = followUpMoves
		.map(usable => {
			const targets =this.getValidTargetsFor(usable, combatant, situation)
				.map (x=> x.token.name);

			if (targets.length == 0) {return '';}
			return `<li> ${usable.name} (${targets.join(', ')})</li>`;
		});
	return followup;
}

async generateInitRollMessage<R extends Roll>(rolls: {combatant: Combatant, roll: R}[], messageOptions: Foundry.MessageOptions = {}): Promise<ChatMessage<R>> {
	const rollTransformer = function (roll: Roll) {
		const total = roll.total;
		if (total <= 0) {return 'last';}
		else {return Math.round(total);}
	};
	const rolltxt = rolls
	.sort( (a, b) => b.roll.total - a.roll.total)
	.map(({roll, combatant}) => `<div class="init-roll"> ${combatant.name}: ${rollTransformer(roll)} </div>`)
	.join('');
	const html = `<h3 class="init-rolls"> Initiative Rolls </h3> ${rolltxt}`;
	const chatMessage: MessageData<R> = {
		speaker: {alias: 'Combat Start'},
		content: html,
		rolls: rolls.map(x=> x.roll),
		style: CONST.CHAT_MESSAGE_STYLES.ROLL,
	};
	return await ChatMessage.create(chatMessage, messageOptions);
}

static async testPowerVersusPCs(attacker: PToken, power: Usable) :Promise<number[]> {
	const PCs= PersonaDB.PCs();
	const scene = game.scenes
		.find( sc=> PCs
			.every( pc => sc.tokens.contents
				.some(tok => tok.actor == pc)
			)
		);
	if (!scene) {
		throw new PersonaError("Can't find scnee containing all PCs");
	}
	const PCTokens= scene.tokens.filter( (tok: PToken)=> tok.actor != undefined && tok.actor.isPC() && PCs.includes(tok.actor)) as PToken[];
	const result = await this.usePower(attacker, power, PCTokens, {askForModifier: false, setRoll: 16, ignorePrereqs : true, simulated: true});
	const changes = result.attacks.flatMap( atk => atk.changes);
	const PCResult = PCs.map( pc => {
		const PCChanges = changes.filter( ch => {
			const actor = PersonaDB.findActor(ch.actor);
			return actor == pc;
		});
		const HPChanges = PCChanges.map ( x=> x.damage.reduce (
			(acc, dmg) => acc + dmg.hpChange, 0));
		const dmg= -1 * HPChanges.reduce( (acc,ch) => acc+ch, 0);
		return Number((pc.mhp / dmg).toFixed(2));
	});
	//BUG does not work well for flurry powers yet
	return PCResult;
}

} // end of class


export type ValidAttackers = PC | Shadow | NPCAlly;

export type PToken = TokenDocument<ValidAttackers> & {get actor(): ValidAttackers};

CONFIG.Combat.initiative = {
	formula : '1d10 + @parent.init',
	decimals: 2
};

type DialogReturn = {
	roomModifiers: UniversalModifier[],
	isSocialScene: boolean,
	advanceCalendar: boolean,
	disallowMetaverse: boolean,
}

export type SaveOptions = {
	label?: string,
	DC?: number,
	askForModifier?: boolean,
	saveVersus?: StatusEffectId,
	modifier ?: number,
	rollTags : (RollTag | CardTag) [], 
}


export type ConsequenceProcessed = {
	consequences: {
		applyTo: 'global' | ValidAttackers,
		cons: EnhancedSourcedConsequence<NonDeprecatedConsequence>,
	}[],
	// escalationMod ?: number
}

CombatHooks.init();

type OpenerOptionsReturn = {
	msg: string[],
	options: OpenerOption[]
}

type OpenerOption = {
	mandatory: boolean,
	optionName: string,
	// optionTxt: string,
	optionEffects: OptionEffect[],
	toolTip ?: string,
	power ?: {
		powerId: Power['id'],
		/** Only included if power has selectable targets, and lists a list of possible legal targets */
		targets: PersonaCombatant[] | undefined,
	}
}

interface OptionEffects {
	'disengage': string,
}

type OptionEffect = keyof OptionEffects;

export type PersonaCombatant = NonNullable<PersonaCombat['combatant']> & {actor: ValidAttackers , token: PToken};

type CombatRollSituation = AttackResult['situation'];

type IntoCombatant = PersonaCombatant | UniversalTokenAccessor<PToken> | UniversalActorAccessor<ValidAttackers>;


export type TargettingContextList = Omit<Record<ValidAttackersApplies, UniversalActorAccessor<ValidAttackers>[]>, "owner"> & {
	owner: UniversalActorAccessor<PersonaActor>[],
	cameo: UniversalActorAccessor<ValidSocialTarget>[];
}

type ValidAttackersApplies = Exclude<NonNullable<Consequence['applyTo']>, 'cameo'>;

export type TargettingContext = <T extends keyof TargettingContextList>( applyTo: T) => TargettingContextList[T]


export class TargettingError extends Error {
	constructor (errormsg: string) {
		super(errormsg);
		ui.notifications.warn(errormsg);
	}
}

interface CombatOptions {
	askForModifier ?: boolean;
	setRoll?: number;
	ignorePrereqs?: boolean;
	simulated?: boolean;
}
