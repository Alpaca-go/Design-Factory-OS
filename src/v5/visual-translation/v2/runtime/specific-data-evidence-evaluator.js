import { classifyFieldSemanticRole } from './field-semantic-role.js';
import { extractEvidenceBoundValues, normalizeEvidenceBoundValue } from '../visual-fact-first/evidence-bound-values.js';

const DESIGN_VALUE_PATH = /canvas_ratio|photography_ratio|graphic_ratio|information_ratio|responsive_adaptation|layout|composition|subject_position|information_position|graphic_overlay|scale_crop_repeat|visual_description/iu;
const BUSINESS_PERCENT_CONTEXT = /覆盖|合格|达标|增长|提升|机构|区域|有效|准确|服务|到达|履约/iu;

function stringLeaves(value, path = 'visualDirectionV2', output = []) {
  if (typeof value === 'string') output.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((item, index) => stringLeaves(item, `${path}[${index}]`, output));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => stringLeaves(child, `${path}.${key}`, output));
  return output;
}

export function allowedEvidenceValueSet(evidenceBoundValues = []) {
  return new Set(evidenceBoundValues
    .filter((item) => item.allowed_in_visual_direction)
    .map((item) => item.normalized_value || normalizeEvidenceBoundValue(item.raw_value)));
}

export function detectionIsEvidenceBound(text, allowedValues) {
  const extracted = extractEvidenceBoundValues(text);
  return extracted.length > 0 && extracted.every((item) => allowedValues.has(item.normalized_value));
}

export function detectUnsupportedSpecificData(direction, evidenceBoundValues = []) {
  const allowedValues = allowedEvidenceValueSet(evidenceBoundValues);
  const detections = [];
  for (const leaf of stringLeaves(direction)) {
    if (DESIGN_VALUE_PATH.test(leaf.path) || classifyFieldSemanticRole(leaf.path) === 'negative_constraint') continue;
    for (const value of extractEvidenceBoundValues(leaf.text)) {
      if (value.raw_value.includes('%') && !BUSINESS_PERCENT_CONTEXT.test(leaf.text)) continue;
      if (allowedValues.has(value.normalized_value)) continue;
      detections.push({
        direction_id: direction.direction_id,
        field_path: leaf.path,
        detected_text: value.raw_value,
        detection_type: 'unbound_specific_business_data',
        source_type: 'model_output',
        value_source: 'provider',
        field_semantic_role: classifyFieldSemanticRole(leaf.path),
        confidence: 0.98,
        rule_id: 'EVIDENCE_BOUND_VALUE_REQUIRED',
        reason: `具体数据“${value.raw_value}”未绑定 confirmed EvidenceRef`,
        suggested_rewrite: '改为结构占位、非具体范围或示意字段，或先补充 confirmed EvidenceRef。',
        risk_level: 'blocked'
      });
    }
  }
  return detections;
}

