import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyFieldRepairPatch,
  buildFieldRepairPrompt,
  conservativelyNormalizeDirectionSet,
  SAFE_ASSET_AUTHORIZATION,
  runStableStep4
} from '../../src/v5/visual-translation/v2/runtime/run-step4-stable.js';
import {
  COMPOSITION_TOUCHPOINTS,
  collectExecutionDirectionV2ValidationErrors,
  validateExecutionDirectionV2,
  validateExecutionDirectionV2Set
} from '../../src/v5/visual-translation/v2/schemas/direction-contract-v2.js';
import { buildExecutionDirectionV2Prompt } from '../../src/v5/visual-translation/v2/prompts/direction-generation-prompt-v2.js';
import { VISUAL_TRANSLATION_V2_RUNTIME_CONFIG } from '../../src/v5/visual-translation/v2/config/visual-translation-v2-runtime-config.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const profile = { thinking: true, thinkingBudget: 1000 };
const validPayload = JSON.stringify({
  visualDirectionV2Set: {
    directions: [{
      direction_id: 'E01',
      brand_evidence: '已验证的中文品牌事实。',
      execution_constraints: ['不得使用未经证据支持的数据。'],
      template_risks: ['避免通用科技节点网络。']
    }]
  }
});

function baseOptions(overrides = {}) {
  return {
    projectId: 'project-1',
    runId: 'run-1',
    messages: [{ role: 'system', content: 'generate' }],
    profile,
    maxOutputTokens: 20_000,
    validate(directions) {
      const direction = directions[0];
      if (typeof direction.brand_evidence !== 'string') {
        throw Object.assign(new Error('brand_evidence must be a string'), {
          code: 'FAILED_SCHEMA',
          path: 'visualDirectionV2Set.directions[0].brand_evidence'
        });
      }
      return directions;
    },
    ...overrides
  };
}

test('stable Step 4 completes with exactly one primary provider call', async () => {
  let calls = 0;
  const statuses = [];
  const result = await runStableStep4(baseOptions({
    reasoner: async () => {
      calls += 1;
      return { text: validPayload };
    },
    onStatus: (status) => statuses.push(status.status)
  }));
  assert.equal(calls, 1);
  assert.equal(result.modelCallCount, 1);
  assert.deepEqual(statuses, ['running', 'completed']);
  assert.equal(result.events.at(-1).event, 'STEP4_COMPLETED');
});

test('invalid JSON fails with a terminal status and a specific code', async () => {
  const statuses = [];
  const events = [];
  await assert.rejects(() => runStableStep4(baseOptions({
    reasoner: async () => ({ text: 'not-json' }),
    onStatus: (status) => statuses.push(status),
    onEvent: (event) => events.push(event)
  })), (error) => error.code === 'STEP4_JSON_PARSE_FAILED');
  assert.equal(statuses.at(-1).status, 'failed');
  assert.equal(statuses.at(-1).code, 'STEP4_JSON_PARSE_FAILED');
  assert.equal(events.at(-1).event, 'STEP4_FAILED');
});

test('schema failure permits one field-level repair and no recursion', async () => {
  let calls = 0;
  const invalidPayload = JSON.stringify({ visualDirectionV2Set: { directions: [{ brand_evidence: null }] } });
  const result = await runStableStep4(baseOptions({
    reasoner: async (messages) => {
      calls += 1;
      if (calls === 1) return { text: invalidPayload };
      assert.match(messages[0].content, /visualDirectionV2Set\.directions\[0\]\.brand_evidence/u);
      assert.match(messages[0].content, /bounded correction patch/u);
      assert.match(messages[0].content, /Preserve all unlisted fields/u);
      return { text: JSON.stringify({ corrections: [{
        path: 'visualDirectionV2Set.directions[0].brand_evidence',
        value: '已验证的中文品牌事实。'
      }] }) };
    }
  }));
  assert.equal(calls, 2);
  assert.equal(result.repaired, true);
  assert.equal(result.events.filter((event) => event.event === 'STEP4_REPAIR_START').length, 1);
});

