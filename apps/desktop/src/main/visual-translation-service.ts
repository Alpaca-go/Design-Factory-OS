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
import { atomicWriteJsonWithRetry } from './runtime/atomic-write.ts';
import { appendRuntimeEvent } from './runtime/event-log.ts';
import { findRecoverableRunProjection } from './runtime/recovery-service.ts';
import { buildStep4ResultCheckpoint, resultHash } from './runtime/result-checkpoint.ts';
import { RunWriteCoordinator } from './runtime/run-write-coordinator.ts';
import { transitionRuntimeStatus, type RuntimeErrorCategory, type RuntimeIssue, type RuntimeStatus } from './runtime/runtime-status.ts';
import { createLiveBenchmarkRetriever } from './live-benchmark-retriever.ts';

// Bundled from the repository core. Desktop owns persistence and user interaction only.
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { createOpenAICompatibleTextReasoner } from '../../../../src/v5/adapters/openai-compatible-text-reasoner.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { runVisualTranslationV1 } from '../../../../src/v5/visual-translation/v1/index.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { runVisualTranslationV2 } from '../../../../src/v5/visual-translation/v2/runtime/run-visual-translation-v2.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { normalizeDirectionGenerationMode, isExecutionMode } from '../../../../src/v5/visual-translation/v2/config/direction-generation-mode.js';

type CredentialsReader = (profileId?: string) => Promise<ProviderCredentials>;
type SettingsReader = () => Promise<PublicSettings>;
type ProgressSink = (progress: VisualTranslationProgress) => void;
type TextReasonerFactory = (options: { apiKey: string; model: string; provider: string; baseUrl: string }) => (messages: any, context?: any) => Promise<any>;
type VisualTranslationRunner = (input: Record<string, unknown>) => Promise<any>;
type ProjectionWriter = typeof atomicWriteJsonWithRetry;

interface ActiveRun {
  controller: AbortController;
  startedAt: string;
}

const STAGE_MESSAGES: Record<VisualTranslationStage, string> = {
  '00-document-preparation': '正在整理与去重策略文档',
  '01-visual-evidence': '正在提取视觉证据',
  '01-visual-relevant-facts': '正在提取与视觉决策直接相关的品牌事实',
  '01-visual-brief': '正在编译视觉任务简报',
  '01b-visual-brief-review': '正在编译视觉任务简报审阅文档',
  '01b-visual-facts-review': '正在编译视觉事实审阅文档',
  '02-visual-signal-opportunity': '正在生成视觉信号与机会地图',
  '02-visual-asset-evidence': '正在整理现有视觉资产证据',
  '02b-visual-asset-evidence-review': '正在编译视觉资产审阅文档',
  '03a-benchmark-query-compiler': '正在编译多维视觉基准检索计划',
  '03b-benchmark-retrieval': '正在检索并筛选视觉基准案例',
  '03c-visual-opportunity-synthesis': '正在综合品牌视觉机会',
  '03d-visual-opportunity-review': '正在编译视觉机会审阅文档',
  '04-three-creative-directions': '正在构建三个显著不同的创意方向',
  '05-direction-recommendation': '正在执行本地方向排序',
  '04b-compile-execution-directions': '正在编译执行向方向与回归守卫',
  '10-local-report-compiler': '正在编译视觉方向报告',
  '10b-local-audit-compiler': '正在编译视觉方向技术审计'
};

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.md', '.markdown', '.txt']);
const STEP4_REPAIR_CHECKPOINT_STAGE = '04-step4-repair-pending';

