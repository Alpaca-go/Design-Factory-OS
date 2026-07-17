import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(label, executable, args) {
  process.stdout.write(`\n[document-flow] ${label}\n`);
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const coreTests = [
  'tests/v5/brand-dna-pipeline.test.js',
  'tests/v5/brand-dna-response-parser.test.js',
  'tests/v5/brand-dna-v3-core-quality.test.js',
  'tests/v5/brand-dna-v3-core.test.js'
];
const desktopTests = fs.readdirSync(path.join(root, 'apps/desktop/tests'))
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => path.join('apps/desktop/tests', name));

run('Brand DNA v2/v3 schema, repair, checkpoint and report paths', process.execPath, ['--test', ...coreTests]);
run('Desktop document parsing, project intake and delivery paths', process.execPath, [
  'apps/desktop/node_modules/tsx/dist/cli.mjs',
  '--test',
  ...desktopTests
]);
run('Desktop TypeScript contracts', process.execPath, [
  'apps/desktop/node_modules/typescript/bin/tsc',
  '--noEmit',
  '-p',
  'apps/desktop/tsconfig.json'
]);

process.stdout.write('\n[document-flow] PASS — document delivery gate completed without external API calls.\n');
