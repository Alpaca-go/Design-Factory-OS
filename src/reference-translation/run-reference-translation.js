import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  REFERENCE_TRANSLATION_VERSION,
  REFERENCE_TRANSLATION_SCHEMA_VERSION,
  validateVisualSourceRole
} from './types.js';
import { synthesizeReferenceVisualDNA } from './reference-visual-dna.js';
import { classifyTransferability } from './classify-transferability.js';
import { mapReferenceToProject } from './map-to-project.js';
import { validateReferenceTranslationProfile } from './schemas.js';

const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function readJson(file) {
  const text = await fs.readFile(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw Object.assign(new Error(`无法解析 JSON：${file}（${error.message}）`), { code: 'REFERENCE_INPUT_JSON_INVALID' });
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

export async function runReferenceTranslation({
  visualAnalysisPath,
  projectContextPath,
  outputPath,
  preference = '',
  force = false,
  now = () => new Date()
}) {
  if (!visualAnalysisPath || !projectContextPath || !outputPath) {
    throw new Error('visualAnalysisPath、projectContextPath 和 outputPath 均为必填');
  }
  validateVisualSourceRole('reference_project');
  const startedAt = now();
  const [visualAnalysis, projectContext] = await Promise.all([
    readJson(path.resolve(visualAnalysisPath)),
    readJson(path.resolve(projectContextPath))
  ]);
  const cacheKey = hash({
    visualAnalysis, projectContext, preference,
    visualAnalysisVersion: visualAnalysis.schema_version || visualAnalysis.version || 'unknown',
    referenceTranslationVersion: REFERENCE_TRANSLATION_VERSION
  });
  const absoluteOutput = path.resolve(outputPath);
  const runPath = `${absoluteOutput}.run.json`;
  if (!force) {
    try {
      const [cached, run] = await Promise.all([readJson(absoluteOutput), readJson(runPath)]);
      if (run.cache_key === cacheKey && run.status === 'completed') {
        return { profile: validateReferenceTranslationProfile(cached), run: { ...run, cache_hit: true }, outputPath: absoluteOutput, runPath };
      }
    } catch { /* a missing or invalid cache is rebuilt */ }
  }

  const stepMetrics = [];
  const step = async (stepId, operation) => {
    const start = performance.now();
    try {
      const output = await operation();
      stepMetrics.push({ step: stepId, status: 'completed', duration_ms: Math.round(performance.now() - start), model: null, token_usage: null });
      return output;
    } catch (error) {
      stepMetrics.push({ step: stepId, status: 'failed', duration_ms: Math.round(performance.now() - start), error_code: error.code || 'REFERENCE_STEP_FAILED' });
      throw error;
    }
  };

  try {
    const synthesis = await step('REFERENCE_DNA_COMPLETED', () => synthesizeReferenceVisualDNA(visualAnalysis));
    const transferability = await step('TRANSFERABILITY_COMPLETED', () => classifyTransferability(synthesis.referenceVisualDNA));
    const matrix = await step('PROJECT_MAPPING_COMPLETED', () => mapReferenceToProject({
      referenceVisualDNA: synthesis.referenceVisualDNA,
      transferability,
      projectContext,
      preference
    }));
    const prohibited = transferability.prohibitedToCopy;
    const profile = await step('PROFILE_VALIDATED', () => validateReferenceTranslationProfile({
      schema_version: REFERENCE_TRANSLATION_SCHEMA_VERSION,
      source_role: 'reference_project',
      referenceIdentity: synthesis.referenceIdentity,
      referenceVisualDNA: synthesis.referenceVisualDNA,
      transferability,
      sourceRisks: {
        signatureAssets: prohibited.map((item) => item.name),
        recognizableCombinations: prohibited.filter((item) => /构图|组合|场景/u.test(item.name)).map((item) => item.name),
        similarityWarnings: prohibited.length ? ['禁止复制项必须进入后续 Similarity Risk Gate。'] : []
      },
      projectTranslationMatrix: matrix
    }));
    const completedAt = now();
    const run = {
      run_version: REFERENCE_TRANSLATION_VERSION,
      status: 'completed',
      source_role: 'reference_project',
      cache_key: cacheKey,
      cache_hit: false,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      model_calls: 0,
      token_usage: null,
      steps: stepMetrics
    };
    await writeJsonAtomic(absoluteOutput, profile);
    await writeJsonAtomic(runPath, run);
    return { profile, run, outputPath: absoluteOutput, runPath };
  } catch (error) {
    const failedAt = now();
    await writeJsonAtomic(runPath, {
      run_version: REFERENCE_TRANSLATION_VERSION,
      status: 'failed',
      source_role: 'reference_project',
      cache_key: cacheKey,
      cache_hit: false,
      started_at: startedAt.toISOString(),
      completed_at: failedAt.toISOString(),
      duration_ms: Math.max(0, failedAt.getTime() - startedAt.getTime()),
      error: { code: error.code || 'REFERENCE_TRANSLATION_FAILED', message: error.message },
      steps: stepMetrics
    });
    throw error;
  }
}

