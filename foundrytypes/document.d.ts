 class FoundryDocument <Embedded extends (FoundryDocument | never) = never> {
	get parent(): FoundryDocument<any> | undefined;

	async update<T extends updateObj> (updateData: AllowedUpdateKeys<T>): Promise<this>;
	 // async update(updateData: RecursivePartial< typeof this>): Promise<this>

	 name: string;
	 id: string;
	 async updateEmbeddedDocuments(type: string, updates: unknown): Promise<unknown>;
	 async createEmbeddedDocuments(type: string, objData: Record<string, any>[], context?: unknown): Promise<Embedded[]>;
	 sheet: Sheet<this>
	 get schema(): SchemaField<unknown>;
	 async delete(): Promise<void>;
	 async deleteEmbeddedDocuments( embeddedName: string, ids: unknown, context: Record<string, any> = {}): Promise<void>;
	 get isOwner(): boolean;
	 get limited(): boolean;
	 get hasPlayerOwner(): boolean;
	 get documentName(): string;
	 ownership : { default: number} & Record<FoundryUser["id"], number>;
	 getFlag<T = unknown>(scope: string, key: string): T;
	 async setFlag(scope:string, key:string, value: any): Promise<void>;
	 async unsetFlag(scope:string, key:string): Promise<void>;
	 prepareBaseData(): void;
	 prepareEmbeddedDocuments(): void;
	 prepareDerivedData(): void;
	 testUserPermission(user: FoundryUser, permissionLevel: "NONE" | "LIMITED" | "OWNER" | "OBSERVER", options: {exact?: boolean} = {}): boolean;
	 static async create<T>(this: T, data: CreationData):Promise<InstanceType<T>>;
	 migrateSystemData(sourceMaybe?: unknown): unknown;
	 async updateSource(updateData: Record<string, unknown>): Promise<unknown>;
	 get folder(): Folder;
	 static defineSchema(): Record<string, FoundryDMField<any>>;

}

// type RecursivePartial<T> = {
//   [P in keyof T]?:
//     T[P] extends (infer U)[] ? RecursivePartial<U>[] :
//     T[P] extends object | undefined ? RecursivePartial<T[P]> :
//     T[P];
// };


type CreationData = Record<string, unknown>  & {
	name: string;
	type: string;

}

interface Folder {

};

type AllStringsStartingWith<Prefix extends string, T extends string | number | symbol = string | number | symbol>=
  T extends `${Prefix}${infer _}` ? T : never;
type updateObj = {[k:string] : any};
type DisallowKey<O extends updateObj , key extends string> = { [K in keyof O]: K extends AllStringsStartingWith<key, K> ? undefined : O[K]};
type AllowedUpdateKeys<O extends updateObj> = DisallowKey<O, "data">;

//Experimental method to try to get update to check keys, did not work, types became too deep for TS to keep up with
// type Flatten<T, ParentKey extends string = ''> = T extends Record<string, any>
//   ? {
//       [K in keyof T & string]: T[K] extends Record<string, any>
//         ? Flatten<T[K], `${ParentKey}${K}.`>
//         : { [P in `${ParentKey}${K}`]: T[K] };
//     }[keyof T & string]
//   : never;


// type RemoveType<T, U> = {
//   [K in keyof T as T[K] extends U ? never : K]: T[K] extends object
//     ? RemoveType<T[K], U>
//     : T[K];
// };

// type CleanDocument<O extends Record<string, any>> = RemoveType<Pick<O, "system" | "name" | "prototypeToken" | "img">, FoundryDocument<any> | Function>;


