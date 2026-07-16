import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type {
  AnalysisProgress,
  AnalysisResult,
  NormalizedModelUsage,
  PublicSettings
} from '../shared/types';
import {
  buildFusionEnhancedTask,
  buildReportFilename,
  desktopFactualConstraints,
  extractProjectNameFromReport,
  normalizeReportTitle,
  redactSecret,
  validateDesktopReport
} from './analysis-contract';
import type { ProjectStore } from './project-store';
import type { ProviderCredentials } from './settings-store';
import { classifyUsageError, type UsageTracker } from './usage-tracker';

// Bundled from the repository core. Desktop remains the consumer, never the dependency.
// @ts-ignore — JavaScript core module intentionally has no TypeScript declaration file.
import { createQwenReasoner } from '../../../../src/v5/adapters/qwen-reasoner.js';

type ProgressSink = (progress: AnalysisProgress) => void;
type CredentialsReader = (profileId?: string) => Promise<ProviderCredentials>;
type SettingsReader = () => Promise<PublicSettings>;

interface ActiveRun {
  controller: AbortController;
  startedAt: string;
}

function configurePromptRoot(): void {
  process.env.MASTERPIECE_PROMPT_ROOT = app.isPackaged
    ? path.join(process.resourcesPath, 'prompts', 'v5')
    : path.resolve(app.getAppPath(), '..', '..', 'prompts', 'v5');
}

function providerLabel(provider: ProviderCredentials['provider']): string {
  return provider.trim() || 'openai-compatible';
}

