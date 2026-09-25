export const TARGETTING_TABLE : Record<Targets, TargetData> =  {
  "1-engaged" : {
    requiresManualTargets:  true,
    canBeUsedOnAllies: true,
    singleTarget : true,
    AoE: false,
  },
  "1-nearby":{
    requiresManualTargets:  true,
    canBeUsedOnAllies: true,
    singleTarget : true,
    AoE: false,
  },
  "1-nearby-dead":{
    requiresManualTargets:  true,
    canBeUsedOnAllies: true,
    singleTarget : true,
    AoE: false,
  },
  "1-random-enemy":{
    requiresManualTargets:  false,
    canBeUsedOnAllies: false,
    singleTarget : true,
    AoE: false,
  },
  "all-allies":{
    requiresManualTargets:  false,
    canBeUsedOnAllies: true,
    singleTarget : false,
    AoE: true,
  },
  "all-enemies":{
    requiresManualTargets:  false,
    canBeUsedOnAllies: false,
    singleTarget : false,
    AoE: true,
  },
  "all-dead-allies": {
    requiresManualTargets:  false,
    canBeUsedOnAllies: true,
    singleTarget : false,
    AoE: true,
  },
  "all-others" : {
    requiresManualTargets:  false,
    canBeUsedOnAllies: true,
    singleTarget : false,
    AoE: true,
  },
  "each-attack-random-enemy": {
    requiresManualTargets:  false,
    canBeUsedOnAllies: false,
    singleTarget : false,
    AoE: false,
  },
  "everyone": {
    requiresManualTargets:  false,
    canBeUsedOnAllies: true,
    singleTarget : false,
    AoE: true,
  },
  "everyone-even-dead": {
    requiresManualTargets:  false,
    canBeUsedOnAllies: true,
    singleTarget : false,
    AoE: true,
  },
  "self" : {
    requiresManualTargets:  false,
    canBeUsedOnAllies: true,
    singleTarget : true,
    AoE: false,
  },
} as const;


type Targets = ReturnType<Power["targets"]>;

type TargetData = {
  requiresManualTargets: boolean;
  singleTarget: boolean;
  canBeUsedOnAllies: boolean;
  AoE: boolean;
}

