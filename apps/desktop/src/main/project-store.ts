import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import type {
  AssetItem,
  AssetSummary,
  BrandStrategyCorpus,
  CreateProjectInput,
  DocumentImportResult,
  DocumentItem,
  DocumentSummary,
  ImportResult,
  NormalizedDocument,
  ProjectAsset,
  ProjectDocument,
  ProjectRecord,
  PublicSettings
} from '../shared/types';
import { assertInside, sanitizeFilenamePart } from './analysis-contract.ts';
import { buildBrandStrategyCorpus, parseBrandDocument } from './document-processing.ts';
import { detectIntakeIdentity, type IntakeSource } from './project-intake.ts';

const SUPPORTED_DIRECT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.zip']);
const SUPPORTED_ASSET = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const SUPPORTED_DOCUMENTS = new Set(['.pdf', '.docx', '.md', '.markdown', '.txt']);
const MAX_ZIP_ENTRIES = 2_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_IMPORTED_FILES = 2_000;

export type SettingsReader = () => Promise<PublicSettings>;

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
};

const DOCUMENT_MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain'
};

const GENERIC_DOCUMENT_NAMES = new Set([
  '品牌策划案', '品牌方案', '前期策划', '项目方案', '策划方案', '方案终稿',
  '最终版', '新建文档', '未命名', 'input', 'project', 'document'
]);

