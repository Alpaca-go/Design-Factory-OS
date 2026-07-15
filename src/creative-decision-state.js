import crypto from 'node:crypto';

export const CREATIVE_DECISION_STATE_SCHEMA_VERSION = '4.0.0';
export const CREATIVE_DECISION_CONTRACT_VERSION = '4.0.0';
export const CREATIVE_BRIEF_CONTRACT_VERSION = '4.0.0';

export const CREATIVE_BRIEF_SECTION_ORDER = Object.freeze([
  'creative-vision',
  'creative-strategy',
  'design-constraints',
  'brand-personality',
  'approved-brand-dna',
  'creative-principles',
  'must-keep',
  'can-explore',
  'photography-direction',
  'design-goal'
]);

export const CREATIVE_BRIEF_SECTION_BINDINGS = Object.freeze({
  'creative-vision': Object.freeze([{ path: 'strategy.creativeVision' }]),
  'creative-strategy': Object.freeze([
    { path: 'strategy.creativeFreedom.recommendation' },
    { path: 'strategy.creativeFreedom.effective' },
    { path: 'strategy.thesis' },
    { path: 'strategy.actions' }
  ]),
  'design-constraints': Object.freeze([
    { path: 'constraints.elementPolicies' },
    { path: 'constraints.forbiddenDirections' }
  ]),
  'brand-personality': Object.freeze([{ path: 'brand.personality' }]),
  'approved-brand-dna': Object.freeze([{ path: 'brand.approvedBrandDNA' }]),
  'creative-principles': Object.freeze([{ path: 'strategy.creativePrinciples' }]),
  'must-keep': Object.freeze([{
    path: 'constraints.elementPolicies', where: { classification: ['locked'] }
  }]),
  'can-explore': Object.freeze([{
    path: 'constraints.elementPolicies', where: { classification: ['evolve', 'flexible'] }
  }]),
  'photography-direction': Object.freeze([{ path: 'strategy.photographyDirection' }]),
  'design-goal': Object.freeze([{ path: 'strategy.designGoal' }])
});

export const CREATIVE_BRIEF_CONTENT_POLICY = Object.freeze({
  forbidEvidenceNarrative: true,
  forbidBenchmarkNarrative: true,
  forbidCompetitorNames: true,
  forbidInternalReasoning: true,
  requireActionableSentences: true,
  requireEffectiveFreedom: true,
  designerMaxCharacters: 3000,
  runtimeMaxCharacters: 1500,
  runtimePersistence: 'forbidden'
});

export const CREATIVE_BRIEF_AUDIENCE_PROFILES = Object.freeze([
  Object.freeze({ id: 'designer', persistence: 'official', output: '02-Creative-Brief.md' }),
  Object.freeze({ id: 'gpt-runtime', persistence: 'forbidden', output: null })
]);

export const BRAND_DNA_DIMENSION_IDS = Object.freeze([
  'logo', 'color', 'typography', 'composition', 'whitespace',
  'photography', 'materials', 'packaging', 'craft'
]);

export const CREATIVE_DECISION_STATE_CLASSIFICATIONS = Object.freeze([
  'locked', 'evolve', 'flexible'
]);

const TOP_LEVEL_KEYS = new Set([
  'meta', 'provenance', 'brand', 'strategy', 'constraints',
  'creativeBrief', 'decisionRecord', 'governance', 'extensions'
]);
const STATE_STATUSES = new Set(['draft', 'needs-input', 'approved']);
const DECISION_TEXT_STATUSES = new Set(['approved', 'pending', 'rejected']);
const APPROVAL_STATUSES = new Set(['draft', 'approved', 'rejected']);
const READINESS_VALUES = new Set(['not-ready', 'draft-ready', 'release-ready']);
const FREEDOM_MODES = new Set(['Conservative', 'Creative Evolution', 'Reimagine']);
const EFFECTIVE_FREEDOM_MODES = new Set([...FREEDOM_MODES, 'Custom']);
const FREEDOM_CONFIDENCE = new Set(['Low', 'Medium', 'High']);
const OVERRIDE_TYPES = new Set(['auto', 'named-mode', 'percentage']);
const EFFECTIVE_SOURCES = new Set(['ai', 'human-mode', 'human-percentage']);
const VERIFICATION_STATUSES = new Set(['verified', 'candidate', 'pending']);
const SOURCE_TYPES = new Set([
  'asset', 'project-config', 'human-input', 'benchmark', 'prior-review', 'project-brief'
]);
const CONFIDENTIALITY_VALUES = new Set(['public', 'project-private', 'restricted']);
const BRAND_ELEMENT_KINDS = new Set([
  'name', 'logo', 'color', 'typography', 'composition', 'whitespace',
  'photography', 'material', 'packaging', 'mascot', 'symbol', 'positioning', 'other'
]);
const FACTOR_TYPES = new Set([
  'original-intent', 'benchmark', 'brand-dna', 'current-visual-quality',
  'visual-assets', 'prior-review', 'current-trends'
]);
const UNRESOLVED_PHASES = new Set(['decision-approval', 'brief-release', 'image-execution']);
const CONFLICT_SEVERITIES = new Set(['warning', 'blocker']);
const CONFLICT_STATUSES = new Set(['open', 'resolved']);
const REASONING_RUN_KEYS = ['brandUnderstanding', 'industryBenchmark', 'creativeDecision'];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function namespaced(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/i.test(value);
}

function deepEqual(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (typeof value === 'string') return value.normalize('NFC');
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortCanonical(value[key])]));
}

export function canonicalStringify(value) {
  return JSON.stringify(sortCanonical(value));
}

export function calculateCreativeDecisionStateDigest(state) {
  const source = clone(state) || {};
  if (isObject(source.meta)) delete source.meta.stateDigest;
  return crypto.createHash('sha256').update(canonicalStringify(source)).digest('hex');
}

function defaultCreativeBrief(input = {}) {
  return {
    ...clone(input),
    contractVersion: CREATIVE_BRIEF_CONTRACT_VERSION,
    sectionOrder: [...CREATIVE_BRIEF_SECTION_ORDER],
    sectionBindings: clone(CREATIVE_BRIEF_SECTION_BINDINGS),
    contentPolicy: clone(CREATIVE_BRIEF_CONTENT_POLICY),
    audienceProfiles: clone(CREATIVE_BRIEF_AUDIENCE_PROFILES),
    extensions: clone(input.extensions || {})
  };
}

