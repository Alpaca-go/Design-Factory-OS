export const EVIDENCE_STATUSES = Object.freeze([
  'confirmed',
  'inferred',
  'suggested',
  'conflicting',
  'missing'
]);

export const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low']);

const STATUS_LABELS = Object.freeze({
  confirmed: '已确认',
  inferred: '合理推断',
  suggested: '建议',
  conflicting: '内容冲突',
  missing: '信息缺失'
});

export function evidenceStatusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.missing;
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function reference(value) {
  if (!value || typeof value !== 'object') return null;
  const filename = text(value.filename);
  const documentId = text(value.documentId);
  if (!filename || !documentId) return null;
  return {
    documentId,
    filename,
    section: text(value.section) || undefined,
    page: Number.isInteger(value.page) && value.page > 0 ? value.page : undefined,
    excerpt: text(value.excerpt).slice(0, 240) || undefined
  };
}

export function normalizeBrandFact(value, fallbackValue = '暂未确认') {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { value: typeof value === 'string' ? value : fallbackValue };
  const factValue = typeof source.value === 'string'
    ? text(source.value, fallbackValue)
    : Array.isArray(source.value) ? source.value.map((item) => text(item)).filter(Boolean).join('、') : fallbackValue;
  const status = EVIDENCE_STATUSES.includes(source.status)
    ? source.status
    : (factValue === fallbackValue ? 'missing' : 'inferred');
  const confidence = CONFIDENCE_LEVELS.includes(source.confidence)
    ? source.confidence
    : (status === 'confirmed' ? 'high' : 'low');
  return {
    value: factValue,
    status,
    confidence,
    evidence: Array.isArray(source.evidence) ? source.evidence.map(reference).filter(Boolean) : [],
    evidenceIds: stringList(source.evidenceIds),
    note: text(source.note) || undefined
  };
}

function factList(value) {
  return Array.isArray(value) ? value.map((item) => normalizeBrandFact(item)).filter((item) => item.value) : [];
}

