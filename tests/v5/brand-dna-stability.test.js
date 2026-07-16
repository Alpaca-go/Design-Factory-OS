import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  StructuredValidationError,
  validateImageTasksV2
} from '../../src/v5/brand-dna/validation/image-task-validator.js';
import {
  ImageTaskMigrationError,
  migrateImageTaskSpecV1ToV2
} from '../../src/v5/brand-dna/migrations/image-task-v1-to-v2.js';
import { normalizeImageTaskOutput } from '../../src/v5/brand-dna/normalization/normalize-image-task-output.js';
import {
  applyStructuredRepairPatch,
  StructuredPatchError,
  validateStructuredRepairPatch
} from '../../src/v5/brand-dna/repair/structured-patch-repair.js';
import {
  applyTargetedRepairPatch,
  TargetedRepairPatchError,
  validateTargetedRepairPatch
} from '../../src/v5/brand-dna/repair/targeted-repair-patch.js';
import { createBrandDnaCheckpointStore } from '../../src/v5/brand-dna/runtime/checkpoint-store.js';

const imageSystem = {
  systemId: 'image-system-01',
  consistencyRules: ['保持低饱和色彩与稳定留白']
};
const geneIds = new Set(['gene-1']);

function task(index) {
  return {
    id: `task-${index + 1}`,
    sequence: index + 1,
    role: index === 0 ? 'anchor-image' : 'brand-poster',
    systemId: imageSystem.systemId,
    objective: '明确图片职责',
    brandDnaBasis: ['gene-1'],
    viewerTakeaway: '形成一致品牌认知',
    subject: '已批准的概念主体',
    environment: '概念环境',
    composition: '稳定构图',
    focalHierarchy: '清晰焦点',
    colorDirection: '低饱和色彩',
    materialAndTexture: '哑光材质',
    lighting: '柔和侧光',
    textPolicy: '只预留排版区域',
    logoPolicy: '不生成 Logo',
    aspectRatio: '3:2',
    finalPrompt: '完整的图片生成指令',
    prohibitedElements: ['虚构 Logo'],
    consistencyWithGlobalSystem: ['继承低饱和色彩、稳定留白与柔和侧光'],
    consistencyWithPreviousTasks: index === 0 ? [] : ['延续前图的色彩、留白与光线'],
    intentionalDifferenceFromPreviousTasks: index === 0
      ? ['首张图负责建立全局锚点']
      : [`第 ${index + 1} 张图新增验证使用关系，并采用不同视角避免重复前图`]
  };
}

test('image task v2 accepts an anchor without previous references and rejects semantic conflicts', () => {
  const valid = { imageTasks: [task(0), task(1), task(2), task(3)] };
  assert.equal(validateImageTasksV2(valid, imageSystem, geneIds).length, 4);

  const anchorWithPrevious = structuredClone(valid);
  anchorWithPrevious.imageTasks[0].consistencyWithPreviousTasks = ['不存在的前序任务'];
  assert.throws(
    () => validateImageTasksV2(anchorWithPrevious, imageSystem, geneIds),
    (error) => error instanceof StructuredValidationError
      && error.jsonPath === 'imageTasks[0].consistencyWithPreviousTasks'
  );

  const laterWithoutPrevious = structuredClone(valid);
  laterWithoutPrevious.imageTasks[1].consistencyWithPreviousTasks = [];
  assert.throws(
    () => validateImageTasksV2(laterWithoutPrevious, imageSystem, geneIds),
    (error) => error.jsonPath === 'imageTasks[1].consistencyWithPreviousTasks'
  );

  const secondAnchor = structuredClone(valid);
  secondAnchor.imageTasks[1].role = 'anchor-image';
  assert.throws(
    () => validateImageTasksV2(secondAnchor, imageSystem, geneIds),
    (error) => error.jsonPath === 'imageTasks[1].role'
  );
});

test('image task v2 aggregates text-policy and technical contradictions for one safe repair', () => {
  const invalid = { imageTasks: [task(0), task(1), task(2), task(3)] };
  invalid.imageTasks[0].textPolicy = 'no-text';
  invalid.imageTasks[0].requiredElements = ['必须显示 10–25℃'];
  invalid.imageTasks[1].lighting = '无阴影，同时使用强烈戏剧性硬阴影';
  invalid.imageTasks[2].finalPrompt = '必须展示 GSP 认证徽章';
  assert.throws(
    () => validateImageTasksV2(invalid, imageSystem, geneIds),
    (error) => error instanceof StructuredValidationError
      && error.jsonPaths.includes('imageTasks[0].textPolicy')
      && error.jsonPaths.includes('imageTasks[1].lighting')
      && error.jsonPaths.includes('imageTasks[2].finalPrompt')
  );
});

