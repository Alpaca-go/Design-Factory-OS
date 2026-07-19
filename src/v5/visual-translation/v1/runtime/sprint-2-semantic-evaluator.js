export const SPRINT_2_ANTI_PATTERN_IDS = Object.freeze({
  anchor_direction: Object.freeze(['AP-ANC-001', 'AP-ANC-002', 'AP-ANC-003', 'AP-ANC-004', 'AP-ANC-005']),
  visual_dna: Object.freeze(['AP-DNA-001', 'AP-DNA-002', 'AP-DNA-003', 'AP-DNA-004', 'AP-DNA-005']),
  visual_grammar: Object.freeze(['AP-GRA-001', 'AP-GRA-002', 'AP-GRA-003', 'AP-GRA-004'])
});

export const SPRINT_2_CALIBRATION_CHECK_IDS = Object.freeze({
  anchor_direction: Object.freeze([
    'CAL-ANC-DIRECTION-CONTINUITY',
    'CAL-ANC-EVIDENCE-SUFFICIENCY',
    'CAL-ANC-CANDIDATE-HOMOGENEITY'
  ]),
  visual_dna: Object.freeze(['CAL-DNA-SEMANTIC-DUPLICATION', 'CAL-DNA-QA-CONDITION']),
  visual_grammar: Object.freeze([
    'CAL-GRA-RULE-DUPLICATION',
    'CAL-GRA-CROSS-CONFLICT',
    'CAL-GRA-ANCHOR-INHERITANCE',
    'CAL-GRA-MOTION-CONTINUITY',
    'CAL-GRA-INFORMATION-GENERIC'
  ])
});

export const SPRINT_2_SEMANTIC_RULE_IDS = Object.freeze(Object.fromEntries(
  Object.keys(SPRINT_2_ANTI_PATTERN_IDS).map((module) => [module, Object.freeze([
    ...SPRINT_2_ANTI_PATTERN_IDS[module],
    ...SPRINT_2_CALIBRATION_CHECK_IDS[module]
  ])])
));

const SEVERITY = Object.freeze({
  'AP-ANC-001': 'S3', 'AP-ANC-002': 'S2', 'AP-ANC-003': 'S3', 'AP-ANC-004': 'S2', 'AP-ANC-005': 'S2',
  'AP-DNA-001': 'S3', 'AP-DNA-002': 'S2', 'AP-DNA-003': 'S2', 'AP-DNA-004': 'S2', 'AP-DNA-005': 'S2',
  'AP-GRA-001': 'S2', 'AP-GRA-002': 'S3', 'AP-GRA-003': 'S3', 'AP-GRA-004': 'S2',
  'CAL-ANC-DIRECTION-CONTINUITY': 'S3', 'CAL-ANC-EVIDENCE-SUFFICIENCY': 'S3', 'CAL-ANC-CANDIDATE-HOMOGENEITY': 'S3',
  'CAL-DNA-SEMANTIC-DUPLICATION': 'S2', 'CAL-DNA-QA-CONDITION': 'S3',
  'CAL-GRA-RULE-DUPLICATION': 'S2', 'CAL-GRA-CROSS-CONFLICT': 'S3', 'CAL-GRA-ANCHOR-INHERITANCE': 'S3',
  'CAL-GRA-MOTION-CONTINUITY': 'S2', 'CAL-GRA-INFORMATION-GENERIC': 'S2'
});

export function defineSprint2SemanticEvaluator(evaluator) {
  if (!evaluator || typeof evaluator !== 'object') throw new TypeError('Sprint 2 Semantic Evaluator is required');
  if (typeof evaluator.version !== 'string' || !evaluator.version.trim()) throw new TypeError('Semantic Evaluator version is required');
  if (typeof evaluator.evaluate !== 'function') throw new TypeError('Semantic Evaluator requires evaluate()');
  return Object.freeze({
    version: evaluator.version.trim(),
    evaluate: evaluator.evaluate.bind(evaluator),
    ...(typeof evaluator.evaluateDifference === 'function' ? { evaluateDifference: evaluator.evaluateDifference.bind(evaluator) } : {})
  });
}

