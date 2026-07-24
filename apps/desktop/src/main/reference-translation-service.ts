import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type {
  AssetSelectionProtocolResult,
  CurrentProjectAssetDecision,
  CurrentProjectProfile,
  PublicSettings,
  ReferenceAssetDecision,
  ReferenceLedDirection,
  ReferenceTranslationError,
  ReferenceAssetSelection,
  ReferenceTranslationProfile,
  ReferenceTranslationProgress,
  ReferenceTranslationResult,
  ReferenceTranslationRunRecord,
  ReferenceStyleReconstruction,
  ReferenceFirstStrategy,
  ReferenceStyleProfile,
  ReferenceTranslationStage,
  StartReferenceTranslationInput,
  StartReferenceTranslationUserInput
} from '../shared/types';
import {
  assembleAssetSelectionProtocol,
  assertAssetSelectionProtocol,
  createFallbackCurrentProjectDecisions,
  createFallbackReferenceDecisions,
  detectReferenceNearDuplicates
} from './asset-selection-protocol/index.ts';
import { atomicWriteJsonWithRetry } from './runtime/atomic-write.ts';
import type { ProjectStore } from './project-store.ts';
import type { PipelineService } from './pipeline-service.ts';
import {
  compileReferenceTranslationMarkdown,
  generateReferenceLedDirection
} from './reference-translation-report.ts';
import { sanitizeFilenamePart, validateMarkdownReport } from './analysis-contract.ts';
import {
  compileReconstructionBrief,
  finalizeReferenceStyleReconstruction,
  validateReferenceStyleReconstruction
} from './reference-style-reconstruction.ts';
import { recoverPersistedProjectIdentity } from './project-identity.ts';
// Reference-Led Visual Direction 引擎：离线确定性运行，零模型调用。
import { runReferenceTranslation } from '../../../../src/reference-translation/run-reference-translation.js';

type SettingsReader = () => Promise<PublicSettings> | PublicSettings;

const RUN_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const REFERENCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.zip']);
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.cache', 'cache', 'tmp', 'temp']);

function safeRunId(runId: string): string {
  if (!RUN_ID_PATTERN.test(String(runId || ''))) throw new Error('无效的 Reference Translation 任务标识');
  return runId;
}

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await fs.readFile(filename, 'utf8')) as T;
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  const result = await atomicWriteJsonWithRetry(filename, value);
  if (!result.success) throw Object.assign(new Error(result.errorMessage), { code: result.errorCode });
}

async function persistReferenceFirstBetaArtifacts(
  root: string,
  strategy: ReferenceFirstStrategy,
  protocol: AssetSelectionProtocolResult,
  projectName: string,
  deliveryDir?: string
): Promise<{ auditFilename: string; generationFilename: string }> {
  const closure = strategy.betaClosure;
  const currentDir = path.join(root, 'current-project');
  const referenceDir = path.join(root, 'reference');
  const tasksDir = path.join(root, 'tasks');
  const anchorsDir = path.join(root, 'anchors');
  const reportsDir = path.join(root, 'reports');
  const validationDir = path.join(root, 'validation');
  await Promise.all([
    currentDir,
    referenceDir,
    tasksDir,
    anchorsDir,
    reportsDir,
    validationDir,
    ...(deliveryDir ? [deliveryDir] : [])
  ]
    .map((directory) => fs.mkdir(directory, { recursive: true })));
  const auditFilename = `${sanitizeFilenamePart(projectName)}-参考主导视觉重构分析审计报告.md`;
  const generationFilename = `${sanitizeFilenamePart(projectName)}-Reference-First生图执行文档.md`;
  await Promise.all([
    writeJson(path.join(currentDir, 'asset-decisions.json'), closure.currentProjectAssetDecisions),
    writeJson(path.join(currentDir, 'analysis-evidence-pack.json'), closure.analysisEvidencePack),
    writeJson(path.join(currentDir, 'generation-identity-pack.json'), closure.generationIdentityPack),
    writeJson(path.join(currentDir, 'evidence-bound-facts.json'), strategy.evidenceBoundFacts),
    writeJson(path.join(currentDir, 'observed-copy.json'), closure.observedCopy),
    writeJson(path.join(currentDir, 'legacy-visual-observations.json'), closure.legacyVisualObservations),
    writeJson(path.join(referenceDir, 'master-set.json'), protocol.referenceMasterSet),
    writeJson(path.join(referenceDir, 'asset-classifications.json'), protocol.referenceAssetDecisions),
    writeJson(path.join(referenceDir, 'style-carrier-ranking.json'), closure.styleCarrierRanking),
    writeJson(path.join(referenceDir, 'signature-graphics.json'), closure.referenceSignatureGraphics),
    writeJson(path.join(referenceDir, 'graphic-structures.json'), closure.referenceGraphicStructures),
    ...protocol.taskReferenceSubsets.map((subset) =>
      writeJson(path.join(tasksDir, `${subset.outputType}.json`), subset)),
    writeJson(path.join(anchorsDir, 'system-anchor.json'), strategy.systemAnchor),
    writeJson(path.join(anchorsDir, 'project-graphic-anchor.json'), strategy.projectGraphicAnchor),
    writeJson(path.join(validationDir, 'generation-identity-pack-validation.json'), closure.generationIdentityPackValidation),
    writeJson(path.join(validationDir, 'final-validation.json'), closure.finalValidation),
    fs.writeFile(path.join(reportsDir, 'analysis-audit-report.md'), closure.analysisAuditMarkdown, 'utf8'),
    fs.writeFile(path.join(reportsDir, 'generation-brief-anchor-vi-system.md'), closure.generationBriefMarkdown, 'utf8'),
    fs.writeFile(path.join(root, auditFilename), closure.analysisAuditMarkdown, 'utf8'),
    fs.writeFile(path.join(root, generationFilename), closure.generationBriefMarkdown, 'utf8'),
    ...(deliveryDir ? [
      fs.writeFile(path.join(deliveryDir, auditFilename), closure.analysisAuditMarkdown, 'utf8'),
      fs.writeFile(path.join(deliveryDir, generationFilename), closure.generationBriefMarkdown, 'utf8')
    ] : [])
  ]);
  return { auditFilename, generationFilename };
}

async function persistStructuredFailureEvidence(root: string, error: unknown): Promise<void> {
  const structured = error as {
    code?: string;
    message?: string;
    structuredStep?: string;
    structuredAttempts?: unknown[];
  };
  if (!structured.structuredAttempts?.length) return;
  const logs = path.join(root, 'logs');
  await fs.mkdir(logs, { recursive: true });
  await writeJson(path.join(logs, 'structured-attempts.json'), {
    terminalStatus: 'failed',
    step: structured.structuredStep || 'unknown',
    error: {
      code: structured.code || 'STRUCTURED_ANALYSIS_FAILED',
      message: structured.message || '结构化视觉分析失败'
    },
    attempts: structured.structuredAttempts
  });
}

async function assertJsonInput(filePath: string, label: string): Promise<void> {
  const resolved = path.resolve(String(filePath || ''));
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isFile()) throw new Error(`${label}不存在或不是文件：${resolved}`);
  if (stat.size > MAX_INPUT_BYTES) throw new Error(`${label}超过 20MB 限制`);
  if (path.extname(resolved).toLowerCase() !== '.json') throw new Error(`${label}必须是 JSON 文件`);
  try {
    JSON.parse(await fs.readFile(resolved, 'utf8'));
  } catch {
    throw new Error(`${label}不是合法 JSON：${path.basename(resolved)}`);
  }
}

