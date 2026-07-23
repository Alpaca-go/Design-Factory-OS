#!/usr/bin/env node
import path from 'node:path';
import { createJsonShadowResultStore } from '../storage/quality-system/index.js';
import { runOfflineShadowBatch } from '../orchestrators/quality-system/index.js';
import { exportHumanReviews, importHumanReviews } from '../reviews/quality-system/index.js';
import { buildAccuracyReport } from '../metrics/quality-system/index.js';

const { command, options } = parse(process.argv.slice(2));

try {
  const store = createJsonShadowResultStore({ rootDir: required(options.store, '--store') });
  let result;
  if (command === 'run') {
    const roots = arrayOption(options.root);
    if (!roots.length) throw new TypeError('run requires at least one --root');
    result = await runOfflineShadowBatch({ roots, store, force: Boolean(options.force), dryRun: Boolean(options['dry-run']) });
  } else if (command === 'review-export') {
    result = await exportHumanReviews({ store, format: options.format || 'json', outputPath: required(options.output, '--output') });
    result = { format: result.format, count: result.count, output: path.resolve(options.output) };
  } else if (command === 'review-import') {
    result = await importHumanReviews({ store, input: required(options.input, '--input'), format: options.format });
  } else if (command === 'accuracy') {
    result = buildAccuracyReport({ records: await store.list() });
    if (options.output) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
      await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }
  } else {
    throw new TypeError('Command must be run, review-export, review-import, or accuracy');
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function parse(args) {
  const [command, ...rest] = args;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new TypeError(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = rest[index + 1];
    const value = !next || next.startsWith('--') ? true : rest[++index];
    if (key === 'root') options.root = [...arrayOption(options.root), value];
    else options[key] = value;
  }
  return { command, options };
}

function arrayOption(value) {
  return value === undefined ? [] : (Array.isArray(value) ? value : [value]);
}

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value;
}
