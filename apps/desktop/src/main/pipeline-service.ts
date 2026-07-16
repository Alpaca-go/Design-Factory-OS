import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { AnalysisProgress, AnalysisResult, PublicSettings } from '../shared/types';
import {
  buildFusionEnhancedTask,
  buildReportFilename,
  desktopFactualConstraints,
  normalizeReportTitle,
  redactSecret,
  validateDesktopReport
} from './analysis-contract';
import type { ProjectStore } from './project-store';
import type { ProviderCredentials } from './settings-store';

// Bundled from the repository core. Desktop remains the consumer, never the dependency.
// @ts-ignore — JavaScript core module intentionally has no TypeScript declaration file.
import { createQwenReasoner } from '../../../../src/v5/adapters/qwen-reasoner.js';

type ProgressSink = (progress: AnalysisProgress) => void;
type CredentialsReader = () => Promise<ProviderCredentials>;
type SettingsReader = () => Promise<PublicSettings>;

interface ActiveRun {
  controller: AbortController;
  started: number;
}

function configurePromptRoot(): void {
  process.env.MASTERPIECE_PROMPT_ROOT = app.isPackaged
    ? path.join(process.resourcesPath, 'prompts', 'v5')
    : path.resolve(app.getAppPath(), '..', '..', 'prompts', 'v5');
}

function providerLabel(provider: ProviderCredentials['provider']): string {
  return provider === 'qwen' ? 'qwen' : provider;
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
  const message = redactSecret(error.message, apiKey);
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
  emitProgress: ProgressSink
) {
  const active = new Map<string, ActiveRun>();

  async function start(projectId: string, forceReasoning = true): Promise<AnalysisResult> {
    if (active.has(projectId)) throw new Error('该项目正在分析中');
    const project = await projects.get(projectId);
    const summary = await projects.scan(projectId);
    if (!summary.totalFiles) throw new Error('项目素材为空，请先上传视觉方案');
    if (!project.industry.trim()) throw new Error('行业属性必须由用户确认');
    if (typeof project.logoLocked !== 'boolean') throw new Error('Logo 锁定状态尚未确认');
    const credentials = await readCredentials();
    const settings = await readSettings();
    const projectPaths = await projects.paths(projectId);
    const controller = new AbortController();
    const started = performance.now();
    active.set(projectId, { controller, started });

    const progress = (
      stage: AnalysisProgress['stage'],
      percent: number,
      message: string,
      extra: Partial<AnalysisProgress> = {}
    ) => emitProgress({
      projectId,
      stage,
      progress: percent,
      message,
      elapsedMs: Math.round(performance.now() - started),
      assetCount: summary.totalFiles,
      model: credentials.model,
      ...extra
    });

    await projects.update(projectId, {
      status: 'running',
      provider: credentials.provider,
      model: credentials.model,
      lastError: null
    });

    try {
      progress('preparing-assets', 8, '正在检查视觉素材', {
        cacheStatus: forceReasoning ? 'forced' : 'checking'
      });
      progress('locking-facts', 18, '正在锁定品牌事实');
      const configPath = path.join(projectPaths.runtime, 'masterpiece-os-v5.json');
      const config = {
        version: '5.0',
        projectName: project.projectName,
        userTask: buildFusionEnhancedTask(project.description),
        brandFacts: {
          brandName: project.brandName,
          industry: project.industry,
          factualConstraints: desktopFactualConstraints(project.industry, project.lockedFacts),
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
          allowLogoRedesign: !project.logoLocked,
          requiredApplications: [],
          forbiddenChanges: project.lockedFacts,
          outputLanguage: project.outputLanguage
        }
      };
      await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
      configurePromptRoot();
      progress('building-prompt', 30, '正在构建融合增强分析任务');

      const baseReasoner = createQwenReasoner({
        apiKey: credentials.apiKey,
        model: credentials.model,
        baseUrl: credentials.baseUrl
      });
      const reasoner = async (context: Record<string, unknown> & { signal: AbortSignal }) => {
        progress('reasoning', 48, '正在执行融合增强分析', {
          cacheStatus: forceReasoning ? 'forced' : 'miss'
        });
        const supplied = await baseReasoner({
          ...context,
          signal: combineSignals(context.signal, controller.signal)
        });
        progress('generating-report', 82, '正在生成视觉升级报告');
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

      progress('validating-output', 92, '正在校验输出文件');
      const coreReportPath = path.join(projectPaths.outputs, execution.result.outputFile);
      const rawReport = await fs.readFile(coreReportPath, 'utf8');
      const report = normalizeReportTitle(rawReport, project.projectName, project.outputLanguage);
      validateDesktopReport(report);
      const reportFilename = buildReportFilename(project.projectName, credentials.model, project.outputLanguage);
      const reportPath = path.join(projectPaths.outputs, reportFilename);
      await fs.writeFile(reportPath, report, 'utf8');
      if (path.resolve(coreReportPath) !== path.resolve(reportPath)) await fs.rm(coreReportPath, { force: true });

      const runtimeReport = {
        ...execution.result.runReport,
        outputFile: reportFilename,
        analysisProfile: 'fusion-enhanced',
        desktopProjectId: projectId
      };
      const runtimeReportPath = path.join(projectPaths.runtime, 'run-report.json');
      await fs.writeFile(runtimeReportPath, `${JSON.stringify(runtimeReport, null, 2)}\n`, 'utf8');
      const durationMs = Math.round(performance.now() - started);
      const updated = await projects.update(projectId, {
        status: 'completed',
        provider: credentials.provider,
        model: credentials.model,
        lastRunAt: new Date().toISOString(),
        lastDurationMs: durationMs,
        lastReportFilename: reportFilename,
        lastError: null,
        assetCount: summary.totalFiles,
        imageCount: summary.imageCount
      });
      progress('completed', 100, '分析完成', {
        cacheStatus: execution.result.runReport.reasoningCacheHit ? 'hit' : 'miss'
      });
      return {
        project: updated,
        reportFilename,
        reportPath,
        runtimeReportPath,
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
