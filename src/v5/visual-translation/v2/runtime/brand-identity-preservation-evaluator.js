// Brand Identity Preservation Gate (doc section 2 / 3).
//
// P0 — blocks the v2 pipeline when the model substitutes or shrinks the
// project brand. The "安迹" incident (a non-project brand name appearing in
// the report instead of 九州美学) is exactly this class of failure: the model
// hallucinated a different brand. We never trust source fixtures to contain the
// leak; instead we scan the generated output for any unexpected brand name.
//
// v2.1.2 (Precision Patch): brand detection now uses confidence scoring and
// context analysis to avoid false positives from ordinary Chinese phrases.
// Hard-block only when: entity_type === 'brand' && confidence >= 0.85 &&
// matched_source is NOT prompt_instruction or negative_constraint.

import { collectDirectionText } from './direction-text-util.js';
import { BRAND_NAME_SUFFIX, BRAND_ROLE_KEYWORDS, STRATEGIC_THESIS_KEYWORDS, countKeywordHits } from './evaluator-keywords.js';
import { classifyFieldSemanticRole, collectSemanticStringLeaves, isNegatedContext } from './field-semantic-role.js';

export const BRAND_IDENTITY_PRESERVATION_EVALUATOR_VERSION = 'brand-identity-preservation-evaluator-v2';

// Phrases that are NOT brand names even if they look like them (doc §三).
const NON_BRAND_PHRASES = new Set([
  '提供真实行业对象',
  '用真实行业对象替代概念艺术',
  '真实行业对象',
  '行业对象',
  '真实对象'
]);

// Fields that carry brand context (doc §三).
const BRAND_CONTEXT_FIELDS = /direction_name|strategic_idea|brand_evidence|brand_fact_mapping|how_graphics_form|core_brand_info|cta_info|execution_role|brand_specific_detail/;

// Prompt-instruction / negative-constraint markers (doc §三).
const PROMPT_INSTRUCTION_MARKERS = /不得|禁止|不可|不应|不能|未授权|非授权|避免|严禁|必须|需要|应该|PRINCIPLE|原则|提示|prompt|instruction|constraint|约束/;
const NEGATIVE_PREFIX_AT_START = /^(?:不得|禁止|不可|不应|不能|未授权|非授权|避免|严禁)/u;
const NEGATIVE_PREFIX_OVERLAP = /(?:不得|禁止|不可|不应|不能|未授权|非授权|避免|严禁)/u;
const BRAND_LEADING_RELATION_WORDS = /^(?:背靠|依托|来自|隶属于|由|以|作为|靠|基于)+/u;
const INVALID_BRAND_FRAGMENTS = /^(?:真实业|真实业务|业务|品牌|项目|平台|主体|集团|实业)$|为基础|真实行业|作为品牌|^以真实/u;
const RELATION_PATTERNS = [
  ['parent_company', /母公司|母集团/u],
  ['shareholder', /股东|控股股东/u],
  ['group_backing', /背靠|依托|集团背书|集团支持|隶属于/u],
  ['partner', /合作伙伴|联合合作|战略合作/u],
  ['client', /客户|服务于/u],
  ['competitor', /竞品|竞争品牌/u],
  ['industry_reference', /行业案例|参考案例|对标/u]
];
const REPLACEMENT_MARKERS = /作为(?:当前|项目)?品牌|品牌名称|品牌主体|替换品牌|使用.{0,8}(?:Logo|LOGO|标志|VI)|继承.{0,8}VI/u;

