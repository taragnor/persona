import {PersonaSettings} from "../../config/persona-settings.js";

export class Logger {
  static bufferStorage: string[] = [];
  static lastMsgTime: number = Date.now();
  static MS_DELAY_FOR_BUFFER = 1500;
  static useBuffering = true;

  static log(txt: string) {
    console.log(txt);
  }

  static async gmMessage(text: string) : Promise<ChatMessage>;
  static async gmMessage(text: string, alias: string) : Promise<ChatMessage>;
  static async gmMessage(text: string, actor: Actor) : Promise<ChatMessage>;
  static async gmMessage(text: string, actorOrAlias: string | Actor = "System") : Promise<ChatMessage> {
    const gmIds = game.users.filter( x=> x.role == CONST.USER_ROLES.GAMEMASTER);
    // const speaker = ChatMessage.getSpeaker({actor});
    const speaker = typeof actorOrAlias == "string" ? {alias: actorOrAlias} :  ChatMessage.getSpeaker({alias: actorOrAlias.name});
    const messageData = {
      speaker: speaker,
      content: text,
      style: CONST.CHAT_MESSAGE_STYLES.WHISPER,
      whisper: gmIds
    };
    return await ChatMessage.create(messageData, {});
  }

  static async sendToChat<T extends Actor>(text: string, actor?: T) {
    try {
    if (this.useBuffering == false) {
      await this._sendToChat(text);
      return;
    } else {
      const mergeTxt = `<div class="log-record">(${actor?.name ?? "System"}) ${text}</div>`;
      this.bufferStorage.push(mergeTxt);
      this.lastMsgTime = Date.now();
      this.testPrintBuffer(actor);
    }
    } catch (e) {
      Debug(e);
      throw new Error("Error with logging sendToChat");
    }
  }


  private static testPrintBuffer(actor ?: Actor) {
    const timeOutFn = (actor ?: Actor) => {
      if (this.bufferStorage.length == 0) {return false;}
      if ((Date.now() - this.lastMsgTime) > this.MS_DELAY_FOR_BUFFER) {
        void this.printBuffer(actor);
        return true;
      } else {
        setTimeout( () => timeOutFn(actor), 250);
        return false;
      }
    };
    setTimeout( () => timeOutFn(actor), 250);
  }

  private static async printBuffer(actor ?: Actor) {
    const msg = this.bufferStorage
      .join("<br>");
    await this._sendToChat(msg, actor);
    this.bufferStorage = [];
  }

  private static async _sendToChat<T extends Actor>(text: string, actor?: T) {
    // const speaker = ChatMessage.getSpeaker(sender);
    const speaker = ChatMessage.getSpeaker({alias: actor?.name ?? "System"});
    const messageData = {
      speaker: speaker,
      content: text,
      style: CONST.CHAT_MESSAGE_STYLES.OOC,
    };
    await ChatMessage.create(messageData, {});
    return messageData;
  }

}

export class TimeLog {
  static time : number;
  private time: number;

  constructor() {
    this.time = Date.now();
  }

  static reset() {
    this.time = Date.now();
  }

  static log(txt: string) {
    if (!PersonaSettings.debugMode()) {return;}
    const elapsed = (Date.now() - this.time);
    const msg = `${elapsed} ms : ${txt}`;
    console.log(msg);
  }

  log(txt : string) {
    const elapsed = (Date.now() - this.time);
    const msg = `${elapsed} ms : ${txt}`;
    console.log(msg);
    // await Logger.sendToChat(msg);
  }
}


Hooks.on("renderChatMessageHTML", (msg: ChatMessage, html) => {
  if (!msg.speaker.actor || msg.speaker.alias == msg.author.name) {return;}
  const sender = $(html).find("h4.message-sender");
  const authorName = msg?.author?.name ?? "Unknown Author";
  const authorBlock = `<span class="author-name"> (${authorName}) </span>`;

  sender.append($(authorBlock));
  // sender.text(sender.text() + authorBlock);
});
