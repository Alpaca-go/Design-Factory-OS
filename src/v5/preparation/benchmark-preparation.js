import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, writeText } from '../../utils.js';
import { V5_DEFAULTS } from '../config/defaults.js';

const CACHE_VERSION = 1;
const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SHARED_BENCHMARK_CACHE = path.join(REPOSITORY_ROOT, '.masterpiece-os', 'cache', 'benchmarks');

function clean(values, maximum) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))]
    .slice(0, maximum);
}

function bounded(value) {
  const maxTotal = V5_DEFAULTS.benchmark.maxTotal;
  const category = clean(value?.category, V5_DEFAULTS.benchmark.categoryTarget + 1);
  const creativeExcellence = clean(value?.creativeExcellence, V5_DEFAULTS.benchmark.creativeExcellenceTarget + 1)
    .slice(0, Math.max(0, maxTotal - category.length));
  return Object.freeze({ category: Object.freeze(category), creativeExcellence: Object.freeze(creativeExcellence) });
}

function industryCacheKey(industry) {
  return crypto.createHash('sha256').update(String(industry).trim().toLowerCase()).digest('hex').slice(0, 16);
}

async function readCache(file, industry) {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (value.version === CACHE_VERSION && value.industry === industry) return value;
  } catch (error) {
    if (error.code !== 'ENOENT' && error.name !== 'SyntaxError') throw error;
  }
  return null;
}

/** Resolve bounded Benchmark context once, then reuse it by industry. This is not creative reasoning. */
export async function prepareBenchmarks(config, options = {}) {
  const industry = config.brandFacts.industry;
  const cacheRoot = path.resolve(options.cacheRoot || SHARED_BENCHMARK_CACHE);
  const cachePath = path.join(cacheRoot, `${industryCacheKey(industry)}.json`);
  const configured = bounded(config.benchmarkContext);
  if (configured.category.length || configured.creativeExcellence.length) {
    return Object.freeze({ ...configured, cacheHit: false, source: 'project-config', cachePath: null, resolverCalls: 0 });
  }
  const cached = options.disableCache ? null : await readCache(cachePath, industry);
  if (cached) {
    return Object.freeze({ ...bounded(cached.benchmarks), cacheHit: true, source: 'cache', cachePath, resolverCalls: 0 });
  }

  let source = 'instructions-only';
  let resolverCalls = 0;
  let benchmarks = configured;
  if (typeof options.resolver === 'function') {
    resolverCalls = 1;
    benchmarks = bounded(await options.resolver(Object.freeze({
      industry,
      categoryTarget: V5_DEFAULTS.benchmark.categoryTarget,
      creativeExcellenceTarget: V5_DEFAULTS.benchmark.creativeExcellenceTarget,
      maxTotal: V5_DEFAULTS.benchmark.maxTotal
    })));
    source = 'resolver';
  }

  if (benchmarks.category.length || benchmarks.creativeExcellence.length) {
    await ensureDir(cacheRoot);
    await writeText(cachePath, `${JSON.stringify({
      version: CACHE_VERSION,
      industry,
      generatedAt: new Date().toISOString(),
      benchmarks
    }, null, 2)}\n`);
  }
  return Object.freeze({ ...benchmarks, cacheHit: false, source, cachePath, resolverCalls });
}
