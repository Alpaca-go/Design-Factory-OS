import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { inventoryProject } from '../inventory.js';
import { readJson } from '../utils.js';
import { createV5ProjectConfig } from './config/schema.js';
import { V5_PIPELINE_ID, V5_VERSION } from './config/defaults.js';
import { runDeepCreativeDirector } from './creative-director/deep-creative-director.js';
import { buildDeepCreativeDirectorPrompt } from './creative-director/prompt-builder.js';
import { publishCreativeUpgradeReport } from './creative-director/output-writer.js';
import { prepareVisualAssets } from './preparation/visual-preparation.js';
import { prepareBenchmarks } from './preparation/benchmark-preparation.js';
import { readReasoningCache, writeReasoningCache } from './preparation/reasoning-cache.js';
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
  let failureStage = 'asset-inventory';
  let modelCallStarted = false;
  let targetBudgetTimeMs = 10 * 60_000;
  let maximumBudgetTimeMs = 15 * 60_000;

  try {

  const intakeStarted = performance.now();
  const inventory = await inventoryProject(root, {
    ignore: ['outputs', '.runtime', 'masterpiece-os-output', '.masterpiece-os'],
    ignorePaths: [output, path.join(projectRoot, '.runtime')]
  });
  const assetReadTimeMs = performance.now() - intakeStarted;
  const config = await readV5Config(configPath, projectName, options);
  targetBudgetTimeMs = config.performance.targetMinutes * 60_000;
  maximumBudgetTimeMs = config.performance.maximumMinutes * 60_000;

  failureStage = 'visual-preparation';
  const visualPreparationStarted = performance.now();
  const visualPreparation = await prepareVisualAssets(inventory, config, {
    projectRoot,
    cacheRoot: options.preparationCacheRoot,
    disableCache: !config.performance.enablePreparationCache || options.disablePreparationCache,
    maxDetailAssets: options.maxDetailAssets
  });
  const visualPreparationTimeMs = performance.now() - visualPreparationStarted;

  failureStage = 'benchmark-preparation';
  const benchmarkStarted = performance.now();
  const benchmarkPreparation = await prepareBenchmarks(config, {
    projectRoot,
    cacheRoot: options.benchmarkCacheRoot,
    disableCache: !config.performance.enablePreparationCache || options.disablePreparationCache,
    resolver: options.benchmarkResolver
  });
  const benchmarkTimeMs = performance.now() - benchmarkStarted;

  failureStage = 'prompt-build';
  const promptStarted = performance.now();
  const prompt = await buildDeepCreativeDirectorPrompt({
    inventory,
    config,
    projectRoot,
    projectName,
    visualPreparation,
    benchmarkPreparation
  });
  const promptBuildTimeMs = performance.now() - promptStarted;
  const cachedResult = config.performance.enablePreparationCache
    ? await readReasoningCache(projectRoot, prompt.promptDigest, { forceReasoning: options.forceReasoning })
    : null;

  failureStage = 'creative-director';
  const reasoningStarted = performance.now();
  const maximumDurationMs = config.performance.maximumMinutes * 60_000 - (performance.now() - started);
  if (maximumDurationMs <= 0) {
    const error = new Error(`v5 Pipeline 已超过 ${config.performance.maximumMinutes} 分钟上限，停止模型调用`);
    error.code = 'TIME_BUDGET_EXCEEDED';
    throw error;
  }
  modelCallStarted = !cachedResult && typeof options.deepCreativeDirectorReasoner === 'function';
  const creativeDirector = await runDeepCreativeDirector(
    { inventory, config, projectRoot, projectName, visualPreparation, benchmarkPreparation },
    {
      reasoner: options.deepCreativeDirectorReasoner,
      sessionGuard: options.sessionGuard,
      prompt,
      cachedResult,
      maximumDurationMs
    }
  );
  const creativeDirectorTimeMs = performance.now() - reasoningStarted;

  let reasoningCachePath = null;
  if (config.performance.enablePreparationCache && creativeDirector.executionSource === 'reasoner') {
    reasoningCachePath = await writeReasoningCache(projectRoot, prompt.promptDigest, creativeDirector);
  }

  failureStage = 'output-write';
  const outputStarted = performance.now();
  const publication = await publishCreativeUpgradeReport(creativeDirector, output, config);
  const outputWriteTimeMs = performance.now() - outputStarted;
  const totalTimeMs = performance.now() - started;
  const targetTimeMs = targetBudgetTimeMs;
  const maximumTimeMs = maximumBudgetTimeMs;
  const performanceBudgetStatus = totalTimeMs <= targetTimeMs
    ? 'within-target'
    : totalTimeMs <= maximumTimeMs ? 'within-maximum' : 'exceeded';
  const reportCharacters = [...creativeDirector.reportMarkdown].length;
  const endedAt = new Date().toISOString();
  const runReport = {
    version: V5_VERSION,
    pipelineId: V5_PIPELINE_ID,
    analysisMode: 'deep',
    assetCount: inventory.totalFiles,
    imageCount: inventory.imageCount,
    assetReadTimeMs: Number(assetReadTimeMs.toFixed(3)),
    visualPreparationTimeMs: Number(visualPreparationTimeMs.toFixed(3)),
    contactSheetTimeMs: Number(visualPreparation.contactSheetTimeMs.toFixed(3)),
    visualPreparationCacheHit: visualPreparation.cacheHit,
    visualStrategy: visualPreparation.strategy,
    detailAttachmentCount: visualPreparation.priorityAssetIds.length,
    promptAttachmentCount: prompt.attachments.length,
    benchmarkTimeMs: Number(benchmarkTimeMs.toFixed(3)),
    benchmarkCacheHit: benchmarkPreparation.cacheHit,
    benchmarkSource: benchmarkPreparation.source,
    benchmarkResolverCalls: benchmarkPreparation.resolverCalls,
    promptBuildTimeMs: Number(promptBuildTimeMs.toFixed(3)),
    creativeDirectorTimeMs: Number(creativeDirectorTimeMs.toFixed(3)),
    actualModelTimeMs: Number(creativeDirector.actualModelTimeMs.toFixed(3)),
    integrityCheckTimeMs: null,
    outputWriteTimeMs: Number(outputWriteTimeMs.toFixed(3)),
    totalTimeMs: Number(totalTimeMs.toFixed(3)),
    totalWallClockTimeMs: Number(totalTimeMs.toFixed(3)),
    timingScope: 'pipeline-entry-to-report-written',
    targetTimeMs,
    maximumTimeMs,
    performanceBudgetStatus,
    reportCharacters,
    maxReportCharacters: config.performance.maxReportCharacters,
    reportBudgetStatus: reportCharacters <= config.performance.maxReportCharacters ? 'within-budget' : 'exceeded',
    outputFile: publication.filename,
    model: creativeDirector.model,
    provider: creativeDirector.provider,
    reasoningRunId: creativeDirector.runId,
    promptDigest: creativeDirector.prompt.promptDigest,
    promptModelCalls: creativeDirector.prompt.modelCalls,
    modelCallsThisRun: creativeDirector.executionSource === 'reasoner' ? 1 : 0,
    reasoningCacheHit: creativeDirector.executionSource === 'reasoning-cache',
    reasoningCachePath,
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
      visualPreparation,
      benchmarkPreparation,
      creativeDirector,
      outputFiles: publication.outputFiles,
      outputFile: publication.filename,
      runReport,
      runtimeReportPath
    }),
    output
  };
  } catch (error) {
    const totalWallClockTimeMs = performance.now() - started;
    const targetTimeMs = targetBudgetTimeMs;
    const maximumTimeMs = maximumBudgetTimeMs;
    await writeV5RunReport(projectRoot, {
      version: V5_VERSION,
      pipelineId: V5_PIPELINE_ID,
      analysisMode: 'deep',
      status: 'failed',
      failureStage,
      modelCallStarted,
      modelCallsThisRun: modelCallStarted ? 1 : 0,
      timingScope: 'pipeline-entry-to-failure',
      totalWallClockTimeMs: Number(totalWallClockTimeMs.toFixed(3)),
      targetTimeMs,
      maximumTimeMs,
      performanceBudgetStatus: totalWallClockTimeMs <= targetTimeMs
        ? 'within-target'
        : totalWallClockTimeMs <= maximumTimeMs ? 'within-maximum' : 'exceeded',
      error: {
        name: error.name,
        code: error.code || 'V5_PIPELINE_FAILED',
        message: error.message
      },
      startedAt,
      endedAt: new Date().toISOString()
    }).catch(() => {});
    throw error;
  }
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
