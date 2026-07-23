import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('default analyze CLI runs v5 and publishes only the v5 official document', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-v5-cli-'));
  const input = path.join(projectRoot, 'input');
  const output = path.join(projectRoot, 'outputs');
  const config = path.join(projectRoot, 'masterpiece-os-v5.json');
  await fs.mkdir(input);
  await fs.writeFile(path.join(input, 'asset.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  await fs.writeFile(config, JSON.stringify({
    version: '5.0',
    projectName: 'CLI Demo',
    deepCreativeDirectorResult: {
      runId: 'cli-deep-run',
      provider: 'fixture',
      model: 'fixture-model',
      completedAt: new Date().toISOString(),
      reportMarkdown: '# 项目视觉方案升级报告\n\nCLI v5 output.'
    }
  }));
  const cli = path.resolve('bin', 'masterpiece-os.js');
  const { stdout } = await execFileAsync(process.execPath, [
    cli, 'analyze', input, '--config', config, '--output', output
  ], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    // This is a fixture-backed CLI test. Never let developer-machine Provider
    // credentials turn it into a paid network smoke test.
    env: { ...process.env, MASTERPIECE_PROVIDER: '', QWEN_API_KEY: '', QWEN_MODEL: '' }
  });

  assert.match(stdout, /Masterpiece OS v5\.0 — Deep Creative Director Mode/);
  assert.match(stdout, /1 次完整推理/);
  assert.deepEqual((await fs.readdir(output)).filter((name) => name.endsWith('.md')), ['视觉方案升级报告.md']);
});

test('default v5 CLI rejects v4 mode selection', async () => {
  const cli = path.resolve('bin', 'masterpiece-os.js');
  await assert.rejects(
    execFileAsync(process.execPath, [cli, 'analyze', '.', '--mode', 'standard'], { cwd: path.resolve('.'), encoding: 'utf8' }),
    (error) => /--mode 已在 v5 废弃/.test(error.stderr)
  );
});

test('v5 CLI accepts provider and force-reasoning and reports a missing Qwen key safely', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-v5-provider-cli-'));
  const input = path.join(projectRoot, 'input');
  await fs.mkdir(input);
  await fs.writeFile(path.join(input, 'asset.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  const cli = path.resolve('bin', 'masterpiece-os.js');
  await assert.rejects(
    execFileAsync(process.execPath, [
      cli, 'analyze', input, '--provider', 'qwen', '--force-reasoning'
    ], {
      cwd: path.resolve('.'), encoding: 'utf8',
      env: { ...process.env, MASTERPIECE_PROVIDER: '', QWEN_API_KEY: '', QWEN_MODEL: 'qwen-vl-test' }
    }),
    (error) => /未检测到 QWEN_API_KEY/.test(error.stderr) && !/qwen-vl-test.*QWEN_API_KEY/.test(error.stderr)
  );
});
