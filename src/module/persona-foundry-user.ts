import {HTMLTools} from "./utility/HTMLTools.js";

export class PersonaFoundryUser extends User {

  get isAFK() : boolean {
    const players = $(document)
      .find(".player.player-away")
      .filter( (_index, element) => {
        const id = HTMLTools.getClosestDataSafe($(element), "userId", "");
        if (!id) {return false;}
        return this.id == id;
      });
    if (players.length > 0) {return true;}
    return false;
  }
}