/**
 * Create the immutable v4 state envelope without inventing business decisions.
 * The caller must provide all Brand, Strategy, Constraints and approval data.
 */
export function createCreativeDecisionState(input = {}) {
  const createdAt = input.meta?.createdAt || new Date().toISOString();
  const state = {
    meta: {
      ...clone(input.meta || {}),
      schemaVersion: CREATIVE_DECISION_STATE_SCHEMA_VERSION,
      decisionContractVersion: CREATIVE_DECISION_CONTRACT_VERSION,
      decisionId: input.meta?.decisionId || crypto.randomUUID(),
      status: input.meta?.status || 'draft',
      createdAt
    },
    provenance: clone(input.provenance || {}),
    brand: clone(input.brand || {}),
    strategy: clone(input.strategy || {}),
    constraints: clone(input.constraints || {}),
    creativeBrief: defaultCreativeBrief(input.creativeBrief),
    decisionRecord: clone(input.decisionRecord || {}),
    governance: {
      ...clone(input.governance || {}),
      blockers: clone(input.governance?.blockers || []),
      warnings: clone(input.governance?.warnings || []),
      invariantChecks: clone(input.governance?.invariantChecks || []),
      readiness: input.governance?.readiness || 'not-ready',
      extensions: clone(input.governance?.extensions || {})
    },
    extensions: clone(input.extensions || {})
  };
  state.meta.stateDigest = calculateCreativeDecisionStateDigest(state);
  return state;
}

function addIssue(issues, path, code, message) {
  issues.push({ path, code, message });
}

function requireObject(value, path, issues) {
  if (!isObject(value)) {
    addIssue(issues, path, 'required_object', `${path} 必须是对象`);
    return false;
  }
  return true;
}

function requireArray(value, path, issues, options = {}) {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'required_array', `${path} 必须是数组`);
    return false;
  }
  if (options.nonEmpty && value.length === 0) {
    addIssue(issues, path, 'empty_array', `${path} 不能为空`);
    return false;
  }
  return true;
}

function requireString(value, path, issues) {
  if (!nonEmptyString(value)) {
    addIssue(issues, path, 'required_string', `${path} 必须是非空字符串`);
    return false;
  }
  return true;
}

function requireEnum(value, allowed, path, issues) {
  if (!allowed.has(value)) {
    addIssue(issues, path, 'invalid_enum', `${path} 的值不在允许范围内`);
    return false;
  }
  return true;
}

function requireNumber(value, path, issues, options = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addIssue(issues, path, 'required_number', `${path} 必须是有限数字`);
    return false;
  }
  if (options.min !== undefined && value < options.min) {
    addIssue(issues, path, 'number_below_minimum', `${path} 不能小于 ${options.min}`);
    return false;
  }
  if (options.max !== undefined && value > options.max) {
    addIssue(issues, path, 'number_above_maximum', `${path} 不能大于 ${options.max}`);
    return false;
  }
  return true;
}

function validateExtensions(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  for (const [key, extension] of Object.entries(value)) {
    const extensionPath = `${path}.${key}`;
    if (!namespaced(key)) {
      addIssue(issues, extensionPath, 'extension_key_not_namespaced', `${extensionPath} 必须使用 namespaced key`);
    }
    if (!requireObject(extension, extensionPath, issues)) continue;
    requireString(extension.version, `${extensionPath}.version`, issues);
    requireString(extension.owner, `${extensionPath}.owner`, issues);
    if (!nonEmptyString(extension.sourceRef) && !nonEmptyString(extension.generatedBy)) {
      addIssue(issues, extensionPath, 'extension_source_required', `${extensionPath} 必须包含 sourceRef 或 generatedBy`);
    }
    if (typeof extension.required !== 'boolean') {
      addIssue(issues, `${extensionPath}.required`, 'required_boolean', `${extensionPath}.required 必须是布尔值`);
    }
    requireString(extension.retentionPolicy, `${extensionPath}.retentionPolicy`, issues);
  }
}

function validateStringArray(value, path, issues, options = {}) {
  if (!requireArray(value, path, issues, options)) return;
  value.forEach((item, index) => requireString(item, `${path}[${index}]`, issues));
}

function validateRefArray(value, path, issues, allowedIds, options = {}) {
  if (!requireArray(value, path, issues, options)) return;
  const seen = new Set();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!requireString(item, itemPath, issues)) return;
    if (seen.has(item)) addIssue(issues, itemPath, 'duplicate_reference', `${itemPath} 重复引用 ${item}`);
    seen.add(item);
    if (allowedIds && !allowedIds.has(item)) {
      addIssue(issues, itemPath, 'unknown_reference', `${itemPath} 无法解析引用 ${item}`);
    }
  });
}

function validateDecisionText(value, path, issues, evidenceIds) {
  if (!requireObject(value, path, issues)) return;
  requireString(value.statement, `${path}.statement`, issues);
  requireEnum(value.status, DECISION_TEXT_STATUSES, `${path}.status`, issues);
  validateRefArray(value.evidenceRefs, `${path}.evidenceRefs`, issues, evidenceIds, { nonEmpty: true });
  requireNumber(value.displayOrder, `${path}.displayOrder`, issues, { min: 0 });
  if (value.extensions !== undefined) validateExtensions(value.extensions, `${path}.extensions`, issues);
}

function validateEvidenceIndex(value, issues) {
  const ids = new Set();
  if (!requireArray(value, 'provenance.evidenceIndex', issues, { nonEmpty: true })) return ids;
  value.forEach((item, index) => {
    const path = `provenance.evidenceIndex[${index}]`;
    if (!requireObject(item, path, issues)) return;
    if (requireString(item.evidenceId, `${path}.evidenceId`, issues)) {
      if (ids.has(item.evidenceId)) addIssue(issues, `${path}.evidenceId`, 'duplicate_id', `重复 evidenceId：${item.evidenceId}`);
      ids.add(item.evidenceId);
    }
    if (!SOURCE_TYPES.has(item.sourceType) && !namespaced(item.sourceType)) {
      addIssue(issues, `${path}.sourceType`, 'invalid_source_type', `${path}.sourceType 无效`);
    }
    requireString(item.sourceId, `${path}.sourceId`, issues);
    requireString(item.locator, `${path}.locator`, issues);
    requireString(item.summary, `${path}.summary`, issues);
    requireString(item.observedAt, `${path}.observedAt`, issues);
    requireString(item.sourceDigest, `${path}.sourceDigest`, issues);
    requireEnum(item.confidentiality, CONFIDENTIALITY_VALUES, `${path}.confidentiality`, issues);
    if (item.extensions !== undefined) validateExtensions(item.extensions, `${path}.extensions`, issues);
  });
  return ids;
}