test('a failed repair stops after the second provider call', async () => {
  let calls = 0;
  const invalidPayload = JSON.stringify({ visualDirectionV2Set: { directions: [{ brand_evidence: null }] } });
  await assert.rejects(() => runStableStep4(baseOptions({
    reasoner: async () => {
      calls += 1;
      if (calls === 1) return { text: invalidPayload };
      return { text: JSON.stringify({ corrections: [{
        path: 'visualDirectionV2Set.directions[0].brand_evidence', value: null
      }] }) };
    }
  })), (error) => error.code === 'FAILED_SCHEMA');
  assert.equal(calls, 2);
});

test('a failed repair preserves the parsed primary response and resume calls Repair only', async () => {
  const invalidPayload = JSON.stringify({ visualDirectionV2Set: { directions: [{ brand_evidence: null }] } });
  let pending;
  let firstRunCalls = 0;
  await assert.rejects(() => runStableStep4(baseOptions({
    reasoner: async () => {
      firstRunCalls += 1;
      if (firstRunCalls === 1) return { text: invalidPayload };
      return { text: '{"corrections":[{"path":"visualDirectionV2Set.directions[0].brand_evidence","value":"unterminated' };
    },
    onRepairPending(state) { pending = state; }
  })), (error) => error.code === 'STEP4_JSON_PARSE_FAILED');
  assert.equal(firstRunCalls, 2);
  assert.equal(pending.kind, 'step4_repair_pending');

  let resumedCalls = 0;
  const resumed = await runStableStep4(baseOptions({
    repairCheckpoint: pending,
    reasoner: async (messages) => {
      resumedCalls += 1;
      assert.match(messages[0].content, /bounded correction patch/u);
      return { text: JSON.stringify({ corrections: [{
        path: 'visualDirectionV2Set.directions[0].brand_evidence',
        value: '已验证的中文品牌事实。'
      }] }) };
    }
  }));
  assert.equal(resumedCalls, 1);
  assert.equal(resumed.modelCallCount, 1);
  assert.ok(resumed.events.some((event) => event.event === 'STEP4_REPAIR_RESUME'));
  assert.ok(!resumed.events.some((event) => event.event === 'STEP4_PROVIDER_START'));
});

test('provider timeout aborts and rejects instead of hanging', async () => {
  const statuses = [];
  await assert.rejects(() => runStableStep4(baseOptions({
    reasoner: async () => new Promise(() => {}),
    providerTimeoutMs: 15,
    totalTimeoutMs: 100,
    onStatus: (status) => statuses.push(status)
  })), (error) => error.code === 'STEP4_PROVIDER_HARD_TIMEOUT');
  assert.equal(statuses.at(-1).status, 'failed');
  assert.equal(statuses.at(-1).code, 'STEP4_PROVIDER_HARD_TIMEOUT');
});

test('total watchdog writes failed with STEP4_TOTAL_TIMEOUT when the provider ignores AbortSignal', async () => {
  const statuses = [];
  await assert.rejects(() => runStableStep4(baseOptions({
    reasoner: async () => new Promise(() => {}),
    providerTimeoutMs: 1_000,
    totalTimeoutMs: 15,
    onStatus: (status) => statuses.push(status)
  })), (error) => error.code === 'STEP4_TOTAL_TIMEOUT');
  assert.equal(statuses.at(-1).status, 'failed');
  assert.equal(statuses.at(-1).code, 'STEP4_TOTAL_TIMEOUT');
});

test('user abort rejects immediately and enters cancelled', async () => {
  const controller = new AbortController();
  const statuses = [];
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(() => runStableStep4(baseOptions({
    abortSignal: controller.signal,
    reasoner: async () => new Promise(() => {}),
    providerTimeoutMs: 1_000,
    totalTimeoutMs: 2_000,
    onStatus: (status) => statuses.push(status)
  })), (error) => error.name === 'AbortError');
  assert.equal(statuses.at(-1).status, 'cancelled');
});