test('v1 migration copies only existing approved consistency rules', () => {
  const migrated = migrateImageTaskSpecV1ToV2({
    imageTasks: [
      { ...task(0), consistencyWithGlobalSystem: undefined, consistencyWithPreviousTasks: ['旧全局规则'] },
      { ...task(1), consistencyWithGlobalSystem: undefined, consistencyWithPreviousTasks: ['旧前序规则'] }
    ]
  }, imageSystem);
  assert.deepEqual(migrated.imageTasks[0].consistencyWithGlobalSystem, ['旧全局规则']);
  assert.deepEqual(migrated.imageTasks[0].consistencyWithPreviousTasks, []);
  assert.deepEqual(migrated.imageTasks[1].consistencyWithGlobalSystem, imageSystem.consistencyRules);
  assert.deepEqual(migrated.imageTasks[1].consistencyWithPreviousTasks, ['旧前序规则']);

  assert.throws(
    () => migrateImageTaskSpecV1ToV2({
      imageTasks: [{ ...task(0), consistencyWithGlobalSystem: undefined, consistencyWithPreviousTasks: [] }]
    }, {}),
    ImageTaskMigrationError
  );
});

test('deterministic normalization fixes safe structure without inventing creative content', () => {
  const source = {
    imageTasks: [
      {
        ...task(0),
        sequence: '9',
        role: 'ANCHOR_IMAGE',
        optionalElements: null,
        consistencyWithGlobalSystem: ['规则 A', '规则 A'],
        consistencyWithPreviousTasks: null
      }
    ]
  };
  const result = normalizeImageTaskOutput({ output: source, upstreamContext: { imageSystem } });
  assert.equal(result.output.imageTasks[0].sequence, 1);
  assert.equal(result.output.imageTasks[0].role, 'anchor-image');
  assert.deepEqual(result.output.imageTasks[0].optionalElements, []);
  assert.deepEqual(result.output.imageTasks[0].consistencyWithGlobalSystem, ['规则 A']);
  assert.deepEqual(result.output.imageTasks[0].consistencyWithPreviousTasks, []);
  assert.equal(result.output.imageTasks[0].finalPrompt, source.imageTasks[0].finalPrompt);
  assert.ok(result.warnings.some((item) => item.code === 'DUPLICATE_ARRAY_ITEM_REMOVED'));
});

test('structured patch changes only whitelisted paths and preserves the source object', () => {
  const source = { imageTasks: [task(0), { ...task(1), consistencyWithPreviousTasks: [] }] };
  const allowed = ['/imageTasks/1/consistencyWithPreviousTasks'];
  const patch = {
    stageId: 'gpt-image-task-compiler',
    targetObjectId: 'task-2',
    operations: [{
      op: 'replace',
      path: allowed[0],
      value: ['延续前图的构图、色彩与柔和侧光']
    }]
  };
  validateStructuredRepairPatch(patch, patch.stageId, allowed);
  const repaired = applyStructuredRepairPatch(source, patch, allowed);
  assert.deepEqual(source.imageTasks[1].consistencyWithPreviousTasks, []);
  assert.equal(repaired.imageTasks[1].consistencyWithPreviousTasks.length, 1);
  assert.throws(
    () => validateStructuredRepairPatch({
      ...patch,
      operations: [{ op: 'replace', path: '/imageSystem/lockedFacts', value: [] }]
    }, patch.stageId, allowed),
    (error) => error instanceof StructuredPatchError && error.code === 'PATCH_PATH_NOT_ALLOWED'
  );
  assert.throws(
    () => validateStructuredRepairPatch({
      ...patch,
      operations: [patch.operations[0]]
    }, patch.stageId, [...allowed, '/imageTasks/1/intentionalDifferenceFromPreviousTasks']),
    (error) => error instanceof StructuredPatchError
      && error.code === 'FAILED_SCHEMA_AFTER_PATCH'
      && error.message.includes('未修复全部授权路径')
  );
});

