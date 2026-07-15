import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, writeText } from '../../utils.js';

const CACHE_VERSION = 1;
const CACHE_FILENAME = 'reasoning-result.json';

function cachePath(projectRoot) {
  return path.join(projectRoot, '.runtime', 'cache', CACHE_FILENAME);
}

export async function readReasoningCache(projectRoot, promptDigest, options = {}) {
  if (options.disabled || options.forceReasoning) return null;
  try {
    const value = JSON.parse(await fs.readFile(cachePath(projectRoot), 'utf8'));
    if (value.version !== CACHE_VERSION || value.promptDigest !== promptDigest) return null;
    return Object.freeze({ ...value.result, cacheStoredAt: value.storedAt });
  } catch (error) {
    if (error.code === 'ENOENT' || error.name === 'SyntaxError') return null;
    throw error;
  }
}

export async function writeReasoningCache(projectRoot, promptDigest, result) {
  const file = cachePath(projectRoot);
  await ensureDir(path.dirname(file));
  await writeText(file, `${JSON.stringify({
    version: CACHE_VERSION,
    promptDigest,
    storedAt: new Date().toISOString(),
    result: {
      runId: result.runId,
      provider: result.provider,
      model: result.model,
      completedAt: result.completedAt,
      reportMarkdown: result.reportMarkdown,
      benchmarkSources: result.benchmarkSources,
      inspectedAssetIds: result.inspectedAssetIds
    }
  }, null, 2)}\n`);
  return file;
}
