import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  PublicSettings,
  StartVisualTranslationInput,
  VisualStrategyCorpus,
  VisualTranslationDocumentSummary,
  VisualTranslationProgress,
  VisualTranslationResult,
  VisualTranslationRunRecord,
  VisualTranslationStage,
  VisualTranslationUserError
} from '../shared/types';
import { buildVisualStrategyCorpus, parseStrategyDocument } from './document-processing.ts';
import { assertInside } from './analysis-contract.ts';
import type { ProviderCredentials } from './settings-store';

// Bundled from the repository core. Desktop owns persistence and user interaction only.
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { createOpenAICompatibleTextReasoner } from '../../../../src/v5/adapters/openai-compatible-text-reasoner.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { runVisualTranslationV1 } from '../../../../src/v5/visual-translation/v1/index.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { runVisualTranslationV2 } from '../../../../src/v5/visual-translation/v2/runtime/run-visual-translation-v2.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { EXPERIMENT_MODE, PRODUCTION_BASELINE_MODE, normalizeDirectionGenerationMode, isExecutionMode } from '../../../../src/v5/visual-translation/v2/config/direction-generation-mode.js';

type CredentialsReader = (profileId?: string) => Promise<ProviderCredentials>;
type SettingsReader = () => Promise<PublicSettings>;
type ProgressSink = (progress: VisualTranslationProgress) => void;
type TextReasonerFactory = (options: { apiKey: string; model: string; provider: string; baseUrl: string }) => (messages: any, context?: any) => Promise<any>;
type VisualTranslationRunner = (input: Record<string, unknown>) => Promise<any>;

interface ActiveRun {
  controller: AbortController;
  startedAt: string;
}

const STAGE_MESSAGES: Record<VisualTranslationStage, string> = {
  '00-document-preparation': '正在整理与去重策略文档',
  '01-visual-evidence': '正在提取视觉证据',
  '02-visual-signal-opportunity': '正在生成视觉信号与机会地图',
  '04-three-creative-directions': '正在构建三个显著不同的创意方向',
  '05-direction-recommendation': '正在执行本地方向排序',
  '04b-compile-execution-directions': '正在编译执行向方向与回归守卫',
  '10-local-report-compiler': '正在编译视觉方向报告'
};

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.md', '.markdown', '.txt']);

// Map a thrown Visual Translation error into a user-facing explanation
// (doc: v2 Stage 04 输出截断修复, §5). The UI must show actionable detail rather
// than a bare red box when the structured output is truncated by the model.
function mapVisualTranslationUserError(error: unknown): VisualTranslationUserError {
  const code = (error as { code?: string })?.code;
  const details = (error as { details?: Record<string, unknown> })?.details || {};
  if (code === 'OUTPUT_TRUNCATED' || code === 'OUTPUT_TRUNCATED_AFTER_RETRY') {
    const stageId = (error as { stageId?: string })?.stageId || (details.stageId as string) || null;
    const modelId = (error as { modelId?: string })?.modelId || (details.modelId as string) || null;
    const requested = (error as { requestedMaxOutputTokens?: number })?.requestedMaxOutputTokens ?? (details.requestedMaxOutputTokens as number) ?? null;
    const escalated = (error as { escalatedMaxOutputTokens?: number })?.escalatedMaxOutputTokens ?? (details.escalatedMaxOutputTokens as number) ?? null;
    const providerMax = (error as { providerMaxOutputTokens?: number })?.providerMaxOutputTokens ?? (details.providerMaxOutputTokens as number) ?? null;
    return {
      code: code || 'OUTPUT_TRUNCATED',
      title: '视觉方向输出被截断',
      message: '当前模型输出达到长度上限，未能生成完整结构化结果。',
      recoverable: true,
      stageId,
      modelId,
      requestedMaxOutputTokens: escalated || requested,
      providerMaxOutputTokens: providerMax,
      retried: code === 'OUTPUT_TRUNCATED_AFTER_RETRY',
      suggestedAction: '提高该阶段输出预算，或切换到支持更大输出长度的模型后重试。'
    };
  }
  if (code === 'MODEL_OUTPUT_LIMIT_EXCEEDED') {
    return {
      code: code || 'MODEL_OUTPUT_LIMIT_EXCEEDED',
      title: '输出预算超过模型上限',
      message: `请求的输出长度超过模型支持的最大值（请求 ${details.requestedMaxOutputTokens ?? '?'} / 上限 ${details.providerMaxOutputTokens ?? '?'}）。`,
      recoverable: false,
      stageId: (details.stageId as string) || null,
      modelId: (details.modelId as string) || null,
      requestedMaxOutputTokens: (details.requestedMaxOutputTokens as number) ?? null,
      providerMaxOutputTokens: (details.providerMaxOutputTokens as number) ?? null,
      retried: false,
      suggestedAction: '降低该阶段输出预算，或确认 Provider 的真实输出上限配置后重试。'
    };
  }
  return {
    code: code || 'UNKNOWN',
    title: '视觉转译失败',
    message: (error as Error)?.message || '未知错误',
    recoverable: false,
    stageId: (error as { stageId?: string })?.stageId ?? null,
    modelId: null,
    requestedMaxOutputTokens: null,
    providerMaxOutputTokens: null,
    retried: false,
    suggestedAction: '请查看运行日志或重试。'
  };
}