interface ReferenceTranslationDependencies {
  projects: ProjectStore;
  pipeline: PipelineService;
  emitProgress?: (progress: ReferenceTranslationProgress) => void;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

async function inspectReferenceAssets(paths: string[]): Promise<ReferenceAssetSelection> {
  const candidates: string[] = [];
  const skipped: string[] = [];
  async function visit(source: string): Promise<void> {
    const resolved = path.resolve(source);
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat) {
      skipped.push(path.basename(resolved));
      return;
    }
    if (stat.isDirectory()) {
      for (const entry of await fs.readdir(resolved, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name.toLowerCase()))) continue;
        await visit(path.join(resolved, entry.name));
      }
      return;
    }
    const extension = path.extname(resolved).toLowerCase();
    if (!REFERENCE_EXTENSIONS.has(extension) || /(?:thumbs\.db|desktop\.ini|~\$)/iu.test(path.basename(resolved))) {
      skipped.push(path.basename(resolved));
      return;
    }
    candidates.push(resolved);
  }
  for (const source of [...new Set(paths.filter(Boolean))]) await visit(source);
  const items: ReferenceAssetSelection['items'] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  for (const sourcePath of candidates) {
    const stat = await fs.stat(sourcePath);
    const fingerprint = `${path.basename(sourcePath).toLowerCase()}|${stat.size}|${Math.round(stat.mtimeMs)}`;
    if (seen.has(fingerprint)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(fingerprint);
    const extension = path.extname(sourcePath).toLowerCase();
    let thumbnailDataUrl: string | undefined;
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
      thumbnailDataUrl = await sharp(sourcePath)
        .rotate()
        .resize({ width: 240, height: 160, fit: 'cover' })
        .jpeg({ quality: 72 })
        .toBuffer()
        .then((value) => `data:image/jpeg;base64,${value.toString('base64')}`)
        .catch(() => undefined);
    }
    items.push({
      sourcePath,
      name: path.basename(sourcePath),
      extension,
      sizeBytes: stat.size,
      fingerprint,
      thumbnailDataUrl
    });
  }
  return { items, skipped, duplicateCount };
}

