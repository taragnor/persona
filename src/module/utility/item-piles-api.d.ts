interface Game {
	itempiles ?: {
		API: ItemPilesAPI;
	}

}
interface ItemPilesAPI {
	isItemPileMerchant(token: TokenDocument) : boolean;
	isItemPileAuctioneer(token: TokenDocument): boolean;
	isItemPileEmpty(token: TokenDocument): boolean;
	addItems(target: Actor | TokenDocument, items: (Item & {quantity?: number})[], options?: AddItemsOptions) : Promise<Item[]>;
	removeItems(target: Actor | TokenDocument, items: (Item & {quantity?: number})[], options?: RemoveItemsOptions) : Promise<Item[]>;
	getActorItems ( target: Actor | TokenDocument): Promise<Item[]>;
	getItemQuantity ( item: Item) : number;
	createItemPile (options: ItemPileCreationOptions) : Promise<{tokenUuid: string, actorUuid: string}>;
	isValidItemPile(target: TokenDocument | Token) : boolean;
}


interface ItemPileCreationOptions {
	position : { x: number; y: number;};
};

interface AddItemsOptions {
	mergeSimilarItems ?: boolean; //default true
	removeExistingActorItems?: boolean; // default false
	interactionid ?: string | boolean; //no idea what this is
}

interface AddItemsOptions {
	interactionid ?: string | boolean; //no idea what this is
}
