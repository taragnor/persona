declare class Item<T extends SchemaDict> extends Document {
	name: string;
	id: string;
	type: string;
	system: TotalConvert<T>;
}