function validateProvenance(value, issues) {
  if (!requireObject(value, 'provenance', issues)) return new Set();
  const digestKeys = ['assetManifest', 'projectContract', 'projectConfig', 'brandUnderstanding', 'industryBenchmark'];
  if (requireObject(value.inputDigests, 'provenance.inputDigests', issues)) {
    for (const key of digestKeys) requireString(value.inputDigests[key], `provenance.inputDigests.${key}`, issues);
  }
  if (requireObject(value.reasoningRuns, 'provenance.reasoningRuns', issues)) {
    const actual = Object.keys(value.reasoningRuns).sort();
    if (!deepEqual(actual, [...REASONING_RUN_KEYS].sort())) {
      addIssue(issues, 'provenance.reasoningRuns', 'reasoning_run_count', '必须且只能记录三个 Reasoning Run');
    }
    for (const key of REASONING_RUN_KEYS) {
      const run = value.reasoningRuns[key];
      const path = `provenance.reasoningRuns.${key}`;
      if (!requireObject(run, path, issues)) continue;
      requireString(run.runId, `${path}.runId`, issues);
      requireString(run.provider, `${path}.provider`, issues);
      requireString(run.model, `${path}.model`, issues);
      requireString(run.completedAt, `${path}.completedAt`, issues);
    }
  }
  requireString(value.reasoningContractDigest, 'provenance.reasoningContractDigest', issues);
  requireArray(value.sourceTimestamps, 'provenance.sourceTimestamps', issues, { nonEmpty: true });
  requireString(value.dataPolicyRef, 'provenance.dataPolicyRef', issues);
  return validateEvidenceIndex(value.evidenceIndex, issues);
}

function validateBrand(value, issues, evidenceIds) {
  const elementIds = new Set();
  if (!requireObject(value, 'brand', issues)) return elementIds;
  if (requireObject(value.context, 'brand.context', issues)) {
    for (const key of ['industry', 'category', 'projectType']) {
      requireString(value.context[key], `brand.context.${key}`, issues);
    }
  }
  validateDecisionText(value.originalIntent, 'brand.originalIntent', issues, evidenceIds);
  validateDecisionText(value.identity, 'brand.identity', issues, evidenceIds);
  validateDecisionText(value.positioning, 'brand.positioning', issues, evidenceIds);
  if (requireObject(value.personality, 'brand.personality', issues)) {
    requireString(value.personality.statement, 'brand.personality.statement', issues);
    validateStringArray(value.personality.desired, 'brand.personality.desired', issues, { nonEmpty: true });
    validateStringArray(value.personality.avoid, 'brand.personality.avoid', issues);
    validateRefArray(value.personality.evidenceRefs, 'brand.personality.evidenceRefs', issues, evidenceIds, { nonEmpty: true });
  }
  if (requireObject(value.currentVisualAssessment, 'brand.currentVisualAssessment', issues)) {
    requireString(value.currentVisualAssessment.summary, 'brand.currentVisualAssessment.summary', issues);
    requireString(value.currentVisualAssessment.maturity, 'brand.currentVisualAssessment.maturity', issues);
    validateStringArray(value.currentVisualAssessment.strengths, 'brand.currentVisualAssessment.strengths', issues);
    validateStringArray(value.currentVisualAssessment.weaknesses, 'brand.currentVisualAssessment.weaknesses', issues);
    validateStringArray(value.currentVisualAssessment.outdatedAreas, 'brand.currentVisualAssessment.outdatedAreas', issues);
    validateRefArray(value.currentVisualAssessment.evidenceRefs, 'brand.currentVisualAssessment.evidenceRefs', issues, evidenceIds, { nonEmpty: true });
  }
  if (requireArray(value.elements, 'brand.elements', issues, { nonEmpty: true })) {
    value.elements.forEach((item, index) => {
      const path = `brand.elements[${index}]`;
      if (!requireObject(item, path, issues)) return;
      if (requireString(item.elementId, `${path}.elementId`, issues)) {
        if (elementIds.has(item.elementId)) addIssue(issues, `${path}.elementId`, 'duplicate_id', `重复 elementId：${item.elementId}`);
        elementIds.add(item.elementId);
      }
      requireString(item.name, `${path}.name`, issues);
      if (!BRAND_ELEMENT_KINDS.has(item.kind) && !namespaced(item.kind)) {
        addIssue(issues, `${path}.kind`, 'invalid_brand_element_kind', `${path}.kind 无效`);
      }
      requireString(item.definition, `${path}.definition`, issues);
      requireEnum(item.verificationStatus, VERIFICATION_STATUSES, `${path}.verificationStatus`, issues);
      validateRefArray(item.evidenceRefs, `${path}.evidenceRefs`, issues, evidenceIds, { nonEmpty: true });
      if (item.extensions !== undefined) validateExtensions(item.extensions, `${path}.extensions`, issues);
    });
  }
  if (requireObject(value.approvedBrandDNA, 'brand.approvedBrandDNA', issues)) {
    requireEnum(value.approvedBrandDNA.status, new Set(['approved', 'needs-input']), 'brand.approvedBrandDNA.status', issues);
    if (requireObject(value.approvedBrandDNA.dimensions, 'brand.approvedBrandDNA.dimensions', issues)) {
      for (const [index, id] of BRAND_DNA_DIMENSION_IDS.entries()) {
        const dimension = value.approvedBrandDNA.dimensions[id];
        const path = `brand.approvedBrandDNA.dimensions.${id}`;
        if (!requireObject(dimension, path, issues)) continue;
        requireString(dimension.directive, `${path}.directive`, issues);
        validateRefArray(dimension.elementRefs, `${path}.elementRefs`, issues, elementIds, { nonEmpty: true });
        validateRefArray(dimension.evidenceRefs, `${path}.evidenceRefs`, issues, evidenceIds, { nonEmpty: true });
        requireEnum(dimension.status, new Set(['approved', 'pending']), `${path}.status`, issues);
        requireNumber(dimension.displayOrder, `${path}.displayOrder`, issues, { min: 0 });
        if (dimension.displayOrder !== index + 1) {
          addIssue(issues, `${path}.displayOrder`, 'dna_order', `${path}.displayOrder 必须为 ${index + 1}`);
        }
      }
    }
  }
  if (value.extensions !== undefined) validateExtensions(value.extensions, 'brand.extensions', issues);
  return elementIds;
}

