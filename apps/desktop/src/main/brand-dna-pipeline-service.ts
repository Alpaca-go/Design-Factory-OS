import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AnalysisProgress,
  AnalysisResult,
  BrandDnaResumeMode,
  NormalizedModelUsage
} from '../shared/types';
import { redactSecret } from './analysis-contract';
import { buildBrandDnaReportFilename } from './brand-dna-contract';
import type { ProjectStore } from './project-store';
import type { ProviderCredentials } from './settings-store';
import { classifyUsageError, type UsageTracker } from './usage-tracker';

// Bundled from the repository core. Desktop remains the consumer, never the dependency.
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { createOpenAICompatibleTextReasoner } from '../../../../src/v5/adapters/openai-compatible-text-reasoner.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { detectStructuredOutputCapability, chooseStructuredOutputMode } from '../../../../src/v5/adapters/structured-output-capabilities.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { createBrandDnaCheckpointStore } from '../../../../src/v5/brand-dna/runtime/checkpoint-store.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { normalizeResumeMode } from '../../../../src/v5/brand-dna/runtime/resume-planner.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { runBrandDnaPipeline } from '../../../../src/v5/brand-dna/run-brand-dna-pipeline.js';

type ProgressSink = (progress: AnalysisProgress) => void;
type CredentialsReader = (profileId?: string) => Promise<ProviderCredentials>;

interface ActiveRun {
  controller: AbortController;
  startedAt: string;
}

const STAGE_PRESENTATION: Record<string, {
  stage: AnalysisProgress['stage'];
  message: string;
}> = {
  'atomic-evidence': { stage: 'extracting-project-facts', message: '正在提取原子证据' },
  'normalized-facts': { stage: 'extracting-project-facts', message: '正在归一化项目事实' },
  'strategic-model': { stage: 'building-brand-dna', message: '正在重建品牌战略模型' },
  'strategic-critic': { stage: 'diagnosing-strategy', message: '正在执行战略诊断' },
  'dna-synthesis': { stage: 'building-brand-dna', message: '正在合成品牌 DNA' },
  'creative-thesis-decision': { stage: 'translating-creative-direction', message: '正在选择唯一创意命题' },
  'visual-causal-translation': { stage: 'translating-creative-direction', message: '正在完成视觉因果转译' },
  'gpt-image-task-compiler': { stage: 'planning-generation-tasks', message: '正在生成 GPT 图片任务' },
  'quality-auditor': { stage: 'validating-output', message: '正在执行独立质量审计' },
  'report-compiler': { stage: 'generating-report', message: '正在编译最终报告' }
};

function supportsJsonMode(credentials: ProviderCredentials): boolean {
  return /qwen|dashscope|aliyun|aliyuncs\.com|openai|gpt|deepseek/i.test([
    credentials.provider,
    credentials.model,
    credentials.baseUrl
  ].join(' '));
}

