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
  VisualTranslationStage
} from '../shared/types';
import { buildVisualStrategyCorpus, parseStrategyDocument } from './document-processing';
import type { ProviderCredentials } from './settings-store';

// Bundled from the repository core. Desktop owns persistence and user interaction only.
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { createOpenAICompatibleTextReasoner } from '../../../../src/v5/adapters/openai-compatible-text-reasoner.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { runVisualTranslationV1 } from '../../../../src/v5/visual-translation/v1/index.js';

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
  '10-local-report-compiler': '正在编译视觉方向报告'
};

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.md', '.markdown', '.txt']);

function safeRunId(runId: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(runId)) throw new Error('Visual Translation Run ID 无效');
  return runId;
}

function safeProjectName(value: string): string {
  const name = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80);
  if (!name) throw new Error('请输入项目名称');
  return name;
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
  pipelineRunner: VisualTranslationRunner = runVisualTranslationV1
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
      const execution = await pipelineRunner({
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
      const reportFilename = `${safeProjectName(record.projectName)}-visual-directions-report-v1.md`;
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
        protocolVersion: 'visual-translation-v1',
        run: completed,
        metrics: execution.metrics,
        composition: execution.composition
      });
      return { run: completed, reportMarkdown: execution.reportMarkdown };
    } catch (error) {
      const cancelled = controller.signal.aborted || (error as Error).name === 'AbortError';
      const failed: VisualTranslationRunRecord = {
        ...running,
        status: cancelled ? 'cancelled' : 'failed',
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
        lastError: cancelled ? '用户已取消分析' : (error as Error).message
      };
      await saveRun(failed);
      throw error;
    } finally {
      active.delete(record.id);
    }
  }

  async function start(input: StartVisualTranslationInput): Promise<VisualTranslationResult> {
    const projectName = safeProjectName(input.projectName);
    const credentials = await readCredentials(input.apiProfileId);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const corpus = await copyAndParseDocuments(id, input.documentPaths);
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

  return { inspectDocuments, listRuns, getRun, start, resume, cancel, reportPath, runRoot };
}

export type VisualTranslationService = ReturnType<typeof createVisualTranslationService>;
