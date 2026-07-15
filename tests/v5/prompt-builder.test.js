import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createV5ProjectConfig } from '../../src/v5/config/schema.js';
import { buildDeepCreativeDirectorPrompt } from '../../src/v5/creative-director/prompt-builder.js';

function context() {
  return {
    projectName: 'Prompt Demo',
    config: createV5ProjectConfig({
      projectName: 'Prompt Demo',
      userTask: '升级医学美学视觉系统',
      brandFacts: {
        brandName: 'Prompt Brand',
        industry: '医学美学',
        factualConstraints: ['不得编造医疗资质'],
        logoAssets: ['logo.png']
      },
      overrides: {
        requiredApplications: ['包装', '海报', '空间'],
        forbiddenChanges: ['不得回到通用紫色医美模板']
      }
    }),
    inventory: {
      root: path.resolve('fixture-input'),
      totalFiles: 2,
      imageCount: 2,
      items: [
        { path: 'logo.png', type: '图片', extension: '.png', bytes: 10, isImage: true, detail: { width: 10, height: 10 }, warning: null },
        { path: 'mockup.png', type: '图片', extension: '.png', bytes: 20, isImage: true, detail: { width: 20, height: 20 }, warning: null }
      ]
    }
  };
}

test('Prompt Builder merges maintainable modules into one model request', async () => {
  const prompt = await buildDeepCreativeDirectorPrompt(context());
  assert.equal(prompt.modelCalls, 1);
  assert.equal(prompt.messages.length, 2);
  assert.deepEqual(prompt.sections, [
    'projectInput', 'assetManifest', 'explicitConstraints', 'benchmark', 'executionCore', 'reportSchema'
  ]);
  assert.equal(prompt.attachments.length, 2);
  assert.equal(prompt.promptDigest.length, 64);
});

test('System Prompt establishes evidence, Logo and Maximum authority boundaries', async () => {
  const prompt = await buildDeepCreativeDirectorPrompt(context());
  const system = prompt.messages[0].content;
  assert.match(system, /顶级 Creative Director/);
  assert.match(system, /证据，不是必须服从或逐项继承的模板/);
  assert.match(system, /Logo 默认 Locked/);
  assert.match(system, /Maximum Creative Authority/);
  assert.match(system, /保留、升级、替换、删除或新增/);
  assert.match(system, /一个且只有一个视觉升级命题/);
  assert.match(system, /“更高级”“更现代”“更简洁”/);
});

test('User Prompt contains both Benchmark types, Execution Core and the fixed report schema', async () => {
  const prompt = await buildDeepCreativeDirectorPrompt(context());
  const user = prompt.messages[1].content;
  assert.match(user, /Category Benchmark/);
  assert.match(user, /Creative Excellence Benchmark/);
  assert.match(user, /不得固定为恰好三个同行品牌/);
  assert.match(user, /## 0\. GPT Execution Core/);
  assert.match(user, /Logo Locked 声明/);
  assert.match(user, /Anchor Image/);
  assert.match(user, /\| 视觉资产 \| 决策 \| 当前问题 \| 新动作 \|/);
  assert.match(user, /决策值只允许：保留、升级、替换、删除、新增/);
  assert.match(user, /## 10\. 最终锁定、开放与禁止清单/);
  assert.doesNotMatch(user, /固定为恰好三个同行品牌。最终/);
});
