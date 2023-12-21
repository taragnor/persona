// import { pcSchema } from "./module/datamodel/actor-types";
// import { ShadowSchema } from "./module/datamodel/actor-types";
// import { NPCSchema } from "./module/datamodel/actor-types";
import { ACTORMODELS } from "./module/datamodel/actor-types.js";
import { ITEMMODELS} from "./module/datamodel/item-types.js";
import { PersonaActor } from "./module/actor/persona-actor.js";

function registerDataModels () {
	CONFIG.Actor.dataModels= ACTORMODELS;
}




