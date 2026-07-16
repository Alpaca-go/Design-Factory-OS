import { buildStagePrompt } from './shared.js';

export function buildEvidenceExtractionPrompt(chunks) {
  return buildStagePrompt(
    'atomic-evidence',
    '从每个语义片段提取最小事实单元。一个证据只表达一个命题；建议、行业常识和推测不得混入证据。',
    { chunks },
    `{"atomicEvidence":[{"id":"本批次内唯一 ID","claim":"单一命题","category":"project|business|product|audience|market|positioning|value|personality|channel|constraint|visual|risk","status":"explicit|implicit|uncertain","sourceRefs":[{"sourceId":"string","chunkId":"string","excerpt":"最小必要原文"}],"confidence":0.0}]}`
  );
}
