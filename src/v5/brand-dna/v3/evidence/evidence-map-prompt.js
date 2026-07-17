export const EVIDENCE_MAP_PROMPT_VERSION = 'evidence-map-prompt-v3.3';

export function buildEvidenceMapPrompt(prepared) {
  return [{
    role: 'user',
    content: `PROTOCOL_STAGE=01-evidence-map\nPROMPT_VERSION=${EVIDENCE_MAP_PROMPT_VERSION}\n你只负责建立可追溯 Evidence Map，不做战略建议、品牌 DNA、创意命题或视觉创作。合并同义事实，保留冲突和缺失。quote 必须是最短必要原文且不超过 100 字。category 必须严格从输出结构列出的枚举中选择，禁止创造 risk、strategy、history、development-stage、product 等新类别；产品、服务和解决方案统一使用 offering。只返回 JSON。\n\n来源注册表：\n${JSON.stringify(prepared.sourceDocuments)}\n\n语义片段：\n${JSON.stringify(prepared.chunks)}\n\n输出：{"evidenceMap":{"evidence":[{"evidenceId":"evidence-N","category":"brand-identity|industry|business-model|offering|audience|need|capability|mission|positioning|promise|value|personality|culture|visual-intent|constraint|asset","statement":"string","quote":"string","sourceId":"string","chunkId":"string","sectionPath":["string"],"confidence":"high|medium|low"}],"conflicts":[{"conflictId":"conflict-N","topic":"string","evidenceIds":["evidence-N"],"description":"string"}],"missingInformation":[{"missingId":"missing-N","topic":"string","whyNeeded":"string"}]}}`
  }];
}
