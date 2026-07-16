import { buildStagePrompt } from './shared.js';

export function buildCreativeThesisPrompt(brandDna, strategicIssues) {
  return buildStagePrompt(
    'creative-thesis-decision',
    '内部构建至少三个候选创意命题，按事实一致性、差异化、视觉潜力、多触点扩展、行业适配、耐用性和模板化风险比较；最终只选择一个，拒绝项只写拒绝原因。最终命题必须同时覆盖品牌能力、关系角色、情绪结果和差异化，不得只描述物流、温控或单一功能。',
    { brandDna, strategicIssues },
    `{"creativeThesisDecision":{"selected":{"statement":"唯一创意命题","dnaBasis":["gene-N"],"visualPotential":"string","coverage":{"capability":0,"relationship":0,"emotion":0,"culture":0,"differentiation":0}},"rejectedCandidateSummaries":[{"reason":"string"},{"reason":"string"}],"decisionScore":0}}`
  );
}
