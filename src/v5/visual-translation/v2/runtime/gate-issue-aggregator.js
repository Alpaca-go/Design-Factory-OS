export const GATE_ISSUE_AGGREGATOR_VERSION = 'gate-issue-aggregator-v1.1';

const SEVERITY_ORDER = Object.freeze({ blocking: 4, rewrite: 3, warning: 2, info: 1 });

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function gateIssueKey(issue) {
  const evidence = clean(issue.evidence_excerpt || issue.detected_value)?.toLowerCase().replace(/\s+/gu, ' ') || '';
  return [
    issue.code,
    (issue.source_direction_ids || [issue.direction_id]).filter(Boolean).sort().join(',') || 'collection',
    issue.field_path || '',
    issue.matched_rule || '',
    evidence
  ].join('::');
}

export function normalizeGateIssue(issue = {}) {
  const directionId = clean(issue.direction_id);
  const normalized = {
    code: clean(issue.code) || 'UNKNOWN_GATE_ISSUE',
    severity: SEVERITY_ORDER[issue.severity] ? issue.severity : 'info',
    scope: issue.scope || (directionId ? 'direction' : 'collection'),
    issue_scope: issue.issue_scope || issue.scope || (directionId ? 'direction' : 'collection'),
    direction_id: directionId,
    source_direction_ids: [...new Set((issue.source_direction_ids || (directionId ? [directionId] : [])).filter(Boolean))],
    collection_effect: issue.collection_effect === true || (!directionId && issue.scope === 'collection'),
    affected_execution_scope: issue.affected_execution_scope || (directionId ? 'local_direction' : 'direction_set'),
    affected_direction_ids: [...new Set((issue.affected_direction_ids || (directionId ? [directionId] : [])).filter(Boolean))],
    field_path: clean(issue.field_path),
    detected_value: clean(issue.detected_value),
    matched_rule: clean(issue.matched_rule) || clean(issue.code) || 'UNKNOWN_GATE_ISSUE',
    evidence_excerpt: clean(issue.evidence_excerpt),
    confidence: Number.isFinite(issue.confidence) ? issue.confidence : undefined,
    message: clean(issue.message) || clean(issue.code) || '未提供问题说明',
    recommendation: clean(issue.recommendation) || '根据 Gate 明细复核并修正。',
    occurrences: Array.isArray(issue.occurrences) ? issue.occurrences.filter(Boolean) : []
  };
  if (normalized.detected_value || normalized.evidence_excerpt) {
    normalized.occurrences.push({
      detected_value: normalized.detected_value,
      evidence_excerpt: normalized.evidence_excerpt,
      confidence: normalized.confidence,
      field_path: normalized.field_path,
      value_source: issue.value_source
    });
  }
  return normalized;
}

export function aggregateGateIssues(issues = []) {
  const byKey = new Map();
  for (const rawIssue of issues) {
    const issue = normalizeGateIssue(rawIssue);
    const key = gateIssueKey(issue);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...issue, dedupe_key: key });
      continue;
    }
    if (SEVERITY_ORDER[issue.severity] > SEVERITY_ORDER[existing.severity]) existing.severity = issue.severity;
    existing.affected_direction_ids = [...new Set([...existing.affected_direction_ids, ...issue.affected_direction_ids])];
    existing.source_direction_ids = [...new Set([...existing.source_direction_ids, ...issue.source_direction_ids])];
    existing.occurrences.push(...issue.occurrences);
    existing.occurrences = existing.occurrences.filter((item, index, all) =>
      all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index);
    if (!existing.evidence_excerpt && issue.evidence_excerpt) existing.evidence_excerpt = issue.evidence_excerpt;
    if (!existing.detected_value && issue.detected_value) existing.detected_value = issue.detected_value;
  }
  const warningGroups = new Map();
  const output = [];
  for (const issue of byKey.values()) {
    if (issue.severity !== 'warning') {
      output.push(issue);
      continue;
    }
    const evidence = clean(issue.evidence_excerpt || issue.detected_value)?.toLowerCase().replace(/\s+/gu, ' ') || '';
    const warningKey = [issue.code, issue.source_direction_ids.join(','), issue.matched_rule, evidence].join('::');
    const existing = warningGroups.get(warningKey);
    if (!existing) {
      warningGroups.set(warningKey, { ...issue, field_paths: issue.field_path ? [issue.field_path] : [] });
      continue;
    }
    existing.field_paths = [...new Set([...existing.field_paths, ...(issue.field_path ? [issue.field_path] : [])])];
    existing.occurrences.push(...issue.occurrences);
    existing.occurrences = existing.occurrences.filter((item, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index);
  }
  return [...output, ...warningGroups.values()];
}
