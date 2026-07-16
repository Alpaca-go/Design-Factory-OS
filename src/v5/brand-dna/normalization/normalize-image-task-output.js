import { migrateImageTaskSpecV1ToV2 } from '../migrations/image-task-v1-to-v2.js';

const ROLE_ALIASES = Object.freeze({
  anchor: 'anchor-image',
  anchor_image: 'anchor-image',
  'anchor image': 'anchor-image',
  poster: 'brand-poster',
  brand_poster: 'brand-poster',
  'brand poster': 'brand-poster',
  application: 'application-scene',
  application_scene: 'application-scene',
  'application scene': 'application-scene',
  detail: 'detail-craft',
  detail_craft: 'detail-craft',
  'detail craft': 'detail-craft',
  packaging: 'packaging-concept',
  packaging_concept: 'packaging-concept',
  visual_system: 'visual-system',
  'visual system': 'visual-system'
});

function warning(warnings, code, jsonPath, action, sourcePath = null) {
  warnings.push({ code, jsonPath, action, sourcePath });
}

function normalizeArray(value, jsonPath, warnings, optional = false) {
  if (value === null || (value === undefined && optional)) {
    warning(
      warnings,
      value === null ? 'NULL_ARRAY_TO_EMPTY' : 'MISSING_OPTIONAL_ARRAY',
      jsonPath,
      'set-empty-array'
    );
    return [];
  }
  if (!Array.isArray(value)) return value;
  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    const key = typeof item === 'string' ? item.trim() : JSON.stringify(item);
    if (seen.has(key)) {
      warning(warnings, 'DUPLICATE_ARRAY_ITEM_REMOVED', jsonPath, 'remove-duplicate-item');
      continue;
    }
    seen.add(key);
    normalized.push(typeof item === 'string' ? item.trim() : item);
  }
  return normalized;
}

const VISUAL_TRANSLATION_STRING_ARRAY_FIELDS = Object.freeze([
  'visualPersonality',
  'visualKeywords',
  'emotionalTemperature',
  'suggestedAssets',
  'avoidDirections'
]);

const IMAGE_SYSTEM_STRING_ARRAY_FIELDS = Object.freeze([
  'visualPersonality',
  'materialSystem',
  'consistencyRules',
  'lockedFacts',
  'knownAssets',
  'creativeFreedom',
  'globalProhibitions'
]);

function normalizeStringArray(value, jsonPath, warnings, optional = false) {
  if (typeof value === 'string') {
    const item = value.trim();
    warning(warnings, 'STRING_TO_SINGLE_ITEM_ARRAY', jsonPath, 'wrap-string-in-array');
    return item ? [item] : [];
  }
  return normalizeArray(value, jsonPath, warnings, optional);
}

export function normalizeVisualTranslationOutput({ output }) {
  const warnings = [];
  const normalized = structuredClone(output || {});
  const translation = normalized.visualTranslation;
  const creative = translation?.creativeTranslation;
  if (creative && typeof creative === 'object' && !Array.isArray(creative)) {
    for (const key of VISUAL_TRANSLATION_STRING_ARRAY_FIELDS) {
      creative[key] = normalizeStringArray(
        creative[key],
        `visualTranslation.creativeTranslation.${key}`,
        warnings
      );
    }
  }

  const system = normalized.imageSystem;
  if (system && typeof system === 'object' && !Array.isArray(system)) {
    for (const key of IMAGE_SYSTEM_STRING_ARRAY_FIELDS) {
      system[key] = normalizeStringArray(
        system[key],
        `imageSystem.${key}`,
        warnings,
        key === 'knownAssets'
      );
    }
    if (system.generationBoundary && typeof system.generationBoundary === 'object') {
      for (const key of [
        'lockedFacts',
        'lockedAssets',
        'verifiedRequiredElements',
        'suggestedElements',
        'creativeFreedom',
        'prohibitedElements',
        'prohibitedClaims',
        'pendingConfirmations'
      ]) {
        system.generationBoundary[key] = normalizeStringArray(
          system.generationBoundary[key],
          `imageSystem.generationBoundary.${key}`,
          warnings,
          true
        );
      }
    }
  }
  return { output: normalized, warnings };
}

export function normalizeImageTaskOutput({ output, upstreamContext = {} }) {
  const warnings = [];
  let normalized = structuredClone(output || {});
  if (!Array.isArray(normalized.imageTasks)) return { output: normalized, warnings };

  const isV1 = normalized.imageTasks.some((task) => !Array.isArray(task?.consistencyWithGlobalSystem));
  if (isV1) {
    normalized = migrateImageTaskSpecV1ToV2(normalized, upstreamContext.imageSystem);
    warning(
      warnings,
      'IMAGE_TASK_V1_MIGRATED',
      'imageTasks',
      'migrate-gpt-image-task-v1-to-v2',
      'imageSystem.consistencyRules'
    );
  }

  normalized.imageTasks = normalized.imageTasks.map((task, index) => {
    const next = { ...task };
    const base = `imageTasks[${index}]`;

    if (typeof next.sequence === 'string' && /^\d+$/.test(next.sequence.trim())) {
      next.sequence = Number(next.sequence);
      warning(warnings, 'NUMERIC_STRING_TO_NUMBER', `${base}.sequence`, 'convert-to-number');
    }
    if (next.sequence !== index + 1) {
      next.sequence = index + 1;
      warning(warnings, 'SEQUENCE_NORMALIZED', `${base}.sequence`, 'set-from-array-order');
    }

    if (typeof next.role === 'string') {
      const roleKey = next.role.trim().toLowerCase();
      const canonical = ROLE_ALIASES[roleKey] || roleKey;
      if (canonical !== next.role) {
        next.role = canonical;
        warning(warnings, 'ROLE_ALIAS_NORMALIZED', `${base}.role`, 'normalize-known-role-alias');
      }
    }

    for (const [key, optional] of [
      ['brandDnaBasis', false],
      ['requiredElements', true],
      ['optionalElements', true],
      ['prohibitedElements', false],
      ['lockedAssetInstructions', true],
      ['allowedText', true],
      ['consistencyWithGlobalSystem', false],
      ['consistencyWithPreviousTasks', index === 0],
      ['intentionalDifferenceFromPreviousTasks', true]
    ]) {
      next[key] = normalizeArray(next[key], `${base}.${key}`, warnings, optional);
    }
    return next;
  });

  return { output: normalized, warnings };
}

export function normalizeStructuredStageOutput({ stageId, output, upstreamContext = {} }) {
  if (stageId === 'visual-causal-translation') {
    return normalizeVisualTranslationOutput({ output });
  }
  if (stageId === 'gpt-image-task-compiler') {
    return normalizeImageTaskOutput({ output, upstreamContext });
  }
  return { output: structuredClone(output), warnings: [] };
}