function safeRunId(runId: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(runId)) throw new Error('Visual Translation Run ID 无效');
  return runId;
}

function safeProjectName(value: string): string {
  const name = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80);
  if (!name) throw new Error('请输入项目名称');
  return name;
}

function documentProjectCandidate(value: string): string | null {
  const stem = path.basename(String(value || '')).replace(/\.[^.]+$/u, '')
    .replace(/^\d{1,3}[-_.、\s]+/u, '')
    .replace(/(?:[-_.\s]*v?\d+(?:\.\d+)+(?:\s*\(\d+\))?|\(\d+\))$/iu, '')
    .trim();
  const descriptor = /(?:[-—_·\s]*)(?:品牌(?:市场调研|重塑|定位|策略|战略|策划)?|市场(?:研究|调研)|调研报告|视觉(?:方案|策略|规范|指南|系统|转译)|包装设计|创意简报|策略方案|定位提案|提案|方案|报告)/u;
  const marker = stem.search(descriptor);
  const candidate = (marker > 0 ? stem.slice(0, marker) : marker === 0 ? '' : stem)
    .replace(/^[“”"'《》【】\[\]()（）\s]+|[“”"'《》【】\[\]()（）\s]+$/gu, '')
    .replace(/[-—_·\s]+$/u, '')
    .trim();
  if (candidate.length < 2 || candidate.length > 48 || /^(?:品牌|项目|文档|策略|方案|报告)$/u.test(candidate)) return null;
  return candidate;
}

export function deriveVisualTranslationProjectName(corpus: VisualStrategyCorpus): string {
  for (const document of corpus.documents) {
    const firstLine = document.rawText.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) || '';
    for (const value of [document.title, firstLine, document.filename]) {
      const candidate = documentProjectCandidate(value || '');
      if (candidate) return safeProjectName(candidate);
    }
  }
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `文档视觉转译-${stamp}`;
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, filename);
}

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await fs.readFile(filename, 'utf8')) as T;
}

function documentSummary(filename: string, document: Awaited<ReturnType<typeof parseStrategyDocument>>): VisualTranslationDocumentSummary {
  return {
    path: filename,
    filename: document.filename,
    sourceType: document.sourceType,
    title: document.title,
    characterCount: document.characterCount,
    pageCount: document.pageCount,
    warnings: document.parseWarnings
  };
}

