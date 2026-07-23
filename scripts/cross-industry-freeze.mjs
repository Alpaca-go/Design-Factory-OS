#!/usr/bin/env node
import { copyFile, readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  evaluateCrossIndustryFreeze
} from '../src/v5/visual-translation/v2/freeze-test/cross-industry-freeze.js';
import {
  buildCrossIndustryFreezeArtifacts,
  compareFrozenComponentManifests,
  createFrozenComponentManifest
} from '../src/v5/visual-translation/v2/freeze-test/freeze-artifacts.js';

const [command = 'evaluate', ...args] = process.argv.slice(2);
const options = parse(args);
const execFileAsync = promisify(execFile);

try {
  const repositoryRoot = path.resolve(options.repository || process.cwd());
  if (command === 'baseline') {
    const outputPath = path.resolve(required(options.output, '--output'));
    const git = await readGitState(repositoryRoot);
    if (git.dirty && !options['allow-dirty']) {
      throw new Error('Refusing to create a freeze baseline from a dirty worktree; commit the baseline first');
    }
    const manifest = await createFrozenComponentManifest(repositoryRoot);
    const baseline = {
      schema_version: 'cross-industry-freeze-baseline-v1',
      commit: String(options.commit || git.commit),
      tag: String(options.tag || 'retrieval-first-cross-industry-baseline'),
      created_at: new Date().toISOString(),
      dirty_worktree: git.dirty,
      frozen_component_manifest: manifest
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ output: outputPath, digest: manifest.digest }, null, 2)}\n`);
    process.exit(0);
  }
  if (command !== 'evaluate') throw new TypeError('Command must be baseline or evaluate');
  const inputPath = required(options.input, '--input');
  const outputRoot = path.resolve(required(options.output, '--output'));
  const payload = JSON.parse(await readFile(inputPath, 'utf8'));
  const currentManifest = await createFrozenComponentManifest(repositoryRoot);
  const baselineManifest = payload.baseline?.frozen_component_manifest;
  if (!baselineManifest) throw new TypeError('input.baseline.frozen_component_manifest is required; run the baseline command first');
  const freezeIntegrity = compareFrozenComponentManifests(baselineManifest, currentManifest);
  const evaluation = evaluateCrossIndustryFreeze(payload.records || payload, {
    baselineCommit: payload.baseline?.commit || options.commit,
    baselineTag: payload.baseline?.tag,
    baselineDirty: payload.baseline?.dirty_worktree === true,
    frozenComponentManifest: baselineManifest,
    frozenComponentsIntact: freezeIntegrity.frozen_components_intact
  });
  const artifacts = buildCrossIndustryFreezeArtifacts(evaluation, { freezeIntegrity });
  for (const [relativePath, content] of artifacts) {
    const target = path.resolve(outputRoot, relativePath);
    if (!target.startsWith(`${outputRoot}${path.sep}`)) throw new Error(`Unsafe artifact path: ${relativePath}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  for (const record of evaluation.records) {
    const folder = `${record.test_id}-${record.project_name.replace(/[<>:"/\\|?*]/gu, '_')}`;
    const copies = [
      [record.artifacts.input_manifest_path, `${folder}/input/input-manifest.json`],
      [record.artifacts.report_path, `${folder}/output/06-Visual-Directions-Report.md`],
      [record.artifacts.audit_path, `${folder}/output/06-Visual-Directions-Audit.md`],
      [record.artifacts.runtime_log_path, `${folder}/output/runtime-log.json`]
    ];
    for (const [source, relativeTarget] of copies) {
      if (!source) throw new TypeError(`${record.test_id} is missing required artifact path for ${relativeTarget}`);
      const target = path.resolve(outputRoot, relativeTarget);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.resolve(source), target);
    }
  }
  process.stdout.write(`${JSON.stringify({
    output: outputRoot,
    artifact_count: artifacts.size,
    freeze_integrity: freezeIntegrity,
    freeze_decision: evaluation.freeze_decision,
    development_allowed: evaluation.development_allowed
  }, null, 2)}\n`);
  if (!freezeIntegrity.frozen_components_intact || evaluation.freeze_decision === 'failed') process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function parse(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) throw new TypeError(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = args[index + 1];
    options[key] = !next || next.startsWith('--') ? true : args[++index];
  }
  return options;
}

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value;
}

async function readGitState(repositoryRoot) {
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }),
    execFileAsync('git', ['status', '--porcelain'], { cwd: repositoryRoot })
  ]);
  return { commit: commit.trim(), dirty: Boolean(status.trim()) };
}
