// Brand Identity Preservation Gate (doc section 2 / 3).
//
// P0 — blocks the v2 pipeline when the model substitutes or shrinks the
// project brand. The "安迹" incident (a non-project brand name appearing in
// the report instead of 九州美学) is exactly this class of failure: the model
// hallucinated a different brand. We never trust source fixtures to contain the
// leak; instead we scan the generated output for any unexpected brand name.

import { collectDirectionText } from './direction-text-util.js';
import { BRAND_NAME_SUFFIX, BRAND_ROLE_KEYWORDS, STRATEGIC_THESIS_KEYWORDS, countKeywordHits } from './evaluator-keywords.js';

export const BRAND_IDENTITY_PRESERVATION_EVALUATOR_VERSION = 'brand-identity-preservation-evaluator-v1';

// Scan free text for brand names that are NOT the expected brand (or its known
// aliases) and for any explicitly-forbidden example brand names.
export function detectUnexpectedBrandNames({
  expectedBrandName,
  sourceText,
  knownExampleBrandNames = [],
  knownAliases = []
} = {}) {
  const allowlist = new Set([expectedBrandName, ...(knownAliases || [])].filter(Boolean));
  const denied = new Set(knownExampleBrandNames || []);
  const found = [];
  const text = String(sourceText || '');

  // 1) forbidden example brands (e.g. a demo brand that leaked into output).
  for (const name of denied) {
    if (name && text.includes(name) && !allowlist.has(name)) found.push(name);
  }

  // 2) brand-suffix tokens that are not the allowed project brand.
  const suffixMatches = text.match(BRAND_NAME_SUFFIX);
  if (suffixMatches) {
    for (const token of suffixMatches) {
      const cleaned = token.replace(BRAND_NAME_SUFFIX, '$1$2');
      if (!allowlist.has(cleaned) && !found.includes(cleaned)) found.push(cleaned);
    }
  }

  return {
    hasUnexpected: found.length > 0,
    found: Array.from(new Set(found)),
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
  knownAliases = []
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
    const detection = detectUnexpectedBrandNames({
      expectedBrandName,
      sourceText: text,
      knownExampleBrandNames,
      knownAliases
    });

    if (detection.hasUnexpected) {
      brandNamePreserved = false;
      contaminationSources.push({
        direction_id: direction.direction_id,
        unexpected_brand_names: detection.found
      });
      continue;
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
  const brandIdentityPreserved = !contaminationDetected && brandNamePreserved && rolePreserved && thesisPreserved && industryIdentityPreserved;

  const blockingReasons = [];
  if (!brandNamePreserved) blockingReasons.push('brand_name_not_preserved');
  if (!rolePreserved) blockingReasons.push('brand_role_reduced');
  if (!thesisPreserved) blockingReasons.push('strategic_thesis_reduced');
  if (!industryIdentityPreserved) blockingReasons.push('industry_identity_simplified');

  return {
    evaluator_version: BRAND_IDENTITY_PRESERVATION_EVALUATOR_VERSION,
    brand_identity_preserved: brandIdentityPreserved,
    brand_name_preserved: brandNamePreserved,
    brand_role_preserved: rolePreserved,
    strategic_thesis_preserved: thesisPreserved,
    industry_identity_preserved: industryIdentityPreserved,
    contamination_detected: contaminationDetected,
    contamination_sources: contaminationSources,
    blocking_reasons: blockingReasons,
    error_code: contaminationDetected ? 'UNEXPECTED_BRAND_IDENTITY' : undefined
  };
}
