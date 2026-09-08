import {Persona} from "../persona-class.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSFX} from "./persona-sfx.js";

export class XPManager {
  static async awardXP(shadows: Shadow[], party: readonly ValidAttackers[]) : Promise<void> {
    if (!game.user.isGM) {return;}
    const numOfPCs = party.length;
    const xp = Persona.calcXP(shadows, numOfPCs );
    const navigator = PersonaDB.getNavigator();
    if (navigator) {
      party = [...party , navigator];
    }
    await this.awardXPAmount(xp, party);
  }

  static async awardXPAmount(amt: number, party: readonly ValidAttackers[]) {
    if (!game.user.isGM) {return;}
    const report = new XPReport(party, amt);
    await report.apply();
  }

}

export class XPReport {
  private party : readonly ValidAttackers[];
  private xpGained: number;

  constructor (party : readonly ValidAttackers[], xp: number) {
    this.party = party;
    this.xpGained = Math.floor(xp);
  }

  async apply() {
    const reports = await this.getReports();
    await this.reportXPGain(reports);
  }

  async getReports() : Promise<XPGainReport[]> {
    const xp = this.xpGained;
    const inactivePartyXP = XPReport.inactiveMembersXP(xp, this.party);
    const XPAwardDataPromises = this.party.map( async actor => {
      try {
        const XPReport = await actor.awardXP(xp);
        return [XPReport];
      } catch (e) {
        PersonaError.softFail(`Error giving XP to ${actor.name}`, e);
        return [];
      }
    });
    const reports = (await Promise.all(XPAwardDataPromises.concat(inactivePartyXP)))
      .flatMap(x=> x);
    return reports;
  }

  static async inactiveMembersXP (amt: number, party: readonly ValidAttackers[]) : Promise<XPGainReport[]>  {
    const otherAllies = PersonaDB.NPCAllies()
    .filter (x=> !party.includes( x));
    const otherAlliesAwards = otherAllies.map( async ally=> {
      try {
        const XPRate= this.inactiveMembersXPRate(party, ally);
        if (XPRate <= 0) {return [];}
        const inactiveAmt = XPRate * amt;
        const XPReport = await ally.awardXP(inactiveAmt);
        return [XPReport];
      } catch (e) {
        PersonaError.softFail(`Error giving XP to Inactive Ally ${ally.name}`, e);
        return [] as XPGainReport[];
      }
    });
    const reports= await Promise.all(otherAlliesAwards);
    const flatten = reports.flat();
    const singles = flatten.filter( x=> x.reports.length == 1);
    const multi = flatten.filter( x=> x.reports.length > 1);
    const singleReport = {
      label: "Inactive Party Members",
      reports: singles.flatMap( x=> x.reports)
    } satisfies XPGainReport;
    const ret= [
      ...multi,
      singleReport
    ];
    return ret;
  }

  static inactiveMembersXPRate(party: readonly ValidAttackers[], ally: NPCAlly): number {
    const bonuses = party.reduce( (acc, actor) => {
      const situation = {
        user: actor.accessor,
        target: ally.accessor,
      };
      return acc + actor.persona().getBonuses("inactive-party-member-xp-gains").total(situation);
    }, 0 );
    return Math.clamp(bonuses, 0, 1);
  }

  async reportXPGain(xpReports: XPGainReport[]) : Promise<void> {
    const xpStringParts = xpReports
    .map( report => XPReport.processXPReportList(report));
    const text = xpStringParts.join("");
    await this.toMessage(xpReports, text);
  }

  async toMessage(xpReports: XPGainReport[], html: string ) : Promise<ChatMessage> {
    if(xpReports.some( x=> x.reports.some(y=> y.leveled))) {
        void PersonaSFX.onLevelUp();
      }
    return await ChatMessage.create({
      speaker: {
        alias: "XP Award",
      },
      content: html ,
      rolls: [],
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    });
  }

  private static processXPReportList(report: XPGainReport) : string {
    try {
      const {reports} = report;
      const name = "mainActor" in report? report.mainActor.displayedName : report.label;
      const XPString = "origAmount" in report ? `(+${report.origAmount} XP)` : "";
      const levelUp = reports.some( r=> r.leveled) ? "LEVEL UP!" : "";
      const levelUpStrings = reports
        .map( ({name, amount, leveled}) => {
          let LUMsg = "";
          const base =  `${name}: +${amount} XP`;
          if (leveled) {
            LUMsg =  `<span class="level-up-msg"> Level Up!</span>`;
          }
          return `<div class="xp-gain">` + base + LUMsg + `</div>`;
        });
      return `
      <div class="overall-xp-report">
        <h3>
          ${name} ${XPString} ${levelUp}
        </h3>
        <div class="individual-awards">
            ${levelUpStrings.join("")}
        </div>
      </div>`;
    } catch {
      Debug(report);
      return `<div class="error"> ERROR with ${"mainActor" in report ? report?.mainActor?.name : report?.label ?? "Unknown label"}</div>`;
    }
  }

}

export type XPGainReport = ({
  mainActor : ValidAttackers,
  origAmount: number,
} | {
  label: string;
}) & {
  reports: XPGainReportIndividual[]
};

export type XPGainReportIndividual = {
	name: string,
	amount: number,
	leveled: boolean,
};

Hooks.on("renderChatMessageHTML", (_msg, html) => {
  const jq =  $(html);
  jq.find(".overall-xp-report h3").on("click", (ev) => {
    $(ev.currentTarget).closest('.overall-xp-report').toggleClass('open');

  });





});