function brandTimestampName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `品牌项目-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function brandTemporaryName(sourcePaths: string[]): string {
  for (const supplied of sourcePaths) {
    const stem = path.parse(supplied).name
      .replace(/(?:品牌策划案|品牌方案|前期策划|项目方案|策划方案|方案终稿|最终版)$/i, '')
      .replace(/^[\s._\-—–()（）【】\[\]0-9]+|[\s._\-—–()（）【】\[\]0-9]+$/g, '')
      .trim();
    if (stem.length >= 2 && !GENERIC_DOCUMENT_NAMES.has(stem.toLowerCase())) return stem;
  }
  return brandTimestampName();
}

function normalizeProjectRecord(record: ProjectRecord): ProjectRecord {
  return {
    ...record,
    detectedProjectName: record.detectedProjectName || record.projectName,
    projectNameSource: record.projectNameSource || 'common-file-prefix',
    projectNameConfidence: record.projectNameConfidence ?? record.factConfidence?.brandName ?? 0,
    detectedBrandName: record.detectedBrandName || record.brandName || record.projectName,
    detectedIndustry: record.detectedIndustry || record.industry || '待确认（基于现有素材推断）',
    factConfidence: record.factConfidence || {
      brandName: record.brandName ? 1 : 0,
      industry: record.industry ? 1 : 0
    },
    apiProfileId: record.apiProfileId || null,
    mode: record.mode || 'visual-evolution',
    logoLocked: record.logoLocked !== false,
    outputLanguage: 'zh-CN',
    analysisProfile: record.mode === 'brand-dna' ? 'brand-dna' : 'fusion-enhanced',
    reasoningQualityTier: record.reasoningQualityTier || 'experimental',
    assets: Array.isArray(record.assets) ? record.assets : [],
    documents: Array.isArray(record.documents) ? record.documents : []
  };
}

function projectFile(projectRoot: string): string {
  return path.join(projectRoot, 'project.json');
}

function hashBuffer(value: Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function hashFile(filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsSync.createReadStream(filename);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function createProjectStore(readSettings: SettingsReader) {
  async function dataRoot(): Promise<string> {
    const settings = await readSettings();
    const root = path.resolve(settings.defaultDataPath);
    await fs.mkdir(path.join(root, 'projects'), { recursive: true });
    return root;
  }

  async function projectsRoot(): Promise<string> {
    return path.join(await dataRoot(), 'projects');
  }

  async function rootForId(projectId: string): Promise<string> {
    if (!/^[a-f0-9-]{36}$/i.test(projectId)) throw new Error('项目 ID 无效');
    const root = await projectsRoot();
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(root, entry.name);
      try {
        const record = JSON.parse(await fs.readFile(projectFile(candidate), 'utf8')) as ProjectRecord;
        if (record.id === projectId) return candidate;
      } catch { /* skip malformed folders in list/search */ }
    }
    throw new Error('项目不存在');
  }

  async function readProject(projectRoot: string): Promise<ProjectRecord> {
    return normalizeProjectRecord(JSON.parse(await fs.readFile(projectFile(projectRoot), 'utf8')) as ProjectRecord);
  }

  async function writeProject(projectRoot: string, record: ProjectRecord): Promise<ProjectRecord> {
    record.updatedAt = new Date().toISOString();
    await fs.writeFile(projectFile(projectRoot), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return record;
  }

  async function inspectSources(sourcePaths: string[]): Promise<{ sources: IntakeSource[]; labels: string[] }> {
    const sources: IntakeSource[] = [];
    const labels: string[] = [];
    for (const supplied of [...new Set(sourcePaths.map((item) => path.resolve(item)))]) {
      const stat = await fs.stat(supplied).catch(() => null);
      if (!stat || (!stat.isFile() && !stat.isDirectory())) continue;
      sources.push({ sourcePath: supplied, isDirectory: stat.isDirectory() });
      labels.push(path.basename(supplied));
      if (stat.isDirectory()) {
        const pending = [supplied];
        while (pending.length && labels.length < 500) {
          const directory = pending.shift()!;
          for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()) pending.push(target);
            else labels.push(entry.name);
            if (labels.length >= 500) break;
          }
        }
      } else if (path.extname(supplied).toLowerCase() === '.zip') {
        try {
          labels.push(...new AdmZip(supplied).getEntries().slice(0, 500).map((entry) => entry.entryName));
        } catch {
          throw new Error(`压缩包解压失败，未加入分析素材：${path.basename(supplied)}`);
        }
      }
    }
    if (!sources.length) throw new Error('请选择至少一个可读取的视觉方案文件或文件夹');
    return { sources, labels };
  }

  async function create(input: CreateProjectInput): Promise<ProjectRecord> {
    const mode = input.mode || 'visual-evolution';
    const intake = await inspectSources(input.sourcePaths);
    const identity = mode === 'brand-dna'
      ? {
          projectName: brandTemporaryName(input.sourcePaths),
          projectNameSource: 'common-file-prefix' as const,
          detectedBrandName: brandTemporaryName(input.sourcePaths),
          detectedIndustry: '待确认（基于策划文档提取）',
          factConfidence: { brandName: 0.35, industry: 0 }
        }
      : detectIntakeIdentity(intake.sources, intake.labels);
    const settings = await readSettings();
    const profile = settings.profiles.find((item) => item.id === input.apiProfileId && item.isEnabled);
    if (!profile) throw new Error('请选择一个已启用的 API Profile');
    const id = crypto.randomUUID();
    const directory = `${sanitizeFilenamePart(identity.projectName)}-${id.slice(0, 8)}`;
    const root = assertInside(await projectsRoot(), path.join(await projectsRoot(), directory));
    await Promise.all(['input/assets', 'input/documents', 'prepared', 'outputs', 'runtime'].map((folder) => fs.mkdir(path.join(root, folder), { recursive: true })));
    const now = new Date().toISOString();
    const record: ProjectRecord = {
      id,
      mode,
      projectName: identity.projectName,
      detectedProjectName: identity.projectName,
      projectNameSource: identity.projectNameSource,
      projectNameConfidence: identity.factConfidence.brandName,
      brandName: identity.detectedBrandName,
      industry: identity.detectedIndustry,
      detectedBrandName: identity.detectedBrandName,
      detectedIndustry: identity.detectedIndustry,
      factConfidence: identity.factConfidence,
      description: mode === 'brand-dna'
        ? '基于已上传的品牌策划文档提取事实、建立品牌 DNA、诊断战略问题并生成创意转译与 GPT 生图任务。'
        : '基于已上传的视觉方案完成融合增强分析；品牌与行业信息由素材线索自动识别，低置信度事实必须标记为待确认。',
      logoLocked: true,
      lockedFacts: [
        '原始 Logo Locked：不得修改、重绘、拆解、替换、仿造或改变内部字形。',
        '输出语言固定为简体中文。'
      ],
      outputLanguage: 'zh-CN',
      provider: profile.provider,
      model: profile.modelId,
      apiProfileId: profile.id,
      analysisProfile: mode === 'brand-dna' ? 'brand-dna' : 'fusion-enhanced',
      reasoningQualityTier: profile.qualityTier || 'experimental',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      lastDurationMs: null,
      assetCount: 0,
      imageCount: 0,
      lastReportFilename: null,
      lastError: null,
      logoFiles: [],
      briefFiles: [],
      assets: [],
      documents: []
    };
    await writeProject(root, record);
    try {
      if (mode === 'brand-dna') {
        const imported = await importDocuments(id, input.sourcePaths);
        if (imported.summary.parsedCount === 0) throw new Error('上传内容中未发现可解析的 PDF、DOCX、Markdown 或 TXT');
      } else {
        const imported = await importFiles(id, input.sourcePaths, 'assets');
        if (imported.summary.totalFiles === 0) throw new Error('上传内容中未发现可分析的图片或 PDF');
      }
      return get(id);
    } catch (error) {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  async function list(): Promise<ProjectRecord[]> {
    const root = await projectsRoot();
    const entries = await fs.readdir(root, { withFileTypes: true });
    const records = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try { return await readProject(path.join(root, entry.name)); } catch { return null; }
    }));
    return records.filter((item): item is ProjectRecord => Boolean(item))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async function get(projectId: string): Promise<ProjectRecord> {
    return readProject(await rootForId(projectId));
  }

  async function update(projectId: string, changes: Partial<ProjectRecord>): Promise<ProjectRecord> {
    const root = await rootForId(projectId);
    const current = await readProject(root);
    return writeProject(root, { ...current, ...changes, id: current.id });
  }

  async function invalidatePrepared(projectRoot: string): Promise<void> {
    const prepared = assertInside(projectRoot, path.join(projectRoot, 'prepared'));
    await fs.rm(prepared, { recursive: true, force: true });
    await fs.mkdir(prepared, { recursive: true });
  }

  async function invalidateReport(projectRoot: string, project: ProjectRecord): Promise<void> {
    if (!project.lastReportFilename) return;
    const outputs = assertInside(projectRoot, path.join(projectRoot, 'outputs'));
    const report = assertInside(outputs, path.join(outputs, path.basename(project.lastReportFilename)));
    await fs.rm(report, { force: true });
  }

  async function importFiles(projectId: string, paths: string[], _kind: 'assets' | 'logo' | 'brief'): Promise<ImportResult> {
    const root = await rootForId(projectId);
    const input = path.join(root, 'input');
    const assetsRoot = path.join(input, 'assets');
    await fs.mkdir(assetsRoot, { recursive: true });
    const project = await readProject(root);
    const assets = [...project.assets.filter((asset) => asset.status === 'ready')];
    const knownHashes = new Set(assets.map((asset) => asset.sha256));
    const imported: string[] = [];
    const extracted: string[] = [];
    const skipped: string[] = [];
    const createdFiles: string[] = [];

    async function persistAsset(options: {
      buffer?: Buffer;
      sourcePath?: string;
      originalName: string;
      batchId: string;
      sourceType: ProjectAsset['sourceType'];
      archiveSourceName?: string;
    }): Promise<boolean> {
      const extension = path.extname(options.originalName).toLowerCase();
      if (!SUPPORTED_ASSET.has(extension)) {
        skipped.push(options.originalName);
        return false;
      }
      const sha256 = options.buffer ? hashBuffer(options.buffer) : await hashFile(options.sourcePath!);
      if (knownHashes.has(sha256)) {
        skipped.push(`${options.originalName}（重复）`);
        return false;
      }
      const id = crypto.randomUUID();
      const filename = `${id}${extension === '.jpeg' ? '.jpg' : extension}`;
      const destination = assertInside(input, path.join(assetsRoot, filename));
      if (options.buffer) await fs.writeFile(destination, options.buffer);
      else await fs.copyFile(options.sourcePath!, destination);
      createdFiles.push(destination);
      const stat = await fs.stat(destination);
      const record: ProjectAsset = {
        id,
        batchId: options.batchId,
        sourceType: options.sourceType,
        originalName: path.basename(options.originalName),
        relativePath: path.relative(input, destination).replaceAll('\\', '/'),
        mimeType: MIME_TYPES[extension] || 'application/octet-stream',
        sizeBytes: stat.size,
        sha256,
        status: 'ready',
        archiveSourceName: options.archiveSourceName
      };
      assets.push(record);
      knownHashes.add(sha256);
      imported.push(record.relativePath);
      if (options.sourceType === 'archive-extracted') extracted.push(record.relativePath);
      return true;
    }

    async function importZip(source: string, batchId: string): Promise<void> {
      let zip: AdmZip;
      try { zip = new AdmZip(source); }
      catch { throw new Error(`压缩包解压失败，未加入分析素材：${path.basename(source)}`); }
      const entries = zip.getEntries();
      if (entries.length > MAX_ZIP_ENTRIES) throw new Error(`ZIP 文件条目过多（${entries.length}），上限为 ${MAX_ZIP_ENTRIES}`);
      const total = entries.reduce((sum, entry) => sum + Number(entry.header.size || 0), 0);
      if (total > MAX_ZIP_UNCOMPRESSED_BYTES) throw new Error('ZIP 解压后体积超过 2 GB 安全上限');
      let validEntries = 0;
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const normalized = entry.entryName.replaceAll('\\', '/');
        const extension = path.extname(normalized).toLowerCase();
        if (!SUPPORTED_ASSET.has(extension) || normalized.includes('\0')) {
          skipped.push(entry.entryName);
          continue;
        }
        if (normalized.split('/').some((part) => part === '..')) throw new Error('ZIP 包含路径穿越风险，未加入分析素材');
        let value: Buffer;
        try { value = entry.getData(); }
        catch { throw new Error(`压缩包可能已损坏或受密码保护：${path.basename(source)}`); }
        validEntries += 1;
        await persistAsset({
          buffer: value,
          originalName: path.basename(normalized),
          batchId,
          sourceType: 'archive-extracted',
          archiveSourceName: path.basename(source)
        });
      }
      if (!validEntries) throw new Error(`压缩包解压后没有有效的 JPG、PNG、WEBP 或 PDF：${path.basename(source)}`);
    }

    async function directoryFiles(directory: string): Promise<string[]> {
      const files: string[] = [];
      const pending = [directory];
      while (pending.length) {
        const current = pending.shift()!;
        for (const entry of await fs.readdir(current, { withFileTypes: true })) {
          const target = path.join(current, entry.name);
          if (entry.isDirectory()) pending.push(target);
          else files.push(target);
          if (files.length > MAX_IMPORTED_FILES) throw new Error(`文件夹内文件超过 ${MAX_IMPORTED_FILES} 个安全上限`);
        }
      }
      return files;
    }

    try {
      for (const supplied of paths) {
        const source = path.resolve(supplied);
        const stat = await fs.stat(source).catch(() => null);
        if (!stat || (!stat.isFile() && !stat.isDirectory())) {
          skipped.push(path.basename(source));
          continue;
        }
        const batchId = crypto.randomUUID();
        if (stat.isDirectory()) {
          for (const file of await directoryFiles(source)) {
            const extension = path.extname(file).toLowerCase();
            if (extension === '.zip') await importZip(file, batchId);
            else if (SUPPORTED_DIRECT.has(extension)) {
              await persistAsset({
                sourcePath: file,
                originalName: path.basename(file),
                batchId,
                sourceType: 'folder'
              });
            } else skipped.push(path.relative(source, file).replaceAll('\\', '/'));
          }
        } else if (path.extname(source).toLowerCase() === '.zip') {
          await importZip(source, batchId);
        } else if (SUPPORTED_DIRECT.has(path.extname(source).toLowerCase())) {
          await persistAsset({
            sourcePath: source,
            originalName: path.basename(source),
            batchId,
            sourceType: 'file'
          });
        } else skipped.push(path.basename(source));
      }
    } catch (error) {
      await Promise.all(createdFiles.map((filename) => fs.rm(filename, { force: true }).catch(() => {})));
      throw error;
    }

    await invalidateReport(root, project);
    await writeProject(root, {
      ...project,
      assets,
      status: assets.length ? 'ready' : 'draft',
      lastReportFilename: null,
      lastError: null
    });
    await invalidatePrepared(root);
    await reidentifyProject(projectId);
    return { imported, extracted, skipped, summary: await scan(projectId) };
  }

  async function importDocuments(projectId: string, paths: string[]): Promise<DocumentImportResult> {
    const root = await rootForId(projectId);
    const project = await readProject(root);
    if (project.mode !== 'brand-dna') throw new Error('当前项目不是品牌 DNA 分析模式');
    const input = path.join(root, 'input');
    const documentsRoot = path.join(input, 'documents');
    await fs.mkdir(documentsRoot, { recursive: true });
    const documents = [...project.documents.filter((document) => document.status === 'ready')];
    const knownHashes = new Set(documents.map((document) => document.sha256));
    const imported: string[] = [];
    const skipped: string[] = [];
    const createdFiles: string[] = [];

    async function collect(directory: string): Promise<string[]> {
      const result: string[] = [];
      const pending = [directory];
      while (pending.length) {
        const current = pending.shift()!;
        for (const entry of await fs.readdir(current, { withFileTypes: true })) {
          const target = path.join(current, entry.name);
          if (entry.isDirectory()) pending.push(target);
          else result.push(target);
          if (result.length > MAX_IMPORTED_FILES) throw new Error(`文件夹内文件超过 ${MAX_IMPORTED_FILES} 个安全上限`);
        }
      }
      return result;
    }

    async function persist(source: string): Promise<void> {
      const extension = path.extname(source).toLowerCase();
      if (!SUPPORTED_DOCUMENTS.has(extension)) {
        skipped.push(path.basename(source));
        return;
      }
      const sha256 = await hashFile(source);
      if (knownHashes.has(sha256)) {
        skipped.push(`${path.basename(source)}（重复）`);
        return;
      }
      const id = crypto.randomUUID();
      const destination = assertInside(input, path.join(documentsRoot, `${id}${extension === '.markdown' ? '.md' : extension}`));
      await fs.copyFile(source, destination);
      createdFiles.push(destination);
      const stat = await fs.stat(destination);
      documents.push({
        id,
        originalName: path.basename(source),
        relativePath: path.relative(input, destination).replaceAll('\\', '/'),
        mimeType: DOCUMENT_MIME_TYPES[extension] || 'application/octet-stream',
        sizeBytes: stat.size,
        sha256,
        sourceType: extension === '.pdf' ? 'pdf' : extension === '.docx' ? 'docx' : extension === '.txt' ? 'text' : 'markdown',
        status: 'ready',
        parseStatus: 'pending',
        parseWarnings: []
      });
      knownHashes.add(sha256);
      imported.push(path.relative(input, destination).replaceAll('\\', '/'));
    }

    try {
      for (const supplied of paths) {
        const source = path.resolve(supplied);
        const stat = await fs.stat(source).catch(() => null);
        if (!stat) {
          skipped.push(path.basename(source));
          continue;
        }
        if (stat.isDirectory()) {
          for (const filename of await collect(source)) await persist(filename);
        } else if (stat.isFile()) {
          await persist(source);
        }
      }
    } catch (error) {
      await Promise.all(createdFiles.map((filename) => fs.rm(filename, { force: true }).catch(() => {})));
      throw error;
    }

    await invalidateReport(root, project);
    await writeProject(root, {
      ...project,
      documents,
      status: documents.length ? 'ready' : 'draft',
      lastReportFilename: null,
      lastError: null
    });
    await invalidatePrepared(root);
    return { imported, skipped, summary: await scanDocuments(projectId) };
  }

  function usableDocumentTitle(value: string): boolean {
    const cleaned = value.trim().replace(/\.(?:pdf|docx|md|markdown|txt)$/i, '');
    return cleaned.length >= 2 && !GENERIC_DOCUMENT_NAMES.has(cleaned.toLowerCase());
  }

  async function scanDocuments(projectId: string, abortSignal?: AbortSignal): Promise<DocumentSummary> {
    const root = await rootForId(projectId);
    const input = path.join(root, 'input');
    const preparedRoot = path.join(root, 'prepared', 'documents');
    await fs.mkdir(preparedRoot, { recursive: true });
    const project = await readProject(root);
    const updatedDocuments: ProjectDocument[] = [];
    const items: DocumentItem[] = [];
    const titles: Array<{ title: string; sourceType: ProjectDocument['sourceType'] }> = [];
    for (const document of project.documents.filter((item) => item.status === 'ready')) {
      if (abortSignal?.aborted) throw new DOMException('用户主动取消', 'AbortError');
      const absolute = assertInside(input, path.join(input, document.relativePath));
      const stat = await fs.stat(absolute).catch(() => null);
      if (!stat?.isFile()) continue;
      const cachePath = assertInside(preparedRoot, path.join(preparedRoot, `${document.id}.json`));
      let normalized: NormalizedDocument;
      try {
        const cached = await fs.readFile(cachePath, 'utf8')
          .then((value) => JSON.parse(value) as { sha256: string; document: Awaited<ReturnType<typeof parseBrandDocument>> })
          .catch(() => null);
        normalized = cached?.sha256 === document.sha256 ? cached.document : await parseBrandDocument(absolute);
        if (abortSignal?.aborted) throw new DOMException('用户主动取消', 'AbortError');
        normalized.id = document.id;
        if (!cached || cached.sha256 !== document.sha256) {
          await fs.writeFile(cachePath, `${JSON.stringify({ sha256: document.sha256, document: normalized }, null, 2)}\n`, 'utf8');
        }
        const warnings = normalized.parseWarnings || [];
        const next: ProjectDocument = {
          ...document,
          sizeBytes: stat.size,
          parseStatus: warnings.length ? 'warning' : 'parsed',
          pageCount: normalized.pageCount,
          characterCount: normalized.characterCount,
          parseWarnings: warnings
        };
        updatedDocuments.push(next);
        if (normalized.title && usableDocumentTitle(normalized.title)) {
          titles.push({ title: normalized.title, sourceType: document.sourceType });
        }
      } catch (error) {
        await fs.rm(cachePath, { force: true });
        updatedDocuments.push({
          ...document,
          sizeBytes: stat.size,
          parseStatus: 'failed',
          parseWarnings: [(error as Error).message]
        });
      }
    }
    for (const document of updatedDocuments) {
      items.push({
        id: document.id,
        relativePath: document.relativePath,
        name: document.originalName,
        extension: path.extname(document.originalName).toLowerCase(),
        bytes: document.sizeBytes,
        sourceType: document.sourceType,
        parseStatus: document.parseStatus,
        pageCount: document.pageCount,
        characterCount: document.characterCount,
        parseWarnings: document.parseWarnings
      });
    }
    const summary: DocumentSummary = {
      totalFiles: items.length,
      totalBytes: items.reduce((sum, item) => sum + item.bytes, 0),
      totalPages: items.reduce((sum, item) => sum + (item.pageCount || 0), 0),
      totalCharacters: items.reduce((sum, item) => sum + (item.characterCount || 0), 0),
      parsedCount: items.filter((item) => item.parseStatus === 'parsed' || item.parseStatus === 'warning').length,
      warningCount: items.filter((item) => item.parseStatus === 'warning').length,
      failedCount: items.filter((item) => item.parseStatus === 'failed').length,
      items
    };
    const title = titles.find((item) => usableDocumentTitle(item.title));
    const shouldReplaceName = title && (project.projectName.startsWith('品牌项目-') || project.projectNameConfidence < 0.7);
    await writeProject(root, {
      ...project,
      documents: updatedDocuments,
      projectName: shouldReplaceName ? title.title : project.projectName,
      detectedProjectName: shouldReplaceName ? title.title : project.detectedProjectName,
      projectNameSource: shouldReplaceName ? (title.sourceType === 'pdf' ? 'pdf-content' : 'common-file-prefix') : project.projectNameSource,
      projectNameConfidence: shouldReplaceName ? 0.72 : project.projectNameConfidence,
      brandName: shouldReplaceName ? title.title : project.brandName,
      detectedBrandName: shouldReplaceName ? title.title : project.detectedBrandName,
      assetCount: summary.totalFiles,
      imageCount: 0,
      status: summary.parsedCount ? (project.status === 'draft' ? 'ready' : project.status) : 'draft'
    });
    return summary;
  }

  async function loadBrandCorpus(projectId: string, abortSignal?: AbortSignal): Promise<BrandStrategyCorpus> {
    const summary = await scanDocuments(projectId, abortSignal);
    if (!summary.parsedCount) throw new Error('未从文档中提取到有效文本');
    const root = await rootForId(projectId);
    const project = await readProject(root);
    const preparedRoot = path.join(root, 'prepared', 'documents');
    const normalized = [];
    for (const document of project.documents.filter((item) => item.parseStatus === 'parsed' || item.parseStatus === 'warning')) {
      if (abortSignal?.aborted) throw new DOMException('用户主动取消', 'AbortError');
      const cachePath = assertInside(preparedRoot, path.join(preparedRoot, `${document.id}.json`));
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf8')) as {
        sha256: string;
        document: Awaited<ReturnType<typeof parseBrandDocument>>;
      };
      if (cached.sha256 === document.sha256) normalized.push(cached.document);
    }
    return buildBrandStrategyCorpus(normalized);
  }

  async function removeDocuments(projectId: string, predicate: (document: ProjectDocument) => boolean): Promise<DocumentSummary> {
    const root = await rootForId(projectId);
    const input = path.join(root, 'input');
    const project = await readProject(root);
    const preparedRoot = assertInside(root, path.join(root, 'prepared', 'documents'));
    for (const document of project.documents.filter(predicate)) {
      await fs.rm(assertInside(input, path.join(input, document.relativePath)), { force: true });
      await fs.rm(assertInside(preparedRoot, path.join(preparedRoot, `${document.id}.json`)), { force: true });
    }
    await invalidateReport(root, project);
    const remaining = project.documents.filter((document) => !predicate(document));
    await writeProject(root, {
      ...project,
      documents: remaining,
      status: remaining.length ? 'ready' : 'draft',
      lastReportFilename: null,
      lastError: null
    });
    return scanDocuments(projectId);
  }

  async function removeDocument(projectId: string, documentId: string): Promise<DocumentSummary> {
    return removeDocuments(projectId, (document) => document.id === documentId);
  }

  async function clearDocuments(projectId: string): Promise<DocumentSummary> {
    return removeDocuments(projectId, () => true);
  }

  async function migrateLegacyAssets(projectId: string, root: string, project: ProjectRecord): Promise<ProjectRecord> {
    if (project.assets.length) return project;
    const input = path.join(root, 'input');
    const assetsRoot = path.join(input, 'assets');
    await fs.mkdir(assetsRoot, { recursive: true });
    const discovered: ProjectAsset[] = [];
    const hashes = new Set<string>();
    async function walk(directory: string): Promise<void> {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) { await walk(absolute); continue; }
        const extension = path.extname(entry.name).toLowerCase();
        if (extension === '.zip') {
          await fs.rm(absolute, { force: true });
          continue;
        }
        if (!SUPPORTED_ASSET.has(extension)) continue;
        const sha256 = await hashFile(absolute);
        if (hashes.has(sha256)) {
          await fs.rm(absolute, { force: true });
          continue;
        }
        hashes.add(sha256);
        const id = crypto.randomUUID();
        const destination = path.join(assetsRoot, `${id}${extension === '.jpeg' ? '.jpg' : extension}`);
        if (path.resolve(absolute) !== path.resolve(destination)) {
          await fs.copyFile(absolute, destination);
          await fs.rm(absolute, { force: true });
        }
        const stat = await fs.stat(destination);
        discovered.push({
          id,
          batchId: `legacy-${projectId}`,
          sourceType: 'file',
          originalName: entry.name,
          relativePath: path.relative(input, destination).replaceAll('\\', '/'),
          mimeType: MIME_TYPES[extension] || 'application/octet-stream',
          sizeBytes: stat.size,
          sha256,
          status: 'ready'
        });
      }
    }
    await walk(input);
    return writeProject(root, { ...project, assets: discovered });
  }

  async function reidentifyProject(projectId: string): Promise<ProjectRecord> {
    const root = await rootForId(projectId);
    const project = await readProject(root);
    const labels = project.assets
      .filter((asset) => asset.status === 'ready')
      .flatMap((asset) => [asset.originalName, asset.archiveSourceName || ''])
      .filter(Boolean);
    if (!labels.length) return project;
    const syntheticSources: IntakeSource[] = labels.map((label) => ({
      sourcePath: path.join('C:/intake', label),
      isDirectory: false
    }));
    const identity = detectIntakeIdentity(syntheticSources, labels);
    const shouldReplace = identity.factConfidence.brandName > project.projectNameConfidence
      || project.projectNameSource === 'fallback-datetime';
    return writeProject(root, {
      ...project,
      projectName: shouldReplace ? identity.projectName : project.projectName,
      detectedProjectName: shouldReplace ? identity.projectName : project.detectedProjectName,
      projectNameSource: shouldReplace ? identity.projectNameSource : project.projectNameSource,
      projectNameConfidence: shouldReplace ? identity.factConfidence.brandName : project.projectNameConfidence,
      brandName: identity.factConfidence.brandName >= project.factConfidence.brandName
        ? identity.detectedBrandName : project.brandName,
      detectedBrandName: identity.factConfidence.brandName >= project.factConfidence.brandName
        ? identity.detectedBrandName : project.detectedBrandName,
      industry: identity.factConfidence.industry >= project.factConfidence.industry
        ? identity.detectedIndustry : project.industry,
      detectedIndustry: identity.factConfidence.industry >= project.factConfidence.industry
        ? identity.detectedIndustry : project.detectedIndustry,
      factConfidence: {
        brandName: Math.max(identity.factConfidence.brandName, project.factConfidence.brandName),
        industry: Math.max(identity.factConfidence.industry, project.factConfidence.industry)
      }
    });
  }

  async function scan(projectId: string): Promise<AssetSummary> {
    const root = await rootForId(projectId);
    const input = path.join(root, 'input');
    let project = await readProject(root);
    project = await migrateLegacyAssets(projectId, root, project);
    const items: AssetItem[] = [];
    const unreadableFiles: string[] = [];
    for (const asset of project.assets.filter((item) => item.status === 'ready')) {
      const absolute = assertInside(input, path.join(input, asset.relativePath));
      const stat = await fs.stat(absolute).catch(() => null);
      if (!stat?.isFile()) continue;
      const extension = path.extname(asset.originalName).toLowerCase();
      const item: AssetItem = {
        id: asset.id,
        batchId: asset.batchId,
        sourceType: asset.sourceType,
        relativePath: asset.relativePath,
        name: asset.originalName,
        extension,
        bytes: stat.size,
        kind: IMAGE_EXTENSIONS.has(extension) ? 'image' : extension === '.pdf' ? 'pdf' : 'unsupported',
        sha256: asset.sha256,
        archiveSourceName: asset.archiveSourceName
      };
      if (item.kind === 'image' && items.filter((candidate) => candidate.thumbnailDataUrl).length < 36) {
        try {
          const thumbnail = await sharp(absolute).rotate().resize({ width: 240, height: 160, fit: 'cover' }).jpeg({ quality: 72 }).toBuffer();
          item.thumbnailDataUrl = `data:image/jpeg;base64,${thumbnail.toString('base64')}`;
        } catch {
          item.warning = '图片损坏或无法读取';
          unreadableFiles.push(item.relativePath);
        }
      }
      items.push(item);
    }
    const detectedLogoFiles = items
      .filter((item) => /logo|标志|标识|品牌字|标准字/i.test(item.name))
      .map((item) => item.relativePath);
    const detectedBriefFiles = items
      .filter((item) => /brief|说明|规范|手册|guideline|brandbook/i.test(item.name))
      .map((item) => item.relativePath);
    const summary: AssetSummary = {
      totalFiles: items.length,
      totalBytes: items.reduce((sum, item) => sum + item.bytes, 0),
      imageCount: items.filter((item) => item.kind === 'image').length,
      pdfCount: items.filter((item) => item.kind === 'pdf').length,
      logoDetected: detectedLogoFiles.length > 0,
      unreadableFiles,
      items
    };
    await writeProject(root, {
      ...project,
      assets: project.assets.filter((asset) => items.some((item) => item.id === asset.id)),
      assetCount: summary.totalFiles,
      imageCount: summary.imageCount,
      logoFiles: detectedLogoFiles,
      briefFiles: detectedBriefFiles,
      status: summary.totalFiles ? (project.status === 'draft' ? 'ready' : project.status) : 'draft'
    });
    return summary;
  }

  async function removeAssets(projectId: string, predicate: (asset: ProjectAsset) => boolean): Promise<AssetSummary> {
    const root = await rootForId(projectId);
    const input = path.join(root, 'input');
    const project = await readProject(root);
    const removed = project.assets.filter(predicate);
    for (const asset of removed) {
      const target = assertInside(input, path.join(input, asset.relativePath));
      await fs.rm(target, { force: true });
    }
    await invalidateReport(root, project);
    await writeProject(root, {
      ...project,
      assets: project.assets.filter((asset) => !predicate(asset)),
      status: project.assets.some((asset) => !predicate(asset)) ? 'ready' : 'draft',
      lastReportFilename: null,
      lastError: null
    });
    await invalidatePrepared(root);
    await reidentifyProject(projectId);
    return scan(projectId);
  }

  async function removeAsset(projectId: string, assetId: string): Promise<AssetSummary> {
    return removeAssets(projectId, (asset) => asset.id === assetId);
  }

  async function removeBatch(projectId: string, batchId: string): Promise<AssetSummary> {
    return removeAssets(projectId, (asset) => asset.batchId === batchId);
  }

  async function clearAssets(projectId: string): Promise<AssetSummary> {
    return removeAssets(projectId, () => true);
  }

  async function remove(projectId: string): Promise<void> {
    const root = await rootForId(projectId);
    const parent = await projectsRoot();
    assertInside(parent, root);
    await fs.rm(root, { recursive: true, force: false });
  }

  async function paths(projectId: string) {
    const root = await rootForId(projectId);
    return {
      root,
      input: path.join(root, 'input'),
      prepared: path.join(root, 'prepared'),
      outputs: path.join(root, 'outputs'),
      runtime: path.join(root, 'runtime')
    };
  }

  return {
    create,
    list,
    get,
    update,
    scan,
    importFiles,
    importDocuments,
    scanDocuments,
    loadBrandCorpus,
    removeAsset,
    removeBatch,
    clearAssets,
    removeDocument,
    clearDocuments,
    remove,
    paths
  };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
