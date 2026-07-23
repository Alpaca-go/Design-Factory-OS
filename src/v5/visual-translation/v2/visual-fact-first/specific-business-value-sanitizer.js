import { extractEvidenceBoundValues } from './evidence-bound-values.js';

const PLACEHOLDERS = Object.freeze({
  temperature_range: '温控区间占位',
  coverage_rate: '区域覆盖指标占位',
  region_count: '区域数量指标占位',
  facility_count: '设施数量指标占位',
  distance_commitment: '距离承诺占位',
  time_commitment: '时间承诺占位',
  partner_count: '合作伙伴数量占位',
  qualification: '资质信息占位',
  other_specific_metric: '具体业务指标占位'
});

export function classifySpecificBusinessValue(rawValue = '') {
  const value = String(rawValue);
  if (/℃/u.test(value) && /[–—~～至-]/u.test(value)) return 'temperature_range';
  if (/%/u.test(value)) return 'coverage_rate';
  if (/(?:个省|省份|省)$/u.test(value)) return 'region_count';
  if (/(?:座|处|家).*(?:中心|基地|机构|仓储)|(?:座物流中心|家机构)$/u.test(value)) return 'facility_count';
  if (/(?:中心)$/u.test(value)) return 'facility_count';
  if (/(?:伙伴)$/u.test(value)) return 'partner_count';
  if (/(?:公里|千米|km)$/iu.test(value)) return 'distance_commitment';
  if (/(?:分钟|小时|天|工作日)(?:内)?$/u.test(value)) return 'time_commitment';
  if (/(?:注册证|资质|认证|批次)/u.test(value)) return 'qualification';
  return 'other_specific_metric';
}

export function buildSpecificValuePlaceholder(valueType) {
  return PLACEHOLDERS[valueType] || PLACEHOLDERS.other_specific_metric;
}

export function sanitizeRejectedEvidenceBoundValue(value) {
  const valueType = value.value_type || classifySpecificBusinessValue(value.raw_value);
  const evidenceIds = [...(value.evidence_ref_ids || [])];
  return Object.freeze({
    fact_id: `DATA-STRUCTURE-${valueType}-${evidenceIds[0] || 'UNRESOLVED'}`,
    evidence_ref_ids: Object.freeze(evidenceIds),
    evidence_status: value.status || 'requires_confirmation',
    value_type: valueType,
    mode: 'structure_only',
    value: null,
    placeholder_label: buildSpecificValuePlaceholder(valueType),
    allowed_in_visual_direction: false
  });
}

export function sanitizeUnconfirmedFactRecord(record) {
  if (record?.status === 'confirmed') return Object.freeze({ ...record });
  const detections = extractEvidenceBoundValues(
    typeof record?.value === 'string' ? record.value : JSON.stringify(record?.value ?? '')
  );
  if (!detections.length) return Object.freeze({ ...record });
  const placeholders = [...new Set(detections.map((item) => buildSpecificValuePlaceholder(classifySpecificBusinessValue(item.raw_value))))];
  return Object.freeze({
    ...record,
    value: null,
    mode: 'structure_only',
    placeholder_label: placeholders.join('、'),
    specific_value_count: detections.length
  });
}

export function sanitizeSpecificBusinessValuesDeep(value, allowedNormalizedValues = new Set()) {
  if (typeof value === 'string') {
    let sanitized = value;
    for (const item of extractEvidenceBoundValues(value)) {
      if (allowedNormalizedValues.has(item.normalized_value)) continue;
      sanitized = sanitized.replaceAll(item.raw_value, buildSpecificValuePlaceholder(classifySpecificBusinessValue(item.raw_value)));
    }
    return sanitized;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeSpecificBusinessValuesDeep(item, allowedNormalizedValues));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key, sanitizeSpecificBusinessValuesDeep(child, allowedNormalizedValues)
    ]));
  }
  return value;
}
