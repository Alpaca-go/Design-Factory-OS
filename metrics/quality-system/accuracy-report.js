export function buildAccuracyReport({ records = [], goldenEvaluations = [], minimumSamples = 30 } = {}) {
  const rows = [
    ...records.flatMap(rowsFromRecord),
    ...goldenEvaluations.flatMap(rowsFromGolden)
  ];
  const evaluatedRows = rows.filter((row) => row.classification);
  const counts = countClassifications(evaluatedRows);
  const sampleIds = new Set([
    ...records.map((record) => `${record.locator.project_id}/${record.locator.run_id}/${record.locator.module}`),
    ...goldenEvaluations.map((evaluation) => evaluation.sample_id)
  ]);
  const report = {
    report_version: 'quality-accuracy-report-v1',
    total_samples: sampleIds.size,
    evaluated_rules: evaluatedRows.length,
    true_positive: counts.tp,
    false_positive: counts.fp,
    false_negative: counts.fn,
    true_negative: counts.tn,
    precision: ratio(counts.tp, counts.tp + counts.fp),
    recall: ratio(counts.tp, counts.tp + counts.fn),
    false_positive_rate: ratio(counts.fp, counts.fp + counts.tn),
    by_rule: group(rows, 'rule_id'),
    by_module: group(rows, 'module'),
    by_severity: group(rows, 'severity'),
    semantic_hybrid_not_evaluated: rows.filter((row) => row.not_evaluated).length,
    version_distribution: versionDistribution(records, goldenEvaluations),
    statistical_stability: sampleIds.size >= minimumSamples && evaluatedRows.length >= minimumSamples ? 'provisional' : 'unstable',
    warnings: []
  };
  if (report.statistical_stability === 'unstable') report.warnings.push(`Fewer than ${minimumSamples} samples or evaluated decisions; statistics are unstable.`);
  if (report.false_positive_rate === null) report.warnings.push('False Positive Rate is unavailable because no true-negative denominator exists.');
  return report;
}

function rowsFromRecord(record) {
  const findings = record.validation_result?.anti_patterns || [];
  const reviews = record.human_reviews || [];
  const rows = findings.flatMap((finding) => {
    const matched = reviews.filter((review) => review.anti_pattern_id === finding.anti_pattern_id);
    const base = {
      sample_id: `${record.locator.project_id}/${record.locator.run_id}/${record.locator.module}`,
      rule_id: finding.anti_pattern_id,
      module: record.locator.module,
      severity: finding.severity || 'unknown',
      not_evaluated: finding.evaluated === false && ['semantic', 'hybrid'].includes(finding.rule_type)
    };
    if (!matched.length) return [{ ...base, classification: null }];
    return matched.map((review) => ({ ...base, classification: classificationFromReview(review.human_judgement) }));
  });
  const known = new Set(findings.map((finding) => finding.anti_pattern_id));
  return [...rows, ...reviews.filter((review) => !known.has(review.anti_pattern_id)).map((review) => ({
    sample_id: `${record.locator.project_id}/${record.locator.run_id}/${record.locator.module}`,
    rule_id: review.anti_pattern_id,
    module: record.locator.module,
    severity: 'unknown',
    classification: classificationFromReview(review.human_judgement),
    not_evaluated: false
  }))];
}

function rowsFromGolden(evaluation) {
  const expected = new Set(evaluation.expected_rules || []);
  return (evaluation.validation_result?.anti_patterns || []).map((finding) => {
    const detected = finding.detected && !finding.exception_applied;
    const shouldDetect = expected.has(finding.anti_pattern_id);
    return {
      sample_id: evaluation.sample_id,
      rule_id: finding.anti_pattern_id,
      module: evaluation.module,
      severity: finding.severity,
      classification: finding.evaluated === false ? null : classify(detected, shouldDetect),
      not_evaluated: finding.evaluated === false && ['semantic', 'hybrid'].includes(finding.rule_type)
    };
  });
}

function classify(detected, expected) {
  if (detected && expected) return 'tp';
  if (detected) return 'fp';
  if (expected) return 'fn';
  return 'tn';
}

function classificationFromReview(judgement) {
  return ({ true_positive: 'tp', false_positive: 'fp', false_negative: 'fn' })[judgement] || null;
}

function countClassifications(rows) {
  return rows.reduce((counts, row) => {
    counts[row.classification] += 1;
    return counts;
  }, { tp: 0, fp: 0, fn: 0, tn: 0 });
}

function group(rows, field) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row[field] || 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return Object.fromEntries([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => {
    const counts = countClassifications(values.filter((row) => row.classification));
    return [key, {
      evaluated: counts.tp + counts.fp + counts.fn + counts.tn,
      true_positive: counts.tp,
      false_positive: counts.fp,
      false_negative: counts.fn,
      true_negative: counts.tn,
      precision: ratio(counts.tp, counts.tp + counts.fp),
      recall: ratio(counts.tp, counts.tp + counts.fn),
      false_positive_rate: ratio(counts.fp, counts.fp + counts.tn),
      not_evaluated: values.filter((row) => row.not_evaluated).length
    }];
  }));
}

function versionDistribution(records, goldenEvaluations) {
  const sources = [
    ...records.map((record) => record.provenance || {}),
    ...goldenEvaluations.map((evaluation) => evaluation.versions || {})
  ];
  return Object.fromEntries([
    ['quality_system_version', 'quality_system_version'],
    ['rule_set_version', 'rule_set_version'],
    ['adapter_version', 'adapter_version'],
    ['evaluator_version', 'evaluator_version'],
    ['orchestrator_version', 'orchestrator_version']
  ].map(([outputKey, sourceKey]) => [outputKey, distribution(sources.map((source) => source[sourceKey] || 'unknown'))]));
}

function distribution(values) {
  return Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map())]
    .sort(([left], [right]) => left.localeCompare(right)));
}

function ratio(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 10000) / 10000 : null;
}
