import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', 'tests/pipeline.test.js'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