function validateAuditCollection(value, path, idField, issues, evidenceIds) {
  const ids = new Set();
  if (!requireArray(value, path, issues)) return ids;
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!requireObject(item, itemPath, issues)) return;
    if (requireString(item[idField], `${itemPath}.${idField}`, issues)) {
      if (ids.has(item[idField])) addIssue(issues, `${itemPath}.${idField}`, 'duplicate_id', `重复 ${idField}：${item[idField]}`);
      ids.add(item[idField]);
    }
    requireString(item.statement, `${itemPath}.statement`, issues);
    validateRefArray(item.evidenceRefs, `${itemPath}.evidenceRefs`, issues, evidenceIds, { nonEmpty: true });
    requireNumber(item.displayOrder, `${itemPath}.displayOrder`, issues, { min: 0 });
  });
  return ids;
}

function validateDecisionRecord(value, issues, evidenceIds) {
  if (!requireObject(value, 'decisionRecord', issues)) return { rationaleIds: new Set() };
  requireString(value.statement, 'decisionRecord.statement', issues);
  const rationaleIds = validateAuditCollection(value.rationale, 'decisionRecord.rationale', 'rationaleId', issues, evidenceIds);
  validateAuditCollection(value.tradeoffs, 'decisionRecord.tradeoffs', 'tradeoffId', issues, evidenceIds);
  validateAuditCollection(value.rejectedDirections, 'decisionRecord.rejectedDirections', 'directionId', issues, evidenceIds);
  if (!requireObject(value.overrideAudit, 'decisionRecord.overrideAudit', issues)) {
    return { rationaleIds };
  }
  requireString(value.overrideAudit.summary, 'decisionRecord.overrideAudit.summary', issues);
  if (value.changeSummary !== undefined && value.changeSummary !== null) {
    requireString(value.changeSummary, 'decisionRecord.changeSummary', issues);
  }
  if (value.extensions !== undefined) validateExtensions(value.extensions, 'decisionRecord.extensions', issues);
  return { rationaleIds };
}

function validateFreedom(value, issues, evidenceIds) {
  if (!requireObject(value, 'strategy.creativeFreedom', issues)) return;
  const recommendation = value.recommendation;
  if (requireObject(recommendation, 'strategy.creativeFreedom.recommendation', issues)) {
    requireNumber(recommendation.freedom, 'strategy.creativeFreedom.recommendation.freedom', issues, { min: 0, max: 100 });
    requireEnum(recommendation.mode, FREEDOM_MODES, 'strategy.creativeFreedom.recommendation.mode', issues);
    requireEnum(recommendation.confidence, FREEDOM_CONFIDENCE, 'strategy.creativeFreedom.recommendation.confidence', issues);
    validateStringArray(recommendation.why, 'strategy.creativeFreedom.recommendation.why', issues, { nonEmpty: true });
    validateStringArray(recommendation.briefWhy, 'strategy.creativeFreedom.recommendation.briefWhy', issues, { nonEmpty: true });
  }
  if (requireArray(value.factors, 'strategy.creativeFreedom.factors', issues, { nonEmpty: true })) {
    const factorIds = new Set();
    value.factors.forEach((factor, index) => {
      const path = `strategy.creativeFreedom.factors[${index}]`;
      if (!requireObject(factor, path, issues)) return;
      if (requireString(factor.factorId, `${path}.factorId`, issues)) {
        if (factorIds.has(factor.factorId)) addIssue(issues, `${path}.factorId`, 'duplicate_id', `重复 factorId：${factor.factorId}`);
        factorIds.add(factor.factorId);
      }
      requireEnum(factor.factorType, FACTOR_TYPES, `${path}.factorType`, issues);
      requireString(factor.conclusion, `${path}.conclusion`, issues);
      validateRefArray(factor.evidenceRefs, `${path}.evidenceRefs`, issues, evidenceIds, { nonEmpty: true });
      requireNumber(factor.displayOrder, `${path}.displayOrder`, issues, { min: 0 });
    });
  }
  const override = value.humanOverride;
  if (requireObject(override, 'strategy.creativeFreedom.humanOverride', issues)) {
    requireEnum(override.type, OVERRIDE_TYPES, 'strategy.creativeFreedom.humanOverride.type', issues);
    if (override.type === 'named-mode') {
      requireEnum(override.mode, FREEDOM_MODES, 'strategy.creativeFreedom.humanOverride.mode', issues);
    }
    if (override.type === 'percentage') {
      requireNumber(override.percentage, 'strategy.creativeFreedom.humanOverride.percentage', issues, { min: 0, max: 100 });
    }
    if (override.type !== 'auto') {
      requireString(override.providedBy, 'strategy.creativeFreedom.humanOverride.providedBy', issues);
      requireString(override.providedAt, 'strategy.creativeFreedom.humanOverride.providedAt', issues);
      requireString(override.sourceRef, 'strategy.creativeFreedom.humanOverride.sourceRef', issues);
      if (nonEmptyString(override.sourceRef) && !evidenceIds.has(override.sourceRef)) {
        addIssue(issues, 'strategy.creativeFreedom.humanOverride.sourceRef', 'unknown_reference', 'Human Override sourceRef 无法解析');
      }
    }
  }
  const effective = value.effective;
  if (requireObject(effective, 'strategy.creativeFreedom.effective', issues)) {
    if (effective.freedom !== null) requireNumber(effective.freedom, 'strategy.creativeFreedom.effective.freedom', issues, { min: 0, max: 100 });
    requireEnum(effective.mode, EFFECTIVE_FREEDOM_MODES, 'strategy.creativeFreedom.effective.mode', issues);
    requireEnum(effective.source, EFFECTIVE_SOURCES, 'strategy.creativeFreedom.effective.source', issues);
    if (isObject(recommendation) && isObject(override)) {
      if (override.type === 'auto') {
        if (effective.source !== 'ai' || effective.mode !== recommendation.mode || effective.freedom !== recommendation.freedom) {
          addIssue(issues, 'strategy.creativeFreedom.effective', 'auto_override_mismatch', 'Auto 时 Effective 必须与 AI Recommendation 一致');
        }
      } else if (override.type === 'named-mode') {
        if (effective.source !== 'human-mode' || effective.mode !== override.mode) {
          addIssue(issues, 'strategy.creativeFreedom.effective', 'named_override_mismatch', 'Named Mode Override 未正确写入 Effective');
        }
      } else if (override.type === 'percentage') {
        if (effective.source !== 'human-percentage' || effective.freedom !== override.percentage || effective.mode !== 'Custom') {
          addIssue(issues, 'strategy.creativeFreedom.effective', 'percentage_override_mismatch', 'Percentage Override 未正确写入 Effective');
        }
      }
    }
  }
}

