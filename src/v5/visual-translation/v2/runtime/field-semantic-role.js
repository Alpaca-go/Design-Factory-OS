export const FIELD_SEMANTIC_ROLE_VERSION = 'field-semantic-role-v1';

const NEGATIVE_CONSTRAINT_FIELDS = new Set([
  'prohibited_content', 'prohibited_use', 'fabricated_info_prohibited',
  'prohibited_misleading_templates', 'anti_concept_art_note',
  'execution_constraints', 'forbidden', 'avoid', 'must_not', 'must_not_become',
  'negative_constraint', 'negative_constraints', 'anti_concept_art_constraints',
  'anti_template_rules', 'prohibited_drift', 'template_risks'
]);

const SOURCE_EVIDENCE_FIELDS = /(?:^|\.)(?:evidence_ids?|brand_evidence|business_evidence|industry_recognition_source)(?:\.|\[|$)/u;
const METADATA_FIELDS = /(?:^|\.)(?:direction_id|example_id|asset_id|template_id|constraint_id|contract_version|direction_generation_mode)(?:\.|\[|$)/u;
const NEGATION_MARKERS = /不得(?:使用|生成|出现|替换)?|禁止(?:使用|出现|生成|替换)?|避免(?:使用|生成|出现|替换)?|严禁|不允许|不要|不可|不应|不能|未授权|非授权|拒绝/u;
const CONTEXT_RESET = /(?:但是|但|然而|不过|却|；|;|。|！|!|？|\?|，|,)/gu;

export function classifyFieldSemanticRole(fieldPath = '') {
  const segments = String(fieldPath).replace(/\[\d+\]/gu, '').split('.').filter(Boolean);
  if (segments.some((segment) => NEGATIVE_CONSTRAINT_FIELDS.has(segment))) return 'negative_constraint';
  if (SOURCE_EVIDENCE_FIELDS.test(fieldPath)) return 'source_evidence';
  if (METADATA_FIELDS.test(fieldPath)) return 'metadata';
  return segments.length ? 'positive_content' : 'unknown';
}

export function isNegatedContext(text, matchIndex) {
  const value = String(text || '');
  const index = Math.max(0, Number(matchIndex) || 0);
  const before = value.slice(Math.max(0, index - 24), index);
  let resetAt = -1;
  for (const match of before.matchAll(CONTEXT_RESET)) resetAt = match.index + match[0].length;
  return NEGATION_MARKERS.test(before.slice(resetAt + 1));
}

export function collectSemanticStringLeaves(value, basePath = 'visualDirectionV2', out = []) {
  if (typeof value === 'string') {
    if (value.trim()) out.push({ path: basePath, text: value, semantic_role: classifyFieldSemanticRole(basePath) });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSemanticStringLeaves(item, `${basePath}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collectSemanticStringLeaves(child, basePath ? `${basePath}.${key}` : key, out);
  }
  return out;
}

export function positiveKeywordMatches(text, keywords = []) {
  const value = String(text || '');
  const matches = [];
  for (const keyword of keywords) {
    let from = 0;
    while (from < value.length) {
      const index = value.indexOf(keyword, from);
      if (index < 0) break;
      if (!isNegatedContext(value, index)) matches.push({ keyword, index });
      from = index + Math.max(1, keyword.length);
    }
  }
  return matches;
}
