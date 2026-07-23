export const sourceText = 'Jiuzhou Aesthetics is a B2B industry platform serving manufacturers and partner institutions. Consumers are auxiliary beneficiaries. The platform provides transparent fulfillment and long-term trust. Avoid unconfirmed certification marks.';

export const corpus = {
  documents: [{
    id: 'doc-1', filename: 'jiuzhou-brand.md', title: 'Jiuzhou Brand', sourceType: 'markdown',
    rawText: sourceText, sections: [{ heading: 'Positioning', content: sourceText }], characterCount: sourceText.length
  }],
  sourceIndex: [], mergedText: sourceText, warnings: []
};

export const audienceBoundary = Object.freeze({
  businessModel: 'b2b',
  businessModelEvidenceIds: ['VE002'],
  primaryAudience: [
    { label: 'manufacturers', evidenceIds: ['VE003'] },
    { label: 'partner institutions', evidenceIds: ['VE003'] }
  ],
  excludedAudience: [{ label: 'terminal consumers as core audience', reason: 'Consumers are auxiliary beneficiaries', evidenceIds: ['VE004'] }],
  consumerVisualPolicy: 'auxiliary_only',
  consumerVisualPolicyEvidenceIds: ['VE004']
});
const directEvidence = Object.freeze({ reason_basis: 'direct_evidence', evidence_confidence: 1 });
const derivedEvidence = Object.freeze({ reason_basis: 'derived_evidence', evidence_confidence: 0.85 });

export function evidenceOutput(chunkId) {
  const items = [
    ['identity', 'Jiuzhou Aesthetics is the brand', 'Jiuzhou Aesthetics', 'Sets asset ownership'],
    ['business-context', 'The business is a B2B industry platform', 'B2B industry platform', 'Keep the core visual business-facing'],
    ['audience', 'Primary audiences are manufacturers and partner institutions', 'manufacturers and partner institutions', 'Use B2B actors and touchpoints'],
    ['audience', 'Consumers are auxiliary beneficiaries', 'Consumers are auxiliary beneficiaries', 'Consumers cannot become the core subject'],
    ['capability', 'Transparent fulfillment is a core capability', 'transparent fulfillment', 'Show traceable system behavior'],
    ['relationship', 'Long-term trust defines the relationship', 'long-term trust', 'Prefer durable partner structures'],
    ['aesthetic-intent', 'Industry coordination should feel precise and calm', 'industry platform', 'Avoid consumer-care imagery'],
    ['prohibited', 'Unconfirmed certification marks are prohibited', 'Avoid unconfirmed certification marks', 'Do not generate official-looking marks']
  ];
  return { visualEvidenceMap: {
    identity: { projectName: 'Jiuzhou Aesthetics', brandName: 'Jiuzhou Aesthetics', status: 'confirmed', evidenceIds: ['VE001'] },
    evidence: items.map(([type, statement, shortestQuote, visualImpact], index) => ({ evidenceId: `VE${String(index + 1).padStart(3, '0')}`, sourceId: 'doc-1', chunkId, type, statement, status: 'confirmed', shortestQuote, visualImpact })),
    audienceBoundary,
    conflicts: [], missingInformation: [{ statement: 'Logo combination specification unavailable', evidenceIds: [] }], lockedAssets: [],
    suggestedAssets: [
      { assetId: 'SA001', name: 'Traceable fulfillment diagram', assetType: 'generic', status: 'derived', execution_scope: 'current_direction', requires_human_approval: false, restriction_reason: null, evidenceIds: ['VE005'], providedInSource: false, authorizedForGeneration: false, authorizationEvidenceIds: [], reason: 'Derived from a confirmed operating capability' },
      { assetId: 'SA002', name: 'Scannable compliance QR', assetType: 'scannable_qr', status: 'proposed', execution_scope: 'restricted', requires_human_approval: true, restriction_reason: 'missing_visual_asset_authorization', evidenceIds: ['VE008'], providedInSource: false, authorizedForGeneration: false, authorizationEvidenceIds: [], reason: 'A compliance fact does not authorize a QR asset' }
    ]
  } };
}