test('heartbeat records the active phase and stops after completion', async () => {
  const events = [];
  await runStableStep4(baseOptions({
    reasoner: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { text: validPayload };
    },
    heartbeatIntervalMs: 5,
    onEvent: (event) => events.push(event)
  }));
  const heartbeat = events.find((event) => event.event === 'STEP4_HEARTBEAT');
  assert.ok(heartbeat);
  assert.equal(heartbeat.provider_request_active, true);
  assert.equal(typeof heartbeat.current_phase, 'string');
});

test('conservative normalization unwraps only statement objects and filters string arrays', () => {
  const normalized = conservativelyNormalizeDirectionSet({ visualDirectionV2Set: { directions: [{
    brand_evidence: { statement: '品牌事实', source: 'VE001' },
    execution_constraints: ['保留', null, 42],
    template_risks: [{ text: '不得串行化为字符串' }]
  }] } });
  const direction = normalized.visualDirectionV2Set.directions[0];
  assert.equal(direction.brand_evidence, '品牌事实');
  assert.deepEqual(direction.execution_constraints, ['保留']);
  assert.deepEqual(direction.template_risks, []);
  assert.equal(direction.anti_concept_art_constraints.length, 9);
  assert.deepEqual(direction.asset_authorization, SAFE_ASSET_AUTHORIZATION);
});

test('field repair prompt names the path, types and preservation rule', () => {
  const prompt = buildFieldRepairPrompt({
    originalJson: { visualDirectionV2Set: { directions: [{ brand_evidence: null }] } },
    validationError: {
      code: 'FAILED_SCHEMA',
      path: 'visualDirectionV2Set.directions[0].brand_evidence',
      message: 'must be string'
    }
  })[0].content;
  assert.match(prompt, /"received_type":"null"/u);
  assert.match(prompt, /Preserve all unlisted fields/u);
  assert.match(prompt, /Do not return the complete document/u);
});

test('direction-specific composition touchpoints share one prompt and schema contract', () => {
  const directions = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions.json'), 'utf8'));
  const incidentTouchpoints = [
    'quality_selection_board',
    'product_selection_catalog',
    'ecosystem_service_map',
    'partner_portal_hero'
  ];
  directions[1].composition_templates[0].touchpoint = incidentTouchpoints[0];
  directions[1].composition_templates[1].touchpoint = incidentTouchpoints[1];
  directions[2].composition_templates[0].touchpoint = incidentTouchpoints[2];
  directions[2].composition_templates[1].touchpoint = incidentTouchpoints[3];
  const context = {
    reportLanguage: 'zh-CN',
    evidenceIds: new Set(directions.flatMap((item) => item.evidence_ids || [])),
    allowedAssetIds: new Set(directions.flatMap((item) => item.asset_references || [])),
    restrictedAssetIds: new Set()
  };

  for (const touchpoint of incidentTouchpoints) assert.ok(COMPOSITION_TOUCHPOINTS.includes(touchpoint));
  assert.doesNotThrow(() => validateExecutionDirectionV2Set(directions, context));

  const prompt = buildExecutionDirectionV2Prompt({ brandFacts: { reportLanguage: 'zh-CN' } })[0].content;
  for (const touchpoint of incidentTouchpoints) assert.match(prompt, new RegExp(touchpoint, 'u'));
});

