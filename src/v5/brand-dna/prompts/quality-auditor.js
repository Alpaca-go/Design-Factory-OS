import { buildStagePrompt } from './shared.js';

export function buildAuditPrompt(packageToAudit) {
  return buildStagePrompt(
    'quality-auditor',
    '作为独立审计器检查无证据事实、状态越界、模板化、战略到视觉断裂、多创意方向、虚构资产、空泛视觉词、任务职责重复、伪文字风险、限制遗漏和生图可执行性。严格按 100 分制评分。',
    packageToAudit,
    `{"qualityAudit":{"passed":true,"totalScore":0,"dimensionScores":{"evidence":0,"strategy":0,"diagnosis":0,"brandDna":0,"creativeThesis":0,"visualTranslation":0,"imageExecution":0,"reusability":0},"hardFailures":["string"],"repairInstructions":["string"]}}
阈值：totalScore>=85，evidence>=17/20，strategy>=17/20，imageExecution>=9/10，且 hardFailures 为空。`
  );
}

export function buildTargetedRepairPrompt(packageToRepair, audit) {
  return buildStagePrompt(
    'targeted-repair',
    '只按审计器 repairInstructions 修复失败字段，不改变已有确认事实，不引入新业务事实，不增加第二套创意命题。',
    { packageToRepair, audit },
    `{"brandDna":object,"creativeThesisDecision":object,"visualTranslation":object,"imageSystem":object,"imageTasks":[object]}`
  );
}
