import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnalysisProgress, AnalysisResult } from '../shared/types';
import { redactSecret } from './analysis-contract';
import { buildBrandDnaReportFilename } from './brand-dna-contract';
import type { ProjectStore } from './project-store';
import type { ProviderCredentials } from './settings-store';

// Bundled from the repository core. Desktop remains the consumer, never the dependency.
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { createOpenAICompatibleTextReasoner } from '../../../../src/v5/adapters/openai-compatible-text-reasoner.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { runBrandDnaPipeline } from '../../../../src/v5/brand-dna/run-brand-dna-pipeline.js';

type ProgressSink = (progress: AnalysisProgress) => void;
type CredentialsReader = (profileId?: string) => Promise<ProviderCredentials>;

interface ActiveRun {
  controller: AbortController;
  startedAt: string;
}

function friendlyError(error: Error & { code?: string; details?: { httpStatus?: number } }, credentials: ProviderCredentials): string {
  const message = redactSecret(error.message, credentials.apiKey);
  if (/401|403|API Key|unauthorized|forbidden/i.test(message)) return 'API Key 无效或无权访问当前模型';
  if (/404|model.*not found|does not exist/i.test(message)) return 'Model ID 或 Base URL 不存在';
  if (/TIME_BUDGET_EXCEEDED|超时|aborted|abort/i.test(message)) return '分析超时或已被取消';
  if (/empty|空内容/i.test(message)) return '模型返回空内容，未生成报告';
  if (error.code === 'API_ERROR' || error.code === 'REQUEST_FAILED') {
    return `模型 API 请求失败
Provider：${credentials.provider}
Model：${credentials.model}
HTTP：${error.details?.httpStatus || '未返回'}
原因：${message}`;
  }
  return message;
}

