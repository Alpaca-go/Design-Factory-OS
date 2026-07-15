import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { readCreativeDecisionState } from './creative-decision-state-store.js';
import { V4_STANDARD_OUTPUT_FILES } from './v4-bootstrap.js';
import { validationReportFilename } from './validation-report.js';

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Lightweight project delivery verification for Validation runs. */
export async function validateProjectDelivery(projectRoot) {
  const started = performance.now();
  const root = path.resolve(projectRoot);
  const projectName = path.basename(root);
  const output = path.join(root, 'outputs');
  const state = await readCreativeDecisionState(root, { required: true });
  const checks = [];
  const add = (check, passed, evidence) => checks.push({ check, passed, evidence });

  add('Active State', state.meta.status === 'approved', state.meta.status);
  add('State Readiness', state.governance.readiness === 'release-ready', state.governance.readiness);
  add('State Digest', typeof state.meta.stateDigest === 'string' && state.meta.stateDigest.length === 64, state.meta.stateDigest);

  for (const filename of V4_STANDARD_OUTPUT_FILES) {
    add(`Output ${filename}`, await exists(path.join(output, filename)), filename);
  }

  const report = validationReportFilename(projectName);
  add('Validation Report', await exists(path.join(output, report)), report);
  add('Runtime GPT Brief', !await exists(path.join(output, 'Creative-Brief-GPT.md')), 'must not persist');

  const reviewPath = path.join(output, '04-Design-Review.md');
  if (await exists(reviewPath)) {
    const review = await fs.readFile(reviewPath, 'utf8');
    add('Design Review', /## Overall\s+PASS\b/.test(review), '04-Design-Review.md');
    add('Review State Identity', review.includes(state.meta.decisionId) && review.includes(state.meta.stateDigest), state.meta.decisionId);
  }

  const debugPath = path.join(output, 'masterpiece-os-result.json');
  if (await exists(debugPath)) {
    const debug = JSON.parse(await fs.readFile(debugPath, 'utf8'));
    add('Debug Review', debug.review?.status === 'PASS', debug.review?.status || 'missing');
    add('Debug State Identity', debug.state?.meta?.stateDigest === state.meta.stateDigest, debug.state?.meta?.stateDigest || 'missing');
  }

  return {
    version: '4.0.0',
    project: projectName,
    projectRoot: root,
    status: checks.every((item) => item.passed) ? 'PASS' : 'FAIL',
    durationMs: Number((performance.now() - started).toFixed(3)),
    checks
  };
}

export function formatValidationCheck(result) {
  const rows = result.checks.map((item) => `${item.passed ? 'PASS' : 'FAIL'}  ${item.check} — ${item.evidence}`);
  return [
    `[Validation Check] ${result.project}`,
    ...rows,
    `Result: ${result.status}`,
    `Duration: ${result.durationMs} ms`
  ].join('\n');
}