export function signalOpportunityOutput() {
  return {
    visualStrategySignalMap: { audienceBoundary, signals: [
      { type: 'capability', statement: 'Traceable nodes show transparent fulfillment', evidenceIds: ['VE005'], evidence_ids: ['VE005'], ...directEvidence, importance: 'primary', visualPotential: 'high' },
      { type: 'capability', statement: 'Verified transitions express dependable delivery', evidenceIds: ['VE005'], evidence_ids: ['VE005'], ...derivedEvidence, importance: 'secondary', visualPotential: 'high' },
      { type: 'relationship', statement: 'Partner structures express long-term trust', evidenceIds: ['VE006'], evidence_ids: ['VE006'], ...directEvidence, importance: 'primary', visualPotential: 'high' },
      { type: 'emotion', statement: 'Calm confidence replaces consumer-care emotion', evidenceIds: ['VE006'], evidence_ids: ['VE006'], ...derivedEvidence, importance: 'secondary', visualPotential: 'medium' },
      { type: 'culture', statement: 'Long-term responsibility stays restrained', evidenceIds: ['VE006'], evidence_ids: ['VE006'], ...derivedEvidence, importance: 'secondary', visualPotential: 'medium' },
      { type: 'aesthetic-tension', statement: 'System precision meets human cooperation', evidenceIds: ['VE007'], evidence_ids: ['VE007'], ...derivedEvidence, importance: 'primary', visualPotential: 'high' },
      { type: 'audience-boundary', statement: 'Manufacturers and institutions remain core; consumers stay auxiliary', evidenceIds: ['VE002', 'VE003', 'VE004'], evidence_ids: ['VE002', 'VE003', 'VE004'], ...directEvidence, importance: 'primary', visualPotential: 'high' }
    ] },
    visualOpportunityMap: {
      audienceBoundary,
      visualizableFacts: [{ statement: 'Verified handoffs between business partners', rationale: 'Turns transparent fulfillment into visible system behavior', evidenceIds: ['VE005'], evidence_ids: ['VE005'], ...directEvidence, brandability: 'high' }],
      metaphors: [{ statement: 'A chain of accountable handoffs', rationale: 'Links capability and long-term trust', evidenceIds: ['VE005', 'VE006'], evidence_ids: ['VE005', 'VE006'], ...derivedEvidence, brandability: 'high' }],
      aestheticTensions: [{ statement: 'Precise structure with cooperative openness', rationale: 'Balances platform rigor and partnership', evidenceIds: ['VE006', 'VE007'], evidence_ids: ['VE006', 'VE007'], ...derivedEvidence, brandability: 'high' }],
      categoryCliches: [
        { pattern: 'generic tech blue', risk: 'Looks like an interchangeable technology vendor', allowedWhen: 'A documented interface state requires it', prohibitedWhen: 'It is only a category cue' },
        { pattern: 'medical certification badge', risk: 'Invents or overstates authority', allowedWhen: 'A supplied and authorized asset exists', prohibitedWhen: 'Only a compliance fact exists' }
      ]
    }
  };
}

function baseDirection(overrides) {
  return {
    name: 'Direction', oneSentenceConcept: 'A business platform becomes a distinct visual operating principle',
    strategicSignals: ['VS01', 'VS03', 'VS07'], evidenceIds: ['VE002', 'VE005', 'VE006'], evidence_ids: ['VE002', 'VE005', 'VE006'], ...directEvidence,
    coreMetaphor: 'Accountable handoff chain', distinctiveMechanism: 'States lock only after a verified handoff',
    mechanismAssessment: { brandSpecificReason: 'It derives from transparent fulfillment and partner trust evidence', reasonBasis: 'brand_evidence', industryTemplateRisk: 'low', replacementMechanism: 'Use evidence-linked state transitions instead of generic glowing nodes' },
    graphicLanguage: ['state blocks', 'verified joins'], colorLogic: 'Carbon base with a restrained warm confirmation accent',
    materialLanguage: ['matte system layer', 'translucent verification layer'], lightingLanguage: 'Calm contrast between pending and verified states',
    compositionLanguage: 'Sequential progression across accountable nodes', emotionalRole: 'Confidence through verification', spatialBehavior: 'Linear accumulation',
    subjectPolicy: { people: 'Business professionals may appear as supporting operators', peopleRole: 'industry_expert', products: 'Products appear only as industry-system evidence', productRole: 'platform_capability', environment: 'Partner operations and platform contexts', environmentRole: 'platform' },
    suitableApplications: [{ name: 'Partner presentation', audience: 'b2b', role: 'core' }, { name: 'Service architecture', audience: 'b2b', role: 'core' }],
    executableAssetIds: ['SA001'], deferredToAnchor: ['specific_shot', 'specific_person_action', 'precise_lighting_camera', 'full_product_staging', 'single_anchor_scene'],
    brandFit: 94, inspirationValue: 91, distinctiveness: 93, scalability: 90, categoryClicheRisk: 'low', risks: ['Do not reduce the mechanism to a generic network diagram'],
    ...overrides
  };
}

