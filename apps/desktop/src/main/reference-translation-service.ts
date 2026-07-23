import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  PublicSettings,
  ReferenceTranslationProfile,
  ReferenceTranslationResult,
  ReferenceTranslationRunRecord,
  StartReferenceTranslationInput,
  StartReferenceTranslationUserInput
} from '../shared/types';
import { atomicWriteJsonWithRetry } from './runtime/atomic-write.ts';
import type { ProjectStore } from './project-store.ts';
import type { PipelineService } from './pipeline-service.ts';
// Reference-Led Visual Direction 引擎：离线确定性运行，零模型调用。
import { runReferenceTranslation } from '../../../../src/reference-translation/run-reference-translation.js';

type SettingsReader = () => Promise<PublicSettings> | PublicSettings;

const RUN_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

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
}

function reportObservations(markdown: string, source: string) {
  return markdown
    .split(/\r?\n/u)
    .map((line) => line
      .replace(/^#{1,6}\s*/u, '')
      .replace(/^[-*]\s+/u, '')
      .replace(/\*\*/gu, '')
      .trim())
    .filter((line) => line.length >= 12 && line.length <= 500)
    .slice(0, 160)
    .map((observation) => ({ observation, source, confidence: 0.82 }));
}

export function createReferenceTranslationService(
  readSettings: SettingsReader,
  dependencies?: ReferenceTranslationDependencies
) {
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
    return path.join(await runRoot(runId), 'run-record.json');
  }

  async function profilePath(runId: string): Promise<string> {
    return path.join(await runRoot(runId), 'outputs', 'reference-translation-profile.json');
  }

  async function getRun(runId: string): Promise<ReferenceTranslationRunRecord> {
    return readJson<ReferenceTranslationRunRecord>(await recordPath(runId));
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
    return readJson<ReferenceTranslationProfile>(await profilePath(runId));
  }

  async function runWithStructuredInputs(options: {
    visualAnalysis: unknown;
    projectContext: unknown;
    visualAnalysisLabel: string;
    projectContextLabel: string;
    preference?: string;
    force?: boolean;
  }): Promise<ReferenceTranslationResult> {
    const preference = String(options.preference || '').slice(0, 500);
    const runId = crypto.randomUUID();
    const root = await runRoot(runId);
    const inputsDir = path.join(root, 'inputs');
    await fs.mkdir(inputsDir, { recursive: true });
    const visualAnalysisPath = path.join(inputsDir, 'reference-visual-analysis.json');
    const projectContextPath = path.join(inputsDir, 'project-context.json');
    await Promise.all([
      writeJson(visualAnalysisPath, options.visualAnalysis),
      writeJson(projectContextPath, options.projectContext)
    ]);

    const createdAt = new Date().toISOString();
    const base: ReferenceTranslationRunRecord = {
      id: runId,
      status: 'failed',
      createdAt,
      cacheHit: false,
      visualAnalysisFilename: options.visualAnalysisLabel,
      projectContextFilename: options.projectContextLabel,
      preference,
      lastError: null
    };

    try {
      const outcome = await runReferenceTranslation({
        visualAnalysisPath,
        projectContextPath,
        outputPath: await profilePath(runId),
        preference,
        force: Boolean(options.force)
      });
      const profile = outcome.profile as ReferenceTranslationProfile;
      const record: ReferenceTranslationRunRecord = {
        ...base,
        status: 'completed',
        completedAt: outcome.run.completed_at,
        durationMs: outcome.run.duration_ms,
        cacheHit: Boolean(outcome.run.cache_hit),
        completeness: profile.referenceIdentity.completeness,
        consistency: profile.referenceIdentity.consistency,
        matrixCount: profile.projectTranslationMatrix.length,
        prohibitedCount: profile.transferability.prohibitedToCopy.length
      };
      await writeJson(await recordPath(runId), record);
      return { run: record, profile };
    } catch (error) {
      const record: ReferenceTranslationRunRecord = {
        ...base,
        completedAt: new Date().toISOString(),
        lastError: (error as Error).message
      };
      await writeJson(await recordPath(runId), record).catch(() => {});
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
      preference: input.preference,
      force: input.force
    });
  }

  async function runUserInput(input: StartReferenceTranslationUserInput): Promise<ReferenceTranslationResult> {
    if (!dependencies) throw new Error('正式用户流程尚未连接项目分析服务');
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

    let currentProject = existingProject || await dependencies.projects.create({
      sourcePaths: currentProjectSourcePaths,
      apiProfileId
    });
    let currentPaths = await dependencies.projects.paths(currentProject.id);
    const existingReportAvailable = currentProject.lastReportFilename
      ? await fs.stat(path.join(currentPaths.outputs, currentProject.lastReportFilename))
        .then((stat) => stat.isFile())
        .catch(() => false)
      : false;
    if (currentProject.status !== 'completed' || !existingReportAvailable) {
      const result = await dependencies.pipeline.start(currentProject.id, true, apiProfileId);
      currentProject = result.project;
      currentPaths = await dependencies.projects.paths(currentProject.id);
    }

    const currentReport = currentProject.lastReportFilename
      ? await fs.readFile(path.join(currentPaths.outputs, currentProject.lastReportFilename), 'utf8')
      : '';

    let referenceProjectId: string | null = null;
    try {
      const referenceProject = await dependencies.projects.create({
        sourcePaths: referenceAssetPaths,
        apiProfileId
      });
      referenceProjectId = referenceProject.id;
      const referenceResult = await dependencies.pipeline.start(referenceProject.id, true, apiProfileId);
      const referencePaths = await dependencies.projects.paths(referenceProject.id);
      const referenceReport = await fs.readFile(referenceResult.reportPath, 'utf8');
      const referenceVisualAnalysis = {
        schema_version: 'reference-visual-analysis-v1',
        source_role: 'reference_project',
        detectedIndustry: referenceResult.project.industry,
        assetCount: referenceResult.assetCount,
        assets: referenceResult.project.assets.map((asset) => ({
          filename: asset.originalName,
          mimeType: asset.mimeType,
          sha256: asset.sha256
        })),
        visualAssetEvidence: {
          analysis: reportObservations(referenceReport, path.basename(referenceResult.reportPath))
        }
      };
      const projectContext = {
        schema_version: 'project-context-v1',
        projectId: currentProject.id,
        brandIdentity: {
          brandName: currentProject.brandName || currentProject.detectedBrandName,
          industry: currentProject.industry || currentProject.detectedIndustry
        },
        projectFacts: {
          projectName: currentProject.projectName,
          description: currentProject.description,
          lockedFacts: currentProject.lockedFacts,
          analysisStatus: currentProject.status
        },
        lockedAssets: [
          ...(currentProject.logoLocked ? ['当前项目原始 Logo'] : []),
          ...currentProject.logoFiles
        ],
        brandAnalysis: reportObservations(
          currentReport,
          currentProject.lastReportFilename || 'project-analysis'
        )
      };
      return await runWithStructuredInputs({
        visualAnalysis: referenceVisualAnalysis,
        projectContext,
        visualAnalysisLabel: `${referenceAssetPaths.length} 个参考资产`,
        projectContextLabel: currentProject.projectName,
        preference: input.preference,
        force: input.force
      });
    } finally {
      if (referenceProjectId) await dependencies.projects.remove(referenceProjectId).catch(() => {});
    }
  }

  async function remove(runId: string): Promise<void> {
    const root = await runRoot(runId);
    await fs.rm(root, { recursive: true, force: true });
  }

  return { listRuns, getRun, getProfile, run, runUserInput, remove, runRoot };
}