function validateStrategy(value, issues, evidenceIds, elementIds, rationaleIds) {
  const actionIds = new Set();
  const actions = [];
  if (!requireObject(value, 'strategy', issues)) return { actionIds, actions };
  validateFreedom(value.creativeFreedom, issues, evidenceIds);
  if (requireObject(value.creativeVision, 'strategy.creativeVision', issues)) {
    requireString(value.creativeVision.statement, 'strategy.creativeVision.statement', issues);
    requireString(value.creativeVision.direction, 'strategy.creativeVision.direction', issues);
  }
  requireString(value.thesis, 'strategy.thesis', issues);
  if (requireArray(value.actions, 'strategy.actions', issues, { nonEmpty: true })) {
    value.actions.forEach((action, index) => {
      const path = `strategy.actions[${index}]`;
      if (!requireObject(action, path, issues)) return;
      if (requireString(action.actionId, `${path}.actionId`, issues)) {
        if (actionIds.has(action.actionId)) addIssue(issues, `${path}.actionId`, 'duplicate_id', `重复 actionId：${action.actionId}`);
        actionIds.add(action.actionId);
      }
      requireEnum(action.actionType, new Set(CREATIVE_DECISION_STATE_CLASSIFICATIONS), `${path}.actionType`, issues);
      requireString(action.domain, `${path}.domain`, issues);
      validateRefArray(action.elementRefs, `${path}.elementRefs`, issues, elementIds, { nonEmpty: true });
      requireString(action.directive, `${path}.directive`, issues);
      requireString(action.transformationDepth, `${path}.transformationDepth`, issues);
      if (action.actionType === 'evolve') {
        requireArray(action.identityGuardRefs, `${path}.identityGuardRefs`, issues, { nonEmpty: true });
      } else if (action.identityGuardRefs !== undefined) {
        requireArray(action.identityGuardRefs, `${path}.identityGuardRefs`, issues);
      }
      validateRefArray(action.rationaleRefs, `${path}.rationaleRefs`, issues, rationaleIds, { nonEmpty: true });
      validateRefArray(action.evidenceRefs, `${path}.evidenceRefs`, issues, evidenceIds, { nonEmpty: true });
      requireNumber(action.displayOrder, `${path}.displayOrder`, issues, { min: 0 });
      if (action.extensions !== undefined) validateExtensions(action.extensions, `${path}.extensions`, issues);
      actions.push(action);
    });
  }
  if (requireArray(value.creativePrinciples, 'strategy.creativePrinciples', issues, { nonEmpty: true })) {
    const principleIds = new Set();
    value.creativePrinciples.forEach((principle, index) => {
      const path = `strategy.creativePrinciples[${index}]`;
      if (!requireObject(principle, path, issues)) return;
      if (requireString(principle.principleId, `${path}.principleId`, issues)) {
        if (principleIds.has(principle.principleId)) addIssue(issues, `${path}.principleId`, 'duplicate_id', `重复 principleId：${principle.principleId}`);
        principleIds.add(principle.principleId);
      }
      validateDecisionText(principle, path, issues, evidenceIds);
    });
  }
  if (requireObject(value.photographyDirection, 'strategy.photographyDirection', issues)) {
    for (const key of ['lighting', 'framing', 'depth', 'materials', 'atmosphere']) {
      requireString(value.photographyDirection[key], `strategy.photographyDirection.${key}`, issues);
    }
  }
  requireString(value.designGoal, 'strategy.designGoal', issues);
  if (requireObject(value.indexes, 'strategy.indexes', issues)) {
    const indexFields = {
      locked: 'lockedActionIds', evolve: 'evolveActionIds', flexible: 'flexibleActionIds'
    };
    for (const [classification, field] of Object.entries(indexFields)) {
      const expected = actions.filter((item) => item.actionType === classification).map((item) => item.actionId);
      validateRefArray(value.indexes[field], `strategy.indexes.${field}`, issues, actionIds);
      if (Array.isArray(value.indexes[field]) && !deepEqual(value.indexes[field], expected)) {
        addIssue(issues, `strategy.indexes.${field}`, 'action_index_mismatch', `${field} 必须与 Strategy Actions 完全一致`);
      }
    }
  }
  if (value.extensions !== undefined) validateExtensions(value.extensions, 'strategy.extensions', issues);
  return { actionIds, actions };
}

function validateIdentityGuardRefs(refs, path, issues, context) {
  if (!requireArray(refs, path, issues, { nonEmpty: true })) return;
  refs.forEach((ref, index) => {
    const refPath = `${path}[${index}]`;
    if (!requireString(ref, refPath, issues)) return;
    const isDna = ref.startsWith('brand.approvedBrandDNA.dimensions.')
      && BRAND_DNA_DIMENSION_IDS.includes(ref.split('.').at(-1));
    const isLockedPolicy = context.lockedPolicyIds.has(ref);
    const isLockedBrandElement = context.lockedElementIds.has(ref);
    if (!isDna && !isLockedPolicy && !isLockedBrandElement) {
      addIssue(issues, refPath, 'unknown_identity_guard', `${refPath} 不是可解析的品牌识别保护引用`);
    }
  });
}

