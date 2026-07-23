// Anchor Candidate Prompt v2 (doc section 六).
//
// Produces an Anchor Candidate that is a reusable executable template, not a
// macro spatial concept. Combines one core graphic asset, one industry/photo
// object, one information module and one layout mechanism, and emits a concrete
// anchor_image_brief a designer can explore immediately.

export const ANCHOR_CANDIDATE_PROMPT_V2_VERSION = 'visual-direction-v2-anchor';

export function buildAnchorCandidateV2Prompt(context) {
  const reportLanguage = context.reportLanguage || 'zh-CN';
  return [{ role: 'system', content: `PROTOCOL_STAGE=05-anchor-candidate-v2
PROMPT_VERSION=${ANCHOR_CANDIDATE_PROMPT_V2_VERSION}
DIRECTION_GENERATION_MODE=execution_oriented_v2
Report language is ${reportLanguage}. Generate Anchor Candidates from the execution-ready v2 direction below. Each candidate is a mechanism that directly generates the first batch of brand executables — NOT a giant spatial installation.

For each candidate you MUST:
- execution_thesis: one sentence on what executable it produces.
- core_asset_combination: exactly 1 graphic_asset_id (must reference a core_reusable_asset), 1 industry_or_photo_object, 1 information_module, 1 layout_mechanism.
- primary_layout_template: subject_position, information_position, brand_position, whitespace_ratio (0-1), supporting_asset_position, landscape_adaptation, portrait_adaptation.
- industry_object_rule, photography_graphic_mix, information_hierarchy (>=3), composition_behavior, reusable_components (>=2), execution_examples (>=2).
- anchor_image_brief: image_purpose, subject, industry_object, graphic_overlay, info_whitespace, composition_visual_hierarchy, prohibited_content, expected_touchpoint.
- prohibited_drift (>=1), difference_from_other_candidates.

Anchor must stay execution-ready: never drift into architecture/pavilion/sculpture/real-estate as subject, never material+light-only premium, never cinematic concept-art-only.

Direction context: ${JSON.stringify(context.direction || {})}
Available reusable assets: ${JSON.stringify((context.direction?.core_reusable_assets || []).map((a) => a.asset_id))}

Return JSON only:
{"anchorCandidateV2Set":{"candidates":[{"anchor_id":"AC01","anchor_name":"...","execution_thesis":"...","core_asset_combination":{"graphic_asset_id":"A01","industry_or_photo_object":"...","information_module":"...","layout_mechanism":"..."},"primary_layout_template":{"subject_position":"...","information_position":"...","brand_position":"...","whitespace_ratio":0.3,"supporting_asset_position":"...","landscape_adaptation":"...","portrait_adaptation":"..."},"industry_object_rule":"...","photography_graphic_mix":"...","information_hierarchy":["..."],"composition_behavior":"...","reusable_components":["..."],"execution_examples":["..."],"anchor_image_brief":{"image_purpose":"...","subject":"...","industry_object":"...","graphic_overlay":"...","info_whitespace":"...","composition_visual_hierarchy":"...","prohibited_content":"...","expected_touchpoint":"poster"},"prohibited_drift":["..."],"difference_from_other_candidates":"..."}]}}
` }];
}