export function createVisualTranslationService(
  readCredentials: CredentialsReader,
  readSettings: SettingsReader,
  emitProgress: ProgressSink,
  reasonerFactory: TextReasonerFactory = createOpenAICompatibleTextReasoner,
  pipelineRunner: VisualTranslationRunner = runVisualTranslationV1,
  v2Runner: VisualTranslationRunner = runVisualTranslationV2
) {
  const active = new Map<string, ActiveRun>();

  async function dataRoot(): Promise<string> {
    const settings = await readSettings();
    return path.join(path.resolve(settings.defaultDataPath), 'visual-translation-v1');
  }

  async function runRoot(runId: string): Promise<string> {
    return path.join(await dataRoot(), safeRunId(runId));
  }

  async function recordPath(runId: string): Promise<string> {
    return path.join(await runRoot(runId), 'runtime', 'run.json');
  }

  async function getRun(runId: string): Promise<VisualTranslationRunRecord> {
    return readJson<VisualTranslationRunRecord>(await recordPath(runId));
  }

  async function saveRun(record: VisualTranslationRunRecord): Promise<void> {
    await writeJson(await recordPath(record.id), record);
  }

  async function listRuns(): Promise<VisualTranslationRunRecord[]> {
    const root = await dataRoot();
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const records = await Promise.all(entries.filter((entry) => entry.isDirectory() && /^[a-f0-9-]{36}$/i.test(entry.name)).map((entry) => getRun(entry.name).catch(() => null)));
    return records.filter((record): record is VisualTranslationRunRecord => Boolean(record)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function inspectDocuments(paths: string[]): Promise<VisualTranslationDocumentSummary[]> {
    const unique = [...new Set(paths.map((filename) => path.resolve(filename)))];
    if (!unique.length) return [];
    return Promise.all(unique.map(async (filename) => {
      if (!SUPPORTED_EXTENSIONS.has(path.extname(filename).toLowerCase())) throw new Error(`不支持的文档格式：${path.basename(filename)}`);
      return documentSummary(filename, await parseStrategyDocument(filename));
    }));
  }

  async function copyAndParseDocuments(runId: string, paths: string[]): Promise<VisualStrategyCorpus> {
    const root = await runRoot(runId);
    const inputRoot = path.join(root, 'input');
    await fs.mkdir(inputRoot, { recursive: true });
    const documents = [];
    const unique = [...new Set(paths.map((filename) => path.resolve(filename)))];
    if (!unique.length) throw new Error('请至少选择一个策略文档');
    for (let index = 0; index < unique.length; index += 1) {
      const source = unique[index]!;
      const extension = path.extname(source).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error(`不支持的文档格式：${path.basename(source)}`);
      const stat = await fs.stat(source);
      if (!stat.isFile()) throw new Error(`文档不存在：${path.basename(source)}`);
      const target = path.join(inputRoot, `${String(index + 1).padStart(2, '0')}-${path.basename(source)}`);
      await fs.copyFile(source, target);
      documents.push(await parseStrategyDocument(target));
    }
    const corpus = buildVisualStrategyCorpus(documents);
    await writeJson(path.join(root, 'runtime', 'corpus.json'), corpus);
    return corpus;
  }

  async function loadCheckpoints(runId: string): Promise<Record<string, unknown>> {
    const directory = path.join(await runRoot(runId), 'checkpoints');
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    const checkpoints: Record<string, unknown> = {};
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const stageId = entry.name.slice(0, -5);
      checkpoints[stageId] = await readJson(path.join(directory, entry.name));
    }
    return checkpoints;
  }

  async function execute(record: VisualTranslationRunRecord, corpus: VisualStrategyCorpus, credentials: ProviderCredentials): Promise<VisualTranslationResult> {
    if (active.has(record.id)) throw new Error('该 Visual Translation 任务正在运行');
    const controller = new AbortController();
    const startedAt = new Date().toISOString();
    const started = performance.now();
    active.set(record.id, { controller, startedAt });
    const running: VisualTranslationRunRecord = { ...record, status: 'running', startedAt, apiProfileId: credentials.profileId, provider: credentials.provider, model: credentials.model, lastError: null };
    await saveRun(running);
    try {
      const root = await runRoot(record.id);
      const checkpoints = await loadCheckpoints(record.id);
      const reasoner = reasonerFactory({ apiKey: credentials.apiKey, model: credentials.model, provider: credentials.provider, baseUrl: credentials.baseUrl });
      const mode = normalizeDirectionGenerationMode((await readSettings()).directionGenerationMode || PRODUCTION_BASELINE_MODE);
      const runner = isExecutionMode(mode) ? v2Runner : pipelineRunner;
      const execution = await runner({
        projectId: record.id,
        analysisRunId: record.analysisRunId,
        corpus,
        lockedFacts: [],
        lockedAssets: [],
        provider: credentials.provider,
        modelId: credentials.model,
        reasoner,
        checkpoints,
        abortSignal: controller.signal,
        onProgress(stageId: VisualTranslationStage) {
          const progress: VisualTranslationProgress = {
            runId: record.id,
            projectName: record.projectName,
            stage: stageId,
            message: STAGE_MESSAGES[stageId],
            startedAt,
            elapsedMs: Math.round(performance.now() - started),
            model: credentials.model
          };
          emitProgress(progress);
        },
        async onModelResponse(stageId: VisualTranslationStage, payload: { attempt: number; text: string }) {
          const filename = `${stageId}-attempt-${String(payload.attempt).padStart(2, '0')}.json`;
          await writeJson(path.join(root, 'runtime', 'model-responses', filename), payload);
        },
        async onCheckpoint(stageId: VisualTranslationStage, payload: { checkpoint: { outputFile: string }; output: unknown }) {
          await saveRun({ ...running, currentStage: stageId });
          await writeJson(path.join(root, 'checkpoints', `${stageId}.json`), payload);
          const outputPath = path.join(root, 'outputs', path.basename(payload.checkpoint.outputFile));
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          if (typeof payload.output === 'string') await fs.writeFile(outputPath, payload.output, 'utf8');
          else await writeJson(outputPath, payload.output);
        }
      });
      const completedAt = new Date().toISOString();
      const reportBasename = execution.reportBasename || 'visual-directions-report-v1.md';
      const reportFilename = `${safeProjectName(record.projectName)}-${reportBasename}`;
      await fs.writeFile(path.join(root, 'outputs', reportFilename), execution.reportMarkdown, 'utf8');
      const completed: VisualTranslationRunRecord = {
        ...running,
        status: 'completed',
        completedAt,
        durationMs: Math.round(performance.now() - started),
        currentStage: '10-local-report-compiler',
        reportFilename,
        modelCallCount: execution.modelCallCount,
        resumedStageCount: execution.metrics.filter((metric: { resumed?: boolean }) => metric.resumed).length,
        visualRatio: execution.composition.visualRatio
      };
      await saveRun(completed);
      await writeJson(path.join(root, 'runtime', 'run-report.json'), {
        protocolVersion: execution.protocolVersion || 'visual-translation-v1',
        run: completed,
        metrics: execution.metrics,
        composition: execution.composition
      });
      return { run: completed, reportMarkdown: execution.reportMarkdown };
    } catch (error) {
      const cancelled = controller.signal.aborted || (error as Error).name === 'AbortError';
      const userError = cancelled ? null : mapVisualTranslationUserError(error);
      const failed: VisualTranslationRunRecord = {
        ...running,
        status: cancelled ? 'cancelled' : 'failed',
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
        lastError: cancelled ? '用户已取消分析' : (error as Error).message,
        userError
      };
      await saveRun(failed);
      if (userError) (error as { userError?: VisualTranslationUserError }).userError = userError;
      throw error;
    } finally {
      active.delete(record.id);
    }
  }

  async function start(input: StartVisualTranslationInput): Promise<VisualTranslationResult> {
    const credentials = await readCredentials(input.apiProfileId);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const corpus = await copyAndParseDocuments(id, input.documentPaths);
    const projectName = deriveVisualTranslationProjectName(corpus);
    const record: VisualTranslationRunRecord = {
      id,
      analysisRunId: crypto.randomUUID(),
      projectName,
      status: 'running',
      apiProfileId: credentials.profileId,
      provider: credentials.provider,
      model: credentials.model,
      documentCount: corpus.documents.length,
      documentNames: corpus.documents.map((document) => document.filename.replace(/^\d{2}-/, '')),
      createdAt,
      startedAt: createdAt,
      lastError: null,
      reportFilename: null
    };
    await saveRun(record);
    return execute(record, corpus, credentials);
  }

  async function resume(runId: string, apiProfileId?: string): Promise<VisualTranslationResult> {
    const record = await getRun(runId);
    const credentials = await readCredentials(apiProfileId || record.apiProfileId);
    const corpus = await readJson<VisualStrategyCorpus>(path.join(await runRoot(runId), 'runtime', 'corpus.json'));
    return execute(record, corpus, credentials);
  }

  function cancel(runId: string): boolean {
    const run = active.get(runId);
    if (!run) return false;
    run.controller.abort();
    return true;
  }

  async function reportPath(runId: string): Promise<string> {
    const record = await getRun(runId);
    if (!record.reportFilename) throw new Error('该任务尚未生成报告');
    return path.join(await runRoot(runId), 'outputs', path.basename(record.reportFilename));
  }

  async function remove(runId: string): Promise<void> {
    const activeRun = active.get(runId);
    if (activeRun) {
      activeRun.controller.abort();
      active.delete(runId);
    }
    const root = await runRoot(runId);
    const data = await dataRoot();
    assertInside(data, root);
    await fs.rm(root, { recursive: true, force: true });
  }

  return { inspectDocuments, listRuns, getRun, start, resume, cancel, reportPath, runRoot, remove };
}

export type VisualTranslationService = ReturnType<typeof createVisualTranslationService>;
