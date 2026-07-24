import {
  REFERENCE_TRANSLATION_SCHEMA_VERSION,
  TRANSFERABILITY_CLASSES,
  VISUAL_RULE_CATEGORIES
} from './types.js';

function fail(message, path) {
  throw Object.assign(new Error(`${path}: ${message}`), { code: 'REFERENCE_TRANSLATION_SCHEMA_INVALID', path });
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('必须是对象', path);
  return value;
}

function string(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail('必须是非空字符串', path);
  return value.trim();
}

function strings(value, path, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min) fail(`必须是至少 ${min} 项的字符串数组`, path);
  return [...new Set(value.map((item, index) => string(item, `${path}[${index}]`)))];
}

function confidence(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) fail('必须在 0–1 之间', path);
  return number;
}

export function validateVisualRule(value, path) {
  const rule = object(value, path);
  const mechanism = string(rule.mechanism, `${path}.mechanism`);
  const visualAdjectivesOnly = /^(极简|现代|高级|优雅|年轻|国际化|科技感|简洁|时尚)([、，/\s]*(极简|现代|高级|优雅|年轻|国际化|科技感|简洁|时尚))*$/u.test(mechanism);
  if (visualAdjectivesOnly) fail('mechanism 不能只是风格形容词', `${path}.mechanism`);
  return Object.freeze({
    name: string(rule.name, `${path}.name`),
    evidence: Object.freeze(strings(rule.evidence, `${path}.evidence`, { min: 1 })),
    mechanism,
    function: string(rule.function, `${path}.function`),
    confidence: confidence(rule.confidence, `${path}.confidence`)
  });
}

export function validateTransferItem(value, path) {
  const item = object(value, path);
  return Object.freeze({
    item_id: string(item.item_id, `${path}.item_id`),
    name: string(item.name, `${path}.name`),
    source_rule: string(item.source_rule, `${path}.source_rule`),
    reason: string(item.reason, `${path}.reason`),
    evidence: Object.freeze(strings(item.evidence, `${path}.evidence`, { min: 1 })),
    confidence: confidence(item.confidence, `${path}.confidence`)
  });
}

export function validateProjectTranslationItem(value, path) {
  const item = object(value, path);
  return Object.freeze({
    translation_id: string(item.translation_id, `${path}.translation_id`),
    referenceMechanism: string(item.referenceMechanism, `${path}.referenceMechanism`),
    referenceFunction: string(item.referenceFunction, `${path}.referenceFunction`),
    projectCondition: string(item.projectCondition, `${path}.projectCondition`),
    translatedMechanism: string(item.translatedMechanism, `${path}.translatedMechanism`),
    retainedProperties: Object.freeze(strings(item.retainedProperties, `${path}.retainedProperties`, { min: 1 })),
    changedProperties: Object.freeze(strings(item.changedProperties, `${path}.changedProperties`, { min: 1 })),
    prohibitedElements: Object.freeze(strings(item.prohibitedElements, `${path}.prohibitedElements`, { min: 1 })),
    confidence: confidence(item.confidence, `${path}.confidence`)
  });
}

export function validateReferenceTranslationProfile(value) {
  const root = object(value?.referenceTranslationProfile || value, 'referenceTranslationProfile');
  const identity = object(root.referenceIdentity, 'referenceIdentity');
  const dna = object(root.referenceVisualDNA, 'referenceVisualDNA');
  const transferability = object(root.transferability, 'transferability');
  const matrix = root.projectTranslationMatrix;
  if (!Array.isArray(matrix) || !matrix.length) fail('必须至少包含一项转译', 'projectTranslationMatrix');

  const normalizedDna = {};
  for (const category of VISUAL_RULE_CATEGORIES) {
    if (!Array.isArray(dna[category])) fail('必须是数组', `referenceVisualDNA.${category}`);
    normalizedDna[category] = Object.freeze(dna[category].map((item, index) =>
      validateVisualRule(item, `referenceVisualDNA.${category}[${index}]`)));
  }

  const normalizedTransferability = {};
  const seenIds = new Set();
  for (const category of TRANSFERABILITY_CLASSES) {
    if (!Array.isArray(transferability[category])) fail('必须是数组', `transferability.${category}`);
    normalizedTransferability[category] = Object.freeze(transferability[category].map((item, index) => {
      const normalized = validateTransferItem(item, `transferability.${category}[${index}]`);
      if (seenIds.has(normalized.item_id)) fail('三类可迁移性项目不得重复', `transferability.${category}[${index}].item_id`);
      seenIds.add(normalized.item_id);
      return normalized;
    }));
  }

  const completeness = string(identity.completeness, 'referenceIdentity.completeness');
  const consistency = string(identity.consistency, 'referenceIdentity.consistency');
  if (!['low', 'medium', 'high'].includes(completeness)) fail('必须是 low|medium|high', 'referenceIdentity.completeness');
  if (!['low', 'medium', 'high'].includes(consistency)) fail('必须是 low|medium|high', 'referenceIdentity.consistency');

  return Object.freeze({
    schema_version: REFERENCE_TRANSLATION_SCHEMA_VERSION,
    source_role: 'reference_project',
    referenceIdentity: Object.freeze({
      detectedIndustry: identity.detectedIndustry ? String(identity.detectedIndustry) : undefined,
      touchpoints: Object.freeze(strings(identity.touchpoints || [], 'referenceIdentity.touchpoints')),
      assetCount: Math.max(0, Math.floor(Number(identity.assetCount) || 0)),
      completeness,
      consistency,
      missingEvidence: Object.freeze(strings(identity.missingEvidence || [], 'referenceIdentity.missingEvidence'))
    }),
    referenceVisualDNA: Object.freeze(normalizedDna),
    transferability: Object.freeze(normalizedTransferability),
    sourceRisks: Object.freeze({
      signatureAssets: Object.freeze(strings(root.sourceRisks?.signatureAssets || [], 'sourceRisks.signatureAssets')),
      recognizableCombinations: Object.freeze(strings(root.sourceRisks?.recognizableCombinations || [], 'sourceRisks.recognizableCombinations')),
      similarityWarnings: Object.freeze(strings(root.sourceRisks?.similarityWarnings || [], 'sourceRisks.similarityWarnings'))
    }),
    projectTranslationMatrix: Object.freeze(matrix.map((item, index) =>
      validateProjectTranslationItem(item, `projectTranslationMatrix[${index}]`)))
  });
}