test('targeted repair patch changes compact leaf fields and rejects sweeping or protected edits', () => {
  const source = {
    brandDna: { oneSentenceDna: '原始 DNA', genes: [{ id: 'gene-1', statement: '原始基因' }] },
    creativeThesisDecision: { decisionScore: 92 },
    visualTranslation: { creativeTranslation: '原始转译' },
    imageSystem: { systemId: 'system-1', consistencyRules: ['原始规则'], lockedFacts: ['锁定事实'] },
    imageTasks: [task(0), task(1)]
  };
  const patch = {
    stageId: 'targeted-repair',
    operations: [{
      op: 'replace',
      path: '/imageTasks/1/finalPrompt',
      value: `${source.imageTasks[1].finalPrompt} subtle but distinct`
    }, {
      op: 'replace',
      path: '/imageSystem/consistencyRules',
      value: ['原始规则', '补充 B2C 与 B2B 视觉隔离规则']
    }]
  };
  validateTargetedRepairPatch(patch, source);
  const repaired = applyTargetedRepairPatch(source, patch);
  assert.notEqual(repaired.imageTasks[1].finalPrompt, source.imageTasks[1].finalPrompt);
  assert.equal(repaired.imageSystem.consistencyRules.length, 2);
  assert.equal(source.imageSystem.consistencyRules.length, 1);
  assert.throws(
    () => validateTargetedRepairPatch({
      ...patch,
      operations: [{ op: 'replace', path: '/imageTasks/1', value: task(1) }]
    }, source),
    (error) => error instanceof TargetedRepairPatchError
      && /叶子字段/.test(error.message)
  );
  assert.throws(
    () => validateTargetedRepairPatch({
      ...patch,
      operations: [{ op: 'replace', path: '/imageSystem/lockedFacts', value: [] }]
    }, source),
    (error) => error instanceof TargetedRepairPatchError
      && /不得修改 ID、证据引用或锁定事实/.test(error.message)
  );
  assert.throws(
    () => validateTargetedRepairPatch({
      ...patch,
      operations: [{ op: 'replace', path: '/brandDna/confirmedFact/value', value: '篡改' }]
    }, {
      ...source,
      brandDna: {
        ...source.brandDna,
        confirmedFact: { value: '已确认事实', status: 'confirmed' }
      }
    }),
    (error) => error instanceof TargetedRepairPatchError
      && /不得修改已确认事实/.test(error.message)
  );
});

test('checkpoint reuse requires matching source, upstream, prompt, schema, provider, model, and output hash', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-brand-dna-'));
  const root = path.join(temporary, 'brand-dna');
  const options = {
    root,
    corpus: {
      documents: [{
        id: 'doc-1',
        filename: 'brief.md',
        sourceType: 'markdown',
        rawText: 'approved source',
        characterCount: 15
      }]
    },
    analysisRunId: 'run-1',
    projectId: 'project-1',
    provider: 'qwen',
    modelId: 'qwen3.6-plus',
    apiProfileId: 'profile-1'
  };
  const store = createBrandDnaCheckpointStore(options);
  const value = { strategicModel: { positioning: 'approved' } };
  await store.saveStage({
    stageId: 'strategic-model',
    stageSequence: 3,
    upstreamOutputHash: 'upstream-1',
    promptVersion: 'prompt-v1',
    schemaVersion: 'schema-v1',
    stageProfile: { thinking: { enabled: false, budgetTokens: null }, maxOutputTokens: 5_000 },
    output: value,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  });
  const reused = await store.loadStage({
    stageId: 'strategic-model',
    stageSequence: 3,
    upstreamOutputHash: 'upstream-1',
    promptVersion: 'prompt-v1',
    schemaVersion: 'schema-v1',
    validator: (output) => output
  });
  assert.deepEqual(reused.value, value);
  assert.equal(await store.loadStage({
    stageId: 'strategic-model',
    stageSequence: 3,
    upstreamOutputHash: 'changed',
    promptVersion: 'prompt-v1',
    schemaVersion: 'schema-v1'
  }), null);
  assert.equal(await store.loadStage({
    stageId: 'strategic-model',
    stageSequence: 3,
    upstreamOutputHash: 'upstream-1',
    promptVersion: 'prompt-v2',
    schemaVersion: 'schema-v1'
  }), null);
  await fs.rm(temporary, { recursive: true, force: true });
});
