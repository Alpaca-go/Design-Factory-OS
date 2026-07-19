import fs from 'node:fs/promises';
import path from 'node:path';

export async function exportHumanReviews({ store, format = 'json', outputPath } = {}) {
  if (!store || typeof store.list !== 'function') throw new TypeError('A Shadow Result Store is required');
  if (!['json', 'jsonl'].includes(format)) throw new TypeError('format must be json or jsonl');
  const records = await store.list();
  const rows = records.flatMap(exportRecord);
  const document = format === 'jsonl'
    ? `${rows.map((row) => JSON.stringify(row)).join('\n')}${rows.length ? '\n' : ''}`
    : `${JSON.stringify({ export_version: 'human-review-export-v1', reviews: rows }, null, 2)}\n`;
  if (outputPath) {
    await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
    await fs.writeFile(outputPath, document, 'utf8');
  }
  return { format, count: rows.length, rows, document };
}

function exportRecord(record) {
  const findings = Array.isArray(record.validation_result?.anti_patterns) ? record.validation_result.anti_patterns : [];
  const reviews = record.human_reviews || [];
  const rows = findings.flatMap((finding) => {
    const matchingReviews = reviews.filter((review) => review.anti_pattern_id === finding.anti_pattern_id);
    const common = {
      ...record.locator,
      source_path: record.provenance?.source_path || null,
      source_hash: record.provenance?.source_hash,
      anti_pattern_id: finding.anti_pattern_id,
      rule_type: finding.rule_type,
      severity: finding.severity,
      evaluated: finding.evaluated,
      system_detected: finding.detected && !finding.exception_applied,
      location: finding.location,
      evidence: finding.evidence,
      repair: finding.repair
    };
    if (!matchingReviews.length) return [{ ...common, human_judgement: null, notes: '', reviewed_at: null, reviewer_type: null }];
    return matchingReviews.map((review) => ({ ...common, ...review }));
  });
  const knownRuleIds = new Set(findings.map((finding) => finding.anti_pattern_id));
  const unmatchedReviews = reviews.filter((review) => !knownRuleIds.has(review.anti_pattern_id)).map((review) => ({
    ...record.locator,
    source_path: record.provenance?.source_path || null,
    source_hash: record.provenance?.source_hash,
    rule_type: 'unknown',
    severity: 'unknown',
    evaluated: false,
    location: { module: record.locator.module },
    evidence: [],
    repair: [],
    ...review
  }));
  return [...rows, ...unmatchedReviews];
}
