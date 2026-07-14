import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryProject } from './inventory.js';
import { analyzeBenchmarks, buildBrandLock } from './analyze.js';
import { buildBrandDnaDecision } from './brand-dna-decision.js';
import { buildCreativeReasoning } from './creative-reasoning.js';
import { buildBriefReview } from './brief-review.js';
import { buildThinkingReview, loadThinkingFramework } from './thinking-framework.js';
import { renderAll } from './report.js';
import { readJson } from './utils.js';

const DEFAULT_THINKING_FRAMEWORK = fileURLToPath(new URL('../knowledge/thinking/', import.meta.url));

export function normalizeMode(value = 'brief') {
  const mode = String(value || 'brief').toLowerCase();
  if (['brief', 'fast', 'review', 'research'].includes(mode)) return 'brief';
  throw new Error(`未知分析模式：${value}；v3.2 只提供 Creative Brief 工作流`);
}

export async function runPipeline(input, options = {}) {
  const startedAt = Date.now();
  const mode = normalizeMode(options.mode);
  const root = path.resolve(input);
  const configPath = options.config ? path.resolve(options.config) : path.join(root, 'masterpiece-os.json');
  const config = await readJson(configPath, {});
  const output = path.resolve(options.output || path.join(root, options.outputName || 'outputs'));
  const inventory = await inventoryProject(root, {
    ignore: [options.outputName || 'outputs', 'masterpiece-os-output'],
    ignorePaths: [output]
  });
  const brandLock = buildBrandLock(inventory, config);
  const benchmarks = await analyzeBenchmarks(inventory, brandLock, config, options);
  const brandDnaDecision = buildBrandDnaDecision(brandLock, benchmarks, config);
  const creativeReasoning = buildCreativeReasoning(inventory, brandLock, benchmarks, config, brandDnaDecision);
  const result = {
    version: '3.2.0', mode, generatedAt: new Date().toISOString(), configPath, config,
    inventory, brandLock, benchmarks, brandDnaDecision, creativeReasoning
  };
  const thinkingFrameworkPath = options.thinkingDir
    ? path.resolve(options.thinkingDir)
    : config.thinkingFrameworkPath
      ? path.resolve(root, config.thinkingFrameworkPath)
      : DEFAULT_THINKING_FRAMEWORK;
  const thinkingFramework = await loadThinkingFramework(thinkingFrameworkPath);
  const thinkingReview = buildThinkingReview(result, thinkingFramework, config);
  const briefReview = buildBriefReview(result);
  Object.assign(result, { thinkingFrameworkPath, thinkingReview, briefReview });
  result.durationMs = Date.now() - startedAt;
  const files = await renderAll(result, output, { debug: Boolean(options.debug) });
  result.outputFiles = files;
  result.durationMs = Date.now() - startedAt;
  return { result, output };
}
