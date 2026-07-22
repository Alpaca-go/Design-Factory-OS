const VALUE_PATTERNS = Object.freeze([
  /(?<![\d.])\d[\d,]*(?:\.\d+)?\s*(?:公里|千米|km)/giu,
  /(?<![\d.])\d[\d,]*(?:\.\d+)?\s*(?:座(?:物流中心|中心)?|家(?:合作)?机构|个省|省份|省|处(?:仓储|中心|基地))/gu,
  /(?<![\d.])-?\d+(?:\.\d+)?\s*[–—~～至-]\s*-?\d+(?:\.\d+)?\s*℃/gu,
  /(?<![\d.])\d{1,3}(?:\.\d+)?\s*%/gu,
  /(?:注册证号|注册证编号|资质编号|认证编号|批次号|批次编码)\s*[:：]?\s*[A-Za-z0-9][A-Za-z0-9_-]{3,}/giu
]);

export function normalizeEvidenceBoundValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[,，\s]/gu, '')
    .replace(/[—–~～至]/gu, '-');
}

export function extractEvidenceBoundValues(text) {
  const values = [];
  for (const expression of VALUE_PATTERNS) {
    for (const match of String(text || '').matchAll(new RegExp(expression.source, expression.flags))) {
      const raw = match[0].trim();
      values.push({ raw_value: raw, normalized_value: normalizeEvidenceBoundValue(raw) });
    }
  }
  return [...new Map(values.map((item) => [item.normalized_value, item])).values()];
}

export function buildEvidenceBoundValueRegistry(visualFacts) {
  const confirmedEvidenceIds = new Set(Object.values(visualFacts.fact_records || {})
    .filter((record) => record.status === 'confirmed')
    .flatMap((record) => record.evidence_ids || []));
  const byValue = new Map();
  for (const evidence of visualFacts.evidence_registry || []) {
    for (const value of extractEvidenceBoundValues(evidence.excerpt)) {
      const current = byValue.get(value.normalized_value) || {
        ...value,
        fact_id: `DATA-${value.normalized_value}`,
        evidence_ref_ids: [],
        status: 'requires_confirmation',
        allowed_in_visual_direction: false
      };
      current.evidence_ref_ids.push(evidence.evidence_id);
      if (evidence.confidence >= 0.8 && confirmedEvidenceIds.has(evidence.evidence_id)) {
        current.status = 'confirmed';
        current.allowed_in_visual_direction = true;
      }
      byValue.set(value.normalized_value, current);
    }
  }
  return Object.freeze([...byValue.values()].map((item) => Object.freeze({
    ...item,
    evidence_ref_ids: Object.freeze([...new Set(item.evidence_ref_ids)])
  })));
}
