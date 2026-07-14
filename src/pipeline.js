import path from 'node:path';
import { inventoryProject } from './inventory.js';
import { analyzeBenchmarks, buildBrandLock, buildGapAnalysis, buildImagePlan, buildPriorities } from './analyze.js';
import { renderAll } from './report.js';
import { readJson } from './utils.js';

export async function runPipeline(input, options = {}) {
  const root = path.resolve(input);
  const configPath = options.config ? path.resolve(options.config) : path.join(root, 'design-factory.json');
  const config = await readJson(configPath, {});
  const output = path.resolve(options.output || path.join(root, options.outputName || 'design-factory-output'));
  const inventory = await inventoryProject(root, {
    ignore: [options.outputName || 'design-factory-output'],
    ignorePaths: [output]
  });
  const brandLock = buildBrandLock(inventory, config);
  const benchmarks = await analyzeBenchmarks(inventory, brandLock, config, options);
  const gaps = buildGapAnalysis(inventory, benchmarks, config);
  const imagePlan = buildImagePlan(gaps, brandLock, config);
  const priorities = buildPriorities(brandLock, gaps);
  const result = { version: '1.0.0', generatedAt: new Date().toISOString(), configPath, config, inventory, brandLock, benchmarks, gaps, imagePlan, priorities };
  await renderAll(result, output);
  return { result, output };
}
