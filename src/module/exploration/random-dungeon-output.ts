import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {PersonaRegion} from "../region/persona-region";
import {DungeonSquare, WallData} from "./dungeon-generator-square.js";
import {RandomDungeonGenerator} from "./random-dungeon-generator.js";

export class RandomDungeonOutput {

	scene: PersonaScene;
	_generator: U<RandomDungeonGenerator>;

	static async outputToScene (gen: RandomDungeonGenerator, scene: PersonaScene) {
		const outputter = new RandomDungeonOutput( scene, gen);
		await outputter.outputDataToScene();
	}

	get wallData() {
		return this.generator.wallData;
	}

	get generator() : RandomDungeonGenerator {

		if (!this._generator) {
			throw new PersonaError("No generator provided");
		}
		return this._generator;
	}

	get squareList() {
		return this.generator.squareList;
	}

	constructor (scene: PersonaScene, generator: RandomDungeonGenerator) {
		if (!scene.allowsRandomGenerator()) {
			throw new PersonaError("This scene doesn't allow random Mutation");
		}
		this.scene = scene;
		this._generator = generator;
	}

	async outputDataToScene() {
		if (this.squareList.length == 0) {
			throw new PersonaError("You haven't run genreate yet");
		}
		await this.clearScene();
		await this.movePCs();
		await this.resetFog();
		await this.updateSceneName();
		await this.createWalls();
		await this.createRegions();
		await this.createTreasures();
		await this.setRandomEncounterList();
		await this.writeSceneModifiers();
		await this.resetFog();
	}

	private async updateSceneName() {
		const name = `${this.generator.name} L${this.generator.currentDepth+1}`;
		await this.scene.update({name});
	}

	private async movePCs() {
		const PCTokens = this.scene.tokens.filter( tok => tok.actor != undefined && tok.actor.hasPlayerOwner && !tok.hidden);
		const startingSq = this.squareList.find( x=> x.isStartPoint());
		if (!startingSq) {
			ui.notifications.error("No startign square");
			return;
		}
		for (const tok of PCTokens) {
			const {x, y} = startingSq.treasurePosition();
			await tok.move( {x , y, action: "displace"});
		}
	}

	private async clearScene () {
		for (const i of this.scene.walls) {
			await i.delete();
		}
		for (const i of this.scene.regions) {
			await i.delete();
		}
		for (const i of this.scene.drawings) {
			await i.delete();
		}
		for (const t of this.scene.tokens) {
			if (game.itempiles && game.itempiles.API.isValidItemPile(t)) {
			await t.delete();
				continue;
			}
			if (t.actor && t.actor.isShadow()) {await t.delete();}
		}
	}

	private async createWalls() {
		await this.addWalls(this.wallData);
		const lines = this.wallData
			.map(x=> RandomDungeonOutput.wallToLineConvert(x))
			.filter (x => x != undefined);
		await this.scene.createEmbeddedDocuments( "Drawing", lines);
	}


	private async createRegions() {
		for (const sq of this.squareList) {
			const rdata = sq.region;
			if (!rdata) {continue;}
			const region = (await this.scene.createEmbeddedDocuments<PersonaRegion>("Region", [rdata as Record<string, unknown>]))[0];
			await region.setRegionData(sq.regionData);
		}
	}


	private async addWalls(wallData: Partial<WallData>[]) {
		await this.scene.createEmbeddedDocuments("Wall", wallData);
	}

	private async createTreasures() {
		if (game.itempiles == undefined) {
			PersonaError.softFail("No item piles, can't create treasures");
			return;
		}
		for (const sq of this.squareList)  {
			if (sq.treasures.length == 0) {continue;}
			const position = sq.treasurePosition();
			const pile = await game.itempiles.API.createItemPile({position});
			if (!pile?.tokenUuid)  {
				PersonaError.softFail(`Something went wrong with creating Item pile at ${position.x} , ${position.y}`);
				return;
			}
			const pileActor = await foundry.utils.fromUuid(pile.tokenUuid) as TokenDocument<PersonaActor> ;
			if (!pileActor || !(pileActor instanceof TokenDocument) || !pileActor.actor) {
				PersonaError.softFail(`Cant' find token ${pile?.tokenUuid}`);
				return;
			}
			for (const treasure of sq.treasures) {
				await pileActor.actor.addTreasureItem(treasure, true);
			}
		}

	}

	private async resetFog() {
		if (!game.user.isGM) {return;}
		if (game.scenes.current != this.scene) {
			new PersonaError("Can't clear fog this scene isn't current scene.");
		}
		await game.canvas.fog.reset();
	}

	private async setRandomEncounterList() {
		await this.scene.setDifficulty(this.generator.difficultyLevel);
	}

	private async writeSceneModifiers() {
		await this.scene.setSceneModifiers(this.generator.sceneModifiers);
	}

	static wallToLineConvert( wd: Pick<WallData, "door" | "c">) : U<Partial<Foundry.DrawingData>> {
		if (wd.door == 1) {return undefined;}
		const [x1, y1, x2, y2] = DungeonSquare.flipCoordsIfNecessary(wd.c);
		const dx = x2 - x1;
		const dy = y2 - y1;
		const shape : Foundry.ShapesData = {
			type: "p",
			height: Math.abs(y2- y1),
			width: Math.abs(x2- x1),
			radius: null,
			points: [0, 0, Math.abs(dx), Math.abs(dy)]
		};
		const color = wd.door == 0 ? "#FF0000" : "#DD0000";
		return {
			x: x1,
			y: y1,
			strokeColor: color,
			strokeWidth: 15,
			strokeAlpha: 0.8,
			shape,
			hidden: false,
			locked: true,
			interface: false,
		};
	}

}