function stringList(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function directionList(value) {
  return Array.isArray(value) ? value.map((item) => {
    if (typeof item === 'string') return { direction: item, rationale: '', actions: [] };
    return {
      direction: text(item?.direction || item?.statement),
      rationale: text(item?.rationale),
      actions: stringList(item?.actions)
    };
  }).filter((item) => item.direction) : [];
}

function generationTasks(value) {
  return Array.isArray(value) ? value.slice(0, 8).map((item, index) => ({
    id: text(item?.id, `task-${index + 1}`),
    sequence: Number.isInteger(item?.sequence) ? item.sequence : index + 1,
    title: text(item?.title, `生图任务 ${index + 1}`),
    role: text(item?.role, index === 0 ? 'anchor-image' : 'application-scene'),
    objective: text(item?.objective),
    brandDnaBasis: stringList(item?.brandDnaBasis),
    viewerTakeaway: text(item?.viewerTakeaway),
    subject: text(item?.subject),
    environment: text(item?.environment),
    narrativeMoment: text(item?.narrativeMoment),
    requiredElements: stringList(item?.requiredElements),
    optionalElements: stringList(item?.optionalElements),
    prohibitedElements: stringList(item?.prohibitedElements),
    composition: text(item?.composition),
    focalHierarchy: text(item?.focalHierarchy),
    cameraAndPerspective: text(item?.cameraAndPerspective),
    colorDirection: text(item?.colorDirection || item?.colorAndLighting),
    colorAndLighting: text(item?.colorAndLighting || item?.colorDirection),
    materialAndTexture: text(item?.materialAndTexture),
    lighting: text(item?.lighting || item?.colorAndLighting),
    atmosphere: text(item?.atmosphere),
    lockedAssetInstructions: stringList(item?.lockedAssetInstructions),
    textPolicy: text(item?.textPolicy),
    allowedText: stringList(item?.allowedText),
    logoPolicy: text(item?.logoPolicy),
    consistencyWithGlobalSystem: stringList(item?.consistencyWithGlobalSystem),
    consistencyWithPreviousTasks: stringList(item?.consistencyWithPreviousTasks),
    intentionalDifferenceFromPreviousTasks: stringList(item?.intentionalDifferenceFromPreviousTasks),
    aspectRatio: text(item?.aspectRatio),
    outputResponsibility: text(item?.outputResponsibility || item?.objective),
    finalPrompt: text(item?.finalPrompt || item?.prompt),
    prompt: text(item?.prompt || item?.finalPrompt)
  })).filter((item) => item.objective && item.finalPrompt) : [];
}

export function normalizeBrandDna(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Brand DNA 输出必须是 JSON 对象');
  }
  const audience = value.audience || {};
  const strategy = value.strategy || {};
  const personality = value.personality || {};
  const culture = value.culture || {};
  const boundaries = value.boundaries || {};
  const diagnosis = value.diagnosis || {};
  const creative = value.creativeTranslation || {};
  return {
    projectName: normalizeBrandFact(value.projectName, '暂未确认'),
    brandName: normalizeBrandFact(value.brandName, '暂未确认'),
    category: normalizeBrandFact(value.category, '暂未确认'),
    businessModel: normalizeBrandFact(value.businessModel, '暂未确认'),
    developmentStage: normalizeBrandFact(value.developmentStage, '暂未确认'),
    audience: {
      primary: factList(audience.primary),
      secondary: factList(audience.secondary),
      needs: factList(audience.needs),
      barriers: factList(audience.barriers),
      usageScenarios: factList(audience.usageScenarios)
    },
    strategy: {
      purpose: normalizeBrandFact(strategy.purpose),
      positioning: normalizeBrandFact(strategy.positioning),
      brandPromise: normalizeBrandFact(strategy.brandPromise),
      differentiators: factList(strategy.differentiators),
      valueProposition: factList(strategy.valueProposition),
      brandValues: factList(strategy.brandValues)
    },
    personality: {
      traits: factList(personality.traits),
      relationshipRole: normalizeBrandFact(personality.relationshipRole),
      toneOfVoice: factList(personality.toneOfVoice),
      emotionalOutcome: factList(personality.emotionalOutcome)
    },
    culture: {
      culturalContext: factList(culture.culturalContext),
      symbolicAssets: factList(culture.symbolicAssets),
      narrativeThemes: factList(culture.narrativeThemes)
    },
    boundaries: {
      prohibitedClaims: factList(boundaries.prohibitedClaims),
      prohibitedStyles: factList(boundaries.prohibitedStyles),
      complianceRisks: factList(boundaries.complianceRisks)
    },
    genes: Array.isArray(value.genes) ? value.genes.map((gene) => ({
      id: text(gene?.id),
      type: text(gene?.type),
      statement: text(gene?.statement),
      culturalMaturity: ['embedded', 'declared', 'aspirational'].includes(gene?.culturalMaturity)
        ? gene.culturalMaturity
        : null,
      evidence: Array.isArray(gene?.evidence) ? gene.evidence.map(reference).filter(Boolean) : [],
      evidenceIds: stringList(gene?.evidenceIds),
      relationships: stringList(gene?.relationships),
      brandDecisionImpact: stringList(gene?.brandDecisionImpact),
      visualDecisionImpact: stringList(gene?.visualDecisionImpact),
      mustNotBeMisreadAs: stringList(gene?.mustNotBeMisreadAs),
      confidence: CONFIDENCE_LEVELS.includes(gene?.confidence) ? gene.confidence : 'low'
    })).filter((gene) => gene.type && gene.statement) : [],
    oneSentenceDna: text(value.oneSentenceDna),
    diagnosis: {
      conflicts: stringList(diagnosis.conflicts),
      missingInformation: stringList(diagnosis.missingInformation),
      genericStatements: stringList(diagnosis.genericStatements),
      strategicRisks: stringList(diagnosis.strategicRisks)
    },
    creativeTranslation: {
      creativeThesis: text(creative.creativeThesis),
      visualPersonality: stringList(creative.visualPersonality),
      visualKeywords: stringList(creative.visualKeywords),
      emotionalTemperature: stringList(creative.emotionalTemperature),
      colorDirection: directionList(creative.colorDirection),
      typographyDirection: directionList(creative.typographyDirection),
      graphicDirection: directionList(creative.graphicDirection),
      compositionDirection: directionList(creative.compositionDirection),
      photographyDirection: directionList(creative.photographyDirection),
      illustrationDirection: directionList(creative.illustrationDirection),
      materialDirection: directionList(creative.materialDirection),
      lightingDirection: directionList(creative.lightingDirection),
      motionDirection: directionList(creative.motionDirection),
      suggestedAssets: stringList(creative.suggestedAssets),
      distinctiveAssetCandidates: Array.isArray(creative.distinctiveAssetCandidates)
        ? creative.distinctiveAssetCandidates.map((item) => ({
            name: text(item?.name),
            sourceBasis: stringList(item?.sourceBasis),
            mechanism: text(item?.mechanism),
            genericRisk: ['low', 'medium', 'high'].includes(item?.genericRisk) ? item.genericRisk : 'high'
          })).filter((item) => item.name && item.mechanism)
        : [],
      avoidDirections: stringList(creative.avoidDirections),
      generationPlan: generationTasks(creative.generationPlan),
      mappings: Array.isArray(creative.mappings) ? creative.mappings : []
    },
    imageSystem: value.imageSystem && typeof value.imageSystem === 'object' ? value.imageSystem : null
  };
}

