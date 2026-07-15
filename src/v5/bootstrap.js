import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { inventoryProject } from '../inventory.js';
import { readJson } from '../utils.js';
import { createV5ProjectConfig } from './config/schema.js';
import { V5_PIPELINE_ID, V5_VERSION } from './config/defaults.js';
import { runDeepCreativeDirector } from './creative-director/deep-creative-director.js';
import { publishCreativeUpgradeReport } from './creative-director/output-writer.js';
import { writeV5RunReport } from './telemetry/run-logger.js';

function inferProjectRoot(input, options) {
  if (options.projectRoot) return path.resolve(options.projectRoot);
  const root = path.resolve(input);
  return path.basename(root).toLowerCase() === 'input' ? path.dirname(root) : root;
}

async function readV5Config(configPath, projectName, options) {
  const raw = await readJson(configPath, { projectName });
  const overrides = {
    ...(raw.overrides || {}),
    ...(options.language ? { outputLanguage: options.language } : {}),
    ...(options.allowLogoRedesign ? { allowLogoRedesign: true } : {}),
    ...(options.lockedAssets?.length
      ? { additionalLockedAssets: [...(raw.overrides?.additionalLockedAssets || []), ...options.lockedAssets] }
      : {}),
    ...(options.requiredApplications?.length
      ? { requiredApplications: options.requiredApplications }
      : {})
  };
  return createV5ProjectConfig({ ...raw, overrides }, { projectName });
}

function rejectRetiredOptions(options) {
  if (options.mode !== undefined) {
    throw new Error('--mode 已在 v5 废弃；所有项目统一使用 Deep Creative Director Mode。历史项目请使用 v4 analyze。');
  }
  if (options.creativeFreedom !== undefined) {
    throw new Error('--creative-freedom 已在 v5 废弃；默认使用 Maximum Creative Authority。');
  }
}

/** Run the isolated v5 intake → one reasoning session → one document pipeline. */
export async function runV5Pipeline(input, options = {}) {
  rejectRetiredOptions(options);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const root = path.resolve(input);
  const projectRoot = inferProjectRoot(root, options);
  const projectName = path.basename(projectRoot);
  const output = path.resolve(options.output || path.join(projectRoot, 'outputs'));
  const configPath = path.resolve(options.config || path.join(projectRoot, 'masterpiece-os-v5.json'));

  const intakeStarted = performance.now();
  const inventory = await inventoryProject(root, {
    ignore: ['outputs', '.runtime', 'masterpiece-os-output', '.masterpiece-os'],
    ignorePaths: [output, path.join(projectRoot, '.runtime')]
  });
  const assetReadTimeMs = performance.now() - intakeStarted;
  const config = await readV5Config(configPath, projectName, options);

  const reasoningStarted = performance.now();
  const creativeDirector = await runDeepCreativeDirector(
    { inventory, config, projectRoot, projectName },
    { reasoner: options.deepCreativeDirectorReasoner, sessionGuard: options.sessionGuard }
  );
  const creativeDirectorTimeMs = performance.now() - reasoningStarted;

  const outputStarted = performance.now();
  const publication = await publishCreativeUpgradeReport(creativeDirector, output, config);
  const outputWriteTimeMs = performance.now() - outputStarted;
  const totalTimeMs = performance.now() - started;
  const endedAt = new Date().toISOString();
  const runReport = {
    version: V5_VERSION,
    pipelineId: V5_PIPELINE_ID,
    analysisMode: 'deep',
    assetCount: inventory.totalFiles,
    imageCount: inventory.imageCount,
    assetReadTimeMs: Number(assetReadTimeMs.toFixed(3)),
    benchmarkTimeMs: null,
    creativeDirectorTimeMs: Number(creativeDirectorTimeMs.toFixed(3)),
    integrityCheckTimeMs: null,
    outputWriteTimeMs: Number(outputWriteTimeMs.toFixed(3)),
    totalTimeMs: Number(totalTimeMs.toFixed(3)),
    outputFile: publication.filename,
    model: creativeDirector.model,
    provider: creativeDirector.provider,
    reasoningRunId: creativeDirector.runId,
    fullReasoningRuns: creativeDirector.session.fullReasoningRuns,
    continuations: creativeDirector.session.continuations,
    status: 'success',
    startedAt,
    endedAt
  };
  const runtimeReportPath = await writeV5RunReport(projectRoot, runReport);

  return {
    result: Object.freeze({
      version: V5_VERSION,
      pipelineId: V5_PIPELINE_ID,
      analysisMode: 'deep',
      creativeAuthority: config.runtime.creativeAuthority,
      lockedVisualAssets: config.runtime.lockedVisualAssets,
      generatedAt: endedAt,
      configPath,
      config,
      inventory,
      creativeDirector,
      outputFiles: publication.outputFiles,
      outputFile: publication.filename,
      runReport,
      runtimeReportPath
    }),
    output
  };
}

export async function v5ConfigExists(projectRoot) {
  try {
    await fs.access(path.join(projectRoot, 'masterpiece-os-v5.json'));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