function validateConstraints(value, issues, evidenceIds, elementIds, actionIds, actions, rationaleIds) {
  const policyIds = new Set();
  const policyByElement = new Map();
  const lockedPolicyIds = new Set();
  const lockedElementIds = new Set();
  if (!requireObject(value, 'constraints', issues)) return;
  if (requireArray(value.elementPolicies, 'constraints.elementPolicies', issues, { nonEmpty: true })) {
    value.elementPolicies.forEach((policy, index) => {
      const path = `constraints.elementPolicies[${index}]`;
      if (!requireObject(policy, path, issues)) return;
      if (requireString(policy.policyId, `${path}.policyId`, issues)) {
        if (policyIds.has(policy.policyId)) addIssue(issues, `${path}.policyId`, 'duplicate_id', `重复 policyId：${policy.policyId}`);
        policyIds.add(policy.policyId);
      }
      if (requireString(policy.elementRef, `${path}.elementRef`, issues)) {
        if (!elementIds.has(policy.elementRef)) addIssue(issues, `${path}.elementRef`, 'unknown_reference', `${path}.elementRef 无法解析`);
        if (policyByElement.has(policy.elementRef)) addIssue(issues, `${path}.elementRef`, 'duplicate_element_policy', `${policy.elementRef} 只能有一个 classification`);
        policyByElement.set(policy.elementRef, policy);
      }
      requireEnum(policy.classification, new Set(CREATIVE_DECISION_STATE_CLASSIFICATIONS), `${path}.classification`, issues);
      if (policy.classification === 'locked') {
        if (nonEmptyString(policy.policyId)) lockedPolicyIds.add(policy.policyId);
        if (nonEmptyString(policy.elementRef)) lockedElementIds.add(policy.elementRef);
      }
      requireString(policy.directive, `${path}.directive`, issues);
      requireString(policy.reasonRef, `${path}.reasonRef`, issues);
      if (nonEmptyString(policy.reasonRef) && !rationaleIds.has(policy.reasonRef)) {
        addIssue(issues, `${path}.reasonRef`, 'unknown_reference', `${path}.reasonRef 无法解析`);
      }
      validateRefArray(policy.evidenceRefs, `${path}.evidenceRefs`, issues, evidenceIds, { nonEmpty: true });
      requireNumber(policy.displayOrder, `${path}.displayOrder`, issues, { min: 0 });
      if (policy.extensions !== undefined) validateExtensions(policy.extensions, `${path}.extensions`, issues);
    });
    const guardContext = { lockedPolicyIds, lockedElementIds };
    value.elementPolicies.forEach((policy, index) => {
      if (policy?.classification === 'evolve') {
        validateIdentityGuardRefs(policy.identityGuardRefs, `constraints.elementPolicies[${index}].identityGuardRefs`, issues, guardContext);
      }
    });
    actions.forEach((action, index) => {
      for (const elementRef of action.elementRefs || []) {
        const policy = policyByElement.get(elementRef);
        if (!policy) {
          addIssue(issues, `strategy.actions[${index}].elementRefs`, 'missing_element_policy', `${elementRef} 缺少 Constraint Policy`);
        } else if (policy.classification !== action.actionType) {
          addIssue(issues, `strategy.actions[${index}].actionType`, 'classification_mismatch', `Strategy Action 与 ${elementRef} 的 Constraint classification 不一致`);
        }
      }
      if (action.actionType === 'evolve') {
        validateIdentityGuardRefs(action.identityGuardRefs, `strategy.actions[${index}].identityGuardRefs`, issues, guardContext);
      }
    });
    for (const elementId of elementIds) {
      if (!policyByElement.has(elementId)) {
        addIssue(issues, 'constraints.elementPolicies', 'missing_element_policy', `${elementId} 缺少 Constraint Policy`);
      }
    }
  }
  if (requireArray(value.forbiddenDirections, 'constraints.forbiddenDirections', issues)) {
    const ruleIds = new Set();
    const allowedRefs = new Set([...elementIds, ...actionIds, 'project']);
    value.forbiddenDirections.forEach((rule, index) => {
      const path = `constraints.forbiddenDirections[${index}]`;
      if (!requireObject(rule, path, issues)) return;
      if (requireString(rule.ruleId, `${path}.ruleId`, issues)) {
        if (ruleIds.has(rule.ruleId)) addIssue(issues, `${path}.ruleId`, 'duplicate_id', `重复 ruleId：${rule.ruleId}`);
        ruleIds.add(rule.ruleId);
      }
      requireString(rule.statement, `${path}.statement`, issues);
      validateRefArray(rule.appliesToRefs, `${path}.appliesToRefs`, issues, allowedRefs, { nonEmpty: true });
      requireString(rule.rationaleRef, `${path}.rationaleRef`, issues);
      if (nonEmptyString(rule.rationaleRef) && !rationaleIds.has(rule.rationaleRef)) {
        addIssue(issues, `${path}.rationaleRef`, 'unknown_reference', `${path}.rationaleRef 无法解析`);
      }
      validateRefArray(rule.evidenceRefs, `${path}.evidenceRefs`, issues, evidenceIds, { nonEmpty: true });
      requireNumber(rule.displayOrder, `${path}.displayOrder`, issues, { min: 0 });
      if (rule.extensions !== undefined) validateExtensions(rule.extensions, `${path}.extensions`, issues);
    });
  }
  if (requireArray(value.unresolved, 'constraints.unresolved', issues)) {
    const unresolvedIds = new Set();
    value.unresolved.forEach((item, index) => {
      const path = `constraints.unresolved[${index}]`;
      if (!requireObject(item, path, issues)) return;
      if (requireString(item.unresolvedId, `${path}.unresolvedId`, issues)) {
        if (unresolvedIds.has(item.unresolvedId)) addIssue(issues, `${path}.unresolvedId`, 'duplicate_id', `重复 unresolvedId：${item.unresolvedId}`);
        unresolvedIds.add(item.unresolvedId);
      }
      requireString(item.question, `${path}.question`, issues);
      validateStringArray(item.affectedRefs, `${path}.affectedRefs`, issues, { nonEmpty: true });
      if (typeof item.isBlocking !== 'boolean') addIssue(issues, `${path}.isBlocking`, 'required_boolean', `${path}.isBlocking 必须是布尔值`);
      requireString(item.owner, `${path}.owner`, issues);
      requireEnum(item.requiredBefore, UNRESOLVED_PHASES, `${path}.requiredBefore`, issues);
      validateRefArray(item.evidenceRefs, `${path}.evidenceRefs`, issues, evidenceIds, { nonEmpty: true });
    });
  }
  if (requireArray(value.conflicts, 'constraints.conflicts', issues)) {
    const conflictIds = new Set();
    value.conflicts.forEach((item, index) => {
      const path = `constraints.conflicts[${index}]`;
      if (!requireObject(item, path, issues)) return;
      if (requireString(item.conflictId, `${path}.conflictId`, issues)) {
        if (conflictIds.has(item.conflictId)) addIssue(issues, `${path}.conflictId`, 'duplicate_id', `重复 conflictId：${item.conflictId}`);
        conflictIds.add(item.conflictId);
      }
      requireString(item.leftRef, `${path}.leftRef`, issues);
      requireString(item.rightRef, `${path}.rightRef`, issues);
      requireString(item.description, `${path}.description`, issues);
      requireEnum(item.severity, CONFLICT_SEVERITIES, `${path}.severity`, issues);
      requireEnum(item.resolutionStatus, CONFLICT_STATUSES, `${path}.resolutionStatus`, issues);
      if (item.resolutionStatus === 'resolved') requireString(item.resolutionRef, `${path}.resolutionRef`, issues);
      validateRefArray(item.evidenceRefs, `${path}.evidenceRefs`, issues, evidenceIds, { nonEmpty: true });
    });
  }
  if (value.extensions !== undefined) validateExtensions(value.extensions, 'constraints.extensions', issues);
}

