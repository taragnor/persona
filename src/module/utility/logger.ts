export class Logger {

	static async log(txt: string) {
		console.log(txt);
	}

	static async gmMessage(text: string) : Promise<ChatMessage>;
	static async gmMessage(text: string, alias: string) : Promise<ChatMessage>;
	static async gmMessage(text: string, actor: Actor) : Promise<ChatMessage>;
	static async gmMessage(text: string, actorOrAlias: string | Actor = "System") : Promise<ChatMessage> {
		const gmIds = game.users.filter( x=> x.role == CONST.USER_ROLES.GAMEMASTER);
		// const speaker = ChatMessage.getSpeaker({actor});
		const speaker = typeof actorOrAlias == "string" ? {alias: actorOrAlias} :  ChatMessage.getSpeaker({alias: actorOrAlias.name});
		let messageData = {
			speaker: speaker,
			content: text,
			style: CONST.CHAT_MESSAGE_STYLES.WHISPER,
			whisper: gmIds
		};
		return await ChatMessage.create(messageData, {});
	}

	static async sendToChat<T extends Actor<any, Item<any>>>(text: string, actor?: T) {
		// const speaker = ChatMessage.getSpeaker(sender);
		const speaker = ChatMessage.getSpeaker({alias: actor?.name ?? "System"});
		let messageData = {
			speaker: speaker,
			content: text,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		};
		ChatMessage.create(messageData, {});
		return messageData;
	}

}
