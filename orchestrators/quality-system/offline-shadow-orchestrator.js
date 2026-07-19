import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createShadowModeValidator } from '../../validators/index.js';
import { discoverQualitySources } from './source-discovery.js';
import { selectQualityAdapter } from './adapter-selector.js';

export const ORCHESTRATOR_VERSION = 'offline-shadow-orchestrator-v1';

export async function runOfflineShadowBatch({
  roots,
  store,
  evaluator,
  force = false,
  dryRun = false,
  recursive = true,
  clock = () => new Date().toISOString(),
  batchId = crypto.randomUUID()
}) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') throw new TypeError('A Shadow Result Store is required');
  const startedAt = timestamp(clock());
  const commandMode = dryRun ? 'dry_run' : (force ? 'force' : 'default');
  const files = await discoverQualitySources(roots, { recursive });
  const validator = createShadowModeValidator({ evaluator });
  const items = [];

  for (const file of files) {
    try {
      const source = JSON.parse(await fs.readFile(file, 'utf8'));
      const selected = selectQualityAdapter(source, file);
      if (!selected) {
        items.push({ source_path: file, status: 'unrecognized' });
        continue;
      }
      const ids = inferLocator(source, file);
      const context = selected.adapt({
        source,
        brandSource: source,
        projectId: ids.projectId,
        runId: ids.runId,
        evaluatorVersion: evaluator?.version,
        generatedAt: startedAt
      });
      const locator = { projectId: context.metadata.project_id, runId: context.metadata.run_id, module: context.module };
      const existing = await store.load(locator);
      if (!force && isCurrent(existing, context)) {
        items.push(item(file, context, 'skipped', { reason: 'source_and_versions_unchanged' }));
        continue;
      }
      if (dryRun) {
        items.push(item(file, context, 'planned'));
        continue;
      }
      const validationResult = await validator.validate(context);
      const completedAt = timestamp(clock());
      await store.save({
        context,
        validationResult,
        batchMetadata: {
          orchestrator_version: ORCHESTRATOR_VERSION,
          source_path: file,
          started_at: startedAt,
          completed_at: completedAt,
          command_mode: commandMode,
          batch_id: batchId
        }
      });
      items.push(item(file, context, 'succeeded', { validation_status: validationResult.status }));
    } catch (error) {
      items.push({ source_path: file, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }

  const completedAt = timestamp(clock());
  return {
    orchestrator_version: ORCHESTRATOR_VERSION,
    batch_id: batchId,
    command_mode: commandMode,
    started_at: startedAt,
    completed_at: completedAt,
    statistics: summarize(files.length, items),
    items
  };
}

function isCurrent(record, context) {
  const provenance = record?.provenance;
  return Boolean(provenance
    && provenance.source_hash === context.metadata.source_hash
    && provenance.quality_system_version === context.metadata.quality_system_version
    && provenance.rule_set_version === context.metadata.rule_set_version
    && provenance.adapter_version === context.metadata.adapter_version
    && provenance.evaluator_version === context.metadata.evaluator_version
    && provenance.orchestrator_version === ORCHESTRATOR_VERSION);
}

function inferLocator(source, file) {
  const run = source.result || source;
  const checkpoint = source.checkpoint || {};
  const runDirectory = path.dirname(file);
  const projectDirectory = path.dirname(runDirectory);
  return {
    projectId: firstId(checkpoint.projectId, source.projectId, run.projectId, path.basename(projectDirectory)),
    runId: firstId(checkpoint.analysisRunId, source.analysisRunId, run.analysisRunId, run.runId, path.basename(runDirectory))
  };
}

function firstId(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || 'unknown';
}

function item(file, context, status, extra = {}) {
  return {
    source_path: file,
    project_id: context.metadata.project_id,
    run_id: context.metadata.run_id,
    module: context.module,
    source_hash: context.metadata.source_hash,
    status,
    ...extra
  };
}

function summarize(discovered, items) {
  const count = (status) => items.filter((entry) => entry.status === status).length;
  return {
    discovered,
    recognized: items.length - count('unrecognized') - count('failed'),
    succeeded: count('succeeded'),
    skipped: count('skipped'),
    planned: count('planned'),
    failed: count('failed'),
    unrecognized: count('unrecognized')
  };
}

function timestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new TypeError('clock must return a valid timestamp');
  return parsed.toISOString();
}
