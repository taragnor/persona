declare class ChatMessage {
	static getSpeaker(spkOptions: Partial<ChatSpeakerObject>) : SpeakerOptions;
	static async create(msgData: MessageData, options: MessageOptions = {}): Promise<ChatMessage>;
	static getSpeaker() : ChatSpeakerObject;
}

type MessageData<R extends Roll = Roll> = {
	speaker: ChatSpeakerObject,
	content: string,
	user?: User,
	type: (typeof CONST.CHAT_MESSAGE_TYPES)[ keyof (typeof CONST.CHAT_MESSAGE_TYPES)],
	sound?: string,
	rolls?: R[],
	whisper?: User[],
}

type MessageOptions = Record<string, any>;

type ChatSpeakerObject = {
	scene?: Option<string>,
	actor?: Option<string>,
	token?: Option<string>,
	alias?: Option<string>,
}


