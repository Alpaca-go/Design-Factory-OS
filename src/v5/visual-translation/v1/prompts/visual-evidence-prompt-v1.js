export const VISUAL_EVIDENCE_PROMPT_VERSION = 'visual-evidence-prompt-v1.4';

export function buildVisualEvidencePrompt(prepared, lockedFacts = [], lockedAssets = []) {
  return [{ role: 'system', content: `PROTOCOL_STAGE=01-visual-evidence
PROMPT_VERSION=${VISUAL_EVIDENCE_PROMPT_VERSION}
Extract only evidence useful to Visual Translation. Do not rebuild brand strategy and do not create directions or image prompts. Quotes must be verbatim substrings of their source chunks (maximum 120 characters). Keep facts, inferences, suggestions, missing data and conflicts separate.

Use the source project's primary language for all narrative fields. Chinese source projects require Chinese statements, impacts, asset names and reasons.

Create one canonical audienceBoundary. Use unknown when the documents do not establish a field. For B2B, consumers may only be auxiliary or excluded. Do not infer a consumer brand from an industry platform.

Every suggested asset must declare status, execution_scope, requires_human_approval and restriction_reason. proposed never means executable. A new brand Logo that is not supplied and explicitly authorized must remain proposed with future_identity_design scope and human approval. Parent-brand Logo, parent/child lockup, group color, group graphic and group VI specifications must remain restricted unless the formal VI asset is supplied and explicitly authorized. The system may reserve an endorsement area or wait for group VI, but must not design an endorsement lockup automatically.

The following types are restricted unless the source both provides the visual asset and explicitly authorizes generation: certification_badge, qualification_certificate, official_seal, scannable_qr, real_serial_number, patent_mark, medical_approval_mark, logo_combination_spec, parent_brand_logo, parent_child_logo_lockup, parent_brand_color, parent_brand_graphic, parent_brand_vi_spec. A factual claim about certification, compliance or group affiliation is not visual-asset authorization.

Sources: ${JSON.stringify(prepared.sourceDocuments)}
Chunks: ${JSON.stringify(prepared.chunks)}
Locked Facts: ${JSON.stringify(lockedFacts)}
Locked Assets: ${JSON.stringify(lockedAssets)}

Return JSON only:
{"visualEvidenceMap":{"identity":{"projectName":"string","brandName":"string","status":"confirmed|reasonable-inference|suggested|missing|conflicting","evidenceIds":["VE001"]},"evidence":[{"evidenceId":"VE001","type":"identity|business-context|audience|brand-positioning|brand-promise|capability|relationship|emotion|culture|aesthetic-intent|visual-asset|application|constraint|prohibited|uncertainty","sourceId":"string","chunkId":"string","statement":"string","status":"confirmed|reasonable-inference|suggested|missing|conflicting","shortestQuote":"string","visualImpact":"string"}],"audienceBoundary":{"businessModel":"b2b|b2c|b2b2c|unknown","businessModelEvidenceIds":["VE001"],"primaryAudience":[{"label":"string","evidenceIds":["VE001"]}],"excludedAudience":[{"label":"string","reason":"string","evidenceIds":["VE001"]}],"consumerVisualPolicy":"core_allowed|auxiliary_only|excluded|unknown","consumerVisualPolicyEvidenceIds":["VE001"]},"conflicts":[{"statement":"string","evidenceIds":["VE001"]}],"missingInformation":[{"statement":"string","evidenceIds":[]}],"lockedAssets":["string"],"suggestedAssets":[{"assetId":"SA001","name":"string","assetType":"generic|brand_logo|parent_brand_logo|parent_child_logo_lockup|parent_brand_color|parent_brand_graphic|parent_brand_vi_spec|certification_badge|qualification_certificate|official_seal|scannable_qr|real_serial_number|patent_mark|medical_approval_mark|logo_combination_spec","status":"existing|derived|proposed|restricted","execution_scope":"current_direction|future_identity_design|future_asset_collection|restricted","requires_human_approval":true,"restriction_reason":null,"evidenceIds":["VE001"],"providedInSource":false,"authorizedForGeneration":false,"authorizationEvidenceIds":[],"reason":"string"}]}}` }];
}
