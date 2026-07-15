import path from 'node:path';
import { inventoryProject } from './inventory.js';
import { analyzeBenchmarks, buildBrandLock } from './analyze.js';
import {
  buildBrandDnaDecision, buildCreativeDecision, buildIndustryBenchmark, buildOriginalIntent
} from './brand-dna-decision.js';
import { buildCreativeReasoning } from './creative-reasoning.js';
import { buildAnalysis } from './analysis.js';
import { compileCreativeBrief } from './creative-brief-compiler.js';
import { buildDesignDecisions } from './design-decisions.js';
import { buildBriefReview } from './brief-review.js';
import { renderAll } from './report.js';
import { readJson } from './utils.js';
import { loadProjectBrief } from './project-brief.js';
import { createPerformanceProfiler } from './performance-profiler.js';

const MODE_ALIASES = {
  quick: 'quick', fast: 'quick',
  standard: 'standard', brief: 'standard', review: 'standard',
  studio: 'studio', research: 'studio'
};

export function normalizeMode(value = 'standard') {
  const requested = String(value || 'standard').toLowerCase();
  const mode = MODE_ALIASES[requested];
  if (mode) return mode;
  throw new Error(`未知分析模式：${value}；v3.3 支持 quick、standard、studio`);
}

export async function runPipeline(input, options = {}) {
  const timing = createPerformanceProfiler();
  const root = path.resolve(input);
  const projectBrief = await loadProjectBrief(root, options);
  const mode = normalizeMode(options.mode || projectBrief.defaultMode);
  const configPath = options.config ? path.resolve(options.config) : path.join(root, 'masterpiece-os.json');
  const config = await readJson(configPath, {});
  const output = path.resolve(options.output || path.join(root, options.outputName || 'outputs'));
  const { inventory, brandLock } = await timing.asyncStage('readAssets', async () => {
    const inventoryResult = await inventoryProject(root, {
      ignore: [options.outputName || 'outputs', 'masterpiece-os-output', '.masterpiece-os'],
      ignorePaths: [output]
    });
    return { inventory: inventoryResult, brandLock: buildBrandLock(inventoryResult, config) };
  });

  const originalIntent = timing.syncStage('brandUnderstanding', () => buildOriginalIntent(config));
  const { benchmarks, industryBenchmark } = await timing.asyncStage('industryBenchmark', async () => {
    const benchmarkOptions = {
      ...options,
      online: options.online === true || mode === 'studio' || projectBrief.requirements.onlineBenchmarks,
      benchmarkLimit: Math.max(
        mode === 'studio' ? 8 : 5,
        projectBrief.requirements.minBenchmarks
      )
    };
    const benchmarkResult = await analyzeBenchmarks(inventory, brandLock, config, benchmarkOptions);
    return { benchmarks: benchmarkResult, industryBenchmark: buildIndustryBenchmark(benchmarkResult, config) };
  });

  const brandDnaDecision = timing.syncStage('creativeDecision', () => {
    const creativeDecision = buildCreativeDecision(config);
    return buildBrandDnaDecision(brandLock, benchmarks, config, { originalIntent, industryBenchmark, creativeDecision });
  });

  const { creativeReasoning, analysis } = timing.syncStage('brandUnderstanding', () => {
    const reasoning = buildCreativeReasoning(inventory, brandLock, benchmarks, config, brandDnaDecision);
    return {
      creativeReasoning: reasoning,
      analysis: buildAnalysis({ inventory, brandLock, benchmarks, brandDnaDecision, creativeReasoning: reasoning })
    };
  });

  const { creativeBrief, designDecisions } = timing.syncStage('compilerPipeline', () => {
    const brief = timing.syncStage('creativeBrief', () => compileCreativeBrief(analysis));
    return { creativeBrief: brief, designDecisions: buildDesignDecisions(analysis, brief) };
  });
  const result = {
    version: '3.3.0', mode, generatedAt: new Date().toISOString(), configPath, config, projectBrief,
    inventory, brandLock, benchmarks, brandDnaDecision, creativeReasoning,
    analysis, creativeBrief, designDecisions
  };
  const briefReview = timing.syncStage('review', () => buildBriefReview(result));
  Object.assign(result, { briefReview });
  result.performance = timing.snapshot({ mode, inputImages: inventory.imageCount });
  result.durationMs = Math.round(result.performance.total * 1000);
  const files = await renderAll(result, output, {
    debug: Boolean(options.debug),
    performanceJson: Boolean(options.debug || options.profile)
  });
  result.outputFiles = files;
  return { result, output };
}
