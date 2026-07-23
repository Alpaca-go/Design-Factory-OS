#!/usr/bin/env node
import { runSprint2QualityCli } from '../src/v5/visual-translation/v1/cli/run-sprint-2-quality-cli.js';

try {
  const result = await runSprint2QualityCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