function combineSignals(first: AbortSignal, second: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([first, second]);
  const controller = new AbortController();
  const abort = () => controller.abort();
  first.addEventListener('abort', abort, { once: true });
  second.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

function friendlyPipelineError(error: Error, apiKey: string): string {
  const message = redactSecret(error.message, apiKey).replace(/^Qwen 请求失败：\s*/i, '');
  if (/401|403|API Key|unauthorized|forbidden/i.test(message)) return 'API Key 无效或无权访问当前模型';
  if (/404|model.*not found|does not exist/i.test(message)) return 'Model ID 或 Base URL 不存在';
  if (/image|vision|multimodal/i.test(message) && /support|不支持/i.test(message)) return '当前模型不支持图片输入';
  if (/TIME_BUDGET_EXCEEDED|超时|aborted|abort/i.test(message)) return '分析超时或已被取消';
  if (/empty|空报告/i.test(message)) return '模型返回空内容，未生成报告';
  return message;
}

export function createPipelineService(
  projects: ProjectStore,
  readCredentials: CredentialsReader,
  readSettings: SettingsReader,
  emitProgress: ProgressSink,
  usageTracker?: UsageTracker
) {
  const active = new Map<string, ActiveRun>();

  async function start(projectId: string, forceReasoning = true, apiProfileId?: string): Promise<AnalysisResult> {
    if (active.has(projectId)) throw new Error('该项目正在分析中');
    const summary = await projects.scan(projectId);
    const project = await projects.get(projectId);
    if (project.mode !== 'visual-evolution') throw new Error('当前项目不是视觉方案进化模式');
    if (!summary.totalFiles) throw new Error('项目素材为空，请先上传视觉方案');
    if (summary.imageCount + summary.pdfCount === 0) throw new Error('项目中没有可分析的图片或 PDF');
    if (!project.logoLocked) throw new Error('Desktop 极简模式要求原始 Logo 默认锁定');
    if (project.outputLanguage !== 'zh-CN') throw new Error('Desktop 极简模式固定输出简体中文');
    const credentials = await readCredentials(apiProfileId || project.apiProfileId || undefined);
    const settings = await readSettings();
    const projectPaths = await projects.paths(projectId);
    const analysisRunId = crypto.randomUUID();
    const controller = new AbortController();
    const startedAt = new Date().toISOString();
    const started = performance.now();
    let currentStage: AnalysisProgress['stage'] = 'preparing-assets';
    active.set(projectId, { controller, startedAt });

    const progress = (
      stage: AnalysisProgress['stage'],
      message: string,
      extra: Partial<AnalysisProgress> = {}
    ) => {
      currentStage = stage;
      emitProgress({
        projectId,
        mode: 'visual-evolution',
        stage,
        message,
        startedAt,
        elapsedMs: Math.round(performance.now() - started),
        assetCount: summary.totalFiles,
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
      lastAnalysisRunId: analysisRunId,
      lastError: null
    });

    const configPath = path.join(projectPaths.runtime, 'masterpiece-os-v5.json');
    try {
      progress('preparing-assets', '正在整理视觉素材', {
        cacheStatus: forceReasoning ? 'forced' : 'checking'
      });
      progress('extracting-project-facts', '正在识别项目与品牌信息');
      const config = {
        version: '5.0',
        projectName: project.projectName,
        userTask: buildFusionEnhancedTask(project.description, project.projectName),
        brandFacts: {
          brandName: project.brandName,
          industry: project.industry,
          detectedBrandName: project.detectedBrandName,
          detectedIndustry: project.detectedIndustry,
          factConfidence: project.factConfidence,
          factualConstraints: desktopFactualConstraints(project.industry, project.lockedFacts, project.factConfidence.industry),
          logoAssets: project.logoFiles
        },
        benchmarkContext: { category: [], creativeExcellence: [] },
        performance: {
          targetMinutes: 10,
          maximumMinutes: 15,
          maxDetailAssets: 5,
          maxReportCharacters: 8_000,
          enablePreparationCache: settings.cacheEnabled
        },
        overrides: {
          additionalLockedAssets: [],
          allowLogoRedesign: false,
          requiredApplications: [],
          forbiddenChanges: project.lockedFacts,
          outputLanguage: project.outputLanguage
        }
      };
      await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
      configurePromptRoot();
      progress('building-contact-sheet', '正在生成视觉总览');

      const baseReasoner = createQwenReasoner({
        apiKey: credentials.apiKey,
        model: credentials.model,
        baseUrl: credentials.baseUrl
      });
      const reasoner = async (context: Record<string, unknown> & { signal: AbortSignal }) => {
        const usageCall = await usageTracker?.startCall({
          analysisRunId,
          projectId,
          projectName: project.projectName,
          analysisMode: 'visual-evolution',
          pipelineStage: 'visual.deep-reasoning',
          credentials
        }) || null;
        progress('building-prompt', '正在构建分析任务');
        await Promise.resolve();
        progress('reasoning', '正在执行深度创意导演分析', {
          cacheStatus: forceReasoning ? 'forced' : 'miss'
        });
        let supplied;
        try {
          supplied = await baseReasoner({
            ...context,
            signal: combineSignals(context.signal, controller.signal)
          });
          await usageTracker?.completeCall(usageCall, {
            status: 'success',
            usage: supplied.usage as NormalizedModelUsage,
            providerRequestId: supplied.providerRequestId,
            httpStatus: supplied.httpStatus
          });
        } catch (error) {
          await usageTracker?.completeCall(
            usageCall,
            classifyUsageError(error, controller.signal.aborted)
          );
          throw error;
        }
        progress('generating-report', '正在生成视觉方案升级报告');
        return { ...supplied, provider: providerLabel(credentials.provider) };
      };

      // Dynamic import ensures the packaged prompt resource path is configured first.
      // @ts-ignore — JavaScript core module intentionally has no TypeScript declaration file.
      const { runV5Pipeline } = await import('../../../../src/v5/bootstrap.js');
      const execution = await runV5Pipeline(projectPaths.input, {
        projectRoot: projectPaths.root,
        output: projectPaths.outputs,
        config: configPath,
        deepCreativeDirectorReasoner: reasoner,
        forceReasoning,
        preparationCacheRoot: path.join(projectPaths.prepared, 'visual'),
        benchmarkCacheRoot: path.join(projectPaths.prepared, 'benchmarks')
      });
      if (controller.signal.aborted) throw new DOMException('用户主动取消', 'AbortError');

      progress('validating-output', '正在校验报告');
      const coreReportPath = path.join(projectPaths.outputs, execution.result.outputFile);
      const rawReport = await fs.readFile(coreReportPath, 'utf8');
      const finalProjectName = extractProjectNameFromReport(rawReport) || project.projectName;
      const report = normalizeReportTitle(rawReport, finalProjectName, project.outputLanguage);
      validateDesktopReport(report);
      const reportFilename = buildReportFilename(finalProjectName, credentials.model, project.outputLanguage);
      const reportPath = path.join(projectPaths.outputs, reportFilename);
      await fs.writeFile(reportPath, report, 'utf8');
      if (path.resolve(coreReportPath) !== path.resolve(reportPath)) await fs.rm(coreReportPath, { force: true });
      if (project.lastReportFilename && project.lastReportFilename !== reportFilename) {
        await fs.rm(path.join(projectPaths.outputs, project.lastReportFilename), { force: true });
      }

      const completedAt = new Date().toISOString();
      const durationMs = Math.round(performance.now() - started);
      const runtimeReport = {
        ...execution.result.runReport,
        outputFile: reportFilename,
        analysisProfile: 'fusion-enhanced',
        analysisRunId,
        desktopProjectId: projectId,
        apiProfileId: credentials.profileId,
        provider: credentials.provider,
        model: credentials.model,
        startedAt,
        completedAt,
        durationMs
      };
      const runtimeReportPath = path.join(projectPaths.runtime, 'run-report.json');
      await fs.writeFile(runtimeReportPath, `${JSON.stringify(runtimeReport, null, 2)}\n`, 'utf8');
      const updated = await projects.update(projectId, {
        projectName: finalProjectName,
        detectedProjectName: finalProjectName,
        projectNameSource: finalProjectName === project.projectName ? project.projectNameSource : 'visual-content',
        projectNameConfidence: finalProjectName === project.projectName ? project.projectNameConfidence : 0.9,
        brandName: finalProjectName === project.projectName ? project.brandName : finalProjectName,
        detectedBrandName: finalProjectName === project.projectName ? project.detectedBrandName : finalProjectName,
        factConfidence: {
          ...project.factConfidence,
          brandName: finalProjectName === project.projectName ? project.factConfidence.brandName : 0.9
        },
        status: 'completed',
        provider: credentials.provider,
        model: credentials.model,
        apiProfileId: credentials.profileId,
        reasoningQualityTier: credentials.qualityTier,
        lastAnalysisRunId: analysisRunId,
        lastRunAt: completedAt,
        lastDurationMs: durationMs,
        lastReportFilename: reportFilename,
        lastError: null,
        assetCount: summary.totalFiles,
        imageCount: summary.imageCount
      });
      progress('completed', '分析完成', {
        cacheStatus: execution.result.runReport.reasoningCacheHit ? 'hit' : 'miss'
      });
      return {
        project: updated,
        analysisRunId,
        mode: 'visual-evolution',
        reportFilename,
        reportPath,
        runtimeReportPath,
        apiProfileId: credentials.profileId,
        provider: execution.result.runReport.provider,
        model: execution.result.runReport.model,
        durationMs,
        assetCount: summary.totalFiles,
        imageCount: summary.imageCount,
        reasoningCacheHit: execution.result.runReport.reasoningCacheHit
      };
    } catch (error) {
      const cancelled = controller.signal.aborted || (error as Error).name === 'AbortError';
      const message = cancelled ? '用户已取消分析' : friendlyPipelineError(error as Error, credentials.apiKey);
      await projects.update(projectId, { status: cancelled ? 'cancelled' : 'failed', lastError: message });
      await fs.rm(configPath, { force: true }).catch(() => {});
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

export type PipelineService = ReturnType<typeof createPipelineService>;