test('touchpoint repair explicitly constrains replacements to the shared enum', () => {
  const path = 'visualDirectionV2Set.directions[0].composition_templates[0].touchpoint';
  const prompt = buildFieldRepairPrompt({
    originalJson: { visualDirectionV2Set: { directions: [{ composition_templates: [{ touchpoint: 'invented_touchpoint' }] }] } },
    validationError: {
      code: 'FAILED_SCHEMA',
      issues: [{ path, received: 'invented_touchpoint', message: 'touchpoint is outside the enum' }]
    }
  })[0].content;
  assert.match(prompt, /"expected":"one of: poster, capability_deck/u);
  assert.match(prompt, /quality_selection_board/u);
  assert.match(prompt, /copying the rejected value when it is outside the enum/u);
});

test('repair patch accepts every listed path exactly once and rejects scope expansion', () => {
  const original = { visualDirectionV2Set: { directions: [{ brand_evidence: null }] } };
  const error = Object.assign(new Error('invalid'), {
    code: 'FAILED_SCHEMA',
    issues: [{ path: 'visualDirectionV2Set.directions[0].brand_evidence', expected: 'string' }]
  });
  const repaired = applyFieldRepairPatch(original, { corrections: [{
    path: 'visualDirectionV2Set.directions[0].brand_evidence', value: '已验证品牌事实'
  }] }, error);
  assert.equal(repaired.visualDirectionV2Set.directions[0].brand_evidence, '已验证品牌事实');
  assert.equal(original.visualDirectionV2Set.directions[0].brand_evidence, null);
  assert.throws(() => applyFieldRepairPatch(original, { corrections: [{
    path: 'visualDirectionV2Set.directions[0].direction_name', value: '越界修改'
  }] }, error), (caught) => caught.code === 'STEP4_REPAIR_PATCH_INVALID');
});

test('asset-type coverage repair appends the missing asset and cannot trade one required type for another', () => {
  const fixture = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions.json'), 'utf8'));
  const directions = structuredClone(fixture);
  const direction = directions[1];
  const originalGraphic = structuredClone(direction.core_reusable_assets.find((asset) => asset.asset_type === 'graphic_asset'));
  direction.core_reusable_assets.find((asset) => asset.asset_type === 'graphic_asset').asset_type = 'material_asset';

  const context = {
    reportLanguage: 'zh-CN',
    evidenceIds: new Set(directions.flatMap((item) => item.evidence_ids || [])),
    allowedAssetIds: new Set(directions.flatMap((item) => item.asset_references || [])),
    restrictedAssetIds: new Set()
  };
  const issues = collectExecutionDirectionV2ValidationErrors(directions, context);
  const coverageIssue = issues.find((issue) => issue.path === 'visualDirectionV2Set.directions[1].core_reusable_assets');
  assert.ok(coverageIssue);
  assert.match(coverageIssue.message, /missing: graphic_asset/u);
  const validationError = Object.assign(new Error('asset coverage'), { code: 'FAILED_SCHEMA', issues: [coverageIssue] });
  const originalJson = { visualDirectionV2Set: { directions } };

  const prompt = buildFieldRepairPrompt({ originalJson, validationError })[0].content;
  assert.match(prompt, /"repair_operation":"append_missing_asset_types"/u);
  assert.match(prompt, /"missing_asset_types":\["graphic_asset"\]/u);
  assert.match(prompt, /Never return or rewrite the existing array/u);

  // Exact 2026-07-22 failure mode: reclassifying the information asset as a
  // graphic asset merely moves the missing type and must be rejected.
  const regressiveArray = structuredClone(direction.core_reusable_assets);
  regressiveArray.find((asset) => asset.asset_type === 'information_asset').asset_type = 'graphic_asset';
  assert.throws(() => applyFieldRepairPatch(originalJson, { corrections: [{
    path: coverageIssue.path,
    operation: 'append_missing_asset_types',
    value: regressiveArray
  }] }, validationError), (error) => error.code === 'STEP4_REPAIR_PATCH_INVALID');

  const newGraphic = {
    ...originalGraphic,
    asset_id: 'E02-G-REPAIR-01',
    asset_name: '补充图形资产'
  };
  const repaired = applyFieldRepairPatch(originalJson, { corrections: [{
    path: coverageIssue.path,
    operation: 'append_missing_asset_types',
    value: [newGraphic]
  }] }, validationError);
  const repairedAssets = repaired.visualDirectionV2Set.directions[1].core_reusable_assets;
  assert.equal(repairedAssets.length, direction.core_reusable_assets.length + 1);
  assert.deepEqual(repairedAssets.slice(0, -1), direction.core_reusable_assets, 'existing assets must remain byte-for-byte equivalent');
  assert.doesNotThrow(() => validateExecutionDirectionV2Set(repaired.visualDirectionV2Set.directions, context));
});

test('a repair checkpoint from the asset-type swap failure resumes with one append-only model call', async () => {
  const fixture = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions.json'), 'utf8'));
  const directions = structuredClone(fixture);
  const direction = directions[1];
  const originalInformation = structuredClone(direction.core_reusable_assets.find((asset) => asset.asset_type === 'information_asset'));
  direction.core_reusable_assets.find((asset) => asset.asset_type === 'information_asset').asset_type = 'material_asset';
  const context = {
    reportLanguage: 'zh-CN',
    evidenceIds: new Set(directions.flatMap((item) => item.evidence_ids || [])),
    allowedAssetIds: new Set(directions.flatMap((item) => item.asset_references || [])),
    restrictedAssetIds: new Set()
  };
  let calls = 0;
  const result = await runStableStep4(baseOptions({
    repairCheckpoint: {
      kind: 'step4_repair_pending',
      originalJson: { visualDirectionV2Set: { directions } },
      previousRepairIncomplete: true
    },
    validate(list) {
      return validateExecutionDirectionV2Set(list, context);
    },
    reasoner: async (messages) => {
      calls += 1;
      assert.match(messages[0].content, /"missing_asset_types":\["information_asset"\]/u);
      return { text: JSON.stringify({ corrections: [{
        path: 'visualDirectionV2Set.directions[1].core_reusable_assets',
        operation: 'append_missing_asset_types',
        value: [{ ...originalInformation, asset_id: 'E02-I-REPAIR-01' }]
      }] }) };
    }
  }));
  assert.equal(calls, 1);
  assert.equal(result.modelCallCount, 1);
  assert.ok(result.events.some((event) => event.event === 'STEP4_REPAIR_RESUME'));
  assert.ok(!result.events.some((event) => event.event === 'STEP4_PROVIDER_START'));
  assert.ok(result.directions[1].core_reusable_assets.some((asset) => asset.asset_id === 'E02-I-REPAIR-01'));
});

test('validation collector keeps a missing parent repairable and follows optional family semantics', () => {
  const fixture = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions.json'), 'utf8'));
  const direction = structuredClone(fixture[0]);
  const photography = direction.photography_object_system;
  delete direction.photography_object_system;
  delete direction.direction_family;
  delete direction.family_type;
  const context = {
    reportLanguage: 'zh-CN',
    evidenceIds: new Set(direction.evidence_ids || []),
    allowedAssetIds: new Set(direction.asset_references || []),
    restrictedAssetIds: new Set()
  };
  const issues = collectExecutionDirectionV2ValidationErrors([direction], context);
  assert.deepEqual(issues.map((issue) => issue.path), [
    'visualDirectionV2Set.directions[0].photography_object_system'
  ]);
  const repaired = applyFieldRepairPatch(
    { visualDirectionV2Set: { directions: [direction] } },
    { corrections: [{ path: issues[0].path, value: photography }] },
    Object.assign(new Error('missing parent'), { code: 'FAILED_SCHEMA', issues })
  );
  assert.doesNotThrow(() => validateExecutionDirectionV2Set(repaired.visualDirectionV2Set.directions, context));
});

test('validation collector reports every present=true and role=none contradiction in one pass', () => {
  const fixture = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions.json'), 'utf8'));
  const directions = structuredClone(fixture);
  for (const exampleIndex of [0, 2]) {
    directions[2].execution_examples[exampleIndex].downstream_consumer_value = {
      present: true,
      consumer_value_role: 'none',
      value_statement: '待修复', visual_expression: '待修复', touchpoints: [], evidence_ids: []
    };
  }
  const context = {
    reportLanguage: 'zh-CN',
    evidenceIds: new Set(directions.flatMap((direction) => direction.evidence_ids || [])),
    allowedAssetIds: new Set(directions.flatMap((direction) => direction.asset_references || [])),
    restrictedAssetIds: new Set()
  };
  const issues = collectExecutionDirectionV2ValidationErrors(directions, context);
  assert.deepEqual(issues.filter((issue) => issue.received === 'none').map((issue) => issue.path), [
    'visualDirectionV2Set.directions[2].execution_examples[0].downstream_consumer_value.consumer_value_role',
    'visualDirectionV2Set.directions[2].execution_examples[2].downstream_consumer_value.consumer_value_role'
  ]);
});

test('selection mechanism blanks across directions are collected and repaired in one bounded pass', () => {
  const fixture = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions.json'), 'utf8'));
  const directions = structuredClone(fixture);
  for (const index of [0, 2]) {
    directions[index].selection_mechanism = {
      selection_dimensions: [], visual_mapping_rule: '', multi_category_rule: '',
      comparison_behavior: '', platform_signature: ''
    };
  }
  const context = {
    reportLanguage: 'zh-CN',
    evidenceIds: new Set(directions.flatMap((direction) => direction.evidence_ids || [])),
    allowedAssetIds: new Set(directions.flatMap((direction) => direction.asset_references || [])),
    restrictedAssetIds: new Set()
  };
  const issues = collectExecutionDirectionV2ValidationErrors(directions, context);
  assert.equal(issues.length, 10);
  for (const index of [0, 2]) {
    for (const field of ['selection_dimensions', 'visual_mapping_rule', 'multi_category_rule', 'comparison_behavior', 'platform_signature']) {
      assert.ok(issues.some((issue) => issue.path === `visualDirectionV2Set.directions[${index}].selection_mechanism.${field}`));
    }
  }
  const error = Object.assign(new Error('selection mechanism incomplete'), { code: 'FAILED_SCHEMA', issues });
  const prompt = buildFieldRepairPrompt({ originalJson: { visualDirectionV2Set: { directions } }, validationError: error })[0].content;
  assert.match(prompt, /The JSON has 10 validation error\(s\)/u);
  assert.match(prompt, /state how each selection dimension maps to an observable graphic/u);
  const valueFor = (field) => field === 'selection_dimensions'
    ? ['证据可验证性', '机构决策价值']
    : `${field} 的项目专属可观察规则`;
  const repaired = applyFieldRepairPatch(
    { visualDirectionV2Set: { directions } },
    { corrections: issues.map((issue) => ({ path: issue.path, operation: 'replace', value: valueFor(issue.path.split('.').at(-1)) })) },
    error
  );
  assert.doesNotThrow(() => validateExecutionDirectionV2Set(repaired.visualDirectionV2Set.directions, context));
});

test('an incomplete Repair advances the recovery checkpoint to the repaired JSON', async () => {
  const initial = JSON.stringify({ visualDirectionV2Set: { directions: [{ brand_evidence: null, direction_name: null }] } });
  const pendingStates = [];
  const validateSequentially = (directions) => {
    if (typeof directions[0].brand_evidence !== 'string') {
      throw Object.assign(new Error('brand_evidence must be string'), { code: 'FAILED_SCHEMA', path: 'visualDirectionV2Set.directions[0].brand_evidence' });
    }
    if (typeof directions[0].direction_name !== 'string') {
      throw Object.assign(new Error('direction_name must be string'), { code: 'FAILED_SCHEMA', path: 'visualDirectionV2Set.directions[0].direction_name' });
    }
    return directions;
  };
  let calls = 0;
  await assert.rejects(() => runStableStep4(baseOptions({
    validate: validateSequentially,
    reasoner: async () => {
      calls += 1;
      if (calls === 1) return { text: initial };
      return { text: JSON.stringify({ corrections: [{
        path: 'visualDirectionV2Set.directions[0].brand_evidence', value: '已验证品牌事实'
      }] }) };
    },
    onRepairPending(state) { pendingStates.push(structuredClone(state)); }
  })), (error) => error.code === 'FAILED_SCHEMA');
  assert.equal(pendingStates.length, 2);
  assert.equal(pendingStates[1].originalJson.visualDirectionV2Set.directions[0].brand_evidence, '已验证品牌事实');

  let resumedCalls = 0;
  const resumed = await runStableStep4(baseOptions({
    validate: validateSequentially,
    repairCheckpoint: pendingStates[1],
    reasoner: async () => {
      resumedCalls += 1;
      return { text: JSON.stringify({ corrections: [{
        path: 'visualDirectionV2Set.directions[0].direction_name', value: '修复后的方向名称'
      }] }) };
    }
  }));
  assert.equal(resumedCalls, 1);
  assert.equal(resumed.directions[0].direction_name, '修复后的方向名称');
});

test('prompt uses schema enums and leaves asset authorization to runtime policy', () => {
  const prompt = buildExecutionDirectionV2Prompt({})[0].content;
  assert.doesNotMatch(prompt, /"enum"/u);
  assert.doesNotMatch(prompt, /"asset_authorization"\s*:/u);
  assert.match(prompt, /primary\|strong_secondary\|secondary\|auxiliary\|none/u);
  assert.match(prompt, /graphic_asset\|information_asset\|photography_asset/u);
});

test('real failure pattern is collected in full and repaired in one bounded patch call', async () => {
  const fixture = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions.json'), 'utf8'));
  const invalid = structuredClone(fixture);
  for (const direction of invalid) {
    direction.asset_authorization = {
      data_authorization_level: 'internal_confirmed',
      document_visualization_mode: 'structure_abstracted',
      credential_usage_mode: 'badge_style_approved',
      generated_data_policy: 'no_fabrication'
    };
    for (const example of direction.execution_examples) {
      if (example.downstream_consumer_value) example.downstream_consumer_value.consumer_value_role = 'secondary_only';
    }
  }
  const normalized = conservativelyNormalizeDirectionSet({ visualDirectionV2Set: { directions: invalid } });
  const directions = normalized.visualDirectionV2Set.directions;
  assert.ok(directions.every((direction) => JSON.stringify(direction.asset_authorization) === JSON.stringify(SAFE_ASSET_AUTHORIZATION)));
  const evidenceIds = new Set(fixture.flatMap((direction) => direction.evidence_ids || []));
  const allowedAssetIds = new Set(fixture.flatMap((direction) => direction.asset_references || []));
  const context = { reportLanguage: 'zh-CN', evidenceIds, allowedAssetIds, restrictedAssetIds: new Set() };
  const issues = collectExecutionDirectionV2ValidationErrors(directions, context);
  const roleIssues = issues.filter((issue) => issue.path.endsWith('.consumer_value_role'));
  assert.ok(roleIssues.length >= 3);
  assert.equal(issues.filter((issue) => issue.path.includes('asset_authorization')).length, 0);

  let calls = 0;
  const result = await runStableStep4(baseOptions({
    reasoner: async (messages) => {
      calls += 1;
      if (calls === 1) return { text: JSON.stringify({ visualDirectionV2Set: { directions: invalid } }) };
      const repairRequest = messages[0].content;
      assert.match(repairRequest, new RegExp(`The JSON has ${roleIssues.length} validation error\\(s\\)`));
      const completePatch = JSON.stringify({ corrections: roleIssues.map((issue) => ({ path: issue.path, value: 'secondary' })) });
      return { text: completePatch.slice(0, -2) };
    },
    validate(list) {
      return validateExecutionDirectionV2Set(list, context);
    }
  }));
  assert.equal(calls, 2);
  assert.equal(result.repaired, true);
});

test('central budgets leave reserves at both Step 4 and pipeline levels', () => {
  const { step4, pipelineTimeoutMs } = VISUAL_TRANSLATION_V2_RUNTIME_CONFIG;
  assert.ok(step4.totalTimeoutMs >= step4.mainHardTimeoutMs + step4.repairHardTimeoutMs + step4.processingReserveMs);
  assert.ok(pipelineTimeoutMs >= 180_000 + 240_000 + step4.totalTimeoutMs + step4.processingReserveMs);
  assert.equal(step4.thinkingBudget, 1000);
  assert.equal(step4.maxOutputTokens, 20000);
});

test('repair is skipped with an explicit error when the remaining total budget is insufficient', async () => {
  let calls = 0;
  const invalidPayload = JSON.stringify({ visualDirectionV2Set: { directions: [{ brand_evidence: null }] } });
  await assert.rejects(() => runStableStep4(baseOptions({
    reasoner: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { text: invalidPayload };
    },
    totalTimeoutMs: 60,
    providerTimeoutMs: 40,
    processingReserveMs: 30,
    minimumRepairBudgetMs: 20
  })), (error) => error.code === 'STEP4_REPAIR_BUDGET_INSUFFICIENT');
  assert.equal(calls, 1);
});