function friendlyError(
  error: Error & { code?: string; stage?: string; details?: { httpStatus?: number } },
  credentials: ProviderCredentials
): string {
  const message = redactSecret(error.message, credentials.apiKey);
  if (/401|403|API Key|unauthorized|forbidden/i.test(message)) return 'API Key 无效或无权访问当前模型';
  if (/404|model.*not found|does not exist/i.test(message)) return 'Model ID 或 Base URL 不存在';
  if (error.code === 'OUTPUT_TRUNCATED') {
    const stageLabel = error.stage === 'targeted-repair'
      ? '定向质量修复'
      : error.stage === 'quality-auditor-recheck'
        ? '质量复审'
        : '模型';
    return `${stageLabel}输出达到长度上限，结构化 JSON 被截断，请重试`;
  }
  if (error.code === 'FAILED_SCHEMA_AFTER_PATCH') return `局部结构修复后仍未通过校验：${message}`;
  if (error.code === 'PATCH_PATH_NOT_ALLOWED') return `模型尝试修改未授权字段，修复已被拒绝：${message}`;
  if (error.code === 'REQUEST_TIMEOUT') return '当前模型请求超过该阶段的单次请求时间上限。';
  if (error.code === 'STAGE_TIMEOUT') return '当前分析阶段超过时间预算，已保存此前通过校验的阶段。';
  if (error.code === 'PIPELINE_TIME_BUDGET_EXCEEDED') return 'Brand DNA 分析超过 30 分钟总预算，已保存可续跑断点。';
  if (error.code === 'STRUCTURED_OUTPUT_UNSUPPORTED') return '当前 Provider 无法稳定提供 Brand DNA 所需的结构化 JSON 输出。';
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
  emitProgress: ProgressSink,
  usageTracker?: UsageTracker
) {
  const active = new Map<string, ActiveRun>();

  async function start(
    projectId: string,
    forceReasoning = true,
    apiProfileId?: string,
    requestedResumeMode?: BrandDnaResumeMode
  ): Promise<AnalysisResult> {
    if (active.has(projectId)) throw new Error('该项目正在分析中');
    const project = await projects.get(projectId);
    if (project.mode !== 'brand-dna') throw new Error('当前项目不是品牌 DNA 分析模式');
    const credentials = await readCredentials(apiProfileId || project.apiProfileId || undefined);
    const projectPaths = await projects.paths(projectId);
    const analysisRunId = crypto.randomUUID();
    const controller = new AbortController();
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const resumeMode = normalizeResumeMode(
      requestedResumeMode || (forceReasoning ? 'restart-all' : 'continue')
    ) as BrandDnaResumeMode;
    let currentStage: AnalysisProgress['stage'] = 'preparing-documents';
    let currentStageId: string | null = null;
    let completedStageIds: string[] = [];
    let reusableCheckpointIds: string[] = [];
    let currentStageStartedAt = startedAt;
    let checkpointStore: ReturnType<typeof createBrandDnaCheckpointStore> | null = null;
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
        stageId: currentStageId,
        completedStageCount: completedStageIds.length,
        totalStageCount: 10,
        currentStageStartedAt,
        completedStageIds,
        reusableCheckpointIds,
        resumeAvailable: reusableCheckpointIds.length > 0 || completedStageIds.length > 0,
        ...extra
      });
    };

    await projects.update(projectId, {
      status: 'running',
      provider: credentials.provider,
      model: credentials.model,
      apiProfileId: credentials.profileId,
      reasoningQualityTier: credentials.qualityTier,
      lastAnalysisRunId: analysisRunId,
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
      const jsonMode = supportsJsonMode(credentials);
      const structuredCapability = detectStructuredOutputCapability({
        provider: credentials.provider,
        model: credentials.model,
        baseUrl: credentials.baseUrl,
        jsonMode
      });
      const structuredOutputMode = chooseStructuredOutputMode(structuredCapability);
      if (structuredOutputMode === 'unsupported') {
        throw Object.assign(
          new Error('Provider 未声明可靠的 json_object 或 json_schema 能力。'),
          { code: 'STRUCTURED_OUTPUT_UNSUPPORTED' }
        );
      }
      checkpointStore = createBrandDnaCheckpointStore({
        root: projectPaths.brandDna,
        corpus,
        analysisRunId,
        projectId,
        provider: credentials.provider,
        modelId: credentials.model,
        apiProfileId: credentials.profileId
      });
      if (resumeMode === 'restart-all') await checkpointStore.clear();
      await checkpointStore.writeRunState({
        analysisRunId,
        status: 'running',
        currentStageId: null,
        completedStageIds: [],
        reusableCheckpointIds: [],
        startedAt,
        totalDurationMs: 0,
        totalModelDurationMs: 0,
        lastErrorCode: null,
        lastErrorStage: null,
        resumeFromStage: null
      });
      const baseReasoner = createOpenAICompatibleTextReasoner({
        apiKey: credentials.apiKey,
        model: credentials.model,
        baseUrl: credentials.baseUrl,
        provider: credentials.provider,
        jsonMode,
        supportsThinkingWithJsonMode: /qwen|dashscope|aliyun/i.test([
          credentials.provider,
          credentials.model,
          credentials.baseUrl
        ].join(' '))
      });
      const reasoner = async (
        messages: Array<{ role: string; content: unknown }>,
        context: {
          signal?: AbortSignal;
          pipelineStage?: string;
          attemptNumber?: number;
          parentCallId?: string | null;
          structuredOutputMode?: string;
          thinkingEnabled?: boolean;
          thinkingBudgetTokens?: number | null;
          maxOutputTokens?: number;
          requestTimeoutMs?: number;
        } = {}
      ) => {
        const usageCall = await usageTracker?.startCall({
          analysisRunId,
          projectId,
          projectName: project.projectName,
          analysisMode: 'brand-dna',
          pipelineStage: context.pipelineStage || 'brand-dna.unknown',
          attemptNumber: context.attemptNumber,
          parentCallId: context.parentCallId,
          thinkingEnabled: context.thinkingEnabled,
          thinkingBudgetTokens: context.thinkingBudgetTokens,
          structuredOutputMode: context.structuredOutputMode,
          maxOutputTokens: context.maxOutputTokens,
          credentials
        }) || null;
        try {
          const response = await baseReasoner(messages, context);
          await usageTracker?.completeCall(usageCall, {
            status: 'success',
            usage: response.usage as NormalizedModelUsage,
            providerRequestId: response.providerRequestId,
            httpStatus: response.httpStatus,
            finishReason: response.finishReason
          });
          return { ...response, usageCallId: usageCall?.id || null };
        } catch (error) {
          await usageTracker?.completeCall(
            usageCall,
            classifyUsageError(error, controller.signal.aborted)
          );
          throw error;
        }
      };
      const execution = await runBrandDnaPipeline({
        corpus,
        projectNameHint: project.projectName,
        abortSignal: controller.signal,
        qualityTier: credentials.qualityTier,
        checkpointStore,
        resumeMode,
        structuredOutputMode,
        reasoner,
        onProgress(event: { stage: AnalysisProgress['stage']; message: string; elapsedMs?: number }) {
          progress(event.stage, event.message);
        },
        onStageProgress(event: {
          stageId: string;
          stageSequence: number;
          completedStageCount: number;
          totalStageCount: number;
          status: 'running' | 'completed' | 'reused';
          currentStageStartedAt?: string;
          reusableCheckpointIds?: string[];
        }) {
          currentStageId = event.stageId;
          currentStageStartedAt = event.currentStageStartedAt || new Date().toISOString();
          if (event.status === 'completed' || event.status === 'reused') {
            completedStageIds = [...new Set([...completedStageIds, event.stageId])];
          }
          if (event.status === 'reused') {
            reusableCheckpointIds = [...new Set([
              ...reusableCheckpointIds,
              ...(event.reusableCheckpointIds || [event.stageId])
            ])];
          }
          const presentation = STAGE_PRESENTATION[event.stageId] || {
            stage: currentStage,
            message: event.stageId
          };
          progress(presentation.stage, presentation.message, {
            stageId: event.stageId,
            completedStageCount: event.completedStageCount,
            totalStageCount: event.totalStageCount,
            currentStageStartedAt,
            completedStageIds,
            reusableCheckpointIds,
            resumed: event.status === 'reused'
          });
          void checkpointStore?.writeRunState({
            analysisRunId,
            status: 'running',
            currentStageId: event.stageId,
            completedStageIds,
            reusableCheckpointIds,
            startedAt,
            totalDurationMs: Math.round(performance.now() - started),
            totalModelDurationMs: 0,
            lastErrorCode: null,
            lastErrorStage: null,
            resumeFromStage: null
          });
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
        analysisRunId,
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
        structuredOutputCapability: structuredCapability,
        structuredOutputMode,
        resumeMode,
        completedStageIds: execution.completedStageIds,
        reusableCheckpointIds: execution.reusableCheckpointIds,
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
        lastAnalysisRunId: analysisRunId,
        lastRunAt: completedAt,
        lastDurationMs: durationMs,
        lastReportFilename: filename,
        lastError: null,
        assetCount: summary.totalFiles,
        imageCount: 0
      });
      completedStageIds = [...new Set([...(execution.completedStageIds || []), 'report-compiler'])];
      await checkpointStore.writeRunState({
        analysisRunId,
        status: 'completed',
        currentStageId: null,
        completedStageIds,
        reusableCheckpointIds,
        startedAt,
        totalDurationMs: durationMs,
        totalModelDurationMs: 0,
        lastErrorCode: null,
        lastErrorStage: null,
        resumeFromStage: null
      });
      progress('completed', '品牌 DNA 分析完成');
      return {
        project: updated,
        analysisRunId,
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
        stage?: string;
        audit?: Record<string, unknown>;
        details?: { httpStatus?: number };
        jsonPaths?: string[];
      };
      const message = cancelled ? '用户已取消分析' : friendlyError(typedError, credentials);
      const failedStageId = typedError.stage || currentStageId;
      const code = typedError.code;
      const status = cancelled
        ? 'cancelled'
        : code === 'FAILED_QUALITY_GATE'
          ? 'failed-quality-gate'
          : ['FAILED_SCHEMA', 'FAILED_SCHEMA_AFTER_PATCH', 'FAILED_JSON_PARSE', 'PATCH_PATH_NOT_ALLOWED'].includes(code || '')
            ? 'failed-schema'
            : ['REQUEST_TIMEOUT', 'STAGE_TIMEOUT'].includes(code || '')
              ? 'failed-timeout'
              : code === 'PIPELINE_TIME_BUDGET_EXCEEDED'
                ? 'failed-time-budget'
            : code === 'UNSUPPORTED_MODEL_TIER'
              ? 'unsupported-model-tier'
              : 'failed';
      const durationMs = Math.round(performance.now() - started);
      await fs.writeFile(path.join(projectPaths.runtime, 'run-report.json'), `${JSON.stringify({
        version: '5.0',
        mode: 'brand-dna',
        analysisProfile: 'brand-dna',
        analysisRunId,
        status,
        desktopProjectId: projectId,
        apiProfileId: credentials.profileId,
        provider: credentials.provider,
        model: credentials.model,
        qualityTier: credentials.qualityTier,
        startedAt,
        failedAt: new Date().toISOString(),
        durationMs,
        failedStage: currentStage,
        failedStageId,
        completedStageIds,
        reusableCheckpointIds,
        resumeMode,
        errorCode: code || 'ANALYSIS_FAILED',
        error: message,
        schemaErrorPaths: typedError.jsonPaths || [],
        qualityAudit: typedError.audit || null
      }, null, 2)}\n`, 'utf8').catch(() => {});
      await checkpointStore?.writeRunState({
        analysisRunId,
        status: cancelled
          ? 'cancelled'
          : code === 'PIPELINE_TIME_BUDGET_EXCEEDED'
            ? 'failed-time-budget'
            : ['REQUEST_TIMEOUT', 'STAGE_TIMEOUT'].includes(code || '')
              ? 'failed-timeout'
              : 'failed-schema',
        currentStageId,
        completedStageIds,
        reusableCheckpointIds,
        startedAt,
        totalDurationMs: durationMs,
        totalModelDurationMs: 0,
        lastErrorCode: code || 'ANALYSIS_FAILED',
        lastErrorStage: currentStageId,
        resumeFromStage: currentStageId
      }).catch(() => {});
      await projects.update(projectId, { status, lastError: message });
      progress(cancelled ? 'cancelled' : 'failed', cancelled ? '分析已取消' : `分析失败：${message}`, {
        failedAtStage: currentStage as Exclude<AnalysisProgress['stage'], 'failed' | 'cancelled' | 'completed'>,
        failedAtStageId: failedStageId,
        completedStageIds,
        reusableCheckpointIds,
        resumeAvailable: completedStageIds.length > 0
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