function validateCreativeBrief(value, issues) {
  if (!requireObject(value, 'creativeBrief', issues)) return;
  if (value.contractVersion !== CREATIVE_BRIEF_CONTRACT_VERSION) {
    addIssue(issues, 'creativeBrief.contractVersion', 'brief_contract_version', 'Creative Brief contractVersion 不兼容');
  }
  if (!deepEqual(value.sectionOrder, CREATIVE_BRIEF_SECTION_ORDER)) {
    addIssue(issues, 'creativeBrief.sectionOrder', 'brief_section_order', 'Creative Brief 必须保持固定十部分顺序');
  }
  if (!deepEqual(value.sectionBindings, CREATIVE_BRIEF_SECTION_BINDINGS)) {
    addIssue(issues, 'creativeBrief.sectionBindings', 'brief_section_bindings', 'Creative Brief bindings 必须匹配核心 allowlist');
  }
  if (!deepEqual(value.contentPolicy, CREATIVE_BRIEF_CONTENT_POLICY)) {
    addIssue(issues, 'creativeBrief.contentPolicy', 'brief_content_policy', 'Creative Brief contentPolicy 不得放宽');
  }
  if (!deepEqual(value.audienceProfiles, CREATIVE_BRIEF_AUDIENCE_PROFILES)) {
    addIssue(issues, 'creativeBrief.audienceProfiles', 'brief_audience_profiles', 'Creative Brief audienceProfiles 不兼容');
  }
  if (value.extensions !== undefined) validateExtensions(value.extensions, 'creativeBrief.extensions', issues);
}

function validateApproval(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  requireEnum(value.status, APPROVAL_STATUSES, `${path}.status`, issues);
  if (value.status === 'approved') {
    requireString(value.approvedBy, `${path}.approvedBy`, issues);
    requireString(value.approvedAt, `${path}.approvedAt`, issues);
  }
}

function validateGovernance(value, issues, options = {}) {
  if (!requireObject(value, 'governance', issues)) return;
  if (requireObject(value.approvals, 'governance.approvals', issues)) {
    validateApproval(value.approvals.brandDNA, 'governance.approvals.brandDNA', issues);
    validateApproval(value.approvals.creativeDecision, 'governance.approvals.creativeDecision', issues);
  }
  requireArray(value.blockers, 'governance.blockers', issues);
  requireArray(value.warnings, 'governance.warnings', issues);
  if (!options.skipDerived) {
    requireArray(value.invariantChecks, 'governance.invariantChecks', issues, { nonEmpty: true });
    requireEnum(value.readiness, READINESS_VALUES, 'governance.readiness', issues);
  }
  if (value.extensions !== undefined) validateExtensions(value.extensions, 'governance.extensions', issues);
}

function validateMeta(value, issues, options = {}) {
  if (!requireObject(value, 'meta', issues)) return;
  if (value.schemaVersion !== CREATIVE_DECISION_STATE_SCHEMA_VERSION) {
    addIssue(issues, 'meta.schemaVersion', 'schema_version', 'Creative Decision State schemaVersion 不兼容');
  }
  if (value.decisionContractVersion !== CREATIVE_DECISION_CONTRACT_VERSION) {
    addIssue(issues, 'meta.decisionContractVersion', 'decision_contract_version', 'Creative Decision contractVersion 不兼容');
  }
  requireString(value.decisionId, 'meta.decisionId', issues);
  requireString(value.projectId, 'meta.projectId', issues);
  requireString(value.projectVersion, 'meta.projectVersion', issues);
  requireEnum(value.status, STATE_STATUSES, 'meta.status', issues);
  requireString(value.createdAt, 'meta.createdAt', issues);
  if (value.status === 'approved') requireString(value.approvedAt, 'meta.approvedAt', issues);
  if (value.supersedesDecisionId !== undefined && value.supersedesDecisionId !== null) {
    requireString(value.supersedesDecisionId, 'meta.supersedesDecisionId', issues);
  }
  if (!options.skipDigest) {
    if (!/^[a-f0-9]{64}$/.test(value.stateDigest || '')) {
      addIssue(issues, 'meta.stateDigest', 'state_digest_format', 'meta.stateDigest 必须是 SHA-256 hex');
    }
  }
}

