declare class Item<T extends SchemaDict> extends FoundryDocument<never> {
	name: string;
	id: string;
	type: string;
	system: TotalConvert<T>;
	sheet: ItemSheet<this>;
}
