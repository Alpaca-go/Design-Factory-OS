import fs from 'node:fs/promises';
import path from 'node:path';
import { appendSprint2Report } from '../report/append-sprint-2-report.js';
import { applyAnchorConfirmationReview } from '../runtime/anchor-confirmation-review.js';
import { buildSprint2QualitySummary } from '../runtime/build-sprint-2-quality-summary.js';
import { runVisualLanguageConstruction } from '../runtime/run-visual-language-construction.js';
import { createFixtureSprint2SemanticEvaluator } from '../runtime/sprint-2-semantic-evaluator.js';
import { validateSprint2RuntimeCheckpoint } from '../runtime/sprint-2-runtime-checkpoint-store.js';
import { createFixtureVisualLanguageProviderAdapter } from '../runtime/visual-language-provider-adapter.js';

const COMMANDS = Object.freeze(['build-anchor', 'confirm-anchor', 'continue', 'retry', 'report', 'inspect']);

export async function runSprint2QualityCli(argv, dependencies = {}) {
  const options = parseArguments(argv);
  const command = options._[0];
  if (!COMMANDS.includes(command)) throw new Error(`Sprint 2 command must be one of: ${COMMANDS.join(', ')}`);
  const io = dependencies.fs || fs;
  const plan = { command, dry_run: Boolean(options['dry-run']), checkpoint: options.checkpoint || null, output: options.output || null };
  if (options['dry-run']) return { status: 'dry_run', plan };

  if (command === 'build-anchor') {
    const input = await readJson(io, required(options.input, '--input'));
    const providerAdapter = dependencies.providerAdapter || await loadFixtureProvider(io, required(options['fixture-provider'], '--fixture-provider'));
    const evaluator = dependencies.evaluator || await loadFixtureEvaluator(io, options['fixture-evaluator']);
    const result = await runVisualLanguageConstruction({ input, providerAdapter, evaluator });
    await writeJson(io, required(options.checkpoint || options.output, '--checkpoint or --output'), result.checkpoint);
    return { status: result.status, checkpoint: result.checkpoint, no_report: Boolean(options['no-report']) };
  }

  const checkpointFile = required(options.checkpoint, '--checkpoint');
  const checkpoint = validateSprint2RuntimeCheckpoint(await readJson(io, checkpointFile));

  if (command === 'confirm-anchor') {
    const review = await readJson(io, required(options.input, '--input review record'));
    if (options.anchor && review.selected_anchor_id !== options.anchor) throw new Error('--anchor must match review.selected_anchor_id');
    const updated = applyAnchorConfirmationReview(checkpoint, review, { clock: dependencies.clock });
    await writeJson(io, options.output || checkpointFile, updated);
    return { status: updated.status, checkpoint: updated };
  }

  if (command === 'continue' || command === 'retry') {
    const providerAdapter = dependencies.providerAdapter || await loadFixtureProvider(io, required(options['fixture-provider'], '--fixture-provider'));
    const evaluator = dependencies.evaluator || await loadFixtureEvaluator(io, options['fixture-evaluator']);
    const retryModules = command === 'retry' ? [required(options.module, '--module')] : [];
    const result = await runVisualLanguageConstruction({
      input: checkpoint.input_contract,
      providerAdapter,
      evaluator,
      resumeCheckpoint: checkpoint,
      retryModules
    });
    await writeJson(io, options.output || checkpointFile, result.checkpoint);
    return { status: result.status, checkpoint: result.checkpoint, no_report: Boolean(options['no-report']) };
  }

  if (command === 'report') {
    const sprint1 = await io.readFile(required(options.input, '--input Sprint 1 report'), 'utf8');
    const report = appendSprint2Report(sprint1, checkpoint);
    await writeText(io, required(options.output, '--output'), report);
    return { status: 'reported', output: path.resolve(options.output) };
  }

  const summary = buildSprint2QualitySummary(checkpoint);
  if (options.output) await writeJson(io, options.output, summary);
  return { status: 'inspected', summary };
}

export function parseSprint2QualityCliArguments(argv) {
  return parseArguments(argv);
}

function parseArguments(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      result._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (['dry-run', 'resume', 'no-report'].includes(key)) result[key] = true;
    else result[key] = argv[++index];
  }
  return result;
}

async function loadFixtureProvider(io, file) {
  const fixture = await readJson(io, file);
  return createFixtureVisualLanguageProviderAdapter({
    constructAnchorCandidates: fixture.anchor_candidates,
    constructPrimaryDna: fixture.primary_dna,
    constructSupportingDna: fixture.supporting_dna,
    constructGrammarStage: ({ stage }) => fixture.grammar_stages?.[stage],
    ...(fixture.replacement_candidates ? {
      reconstructAnchorCandidate: ({ candidate_to_replace }) => fixture.replacement_candidates[candidate_to_replace]
    } : {})
  }, { version: fixture.version || 'cli-fixture-provider-v1' });
}

async function loadFixtureEvaluator(io, file) {
  if (!file) return undefined;
  const fixture = await readJson(io, file);
  return createFixtureSprint2SemanticEvaluator(fixture.results || {}, {
    version: fixture.version || 'cli-fixture-evaluator-v1',
    differenceResults: fixture.difference_results || {}
  });
}

async function readJson(io, file) {
  return JSON.parse(await io.readFile(path.resolve(file), 'utf8'));
}

async function writeJson(io, file, value) {
  await writeText(io, file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(io, file, value) {
  const target = path.resolve(file);
  await io.mkdir(path.dirname(target), { recursive: true });
  await io.writeFile(target, value, 'utf8');
}

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value;
}