// Map a thrown Visual Translation error into a user-facing explanation
// (doc: v2 Stage 04 输出截断修复, §5). The UI must show actionable detail rather
// than a bare red box when the structured output is truncated by the model.
function mapVisualTranslationUserError(error: unknown, repairCheckpointAvailable = false): VisualTranslationUserError {
  const code = (error as { code?: string })?.code;
  const details = (error as { details?: Record<string, unknown> })?.details || {};
  const step4TimeoutTitles: Record<string, string> = {
    STEP4_FIRST_ACTIVITY_TIMEOUT: '视觉方向生成迟迟未开始',
    STEP4_STREAM_IDLE_TIMEOUT: '视觉方向生成流已停止活动',
    STEP4_PROVIDER_HARD_TIMEOUT: '视觉方向生成超过硬时限',
    STEP4_REPAIR_TIMEOUT: '视觉方向修复超过时限',
    STEP4_TOTAL_TIMEOUT: '第四步超过总时间预算',
    STEP4_REPAIR_BUDGET_INSUFFICIENT: '剩余时间不足以安全修复'
  };
  if (code && step4TimeoutTitles[code]) {
    return {
      code,
      title: step4TimeoutTitles[code],
      message: (error as Error)?.message || code,
      recoverable: true,
      stageId: '04-three-creative-directions',
      modelId: null,
      requestedMaxOutputTokens: null,
      providerMaxOutputTokens: null,
      retried: false,
      suggestedAction: '可使用已有 Checkpoint 从第四步继续；若重复发生，请检查流式日志与模型服务状态。'
    };
  }
  if (code === 'STEP4_JSON_PARSE_FAILED' || code === 'STEP4_REPAIR_PATCH_INVALID') {
    return {
      code,
      title: '视觉方向修复结果不完整',
      message: (error as Error)?.message || code,
      recoverable: true,
      stageId: '04-three-creative-directions',
      modelId: null,
      requestedMaxOutputTokens: null,
      providerMaxOutputTokens: null,
      retried: true,
      suggestedAction: '继续分析将复用已解析的主响应，仅重新执行受限 Repair。'
    };
  }
  if (code === 'FAILED_SCHEMA' && repairCheckpointAvailable) {
    const issues = Array.isArray((error as { issues?: unknown[] })?.issues)
      ? (error as { issues: Array<{ path?: string; message?: string }> }).issues
      : [];
    const details = issues.slice(0, 5).map((issue) => `${issue.path || 'unknown path'}: ${issue.message || 'validation failed'}`);
    return {
      code,
      title: '视觉方向仍有可修复字段',
      message: details.length ? details.join('\n') : ((error as Error)?.message || code),
      recoverable: true,
      stageId: '04-three-creative-directions',
      modelId: null,
      requestedMaxOutputTokens: null,
      providerMaxOutputTokens: null,
      retried: true,
      suggestedAction: '继续分析将从最新 Repair Checkpoint 开始，只处理剩余字段。'
    };
  }
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
  const result = await atomicWriteJsonWithRetry(filename, value);
  if (!result.success) throw Object.assign(new Error(result.errorMessage), { code: result.errorCode, tempPath: result.tempPath });
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
  v2Runner: VisualTranslationRunner = runVisualTranslationV2,
  runtimeOptions: { projectionWriter?: ProjectionWriter } = {}
) {
  const active = new Map<string, ActiveRun>();
  const writeCoordinator = new RunWriteCoordinator((metrics) => {
    console.info(JSON.stringify({ event: metrics.success ? 'RUN_WRITE_SUCCEEDED' : 'RUN_WRITE_FAILED', run_id: metrics.runId, operation: metrics.operation, queue_wait_ms: metrics.queueWaitMs, write_duration_ms: metrics.durationMs }));
  });

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

  async function readRunProjection(runId: string): Promise<VisualTranslationRunRecord> {
    return readJson<VisualTranslationRunRecord>(await recordPath(runId));
  }

  function runtimeStatusOf(record: VisualTranslationRunRecord): RuntimeStatus {
    return {
      analysisStatus: record.analysisStatus || (record.status === 'completed' ? 'completed' : record.status === 'failed' ? 'failed_before_completion' : record.status === 'running' ? 'running' : 'pending'),
      persistenceStatus: record.persistenceStatus || 'healthy',
      recoverable: record.recoverable || false,
      lastSuccessfulCheckpoint: record.checkpointRefs?.at(-1),
      runtimeIssue: record.runtimeIssue || null
    };
  }

  function monotonicRecord(current: VisualTranslationRunRecord | null, requested: VisualTranslationRunRecord): VisualTranslationRunRecord {
    if (!current) return { ...requested, revision: Math.max(1, requested.revision || 0), analysisStatus: requested.analysisStatus || runtimeStatusOf(requested).analysisStatus, persistenceStatus: requested.persistenceStatus || 'healthy', recoverable: requested.recoverable || false };
    const next = transitionRuntimeStatus(runtimeStatusOf(current), runtimeStatusOf(requested));
    const progressCurrent = current.currentStage ? Object.keys(STAGE_MESSAGES).indexOf(current.currentStage) : -1;
    const progressRequested = requested.currentStage ? Object.keys(STAGE_MESSAGES).indexOf(requested.currentStage) : -1;
    return {
      ...requested,
      analysisStatus: next.analysisStatus,
      persistenceStatus: next.persistenceStatus,
      recoverable: next.recoverable,
      runtimeIssue: next.runtimeIssue || null,
      currentStage: progressRequested < progressCurrent ? current.currentStage : requested.currentStage,
      revision: Math.max(Number(current.revision || 0), Number(requested.revision || 0)) + 1
    };
  }

  function persistenceError(category: RuntimeErrorCategory, result: Awaited<ReturnType<typeof atomicWriteJsonWithRetry>>, analysisCompleted: boolean): Error {
    const issue: RuntimeIssue = {
      category,
      code: category === 'PROJECTION_WRITE_ERROR' ? `RUN_JSON_RENAME_${result.errorCode || 'FAILED'}` : result.errorCode || category,
      message: result.errorMessage || category,
      severity: category === 'PROJECTION_WRITE_ERROR' ? 'warning' : 'error',
      recoverable: true,
      analysisCompleted,
      tempPath: result.tempPath
    };
    return Object.assign(new Error(issue.message), { code: issue.code, category, runtimeIssue: issue, tempPath: result.tempPath });
  }

  async function rawSaveRun(record: VisualTranslationRunRecord): Promise<VisualTranslationRunRecord> {
    const current = await readRunProjection(record.id).catch(() => null);
    const next = monotonicRecord(current, record);
    const result = await (runtimeOptions.projectionWriter || atomicWriteJsonWithRetry)(await recordPath(record.id), next, {
      onAttempt(entry) {
        if (entry.errorCode) console.warn(JSON.stringify({ event: 'RUN_WRITE_RETRY', run_id: record.id, file: 'run.json', attempt: entry.attempt, error_code: entry.errorCode, delay_ms: entry.delayMs, temp_path: entry.tempPath }));
      }
    });
    if (!result.success) throw persistenceError('PROJECTION_WRITE_ERROR', result, next.analysisStatus === 'completed');
    return next;
  }

  async function saveRun(record: VisualTranslationRunRecord): Promise<VisualTranslationRunRecord> {
    return writeCoordinator.enqueue(record.id, 'run-projection', () => rawSaveRun(record));
  }

  async function getRun(runId: string): Promise<VisualTranslationRunRecord> {
    const root = await runRoot(runId);
    const recovery = await findRecoverableRunProjection(root, safeRunId(runId));
    if (!recovery.record) throw new Error('Visual Translation 运行记录不存在或无法恢复');
    if (!recovery.recovered) return recovery.record;
    try {
      const saved = await saveRun(recovery.record);
      await appendRuntimeEvent(path.join(root, 'runtime'), runId, 'RECOVERY_COMPLETED', { source: recovery.source || null, quarantined: recovery.quarantined.length });
      return saved;
    } catch (error) {
      return { ...recovery.record, persistenceStatus: 'recovery_required', recoverable: true, runtimeIssue: { category: 'RECOVERY_ERROR', code: (error as { code?: string }).code || 'RECOVERY_WRITE_FAILED', message: (error as Error).message, severity: 'warning', recoverable: true, analysisCompleted: recovery.record.status === 'completed' } };
    }
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
    const executionRunId = crypto.randomUUID();
    const started = performance.now();
    active.set(record.id, { controller, startedAt });
    const running: VisualTranslationRunRecord = { ...record, activeRunId: executionRunId, status: 'running', analysisStatus: 'running', persistenceStatus: 'healthy', recoverable: false, runtimeIssue: null, uiMessage: null, startedAt, apiProfileId: credentials.profileId, provider: credentials.provider, model: credentials.model, lastError: null, step4Status: 'pending', step4ErrorCode: null };
    const savedRunning = await saveRun(running);
    let step4WriteChain = Promise.resolve();
    let pendingStep4CompletedEvent: Record<string, unknown> | null = null;
    let pendingStep4CompletedStatus: { updated_at: string; code?: string } | null = null;
    try {
      const root = await runRoot(record.id);
      const checkpoints = await loadCheckpoints(record.id);
      const reasoner = reasonerFactory({ apiKey: credentials.apiKey, model: credentials.model, provider: credentials.provider, baseUrl: credentials.baseUrl });
      const runtimeSettings = await readSettings();
      const legacyDebugEnabled = process.env.MASTERPIECE_ENABLE_LEGACY_PIPELINES === '1';
      const mode = normalizeDirectionGenerationMode(
        process.env.MASTERPIECE_DIRECTION_PROTOCOL
        || (legacyDebugEnabled ? runtimeSettings.directionGenerationMode : 'execution_oriented_v2')
      );
      const analysisPipelineMode = process.env.MASTERPIECE_VISUAL_PIPELINE_MODE
        || (legacyDebugEnabled ? runtimeSettings.analysisPipelineMode : 'retrieval_first')
        || 'retrieval_first';
      const runner = isExecutionMode(mode) || ['retrieval_first', 'visual_fact_first', 'visual_fact_first_legacy'].includes(analysisPipelineMode) ? v2Runner : pipelineRunner;
      const execution = await runner({
        projectId: record.id,
        analysisRunId: record.analysisRunId,
        step4RunId: executionRunId,
        corpus,
        lockedFacts: [],
        lockedAssets: [],
        provider: credentials.provider,
        modelId: credentials.model,
        analysisPipelineMode,
        benchmarkRetriever: analysisPipelineMode === 'retrieval_first' ? createLiveBenchmarkRetriever() : undefined,
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
          await writeCoordinator.enqueue(record.id, `model-response:${stageId}:${payload.attempt}`, () => writeJson(path.join(root, 'runtime', 'model-responses', filename), payload)).catch((writeError) => {
            console.warn(JSON.stringify({ event: 'MODEL_RESPONSE_WRITE_FAILED', run_id: record.id, stage: stageId, error: (writeError as Error).message }));
          });
        },
        async onCheckpoint(stageId: VisualTranslationStage | typeof STEP4_REPAIR_CHECKPOINT_STAGE, payload: { checkpoint: { outputFile: string }; output: unknown }) {
          await writeCoordinator.enqueue(record.id, `checkpoint:${stageId}`, async () => {
            if (stageId === STEP4_REPAIR_CHECKPOINT_STAGE) {
              await writeJson(path.join(root, 'checkpoints', `${stageId}.json`), payload);
              return;
            }
            await writeJson(path.join(root, 'checkpoints', `${stageId}.json`), payload);
            const outputPath = path.join(root, 'outputs', path.basename(payload.checkpoint.outputFile));
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            if (typeof payload.output === 'string') await fs.writeFile(outputPath, payload.output, 'utf8');
            else await writeJson(outputPath, payload.output);

            const latest = await readRunProjection(record.id).catch(() => savedRunning);
            const checkpointRef = path.relative(root, path.join(root, 'checkpoints', `${stageId}.json`));
            const projection: VisualTranslationRunRecord = {
              ...latest,
              currentStage: stageId,
              checkpointRefs: [...new Set([...(latest.checkpointRefs || []), checkpointRef])]
            };
            if (stageId === '04-three-creative-directions') {
              const resultCheckpoint = buildStep4ResultCheckpoint({
                run_id: record.id,
                project_id: record.id,
                schema_version: 'visual-direction-v2-result-r1',
                provider_model: `${credentials.provider}/${credentials.model}`,
                result: payload.output,
                projection: {
                  ...projection,
                  status: 'running',
                  analysisStatus: 'result_committed',
                  persistenceStatus: 'healthy',
                  recoverable: true,
                  step4Status: 'completed',
                  step4UpdatedAt: pendingStep4CompletedStatus?.updated_at || new Date().toISOString(),
                  checkpointRefs: [...new Set([...projection.checkpointRefs!, path.join('checkpoints', 'step4-result.json')])],
                  artifactRefs: [...new Set([...(projection.artifactRefs || []), path.join('artifacts', 'visual-directions-v2.json')])]
                }
              });
              const resultCheckpointPath = path.join(root, 'checkpoints', 'step4-result.json');
              const artifactPath = path.join(root, 'artifacts', 'visual-directions-v2.json');
              const existingResult = await readJson<{ result_hash?: string }>(resultCheckpointPath).catch(() => null);
              if (existingResult && existingResult.result_hash !== resultCheckpoint.result_hash) {
                throw Object.assign(new Error('Step 4 immutable result checkpoint conflict'), { code: 'STEP4_RESULT_COMMIT_CONFLICT', category: 'RESULT_COMMIT_ERROR' });
              }
              if (!existingResult) await writeJson(resultCheckpointPath, resultCheckpoint);
              const existingArtifact = await readJson<unknown>(artifactPath).catch(() => null);
              if (existingArtifact && resultHash(existingArtifact) !== resultCheckpoint.result_hash) {
                throw Object.assign(new Error('Step 4 immutable result artifact conflict'), { code: 'STEP4_ARTIFACT_COMMIT_CONFLICT', category: 'RESULT_COMMIT_ERROR' });
              }
              if (!existingArtifact) await writeJson(artifactPath, payload.output);
              projection.analysisStatus = 'result_committed';
              projection.recoverable = true;
              projection.step4Status = 'completed';
              projection.step4UpdatedAt = pendingStep4CompletedStatus?.updated_at || new Date().toISOString();
              projection.checkpointRefs = [...new Set([...projection.checkpointRefs!, path.join('checkpoints', 'step4-result.json')])];
              projection.artifactRefs = [...new Set([...(projection.artifactRefs || []), path.join('artifacts', 'visual-directions-v2.json')])];
              await appendRuntimeEvent(path.join(root, 'runtime'), record.id, 'STEP4_RESULT_COMMITTED', { checkpoint: 'checkpoints/step4-result.json', artifact: 'artifacts/visual-directions-v2.json', result_hash: resultCheckpoint.result_hash }).catch((eventError) => {
                console.warn(JSON.stringify({ event: 'EVENT_LOG_ERROR', run_id: record.id, error: (eventError as Error).message }));
              });
              await fs.appendFile(path.join(root, 'runtime', 'step4-events.ndjson'), `${JSON.stringify({ event: 'STEP4_RESULT_COMMITTED', run_id: executionRunId, result_hash: resultCheckpoint.result_hash, timestamp: new Date().toISOString() })}\n`, 'utf8').catch(() => undefined);
              if (pendingStep4CompletedEvent) await fs.appendFile(path.join(root, 'runtime', 'step4-events.ndjson'), `${JSON.stringify(pendingStep4CompletedEvent)}\n`, 'utf8').catch(() => undefined);
            }
            await rawSaveRun(projection).catch(async (projectionError) => {
              const issue = (projectionError as { runtimeIssue?: RuntimeIssue }).runtimeIssue;
              console.warn(JSON.stringify({ event: 'RUN_PROJECTION_SYNC_FAILED', run_id: record.id, stage: stageId, code: issue?.code || (projectionError as { code?: string }).code }));
              await appendRuntimeEvent(path.join(root, 'runtime'), record.id, 'PROJECTION_SYNC_FAILED', { stage: stageId, code: issue?.code || null, temp_path: issue?.tempPath || null }).catch(() => undefined);
            });
          });
        },
        async onCheckpointRemoved(stageId: string) {
          if (stageId !== STEP4_REPAIR_CHECKPOINT_STAGE) return;
          await writeCoordinator.enqueue(record.id, `checkpoint-remove:${stageId}`, () => fs.unlink(path.join(root, 'checkpoints', `${stageId}.json`)).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
          }));
        },
        onStep4Event(event: Record<string, unknown>) {
          const eventName = String(event.event || '');
          if (['STEP4_FIRST_ACTIVITY', 'STEP4_FIRST_TOKEN', 'STEP4_STREAM_PROGRESS'].includes(eventName)) {
            const receivedChars = Number(event.received_chars || 0);
            const reasoningChars = Number(event.reasoning_chars || 0);
            const message = eventName === 'STEP4_FIRST_ACTIVITY'
              ? '模型已开始生成视觉方向'
              : eventName === 'STEP4_FIRST_TOKEN'
                ? '模型已开始输出结构化视觉方向'
                : `正在接收视觉方向：正文 ${receivedChars.toLocaleString()} 字符，推理 ${reasoningChars.toLocaleString()} 字符`;
            emitProgress({
              runId: record.id,
              projectName: record.projectName,
              stage: '04-three-creative-directions',
              message,
              startedAt,
              elapsedMs: Math.round(performance.now() - started),
              model: credentials.model
            });
          }
          if (eventName === 'STEP4_COMPLETED') {
            pendingStep4CompletedEvent = event;
            return;
          }
          step4WriteChain = step4WriteChain.catch(() => undefined).then(() => writeCoordinator.enqueue(record.id, `step4-event:${eventName}`, async () => {
            await fs.mkdir(path.join(root, 'runtime'), { recursive: true });
            await fs.appendFile(path.join(root, 'runtime', 'step4-events.ndjson'), `${JSON.stringify(event)}\n`, 'utf8');
          }).catch((eventError) => {
            console.warn(JSON.stringify({ event: 'EVENT_LOG_ERROR', run_id: record.id, step4_event: eventName, error: (eventError as Error).message }));
          }));
        },
        onStep4Status(step: { run_id: string; status: VisualTranslationRunRecord['step4Status']; updated_at: string; code?: string }) {
          if (step.run_id !== executionRunId) return;
          if (step.status === 'completed') {
            pendingStep4CompletedStatus = step;
            return;
          }
          step4WriteChain = step4WriteChain.catch(() => undefined).then(() => writeCoordinator.enqueue(record.id, `step4-status:${step.status}`, async () => {
            const latest = await readRunProjection(record.id);
            if (latest.activeRunId !== executionRunId) return;
            const terminal = new Set(['completed', 'failed', 'timed_out', 'cancelled']);
            if (latest.step4Status && terminal.has(latest.step4Status) && step.status === 'running') return;
            await rawSaveRun({
              ...latest,
              currentStage: '04-three-creative-directions',
              step4Status: step.status,
              step4ErrorCode: step.code || null,
              step4UpdatedAt: step.updated_at
            });
          }).catch(async (projectionError) => {
            const issue = (projectionError as { runtimeIssue?: RuntimeIssue }).runtimeIssue;
            console.warn(JSON.stringify({ event: 'RUN_PROJECTION_SYNC_FAILED', run_id: record.id, step4_status: step.status, code: issue?.code || (projectionError as { code?: string }).code }));
            await appendRuntimeEvent(path.join(root, 'runtime'), record.id, 'PROJECTION_SYNC_FAILED', { step4_status: step.status, code: issue?.code || null, temp_path: issue?.tempPath || null }).catch(() => undefined);
          }));
        }
      });
      await step4WriteChain;
      await writeCoordinator.drain(record.id);
      const latestRunning = await readRunProjection(record.id);
      const completedAt = new Date().toISOString();
      const completedStep4Status = pendingStep4CompletedStatus as { updated_at: string; code?: string } | null;
      const reportBasename = execution.reportBasename || 'visual-directions-report-v1.md';
      const reportFilename = `${safeProjectName(record.projectName)}-${reportBasename}`;
      await fs.mkdir(path.join(root, 'outputs'), { recursive: true });
      await fs.writeFile(path.join(root, 'outputs', reportFilename), execution.reportMarkdown, 'utf8');
      const completed: VisualTranslationRunRecord = {
        ...latestRunning,
        status: 'completed',
        analysisStatus: 'completed',
        persistenceStatus: 'healthy',
        recoverable: false,
        runtimeIssue: null,
        uiMessage: null,
        completedAt,
        durationMs: Math.round(performance.now() - started),
        currentStage: '10-local-report-compiler',
        step4Status: completedStep4Status ? 'completed' : latestRunning.step4Status,
        step4UpdatedAt: completedStep4Status?.updated_at || latestRunning.step4UpdatedAt,
        reportFilename,
        modelCallCount: execution.modelCallCount,
        resumedStageCount: execution.metrics.filter((metric: { resumed?: boolean }) => metric.resumed).length,
        visualRatio: execution.composition.visualRatio
      };
      await writeJson(path.join(root, 'runtime', 'run-report.json'), {
        protocolVersion: execution.protocolVersion || 'visual-translation-v1',
        run: completed,
        metrics: execution.metrics,
        composition: execution.composition
      });
      await appendRuntimeEvent(path.join(root, 'runtime'), record.id, 'RUN_COMPLETED', { report: reportFilename }).catch((eventError) => {
        console.warn(JSON.stringify({ event: 'EVENT_LOG_ERROR', run_id: record.id, error: (eventError as Error).message }));
      });
      try {
        const savedCompleted = await saveRun(completed);
        return { run: savedCompleted, reportMarkdown: execution.reportMarkdown };
      } catch (projectionError) {
        if ((projectionError as { category?: string }).category !== 'PROJECTION_WRITE_ERROR') throw projectionError;
        const issue = (projectionError as { runtimeIssue: RuntimeIssue }).runtimeIssue;
        const degraded: VisualTranslationRunRecord = { ...completed, persistenceStatus: 'projection_sync_failed', recoverable: true, runtimeIssue: issue, uiMessage: '分析已完成，状态记录异常，可从已保存结果恢复。' };
        await appendRuntimeEvent(path.join(root, 'runtime'), record.id, 'PROJECTION_SYNC_FAILED', { code: issue.code, temp_path: issue.tempPath || null }).catch(() => undefined);
        return { run: degraded, reportMarkdown: execution.reportMarkdown };
      }
    } catch (error) {
      await step4WriteChain.catch(() => undefined);
      const latestRunning = await readRunProjection(record.id).catch(() => savedRunning);
      const committedProjection = await readJson<{ projection?: VisualTranslationRunRecord }>(path.join(await runRoot(record.id), 'checkpoints', 'step4-result.json')).then((value) => value.projection || null).catch(() => null);
      const protectedBase = ['result_committed', 'completed'].includes(latestRunning.analysisStatus || '') ? latestRunning : committedProjection;
      if (protectedBase) {
        const issue = (error as { runtimeIssue?: RuntimeIssue }).runtimeIssue || { category: 'RESULT_COMMIT_ERROR' as const, code: (error as { code?: string }).code || 'POST_COMMIT_ERROR', message: (error as Error).message, severity: 'warning' as const, recoverable: true, analysisCompleted: latestRunning.analysisStatus === 'completed' };
        const protectedRecord: VisualTranslationRunRecord = { ...protectedBase, status: protectedBase.analysisStatus === 'completed' ? 'completed' : 'pending', persistenceStatus: 'degraded', recoverable: true, runtimeIssue: issue, uiMessage: '结果已保存，后续持久化步骤异常，可恢复且不会重新调用模型。' };
        await saveRun(protectedRecord).catch(() => undefined);
        (error as { userError?: VisualTranslationUserError }).userError = { code: issue.code, title: '分析结果已保存', message: issue.message, recoverable: true, stageId: protectedBase.currentStage || null, suggestedAction: '请恢复已保存结果，无需继续分析。' };
        throw error;
      }
      const cancelled = controller.signal.aborted || (error as Error).name === 'AbortError';
      const repairCheckpointAvailable = await fs.access(path.join(
        await runRoot(record.id),
        'checkpoints',
        `${STEP4_REPAIR_CHECKPOINT_STAGE}.json`
      )).then(() => true).catch(() => false);
      const userError = cancelled ? null : mapVisualTranslationUserError(error, repairCheckpointAvailable);
      const failed: VisualTranslationRunRecord = {
        ...latestRunning,
        status: cancelled ? 'cancelled' : 'failed',
        analysisStatus: cancelled ? latestRunning.analysisStatus : 'failed_before_completion',
        persistenceStatus: latestRunning.persistenceStatus || 'healthy',
        recoverable: Boolean(userError?.recoverable),
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
        lastError: cancelled ? '用户已取消分析' : (error as Error).message,
        step4Status: latestRunning.step4Status === 'running' ? (cancelled ? 'cancelled' : 'failed') : latestRunning.step4Status,
        step4ErrorCode: cancelled ? 'STEP4_CANCELLED' : (error as { code?: string }).code || 'STEP4_UNKNOWN_ERROR',
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
      analysisStatus: 'pending',
      persistenceStatus: 'healthy',
      recoverable: false,
      revision: 0,
      checkpointRefs: [],
      artifactRefs: [],
      runtimeIssue: null,
      uiMessage: null,
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
    const saved = await saveRun(record);
    await appendRuntimeEvent(path.join(await runRoot(id), 'runtime'), id, 'RUN_CREATED', { project_name: projectName });
    return execute(saved, corpus, credentials);
  }

  async function resume(runId: string, apiProfileId?: string): Promise<VisualTranslationResult> {
    const record = await getRun(runId);
    if (record.status === 'completed' && record.reportFilename) {
      return { run: record, reportMarkdown: await fs.readFile(path.join(await runRoot(runId), 'outputs', path.basename(record.reportFilename)), 'utf8') };
    }
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
