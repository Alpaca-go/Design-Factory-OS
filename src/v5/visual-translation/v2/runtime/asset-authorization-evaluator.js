// Asset Authorization & Data Forgery Gate (doc section 9 / 七).
//
// v2.1 makes the Fabricated Data Gate *explainable*: every detection carries a
// precise field path, the detected text, a detection type, a rule id, a reason
// and a suggested rewrite. Risk is graded so the pipeline can distinguish:
//   structure_only        -> warning  (a field skeleton is allowed)
//   placeholder_value     -> warning  (a redacted / masked value is allowed)
//   specific_unverified_value -> blocked (a concrete unverified number/name)
//   official_credential_imitation -> blocked (fake badge / official icon)
//
// The doc forbids blocking merely on the *words* 责任人 / 批次 / 注册证 / 证书 /
// 合格率 — those are field names and become warnings only when no concrete
// unverified value follows.
//
// v2.1.1 (P2): all fabrication patterns live in evaluator-keywords.js so the
// detection口径 cannot drift between evaluators.

import {
  FABRICATION_SPECIFIC_PATTERNS,
  FABRICATION_CREDENTIAL_PATTERNS,
  FABRICATION_DATA_METRIC_PATTERNS,
  FABRICATION_SCIENTIFIC_PATTERNS,
  FABRICATION_FIELD_STRUCTURE_PATTERNS,
  FABRICATION_PLACEHOLDER_PATTERNS,
  PERSONAL_DATA_PATTERNS
} from './evaluator-keywords.js';
import { classifyFieldSemanticRole, isNegatedContext } from './field-semantic-role.js';
import { allowedEvidenceValueSet, detectUnsupportedSpecificData, detectionIsEvidenceBound } from './specific-data-evidence-evaluator.js';
import { extractEvidenceBoundValues } from '../visual-fact-first/evidence-bound-values.js';

const ALLOWED_MODES = ['abstracted', 'redacted', 'structure_only', 'real_data_required', 'prohibited'];

const IGNORED_KEYS = new Set([
  'asset_id', 'evidence_id', 'direction_id', 'example_id', 'template_id', 'constraint_id',
  'asset_type', 'touchpoint', 'touchpoint_category', 'report_language', 'contract_version',
  'direction_generation_mode', 'direction_family', 'family_type', 'consumer_value_role'
]);

// v2.1.2 — design-context fields whose proportion/ratio terminology is legitimate
// layout language, not fabricated data (doc §四: 画布比例、图文比例、摄影比例、
// 多尺寸适配、版式参数等).
const DESIGN_CONTEXT_PATHS = /canvas_ratio|photography_ratio|graphic_ratio|information_ratio|responsive_adaptation|layout_behavior|layout_structure|information_hierarchy|scale_crop_repeat|subject_area|info_area|brand_area|whitespace_area|data_note_area|multi_size_adaptation|subject_position|information_position|graphic_overlay|composition_templates|how_graphics_form|must_not_become|enter_touchpoints|brand_fact_mapping|touchpoint_category|example_id/;

