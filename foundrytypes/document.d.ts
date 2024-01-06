 class FoundryDocument <Embedded extends (FoundryDocument | never) = never> {
	get parent(): FoundryDocument | null;
	async update(updateData: Record<string, any>): Promise<void>;
	name: string;
	id: string;
	async createEmbeddedDocuments(type: string, objData: Record<string, any>[]): Promise<Embedded[]>;
	 sheet: Sheet<this>

	 get isOwner(): boolean;
	 get limited(): boolean;
	 get hasPlayerOwner(): boolean;
	 get documentName(): string;
	 async setFlag(scope:string, key:string, value: any): Promise<void>;
	 async unsetFlag(scope:string, key:string): Promise<void>;


}

