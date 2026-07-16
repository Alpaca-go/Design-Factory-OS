import { buildStagePrompt } from './shared.js';

export function buildCreativeThesisPrompt(brandDna, strategicIssues) {
  return buildStagePrompt(
    'creative-thesis-decision',
    '内部构建至少三个候选创意命题，按事实一致性、差异化、视觉潜力、多触点扩展、行业适配、耐用性和模板化风险比较；最终只选择一个，拒绝项只写拒绝原因。',
    { brandDna, strategicIssues },
    `{"creativeThesisDecision":{"selected":{"statement":"唯一创意命题","dnaBasis":["gene-N"],"visualPotential":"string"},"rejectedCandidateSummaries":[{"reason":"string"},{"reason":"string"}],"decisionScore":0}}`
  );
}
