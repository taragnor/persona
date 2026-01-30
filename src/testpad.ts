type r= Foundry.Branded<string, "mything">;

type o = {
	x : r,
	j : string,
	b: number,
};

type j = Foundry.SchemaConvert<o>;

const x : j = {x: "hello", j: "goodbye", b:5} as j;

type xx= typeof x["x"];

type xxx = typeof x["x"] extends string ? true: false;

game.messages