test('Step 4 maps stream activity into observable protocol events', async () => {
  const events = [];
  await runStableStep4(baseOptions({
    reasoner: async (_messages, context) => {
      context.onStreamEvent({ type: 'first_activity', elapsedMs: 5, receivedChars: 0, reasoningChars: 1, chunksReceived: 1, activityKind: 'reasoning' });
      context.onStreamEvent({ type: 'first_reasoning_token', elapsedMs: 5, receivedChars: 0, reasoningChars: 1, chunksReceived: 1 });
      context.onStreamEvent({ type: 'first_content_token', elapsedMs: 8, receivedChars: 1, reasoningChars: 1, chunksReceived: 2 });
      context.onStreamEvent({ type: 'progress', elapsedMs: 9, receivedChars: validPayload.length, reasoningChars: 1, chunksReceived: 3 });
      context.onStreamEvent({ type: 'end', elapsedMs: 10, receivedChars: validPayload.length, reasoningChars: 1, chunksReceived: 3, finishReason: 'stop' });
      return { text: validPayload, usage: { outputTokens: 100 } };
    },
    onEvent: (event) => events.push(event)
  }));
  assert.ok(events.some((event) => event.event === 'STEP4_FIRST_ACTIVITY'));
  assert.ok(events.some((event) => event.event === 'STEP4_FIRST_REASONING_TOKEN'));
  assert.ok(events.some((event) => event.event === 'STEP4_FIRST_CONTENT_TOKEN'));
  assert.ok(events.some((event) => event.event === 'STEP4_STREAM_PROGRESS'));
  assert.ok(events.some((event) => event.event === 'STEP4_STREAM_END'));
  const providerEnd = events.find((event) => event.event === 'STEP4_PROVIDER_END');
  assert.equal(providerEnd.output_tokens, 100);
  assert.equal(providerEnd.thinking_budget, profile.thinkingBudget);
});