export function createFixtureSprint2SemanticEvaluator(results = {}, { version = 'fixture-sprint-2-evaluator-v1', differenceResults = {} } = {}) {
  return defineSprint2SemanticEvaluator({
    version,
    async evaluate(request) {
      const scopedKey = `${request.module}:${request.subject_id}:${request.anti_pattern_id}`;
      const fixture = results[scopedKey] ?? results[request.anti_pattern_id];
      if (typeof fixture === 'function') return structuredClone(await fixture(structuredClone(request)));
      return fixture === undefined ? false : structuredClone(fixture);
    },
    async evaluateDifference(request) {
      const key = [...request.candidate_ids].sort().join('::');
      const fixture = differenceResults[key] ?? differenceResults.default;
      if (typeof fixture === 'function') return structuredClone(await fixture(structuredClone(request)));
      if (fixture === undefined) return defaultDifferenceResult();
      return structuredClone(fixture);
    }
  });
}

export async function evaluateSprint2AntiPatterns({ evaluator, module, subjectId, output, context }) {
  const ruleIds = SPRINT_2_SEMANTIC_RULE_IDS[module];
  if (!ruleIds) throw new TypeError(`Unsupported Sprint 2 semantic module: ${module}`);
  if (!evaluator) return notEvaluatedResult(module, subjectId, ruleIds);
  const findings = [];
  for (const antiPatternId of ruleIds) {
    const raw = await evaluator.evaluate(Object.freeze({
      anti_pattern_id: antiPatternId,
      module,
      subject_id: subjectId,
      output: structuredClone(output),
      context: structuredClone(context)
    }));
    const detected = Boolean(raw && raw !== false && raw.detected !== false);
    const evidence = detected && Array.isArray(raw.evidence) ? raw.evidence.filter(nonEmpty) : [];
    if (detected && !evidence.length) throw new TypeError(`${antiPatternId} semantic finding requires evidence`);
    const repair_actions = detected && Array.isArray(raw.repair_actions || raw.repair) ? (raw.repair_actions || raw.repair).filter(nonEmpty) : [];
    if (detected && !repair_actions.length) throw new TypeError(`${antiPatternId} semantic finding requires repair actions`);
    findings.push({
      anti_pattern_id: antiPatternId,
      detected,
      evaluated: true,
      evaluation_mode: 'semantic',
      severity: SEVERITY[antiPatternId],
      confidence: detected && Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : (detected ? 1 : 0),
      evidence,
      repair_actions,
      repair: repair_actions,
      evaluator_version: evaluator.version
    });
  }
  return Object.freeze({
    subject_id: subjectId,
    module,
    passed: findings.every((finding) => !finding.detected),
    status: 'evaluated',
    evaluator_version: evaluator.version,
    findings
  });
}

function notEvaluatedResult(module, subjectId, ruleIds) {
  return Object.freeze({
    subject_id: subjectId,
    module,
    passed: null,
    status: 'not_evaluated',
    evaluator_version: 'not_evaluated',
    findings: ruleIds.map((anti_pattern_id) => ({
      anti_pattern_id,
      detected: false,
      evaluated: false,
      evaluation_mode: 'semantic',
      severity: SEVERITY[anti_pattern_id],
      confidence: 0,
      evidence: [],
      repair_actions: [],
      repair: [],
      evaluator_version: 'not_evaluated'
    }))
  });
}

function defaultDifferenceResult() {
  return {
    shared_anchor_traits: [],
    dimension_scores: {
      core_visual_proposition: 2,
      primary_mechanism: 2,
      controlled_visual_dimensions: 1,
      inclusion_boundary: 1,
      exclusion_boundary: 1,
      cross_media_behavior: 1
    },
    reasons: {
      core_visual_proposition: 'Fixture candidates use distinct governing propositions',
      primary_mechanism: 'Fixture candidates use distinct primary mechanisms',
      controlled_visual_dimensions: 'Controlled dimensions partially overlap',
      inclusion_boundary: 'Inclusion boundaries are observably different',
      exclusion_boundary: 'Exclusion boundaries are observably different',
      cross_media_behavior: 'Cross-media behavior is partially different'
    }
  };
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim();
}
