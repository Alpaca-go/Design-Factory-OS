export const VISUAL_SIGNAL_OPPORTUNITY_PROMPT_VERSION = 'visual-signal-opportunity-prompt-v1.2';

export function buildVisualSignalOpportunityPrompt(evidenceMap) {
  return [{ role: 'system', content: `PROTOCOL_STAGE=02-visual-signal-opportunity
PROMPT_VERSION=${VISUAL_SIGNAL_OPPORTUNITY_PROMPT_VERSION}
Compress Visual Evidence into visual strategy signals and opportunity areas. Do not create final directions. Copy audienceBoundary exactly and include 1–3 audience-boundary signals. Required signal types (capability, relationship, audience-boundary) require 1–3 items each. Optional types (emotion, culture, aesthetic-tension) may have 0–3 items each, but together they must provide at least 1 item. Total signal count is 5–12.

Report language is ${evidenceMap.reportLanguage}. Use that language for every statement, rationale and category-cliché explanation. Every Signal and Opportunity must include reason_basis, evidence_confidence and evidence_ids. Confidence is fixed: direct_evidence=1.00, derived_evidence=0.85, inference=0.65.

For B2B projects, opportunities must keep consumers auxiliary, exclude consumer advertising/social-seeding touchpoints as core opportunities, and must not reinterpret an industry platform as a medical-aesthetic service, skincare product or consumer brand.

Category clichés must explicitly state when they are causally justified and when they are empty decoration. Pay special attention to medical coats, formulas, medical shields, female-face closeups, tech blue, glowing nodes, particles, glass spheres, and automatic waterdrop/plant/stone combinations.

Visual Evidence: ${JSON.stringify(evidenceMap)}

Return JSON only:
{"visualStrategySignalMap":{"audienceBoundary":${JSON.stringify(evidenceMap.audienceBoundary)},"signals":[{"type":"capability|relationship|emotion|culture|aesthetic-tension|audience-boundary","statement":"string","evidenceIds":["VE001"],"evidence_ids":["VE001"],"reason_basis":"direct_evidence|derived_evidence|inference","evidence_confidence":1,"importance":"primary|secondary|supporting","visualPotential":"high|medium|low"}]},"visualOpportunityMap":{"audienceBoundary":${JSON.stringify(evidenceMap.audienceBoundary)},"visualizableFacts":[{"statement":"string","rationale":"string","evidenceIds":["VE001"],"evidence_ids":["VE001"],"reason_basis":"direct_evidence|derived_evidence|inference","evidence_confidence":1,"brandability":"high|medium|low"}],"metaphors":[{"statement":"string","rationale":"string","evidenceIds":["VE001"],"evidence_ids":["VE001"],"reason_basis":"direct_evidence|derived_evidence|inference","evidence_confidence":1,"brandability":"high|medium|low"}],"aestheticTensions":[{"statement":"string","rationale":"string","evidenceIds":["VE001"],"evidence_ids":["VE001"],"reason_basis":"direct_evidence|derived_evidence|inference","evidence_confidence":1,"brandability":"high|medium|low"}],"categoryCliches":[{"pattern":"string","risk":"string","allowedWhen":"string","prohibitedWhen":"string"}]}}` }];
}
