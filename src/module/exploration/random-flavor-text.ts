import {CorridorFlavorText, RoomFlavorText} from "./random-dungeon-generator.js";

export const ROOM_FLAVORS : RoomFlavorText[] = [
  {
    newName: "Data Cache",
    text: "There seems to be a collection of various data here. If you had the right implement, you might be able to extract some." ,
    gmNote: "Can be mined with a Data Miner",
    hiddenRoom: false,
    //need to detrmine what can be gained here
  }, {
    newName: "Gallery",
    text: "Various Photos, (many of them of cats) are all over the walls of this room" ,
    hiddenRoom: false,
  }, {
    newName: "Explicit Pictures Gallery",
    text: "Various pictures of a sexual nature are posted here on the walls" ,
    secret: "Can find some clues to find Cassandra's source if possible",
    weight: 0.2,
    hiddenRoom: false,
  }, {
    newName: "Blanked Data",
    text: "The data here seems to have bene deliberately deleted. It seems irrecoverable" ,
    weight: 1.0,
    hiddenRoom : false,
  }, {
    newName: "Blanked Data",
    text: "The data here seems to have bene deliberately deleted." ,
    weight: 0.333,
    secret: "With some effort you're able to reconstruct the data.",
    hiddenRoom: false,
  }, {
    newName: "Data Cache",
    text: "There seems to be a collection of various data here. If you had the right implement, you might be able to extract some." ,
    weight: 0.333,
    gmNote: "Can be mined with a Data Miner. Contains financial Data, get 300R",
  }, {
    newName: "Concordia Daemon Processing Node",
    text: "This area seems to contain some kind of secuirity device, it has a concordia signature on it. It does seem important, but do you smash it or try to examine it." ,
    hazard: "Summons a daemon encounter",
    secret: "Grants a new daemon persona or skillCard",
    gmNote: "",
    weight: 0.2,
    hiddenRoom: true,
  }, {
    newName: "Concordia Daemon Processing Node",
    text: "This area seems to contain some kind of secuirity device, it has a concordia signature on it. It does seem important, but do you smash it or try to examine it." ,
    hazard: "Summons a daemon encounter",
    secret: "Reveals Cheshy as a daemon",
    gmNote: "Reveals Cheshy's true nature",
    weight: 0.2,
    hiddenRoom: true,
  }, {
    newName: "Concordia Treasure Cache",
    text: "Seems to be a collection of useful Metaverse objects",
    weight: 0.2,
    hazard: "Alarm raises tension by +2",
    hiddenRoom: true,
    ultraRichTreasure : true ,
  }, {
    newName: "Concordia Metaverse Manipulator",
    text: "An odd Concordia device",
    weight: 0.2,
    hiddenRoom: true,
    secret: "Seems to be a warp zone, takes you down 5 levels instantly."
  },
] as const;

export const CORRIDOR_FLAVORS : CorridorFlavorText[] = [
	{
		text: "Many data cubes whizz by at great speed",
    weight: 1.0,
	} , {
		text: "Many data cubes whizz by at great speed",
		secret: "There is a Concordia packet inspector here. It seems to be gathering information. Can either be destroyed or tapped for data with the other action.",
		weight: 0.5,
		gmNote: "PCs can destroy it with an other action or try to tap it for data."
	} , {
		text: "The travelling Data cubes seem to travel in an odd path here",
		tellForHiddenDoor : true,
		weight: 0.333,
	}
] as const;

