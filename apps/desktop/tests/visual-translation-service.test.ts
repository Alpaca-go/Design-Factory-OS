import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createVisualTranslationService } from '../src/main/visual-translation-service.ts';

test('Visual Translation Desktop service persists documents, checkpoints, reports and resume state', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-translation-service-'));
  const source = path.join(temporary, '品牌策略.md');
  await fs.writeFile(source, '# 品牌策略\n\n品牌以透明履约和生态协同建立长期信任。', 'utf8');
  const progress: string[] = [];
  let pipelineCalls = 0;
  const runner = async (input: Record<string, any>) => {
    pipelineCalls += 1;
    input.onProgress('00-document-preparation');
    input.onProgress('01-visual-evidence');
    const resumed = Boolean(input.checkpoints['01-visual-evidence']);
    if (!resumed) {
      await input.onCheckpoint('01-visual-evidence', {
        checkpoint: { outputFile: 'visual-evidence-map-v1.json' },
        output: { evidence: [{ evidenceId: 'VE001' }] }
      });
    }
    input.onProgress('10-local-report-compiler');
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
    (event) => progress.push(event.stage),
    () => async () => ({ text: '{}' }),
    runner
  );

  try {
    const inspected = await service.inspectDocuments([source]);
    assert.equal(inspected[0]?.sourceType, 'markdown');
    const first = await service.start({ projectName: '测试品牌', documentPaths: [source], apiProfileId: 'profile-test' });
    assert.equal(first.run.status, 'completed');
    assert.equal(first.run.modelCallCount, 3);
    assert.match(await fs.readFile(await service.reportPath(first.run.id), 'utf8'), /三个视觉方向/);
    assert.equal((await service.listRuns()).length, 1);
    assert.ok(progress.includes('01-visual-evidence'));

    const resumed = await service.resume(first.run.id);
    assert.equal(resumed.run.modelCallCount, 0);
    assert.equal(resumed.run.resumedStageCount, 1);
    assert.equal(pipelineCalls, 2);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
