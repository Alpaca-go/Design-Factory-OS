import { buildStagePrompt } from './shared.js';

export function buildStrategicCriticPrompt(strategicModel, normalizedFacts, industryRules) {
  return buildStagePrompt(
    'strategic-critic',
    '对策划内容进行对抗式诊断：定位边界、用户任务、能力匹配、差异化可替代性、价值观空泛、Reason to Believe、人格冲突、商业目标冲突、合规风险和视觉决策缺失。',
    { strategicModel, normalizedFacts },
    `{"strategicIssues":[{"id":"issue-N","severity":"critical|major|minor","issue":"string","evidenceIds":["evidence-N"],"consequence":"string","recommendation":"string","recommendationStatus":"suggested"}]}`,
    industryRules.requiredChecks.join('\n- ')
  );
}
