import { performance } from 'node:perf_hooks';
import { runBrandDnaDeepProtocol } from './deep-protocol.js';
import { compileBrandDnaReport, validateBrandDnaReport } from './report-compiler.js';

function emit(input, stage, message, started) {
  input.onProgress?.({
    stage,
    message,
    elapsedMs: Math.round(performance.now() - started)
  });
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw new DOMException('用户主动取消', 'AbortError');
}

export async function runBrandDnaPipeline(input) {
  if (!input?.corpus?.documents?.length) throw new Error('Brand DNA Pipeline 缺少有效文档');
  if (typeof input.reasoner !== 'function') throw new Error('Brand DNA Pipeline 缺少文本 Reasoner');
  const started = performance.now();
  assertNotAborted(input.abortSignal);
  emit(input, 'preparing-documents', '正在整理品牌策划文档', started);
  emit(input, 'normalizing-content', '正在进行语义切分并建立稳定来源 ID', started);

  const execution = await runBrandDnaDeepProtocol({
    corpus: input.corpus,
    reasoner: input.reasoner,
    abortSignal: input.abortSignal,
    qualityTier: input.qualityTier,
    onProtocolProgress(stage, message) {
      assertNotAborted(input.abortSignal);
      emit(input, stage, message, started);
    }
  });
  assertNotAborted(input.abortSignal);
  emit(input, 'generating-report', '正在编译品牌 DNA 与 GPT 生图标准报告', started);
  const reportMarkdown = compileBrandDnaReport(execution.brandDna, {
    metadata: execution.metadata,
    qualityAudit: execution.qualityAudit,
    imageSystem: execution.imageSystem,
    imageTasks: execution.imageTasks
  });
  validateBrandDnaReport(reportMarkdown, {
    imageSystem: execution.imageSystem,
    imageTasks: execution.imageTasks
  });
  return Object.freeze({
    success: true,
    projectName: execution.brandDna.projectName.status === 'missing'
      ? input.projectNameHint
      : execution.brandDna.projectName.value,
    provider: execution.provider,
    modelId: execution.modelId,
    brandDna: execution.brandDna,
    reportMarkdown,
    qualityAudit: execution.qualityAudit,
    qualityTier: execution.qualityTier,
    deepBenchmarkPassed: execution.deepBenchmarkPassed,
    metadata: execution.metadata,
    intermediateObjects: execution.intermediates,
    warnings: [...(input.corpus.warnings || [])],
    errors: [],
    retryCount: execution.schemaRetryCount + execution.qualityRepairCount,
    schemaRetryCount: execution.schemaRetryCount,
    qualityRepairCount: execution.qualityRepairCount,
    durationMs: Math.round(performance.now() - started)
  });
}
