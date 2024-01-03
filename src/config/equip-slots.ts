export const EQUIP_SLOTS_LIST = [
	"body",
	"accessory",
	"weapon_crystal",
	"none",
];


export const EQUIP_SLOTS = Object.fromEntries(
	EQUIP_SLOTS_LIST.map( x=> [x, `persona.equipslots.${x}`])
);
