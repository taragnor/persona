 class FoundryDocument <Embedded extends (FoundryDocument | never)> {
	get parent(): FoundryDocument | null;
	update(updateData: Record<string, any>): void;
	name: string;
	id: string;
	createEmbeddedDocuments(type: string, objData: Record<string, any>[]): Embedded[];

}

