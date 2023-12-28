 class FoundryDocument <Embedded extends (FoundryDocument | never)> {
	get parent(): FoundryDocument | null;
	async update(updateData: Record<string, any>): Promise<void>;
	name: string;
	id: string;
	async createEmbeddedDocuments(type: string, objData: Record<string, any>[]): Promise<Embedded[]>;

}