function allFacts(dna) {
  return [
    dna.projectName, dna.brandName, dna.category, dna.businessModel, dna.developmentStage,
    ...Object.values(dna.audience).flat(),
    dna.strategy.purpose, dna.strategy.positioning, dna.strategy.brandPromise,
    ...dna.strategy.differentiators, ...dna.strategy.valueProposition, ...dna.strategy.brandValues,
    ...dna.personality.traits, dna.personality.relationshipRole,
    ...dna.personality.toneOfVoice, ...dna.personality.emotionalOutcome,
    ...dna.culture.culturalContext, ...dna.culture.symbolicAssets, ...dna.culture.narrativeThemes,
    ...dna.boundaries.prohibitedClaims, ...dna.boundaries.prohibitedStyles, ...dna.boundaries.complianceRisks
  ];
}

export function validateBrandDna(value, options = {}) {
  const dna = normalizeBrandDna(value);
  const missing = [];
  if (!dna.projectName.value) missing.push('projectName');
  if (!dna.category.value) missing.push('category');
  if (!dna.strategy.positioning.value) missing.push('strategy.positioning');
  if (!dna.audience.primary.length) missing.push('audience.primary');
  if (dna.genes.length < 5) missing.push('genes');
  if (!dna.oneSentenceDna) missing.push('oneSentenceDna');
  if (!dna.creativeTranslation.creativeThesis) missing.push('creativeTranslation.creativeThesis');
  if (!dna.creativeTranslation.generationPlan.length) missing.push('creativeTranslation.generationPlan');
  if (options.requireEvidenceIds) {
    const known = new Set(options.knownEvidenceIds || []);
    const unsupportedFacts = allFacts(dna).filter((fact) =>
      fact.status === 'confirmed'
      && (!fact.evidenceIds.length || fact.evidenceIds.some((id) => !known.has(id)))
    );
    const unsupportedGenes = dna.genes.filter((gene) =>
      !gene.evidenceIds.length || gene.evidenceIds.some((id) => !known.has(id))
    );
    if (unsupportedFacts.length || unsupportedGenes.length) missing.push('evidenceIds');
  }
  if (missing.length) throw new Error(`Brand DNA Schema 校验失败：缺少 ${missing.join('、')}`);
  return dna;
}
