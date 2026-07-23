// Execution Example Specificity Evaluator v1 (v2.1.4 doc section 六).
//
// Detects template overuse across execution examples both within a direction
// and across directions. High template overlap reduces specificity and should
// be flagged as a quality issue.

export const EXECUTION_EXAMPLE_SPECIFICITY_VERSION = 'execution-example-specificity-evaluator-v1';

const COMPARISON_FIELDS = [
  'audience',
  'communication_goal',
  'canvas_ratio',
  'hero_subject_scale',
  'information_hierarchy',
  'responsive_adaptation',
  'whitespace_behavior',
  'supporting_subjects',
  'brand_zone'
];

// Fields that are expected to vary significantly across examples.
// responsive_adaptation and whitespace_behavior are part of the brand system
// and may be shared; they are weighted lower in the final score.
const HIGH_WEIGHT_FIELDS = ['audience', 'communication_goal', 'canvas_ratio', 'hero_subject_scale', 'information_hierarchy', 'supporting_subjects', 'brand_zone'];
const LOW_WEIGHT_FIELDS = ['responsive_adaptation', 'whitespace_behavior'];

function isFull(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeValue(value) {
  if (!isFull(value)) return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

const SEMANTIC_EQUIVALENCE_GROUPS = [
  ['B端医美机构决策者', 'B2B采购决策者', 'B端机构用户', 'B端医美机构', '医美机构决策者', '机构决策者', 'B端决策者'],
  ['B2B', 'B端', '企业端', '商务端'],
  ['消费者', '用户', 'C端', '终端用户', '终端消费者', '求美者'],
  ['医美', '医疗美容', '美容医疗', '医学美容'],
  ['产品', '器械', '耗材', '设备'],
  ['品牌', '企业品牌', '品牌形象'],
  ['海报', '宣传海报', '广告海报', '平面海报'],
  ['画册', '手册', '宣传册', '产品手册'],
  ['包装', '外包装', '产品包装', '包装 front'],
  ['页面', '网页', 'web页面', '数字页面', '网站'],
  ['展览', '展会', '展览展示', '会展', '展陈'],
  ['社交媒体', '社交', '社媒', 'SNS', '社交平台']
];

function computeSemanticSimilarity(a, b) {
  if (!a || !b) return 0;
  const na = normalizeValue(a);
  const nb = normalizeValue(b);
  if (na === nb) return 1; // exact match
  // Check semantic equivalence groups
  for (const group of SEMANTIC_EQUIVALENCE_GROUPS) {
    const aInGroup = group.some((term) => na.includes(term.toLowerCase()));
    const bInGroup = group.some((term) => nb.includes(term.toLowerCase()));
    if (aInGroup && bInGroup) return 0.7; // semantic match
  }
  // substring match
  if (na.includes(nb) || nb.includes(na)) return 0.5;
  return 0;
}

function computeStructuralPatternOverlap(a, b) {
  if (!a || !b) return 0;
  const na = normalizeValue(a);
  const nb = normalizeValue(b);
  // Same structural pattern: both contain numbers/ratios, both contain positions, etc.
  const aHasRatio = /\d+\s*[:：]\s*\d+|\d+%|A4|竖版|横版/.test(na);
  const bHasRatio = /\d+\s*[:：]\s*\d+|\d+%|A4|竖版|横版/.test(nb);
  const aHasPosition = /上|下|左|右|中|顶部|底部|居中/.test(na);
  const bHasPosition = /上|下|左|右|中|顶部|底部|居中/.test(nb);
  let score = 0;
  if (aHasRatio && bHasRatio) score += 0.3;
  if (aHasPosition && bHasPosition) score += 0.3;
  if (na.length > 0 && nb.length > 0 && Math.abs(na.length - nb.length) / Math.max(na.length, nb.length) < 0.3) score += 0.2;
  return score;
}

function fieldSimilarity(a, b) {
  const na = normalizeValue(a);
  const nb = normalizeValue(b);
  if (!na && !nb) return 1; // both empty = identical (bad)
  if (!na || !nb) return 0; // one empty = different
  if (na === nb) return 1;
  // substring match gives partial similarity
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  return 0;
}

function computeRepeatedFieldRatios(examples) {
  const ratios = {};
  for (const field of COMPARISON_FIELDS) {
    const values = examples.map((e) => normalizeValue(e[field])).filter((v) => v);
    if (values.length === 0) {
      ratios[field] = 0;
      continue;
    }
    const unique = new Set(values);
    ratios[field] = 1 - (unique.size / values.length);
  }
  return ratios;
}

function computeWithinDirectionTemplateOverlap(examples) {
  if (examples.length < 2) return { exact_match: 0, semantic: 0, structural: 0, overall: 0 };
  let totalPairs = 0;
  let exactMatchSum = 0;
  let semanticSum = 0;
  let structuralSum = 0;
  let overallSum = 0;
  for (let i = 0; i < examples.length; i++) {
    for (let j = i + 1; j < examples.length; j++) {
      totalPairs++;
      let exactMatchCount = 0;
      let semanticCount = 0;
      let structuralCount = 0;
      let overallCount = 0;
      for (const field of COMPARISON_FIELDS) {
        const na = normalizeValue(examples[i][field]);
        const nb = normalizeValue(examples[j][field]);
        if (na && nb) {
          if (na === nb) exactMatchCount++;
          if (computeSemanticSimilarity(examples[i][field], examples[j][field]) >= 0.5) semanticCount++;
          if (computeStructuralPatternOverlap(examples[i][field], examples[j][field]) >= 0.3) structuralCount++;
          if (fieldSimilarity(examples[i][field], examples[j][field]) >= 0.8) overallCount++;
        }
      }
      exactMatchSum += exactMatchCount / COMPARISON_FIELDS.length;
      semanticSum += semanticCount / COMPARISON_FIELDS.length;
      structuralSum += structuralCount / COMPARISON_FIELDS.length;
      overallSum += overallCount / COMPARISON_FIELDS.length;
    }
  }
  if (totalPairs === 0) return { exact_match: 0, semantic: 0, structural: 0, overall: 0 };
  return {
    exact_match: exactMatchSum / totalPairs,
    semantic: semanticSum / totalPairs,
    structural: structuralSum / totalPairs,
    overall: overallSum / totalPairs
  };
}

function computeCrossDirectionTemplateOverlap(directions) {
  const allExamples = [];
  for (const d of directions) {
    for (const e of (d.execution_examples || [])) {
      allExamples.push(e);
    }
  }
  if (allExamples.length < 2) return { exact_match: 0, semantic: 0, structural: 0, overall: 0 };

  // Compare examples from different directions only
  let totalPairs = 0;
  let exactMatchSum = 0;
  let semanticSum = 0;
  let structuralSum = 0;
  let overallSum = 0;
  for (let i = 0; i < allExamples.length; i++) {
    for (let j = i + 1; j < allExamples.length; j++) {
      // skip if same direction
      if (allExamples[i]._direction_id === allExamples[j]._direction_id) continue;
      totalPairs++;
      let exactMatchCount = 0;
      let semanticCount = 0;
      let structuralCount = 0;
      let overallCount = 0;
      for (const field of COMPARISON_FIELDS) {
        const na = normalizeValue(allExamples[i][field]);
        const nb = normalizeValue(allExamples[j][field]);
        if (na && nb) {
          if (na === nb) exactMatchCount++;
          if (computeSemanticSimilarity(allExamples[i][field], allExamples[j][field]) >= 0.5) semanticCount++;
          if (computeStructuralPatternOverlap(allExamples[i][field], allExamples[j][field]) >= 0.3) structuralCount++;
          if (fieldSimilarity(allExamples[i][field], allExamples[j][field]) >= 0.8) overallCount++;
        }
      }
      exactMatchSum += exactMatchCount / COMPARISON_FIELDS.length;
      semanticSum += semanticCount / COMPARISON_FIELDS.length;
      structuralSum += structuralCount / COMPARISON_FIELDS.length;
      overallSum += overallCount / COMPARISON_FIELDS.length;
    }
  }
  if (totalPairs === 0) return { exact_match: 0, semantic: 0, structural: 0, overall: 0 };
  return {
    exact_match: exactMatchSum / totalPairs,
    semantic: semanticSum / totalPairs,
    structural: structuralSum / totalPairs,
    overall: overallSum / totalPairs
  };
}

function computeSpecificityScore(repeatedRatios) {
  // v2.1.4 — weighted specificity score. High-weight fields (audience,
  // communication_goal, canvas_ratio, etc.) count more; low-weight fields
  // (responsive_adaptation, whitespace_behavior) are part of the brand system
  // and naturally shared across examples.
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [field, ratio] of Object.entries(repeatedRatios)) {
    const weight = HIGH_WEIGHT_FIELDS.includes(field) ? 2 : 1;
    weightedSum += (1 - ratio) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

function computeDiversityScore(crossOverlap) {
  // lower cross-direction overlap = higher diversity
  return Math.round((1 - crossOverlap) * 100) / 100;
}

export function evaluateExecutionExampleSpecificity(directions = []) {
  const perDirection = [];
  let maxWithinOverlap = 0;

  for (const direction of directions) {
    const examples = (direction.execution_examples || []).map((e) => ({ ...e, _direction_id: direction.direction_id }));
    const repeated = computeRepeatedFieldRatios(examples);
    const withinOverlap = computeWithinDirectionTemplateOverlap(examples);
    maxWithinOverlap = Math.max(maxWithinOverlap, withinOverlap.overall);

    perDirection.push({
      direction_id: direction.direction_id,
      repeated_field_ratios: repeated,
      // v2.1.4.1 — split overlap into exact / semantic / structural (doc §3.5).
      exact_match_overlap: Math.round(withinOverlap.exact_match * 100) / 100,
      semantic_overlap: Math.round(withinOverlap.semantic * 100) / 100,
      structural_pattern_overlap: Math.round(withinOverlap.structural * 100) / 100,
      within_direction_template_overlap: Math.round(withinOverlap.overall * 100) / 100
    });
  }

  const crossOverlap = computeCrossDirectionTemplateOverlap(directions);
  const specificityScore = computeSpecificityScore(
    perDirection.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d.repeated_field_ratios)) acc[k] = v;
      return acc;
    }, {})
  );
  const diversityScore = computeDiversityScore(crossOverlap.overall);

  // v2.1.4 — template overuse judgment uses both overlap and specificity/diversity
  // scores so that a unified brand system (shared responsive_adaptation,
  // whitespace_behavior, prohibited_content) is not mis-flagged (doc §六 / §十一).
  const overallOverlap = Math.max(maxWithinOverlap, crossOverlap.overall);
  // Combined quality score: higher specificity + diversity = better.
  const combinedScore = (specificityScore + diversityScore) / 2;
  // Template overuse only when overlap is high AND combined quality is low.
  const templateOveruse = overallOverlap > 0.70 && combinedScore < 0.40;
  const templateWarning = overallOverlap >= 0.50 && overallOverlap <= 0.70 && combinedScore < 0.60;

  return {
    evaluator_version: EXECUTION_EXAMPLE_SPECIFICITY_VERSION,
    per_direction: perDirection,
    // v2.1.4.1 — split overlap metrics (doc §3.5).
    exact_match_overlap: Math.round(crossOverlap.exact_match * 100) / 100,
    semantic_overlap: Math.round(crossOverlap.semantic * 100) / 100,
    structural_pattern_overlap: Math.round(crossOverlap.structural * 100) / 100,
    cross_direction_template_overlap: Math.round(crossOverlap.overall * 100) / 100,
    specificity_score: specificityScore,
    diversity_score: diversityScore,
    template_overuse: templateOveruse,
    template_warning: templateWarning,
    overall_overlap: Math.round(overallOverlap * 100) / 100
  };
}
