import fs from 'node:fs/promises';
import path from 'node:path';
import { defineShadowResultStore } from './store-contract.js';

const RECORD_VERSION = 'shadow-validation-record-v1';
const REVIEW_JUDGEMENTS = new Set(['true_positive', 'false_positive', 'false_negative', 'uncertain']);
const REVIEWER_TYPES = new Set(['human', 'qa', 'domain_expert', 'fixture']);

export function createJsonShadowResultStore({ rootDir, clock = () => new Date().toISOString() }) {
  if (typeof rootDir !== 'string' || !rootDir.trim()) throw new TypeError('rootDir is required');
  const root = path.resolve(rootDir);

  const implementation = {
    async save({ context, validationResult, batchMetadata = {} }) {
      assertQualityContext(context);
      if (!validationResult || validationResult.mode !== 'shadow') throw new TypeError('Only shadow validation results can be persisted');
      const locator = locatorFromContext(context);
      const file = recordPath(root, locator);
      const existing = await readJson(file);
      const timestamp = normalizeTimestamp(clock());
      const sourceUnchanged = existing?.provenance?.source_hash === context.metadata.source_hash;
      const record = {
        record_version: RECORD_VERSION,
        locator,
        provenance: {
          quality_system_version: context.metadata.quality_system_version,
          rule_set_version: context.metadata.rule_set_version,
          adapter_version: context.metadata.adapter_version,
          evaluator_version: context.metadata.evaluator_version,
          ...(batchMetadata.orchestrator_version ? { orchestrator_version: requiredText(batchMetadata.orchestrator_version, 'orchestrator_version') } : {}),
          source_hash: context.metadata.source_hash,
          generated_at: context.metadata.generated_at,
          ...(batchMetadata.started_at ? { started_at: normalizeTimestamp(batchMetadata.started_at) } : {}),
          ...(batchMetadata.completed_at ? { completed_at: normalizeTimestamp(batchMetadata.completed_at) } : {}),
          ...(batchMetadata.command_mode ? { command_mode: requiredText(batchMetadata.command_mode, 'command_mode') } : {}),
          ...(batchMetadata.batch_id ? { batch_id: requiredText(batchMetadata.batch_id, 'batch_id') } : {}),
          ...(batchMetadata.source_path ? { source_path: requiredText(batchMetadata.source_path, 'source_path') } : {}),
          source_context: structuredClone(context.source_context)
        },
        validation_result: structuredClone(validationResult),
        human_reviews: sourceUnchanged && Array.isArray(existing?.human_reviews) ? existing.human_reviews : [],
        saved_at: existing?.saved_at || timestamp,
        updated_at: timestamp
      };
      await writeJson(file, record);
      return structuredClone(record);
    },

    async load(locator) {
      const file = recordPath(root, normalizeLocator(locator));
      const record = await readJson(file);
      return record ? structuredClone(record) : null;
    },

    async list(filter = {}) {
      const records = await readAllRecords(root);
      return records.filter((record) => (!filter.projectId || record.locator.project_id === filter.projectId)
        && (!filter.runId || record.locator.run_id === filter.runId)
        && (!filter.module || record.locator.module === filter.module)).map((record) => structuredClone(record));
    },

    async upsertReview(locator, review) {
      const normalizedLocator = normalizeLocator(locator);
      const file = recordPath(root, normalizedLocator);
      const record = await readJson(file);
      if (!record) throw new Error(`Shadow validation result not found: ${normalizedLocator.project_id}/${normalizedLocator.run_id}/${normalizedLocator.module}`);
      const normalizedReview = normalizeReview(review, record, clock);
      const reviews = Array.isArray(record.human_reviews) ? [...record.human_reviews] : [];
      const index = reviews.findIndex((item) => item.anti_pattern_id === normalizedReview.anti_pattern_id && item.reviewer_type === normalizedReview.reviewer_type);
      if (index >= 0) reviews[index] = normalizedReview;
      else reviews.push(normalizedReview);
      const updated = { ...record, human_reviews: reviews, updated_at: normalizeTimestamp(clock()) };
      await writeJson(file, updated);
      return structuredClone(updated);
    }
  };

  return defineShadowResultStore(implementation);
}

function assertQualityContext(context) {
  if (!context?.metadata || !context.module) throw new TypeError('A Quality Context is required');
  for (const field of ['quality_system_version', 'rule_set_version', 'adapter_version', 'evaluator_version', 'project_id', 'run_id', 'source_hash', 'generated_at']) {
    if (typeof context.metadata[field] !== 'string' || !context.metadata[field]) throw new TypeError(`Quality Context metadata.${field} is required`);
  }
  if (context.metadata.project_id === 'unknown' || context.metadata.run_id === 'unknown') {
    throw new TypeError('Shadow results require known project_id and run_id before persistence');
  }
}

function locatorFromContext(context) {
  return normalizeLocator({ projectId: context.metadata.project_id, runId: context.metadata.run_id, module: context.module });
}

function normalizeLocator(locator) {
  return {
    project_id: safeSegment(locator?.projectId || locator?.project_id, 'project_id'),
    run_id: safeSegment(locator?.runId || locator?.run_id, 'run_id'),
    module: safeSegment(locator?.module, 'module')
  };
}

function safeSegment(value, field) {
  const segment = String(value || '').trim();
  if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\') || /[<>:"|?*\u0000-\u001f]/.test(segment)) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
  return segment;
}

function recordPath(root, locator) {
  const target = path.resolve(root, locator.project_id, locator.run_id, locator.module, 'shadow-validation.json');
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Shadow result path escapes rootDir');
  return target;
}

function normalizeReview(review, record, clock) {
  if (!review || typeof review !== 'object') throw new TypeError('Human review is required');
  const antiPatternId = String(review.anti_pattern_id || '').trim();
  if (!/^AP-[A-Z]+-[0-9]{3}$/.test(antiPatternId)) throw new TypeError('human review anti_pattern_id is invalid');
  if (!REVIEW_JUDGEMENTS.has(review.human_judgement)) throw new TypeError('human review judgement is invalid');
  if (!REVIEWER_TYPES.has(review.reviewer_type)) throw new TypeError('human review reviewer_type is invalid');
  const systemDetected = record.validation_result.anti_patterns.some((finding) => finding.anti_pattern_id === antiPatternId && finding.detected && !finding.exception_applied);
  if (review.system_detected !== systemDetected) throw new TypeError(`human review system_detected must be ${systemDetected} for ${antiPatternId}`);
  if ((review.human_judgement === 'true_positive' || review.human_judgement === 'false_positive') && !systemDetected) {
    throw new TypeError(`${review.human_judgement} requires system_detected=true`);
  }
  if (review.human_judgement === 'false_negative' && systemDetected) throw new TypeError('false_negative requires system_detected=false');
  return {
    anti_pattern_id: antiPatternId,
    system_detected: systemDetected,
    human_judgement: review.human_judgement,
    notes: typeof review.notes === 'string' ? review.notes : '',
    reviewed_at: normalizeTimestamp(review.reviewed_at || clock()),
    reviewer_type: review.reviewer_type
  };
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readAllRecords(root) {
  const records = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && entry.name === 'shadow-validation.json') records.push(await readJson(target));
    }
  }
  await visit(root);
  return records.filter(Boolean);
}

function normalizeTimestamp(value) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) throw new TypeError('timestamp is invalid');
  return timestamp.toISOString();
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
}
