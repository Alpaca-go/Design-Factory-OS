import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function run(label, executable, args) {
  process.stdout.write(`\n[document-flow] ${label}\n`);
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('Visual Translation V1 schema, checkpoint, directions and report paths', process.execPath, ['--test', 'tests/v5/visual-translation-v1.test.js']);
run('Desktop document parsing paths', process.execPath, ['apps/desktop/node_modules/tsx/dist/cli.mjs', '--test', 'apps/desktop/tests/visual-translation-document-processing.test.ts']);
run('Desktop TypeScript contracts', process.execPath, ['apps/desktop/node_modules/typescript/bin/tsc', '--noEmit', '-p', 'apps/desktop/tsconfig.json']);
process.stdout.write('\n[document-flow] PASS — Visual Translation document gate completed without external API calls.\n');
