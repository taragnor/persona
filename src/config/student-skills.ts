export const STUDENT_SKILLS_LIST = [
	"diligence",
	"courage",
	"expression",
	"knowledge",
] as const;

export const STUDENT_SKILLS = Object.fromEntries(STUDENT_SKILLS_LIST.map( x=> [x, `persona.skills.${x}.name`])
)

export type SocialStat = typeof STUDENT_SKILLS_LIST[number];


