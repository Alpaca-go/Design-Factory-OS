export const REFERENCE_TRANSLATION_VERSION = 'reference-translation-mvp-v1';
export const REFERENCE_TRANSLATION_SCHEMA_VERSION = 'reference-translation-profile-v1';

export const VISUAL_SOURCE_ROLES = Object.freeze([
  'current_project',
  'reference_project',
  'competitor_benchmark'
]);

export const VISUAL_RULE_CATEGORIES = Object.freeze([
  'visualTemperament',
  'compositionRules',
  'graphicGrammar',
  'colorLogic',
  'typographyLogic',
  'materialAndLighting',
  'extensionMechanism'
]);

export const TRANSFERABILITY_CLASSES = Object.freeze([
  'directlyTransferable',
  'requiresReinterpretation',
  'prohibitedToCopy'
]);

export function validateVisualSourceRole(value, { allowCompetitor = false } = {}) {
  if (!VISUAL_SOURCE_ROLES.includes(value)) throw new Error(`未知视觉来源角色：${value}`);
  if (value === 'competitor_benchmark' && !allowCompetitor) {
    throw new Error('MVP 尚未启用 competitor_benchmark 运行路径');
  }
  return value;
}