export function createBrandDnaPipelineService(
  projects: ProjectStore,
  readCredentials: CredentialsReader,
  emitProgress: ProgressSink
) {
  const active = new Map<string, ActiveRun>();

  async function start(projectId: string, _forceReasoning = true, apiProfileId?: string): Promise<AnalysisResult> {
    if (active.has(projectId)) throw new Error('该项目正在分析中');
    const project = await projects.get(projectId);
    if (project.mode !== 'brand-dna') throw new Error('当前项目不是品牌 DNA 分析模式');
    const credentials = await readCredentials(apiProfileId || project.apiProfileId || undefined);
    const projectPaths = await projects.paths(projectId);
    const controller = new AbortController();
    const startedAt = new Date().toISOString();
    const started = performance.now();
    let currentStage: AnalysisProgress['stage'] = 'preparing-documents';
    let documentCount = project.documents.length;
    active.set(projectId, { controller, startedAt });

    const progress = (
      stage: AnalysisProgress['stage'],
      message: string,
      extra: Partial<AnalysisProgress> = {}
    ) => {
      currentStage = stage;
      emitProgress({
        projectId,
        mode: 'brand-dna',
        stage,
        message,
        startedAt,
        elapsedMs: Math.round(performance.now() - started),
        assetCount: documentCount,
        model: credentials.model,
        ...extra
      });
    };

    await projects.update(projectId, {
      status: 'running',
      provider: credentials.provider,
      model: credentials.model,
      apiProfileId: credentials.profileId,
      reasoningQualityTier: credentials.qualityTier,
      lastError: null
    });

    try {
      progress('preparing-documents', '正在整理品牌策划文档');
      progress('parsing-documents', '正在解析 PDF、DOCX、Markdown 与文本内容');
      const summary = await projects.scanDocuments(projectId, controller.signal);
      documentCount = summary.totalFiles;
      if (!summary.totalFiles) throw new Error('项目文档为空，请先上传品牌策划文档');
      if (!summary.parsedCount) throw new Error('没有可用于分析的有效文档文本');
      if (controller.signal.aborted) throw new DOMException('用户主动取消', 'AbortError');

      const corpus = await projects.loadBrandCorpus(projectId, controller.signal);
      const reasoner = createOpenAICompatibleTextReasoner({
        apiKey: credentials.apiKey,
        model: credentials.model,
        baseUrl: credentials.baseUrl,
        provider: credentials.provider
      });
      const execution = await runBrandDnaPipeline({
        corpus,
        projectNameHint: project.projectName,
        abortSignal: controller.signal,
        qualityTier: credentials.qualityTier,
        reasoner,
        onProgress(event: { stage: AnalysisProgress['stage']; message: string; elapsedMs?: number }) {
          progress(event.stage, event.message);
        }
      });
      if (controller.signal.aborted) throw new DOMException('用户主动取消', 'AbortError');

      const finalProjectName = String(execution.projectName || project.projectName).trim() || project.projectName;
      const filename = buildBrandDnaReportFilename(finalProjectName, credentials.model);
      const outputPath = path.join(projectPaths.outputs, filename);
      const brandDnaPath = path.join(projectPaths.runtime, 'brand-dna.json');
      await fs.writeFile(brandDnaPath, `${JSON.stringify(execution.brandDna, null, 2)}\n`, 'utf8');
      const intermediatesPath = path.join(projectPaths.runtime, 'brand-dna-intermediates.json');
      await fs.writeFile(intermediatesPath, `${JSON.stringify(execution.intermediateObjects, null, 2)}\n`, 'utf8');
      const completedAt = new Date().toISOString();
      const durationMs = Math.round(performance.now() - started);
      const runtimeReportPath = path.join(projectPaths.runtime, 'run-report.json');
      await fs.writeFile(runtimeReportPath, `${JSON.stringify({
        version: '5.0',
        mode: 'brand-dna',
        analysisProfile: 'brand-dna',
        desktopProjectId: projectId,
        apiProfileId: credentials.profileId,
        provider: execution.provider || credentials.provider,
        model: execution.modelId || credentials.model,
        startedAt,
        completedAt,
        durationMs,
        documentCount: summary.totalFiles,
        parsedDocumentCount: summary.parsedCount,
        retryCount: execution.retryCount,
        schemaRetryCount: execution.schemaRetryCount,
        qualityRepairCount: execution.qualityRepairCount,
        qualityTier: execution.qualityTier,
        deepBenchmarkPassed: execution.deepBenchmarkPassed,
        qualityAudit: execution.qualityAudit,
        protocolMetadata: execution.metadata,
        warnings: execution.warnings,
        outputFile: filename,
        brandDnaFile: path.basename(brandDnaPath),
        intermediateObjectsFile: path.basename(intermediatesPath)
      }, null, 2)}\n`, 'utf8');
      await fs.writeFile(outputPath, execution.reportMarkdown, 'utf8');
      if (project.lastReportFilename && project.lastReportFilename !== filename) {
        await fs.rm(path.join(projectPaths.outputs, path.basename(project.lastReportFilename)), { force: true });
      }

      const brandName = execution.brandDna.brandName?.status === 'missing'
        ? finalProjectName
        : execution.brandDna.brandName?.value || finalProjectName;
      const category = execution.brandDna.category?.status === 'missing'
        ? project.industry
        : execution.brandDna.category?.value || project.industry;
      const updated = await projects.update(projectId, {
        projectName: finalProjectName,
        detectedProjectName: finalProjectName,
        projectNameConfidence: 0.9,
        brandName,
        detectedBrandName: brandName,
        industry: category,
        detectedIndustry: category,
        factConfidence: { brandName: 0.9, industry: 0.8 },
        status: 'completed',
        provider: credentials.provider,
        model: credentials.model,
        apiProfileId: credentials.profileId,
        reasoningQualityTier: credentials.qualityTier,
        lastRunAt: completedAt,
        lastDurationMs: durationMs,
        lastReportFilename: filename,
        lastError: null,
        assetCount: summary.totalFiles,
        imageCount: 0
      });
      progress('completed', '品牌 DNA 分析完成');
      return {
        project: updated,
        mode: 'brand-dna',
        reportFilename: filename,
        reportPath: outputPath,
        runtimeReportPath,
        apiProfileId: credentials.profileId,
        provider: execution.provider || credentials.provider,
        model: execution.modelId || credentials.model,
        durationMs,
        assetCount: summary.totalFiles,
        imageCount: 0,
        reasoningCacheHit: false,
        warnings: execution.warnings
      };
    } catch (error) {
      const cancelled = controller.signal.aborted || (error as Error).name === 'AbortError';
      const typedError = error as Error & {
        code?: string;
        audit?: Record<string, unknown>;
        details?: { httpStatus?: number };
      };
      const message = cancelled ? '用户已取消分析' : friendlyError(typedError, credentials);
      const code = typedError.code;
      const status = cancelled
        ? 'cancelled'
        : code === 'FAILED_QUALITY_GATE'
          ? 'failed-quality-gate'
          : code === 'FAILED_SCHEMA'
            ? 'failed-schema'
            : code === 'UNSUPPORTED_MODEL_TIER'
              ? 'unsupported-model-tier'
              : 'failed';
      await fs.writeFile(path.join(projectPaths.runtime, 'run-report.json'), `${JSON.stringify({
        version: '5.0',
        mode: 'brand-dna',
        analysisProfile: 'brand-dna',
        status,
        desktopProjectId: projectId,
        apiProfileId: credentials.profileId,
        provider: credentials.provider,
        model: credentials.model,
        qualityTier: credentials.qualityTier,
        startedAt,
        failedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
        failedStage: currentStage,
        errorCode: code || 'ANALYSIS_FAILED',
        error: message,
        qualityAudit: typedError.audit || null
      }, null, 2)}\n`, 'utf8').catch(() => {});
      await projects.update(projectId, { status, lastError: message });
      progress(cancelled ? 'cancelled' : 'failed', cancelled ? '分析已取消' : `分析失败：${message}`, {
        failedAtStage: currentStage as Exclude<AnalysisProgress['stage'], 'failed' | 'cancelled' | 'completed'>
      });
      throw new Error(message);
    } finally {
      active.delete(projectId);
    }
  }

  function cancel(projectId: string): boolean {
    const run = active.get(projectId);
    if (!run) return false;
    run.controller.abort();
    return true;
  }

  return { start, cancel };
}

export type BrandDnaPipelineService = ReturnType<typeof createBrandDnaPipelineService>;
