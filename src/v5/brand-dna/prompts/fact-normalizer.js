import { buildStagePrompt } from './shared.js';

export function buildFactNormalizationPrompt(atomicEvidence) {
  return buildStagePrompt(
    'normalized-facts',
    '合并同义信息并解析冲突。区分愿景与业务现实、目标用户与当前用户、产品功能与宣传口号、品牌承诺与支撑理由。无法裁决的冲突必须保留。',
    { atomicEvidence },
    `{"normalizedFacts":[{"id":"fact-N","statement":"string","status":"confirmed|inferred|conflicting|missing","evidenceIds":["evidence-N"],"confidence":0.0,"reasoningSummary":"可审计的简短依据"}]}`
  );
}

export function buildFactReconciliationPrompt(normalizedFacts) {
  return buildStagePrompt(
    'fact-reconciliation',
    '对分批归一化结果进行跨批次合并与冲突复核。不得丢失 evidenceIds；无法裁决的信息继续标记 conflicting。',
    { normalizedFacts },
    `{"normalizedFacts":[{"id":"fact-N","statement":"string","status":"confirmed|inferred|conflicting|missing","evidenceIds":["evidence-N"],"confidence":0.0,"reasoningSummary":"可审计的简短依据"}]}`
  );
}