export function normalizeBrandCandidate(raw = '') {
  const cleaned = String(raw).trim().replace(/[“”"'《》【】\[\]（）()，,。；;：:\s]+$/gu, '').replace(BRAND_LEADING_RELATION_WORDS, '');
  if (!cleaned || cleaned.length < 3 || INVALID_BRAND_FRAGMENTS.test(cleaned)) return null;
  if (!/(集团|控股|实业|生物科技|生命科学|药业|大健康|健康科技|文化传媒|品牌管理)$/u.test(cleaned)) return null;
  if (/^(?:真实|相关|某|该|本|当前)(?:集团|实业|药业)$/u.test(cleaned)) return null;
  return cleaned;
}

function classifyBrandReferenceRole(context, fieldPath, candidate, sourceEvidenceText = '') {
  for (const [role, pattern] of RELATION_PATTERNS) {
    if (pattern.test(context)) return { role, source_supported: sourceEvidenceText.includes(candidate) };
  }
  // A source-supported related brand is not an identity substitution merely
  // because the direction proposes a Logo/VI/watermark. Authorization is a
  // separate rewrite-level gate; only an unsupported replacement hard-blocks.
  if (sourceEvidenceText.includes(candidate)) {
    const storedRole = RELATION_PATTERNS.find(([role]) => sourceEvidenceText.includes(`"relationship":"${role}"`))?.[0];
    return { role: storedRole || 'group_backing', source_supported: true };
  }
  if (REPLACEMENT_MARKERS.test(context) || (fieldPath && BRAND_CONTEXT_FIELDS.test(fieldPath))) {
    return { role: 'unauthorized_replacement', source_supported: false };
  }
  return { role: 'unknown', source_supported: sourceEvidenceText.includes(candidate) };
}

function computeConfidence(match, text, fieldPath) {
  let score = 0.5;
  // 1. Brand-suffix strength
  const suffixStrength = {
    '集团': 0.9, '控股': 0.9, '实业': 0.85, '生物科技': 0.9, '生命科学': 0.9,
    '药业': 0.85, '大健康': 0.85, '健康科技': 0.85, '文化传媒': 0.85, '品牌管理': 0.85
  };
  for (const [s, v] of Object.entries(suffixStrength)) {
    if (match.includes(s)) score = Math.max(score, v);
  }
  // 2. Context boost: appears in brand-related field
  if (fieldPath && BRAND_CONTEXT_FIELDS.test(fieldPath)) score += 0.1;
  // 3. Context boost: appears near "品牌" / "项目"
  const idx = text.indexOf(match);
  const window = text.slice(Math.max(0, idx - 30), idx + match.length + 30);
  if (/品牌|项目|来自|名称|角色/.test(window)) score += 0.1;
  // 4. Penalty: in prompt-instruction context
  if (PROMPT_INSTRUCTION_MARKERS.test(window)) score -= 0.3;
  return Math.min(0.98, Math.max(0.1, score));
}

function determineSource(fieldPath, text, match) {
  if (classifyFieldSemanticRole(fieldPath) === 'negative_constraint') return 'negative_constraint';
  if (fieldPath && BRAND_CONTEXT_FIELDS.test(fieldPath)) return 'explicit_brand_field';
  const idx = text.indexOf(match);
  const window = text.slice(Math.max(0, idx - 40), idx + match.length + 40);
  if (PROMPT_INSTRUCTION_MARKERS.test(window)) return 'prompt_instruction';
  if (/品牌名为|项目为|来自|品牌名称|品牌角色/.test(window)) return 'brand_context_phrase';
  return 'generic_text';
}

function getDetectionReason(match, confidence, source) {
  if (confidence >= 0.85) return 'high_confidence_brand_suffix_match';
  if (confidence >= 0.6) return 'moderate_confidence_brand_indicator';
  return 'low_confidence_possible_brand';
}

// Scan free text for brand names that are NOT the expected brand (or its known
// aliases) and for any explicitly-forbidden example brand names.
// v2.1.2: returns rich detection objects with confidence scoring and source
// classification to avoid false positives from ordinary Chinese phrases.
export function detectUnexpectedBrandNames({
  expectedBrandName,
  sourceText,
  knownExampleBrandNames = [],
  knownAliases = [],
  fieldPath = '',
  sourceEvidenceText = ''
} = {}) {
  const allowlist = new Set([expectedBrandName, ...(knownAliases || [])].filter(Boolean));
  const denied = new Set(knownExampleBrandNames || []);
  const found = [];
  const text = String(sourceText || '');
  const inNegativeContext = (needle) => {
    const index = text.indexOf(needle);
    return index >= 0 && isNegatedContext(text, index);
  };

  // 1) forbidden example brands (e.g. a demo brand that leaked into output).
  for (const name of denied) {
    if (name && text.includes(name) && !allowlist.has(name) && !inNegativeContext(name)
      && !NEGATIVE_PREFIX_AT_START.test(text.slice(Math.max(0, text.indexOf(name) - 12), text.indexOf(name) + name.length))) {
      const idx = text.indexOf(name);
      const surrounding = text.slice(Math.max(0, idx - 30), idx + name.length + 30);
      const source = determineSource(fieldPath, text, name);
      const confidence = source === 'prompt_instruction' ? 0.3 : 0.95;
      const relation = classifyBrandReferenceRole(surrounding, fieldPath, name, sourceEvidenceText);
      found.push({
        detected_text: name,
        field_path: fieldPath,
        surrounding_context: surrounding,
        entity_type: 'brand',
        confidence,
        matched_source: source,
        brand_reference_role: relation.role,
        source_supported: relation.source_supported,
        detection_reason: 'explicit_forbidden_example_brand'
      });
    }
  }

  // 2) brand-suffix tokens that are not the allowed project brand.
  // v2.1.2: only flag as hard-block when confidence >= 0.85 and source is not
  // prompt_instruction or negative_constraint.
  const suffixMatches = text.match(BRAND_NAME_SUFFIX);
  if (suffixMatches) {
    for (const token of suffixMatches) {
      const rawCandidate = token.replace(BRAND_NAME_SUFFIX, '$1$2');
      const cleaned = normalizeBrandCandidate(rawCandidate);
      if (!cleaned) continue;
      const tokenIndex = text.indexOf(token);
      const cleanedIndex = text.indexOf(cleaned, Math.max(0, tokenIndex));
      if (NEGATIVE_PREFIX_AT_START.test(token)
        || NEGATIVE_PREFIX_OVERLAP.test(text.slice(Math.max(0, tokenIndex - 4), tokenIndex + Math.min(token.length, 6)))
        || isNegatedContext(text, tokenIndex) || isNegatedContext(text, cleanedIndex)) continue;
      // Skip non-brand phrases (e.g. "提供真实行业对象")
      if (NON_BRAND_PHRASES.has(cleaned) || NON_BRAND_PHRASES.has(token)) continue;
      if (!allowlist.has(cleaned) && !found.some((f) => f.detected_text === cleaned)) {
        const source = determineSource(fieldPath, text, token);
        const confidence = computeConfidence(token, text, fieldPath);
        const reason = getDetectionReason(token, confidence, source);
        const index = text.indexOf(token);
        const surrounding = text.slice(Math.max(0, index - 30), index + token.length + 30);
        const relation = classifyBrandReferenceRole(surrounding, fieldPath, cleaned, sourceEvidenceText);
        found.push({
          detected_text: cleaned,
          field_path: fieldPath,
          surrounding_context: surrounding,
          entity_type: confidence >= 0.85 ? 'brand' : 'possible_brand',
          confidence,
          matched_source: source,
          brand_reference_role: relation.role,
          source_supported: relation.source_supported,
          detection_reason: reason
        });
      }
    }
  }

  return {
    hasUnexpected: found.length > 0,
    found: Array.from(new Set(found.map((f) => f.detected_text))),
    detections: found,
    expectedBrandName,
    allowed: Array.from(allowlist),
    denied: Array.from(denied)
  };
}

export function evaluateBrandIdentityPreservation({
  directions = [],
  expectedBrandName = '九州美学',
  brandRole = '医美全链生态平台',
  strategicThesis = 'B2B2C 医美全链生态平台',
  knownExampleBrandNames = [],
  knownAliases = [],
  sourceEvidenceText = ''
} = {}) {
  const contaminationSources = [];
  let brandNamePreserved = true;
  let rolePreserved = true;
  let thesisPreserved = true;
  let industryIdentityPreserved = true;

  const roleHitsRequired = 2; // at least two role keywords must survive
  const thesisHitsRequired = 3; // strategic thesis must remain multi-dimensional

  for (const direction of directions) {
    const text = collectDirectionText(direction);
    const leafDetections = collectSemanticStringLeaves(direction).flatMap((leaf) => detectUnexpectedBrandNames({
      expectedBrandName, sourceText: leaf.text, knownExampleBrandNames, knownAliases,
      fieldPath: leaf.path, sourceEvidenceText
    }).detections);
    const detection = {
      hasUnexpected: leafDetections.length > 0,
      found: [...new Set(leafDetections.map((item) => item.detected_text))],
      detections: leafDetections
    };

    // v2.1.2: only HARD BLOCK when high-confidence brand detections that are
    // NOT from prompt instructions or negative constraints.
    const hardBlockDetections = detection.detections.filter((d) =>
      d.entity_type === 'brand' &&
      d.confidence >= 0.85 &&
      d.brand_reference_role === 'unauthorized_replacement' &&
      d.matched_source !== 'prompt_instruction' &&
      d.matched_source !== 'negative_constraint' &&
      !isNegatedContext(d.surrounding_context, d.surrounding_context.indexOf(d.detected_text))
    );
    const warningDetections = detection.detections.filter((d) =>
      !hardBlockDetections.includes(d) && d.confidence >= 0.6
    );

    if (hardBlockDetections.length > 0) {
      brandNamePreserved = false;
      contaminationSources.push({
        direction_id: direction.direction_id,
        unexpected_brand_names: hardBlockDetections.map((d) => d.detected_text),
        detections: hardBlockDetections,
        possible_false_positive: false
      });
    } else if (warningDetections.length > 0) {
      // v2.1.2: low/moderate-confidence detections are warnings, not blocks
      contaminationSources.push({
        direction_id: direction.direction_id,
        unexpected_brand_names: warningDetections.map((d) => d.detected_text),
        detections: warningDetections,
        possible_false_positive: true
      });
    }

    // brand name must actually appear in the output
    if (!text.includes(expectedBrandName)) {
      brandNamePreserved = false;
      contaminationSources.push({
        direction_id: direction.direction_id,
        unexpected_brand_names: [`missing:${expectedBrandName}`]
      });
      continue;
    }

    // brand role must not be shrunk to a single function
    const roleHits = countKeywordHits(text, BRAND_ROLE_KEYWORDS);
    if (roleHits < roleHitsRequired) {
      rolePreserved = false;
      contaminationSources.push({
        direction_id: direction.direction_id,
        reason: 'brand_role_reduced',
        role_keyword_hits: roleHits
      });
    }

    const thesisHits = countKeywordHits(text, STRATEGIC_THESIS_KEYWORDS);
    if (thesisHits < thesisHitsRequired) {
      thesisPreserved = false;
      contaminationSources.push({
        direction_id: direction.direction_id,
        reason: 'strategic_thesis_reduced',
        thesis_keyword_hits: thesisHits
      });
    }

    // industry identity must not be simplified to a single supply/compliance role
    const singleFunction = /(医疗器械供应链公司|合规 ?SaaS|器械采购平台|医药物流企业)/.test(text);
    if (singleFunction) {
      industryIdentityPreserved = false;
      contaminationSources.push({
        direction_id: direction.direction_id,
        reason: 'industry_identity_simplified'
      });
    }
  }

  const contaminationDetected = contaminationSources.length > 0;
  const hasHardBlock = contaminationSources.some((s) => s.detections && !s.possible_false_positive && s.unexpected_brand_names?.length > 0 && !s.unexpected_brand_names[0].startsWith('missing:'));
  const brandIdentityPreserved = !hasHardBlock && brandNamePreserved && rolePreserved && thesisPreserved && industryIdentityPreserved;

  const blockingReasons = [];
  if (!brandNamePreserved) blockingReasons.push('brand_name_not_preserved');
  if (!rolePreserved) blockingReasons.push('brand_role_reduced');
  if (!thesisPreserved) blockingReasons.push('strategic_thesis_reduced');
  if (!industryIdentityPreserved) blockingReasons.push('industry_identity_simplified');

  // Stable, report-safe issue schema. Keep contamination_sources for backward
  // compatibility, but downstream code no longer has to guess whether `reason`
  // is a brand name or an error code.
  const issues = [];
  for (const source of contaminationSources) {
    for (const detection of source.detections || []) {
      const warning = source.possible_false_positive === true;
      issues.push({
        code: 'UNEXPECTED_BRAND_IDENTITY',
        severity: warning ? 'warning' : 'blocking',
        scope: 'direction',
        direction_id: source.direction_id,
        field_path: detection.field_path || 'visualDirectionV2',
        detected_value: detection.detected_text,
        unexpected_brand_name: detection.detected_text,
        expected_brand_name: expectedBrandName,
        matched_rule: detection.detection_reason || 'unexpected_brand_identity',
        evidence_excerpt: detection.surrounding_context || detection.detected_text,
        confidence: detection.confidence,
        brand_reference_role: detection.brand_reference_role || 'unknown',
        source_supported: detection.source_supported === true,
        message: warning
          ? detection.brand_reference_role !== 'unauthorized_replacement'
            ? `检测到${detection.brand_reference_role || 'unknown'}关系引用“${detection.detected_text}”，未构成品牌替代。`
            : `疑似出现非项目品牌“${detection.detected_text}”，需人工复核。`
          : `检测到非项目品牌“${detection.detected_text}”。`,
        recommendation: `仅保留项目品牌“${expectedBrandName}”及有证据支持的品牌关系。`
      });
    }

    const missingBrand = (source.unexpected_brand_names || []).find((name) => name.startsWith('missing:'));
    if (missingBrand) {
      issues.push({
        code: 'BRAND_NAME_NOT_PRESERVED', severity: 'blocking', scope: 'direction',
        direction_id: source.direction_id, field_path: 'visualDirectionV2',
        detected_value: missingBrand, matched_rule: 'expected_brand_name_required',
        evidence_excerpt: `方向文本未包含项目品牌“${expectedBrandName}”`, confidence: 1,
        message: `方向未保留项目品牌“${expectedBrandName}”。`,
        recommendation: '在方向战略、品牌信息和执行示例中使用项目品牌身份。'
      });
    }
    if (source.reason === 'brand_role_reduced') {
      issues.push({
        code: 'BRAND_ROLE_REDUCED', severity: 'rewrite', scope: 'direction',
        direction_id: source.direction_id, field_path: 'visualDirectionV2',
        detected_value: `role_keyword_hits=${source.role_keyword_hits}`,
        matched_rule: 'brand_role_keyword_coverage',
        evidence_excerpt: `品牌角色关键词命中 ${source.role_keyword_hits}，要求至少 ${roleHitsRequired}`,
        confidence: 1,
        message: '品牌角色被弱化，但未检测到替代品牌名称。',
        recommendation: '恢复已验证的完整品牌角色，避免缩减为单一供应链、合规或物流职能。'
      });
    }
    if (source.reason === 'strategic_thesis_reduced') {
      issues.push({
        code: 'STRATEGIC_THESIS_REDUCED', severity: 'rewrite', scope: 'direction',
        direction_id: source.direction_id, field_path: 'visualDirectionV2.strategic_idea',
        detected_value: `thesis_keyword_hits=${source.thesis_keyword_hits}`,
        matched_rule: 'strategic_thesis_keyword_coverage',
        evidence_excerpt: `战略命题关键词命中 ${source.thesis_keyword_hits}，要求至少 ${thesisHitsRequired}`,
        confidence: 1, message: '战略命题被弱化。', recommendation: '恢复多维业务与品牌价值命题。'
      });
    }
    if (source.reason === 'industry_identity_simplified') {
      issues.push({
        code: 'INDUSTRY_IDENTITY_SIMPLIFIED', severity: 'rewrite', scope: 'direction',
        direction_id: source.direction_id, field_path: 'visualDirectionV2',
        matched_rule: 'single_function_industry_identity', confidence: 1,
        message: '行业身份被简化为单一职能。', recommendation: '恢复平台、产业生态、机构与消费者价值关系。'
      });
    }
  }

  return {
    evaluator_version: BRAND_IDENTITY_PRESERVATION_EVALUATOR_VERSION,
    brand_identity_preserved: brandIdentityPreserved,
    brand_name_preserved: brandNamePreserved,
    brand_role_preserved: rolePreserved,
    strategic_thesis_preserved: thesisPreserved,
    industry_identity_preserved: industryIdentityPreserved,
    contamination_detected: contaminationDetected,
    contamination_sources: contaminationSources,
    issues,
    blocking_reasons: blockingReasons,
    error_code: hasHardBlock ? 'UNEXPECTED_BRAND_IDENTITY' : undefined
  };
}
