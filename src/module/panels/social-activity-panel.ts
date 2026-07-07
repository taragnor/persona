import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaError} from "../persona-error.js";
import {InitialLinkError, PersonaSocial} from "../social/persona-social.js";
import {UsableUsePanel} from "./usable-use-panel.js";

export class SocialActivityPanel extends UsableUsePanel {
  socialList : (SocialLink | Activity) [] = [];
  declare actor: PC;

  override get templatePath(): string {
    return "systems/persona/sheets/panels/social-activity-panel.hbs";
  }

  constructor (actor: PC, activityList: (SocialLink | Activity)[], powerFilter : (usable: Usable) => boolean) {
    const baseListFn = () =>
      ([] as Usable[]).concat( this.actor.powers
        .filter (pwr=> pwr.canBeUsedInDowntime())
      )
        .concat (actor.items.contents
          .filter(item => item.isCarryableType())
          .filter( x=> x.isUsableType())
        );
    super(actor, baseListFn, powerFilter);
    // this.actor = actor;
    this.socialList = activityList;
  }

  override async getData() {
    return {
      ...await super.getData(),
      actor: this.actor,
      list: this.socialList,
    };
  }

  activityButtons() : SidePanel.ButtonConfig[] {
    const activityButtons =  this.socialList.map( activity => this.activityToButton(activity));
    return [
      ...activityButtons,
    ];
  }

  protected override buttonConfig() : SidePanel.ButtonConfig[] {
    return [
      ...this.activityButtons(),
      ...super.buttonConfig(),
    ];
  }

  private activityLabel(activity : SocialLink | Activity) : string {
    const isNewLink = activity instanceof PersonaActor && this.actor.getSocialSLWith(activity) == 0;
    const progress = this.actor.social.getSocialLinkProgress(activity.id);
    const tooltip = `Progress Tokens: ${progress}`;
    const name = `<span class="activity-name" title="${tooltip}">${activity.name}</span>`;
    const img = activity.img ? `<img src="${activity.img}">` : "";
    const SL  = activity instanceof PersonaActor
      ? this.actor.getSocialSLWith(activity)
      : 0;
    const star = PersonaSocial.isHighestLinkerWith(this.actor, activity) && SL < 10
      ? `<i title="Highest Link Level" class="fa-solid fa-star gold"></i>`
      : "";
    const SLText = SL > 0 ? `<span class="sl-level">SL ${SL}</span>` : "";
    const newLinkText = isNewLink ? `<span class="new-link">(New Link)</span>` : "";
    return `${star}${img}${name}${SLText}${newLinkText}`;
  }


  private activityToButton(activity: SocialLink | Activity) : SidePanel.ButtonConfig {
    const isNewLink = activity instanceof PersonaActor && this.actor.getSocialSLWith(activity) == 0;
    const meetsLinkConditions : boolean = isNewLink ?
      PersonaSocial.meetsConditionsToStartLink(this.actor, activity)
      : PersonaSocial.isAvailable(activity, this.actor);

    return {
      label: this.activityLabel(activity),
      onPress: () => this.selectActivity(activity),
      enabled: () => meetsLinkConditions && PersonaSocial.turnCheck(this.actor),
      visible: () => PersonaSocial.isVisible(activity, this.actor),
      cssClasses : ["tall-button"],
      tooltip: meetsLinkConditions ? this.generateActivityTooltip(activity, this.actor) : "",
    } satisfies SidePanel.ButtonConfig;
  }

  private async selectActivity(activity: SocialLink | Activity) {
    void this.pop();
    await PersonaSocial.chooseActivity(this.actor, activity);
  }

  private generateActivityTooltip( activity: SocialLink | Activity, actor: PC) : string {
    try {
      const card = PersonaSocial._drawSocialCard(actor, activity);
      if (activity == card) {return "";}
      return `${activity.name} (${card.name})}`;
    } catch (e) {
      if (e instanceof InitialLinkError) {
      // if (activity instanceof PersonaActor && actor.social.getSocialSLWith(activity) < 1  ) {
        return "Initial Link";
      }
      PersonaError.softFail(e as Error);
      return `${e instanceof Error ? e.toString(): "ERROR"}`;}
  }

}