export function createReferenceTranslationService(
  readSettings: SettingsReader,
  dependencies?: ReferenceTranslationDependencies
) {
  let active: {
    progress: ReferenceTranslationProgress;
    pipelineProjectId?: string;
    cancelled: boolean;
  } | null = null;

  async function dataRoot(): Promise<string> {
    const settings = await readSettings();
    const root = path.join(path.resolve(settings.defaultDataPath), 'reference-translation-v1');
    await fs.mkdir(root, { recursive: true });
    return root;
  }

  async function runRoot(runId: string): Promise<string> {
    return path.join(await dataRoot(), safeRunId(runId));
  }

  async function recordPath(runId: string): Promise<string> {
    return path.join(await runRoot(runId), 'run.json');
  }

  async function profilePath(runId: string): Promise<string> {
    return path.join(await runRoot(runId), 'intermediate', 'reference-translation-profile.json');
  }

  async function reportPath(runId: string): Promise<string> {
    const record = await getRun(runId).catch(() => null);
    return path.join(await runRoot(runId), record?.reportFilename || 'report.md');
  }

  async function directionPath(runId: string): Promise<string> {
    return path.join(await runRoot(runId), 'intermediate', 'reference-led-direction.json');
  }

  async function reconstructionPath(runId: string): Promise<string> {
    return path.join(await runRoot(runId), 'intermediate', 'reference-style-reconstruction.json');
  }

  async function projectContextPath(runId: string): Promise<string> {
    return path.join(await runRoot(runId), 'input', 'project-context.json');
  }

  async function getRun(runId: string): Promise<ReferenceTranslationRunRecord> {
    const current = await recordPath(runId);
    return readJson<ReferenceTranslationRunRecord>(current).catch(async () =>
      readJson<ReferenceTranslationRunRecord>(path.join(await runRoot(runId), 'run-record.json')));
  }

  async function listRuns(): Promise<ReferenceTranslationRunRecord[]> {
    const root = await dataRoot();
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const records = await Promise.all(entries
      .filter((entry) => entry.isDirectory() && RUN_ID_PATTERN.test(entry.name))
      .map((entry) => getRun(entry.name).catch(() => null)));
    return records
      .filter((record): record is ReferenceTranslationRunRecord => Boolean(record))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function getProfile(runId: string): Promise<ReferenceTranslationProfile> {
    return readJson<ReferenceTranslationProfile>(await profilePath(runId)).catch(async () =>
      readJson<ReferenceTranslationProfile>(
        path.join(await runRoot(runId), 'outputs', 'reference-translation-profile.json')
      ));
  }

  async function getDirection(runId: string): Promise<ReferenceLedDirection> {
    return readJson<ReferenceLedDirection>(await directionPath(runId)).catch(async () => {
      const record = await getRun(runId);
      return generateReferenceLedDirection(await getProfile(runId), record.preference);
    });
  }

  async function getReconstruction(runId: string): Promise<ReferenceStyleReconstruction> {
    return readJson<ReferenceStyleReconstruction>(await reconstructionPath(runId));
  }

  const STAGE_META: Record<ReferenceTranslationStage, { index: number; progress: number; message: string }> = {
    PREPARING_ASSETS: { index: 1, progress: 5, message: '正在读取当前项目' },
    SELECTING_CURRENT_CORE_PACK: { index: 2, progress: 9, message: '正在筛选当前项目核心资料包' },
    LOADING_PROJECT_CONTEXT: { index: 3, progress: 18, message: '正在锁定项目身份与资产' },
    SELECTING_REFERENCE_MASTER_SET: { index: 4, progress: 28, message: '正在筛选参考依据母集' },
    BUILDING_TASK_REFERENCE_SUBSETS: { index: 5, progress: 36, message: '正在为各类输出匹配任务参考子集' },
    ANALYZING_REFERENCE: { index: 6, progress: 45, message: '正在分析参考视觉方案' },
    SYNTHESIZING_REFERENCE_DNA: { index: 7, progress: 60, message: '正在提取参考风格' },
    CLASSIFYING_TRANSFERABILITY: { index: 8, progress: 72, message: '正在将参考风格应用到当前项目' },
    MAPPING_TO_PROJECT: { index: 8, progress: 84, message: '正在完成项目化风格重建' },
    GENERATING_DIRECTION: { index: 9, progress: 92, message: '正在生成重构后的核心视觉方向' },
    COMPILING_REPORT: { index: 10, progress: 97, message: '正在编译 GPT 执行文档' },
    VALIDATING_REPORT: { index: 11, progress: 99, message: '正在校验视觉重构输出' },
    COMPLETED: { index: 11, progress: 100, message: '视觉重构执行文档已完成' },
    FAILED: { index: 11, progress: 100, message: '视觉重构任务失败' },
    CANCELLED: { index: 11, progress: 100, message: '视觉重构任务已取消' }
  };

  async function publishProgress(
    runId: string,
    projectId: string,
    startedAt: string,
    stage: ReferenceTranslationStage,
    counts: { analyzed?: number; total?: number } = {}
  ): Promise<ReferenceTranslationProgress> {
    const meta = STAGE_META[stage];
    const previous = active?.progress;
    const progress: ReferenceTranslationProgress = {
      jobId: runId,
      projectId,
      jobType: 'reference_translation',
      status: stage === 'COMPLETED' ? 'completed'
        : stage === 'FAILED' ? 'failed'
          : stage === 'CANCELLED' ? 'cancelled'
            : 'running',
      stage,
      stageIndex: meta.index,
      stageCount: 11,
      progress: Math.max(previous?.progress || 0, meta.progress),
      analyzedAssetCount: counts.analyzed ?? previous?.analyzedAssetCount,
      totalAssetCount: counts.total ?? previous?.totalAssetCount,
      startedAt,
      updatedAt: new Date().toISOString(),
      message: meta.message
    };
    if (active?.progress.jobId === runId) active.progress = progress;
    dependencies?.emitProgress?.(progress);
    await fs.mkdir(path.join(await runRoot(runId), 'logs'), { recursive: true });
    await fs.appendFile(
      path.join(await runRoot(runId), 'logs', 'run.log'),
      `${JSON.stringify(progress)}\n`,
      'utf8'
    ).catch(() => {});
    const current = await getRun(runId).catch(() => null);
    if (current) {
      await writeJson(await recordPath(runId), {
        ...current,
        status: progress.status,
        stage,
        progress: progress.progress,
        analyzedAssetCount: progress.analyzedAssetCount,
        totalAssetCount: progress.totalAssetCount
      });
    }
    return progress;
  }

  function assertNotCancelled(): void {
    if (active?.cancelled) throw Object.assign(new Error('用户已取消参考转译'), { code: 'CANCELLED' });
  }

  async function runWithStructuredInputs(options: {
    visualAnalysis: unknown;
    projectContext: unknown;
    visualAnalysisLabel: string;
    projectContextLabel: string;
    preference?: string;
    force?: boolean;
    runId?: string;
    projectId?: string;
    createdAt?: string;
    totalAssetCount?: number;
  }): Promise<ReferenceTranslationResult> {
    const preference = String(options.preference || '').slice(0, 500);
    const runId = options.runId || crypto.randomUUID();
    const createdAt = options.createdAt || new Date().toISOString();
    const projectId = options.projectId || 'developer-input';
    const root = await runRoot(runId);
    const inputDir = path.join(root, 'input');
    const intermediateDir = path.join(root, 'intermediate');
    await Promise.all([
      fs.mkdir(inputDir, { recursive: true }),
      fs.mkdir(intermediateDir, { recursive: true }),
      fs.mkdir(path.join(root, 'logs'), { recursive: true })
    ]);
    const visualAnalysisPath = path.join(intermediateDir, 'reference-visual-analysis.json');
    const contextPath = path.join(inputDir, 'project-context.json');
    await Promise.all([
      writeJson(visualAnalysisPath, options.visualAnalysis),
      writeJson(contextPath, options.projectContext)
    ]);

    const base: ReferenceTranslationRunRecord = {
      id: runId,
      status: 'running',
      createdAt,
      cacheHit: false,
      visualAnalysisFilename: options.visualAnalysisLabel,
      projectContextFilename: options.projectContextLabel,
      preference,
      lastError: null,
      projectId,
      stage: 'SYNTHESIZING_REFERENCE_DNA',
      progress: STAGE_META.SYNTHESIZING_REFERENCE_DNA.progress,
      totalAssetCount: options.totalAssetCount,
      analyzedAssetCount: options.totalAssetCount,
      reportFilename: null,
      error: null
    };
    await writeJson(await recordPath(runId), base);

    try {
      await publishProgress(runId, projectId, createdAt, 'SYNTHESIZING_REFERENCE_DNA', {
        analyzed: options.totalAssetCount,
        total: options.totalAssetCount
      });
      assertNotCancelled();
      const outcome = await runReferenceTranslation({
        visualAnalysisPath,
        projectContextPath: contextPath,
        outputPath: await profilePath(runId),
        preference,
        force: Boolean(options.force)
      });
      const profile = outcome.profile as ReferenceTranslationProfile;
      await writeJson(path.join(intermediateDir, 'reference-visual-dna.json'), profile.referenceVisualDNA);
      await publishProgress(runId, projectId, createdAt, 'CLASSIFYING_TRANSFERABILITY');
      await writeJson(path.join(intermediateDir, 'transferability.json'), profile.transferability);
      await publishProgress(runId, projectId, createdAt, 'MAPPING_TO_PROJECT');
      assertNotCancelled();
      await publishProgress(runId, projectId, createdAt, 'GENERATING_DIRECTION');
      const direction = generateReferenceLedDirection(profile, preference);
      await writeJson(await directionPath(runId), direction);
      const reportMarkdown = compileReferenceTranslationMarkdown({
        profile,
        projectContext: options.projectContext,
        direction
      });
      validateMarkdownReport('reference_translation', reportMarkdown, { profile, direction });
      const reportFilename = 'report.md';
      await publishProgress(runId, projectId, createdAt, 'COMPILING_REPORT');
      await publishProgress(runId, projectId, createdAt, 'VALIDATING_REPORT');
      await fs.writeFile(path.join(root, reportFilename), reportMarkdown, 'utf8');
      const record: ReferenceTranslationRunRecord = {
        ...base,
        status: 'completed',
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - new Date(createdAt).getTime()),
        cacheHit: Boolean(outcome.run.cache_hit),
        completeness: profile.referenceIdentity.completeness,
        consistency: profile.referenceIdentity.consistency,
        matrixCount: profile.projectTranslationMatrix.length,
        prohibitedCount: profile.transferability.prohibitedToCopy.length,
        stage: 'COMPLETED',
        progress: 100,
        reportFilename
      };
      await writeJson(await recordPath(runId), record);
      await publishProgress(runId, projectId, createdAt, 'COMPLETED');
      return { run: record, profile, direction, reportMarkdown };
    } catch (error) {
      const code = String((error as { code?: string }).code || '');
      const cancelled = code === 'CANCELLED';
      const stage = active?.progress.stage || 'FAILED';
      const recoverable = ['COMPILING_REPORT', 'VALIDATING_REPORT'].includes(stage);
      const reconstructionCode = [
        'CURRENT_PROJECT_CONTEXT_INCOMPLETE',
        'REFERENCE_STYLE_INSUFFICIENT',
        'REFERENCE_BRAND_CONTAMINATION',
        'RECONSTRUCTION_QUALITY_FAILED',
        'REFERENCE_FIRST_LEGACY_STYLE_NOT_SUPPRESSED',
        'REFERENCE_FIRST_REPORT_VALIDATION_FAILED'
      ].includes(code) ? code as ReferenceTranslationError['code'] : null;
      const structuredError: ReferenceTranslationError = {
        code: cancelled ? 'CANCELLED'
          : reconstructionCode || (
            stage === 'VALIDATING_REPORT' ? 'MARKDOWN_VALIDATION_FAILED'
            : stage === 'COMPILING_REPORT' ? 'MARKDOWN_COMPILE_FAILED'
              : 'PROJECT_MAPPING_FAILED'),
        message: (error as Error).message,
        stage,
        recoverable,
        retryFromStage: recoverable ? 'COMPILING_REPORT' : undefined
      };
      const record: ReferenceTranslationRunRecord = {
        ...base,
        status: cancelled ? 'cancelled' : 'failed',
        completedAt: new Date().toISOString(),
        lastError: (error as Error).message,
        stage: cancelled ? 'CANCELLED' : 'FAILED',
        error: structuredError
      };
      await writeJson(await recordPath(runId), record).catch(() => {});
      await publishProgress(runId, projectId, createdAt, cancelled ? 'CANCELLED' : 'FAILED').catch(() => {});
      throw error;
    }
  }

  async function run(input: StartReferenceTranslationInput): Promise<ReferenceTranslationResult> {
    const visualAnalysisPath = path.resolve(String(input?.visualAnalysisPath || ''));
    const projectContextPath = path.resolve(String(input?.projectContextPath || ''));
    await assertJsonInput(visualAnalysisPath, '参考视觉分析文件');
    await assertJsonInput(projectContextPath, '项目上下文文件');
    return runWithStructuredInputs({
      visualAnalysis: await readJson(visualAnalysisPath),
      projectContext: await readJson(projectContextPath),
      visualAnalysisLabel: path.basename(visualAnalysisPath),
      projectContextLabel: path.basename(projectContextPath),
      preference: input.referenceStylePreference ?? input.preference,
      force: input.force
    });
  }

  async function runUserInput(input: StartReferenceTranslationUserInput): Promise<ReferenceTranslationResult> {
    if (!dependencies) throw new Error('正式用户流程尚未连接项目分析服务');
    if (active) throw new Error('当前已有分析任务正在运行。完成后可开始新的分析任务。');
    const referenceAssetPaths = [...new Set((input?.referenceAssetPaths || []).map((item) => path.resolve(item)))];
    const currentProjectSourcePaths = [...new Set((input?.currentProjectSourcePaths || []).map((item) => path.resolve(item)))];
    if (!referenceAssetPaths.length) throw new Error('请先上传至少一份参考视觉方案');
    if (!input.currentProjectId && !currentProjectSourcePaths.length) throw new Error('请选择当前项目，或上传当前项目资料');

    const settings = await readSettings();
    const existingProject = input.currentProjectId
      ? await dependencies.projects.get(input.currentProjectId)
      : null;
    const existingProfileId = settings.profiles.some((profile) =>
      profile.id === existingProject?.apiProfileId && profile.isEnabled)
      ? existingProject?.apiProfileId
      : undefined;
    const apiProfileId = input.apiProfileId || existingProfileId || settings.defaultProfileId || undefined;
    if (!apiProfileId) throw new Error('请先在设置中配置并启用默认 API Profile');

    const runId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const targetProjectId = existingProject?.id || 'new-project';
    active = {
      progress: {
        jobId: runId,
        projectId: targetProjectId,
        jobType: 'reference_translation',
        status: 'running',
        stage: 'PREPARING_ASSETS',
        stageIndex: 1,
        stageCount: 11,
        progress: 0,
        startedAt: createdAt,
        updatedAt: createdAt
      },
      cancelled: false
    };
    const initialRecord: ReferenceTranslationRunRecord = {
      id: runId,
      status: 'running',
      createdAt,
      cacheHit: false,
      visualAnalysisFilename: `${referenceAssetPaths.length} 个参考来源`,
      projectContextFilename: existingProject?.projectName || '待创建项目',
      preference: String(input.referenceStylePreference ?? input.preference ?? '').slice(0, 500),
      lastError: null,
      projectId: targetProjectId,
      stage: 'PREPARING_ASSETS',
      progress: 5,
      totalAssetCount: referenceAssetPaths.length,
      analyzedAssetCount: 0,
      reportFilename: null,
      error: null,
      apiProfileId
    };
    await writeJson(await recordPath(runId), initialRecord);
    await publishProgress(runId, targetProjectId, createdAt, 'PREPARING_ASSETS', {
      analyzed: 0,
      total: referenceAssetPaths.length
    });
    let referenceProjectId: string | null = null;
    try {
      const currentProject = existingProject || await dependencies.projects.create({
        sourcePaths: currentProjectSourcePaths,
        apiProfileId
      });
      await writeJson(await recordPath(runId), {
        ...(await getRun(runId)),
        projectId: currentProject.id,
        projectContextFilename: currentProject.projectName,
        apiProfileId
      });
      active.pipelineProjectId = currentProject.id;
      await publishProgress(runId, currentProject.id, createdAt, 'SELECTING_CURRENT_CORE_PACK');
      const currentSelectionResult = dependencies.pipeline.selectCurrentProjectAssets
        ? await dependencies.pipeline.selectCurrentProjectAssets(currentProject.id, apiProfileId)
        : {
          value: createFallbackCurrentProjectDecisions(currentProject.assets || []),
          provider: 'local',
          model: 'deterministic-fallback',
          durationMs: 0,
          modelCallCount: 0
        };
      const currentDecisions = currentSelectionResult.value as CurrentProjectAssetDecision[];
      assertNotCancelled();

      const referenceProject = await dependencies.projects.create({
        sourcePaths: referenceAssetPaths,
        apiProfileId
      });
      referenceProjectId = referenceProject.id;
      const referenceSummary = await dependencies.projects.scan(referenceProject.id);
      const referencePaths = await dependencies.projects.paths(referenceProject.id);
      await fs.mkdir(path.join(await runRoot(runId), 'input'), { recursive: true });
      await fs.cp(
        path.join(referencePaths.input, 'assets'),
        path.join(await runRoot(runId), 'input', 'reference-assets'),
        { recursive: true }
      );
      active.pipelineProjectId = referenceProject.id;
      await publishProgress(runId, targetProjectId, createdAt, 'SELECTING_REFERENCE_MASTER_SET', {
        analyzed: 0,
        total: referenceSummary.totalFiles
      });
      const referenceSelectionResult = dependencies.pipeline.selectReferenceAssets
        ? await dependencies.pipeline.selectReferenceAssets(referenceProject.id, apiProfileId)
        : {
          value: createFallbackReferenceDecisions(referenceProject.assets || []),
          provider: 'local',
          model: 'deterministic-fallback',
          durationMs: 0,
          modelCallCount: 0
        };
      const referenceDecisions = await detectReferenceNearDuplicates(
        referenceSelectionResult.value as ReferenceAssetDecision[],
        referenceProject.assets || [],
        referencePaths.input
      );
      const assetSelectionProtocol = assembleAssetSelectionProtocol(
        currentProject,
        currentDecisions,
        referenceDecisions
      );
      assertAssetSelectionProtocol(assetSelectionProtocol);
      const lowConfidenceCurrent = currentDecisions.some((item) =>
        item.confidence < 0.6 || (item.role === 'uncertain' && item.requiresHumanReview));
      const lowConfidenceReference = referenceDecisions.some((item) =>
        item.confidence < 0.6 || (item.role === 'uncertain' && item.requiresHumanReview));
      await publishProgress(runId, targetProjectId, createdAt, 'BUILDING_TASK_REFERENCE_SUBSETS');
      const root = await runRoot(runId);
      const taskSubsetDir = path.join(root, 'task-reference-subsets');
      await fs.mkdir(taskSubsetDir, { recursive: true });
      const subsetFilename: Record<string, string> = {
        anchor_vi_system: 'anchor.json',
        packaging_single: 'packaging.json',
        packaging_series: 'packaging-series.json',
        brand_poster: 'poster.json',
        product_poster: 'product-poster.json',
        vi_application: 'vi.json',
        spatial_scene: 'space.json',
        digital_campaign: 'digital-campaign.json'
      };
      await Promise.all([
        writeJson(path.join(root, 'current-project-assets.json'), currentProject.assets || []),
        writeJson(path.join(root, 'current-project-asset-decisions.json'), currentDecisions),
        writeJson(path.join(root, 'current-project-core-pack.json'), assetSelectionProtocol.currentProjectCorePack),
        writeJson(path.join(root, 'current-core-pack-validation.json'), assetSelectionProtocol.currentCorePackValidation),
        writeJson(path.join(root, 'reference-assets.json'), referenceProject.assets || []),
        writeJson(path.join(root, 'reference-asset-decisions.json'), referenceDecisions),
        writeJson(path.join(root, 'reference-master-set.json'), assetSelectionProtocol.referenceMasterSet),
        writeJson(path.join(root, 'reference-master-set-validation.json'), assetSelectionProtocol.referenceMasterSetValidation),
        writeJson(path.join(root, 'style-carrier-ranking.json'), assetSelectionProtocol.referenceMasterSet.styleCarriers),
        writeJson(path.join(root, 'user-confirmation.json'), {
          status: input.force
            ? 'confirmed_by_user'
            : lowConfidenceCurrent || lowConfidenceReference
              ? 'required'
              : assetSelectionProtocol.requiresHumanConfirmation ? 'suggested' : 'not_required',
          reason: input.force
            ? '用户已明确确认低置信度素材筛选结果'
            : assetSelectionProtocol.requiresHumanConfirmation
            ? '存在置信度低于 0.8 或 requiresHumanReview 的素材决定'
            : '全部自动筛选决定置信度不低于 0.8'
        }),
        ...assetSelectionProtocol.taskReferenceSubsets.map((subset) =>
          writeJson(path.join(taskSubsetDir, subsetFilename[subset.outputType]!), subset)),
        ...assetSelectionProtocol.taskReferenceSubsets.map((subset) =>
          writeJson(path.join(taskSubsetDir, `${subset.outputType}.json`), subset))
      ]);
      if (!input.force && (lowConfidenceCurrent || lowConfidenceReference)) {
        throw Object.assign(
          new Error('素材筛选包含低于 0.6 的决定，必须先查看运行目录中的筛选结果并由用户确认后重试'),
          { code: lowConfidenceCurrent ? 'CURRENT_CORE_PACK_INCOMPLETE' : 'REFERENCE_MASTER_SET_INSUFFICIENT' }
        );
      }
      assertNotCancelled();

      await publishProgress(runId, currentProject.id, createdAt, 'LOADING_PROJECT_CONTEXT');
      active.pipelineProjectId = currentProject.id;
      const currentFactsResult = await dependencies.pipeline.analyzeCurrentProjectProfile(
        currentProject.id,
        apiProfileId,
        'current_project_audit',
        assetSelectionProtocol.currentProjectCorePack.sourceAssetIds.length
          ? assetSelectionProtocol.currentProjectCorePack.sourceAssetIds
          : undefined
      );
      const currentProjectProfile = currentFactsResult.value;
      assertNotCancelled();

      active.pipelineProjectId = referenceProject.id;
      await publishProgress(runId, targetProjectId, createdAt, 'ANALYZING_REFERENCE', {
        analyzed: 0,
        total: referenceSummary.totalFiles
      });
      assertNotCancelled();
      const referenceStyleResult = await dependencies.pipeline.analyzeReferenceStyle(
        referenceProject.id,
        apiProfileId,
        'reference_style',
        assetSelectionProtocol.referenceMasterSet.assetIds
      );
      const referenceStyleProfile = referenceStyleResult.value;
      await publishProgress(runId, targetProjectId, createdAt, 'ANALYZING_REFERENCE', {
        analyzed: referenceSummary.totalFiles,
        total: referenceSummary.totalFiles
      });
      assertNotCancelled();
      const currentIdentityTerms = new Set(uniqueStrings([
        currentProject.brandName,
        currentProject.detectedBrandName,
        currentProject.projectName,
        currentProject.industry,
        currentProject.detectedIndustry,
        currentProjectProfile.brandName,
        currentProjectProfile.industry
      ]));
      const referenceIdentityTerms = uniqueStrings(referenceStyleProfile.excludedIdentityTerms)
        .filter((term) => !currentIdentityTerms.has(term));
      const referenceVisualAnalysis = {
        schemaVersion: 'reference-visual-evidence-v2',
        purpose: 'reference_style',
        sourceAssetIds: referenceStyleProfile.sourceAssetIds,
        excludedIdentityTerms: referenceIdentityTerms,
        assetCount: referenceSummary.totalFiles
      };
      const projectContext = {
        schemaVersion: 'project-context-v2',
        currentProjectProfile
      };
      const inputDir = path.join(root, 'input');
      const intermediateDir = path.join(root, 'intermediate');
      await Promise.all([
        fs.mkdir(inputDir, { recursive: true }),
        fs.mkdir(intermediateDir, { recursive: true }),
        fs.mkdir(path.join(root, 'logs'), { recursive: true }),
        writeJson(path.join(inputDir, 'project-context.json'), projectContext),
        writeJson(path.join(intermediateDir, 'reference-visual-analysis.json'), referenceVisualAnalysis),
        writeJson(path.join(intermediateDir, 'current-project-profile.json'), currentProjectProfile),
        writeJson(path.join(intermediateDir, 'reference-style-profile.json'), referenceStyleProfile)
      ]);
      await publishProgress(runId, currentProject.id, createdAt, 'SYNTHESIZING_REFERENCE_DNA', {
        analyzed: referenceSummary.totalFiles,
        total: referenceSummary.totalFiles
      });
      active.pipelineProjectId = currentProject.id;
      await publishProgress(runId, currentProject.id, createdAt, 'GENERATING_DIRECTION');
      const decisionResult = await dependencies.pipeline.generateVisualReconstructionDecision({
        projectId: currentProject.id,
        apiProfileId,
        currentProjectProfile,
        referenceStyleProfile,
        preference: input.referenceStylePreference ?? input.preference
      });
      assertNotCancelled();
      await publishProgress(runId, currentProject.id, createdAt, 'COMPILING_REPORT');
      const finalized = finalizeReferenceStyleReconstruction({
        currentProjectProfile,
        referenceStyleProfile,
        visualReconstructionDirection: decisionResult.value,
        assetSelectionProtocol,
        referenceIdentityTerms
      });
      const referenceFirst = finalized.reconstruction.referenceFirstStrategy!;
      await publishProgress(runId, currentProject.id, createdAt, 'VALIDATING_REPORT');
      const reportFilename = `${sanitizeFilenamePart(currentProjectProfile.projectName)}-Reference-First生图执行文档.md`;
      await persistReferenceFirstBetaArtifacts(
        root,
        referenceFirst,
        assetSelectionProtocol,
        currentProjectProfile.projectName,
        (await dependencies.projects.paths(currentProjectProfile.projectId)).outputs
      );
      await Promise.all([
        writeJson(path.join(intermediateDir, 'visual-reconstruction-direction.json'), decisionResult.value),
        writeJson(path.join(intermediateDir, 'quality-validation.json'), finalized.reconstruction.validation),
        writeJson(path.join(intermediateDir, 'execution-brief-validation.json'), finalized.reconstruction.validation),
        writeJson(path.join(intermediateDir, 'current-project-core-pack-readable.json'), referenceFirst.currentProjectReadableAssets),
        writeJson(path.join(intermediateDir, 'replaceable-legacy-visuals.json'), referenceFirst.currentProjectVisualPermissions.replaceableLegacyVisuals),
        writeJson(path.join(intermediateDir, 'reference-master-set-readable.json'), referenceFirst.referenceReadableAssets),
        writeJson(path.join(intermediateDir, 'task-reference-confidence.json'), referenceFirst.taskReferenceConfidence),
        writeJson(path.join(intermediateDir, 'reference-first-permission-matrix.json'), referenceFirst.permissionMatrix),
        writeJson(path.join(intermediateDir, 'system-anchor.json'), referenceFirst.systemAnchor),
        writeJson(path.join(intermediateDir, 'project-graphic-anchor.json'), referenceFirst.projectGraphicAnchor),
        writeJson(path.join(intermediateDir, 'reference-first-strategy.json'), referenceFirst),
        writeJson(path.join(intermediateDir, 'report-validation.json'), referenceFirst.reportValidation),
        writeJson(path.join(intermediateDir, 'generation-context.json'), referenceFirst.generationContexts),
        writeJson(await reconstructionPath(runId), finalized.reconstruction),
        fs.writeFile(path.join(root, reportFilename), finalized.markdown, 'utf8'),
        writeJson(path.join(root, 'logs', 'model-calls.json'), {
          terminalStatus: 'completed',
          calls: [
            {
              step: 'current-project-asset-selection',
              provider: currentSelectionResult.provider,
              model: currentSelectionResult.model,
              modelCallCount: currentSelectionResult.modelCallCount,
              durationMs: currentSelectionResult.durationMs
            },
            {
              step: 'reference-master-set-selection',
              provider: referenceSelectionResult.provider,
              model: referenceSelectionResult.model,
              modelCallCount: referenceSelectionResult.modelCallCount,
              durationMs: referenceSelectionResult.durationMs
            },
            {
              step: 'current-project-profile',
              provider: currentFactsResult.provider,
              model: currentFactsResult.model,
              modelCallCount: currentFactsResult.modelCallCount,
              durationMs: currentFactsResult.durationMs
            },
            {
              step: 'reference-style-profile',
              provider: referenceStyleResult.provider,
              model: referenceStyleResult.model,
              modelCallCount: referenceStyleResult.modelCallCount,
              durationMs: referenceStyleResult.durationMs
            },
            {
              step: 'visual-reconstruction-decision',
              provider: decisionResult.provider,
              model: decisionResult.model,
              modelCallCount: decisionResult.modelCallCount,
              durationMs: decisionResult.durationMs
            }
          ]
        })
      ]);
      const completedRecord: ReferenceTranslationRunRecord = {
        ...initialRecord,
        status: 'completed',
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - new Date(createdAt).getTime()),
        visualAnalysisFilename: `${referenceSummary.totalFiles} 个参考资产`,
        projectContextFilename: currentProjectProfile.projectName,
        preference: String(input.referenceStylePreference ?? input.preference ?? '').slice(0, 500),
        prohibitedCount: referenceIdentityTerms.length,
        stage: 'COMPLETED',
        progress: 100,
        analyzedAssetCount: referenceSummary.totalFiles,
        totalAssetCount: referenceSummary.totalFiles,
        reportFilename,
        projectId: currentProject.id,
        apiProfileId,
        modelCallCount: currentSelectionResult.modelCallCount
          + referenceSelectionResult.modelCallCount
          + currentFactsResult.modelCallCount
          + referenceStyleResult.modelCallCount
          + decisionResult.modelCallCount,
        error: null,
        lastError: null
      };
      await writeJson(await recordPath(runId), completedRecord);
      await publishProgress(runId, currentProject.id, createdAt, 'COMPLETED');
      return {
        run: completedRecord,
        reportMarkdown: finalized.markdown,
        reconstruction: finalized.reconstruction,
        assetSelectionProtocol
      };
    } catch (error) {
      const root = await runRoot(runId);
      await persistStructuredFailureEvidence(root, error).catch(() => {});
      const cancelled = active?.cancelled || (error as Error).name === 'AbortError'
        || (error as { code?: string }).code === 'CANCELLED';
      const sourceCode = String((error as { code?: string }).code || '');
      const stage = active?.progress.stage || 'FAILED';
      const canResumeDirection = stage === 'GENERATING_DIRECTION'
        && sourceCode === 'VISUAL_DIRECTION_NOT_EXECUTABLE';
      const structuredError: ReferenceTranslationError = {
        code: cancelled ? 'CANCELLED'
          : sourceCode === 'CURRENT_CORE_PACK_INCOMPLETE' ? 'CURRENT_CORE_PACK_INCOMPLETE'
            : sourceCode === 'CURRENT_CORE_PACK_CONTAMINATED' ? 'CURRENT_CORE_PACK_CONTAMINATED'
              : sourceCode === 'REFERENCE_MASTER_SET_INSUFFICIENT' ? 'REFERENCE_MASTER_SET_INSUFFICIENT'
                : sourceCode === 'TASK_REFERENCE_SUBSET_MISMATCH' ? 'TASK_REFERENCE_SUBSET_MISMATCH'
                  : sourceCode === 'TASK_REFERENCE_SUBSET_TOO_WEAK' ? 'TASK_REFERENCE_SUBSET_TOO_WEAK'
          : sourceCode === 'CURRENT_PROJECT_CONTEXT_INCOMPLETE' ? 'CURRENT_PROJECT_CONTEXT_INCOMPLETE'
            : sourceCode === 'CURRENT_PROJECT_PROFILE_CONTAMINATED' ? 'CURRENT_PROJECT_PROFILE_CONTAMINATED'
            : sourceCode === 'REFERENCE_STYLE_INSUFFICIENT' ? 'REFERENCE_STYLE_INSUFFICIENT'
              : sourceCode === 'REFERENCE_STYLE_PROFILE_CONTAMINATED' ? 'REFERENCE_STYLE_PROFILE_CONTAMINATED'
              : sourceCode === 'REFERENCE_BRAND_CONTAMINATION' ? 'REFERENCE_BRAND_CONTAMINATION'
                : sourceCode === 'REFERENCE_IDENTITY_LEAKAGE' ? 'REFERENCE_IDENTITY_LEAKAGE'
                  : sourceCode === 'RECONSTRUCTION_OUTPUT_DUPLICATED' ? 'RECONSTRUCTION_OUTPUT_DUPLICATED'
                    : sourceCode === 'VISUAL_DIRECTION_NOT_EXECUTABLE' ? 'VISUAL_DIRECTION_NOT_EXECUTABLE'
                : sourceCode === 'RECONSTRUCTION_QUALITY_FAILED' ? 'RECONSTRUCTION_QUALITY_FAILED'
                  : sourceCode === 'REFERENCE_FIRST_LEGACY_STYLE_NOT_SUPPRESSED'
                    ? 'REFERENCE_FIRST_LEGACY_STYLE_NOT_SUPPRESSED'
                    : sourceCode === 'REFERENCE_FIRST_REPORT_VALIDATION_FAILED'
                      ? 'REFERENCE_FIRST_REPORT_VALIDATION_FAILED'
          : stage === 'PREPARING_ASSETS' ? 'REFERENCE_ASSET_PREPARATION_FAILED'
            : stage === 'ANALYZING_REFERENCE' ? 'REFERENCE_ANALYSIS_FAILED'
              : stage === 'LOADING_PROJECT_CONTEXT' ? 'PROJECT_CONTEXT_LOAD_FAILED'
                : 'PROJECT_MAPPING_FAILED',
        message: cancelled ? '用户已取消参考转译' : (error as Error).message,
        stage,
        recoverable: canResumeDirection,
        retryFromStage: canResumeDirection ? 'GENERATING_DIRECTION' : undefined
      };
      const current = await getRun(runId).catch(() => initialRecord);
      if (current.error) throw error;
      await writeJson(await recordPath(runId), {
        ...current,
        status: cancelled ? 'cancelled' : 'failed',
        completedAt: new Date().toISOString(),
        lastError: structuredError.message,
        stage: cancelled ? 'CANCELLED' : 'FAILED',
        error: structuredError
      }).catch(() => {});
      await publishProgress(
        runId,
        current.projectId || targetProjectId,
        createdAt,
        cancelled ? 'CANCELLED' : 'FAILED'
      ).catch(() => {});
      throw error;
    } finally {
      if (referenceProjectId) await dependencies.projects.remove(referenceProjectId).catch(() => {});
      active = null;
    }
  }

  async function getActive(): Promise<ReferenceTranslationProgress | null> {
    return active?.progress || null;
  }

  async function readReport(runId: string): Promise<string> {
    return fs.readFile(await reportPath(runId), 'utf8');
  }

  async function ensureReportDelivery(runId: string): Promise<string> {
    const root = await runRoot(runId);
    if (!dependencies) return root;
    const record = await getRun(runId);
    if (!record.projectId) return root;
    const projectPaths = await dependencies.projects.paths(record.projectId).catch(() => null);
    if (!projectPaths) return root;
    await fs.mkdir(projectPaths.outputs, { recursive: true });

    if (record.reportFilename) {
      const generationSource = path.join(root, record.reportFilename);
      await fs.copyFile(
        generationSource,
        path.join(projectPaths.outputs, path.basename(generationSource))
      ).catch(() => {});
    }

    const auditFilename = `${sanitizeFilenamePart(record.projectContextFilename || '当前项目')}-参考主导视觉重构分析审计报告.md`;
    for (const source of [
      path.join(root, auditFilename),
      path.join(root, 'reports', 'analysis-audit-report.md')
    ]) {
      try {
        await fs.copyFile(source, path.join(projectPaths.outputs, auditFilename));
        break;
      } catch {
        // Older runs may not contain a separated audit report.
      }
    }
    return projectPaths.outputs;
  }

  async function loadPersistedAssetSelectionProtocol(
    runId: string,
    projectId: string
  ): Promise<AssetSelectionProtocolResult> {
    if (!dependencies) throw new Error('正式用户流程尚未连接项目分析服务');
    const root = await runRoot(runId);
    const [project, currentDecisions, referenceDecisions] = await Promise.all([
      dependencies.projects.get(projectId),
      readJson<CurrentProjectAssetDecision[]>(path.join(root, 'current-project-asset-decisions.json')),
      readJson<ReferenceAssetDecision[]>(path.join(root, 'reference-asset-decisions.json'))
    ]);
    return assembleAssetSelectionProtocol(project, currentDecisions, referenceDecisions);
  }

  async function resume(runId: string, requestedApiProfileId?: string): Promise<ReferenceTranslationResult> {
    if (!dependencies) throw new Error('正式用户流程尚未连接项目分析服务');
    if (active) throw new Error('当前已有分析任务正在运行，请等待完成后再继续分析。');
    const record = await getRun(runId);
    if (record.status === 'completed') {
      const reconstruction = await getReconstruction(runId);
      return {
        run: record,
        reportMarkdown: await readReport(runId),
        reconstruction,
        assetSelectionProtocol: reconstruction.assetSelectionProtocol
      };
    }
    if (record.error?.recoverable && record.error.retryFromStage === 'COMPILING_REPORT') {
      return retryReport(runId);
    }
    const failedStage = record.error?.retryFromStage || record.error?.stage;
    if (failedStage !== 'GENERATING_DIRECTION') {
      throw new Error('该任务没有可复用的方向生成 Checkpoint，需要重新开始分析。');
    }

    const root = await runRoot(runId);
    const intermediateDir = path.join(root, 'intermediate');
    const [persistedCurrentProjectProfile, referenceStyleProfile] = await Promise.all([
      readJson<CurrentProjectProfile>(path.join(intermediateDir, 'current-project-profile.json')),
      readJson<ReferenceStyleProfile>(path.join(intermediateDir, 'reference-style-profile.json'))
    ]);
    const currentProjectProfile = recoverPersistedProjectIdentity(persistedCurrentProjectProfile);
    if (currentProjectProfile !== persistedCurrentProjectProfile) {
      await writeJson(path.join(intermediateDir, 'current-project-profile.json'), currentProjectProfile);
      await writeJson(path.join(root, 'input', 'project-context.json'), {
        schemaVersion: 'project-context-v2',
        currentProjectProfile
      });
    }
    const project = await dependencies.projects.get(currentProjectProfile.projectId).catch(() => null);
    if (!project) throw new Error('继续分析所需的当前项目已不存在，无法复用失败任务。');
    const settings = await readSettings();
    const apiProfileId = requestedApiProfileId
      || record.apiProfileId
      || project.apiProfileId
      || settings.defaultProfileId
      || undefined;
    if (!apiProfileId) throw new Error('请先在设置中配置并启用 API Profile。');

    const assetSelectionProtocol = await loadPersistedAssetSelectionProtocol(
      runId,
      currentProjectProfile.projectId
    );
    const resumedAt = new Date().toISOString();
    active = {
      progress: {
        jobId: runId,
        projectId: currentProjectProfile.projectId,
        jobType: 'reference_translation',
        status: 'running',
        stage: 'GENERATING_DIRECTION',
        stageIndex: STAGE_META.GENERATING_DIRECTION.index,
        stageCount: 11,
        progress: STAGE_META.GENERATING_DIRECTION.progress,
        analyzedAssetCount: record.analyzedAssetCount,
        totalAssetCount: record.totalAssetCount,
        startedAt: resumedAt,
        updatedAt: resumedAt,
        message: '正在从已保存的项目画像与参考风格继续生成视觉方向'
      },
      pipelineProjectId: currentProjectProfile.projectId,
      cancelled: false
    };
    await writeJson(await recordPath(runId), {
      ...record,
      status: 'running',
      completedAt: undefined,
      lastError: null,
      error: null,
      stage: 'GENERATING_DIRECTION',
      progress: STAGE_META.GENERATING_DIRECTION.progress,
      projectId: currentProjectProfile.projectId,
      projectContextFilename: currentProjectProfile.projectName,
      apiProfileId
    });

    try {
      await publishProgress(
        runId,
        currentProjectProfile.projectId,
        resumedAt,
        'GENERATING_DIRECTION',
        { analyzed: record.analyzedAssetCount, total: record.totalAssetCount }
      );
      const decisionResult = await dependencies.pipeline.generateVisualReconstructionDecision({
        projectId: currentProjectProfile.projectId,
        apiProfileId,
        currentProjectProfile,
        referenceStyleProfile,
        preference: record.preference
      });
      assertNotCancelled();
      await publishProgress(runId, currentProjectProfile.projectId, resumedAt, 'COMPILING_REPORT');
      const finalized = finalizeReferenceStyleReconstruction({
        currentProjectProfile,
        referenceStyleProfile,
        visualReconstructionDirection: decisionResult.value,
        assetSelectionProtocol,
        referenceIdentityTerms: referenceStyleProfile.excludedIdentityTerms
      });
      const referenceFirst = finalized.reconstruction.referenceFirstStrategy!;
      await publishProgress(runId, currentProjectProfile.projectId, resumedAt, 'VALIDATING_REPORT');
      const reportFilename = `${sanitizeFilenamePart(currentProjectProfile.projectName)}-Reference-First生图执行文档.md`;
      await persistReferenceFirstBetaArtifacts(
        root,
        referenceFirst,
        assetSelectionProtocol,
        currentProjectProfile.projectName,
        (await dependencies.projects.paths(currentProjectProfile.projectId)).outputs
      );
      await Promise.all([
        writeJson(path.join(intermediateDir, 'visual-reconstruction-direction.json'), decisionResult.value),
        writeJson(path.join(intermediateDir, 'quality-validation.json'), finalized.reconstruction.validation),
        writeJson(path.join(intermediateDir, 'execution-brief-validation.json'), finalized.reconstruction.validation),
        writeJson(path.join(intermediateDir, 'current-project-core-pack-readable.json'), referenceFirst.currentProjectReadableAssets),
        writeJson(path.join(intermediateDir, 'replaceable-legacy-visuals.json'), referenceFirst.currentProjectVisualPermissions.replaceableLegacyVisuals),
        writeJson(path.join(intermediateDir, 'reference-master-set-readable.json'), referenceFirst.referenceReadableAssets),
        writeJson(path.join(intermediateDir, 'task-reference-confidence.json'), referenceFirst.taskReferenceConfidence),
        writeJson(path.join(intermediateDir, 'reference-first-permission-matrix.json'), referenceFirst.permissionMatrix),
        writeJson(path.join(intermediateDir, 'system-anchor.json'), referenceFirst.systemAnchor),
        writeJson(path.join(intermediateDir, 'project-graphic-anchor.json'), referenceFirst.projectGraphicAnchor),
        writeJson(path.join(intermediateDir, 'reference-first-strategy.json'), referenceFirst),
        writeJson(path.join(intermediateDir, 'report-validation.json'), referenceFirst.reportValidation),
        writeJson(path.join(intermediateDir, 'generation-context.json'), referenceFirst.generationContexts),
        writeJson(await reconstructionPath(runId), finalized.reconstruction),
        fs.writeFile(path.join(root, reportFilename), finalized.markdown, 'utf8'),
        writeJson(path.join(root, 'logs', 'resume-model-calls.json'), {
          terminalStatus: 'completed',
          resumedFromStage: 'GENERATING_DIRECTION',
          provider: decisionResult.provider,
          model: decisionResult.model,
          modelCallCount: decisionResult.modelCallCount,
          durationMs: decisionResult.durationMs
        })
      ]);
      const completed: ReferenceTranslationRunRecord = {
        ...record,
        status: 'completed',
        completedAt: new Date().toISOString(),
        durationMs: (record.durationMs || 0) + Math.max(0, Date.now() - new Date(resumedAt).getTime()),
        projectId: currentProjectProfile.projectId,
        projectContextFilename: currentProjectProfile.projectName,
        stage: 'COMPLETED',
        progress: 100,
        reportFilename,
        apiProfileId,
        modelCallCount: (record.modelCallCount || 0) + decisionResult.modelCallCount,
        resumedStageCount: (record.resumedStageCount || 0) + 1,
        error: null,
        lastError: null
      };
      await writeJson(await recordPath(runId), completed);
      await publishProgress(runId, currentProjectProfile.projectId, resumedAt, 'COMPLETED');
      return {
        run: completed,
        reportMarkdown: finalized.markdown,
        reconstruction: finalized.reconstruction,
        assetSelectionProtocol
      };
    } catch (error) {
      await persistStructuredFailureEvidence(root, error).catch(() => {});
      const cancelled = active?.cancelled || (error as { code?: string }).code === 'CANCELLED';
      const failed: ReferenceTranslationRunRecord = {
        ...record,
        status: cancelled ? 'cancelled' : 'failed',
        completedAt: new Date().toISOString(),
        projectId: currentProjectProfile.projectId,
        projectContextFilename: currentProjectProfile.projectName,
        stage: cancelled ? 'CANCELLED' : 'FAILED',
        progress: 100,
        lastError: cancelled ? '用户已取消继续分析' : (error as Error).message,
        error: cancelled ? {
          code: 'CANCELLED',
          message: '用户已取消继续分析',
          stage: 'CANCELLED',
          recoverable: false
        } : {
          code: (error as { code?: ReferenceTranslationError['code'] }).code
            || 'VISUAL_DIRECTION_NOT_EXECUTABLE',
          message: (error as Error).message,
          stage: 'GENERATING_DIRECTION',
          recoverable: true,
          retryFromStage: 'GENERATING_DIRECTION'
        }
      };
      await writeJson(await recordPath(runId), failed).catch(() => {});
      await publishProgress(
        runId,
        currentProjectProfile.projectId,
        resumedAt,
        cancelled ? 'CANCELLED' : 'FAILED'
      ).catch(() => {});
      throw error;
    } finally {
      active = null;
    }
  }

  async function retryReport(runId: string): Promise<ReferenceTranslationResult> {
    if (active) throw new Error('当前已有分析任务正在运行。完成后可重新编译报告。');
    const record = await getRun(runId);
    if (!record.error?.recoverable) throw new Error('该任务不支持仅重新编译报告');
    const reconstruction = await getReconstruction(runId).catch(() => null);
    const profile = reconstruction ? undefined : await getProfile(runId);
    const projectContext = await readJson<unknown>(await projectContextPath(runId));
    const direction = reconstruction ? null : await getDirection(runId);
    const startedAt = record.createdAt;
    active = {
      progress: {
        jobId: runId,
        projectId: record.projectId || 'unknown',
        jobType: 'reference_translation',
        status: 'running',
        stage: 'COMPILING_REPORT',
        stageIndex: 8,
        stageCount: 11,
        progress: Math.max(record.progress || 0, 98),
        startedAt,
        updatedAt: new Date().toISOString()
      },
      cancelled: false
    };
    try {
      await publishProgress(runId, record.projectId || 'unknown', startedAt, 'COMPILING_REPORT');
      let reportMarkdown: string;
      let nextReconstruction: ReferenceStyleReconstruction | undefined;
      if (reconstruction) {
        const partial = {
          currentProjectProfile: reconstruction.currentProjectProfile,
          referenceStyleProfile: reconstruction.referenceStyleProfile,
          styleApplicationPlan: reconstruction.styleApplicationPlan,
          visualReconstructionDirection: reconstruction.visualReconstructionDirection,
          assetSelectionProtocol: reconstruction.assetSelectionProtocol,
          referenceFirstStrategy: reconstruction.referenceFirstStrategy
        };
        reportMarkdown = compileReconstructionBrief(partial);
        const validation = validateReferenceStyleReconstruction(
          partial,
          reportMarkdown,
          reconstruction.referenceStyleProfile.excludedIdentityTerms
        );
        if (!validation.passed) throw Object.assign(
          new Error(`视觉重构质量校验失败：${validation.issues.join('、')}`),
          { code: 'MARKDOWN_VALIDATION_FAILED' }
        );
        nextReconstruction = { ...partial, validation };
        await writeJson(await reconstructionPath(runId), nextReconstruction);
        if (partial.referenceFirstStrategy && partial.assetSelectionProtocol) {
          await persistReferenceFirstBetaArtifacts(
            await runRoot(runId),
            partial.referenceFirstStrategy,
            partial.assetSelectionProtocol,
            partial.currentProjectProfile.projectName,
            dependencies
              ? (await dependencies.projects.paths(partial.currentProjectProfile.projectId)).outputs
              : undefined
          );
        }
      } else {
        reportMarkdown = compileReferenceTranslationMarkdown({ profile: profile!, projectContext, direction: direction! });
      }
      await publishProgress(runId, record.projectId || 'unknown', startedAt, 'VALIDATING_REPORT');
      if (!reconstruction) validateMarkdownReport('reference_translation', reportMarkdown, { profile: profile!, direction });
      const filename = record.reportFilename || (nextReconstruction
        ? `${sanitizeFilenamePart(nextReconstruction.currentProjectProfile.projectName)}-Reference-First生图执行文档.md`
        : 'report.md');
      await fs.writeFile(path.join(await runRoot(runId), filename), reportMarkdown, 'utf8');
      const completed: ReferenceTranslationRunRecord = {
        ...record,
        status: 'completed',
        completedAt: new Date().toISOString(),
        stage: 'COMPLETED',
        progress: 100,
        reportFilename: filename,
        lastError: null,
        error: null
      };
      await writeJson(await recordPath(runId), completed);
      await publishProgress(runId, completed.projectId || 'unknown', startedAt, 'COMPLETED');
      return {
        run: completed,
        profile,
        direction: direction || undefined,
        reportMarkdown,
        reconstruction: nextReconstruction
      };
    } catch (error) {
      const failed: ReferenceTranslationRunRecord = {
        ...record,
        status: 'failed',
        stage: 'FAILED',
        lastError: (error as Error).message,
        error: {
          code: active?.progress.stage === 'VALIDATING_REPORT'
            ? 'MARKDOWN_VALIDATION_FAILED'
            : 'MARKDOWN_COMPILE_FAILED',
          message: (error as Error).message,
          stage: active?.progress.stage || 'COMPILING_REPORT',
          recoverable: true,
          retryFromStage: 'COMPILING_REPORT'
        }
      };
      await writeJson(await recordPath(runId), failed).catch(() => {});
      throw error;
    } finally {
      active = null;
    }
  }

  async function cancel(runId: string): Promise<boolean> {
    if (!active || active.progress.jobId !== safeRunId(runId)) return false;
    active.cancelled = true;
    if (active.pipelineProjectId) dependencies?.pipeline.cancel(active.pipelineProjectId);
    return true;
  }

  async function remove(runId: string): Promise<void> {
    if (active?.progress.jobId === runId) throw new Error('正在运行的参考转译任务不能删除，请先取消');
    const root = await runRoot(runId);
    await fs.rm(root, { recursive: true, force: true });
  }

  return {
    listRuns,
    getRun,
    getActive,
    getProfile,
    getDirection,
    getReconstruction,
    readReport,
    ensureReportDelivery,
    resume,
    retryReport,
    cancel,
    inspectAssets: inspectReferenceAssets,
    run,
    runUserInput,
    remove,
    runRoot
  };
}
