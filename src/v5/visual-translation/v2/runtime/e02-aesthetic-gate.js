// E02 Product-Material Aesthetic Gate (doc section 五).
//
// When a direction is the product/material aesthetics family (family_type
// `product_material_aesthetics`, i.e. Direction Family B / 医美产品与材料美学),
// it MUST carry enough brand-aesthetic and consumer-value weight and must NOT
// degrade into a lab bench / sterilization-parameters / data-card / compliance-
// packaging / consumable-catalog page. The gate enforces:
//   brand_aesthetic_weight     >= 0.15
//   consumer_value_weight      >= 0.10
//   product_material_weight    >= 0.30
// plus concrete content requirements (micro morphology, precision/purity/
// flexibility/transparency, packaging & material-detail photography, science +
// brand aesthetics, institution professional display, consumer reassurance) and
// a degradation check. Unmet => rewrite_required.

import { collectDirectionText } from './direction-text-util.js';
import { countKeywordHits } from './evaluator-keywords.js';
import { resolveWeights } from './compliance-weight-controller.js';

export const E02_AESTHETIC_GATE_VERSION = 'e02-aesthetic-gate-v1';

const BRAND_AESTHETIC_MIN = 0.15;
const CONSUMER_VALUE_MIN = 0.10;
const PRODUCT_MATERIAL_MIN = 0.30;
const WEIGHT_SUM_TOLERANCE = 0.01;

// Weight sum validation helpers (v2.1.4.1 doc §3.1).
const WEIGHT_KEYS = ['compliance_weight', 'supply_chain_weight', 'product_material_weight', 'ecosystem_weight', 'brand_aesthetic_weight', 'consumer_value_weight'];

function normalizeWeights(weights) {
  const sum = WEIGHT_KEYS.reduce((s, k) => s + (weights[k] || 0), 0);
  if (sum === 0) return null;
  const norm = {};
  for (const k of WEIGHT_KEYS) norm[k] = Number(((weights[k] || 0) / sum).toFixed(3));
  return norm;
}

function validateWeightSum(direction) {
  const explicit = direction.compliance_weights;
  if (!explicit || typeof explicit !== 'object') return { valid: true, original_total: null, code: null, derived: true };
  const present = WEIGHT_KEYS.every((k) => typeof explicit[k] === 'number');
  if (!present) return { valid: true, original_total: null, code: null, derived: true };
  const total = WEIGHT_KEYS.reduce((s, k) => s + (explicit[k] || 0), 0);
  if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
    return { valid: false, original_total: total, code: 'weight_sum_invalid', normalized_preview: normalizeWeights(explicit), derived: false };
  }
  return { valid: true, original_total: total, code: null, derived: false };
}

// Content requirement keyword groups (doc section 五 «E02 必须补充»).
const REQUIRED_CONTENT_GROUPS = {
  micro_morphology: ['微观', '结构', '精密', '纹理', '分子', '表面', '材质结构'],
  precision_purity: ['精密', '纯净', '柔韧', '透明', '通透', '细腻', '洁净'],
  packaging_material_photo: ['包装', '材质摄影', '材料细节', '产品摄影', '细节摄影', '实物摄影'],
  science_brand_aesthetics: ['科学', '美学', '品牌审美', '品牌美学', '视觉审美', '审美'],
  institution_display: ['机构', '专业展示', '专业呈现', '医师', '诊所', '服务'],
  consumer_reassurance: ['安心', '品质', '精致', '体验', '信任', '消费者']
};

// Degradation patterns the gate must reject (doc section 五 «不得退化为»).
// v2.1.2 Precision Patch: single-keyword hits no longer trigger hard-block.
// Instead we compute a multi-dimensional degradation score; hard-block only
// occurs when a combination of scores crosses thresholds (doc §五).
const DEGRADATION_KEYWORDS = {
  lab_scene: ['实验室', '台面', '实验台', '器皿', '显微镜', '烧杯', '试管'],
  scientific_info: ['检测参数', '成分数据', '科学数据卡', '参数表格', '数据卡片', '参数表'],
  product_presentation: ['产品摄影', '实物摄影', '材质摄影', '包装展示', '细节摄影', '产品陈列', '器械', '精密', '摄影', '样本', '结构图', '真实'],
  brand_aesthetic: ['品牌美学', '视觉审美', '审美', '美学', '精致', '品质感', '高级感'],
  consumer_value: ['消费者', '安心', '体验', '信任', '精致', '品质', '用户'],
  execution_variety: ['海报', '画册', '包装', '页面', '数字触点', '展览', '社交媒体']
};

