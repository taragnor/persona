declare class Item<T extends SchemaDict> extends FoundryDocument<never> {
	parent: Actor<any,typeof this, any>;
	name: string;
	id: string;
	type: string;
	system: TotalConvert<T>;
	sheet: ItemSheet<this>;
}