function coreValidation(state, options = {}) {
  const errors = [];
  const warnings = [];
  if (!isObject(state)) {
    addIssue(errors, '$', 'required_object', 'Creative Decision State 必须是对象');
    return { errors, warnings };
  }
  for (const key of Object.keys(state)) {
    if (!TOP_LEVEL_KEYS.has(key)) addIssue(errors, key, 'unexpected_top_level_key', `不允许的一级字段：${key}`);
  }
  for (const key of TOP_LEVEL_KEYS) {
    if (!(key in state)) addIssue(errors, key, 'missing_top_level_key', `缺少一级字段：${key}`);
  }
  validateMeta(state.meta, errors, { skipDigest: options.skipDigest });
  const evidenceIds = validateProvenance(state.provenance, errors);
  const elementIds = validateBrand(state.brand, errors, evidenceIds);
  const { rationaleIds } = validateDecisionRecord(state.decisionRecord, errors, evidenceIds);
  const { actionIds, actions } = validateStrategy(state.strategy, errors, evidenceIds, elementIds, rationaleIds);
  validateConstraints(state.constraints, errors, evidenceIds, elementIds, actionIds, actions, rationaleIds);
  validateCreativeBrief(state.creativeBrief, errors);
  validateGovernance(state.governance, errors, { skipDerived: options.skipDerived });
  if (state.extensions !== undefined) validateExtensions(state.extensions, 'extensions', errors);

  if (state.meta?.status === 'approved' && state.brand?.approvedBrandDNA?.status !== 'approved') {
    addIssue(errors, 'brand.approvedBrandDNA.status', 'dna_not_approved', 'Approved State 必须具有 Approved Brand DNA');
  }
  const pendingDnaDimension = Object.values(state.brand?.approvedBrandDNA?.dimensions || {})
    .some((dimension) => dimension?.status !== 'approved');
  if (state.meta?.status === 'approved' && pendingDnaDimension) {
    addIssue(errors, 'brand.approvedBrandDNA.dimensions', 'dna_dimension_not_approved', 'Approved State 的 Brand DNA 九维必须全部 approved');
  }
  const approvals = state.governance?.approvals;
  if (state.meta?.status === 'approved'
    && (approvals?.brandDNA?.status !== 'approved' || approvals?.creativeDecision?.status !== 'approved')) {
    addIssue(errors, 'governance.approvals', 'state_not_approved', 'Approved State 必须完成 Brand DNA 与 Creative Decision 批准');
  }
  if ((state.governance?.blockers || []).length > 0 && state.meta?.status === 'approved') {
    addIssue(errors, 'governance.blockers', 'blockers_present', '存在 blocker 时 State 不能 approved');
  }
  const blockingUnresolved = (state.constraints?.unresolved || []).some((item) => item?.isBlocking);
  const blockingConflict = (state.constraints?.conflicts || [])
    .some((item) => item?.severity === 'blocker' && item?.resolutionStatus === 'open');
  if ((blockingUnresolved || blockingConflict) && state.meta?.status === 'approved') {
    addIssue(errors, 'constraints', 'constraint_blocker', '存在未解决的 Constraint blocker 时 State 不能 approved');
  }
  return { errors, warnings };
}

function checksFromErrors(errors) {
  const categories = [
    ['state-contract', null],
    ['identity', ['meta']],
    ['provenance', ['provenance']],
    ['brand', ['brand']],
    ['strategy', ['strategy']],
    ['constraints', ['constraints']],
    ['creative-brief', ['creativeBrief']],
    ['governance', ['decisionRecord', 'governance', 'extensions']]
  ];
  return categories.map(([checkId, prefixes]) => {
    const matched = prefixes === null
      ? errors
      : errors.filter((item) => prefixes.some((prefix) => item.path === prefix || item.path.startsWith(`${prefix}.`) || item.path.startsWith(`${prefix}[`)));
    return {
      checkId,
      status: matched.length ? 'fail' : 'pass',
      errors: matched.map((item) => ({ path: item.path, code: item.code }))
    };
  });
}

function expectedReadiness(state, errors) {
  if (errors.length || (state.governance?.blockers || []).length) return 'not-ready';
  const approvals = state.governance?.approvals;
  if (state.meta?.status === 'approved'
    && approvals?.brandDNA?.status === 'approved'
    && approvals?.creativeDecision?.status === 'approved') return 'release-ready';
  return 'draft-ready';
}

/** Add deterministic invariant results, readiness and digest without changing business fields. */
export function finalizeCreativeDecisionState(input = {}) {
  const state = createCreativeDecisionState(input);
  const validation = coreValidation(state, { skipDigest: true, skipDerived: true });
  state.governance.invariantChecks = checksFromErrors(validation.errors);
  state.governance.readiness = expectedReadiness(state, validation.errors);
  state.meta.stateDigest = calculateCreativeDecisionStateDigest(state);
  return state;
}

export function validateCreativeDecisionState(state, options = {}) {
  const core = coreValidation(state, { skipDigest: false, skipDerived: false });
  const errors = [...core.errors];
  const expectedChecks = checksFromErrors(coreValidation(state, { skipDigest: true, skipDerived: true }).errors);
  if (!deepEqual(state?.governance?.invariantChecks, expectedChecks)) {
    addIssue(errors, 'governance.invariantChecks', 'invariant_checks_mismatch', '保存的 invariantChecks 与 State 当前内容不一致');
  }
  const readiness = expectedReadiness(state, coreValidation(state, { skipDigest: true, skipDerived: true }).errors);
  if (state?.governance?.readiness !== readiness) {
    addIssue(errors, 'governance.readiness', 'readiness_mismatch', `governance.readiness 应为 ${readiness}`);
  }
  if (options.verifyDigest !== false && state?.meta?.stateDigest !== calculateCreativeDecisionStateDigest(state)) {
    addIssue(errors, 'meta.stateDigest', 'state_digest_mismatch', 'Creative Decision State digest 不匹配');
  }
  if (options.requireApproved) {
    if (state?.meta?.status !== 'approved') addIssue(errors, 'meta.status', 'approval_required', '激活 State 前必须 approved');
    if (state?.governance?.readiness !== 'release-ready') addIssue(errors, 'governance.readiness', 'release_ready_required', '激活 State 前必须 release-ready');
  }
  return {
    valid: errors.length === 0,
    releaseReady: errors.length === 0 && state?.governance?.readiness === 'release-ready',
    errors,
    warnings: core.warnings,
    checks: expectedChecks
  };
}

export function assertCreativeDecisionState(state, options = {}) {
  const validation = validateCreativeDecisionState(state, options);
  if (validation.valid) return state;
  const detail = validation.errors.map((item) => `${item.path}: ${item.message}`).join('\n');
  const error = new Error(`Creative Decision State 无效：\n${detail}`);
  error.name = 'CreativeDecisionStateValidationError';
  error.validation = validation;
  throw error;
}
