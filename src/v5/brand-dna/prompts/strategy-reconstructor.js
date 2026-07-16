import { buildStagePrompt } from './shared.js';

export function buildStrategicModelPrompt(normalizedFacts, atomicEvidence, industryRules) {
  return buildStagePrompt(
    'strategic-model',
    '重建品牌价值交换链：服务谁、真实情境、用户任务、阻力、独特能力、功能/情绪/社会价值、信任理由、差异化和长期关系。不得照抄文档目录。',
    { normalizedFacts, atomicEvidence },
    `{"strategicModel":{"categoryDefinition":EvidenceBackedItem,"businessReality":EvidenceBackedItem,"primaryAudience":[EvidenceBackedItem],"userContext":[EvidenceBackedItem],"jobsToBeDone":[EvidenceBackedItem],"barriersAndTensions":[EvidenceBackedItem],"functionalValue":[EvidenceBackedItem],"emotionalValue":[EvidenceBackedItem],"socialValue":[EvidenceBackedItem],"positioning":EvidenceBackedItem,"brandPromise":EvidenceBackedItem,"reasonsToBelieve":[EvidenceBackedItem],"differentiators":[EvidenceBackedItem],"relationshipModel":EvidenceBackedItem}}
EvidenceBackedItem={"statement":"string","status":"confirmed|inferred|conflicting|missing","evidenceIds":["evidence-N"],"confidence":0.0}`,
    industryRules.requiredChecks.join('\n- ')
  );
}
