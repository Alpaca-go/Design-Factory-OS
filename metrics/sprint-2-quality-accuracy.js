import { evaluateSprint2AntiPatterns } from '../src/v5/visual-translation/v1/runtime/sprint-2-semantic-evaluator.js';

export async function evaluateSprint2GoldenDataset({ fixtures, evaluator }) {
  const rows = [];
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const fixture of fixtures) {
    const result = await evaluateSprint2AntiPatterns({
      evaluator,
      module: fixture.module,
      subjectId: fixture.fixture_id,
      output: fixture.input,
      context: { fixture }
    });
    const expected = new Set(fixture.expected_anti_patterns);
    const detected = new Set(result.findings.filter((finding) => finding.detected).map((finding) => finding.anti_pattern_id));
    const tp = [...detected].filter((id) => expected.has(id)).length;
    const fp = [...detected].filter((id) => !expected.has(id)).length;
    const fn = [...expected].filter((id) => !detected.has(id)).length;
    truePositive += tp;
    falsePositive += fp;
    falseNegative += fn;
    rows.push({ fixture_id: fixture.fixture_id, expected: [...expected], detected: [...detected], true_positive: tp, false_positive: fp, false_negative: fn });
  }
  const precision = ratio(truePositive, truePositive + falsePositive);
  const recall = ratio(truePositive, truePositive + falseNegative);
  return Object.freeze({
    dataset_size: fixtures.length,
    true_positive: truePositive,
    false_positive: falsePositive,
    false_negative: falseNegative,
    precision,
    recall,
    fixture_consistency_only: true,
    statistically_stable: false,
    stability_note: 'Fixture/Mock evaluator calibration is not representative of real-project semantic accuracy.',
    rows
  });
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 1;
}
