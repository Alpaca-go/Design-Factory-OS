import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inventoryProject } from '../../src/inventory.js';
import { createV5ProjectConfig } from '../../src/v5/config/schema.js';
import { prepareVisualAssets } from '../../src/v5/preparation/visual-preparation.js';
import { prepareBenchmarks } from '../../src/v5/preparation/benchmark-preparation.js';
import { runDeepCreativeDirector } from '../../src/v5/creative-director/deep-creative-director.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

async function fixture(count = 7) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-v5-prep-'));
  const input = path.join(projectRoot, 'input');
  await fs.mkdir(input, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    await fs.writeFile(path.join(input, `${String(index + 1).padStart(2, '0')}.png`), ONE_PIXEL_PNG);
  }
  const inventory = await inventoryProject(input);
  const config = createV5ProjectConfig({
    projectName: 'Preparation Demo',
    brandFacts: { brandName: 'Demo', industry: '医学美学', logoAssets: ['01.png'] }
  });
  return { projectRoot, inventory, config };
}

test('visual preparation creates one contact sheet, limits detail attachments, and then hits cache', async () => {
  const { projectRoot, inventory, config } = await fixture();
  const first = await prepareVisualAssets(inventory, config, { projectRoot });
  assert.equal(first.strategy, 'contact-sheet-plus-priority-details');
  assert.equal(first.contactSheetGenerated, true);
  assert.ok(first.contactSheetTimeMs > 0);
  assert.equal(first.priorityAssetIds.length, 5);
  assert.equal(first.attachments.length, 6);
  assert.equal(first.attachments[0].assetId, 'contact-sheet');
  assert.ok(first.priorityAssetIds.includes('asset-001'));
  const contactSheet = await fs.readFile(first.contactSheetPath);
  assert.equal(contactSheet.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

  const second = await prepareVisualAssets(inventory, config, { projectRoot });
  assert.equal(second.cacheHit, true);
  assert.equal(second.contactSheetGenerated, false);
  assert.equal(second.contactSheetTimeMs, 0);
});

test('benchmark preparation bounds resolver output and reuses its industry cache', async () => {
  const { projectRoot, config } = await fixture(1);
  const cacheRoot = path.join(projectRoot, '.runtime', 'cache', 'benchmarks');
  let calls = 0;
  const resolver = async () => {
    calls += 1;
    return {
      category: ['A', 'B', 'C', 'D'],
      creativeExcellence: ['E', 'F', 'G', 'H']
    };
  };
  const first = await prepareBenchmarks(config, { projectRoot, cacheRoot, resolver });
  const second = await prepareBenchmarks(config, { projectRoot, cacheRoot, resolver });
  assert.equal(calls, 1);
  assert.equal(first.category.length, 3);
  assert.equal(first.category.length + first.creativeExcellence.length, 6);
  assert.equal(second.cacheHit, true);
  assert.equal(second.resolverCalls, 0);
});

test('explicit project Benchmark context takes precedence over an industry cache', async () => {
  const { projectRoot } = await fixture(1);
  const config = createV5ProjectConfig({
    projectName: 'Explicit Benchmark',
    brandFacts: { brandName: 'Demo', industry: '医学美学' },
    benchmarkContext: { category: ['Project-specific clinical benchmark'] }
  });
  const prepared = await prepareBenchmarks(config, {
    projectRoot,
    resolver: async () => { throw new Error('resolver must not run'); }
  });
  assert.equal(prepared.source, 'project-config');
  assert.deepEqual(prepared.category, ['Project-specific clinical benchmark']);
  assert.equal(prepared.resolverCalls, 0);
});

test('creative reasoner receives an abort signal and fails at the configured deadline', async () => {
  const { projectRoot, inventory, config } = await fixture(1);
  let receivedSignal = null;
  await assert.rejects(runDeepCreativeDirector(
    { projectRoot, projectName: 'Deadline Demo', inventory, config },
    {
      maximumDurationMs: 5,
      prompt: { promptDigest: 'deadline', modelCalls: 1, messages: [], attachments: [] },
      reasoner: ({ signal }) => {
        receivedSignal = signal;
        return new Promise(() => {});
      }
    }
  ), { code: 'TIME_BUDGET_EXCEEDED' });
  assert.equal(receivedSignal.aborted, true);
});
