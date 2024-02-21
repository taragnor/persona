declare class Item<T extends SchemaDict> extends FoundryDocument<never> {
	parent: Actor<any,this, any> | undefined;
	name: string;
	id: string;
	type: keyof T;
	system: TotalConvert<T>;
	sheet: ItemSheet<this>;
}
