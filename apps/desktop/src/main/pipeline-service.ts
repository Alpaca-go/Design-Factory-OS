import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type {
  AnalysisProgress,
  AnalysisResult,
  CurrentProjectAssetDecision,
  CurrentProjectProfile,
  CurrentProjectVisualSources,
  FlexibleColorSystem,
  FlexibleCompositionSystem,
  ProjectTouchpointInventory,
  PublicSettings,
  ReferenceAssetDecision,
  ReferenceInheritanceRule,
  ReferenceStyleProfile,
  ReferenceStyleRule,
  VisualAnchor,
  VisualAnalysisPurpose,
  VisualReconstructionDirection
} from '../shared/types';
import {
  normalizeCurrentProjectDecisions,
  normalizeReferenceDecisions
} from './asset-selection-protocol/index.ts';
import {
  buildCurrentProjectAssetSelectionPrompt,
  buildReferenceAssetSelectionPrompt
} from './asset-selection-protocol/prompts.ts';
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
import {
  incompleteProjectIdentity,
  resolveAnalyzedProjectIdentity
} from './project-identity.ts';
import type { ProviderCredentials } from './settings-store';
import {
  assertCurrentProjectProfile,
  completeVisualDirectionTouchpoints,
  normalizeProjectTouchpointClassification,
  validateReferenceStyleProfile,
  validateVisualDirectionExecutability
} from './reference-style-reconstruction';
import {
  buildCurrentProjectFactsPrompt,
  buildReferenceStylePrompt,
  buildVisualReconstructionDecisionPrompt
} from './reference-reconstruction-prompts';

// Bundled from the repository core. Desktop remains the consumer, never the dependency.
// @ts-ignore — JavaScript core module intentionally has no TypeScript declaration file.
import { createQwenReasoner } from '../../../../src/v5/adapters/qwen-reasoner.js';
// @ts-ignore — JavaScript core module intentionally has no TypeScript declaration file.
import { parseStructuredResponse } from '../../../../src/v5/shared/analysis/response-parser.js';

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

interface StructuredStepAttempt {
  attempt: number;
  completedAt: string;
  rawResponse: string;
  validationError?: {
    code?: string;
    message: string;
    issues?: string[];
    details?: unknown;
  };
}

function preservePipelineError(
  error: Error & {
    code?: string;
    issues?: string[];
    details?: unknown;
    structuredStep?: string;
    structuredAttempts?: StructuredStepAttempt[];
  },
  apiKey: string
): Error {
  return Object.assign(new Error(friendlyPipelineError(error, apiKey)), {
    code: error.code,
    issues: error.issues,
    details: error.details,
    structuredStep: error.structuredStep,
    structuredAttempts: error.structuredAttempts
  });
}

const valueArray = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
  : [];

function directionTextArray(value: unknown): string[] {
  const values: string[] = [];
  const visit = (item: unknown): void => {
    if (typeof item === 'string' || typeof item === 'number') {
      const text = String(item).trim();
      if (text) values.push(text);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!item || typeof item !== 'object') return;
    const source = item as Record<string, unknown>;
    const preferred = [
      source.rule,
      source.redirection,
      source.description,
      source.visualForm,
      source.transformationLogic
    ].find((candidate) => typeof candidate === 'string' && candidate.trim());
    if (preferred) {
      visit(preferred);
      return;
    }
    Object.values(source).forEach(visit);
  };
  visit(value);
  return [...new Set(values)];
}

function directionNameValue(value: unknown, brandName: string): string {
  const source = String(value || '').trim()
    .replace(/[·｜|:：—–-]/gu, '')
    .replace(/Reference-First|视觉重构|重构执行方案|执行方案|视觉方向|视觉系统/giu, '')
    .replace(/\s+/gu, '');
  const candidate = source || `${brandName}新序`;
  return [...candidate].slice(0, 8).join('');
}

function separatedDirectionTextArray(value: unknown): string[] {
  return [...new Set(directionTextArray(value)
    .flatMap((item) => item.split(/[、，,；;]/gu).map((part) => part.trim()).filter(Boolean)))];
}

const incompleteFact = incompleteProjectIdentity;

