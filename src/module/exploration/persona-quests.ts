import {PersonaVariables} from "../persona-variables.js";
import {DungeonGeneratorOptions} from "./random-dungeon-generator.js";

export class PersonaQuests {

  static questSpecials() : DungeonGeneratorOptions["questSpecials"] {
    const arr : NonNullable<DungeonGeneratorOptions["questSpecials"]> = [] ;
    if (PersonaVariables.getGlobalVariable("QUEST_COMPUTER") == 100) {
      arr.push( {
        level: 8,
        roomName: "Lost Person",
        requirement: "dead-end",
        gmNotes: "Zain Richards is here cowering.",
        poi: "A college student is here cowering",
      });
    }
    if (PersonaVariables.getGlobalVariable("QUEST_TRANSLATE") == 100) {
      arr.push( {
        level: 4,
        roomName: "Lost Person",
        requirement: "either",
        gmNotes: "Som Chalor",
        poi: "An Elderly Asian man is here cowering."
      });
    }
    return arr;
  }

}
