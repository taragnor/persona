export const TAROT_DECK = {
	"Fool": "persona.tarot.0.name",
	"Magician": "persona.tarot.1.name",
	"HighPriestess": "persona.tarot.2.name",
	"Empress": "persona.tarot.3.name",
	"Emperor": "persona.tarot.4.name",
	"Hierophant": "persona.tarot.5.name",
	"Lovers": "persona.tarot.6.name",
	"Chariot": "persona.tarot.7.name",
	"Justice": "persona.tarot.8.name",
	"Hermit": "persona.tarot.9.name",
	"WheelOfFortune": "persona.tarot.10.name",
	"Strength": "persona.tarot.11.name",
	"HangedMan": "persona.tarot.12.name",
	"Death": "persona.tarot.13.name",
	"Temperance": "persona.tarot.14.name",
	"Devil": "persona.tarot.15.name",
	"Tower": "persona.tarot.16.name",
	"Star": "persona.tarot.17.name",
	"Moon": "persona.tarot.18.name",
	"Sun": "persona.tarot.19.name",
	"Judgment": "persona.tarot.20.name",
	"World": "persona.tarot.21.name",
	"": "-",
} as const;

export type TarotCard = keyof typeof TAROT_DECK;
