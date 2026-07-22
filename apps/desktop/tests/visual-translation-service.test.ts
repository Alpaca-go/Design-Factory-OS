import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createVisualTranslationService, deriveVisualTranslationProjectName } from '../src/main/visual-translation-service.ts';

test('Visual Translation derives the project name from document content without manual input', () => {
  const projectName = deriveVisualTranslationProjectName({
    documents: [{ id: 'doc-1', filename: '01-名济堂-品牌市场调研报告-1.1(2).docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', title: '名济堂品牌市场调研报告', sourceType: 'docx', rawText: '名济堂品牌市场调研报告', sections: [], tables: [], characterCount: 10, parseWarnings: [] }],
    sourceIndex: [], mergedText: '', warnings: []
  });
  assert.equal(projectName, '名济堂');
});

test('Visual Translation Desktop service persists documents, checkpoints, reports and resume state', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-translation-service-'));
  const source = path.join(temporary, '品牌策略.md');
  await fs.writeFile(source, '# 品牌策略\n\n品牌以透明履约和生态协同建立长期信任。', 'utf8');
  const progress: string[] = [];
  const progressMessages: string[] = [];
  let pipelineCalls = 0;
  const runner = async (input: Record<string, any>) => {
    pipelineCalls += 1;
    input.onProgress('00-document-preparation');
    input.onProgress('01-visual-evidence');
    await input.onModelResponse('01-visual-evidence', { attempt: 1, text: '{"visualEvidenceMap":{}}' });
    const resumed = Boolean(input.checkpoints['01-visual-evidence']);
    if (!resumed) {
      await input.onCheckpoint('01-visual-evidence', {
        checkpoint: { outputFile: 'visual-evidence-map-v1.json' },
        output: { evidence: [{ evidenceId: 'VE001' }] }
      });
    }
    input.onProgress('10-local-report-compiler');
    input.onStep4Status?.({ run_id: input.step4RunId, status: 'running', updated_at: new Date().toISOString() });
    input.onStep4Event?.({ event: 'STEP4_FIRST_ACTIVITY', run_id: input.step4RunId, received_chars: 0, reasoning_chars: 1 });
    input.onStep4Event?.({ event: 'STEP4_STREAM_PROGRESS', run_id: input.step4RunId, received_chars: 1200, reasoning_chars: 300 });
    input.onStep4Status?.({ run_id: input.step4RunId, status: 'completed', updated_at: new Date().toISOString() });
    await input.onCheckpoint('10-local-report-compiler', {
      checkpoint: { outputFile: 'visual-directions-report-v1.md' },
      output: '# 三个视觉方向\n\n测试报告'
    });
    return {
      reportMarkdown: '# 三个视觉方向\n\n测试报告',
      modelCallCount: resumed ? 0 : 3,
      metrics: resumed ? [{ stageId: '01-visual-evidence', resumed: true }] : [{ stageId: '01-visual-evidence', resumed: false }],
      composition: { visualRatio: 0.8 }
    };
  };
  const service = createVisualTranslationService(
    async () => ({ profileId: 'profile-test', provider: 'mock', baseUrl: 'https://example.test/v1', model: 'mock-model', apiKey: 'secret' }),
    async () => ({ profiles: [], defaultProfileId: null, provider: '', baseUrl: '', model: '', hasApiKey: false, defaultDataPath: temporary, cacheEnabled: true, logLevel: 'info', connectionStatus: 'untested' }),
    (event) => { progress.push(event.stage); progressMessages.push(event.message); },
    () => async () => ({ text: '{}' }),
    runner
  );

  try {
    const inspected = await service.inspectDocuments([source]);
    assert.equal(inspected[0]?.sourceType, 'markdown');
    const first = await service.start({ documentPaths: [source], apiProfileId: 'profile-test' });
    assert.equal(first.run.status, 'completed');
    assert.equal(first.run.modelCallCount, 3);
    assert.match(await fs.readFile(await service.reportPath(first.run.id), 'utf8'), /三个视觉方向/);
    assert.equal((await service.listRuns()).length, 1);
    assert.ok(progress.includes('01-visual-evidence'));
    assert.ok(progressMessages.some((message) => message.includes('正在接收视觉方向')));
    assert.match(await fs.readFile(path.join(await service.runRoot(first.run.id), 'runtime', 'step4-events.ndjson'), 'utf8'), /STEP4_STREAM_PROGRESS/);
    const rawResponse = path.join(await service.runRoot(first.run.id), 'runtime', 'model-responses', '01-visual-evidence-attempt-01.json');
    assert.match(await fs.readFile(rawResponse, 'utf8'), /visualEvidenceMap/);

    const resumed = await service.resume(first.run.id);
    assert.equal(resumed.run.modelCallCount, 3);
    assert.match(resumed.reportMarkdown, /三个视觉方向/u);
    assert.equal(pipelineCalls, 1);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('Visual Fact First selects the V2 runner even when the direction setting is legacy', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-fact-first-selector-'));
  const source = path.join(temporary, '品牌策略.md');
  await fs.writeFile(source, '# 品牌策略\n\n平台服务专业机构。', 'utf8');
  let selectedMode = '';
  const service = createVisualTranslationService(
    async () => ({ profileId: 'profile-test', provider: 'mock', baseUrl: 'https://example.test/v1', model: 'mock-model', apiKey: 'secret' }),
    async () => ({ profiles: [], defaultProfileId: null, provider: '', baseUrl: '', model: '', hasApiKey: false, defaultDataPath: temporary, cacheEnabled: true, logLevel: 'info', connectionStatus: 'untested', directionGenerationMode: 'conceptual_v1', analysisPipelineMode: 'visual_fact_first' }),
    () => {}, () => async () => ({ text: '{}' }),
    async () => { throw new Error('legacy runner must not be used'); },
    async (input: Record<string, any>) => {
      selectedMode = input.analysisPipelineMode;
      return { reportMarkdown: '# Visual Fact First', reportBasename: 'visual-directions-report-v2-experimental.md', modelCallCount: 0, metrics: [], composition: { visualRatio: 0.8 }, protocolVersion: 'visual-translation-v2-execution' };
    }
  );
  try {
    const result = await service.start({ documentPaths: [source], apiProfileId: 'profile-test' });
    assert.equal(selectedMode, 'visual_fact_first');
    assert.equal(result.run.status, 'completed');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('Visual Translation marks remaining Step 4 schema errors recoverable and resumes from Repair checkpoint', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-translation-repair-resume-'));
  const source = path.join(temporary, '品牌策略.md');
  await fs.writeFile(source, '# 品牌策略\n\n品牌以透明履约建立信任。', 'utf8');
  let calls = 0;
  const v2Runner = async (input: Record<string, any>) => {
    calls += 1;
    if (calls === 1) {
      await input.onCheckpoint('04-step4-repair-pending', {
        checkpoint: { outputFile: 'step4-repair-pending.json' },
        output: { kind: 'step4_repair_pending', originalJson: { visualDirectionV2Set: { directions: [{}] } } }
      });
      throw Object.assign(new Error('Direction set contains 1 validation error(s)'), {
        code: 'FAILED_SCHEMA',
        issues: [{ path: 'visualDirectionV2Set.directions[2].execution_examples[2].downstream_consumer_value.consumer_value_role', message: 'cannot be none when present=true' }]
      });
    }
    assert.ok(input.checkpoints['04-step4-repair-pending']);
    await input.onCheckpointRemoved('04-step4-repair-pending');
    return {
      reportMarkdown: '# V2 已恢复',
      modelCallCount: 1,
      metrics: [{ stageId: '04-three-creative-directions', resumed: true }],
      composition: { visualRatio: 0.8 },
      reportBasename: 'visual-directions-report-v2-experimental.md'
    };
  };
  const service = createVisualTranslationService(
    async () => ({ profileId: 'profile-test', provider: 'mock', baseUrl: 'https://example.test/v1', model: 'mock-model', apiKey: 'secret' }),
    async () => ({ profiles: [], defaultProfileId: null, provider: '', baseUrl: '', model: '', hasApiKey: false, defaultDataPath: temporary, cacheEnabled: true, logLevel: 'info', connectionStatus: 'untested', directionGenerationMode: 'execution_oriented_v2' }),
    () => {},
    () => async () => ({ text: '{}' }),
    async () => { throw new Error('v1 runner must not be used'); },
    v2Runner
  );

  try {
    await assert.rejects(() => service.start({ documentPaths: [source], apiProfileId: 'profile-test' }), /Direction set contains/u);
    const failed = (await service.listRuns())[0];
    assert.ok(failed);
    assert.equal(failed.userError?.recoverable, true);
    assert.equal(failed.userError?.code, 'FAILED_SCHEMA');
    assert.match(failed.userError?.message || '', /execution_examples\[2\]/u);
    const checkpointPath = path.join(await service.runRoot(failed.id), 'checkpoints', '04-step4-repair-pending.json');
    await fs.access(checkpointPath);

    const resumed = await service.resume(failed.id);
    assert.equal(resumed.run.status, 'completed');
    assert.equal(calls, 2);
    await assert.rejects(() => fs.access(checkpointPath), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