export function directionsOutput() {
  return { visualCreativeDirections: { audienceBoundary, directions: [
    baseDirection({ name: 'Verified Handoffs' }),
    baseDirection({
      name: 'Partner Field', coreMetaphor: 'A field of reciprocal support', distinctiveMechanism: 'Independent partner fields overlap without losing boundaries',
      graphicLanguage: ['bounded fields', 'reciprocal gaps'], colorLogic: 'Warm mineral neutrals with a dark structural line', materialLanguage: ['woven fiber', 'soft ceramic'],
      lightingLanguage: 'Broad ambient separation', compositionLanguage: 'Balanced distributed clusters', emotionalRole: 'Mutual assurance', spatialBehavior: 'Radial reciprocity',
      subjectPolicy: { people: 'Partner teams remain secondary evidence', peopleRole: 'partner_team', products: 'Industry products remain contextual', productRole: 'industry_product', environment: 'Partner business settings', environmentRole: 'partner_business' },
      suitableApplications: [{ name: 'Partner ecosystem map', audience: 'b2b', role: 'core' }, { name: 'Institution onboarding', audience: 'b2b', role: 'core' }],
      brandFit: 89, inspirationValue: 90, distinctiveness: 88, scalability: 86, categoryClicheRisk: 'medium'
    }),
    baseDirection({
      name: 'Audit Rhythm', coreMetaphor: 'A measured rhythm of responsibility', distinctiveMechanism: 'Evidence density creates a cadence of accountable intervals',
      graphicLanguage: ['audit marks', 'measured intervals'], colorLogic: 'Paper white, charcoal and one vermilion checkpoint', materialLanguage: ['dense paper', 'etched metal'],
      lightingLanguage: 'Even documentary clarity', compositionLanguage: 'Asymmetric columns with measured intervals', emotionalRole: 'Disciplined accountability', spatialBehavior: 'Vertical cadence',
      subjectPolicy: { people: 'No complete people are required', peopleRole: 'none', products: 'Batch relations appear as system records', productRole: 'platform_capability', environment: 'Abstract documentation space', environmentRole: 'abstract' },
      suitableApplications: [{ name: 'B2B report system', audience: 'b2b', role: 'core' }, { name: 'Operational dashboard', audience: 'internal', role: 'core' }],
      brandFit: 90, inspirationValue: 85, distinctiveness: 92, scalability: 88
    })
  ], differenceMatrix: semanticDifferenceMatrix() } };
}

export function semanticDifferenceMatrix() {
  const scores = (directionPair) => directionPair === 'D01/D03' ? [2, 1, 1, 1, 1, 1] : [2, 2, 2, 2, 1, 2];
  const dimensions = (prefix) => [
    ['core_metaphor', `${prefix} uses a different strategic metaphor`],
    ['graphic_mechanism', `${prefix} uses a different graphic cause-and-effect mechanism`],
    ['composition_logic', `${prefix} organizes information through a different composition logic`],
    ['material_family', `${prefix} uses a clearly different material family`],
    ['emotional_role', `${prefix} shares confidence but gives it a different emotional role`],
    ['spatial_behavior', `${prefix} moves through space in a different way`]
  ].map(([name, reason], index) => ({ name, score: scores(prefix)[index], reason }));
  return { pairs: ['D01/D02', 'D01/D03', 'D02/D03'].map((direction_pair) => {
    const total_score = scores(direction_pair).reduce((sum, score) => sum + score, 0);
    return {
      direction_pair,
      shared_visual_traits: direction_pair === 'D01/D03'
        ? ['grid-based structure', 'engineering material family', 'shallow 3D layering']
        : ['restrained information density'],
      dimensions: dimensions(direction_pair), total_score, max_score: 12,
      status: total_score <= 8 ? 'needs_strengthening' : 'pass',
      full_difference_review_required: false, review_result: null
    };
  }) };
}

export function mockReasoner() {
  const calls = [];
  return { calls, reasoner: async (messages) => {
    const content = messages.map((message) => message.content).join('\n');
    const stage = content.match(/PROTOCOL_STAGE=([^\n]+)/)?.[1];
    calls.push({ stage, content });
    const chunkId = content.match(/"chunkId":"([^"]+)"/)?.[1];
    const output = stage === '01-visual-evidence' ? evidenceOutput(chunkId) : stage === '02-visual-signal-opportunity' ? signalOpportunityOutput() : directionsOutput();
    return { provider: 'mock', model: 'mock-visual-model', text: JSON.stringify(output), finishReason: 'stop', usage: { inputTokens: 120, outputTokens: 80 } };
  } };
}