function computeDegradationScore(text, direction) {
  const labHits = countKeywordHits(text, DEGRADATION_KEYWORDS.lab_scene);
  const sciHits = countKeywordHits(text, DEGRADATION_KEYWORDS.scientific_info);
  const prodHits = countKeywordHits(text, DEGRADATION_KEYWORDS.product_presentation);
  const brandHits = countKeywordHits(text, DEGRADATION_KEYWORDS.brand_aesthetic);
  const consumerHits = countKeywordHits(text, DEGRADATION_KEYWORDS.consumer_value);
  const execHits = countKeywordHits(text, DEGRADATION_KEYWORDS.execution_variety);

  // Scale to 1-5 range (capped at 5)
  const labSceneDominance = Math.min(5, Math.ceil(labHits / 2));
  const scientificInfoDominance = Math.min(5, Math.ceil(sciHits / 2));
  const productPresentationStrength = Math.min(5, Math.ceil(prodHits / 2));
  const brandAestheticStrength = Math.min(5, Math.ceil(brandHits / 2));
  const consumerValueStrength = Math.min(5, Math.ceil(consumerHits / 2));
  const executionVariety = Math.min(5, Math.ceil(execHits / 2));

  // Hard-block combinations (doc §五):
  // 1. Lab scene dominates AND brand+aesthetic is weak AND consumer value is weak
  const combo1 = labSceneDominance >= 4 && brandAestheticStrength <= 2 && consumerValueStrength <= 2;
  // 2. Scientific info dominates AND product presentation is weak
  const combo2 = scientificInfoDominance >= 4 && productPresentationStrength <= 2;

  const rewriteRequired = combo1 || combo2;
  const degradationRiskWarning = labSceneDominance >= 3 && !rewriteRequired;

  return {
    lab_scene_dominance: labSceneDominance,
    scientific_info_dominance: scientificInfoDominance,
    product_presentation_strength: productPresentationStrength,
    brand_aesthetic_strength: brandAestheticStrength,
    consumer_value_strength: consumerValueStrength,
    execution_variety: executionVariety,
    rewrite_required: rewriteRequired,
    degradation_risk_warning: degradationRiskWarning
  };
}

// Count reusable assets whose type/name indicates product / material content
// (doc section 四 multi-signal detection).
function countAssetTypeHits(direction, types) {
  const assets = direction.core_reusable_assets || [];
  let hits = 0;
  for (const asset of assets) {
    const hay = `${asset.asset_type || ''} ${asset.asset_name || ''}`.toLowerCase();
    if (types.some((t) => hay.includes(t))) hits += 1;
  }
  return hits;
}

// v2.1.1 (doc section 四) — do NOT rely on a single self-declared label,
// AND do NOT let a direction that merely *mentions* materials steal the
// evaluation from the direction the model actually labelled B. Two-phase strategy:
//   1. If any direction is explicitly declared B / product_material_aesthetics,
//      that one is THE target (the self-label is a strong — though not sole —
//      signal). It is flagged label_mismatch only when it is declared B yet its
//      content signals are ALL weak (a B direction lacking material content).
//   2. Otherwise, pick the single strongest content-only candidate
//      (weight >= 0.30 || >= 3 semantic hits || >= 2 material assets). That
//      candidate is flagged label_mismatch = true because the model did NOT
//      label it B but the content clearly is product/material (doc §4.4).
function contentSignals(direction) {
  const declared = direction.family_type === 'product_material_aesthetics' || direction.direction_family === 'B';
  const weights = resolveWeights(direction);
  const text = collectDirectionText(direction);
  const semanticHits = countKeywordHits(text, [
    '材料', '材质', '产品', '器械', '微观结构', '成分', '精密', '科学美学', '包装', '表面纹理'
  ]);
  const assetHits = countAssetTypeHits(direction, ['material', 'product', 'microscopic', 'scientific']);
  const strong = weights.product_material_weight >= PRODUCT_MATERIAL_MIN || semanticHits >= 3 || assetHits >= 2;
  const score = weights.product_material_weight + semanticHits * 0.1 + assetHits * 0.1;
  return { declared, weights, semanticHits, assetHits, strong, score };
}

