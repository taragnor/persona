declare class Item<T extends SchemaDict >{
	name: string;
	id: string;
	type: string;
	system: TotalConvert<T>;
}