function styleRuleArray(value: unknown): ReferenceStyleRule[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const source = item as Record<string, unknown>;
    const rule = String(source.rule || '').trim();
    const designEffect = String(source.designEffect || '').trim();
    if (!rule || !designEffect) return [];
    return [{
      rule,
      inheritanceLevel: source.inheritanceLevel === 'principle'
        || source.inheritanceLevel === 'relationship'
        || source.inheritanceLevel === 'surface'
        ? source.inheritanceLevel
        : undefined,
      evidence: valueArray(source.evidence),
      designEffect,
      confidence: Math.max(0, Math.min(1, Number(source.confidence ?? 0.7)))
    }];
  });
}

const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function visualSourcesValue(value: unknown): CurrentProjectVisualSources {
  const source = recordValue(value);
  return {
    productForms: valueArray(source.productForms),
    cookingActions: valueArray(source.cookingActions),
    sensorySignals: valueArray(source.sensorySignals),
    consumptionActions: valueArray(source.consumptionActions),
    brandNameSemantics: valueArray(source.brandNameSemantics),
    spatialObjects: valueArray(source.spatialObjects)
  };
}

function touchpointInventoryValue(value: unknown): ProjectTouchpointInventory {
  const source = recordValue(value);
  return {
    primaryPackaging: valueArray(source.primaryPackaging),
    secondaryPackaging: valueArray(source.secondaryPackaging),
    serviceMaterials: valueArray(source.serviceMaterials),
    viApplications: valueArray(source.viApplications),
    spatialTouchpoints: valueArray(source.spatialTouchpoints),
    digitalTouchpoints: valueArray(source.digitalTouchpoints)
  };
}

function visualAnchorValue(value: unknown): VisualAnchor {
  const source = recordValue(value);
  return {
    name: String(source.name || '').trim(),
    sourceElements: separatedDirectionTextArray(source.sourceElements),
    transformationLogic: String(source.transformationLogic || '').trim(),
    visualForm: String(source.visualForm || '').trim(),
    extensionTouchpoints: separatedDirectionTextArray(source.extensionTouchpoints),
    referenceSurfaceSimilarityRisk: source.referenceSurfaceSimilarityRisk === 'medium'
      || source.referenceSurfaceSimilarityRisk === 'high'
      ? source.referenceSurfaceSimilarityRisk
      : 'low'
  };
}

function referenceInheritanceValue(value: unknown): ReferenceInheritanceRule[] {
  const normalized = Array.isArray(value)
    ? value
    : Object.entries(recordValue(value)).map(([level, weight]) => ({
      level,
      weight,
      rule: `采用参考项目的${level}层级规则`
    }));
  return normalized.flatMap((item) => {
    const source = recordValue(item);
    const level = source.level;
    if (level !== 'principle' && level !== 'relationship' && level !== 'surface') return [];
    const defaultWeight = level === 'principle' ? 1 : level === 'relationship' ? 0.8 : 0.35;
    return [{
      level: level as ReferenceInheritanceRule['level'],
      weight: Number.isFinite(Number(source.weight)) ? Number(source.weight) : defaultWeight,
      rule: String(source.rule || '').trim()
    }];
  }).filter((item) => item.rule);
}

function flexibleColorSystemValue(value: unknown): FlexibleColorSystem {
  const source = recordValue(value);
  return {
    identityColorRole: String(source.identityColorRole || '').trim(),
    backgroundOptions: valueArray(source.backgroundOptions),
    textAndStructureColors: valueArray(source.textAndStructureColors),
    accentOptions: valueArray(source.accentOptions),
    saturationGuideline: String(source.saturationGuideline || '').trim(),
    touchpointVariations: valueArray(source.touchpointVariations)
  };
}

function flexibleCompositionSystemValue(value: unknown): FlexibleCompositionSystem {
  const source = recordValue(value);
  return {
    fixedPrinciples: valueArray(source.fixedPrinciples),
    allowedVariations: valueArray(source.allowedVariations),
    seriesConsistencyRules: valueArray(source.seriesConsistencyRules),
    prohibitedLayouts: valueArray(source.prohibitedLayouts)
  };
}