function detectProductMaterialDirection(directions) {
  const declaredOnes = directions.filter((d) => contentSignals(d).declared);
  if (declaredOnes.length > 0) {
    const target = declaredOnes[0];
    const sig = contentSignals(target);
    // Declared B but content is weak across every signal -> mislabelled B.
    const labelMismatch = !sig.strong;
    return { direction: target, label_mismatch: labelMismatch, candidate: null };
  }
  // No declared-B direction: find the strongest content-only candidate.
  let best = null;
  let bestScore = -1;
  for (const d of directions) {
    const sig = contentSignals(d);
    if (sig.strong && sig.score > bestScore) {
      best = d;
      bestScore = sig.score;
    }
  }
  if (best) {
    return { direction: best, label_mismatch: true, candidate: null };
  }
  // No strong candidate — collect semantic candidates for reporting (doc §八).
  let semanticCandidate = null;
  let semanticCandidateScore = -1;
  for (const d of directions) {
    const sig = contentSignals(d);
    // Any direction with at least some material signal is a semantic candidate
    if (sig.semanticHits > 0 || sig.assetHits > 0 || sig.weights.product_material_weight > 0) {
      if (sig.score > semanticCandidateScore) {
        semanticCandidate = d;
        semanticCandidateScore = sig.score;
      }
    }
  }
  return {
    direction: null,
    label_mismatch: false,
    candidate: semanticCandidate
      ? {
          direction_id: semanticCandidate.direction_id,
          reason: '检测到少量产品/材料关键词',
          fail_reason: 'Family、Weight、Asset 均不达标'
        }
      : null
  };
}

// E02 Positive Quality Gate (v2.1.3 doc section 五).
//
// "Not degraded" does NOT mean "good enough". This gate evaluates the positive
// quality dimensions of the product-material aesthetics direction, producing
// 'pass', 'conditional', or 'rewrite_required'.

const E02_POSITIVE_QUALITY_VERSION = 'e02-positive-quality-evaluator-v1.1';

const MATERIAL_SPECIFICITY_KEYWORDS = ['材质', '材料', '微观结构', '纹理', '表面', '分子', '精密', '细节', '产品材质', '器械材质', '材质细节'];
const BRAND_EXCLUSIVITY_KEYWORDS = ['品牌专属', '品牌美学', '九州美学', '独特', '专属', '品牌', '精致', '品牌识别', '品牌视觉'];

// Core dimensions for positive quality (doc §五).
const CORE_DIMENSIONS = ['product_presentation_strength', 'brand_aesthetic_strength', 'consumer_value_strength', 'material_specificity', 'brand_exclusivity'];
// Non-core dimension.
const NON_CORE_DIMENSIONS = ['execution_variety'];

function evaluateE02PositiveQuality(direction, text, degradationScore) {
  const materialSpecificity = Math.min(5, Math.ceil(countKeywordHits(text, MATERIAL_SPECIFICITY_KEYWORDS) / 2));
  const brandExclusivity = Math.min(5, Math.ceil(countKeywordHits(text, BRAND_EXCLUSIVITY_KEYWORDS) / 2));

  const dims = {
    product_presentation_strength: degradationScore.product_presentation_strength,
    brand_aesthetic_strength: degradationScore.brand_aesthetic_strength,
    consumer_value_strength: degradationScore.consumer_value_strength,
    execution_variety: degradationScore.execution_variety,
    material_specificity: materialSpecificity,
    brand_exclusivity: brandExclusivity
  };

  const thresholds = {
    product_presentation_strength: 3,
    brand_aesthetic_strength: 3,
    consumer_value_strength: 2,
    execution_variety: 3,
    material_specificity: 3,
    brand_exclusivity: 3
  };

  const failing = Object.entries(thresholds).filter(([k, t]) => dims[k] < t);

  // v2.1.4 — pass_with_warning: only 1 non-core dimension below threshold,
  // and that dimension is still >= 2.
  if (failing.length === 1) {
    const [failKey, failThreshold] = failing[0];
    const isCore = CORE_DIMENSIONS.includes(failKey);
    const isNonCore = NON_CORE_DIMENSIONS.includes(failKey);
    const stillAcceptable = dims[failKey] >= 2;
    if (isNonCore && stillAcceptable) {
      return { status: 'pass_with_warning', dimensions: dims, failing_dimensions: [failKey] };
    }
    // 1 core dimension below threshold OR non-core but < 2 -> conditional
    return { status: 'conditional', dimensions: dims, failing_dimensions: [failKey] };
  }

  if (failing.length >= 2) {
    return { status: 'rewrite_required', dimensions: dims, failing_dimensions: failing.map(([k]) => k) };
  }

  return { status: 'pass', dimensions: dims, failing_dimensions: [] };
}

