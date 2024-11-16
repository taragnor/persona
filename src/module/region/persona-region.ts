import { PersonaDB } from "../persona-db.js";
import { PersonaItem } from "../item/persona-item.js";

const SPECIAL_MOD_LIST = [
	"treasure-poor", //1d10 treasure
	"treasure-rich", //1d20+5 treasure
	"treasure-ultra", //1d10+15 treasure
	"hazard-on-2",
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
	secret: SecretChoice,
	hazard: SecretChoice,
	treasures: {
		found: number,
		max: number,
	},
	roomEffects: Item["id"][],
	pointsOfInterest: string[],
	specialMods: SpecialMod[],
	concordiaPresence: number,
}

export class PersonaRegion extends RegionDocument {

	defaultRegionData() : RegionData {
		return {
			secret: "none",
			hazard: "none",
			treasures : {
				found: 0,
				max: 1,
			},
			roomEffects: [],
			pointsOfInterest: [],
			specialMods: [],
			concordiaPresence: 0,
		}

	}
	get regionData(): RegionData {
		return this.getFlag("persona", "RegionData") ?? this.defaultRegionData();
	}

	get secret(): SecretChoice {
		return this.regionData.secret ?? "none";
	}

	get hazard(): SecretChoice {
		return this.regionData.hazard ?? "none";
	}

	get concordiaPresence(): number {
		return this.regionData.concordiaPresence ?? 0;
	}

	async setRegionData(data: RegionData) {
		await this.setFlag("persona", "RegionData", data);
	}

	formEntryField(field: keyof RegionData) {
		let element = $("<div>");
		element.append($("<label>").text(
			game.i18n.localize(`persona.roomAttribute.${field}`)
		));
		const fieldClass = `field-${field}`;
		switch (field) {
			case "secret":
			case "hazard": {
				const val = this.regionData[field];
				let select = $("<select>")
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
						const mod = $("<option>").val(k).text(v).prop("selected", val.at(i) == k);
						select.append(mod);
					}
					element.append(select);
				}
				break;
			}
			case "concordiaPresence": {
				const val = this.regionData[field];
				element.append(
					$(`<input type="number">`).addClass(`${fieldClass}-found`).val(val ?? 0)
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
				case "secret":
				case "hazard":
				case "concordiaPresence": {
					const input = topLevel.find(`.${fieldClass}`).val();
					if (input != undefined) {
						(data[k] as any) = input;
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
						(data[k] as any) = inputs;
					}
					break;
				}
				case "treasures": {
					const max = Number(topLevel.find(`.${fieldClass}-max`).val());
					const found = Number(topLevel.find(`.${fieldClass}-found`).val());
					data[k]= {
						found,
						max
					}
					break;
				}
				default:
					k satisfies never;
			}
		}
		this.setRegionData(data);
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

}

Hooks.on("renderRegionConfig", async (app, html) => {
	// console.log(app, html);
	// Debug(html);
	let appendPoint = $(html).find(".tab.region-identity");
	if (appendPoint.length != 1) {
		throw new Error(`Append Point Length equals ${appendPoint.length}`);
	}
	const region = app.document as PersonaRegion;
	appendPoint.append($("<hr>"))
		.append(region.formFields());

	//@ts-ignore
	app.setPosition({ height: 'auto' });

});

