import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipeline } from '../src/pipeline.js';

const projects = ['九州美学', '帅府', '小熊工坊'];

for (const project of projects) {
  test(`长期回归：${project}`, async () => {
    const root = path.resolve('examples', project);
    const output = await fs.mkdtemp(path.join(os.tmpdir(), `design-factory-${project}-`));
    const { result } = await runPipeline(root, { output });
    assert.equal(result.brandLock.brandName, project);
    assert.match(result.brandLock.primaryColor, /^#[0-9A-F]{6}$/);
    assert.ok(!result.brandLock.secondaryColors.includes(result.brandLock.primaryColor));
    assert.ok(result.brandLock.logo.files.length >= 1);
    assert.equal(result.imagePlan.count, 13);
    assert.equal(result.gaps.topThree.length, 3);
    const taskPackage = await fs.readFile(path.join(output, '05-Chat生图任务包.md'), 'utf8');
    assert.match(taskPackage, new RegExp(project));
    assert.match(taskPackage, /## 1\. Brand Lock/);
    assert.match(taskPackage, /## 2\. Chat 执行规则/);
    assert.match(taskPackage, /## 3\. 图片队列/);
    assert.match(taskPackage, /## 4\. 图片任务卡/);
    assert.match(taskPackage, /## 5\. 全局验收标准/);
    assert.doesNotMatch(taskPackage, /\\n\+?>/);
    const json = JSON.parse(await fs.readFile(path.join(output, 'design-factory-result.json'), 'utf8'));
    assert.equal(json.imagePlan.cards.length, 13);
  });
}

test('重复运行不会把自定义输出当作素材', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-factory-idempotent-'));
  await fs.cp(path.resolve('examples', '九州美学'), root, { recursive: true });
  const output = path.join(root, 'reports', 'latest');
  const first = await runPipeline(root, { output });
  const second = await runPipeline(root, { output });
  assert.equal(second.result.inventory.totalFiles, first.result.inventory.totalFiles);
  assert.ok(!second.result.inventory.items.some((x) => x.path.startsWith('reports/')));
});