export function createPipelineService(
  projects: ProjectStore,
  readCredentials: CredentialsReader,
  readSettings: SettingsReader,
  emitProgress: ProgressSink
) {
  const active = new Map<string, ActiveRun>();

  async function start(
    projectId: string,
    forceReasoning = true,
    apiProfileId?: string,
    validationMode: 'visual_upgrade' | 'reference_source' = 'visual_upgrade'
  ): Promise<AnalysisResult> {
    if (active.has(projectId)) throw new Error('该项目正在分析中');
    const summary = await projects.scan(projectId);
    const project = await projects.get(projectId);
    if (!summary.totalFiles) throw new Error('项目素材为空，请先上传视觉方案');
    if (summary.imageCount + summary.pdfCount === 0) throw new Error('项目中没有可分析的图片或 PDF');
    if (!project.logoLocked) throw new Error('Desktop 极简模式要求原始 Logo 默认锁定');
    if (project.outputLanguage !== 'zh-CN') throw new Error('Desktop 极简模式固定输出简体中文');
    const credentials = await readCredentials(apiProfileId || project.apiProfileId || undefined);
    const settings = await readSettings();
    const projectPaths = await projects.paths(projectId);
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
        progress('building-prompt', '正在构建分析任务');
        await Promise.resolve();
        progress('reasoning', '正在执行深度创意导演分析', {
          cacheStatus: forceReasoning ? 'forced' : 'miss'
        });
        const supplied = await baseReasoner({
          ...context,
          signal: combineSignals(context.signal, controller.signal)
        });
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
      if (validationMode === 'visual_upgrade') validateDesktopReport(report);
      else if (!report.trim()) throw new Error('参考视觉分析结果为空');
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

  async function runStructuredReferenceStep<T>(options: {
    step: string;
    projectId: string;
    apiProfileId?: string;
    prompt: string;
    includeVisualAssets: boolean;
    assetIds?: string[];
    maxVisualAssets?: number;
    normalize(value: Record<string, unknown>, assetIds: string[]): T;
    validate(value: T): T;
  }): Promise<{
    value: T;
    provider: string;
    model: string;
    durationMs: number;
    modelCallCount: number;
  }> {
    if (active.has(options.projectId)) throw new Error('该项目正在执行结构化视觉分析');
    const project = await projects.get(options.projectId);
    const credentials = await readCredentials(options.apiProfileId || project.apiProfileId || undefined);
    const projectPaths = await projects.paths(options.projectId);
    const controller = new AbortController();
    const startedAt = new Date().toISOString();
    const started = performance.now();
    active.set(options.projectId, { controller, startedAt });
    const allowedAssetIds = options.assetIds ? new Set(options.assetIds) : null;
    const visualAssets = options.includeVisualAssets
      ? (project.assets || []).filter((asset) =>
        /^image\//iu.test(asset.mimeType) && (!allowedAssetIds || allowedAssetIds.has(asset.id)))
        .slice(0, options.maxVisualAssets || 12)
      : [];
    const attachments = visualAssets.map((asset, index) => ({
      assetId: asset.id || `visual-${String(index + 1).padStart(3, '0')}`,
      path: path.join(projectPaths.input, asset.relativePath),
      mediaType: 'image',
      format: path.extname(asset.relativePath).slice(1),
      readable: true
    }));
    if (options.includeVisualAssets && !attachments.length) {
      active.delete(options.projectId);
      throw new Error('当前模型分析步骤需要至少一张可读取图片');
    }
    const reasoner = createQwenReasoner({
      apiKey: credentials.apiKey,
      model: credentials.model,
      baseUrl: credentials.baseUrl
    });
    let modelCallCount = 0;
    let lastError: unknown;
    let repairContext = '';
    const structuredAttempts: StructuredStepAttempt[] = [];
    try {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        modelCallCount += 1;
        const response = await reasoner({
          prompt: {
            messages: [
              {
                role: 'system',
                content: '你是 Masterpiece OS 的结构化视觉分析器。严格隔离项目事实与参考视觉风格，只返回请求的 JSON。'
              },
              {
                role: 'user',
                content: `${options.prompt}${repairContext}`
              }
            ],
            attachments
          },
          signal: controller.signal,
          maximumDurationMs: 15 * 60_000
        });
        const attemptRecord: StructuredStepAttempt = {
          attempt,
          completedAt: new Date().toISOString(),
          rawResponse: response.reportMarkdown.slice(0, 200_000)
        };
        try {
          const parsed = parseStructuredResponse(response.reportMarkdown) as Record<string, unknown>;
          const value = options.validate(options.normalize(parsed, attachments.map((item) => item.assetId)));
          structuredAttempts.push(attemptRecord);
          return {
            value,
            provider: providerLabel(credentials.provider),
            model: response.model || credentials.model,
            durationMs: Math.round(performance.now() - started),
            modelCallCount
          };
        } catch (error) {
          lastError = error;
          const structuredError = error as Error & {
            code?: string;
            issues?: string[];
            details?: unknown;
          };
          attemptRecord.validationError = {
            code: structuredError.code,
            message: structuredError.message,
            issues: structuredError.issues,
            details: structuredError.details
          };
          structuredAttempts.push(attemptRecord);
          const detailText = structuredError.details
            ? `\n缺项明细：${JSON.stringify(structuredError.details)}`
            : '';
          repairContext = `\n\n上一次输出未通过 Schema／质量校验：${structuredError.message}。${detailText}
请逐项补齐缺失内容，保留所有已正确字段，并重新输出完整 JSON，不要解释。`;
        }
      }
      throw lastError instanceof Error ? lastError : new Error('结构化视觉分析未通过校验');
    } catch (error) {
      const cancelled = controller.signal.aborted || (error as Error).name === 'AbortError';
      if (cancelled) throw Object.assign(new Error('用户已取消分析'), { code: 'CANCELLED' });
      const source = error as Error & {
        code?: string;
        issues?: string[];
        details?: unknown;
      };
      throw preservePipelineError(Object.assign(source, {
        structuredStep: options.step,
        structuredAttempts
      }), credentials.apiKey);
    } finally {
      active.delete(options.projectId);
    }
  }

  async function selectCurrentProjectAssets(projectId: string, apiProfileId?: string) {
    const project = await projects.get(projectId);
    const assets = (project.assets || []).filter((asset) =>
      asset.status !== 'deleted' && /^image\//iu.test(asset.mimeType));
    if (!assets.length) {
      return {
        value: [] as CurrentProjectAssetDecision[],
        provider: 'local',
        model: 'deterministic-fallback',
        durationMs: 0,
        modelCallCount: 0
      };
    }
    const results: Awaited<ReturnType<typeof runStructuredReferenceStep<CurrentProjectAssetDecision[]>>>[] = [];
    for (let offset = 0; offset < assets.length; offset += 30) {
      const batch = assets.slice(offset, offset + 30);
      results.push(await runStructuredReferenceStep<CurrentProjectAssetDecision[]>({
        step: `current-project-asset-selection-${Math.floor(offset / 30) + 1}`,
        projectId,
        apiProfileId,
        prompt: buildCurrentProjectAssetSelectionPrompt(project, batch),
        includeVisualAssets: true,
        assetIds: batch.map((asset) => asset.id),
        maxVisualAssets: 30,
        normalize: (raw) => normalizeCurrentProjectDecisions(
          Array.isArray(raw.decisions) ? raw.decisions as CurrentProjectAssetDecision[] : [],
          batch
        ),
        validate: (value) => {
          if (value.length !== batch.length) {
            throw Object.assign(new Error('当前项目资产筛选结果未覆盖当前批次全部可视资产'), {
              code: 'CURRENT_CORE_PACK_INCOMPLETE'
            });
          }
          return value;
        }
      }));
    }
    return {
      value: results.flatMap((item) => item.value),
      provider: results[0]!.provider,
      model: results[0]!.model,
      durationMs: results.reduce((sum, item) => sum + item.durationMs, 0),
      modelCallCount: results.reduce((sum, item) => sum + item.modelCallCount, 0)
    };
  }

  async function selectReferenceAssets(projectId: string, apiProfileId?: string) {
    const project = await projects.get(projectId);
    const assets = (project.assets || []).filter((asset) =>
      asset.status !== 'deleted' && /^image\//iu.test(asset.mimeType));
    const results: Awaited<ReturnType<typeof runStructuredReferenceStep<ReferenceAssetDecision[]>>>[] = [];
    for (let offset = 0; offset < assets.length; offset += 30) {
      const batch = assets.slice(offset, offset + 30);
      results.push(await runStructuredReferenceStep<ReferenceAssetDecision[]>({
        step: `reference-master-set-selection-${Math.floor(offset / 30) + 1}`,
        projectId,
        apiProfileId,
        prompt: buildReferenceAssetSelectionPrompt(batch),
        includeVisualAssets: true,
        assetIds: batch.map((asset) => asset.id),
        maxVisualAssets: 30,
        normalize: (raw) => normalizeReferenceDecisions(
          Array.isArray(raw.decisions) ? raw.decisions as ReferenceAssetDecision[] : [],
          batch
        ),
        validate: (value) => {
          if (value.length !== batch.length) {
            throw Object.assign(new Error('参考资产筛选结果未覆盖当前批次全部可视资产'), {
              code: 'REFERENCE_MASTER_SET_INSUFFICIENT'
            });
          }
          return value;
        }
      }));
    }
    return {
      value: results.flatMap((item) => item.value),
      provider: results[0]!.provider,
      model: results[0]!.model,
      durationMs: results.reduce((sum, item) => sum + item.durationMs, 0),
      modelCallCount: results.reduce((sum, item) => sum + item.modelCallCount, 0)
    };
  }

  async function analyzeCurrentProjectProfile(
    projectId: string,
    apiProfileId?: string,
    purpose: VisualAnalysisPurpose = 'current_project_audit',
    assetIds?: string[]
  ) {
    if (purpose !== 'current_project_audit') throw new Error(`不支持的当前项目分析用途：${purpose}`);
    const project = await projects.get(projectId);
    return runStructuredReferenceStep<CurrentProjectProfile>({
      step: 'current-project-profile',
      projectId,
      apiProfileId,
      prompt: buildCurrentProjectFactsPrompt(project),
      includeVisualAssets: true,
      assetIds,
      normalize: (raw, assetIds) => {
        const classifiedTouchpoints = normalizeProjectTouchpointClassification({
          packagingStructures: valueArray(raw.packagingStructures),
          touchpointInventory: touchpointInventoryValue(raw.touchpointInventory)
        });
        const identity = resolveAnalyzedProjectIdentity(project, raw.brandName);
        return {
          schemaVersion: 'current-project-profile-v3',
          projectId: project.id,
          projectName: identity.projectName,
          brandName: identity.brandName,
          industry: !incompleteFact(project.industry)
            ? project.industry
            : String(raw.industry || project.detectedIndustry || ''),
          coreProducts: valueArray(raw.coreProducts),
          targetAudience: valueArray(raw.targetAudience),
          brandPositioning: String(raw.brandPositioning || '').trim(),
          pricePositioning: String(raw.pricePositioning || '').trim() || undefined,
          usageScenarios: valueArray(raw.usageScenarios),
          businessTouchpoints: valueArray(raw.businessTouchpoints),
          packagingStructures: classifiedTouchpoints.packagingStructures,
          visualSources: visualSourcesValue(raw.visualSources),
          touchpointInventory: classifiedTouchpoints.touchpointInventory,
          lockedAssets: [...new Set([
            ...(project.logoLocked ? ['当前项目原始 Logo'] : []),
            ...(project.logoFiles || []),
            ...(project.lockedFacts || [])
          ])],
          confirmedFacts: valueArray(raw.confirmedFacts),
          sourceArtifactIds: [`project:${project.id}`, ...assetIds],
          currentVisualAssets: (project.assets || []).map((asset) => asset.originalName)
        };
      },
      validate: (value) => assertCurrentProjectProfile(value)
    });
  }

  async function analyzeReferenceStyle(
    projectId: string,
    apiProfileId?: string,
    purpose: VisualAnalysisPurpose = 'reference_style',
    assetIds?: string[]
  ) {
    if (purpose !== 'reference_style') throw new Error(`不支持的参考视觉分析用途：${purpose}`);
    return runStructuredReferenceStep<ReferenceStyleProfile>({
      step: 'reference-style-profile',
      projectId,
      apiProfileId,
      prompt: buildReferenceStylePrompt(),
      includeVisualAssets: true,
      assetIds,
      normalize: (raw, assetIds) => ({
        schemaVersion: 'reference-style-profile-v3',
        overallTemperament: styleRuleArray(raw.overallTemperament),
        colorSystem: styleRuleArray(raw.colorSystem),
        compositionSystem: styleRuleArray(raw.compositionSystem),
        graphicLanguage: styleRuleArray(raw.graphicLanguage),
        typographySystem: styleRuleArray(raw.typographySystem),
        materialSystem: styleRuleArray(raw.materialSystem),
        lightingSystem: styleRuleArray(raw.lightingSystem),
        photographySystem: styleRuleArray(raw.photographySystem),
        packagingPresentation: styleRuleArray(raw.packagingPresentation),
        posterPresentation: styleRuleArray(raw.posterPresentation),
        viExtensionSystem: styleRuleArray(raw.viExtensionSystem),
        excludedIdentityTerms: valueArray(raw.excludedIdentityTerms),
        sourceAssetIds: valueArray(raw.sourceAssetIds).length ? valueArray(raw.sourceAssetIds) : assetIds
      }),
      validate: (value) => validateReferenceStyleProfile(value, value.excludedIdentityTerms)
    });
  }

  async function generateVisualReconstructionDecision(input: {
    projectId: string;
    apiProfileId?: string;
    currentProjectProfile: CurrentProjectProfile;
    referenceStyleProfile: ReferenceStyleProfile;
    preference?: string;
  }) {
    return runStructuredReferenceStep<VisualReconstructionDirection>({
      step: 'visual-reconstruction-decision',
      projectId: input.projectId,
      apiProfileId: input.apiProfileId,
      prompt: buildVisualReconstructionDecisionPrompt(input),
      includeVisualAssets: false,
      normalize: (raw) => {
        const touchpoints = raw.touchpointRules && typeof raw.touchpointRules === 'object'
          ? raw.touchpointRules as Record<string, unknown>
          : {};
        const anchor = visualAnchorValue(raw.visualAnchor || raw.visualAnchorDefinition);
        const flexibleColorSystem = flexibleColorSystemValue(raw.flexibleColorSystem);
        const flexibleCompositionSystem = flexibleCompositionSystemValue(raw.flexibleCompositionSystem);
        const direction: VisualReconstructionDirection = {
          directionName: directionNameValue(raw.directionName, input.currentProjectProfile.brandName),
          coreProposition: String(raw.coreProposition || raw.coreVisualDirection || '').trim(),
          visualAnchor: [anchor.transformationLogic, anchor.visualForm].filter(Boolean).join('；'),
          visualAnchorDefinition: anchor,
          executionDetailLevel: 'gpt_visual',
          referenceInheritance: referenceInheritanceValue(raw.referenceInheritance),
          currentProjectIdentityToRetain: directionTextArray(raw.currentProjectIdentityToRetain),
          currentVisualElementsToRedesign: directionTextArray(raw.currentVisualElementsToRedesign),
          flexibleCompositionSystem,
          compositionSystem: [
            ...flexibleCompositionSystem.fixedPrinciples,
            ...flexibleCompositionSystem.allowedVariations,
            ...flexibleCompositionSystem.seriesConsistencyRules,
            ...flexibleCompositionSystem.prohibitedLayouts.map((item) => `禁止：${item}`)
          ],
          graphicSystem: directionTextArray(raw.graphicSystem),
          flexibleColorSystem,
          colorSystem: [
            flexibleColorSystem.identityColorRole,
            ...flexibleColorSystem.backgroundOptions,
            ...flexibleColorSystem.textAndStructureColors,
            ...flexibleColorSystem.accentOptions,
            flexibleColorSystem.saturationGuideline,
            ...flexibleColorSystem.touchpointVariations
          ].filter(Boolean),
          typographySystem: directionTextArray(raw.typographySystem),
          materialSystem: directionTextArray(raw.materialSystem),
          lightingSystem: directionTextArray(raw.lightingSystem),
          photographySystem: directionTextArray(raw.photographySystem),
          touchpointRules: {
            packaging: valueArray(touchpoints.packaging),
            poster: valueArray(touchpoints.poster),
            vi: valueArray(touchpoints.vi),
            space: valueArray(touchpoints.space)
          },
          prohibitedActions: valueArray(raw.prohibitedActions)
        };
        return completeVisualDirectionTouchpoints(
          direction,
          input.currentProjectProfile,
          input.referenceStyleProfile
        );
      },
      validate: (value) => {
        validateVisualDirectionExecutability(value, input.currentProjectProfile);
        return value;
      }
    });
  }

  function cancel(projectId: string): boolean {
    const run = active.get(projectId);
    if (!run) return false;
    run.controller.abort();
    return true;
  }

  return {
    start,
    selectCurrentProjectAssets,
    selectReferenceAssets,
    analyzeCurrentProjectProfile,
    analyzeReferenceStyle,
    generateVisualReconstructionDecision,
    cancel
  };
}

export type PipelineService = ReturnType<typeof createPipelineService>;
