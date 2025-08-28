import { HTMLTools } from "../module/utility/HTMLTools.js";

export const STUDENT_SKILLS_LIST = [
	"diligence",
	"courage",
	"expression",
	"knowledge",
	"understanding",
] as const;

export const STUDENT_SKILLS = Object.fromEntries(STUDENT_SKILLS_LIST.map( x=> [x, `persona.skills.${x}.name`])
 ) as Record<typeof STUDENT_SKILLS_LIST[number], string>;

export type SocialStat = typeof STUDENT_SKILLS_LIST[number];

export type StudentSkill = SocialStat;

export const STUDENT_SKILLS_LIST_EXT = [
	...STUDENT_SKILLS_LIST,
	"primary",
	"secondary"
] as const;

export const STUDENT_SKILLS_EXT = Object.fromEntries(STUDENT_SKILLS_LIST_EXT.map( x=> [x, `persona.skills.${x}.name`])
);


export type StudentSkillExt = typeof STUDENT_SKILLS_LIST_EXT[number];

