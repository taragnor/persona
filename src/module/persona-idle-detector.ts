import {PersonaSettings} from "../config/persona-settings.js";
import {PersonaSockets} from "./persona.js";
import {TimedCache} from "./utility/cache.js";
import {IdleDetector} from "./utility/idle-detector.js";

class PlayerIdleDetector {

  idleDetector : IdleDetector;
  lastReportSent: number = 0;
  private cache =  {
    GMTargets : new TimedCache( () => this._GMTargets(), 60000),
  };

  constructor( idleTime: number) {
    if (game.user.isGM) {
      throw new Error("GM shouldn't set Player IdleDetector");
    }
    this.idleDetector = new IdleDetector(idleTime, () => this.onIdle(), () => this.onActive(), (isActive: boolean) => this.idleReport(!isActive));
    this.idleDetector.start();
  }

  get GMTargets(): FoundryUser["id"][] {
    return this.cache.GMTargets.value;
  }

  _GMTargets() : FoundryUser["id"][] {
    return game.users
      .filter( x=> x.isGM && x.active)
      .map(x=> x.id);
  }

  private idleReport(isIdle: boolean) {
    const currTime = Date.now();
    if (!isIdle && currTime - this.lastReportSent < 1000) {
      return;
    }
    if (PersonaSettings.debugMode()) {
      console.debug(`Sending Idle Report : ${isIdle}`);
    }
    const dataPacket = {
      isIdle,
      userId: game.user.id,
    };
    PersonaSockets.simpleSend("IDLE_REPORT", dataPacket, this.GMTargets);
    this.lastReportSent = currTime;
  }

  onIdle() : void {
    this.idleReport(true);
  }

  onActive() : void {
    this.idleReport(false);
  }


}

class GMIdleDetector {

  users: Map<FoundryUser["id"], UserData> = new Map();

  watch : N<UserWatch> = null;

  static LINK_DEAD_TIMER = 60000 as const;
  static IDLE_TIMER = 60000 as const;

  constructor () {
    if (!game.user.isGM) {
      throw new Error("Only GM can create GM IdleDetector");
    }
    PersonaSockets.setHandler("IDLE_REPORT", (data) => this.GM_side_onRecieveIdle(data));
  }

  private GM_side_onRecieveIdle(newState: SocketMessage["IDLE_REPORT"]) {
    if (PersonaSettings.debugMode()) {
      console.debug(`Recieving Idle Data from ${newState.userId}`);
    }
    const now = Date.now();
    const entry = this.users.get(newState.userId) ?? {
      lastActive: now,
      lastIdle: now,
    };
    if (newState.isIdle) {
      entry.lastIdle = now;
    } else {
      entry.lastActive = now;
    }
    this.users.set(newState.userId, entry);
  }

  isIdle(user:FoundryUser) : boolean {
    if (user.isGM) {return false;}
    const entry = this.users.get(user.id);
    if (!entry) {return true;}
    return Date.now() - entry.lastActive > GMIdleDetector.IDLE_TIMER;
  }

  isLinkDead(user:FoundryUser) : boolean {
    if (!this.isIdle(user) ) {return false;}
    const entry = this.users.get(user.id)!;
    return Date.now() - entry.lastIdle > GMIdleDetector.LINK_DEAD_TIMER;
  }

  userWatch(user: FoundryUser, onIdle : () => void , onActive: () => void) {
    if (this.watch) {
      this.clearWatch();
    }
    const isIdle = this.isIdle(user);
    const interval = window.setInterval( ()=> this._userWatchPing(user), 200);
    this.watch = { user, onIdle, onActive, interval ,isIdle };
  }

  clearWatch() {
    if (this.watch) {
      window.clearInterval(this.watch.interval);
    }
    this.watch = null;
  }

  _userWatchPing (user: FoundryUser) {
    const watch = this.watch;
    if (!watch || watch.user != user) {return;}
    const newState = this.isIdle(user);
    if (newState != watch.isIdle)  {
      if (newState) {
        watch.onIdle();
      } else {
        watch.onActive();
      }
      watch.isIdle = newState;
    }
  }

}

export class PersonaIdleDetector {
  private static instance : GMIdleDetector | PlayerIdleDetector;

  static PLAYER_IDLE_TIME = 120_000 as const;

  static start() {
    if (!game.settings.get("persona", "heartbeatOn")) {
      return;
    }
    console.debug("Idle Detector started");
    if (game.user.isGM) {
      this.instance = new GMIdleDetector();
    } else {
      this.instance = new PlayerIdleDetector(this.PLAYER_IDLE_TIME);
    }
    //@ts-expect-error adding to global scope
    window.IdleD = this.instance;
  }

  static get gmDetector(): N<GMIdleDetector> {
    if (this.instance instanceof GMIdleDetector) {
      return this.instance;
    }
    return null;
  }

}

type UserData = {
  lastActive: number;
  lastIdle: number;
}

type UserWatch = {
  user: FoundryUser;
  onIdle : () => void;
  onActive : () => void;
  interval  : number;
  isIdle: boolean;
}

declare global {
  interface SocketMessage {
    "IDLE_REPORT" : {
      isIdle: boolean; //true false if idle or not
      userId: FoundryUser["id"];
    }
  }
}

