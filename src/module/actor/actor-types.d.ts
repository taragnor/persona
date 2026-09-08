
type ActivityLink = {
	strikes: number,
	available: boolean,
	activity: Activity,
	currentProgress: number,
}

type SocialLinkData = {
	linkLevel: number,
	actor: SocialLink,
	inspiration: number,
	linkBenefits: SocialLink,
	focii: Focus[],
	currentProgress:number,
	relationshipType: string,
	available: boolean,
	isDating: boolean,
}

type Team = "PCs" | "Shadows" | "Neutral" ;

type ValidSocialTarget = NPC | PC | NPCAlly

type ValidAttackers = PC | Shadow | NPCAlly;