export function evaluateE02AestheticGate(directions = []) {
  const found = detectProductMaterialDirection(directions);
  if (!found || !found.direction) {
    // v2.1.4 — product_material_direction_missing (doc §八).
    const result = {
      evaluator_version: E02_AESTHETIC_GATE_VERSION,
      evaluated_direction_id: null,
      evaluated: false,
      product_material_direction_missing: true,
      weight_pass: true,
      content_pass: true,
      degradation_pass: true,
      direction_family_label_mismatch: false,
      rewrite_required: false,
      blocking_reasons: []
    };
    if (found?.candidate) {
      result.semantic_candidate = found.candidate;
      // v2.1.4.1 — renamed to e02_direction_missing (doc §3.2).
      result.blocking_reasons.push(`e02_direction_missing(candidate=${found.candidate.direction_id})`);
    } else {
      // v2.1.4.1 — renamed to e02_direction_missing (doc §3.2).
      result.blocking_reasons.push('e02_direction_missing');
    }
    return result;
  }

  const target = found.direction;
  const labelMismatch = found.label_mismatch;

  // v2.1.4.1 — weight sum validation before any other check (doc §3.1).
  // If the explicit compliance_weights sum is not 1.00 ± 0.01, this is a hard
  // rewrite_required; the provider must re-supply correct weights.
  const weightSumCheck = validateWeightSum(target);
  const weightSumInvalid = !weightSumCheck.valid;

  const weights = resolveWeights(target);
  const brandAesthetic = weights.brand_aesthetic_weight || 0;
  const consumerValue = weights.consumer_value_weight || 0;
  const productMaterial = weights.product_material_weight || 0;

  const weightPass =
    brandAesthetic >= BRAND_AESTHETIC_MIN &&
    consumerValue >= CONSUMER_VALUE_MIN &&
    productMaterial >= PRODUCT_MATERIAL_MIN;

  const text = collectDirectionText(target);
  // Require at least 4 of the 6 substantive content groups so the direction is
  // genuinely material+aesthetic (not a lab bench / data card). This tolerates
  // one or two missing nuances while still rejecting degenerate output.
  const groupHits = Object.values(REQUIRED_CONTENT_GROUPS).filter(
    (keywords) => countKeywordHits(text, keywords) > 0
  ).length;
  const contentPass = groupHits >= 4;

  const degradation = computeDegradationScore(text, target);
  const degradationPass = !degradation.rewrite_required;

  // v2.1.3 — positive quality evaluation (doc §五).
  const positiveQuality = evaluateE02PositiveQuality(target, text, degradation);
  const positiveQualityPass = positiveQuality.status === 'pass';
  const positiveQualityPassWithWarning = positiveQuality.status === 'pass_with_warning';
  const positiveQualityConditional = positiveQuality.status === 'conditional';

  // v2.1.4.1 — explicit brand_exclusivity status (doc §3.4).
  const brandExclusivityScore = positiveQuality.dimensions.brand_exclusivity;
  let brandExclusivityStatus = 'pass';
  if (brandExclusivityScore <= 2) brandExclusivityStatus = 'rewrite_required';
  else if (brandExclusivityScore === 3) brandExclusivityStatus = 'conditional';

  const blockingReasons = [];
  // v2.1.4.1 — weight sum invalid is the highest-priority rewrite reason.
  if (weightSumInvalid) {
    blockingReasons.push(`e02_weight_sum_invalid(original=${weightSumCheck.original_total.toFixed(2)},required=1.00,tolerance=${WEIGHT_SUM_TOLERANCE})`);
  }
  if (!weightPass) {
    // List ONLY the weights that actually fall below their threshold, so the
    // reason is truthful and actionable (doc §五: 可解释性).
    const failing = [];
    if (brandAesthetic < BRAND_AESTHETIC_MIN) failing.push(`brand_aesthetic=${brandAesthetic.toFixed(2)}<${BRAND_AESTHETIC_MIN}`);
    if (consumerValue < CONSUMER_VALUE_MIN) failing.push(`consumer_value=${consumerValue.toFixed(2)}<${CONSUMER_VALUE_MIN}`);
    if (productMaterial < PRODUCT_MATERIAL_MIN) failing.push(`product_material=${productMaterial.toFixed(2)}<${PRODUCT_MATERIAL_MIN}`);
    // v2.1.4.1 — renamed from e02_weight_fail to e02_weight_threshold_fail (doc §3.2).
    blockingReasons.push(`e02_weight_threshold_fail(${failing.join(' | ')})`);
  }
  if (!contentPass) blockingReasons.push('e02_missing_aesthetic_content');
  if (!degradationPass) {
    const combo = degradation.lab_scene_dominance >= 4 && degradation.brand_aesthetic_strength <= 2 && degradation.consumer_value_strength <= 2
      ? 'lab_dominance'
      : 'scientific_dominance';
    // v2.1.4.1 — renamed from e02_degradation to e02_degradation_fail (doc §3.2).
    blockingReasons.push(`e02_degradation_fail(${combo})`);
  }
  if (degradation.degradation_risk_warning) blockingReasons.push(`e02_degradation_risk_warning`);
  if (labelMismatch) blockingReasons.push(`e02_direction_family_label_mismatch(${target.direction_id})`);
  // v2.1.3 — positive quality failures (not degradation, just insufficient quality).
  if (!positiveQualityPass && positiveQuality.status === 'rewrite_required') {
    blockingReasons.push(`e02_positive_quality_rewrite(${positiveQuality.failing_dimensions.join('/')})`);
  }
  if (!positiveQualityPass && positiveQuality.status === 'conditional') {
    blockingReasons.push(`e02_positive_quality_conditional(${positiveQuality.failing_dimensions.join('/')})`);
  }
  // v2.1.4 — pass_with_warning does NOT block or downgrade; it is an info-level note.
  // Do NOT push into blockingReasons; use the positive_quality_pass_with_warning flag instead.
  if (positiveQualityPassWithWarning) {
    // info-level only — blockingReasons must stay clean of pass_with_warning.
  }

  const rewriteRequired = (blockingReasons.length > 0 && !positiveQualityConditional && !positiveQualityPassWithWarning) || weightSumInvalid;
  const platformRolePreserved = /平台/u.test(text);
  const anchorMechanismEnhancement = rewriteRequired && platformRolePreserved && degradationPass
    && !blockingReasons.some((reason) => /weight_sum_invalid|direction_family_label_mismatch|degradation_fail/u.test(reason));

  return {
    evaluator_version: E02_AESTHETIC_GATE_VERSION,
    evaluated_direction_id: target.direction_id,
    evaluated: true,
    brand_aesthetic_weight: brandAesthetic,
    consumer_value_weight: consumerValue,
    product_material_weight: productMaterial,
    weight_sum_check: weightSumCheck,
    weight_sum_invalid: weightSumInvalid,
    weight_pass: weightPass,
    content_pass: contentPass,
    degradation_pass: degradationPass,
    direction_family_label_mismatch: labelMismatch,
    // v2.1.4.1 — rewrite_required includes weight_sum_invalid (doc §3.1).
    rewrite_required: rewriteRequired,
    resolution_code: anchorMechanismEnhancement ? 'ANCHOR_MECHANISM_ENHANCEMENT_REQUIRED' : (rewriteRequired ? 'E02_POSITIVE_QUALITY' : null),
    platform_role_preserved: platformRolePreserved,
    positive_quality_pass: positiveQualityPass,
    positive_quality_pass_with_warning: positiveQualityPassWithWarning,
    positive_quality_status: positiveQuality.status,
    positive_quality_conditional: positiveQualityConditional,
    // v2.1.4.1 — explicit brand_exclusivity status (doc §3.4).
    brand_exclusivity_score: brandExclusivityScore,
    brand_exclusivity_status: brandExclusivityStatus,
    blocking_reasons: blockingReasons,
    // v2.1.2 — multi-dimensional degradation scores (doc §五).
    lab_scene_dominance: degradation.lab_scene_dominance,
    scientific_info_dominance: degradation.scientific_info_dominance,
    product_presentation_strength: degradation.product_presentation_strength,
    brand_aesthetic_strength: degradation.brand_aesthetic_strength,
    consumer_value_strength: degradation.consumer_value_strength,
    execution_variety: degradation.execution_variety,
    degradation_risk_warning: degradation.degradation_risk_warning,
    // v2.1.3 — positive quality dimensions.
    material_specificity: positiveQuality.dimensions.material_specificity,
    brand_exclusivity: positiveQuality.dimensions.brand_exclusivity,
    positive_quality_dimensions: positiveQuality.dimensions,
    positive_quality_failing_dimensions: positiveQuality.failing_dimensions
  };
}
