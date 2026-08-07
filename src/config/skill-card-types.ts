import {HTMLTools} from "../module/utility/HTMLTools.js";

const SKILL_CARD_TYPES_LIST  = [
  "skill",
  "velvet-skill",
  "persona",
] as const;


export const SKILL_CARD_TYPES = HTMLTools.createLocalizationObject(SKILL_CARD_TYPES_LIST, "persona.skillcards.types");

export type SkillCardType = keyof typeof SKILL_CARD_TYPES;