test('Jiuzhou, Mingjitang and Vanke each converge to a terminal state in 10 offline runs', async () => {
  const projects = ['jiuzhou-meixue', 'mingjitang', 'vanke-suwan'];
  const summary = [];
  for (const project of projects) {
    const directions = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', project, 'v2-directions.json'), 'utf8'));
    const evidenceIds = new Set(directions.flatMap((direction) => direction.evidence_ids || []));
    const allowedAssetIds = new Set(directions.flatMap((direction) => direction.asset_references || []));
    for (let run = 1; run <= 10; run += 1) {
      const statuses = [];
      let calls = 0;
      const result = await runStableStep4(baseOptions({
        projectId: project,
        runId: `${project}-${run}`,
        reasoner: async () => {
          calls += 1;
          return { text: JSON.stringify({ visualDirectionV2Set: { directions } }) };
        },
        validate(list) {
          return list.map((direction) => validateExecutionDirectionV2(direction, {
            reportLanguage: 'zh-CN', evidenceIds, allowedAssetIds, restrictedAssetIds: new Set()
          }));
        },
        onStatus: (status) => statuses.push(status.status)
      }));
      assert.equal(calls, 1);
      assert.equal(result.modelCallCount, 1);
      assert.equal(statuses.at(-1), 'completed');
      summary.push({ project, run, status: statuses.at(-1) });
    }
  }
  assert.equal(summary.length, 30);
  assert.equal(summary.filter((item) => item.status !== 'completed').length, 0);
});
