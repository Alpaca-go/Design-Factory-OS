import { stableSourceHash } from './source-hash.js';
import { NO_EVALUATOR_VERSION, QUALITY_SYSTEM_VERSION, RULE_SET_VERSION } from './versions.js';

export function buildQualityContext({
  module,
  source,
  output,
  brandContext,
  sourceContext,
  adapterVersion,
  evaluatorVersion = NO_EVALUATOR_VERSION,
  projectId,
  runId,
  generatedAt = new Date().toISOString()
}) {
  if (typeof module !== 'string' || !module.trim()) throw new TypeError('module is required');
  if (typeof adapterVersion !== 'string' || !adapterVersion.trim()) throw new TypeError('adapterVersion is required');
  const sourceClone = structuredClone(source ?? null);
  return deepFreeze({
    module: module.trim(),
    output: structuredClone(output ?? {}),
    metadata: {
      quality_system_version: QUALITY_SYSTEM_VERSION,
      rule_set_version: RULE_SET_VERSION,
      adapter_version: adapterVersion,
      evaluator_version: evaluatorVersion || NO_EVALUATOR_VERSION,
      project_id: identifier(projectId),
      run_id: identifier(runId),
      source_hash: stableSourceHash(sourceClone),
      generated_at: normalizeTimestamp(generatedAt),
      currentProjectId: identifier(projectId)
    },
    brand_context: structuredClone(brandContext),
    source_context: structuredClone(sourceContext)
  });
}

function identifier(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'unknown';
}

function normalizeTimestamp(value) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) throw new TypeError('generatedAt must be a valid timestamp');
  return timestamp.toISOString();
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
