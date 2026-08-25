type Subtype<T extends (Actor | Item), X extends T["system"]["type"]> = T & {system: {get type() : Readonly<X>}};
type SubtypeSys<T extends (Actor | Item), X extends T["system"]["type"]> = Subtype<T,X>["system"];

type DataModelSystemData<DM extends typeof foundry.abstract.DataModel> = SystemDataObjectFromDM<DM>;

type ValueOf<T extends object> = T[keyof T];