function walkStrings(value, basePath, out) {
  if (typeof value === 'string') {
    if (value.trim().length && value.length <= 2000) out.push({ path: basePath, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkStrings(item, `${basePath}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (IGNORED_KEYS.has(key)) continue;
      walkStrings(child, basePath ? `${basePath}.${key}` : key, out);
    }
  }
}

function nonNegatedMatches(text, expression) {
  const flags = expression.flags.includes('g') ? expression.flags : `${expression.flags}g`;
  return [...String(text).matchAll(new RegExp(expression.source, flags))]
    .filter((match) => !isNegatedContext(text, match.index || 0));
}

function classifyFragment({ path, text }, directionId) {
  const detections = [];
  const semanticRole = classifyFieldSemanticRole(path);
  if (semanticRole === 'negative_constraint' || semanticRole === 'metadata') return detections;

  // v2.1.2 — design-context fields: proportion/ratio/adaptation terms are legitimate
  // layout language, not fabricated data. Skip blocked metric/scientific patterns
  // but still allow field_structure warnings for placeholder detection.
  const isDesignContext = DESIGN_CONTEXT_PATHS.test(path || '');

  // Blocked pattern sets: concrete unverified values, forged credentials,
  // generic metrics, unsupported scientific claims, personal data.
  const blockedSets = [
    FABRICATION_SPECIFIC_PATTERNS,
    FABRICATION_CREDENTIAL_PATTERNS,
    ...(isDesignContext ? [] : [FABRICATION_DATA_METRIC_PATTERNS]),
    ...(isDesignContext ? [] : [FABRICATION_SCIENTIFIC_PATTERNS]),
    PERSONAL_DATA_PATTERNS
  ];
  for (const set of blockedSets) {
    for (const pattern of set) {
      for (const match of nonNegatedMatches(text, pattern.re)) {
        detections.push({
          direction_id: directionId,
          field_path: path,
          detected_text: match[0] || text.slice(0, 40),
          detection_type: pattern.type,
          source_type: 'model_output',
          value_source: 'provider',
          field_semantic_role: semanticRole,
          confidence: 0.92,
          rule_id: pattern.rule_id,
          reason: pattern.reason,
          suggested_rewrite: pattern.rewrite,
          risk_level: 'blocked'
        });
      }
    }
  }
  // Field-structure / placeholder warnings only when no concrete value was
  // found (negative lookaheads already prevent double-flagging, this guard is
  // an extra safety so we never both block AND warn on the same fragment).
  if (detections.length === 0) {
    const warningSets = [FABRICATION_FIELD_STRUCTURE_PATTERNS, FABRICATION_PLACEHOLDER_PATTERNS];
    for (const set of warningSets) {
      for (const pattern of set) {
        for (const match of nonNegatedMatches(text, pattern.re)) {
          detections.push({
            direction_id: directionId,
            field_path: path,
            detected_text: match[0] || text.slice(0, 40),
            detection_type: pattern.type,
            source_type: 'model_output',
            value_source: 'provider',
            field_semantic_role: semanticRole,
            confidence: 0.6,
            rule_id: pattern.rule_id,
            reason: pattern.reason,
            suggested_rewrite: pattern.rewrite,
            risk_level: 'warning'
          });
        }
      }
    }
  }
  return detections;
}

export function detectForgeryStructured(direction, { evidenceBoundValues = [], enforceEvidenceBoundValues = false } = {}) {
  const leaves = [];
  walkStrings(direction, 'visualDirectionV2', leaves);
  const detections = [];
  for (const leaf of leaves) detections.push(...classifyFragment(leaf, direction.direction_id));
  if (!enforceEvidenceBoundValues) return detections;
  const allowedValues = allowedEvidenceValueSet(evidenceBoundValues);
  const unbound = detectUnsupportedSpecificData(direction, evidenceBoundValues);
  return [...detections.filter((item) => {
    if (detectionIsEvidenceBound(item.detected_text, allowedValues)) return false;
    return extractEvidenceBoundValues(item.detected_text).length === 0;
  }), ...unbound]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.field_path === item.field_path && candidate.rule_id === item.rule_id && candidate.detected_text === item.detected_text) === index);
}

export function evaluateAssetAuthorization(direction, options = {}) {
  const detections = detectForgeryStructured(direction, options);
  const blocked = detections.filter((d) => d.risk_level === 'blocked');
  const ok = blocked.length === 0;

  const explicit = direction.asset_authorization || {};
  const dataAuthorizationLevel = blocked.length ? 'prohibited' : (explicit.data_authorization_level || 'abstracted');
  const documentVisualizationMode = explicit.document_visualization_mode || 'structure_only';
  const credentialUsageMode = explicit.credential_usage_mode || 'redacted';
  const generatedDataPolicy = blocked.length ? 'prohibited' : (explicit.generated_data_policy || 'abstracted');

  return {
    direction_id: direction.direction_id,
    ok,
    forgery_violations: blocked.map((d) => d.detected_text),
    detections,
    data_authorization_level: ALLOWED_MODES.includes(dataAuthorizationLevel) ? dataAuthorizationLevel : 'abstracted',
    document_visualization_mode: ALLOWED_MODES.includes(documentVisualizationMode) ? documentVisualizationMode : 'structure_only',
    credential_usage_mode: ALLOWED_MODES.includes(credentialUsageMode) ? credentialUsageMode : 'redacted',
    generated_data_policy: ALLOWED_MODES.includes(generatedDataPolicy) ? generatedDataPolicy : 'abstracted'
  };
}

export function evaluateAssetAuthorizationSet(directions = [], options = {}) {
  const perDirection = directions.map((d) => evaluateAssetAuthorization(d, options));
  const anyForgery = perDirection.some((item) => !item.ok);
  return {
    evaluator_version: 'asset-authorization-evaluator-v1.1',
    per_direction: perDirection,
    forgery_detected: anyForgery,
    blocking_reasons: anyForgery ? ['fabricated_data_or_credentials'] : []
  };
}
