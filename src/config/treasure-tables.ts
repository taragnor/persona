import { HTMLTools } from "../module/utility/HTMLTools.js";
 const TREASURE_TABLES_LIST =[
	 "none",
	 "trinkets",
	 "lesser",
	 "greater",
	 "royal",
 ] as const;

export type TreasureTable = typeof TREASURE_TABLES_LIST[number];


export const TREASURE_TABLES = HTMLTools.createLocalizationObject(TREASURE_TABLES_LIST, "persona.treasureTable.label");



