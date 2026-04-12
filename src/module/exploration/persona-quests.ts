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
    arr.push( {
      level: 9,
      roomName: "Cassandra's Photo Forger",
      requirement: "room",
      gmNotes: "Cassandra's Hacker, a breach in the wall.",
      poi: "Wall Breach: There seems to be a sort of breach in space here, it seems to lead to a small pocket realm in the metaers, likely ruled by ashadow. Rise thinks it may be the one that released Cassandra's Photos."
    });
    return arr;
  }


}
