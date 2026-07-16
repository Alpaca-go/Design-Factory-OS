import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import type {
  AssetItem, AssetSummary, CreateProjectInput, ImportResult, ProjectRecord, PublicSettings
} from '../shared/types';
import { assertInside, sanitizeFilenamePart } from './analysis-contract';

const SUPPORTED_DIRECT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.zip', '.md', '.txt', '.json']);
const SUPPORTED_ZIP_ENTRY = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.md', '.txt', '.json']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_ZIP_ENTRIES = 2_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;

export type SettingsReader = () => Promise<PublicSettings>;

function projectFile(projectRoot: string): string {
  return path.join(projectRoot, 'project.json');
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
    return JSON.parse(await fs.readFile(projectFile(projectRoot), 'utf8')) as ProjectRecord;
  }

  async function writeProject(projectRoot: string, record: ProjectRecord): Promise<ProjectRecord> {
    record.updatedAt = new Date().toISOString();
    await fs.writeFile(projectFile(projectRoot), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return record;
  }

  async function create(input: CreateProjectInput): Promise<ProjectRecord> {
    if (!input.projectName.trim()) throw new Error('项目名称不能为空');
    if (!input.brandName.trim()) throw new Error('品牌名称不能为空');
    if (!input.industry.trim()) throw new Error('行业属性必须由用户确认');
    const settings = await readSettings();
    const id = crypto.randomUUID();
    const directory = `${sanitizeFilenamePart(input.projectName)}-${id.slice(0, 8)}`;
    const root = assertInside(await projectsRoot(), path.join(await projectsRoot(), directory));
    await Promise.all(['input', 'prepared', 'outputs', 'runtime'].map((folder) => fs.mkdir(path.join(root, folder), { recursive: true })));
    const now = new Date().toISOString();
    const record: ProjectRecord = {
      id,
      projectName: input.projectName.trim(),
      brandName: input.brandName.trim(),
      industry: input.industry.trim(),
      description: input.description.trim(),
      logoLocked: input.logoLocked,
      lockedFacts: input.lockedFacts.map((item) => item.trim()).filter(Boolean),
      outputLanguage: input.outputLanguage,
      provider: settings.provider,
      model: settings.model,
      analysisProfile: 'fusion-enhanced',
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
      briefFiles: []
    };
    return writeProject(root, record);
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

  async function uniqueDestination(directory: string, filename: string): Promise<string> {
    const parsed = path.parse(filename);
    let candidate = path.join(directory, sanitizeFilenamePart(filename));
    for (let index = 2; await fs.stat(candidate).then(() => true).catch(() => false); index += 1) {
      candidate = path.join(directory, `${sanitizeFilenamePart(parsed.name)}-${index}${parsed.ext.toLowerCase()}`);
    }
    return candidate;
  }

  async function extractZip(zipPath: string, destination: string): Promise<{ extracted: string[]; skipped: string[] }> {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    if (entries.length > MAX_ZIP_ENTRIES) throw new Error(`ZIP 文件条目过多（${entries.length}），上限为 ${MAX_ZIP_ENTRIES}`);
    const total = entries.reduce((sum, entry) => sum + Number(entry.header.size || 0), 0);
    if (total > MAX_ZIP_UNCOMPRESSED_BYTES) throw new Error('ZIP 解压后体积超过 2 GB 安全上限');
    const extracted: string[] = [];
    const skipped: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const normalized = entry.entryName.replaceAll('\\', '/');
      const extension = path.extname(normalized).toLowerCase();
      if (!SUPPORTED_ZIP_ENTRY.has(extension) || normalized.includes('\0')) {
        skipped.push(entry.entryName);
        continue;
      }
      const target = assertInside(destination, path.join(destination, ...normalized.split('/')));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, entry.getData());
      extracted.push(path.relative(destination, target).replaceAll('\\', '/'));
    }
    return { extracted, skipped };
  }

  async function scan(projectId: string): Promise<AssetSummary> {
    const root = await rootForId(projectId);
    const input = path.join(root, 'input');
    const items: AssetItem[] = [];
    const unreadableFiles: string[] = [];
    async function walk(directory: string): Promise<void> {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) { await walk(absolute); continue; }
        const extension = path.extname(entry.name).toLowerCase();
        const stat = await fs.stat(absolute);
        const relativePath = path.relative(input, absolute).replaceAll('\\', '/');
        const item: AssetItem = {
          relativePath,
          name: entry.name,
          extension,
          bytes: stat.size,
          kind: IMAGE_EXTENSIONS.has(extension) ? 'image'
            : extension === '.pdf' ? 'pdf'
              : extension === '.zip' ? 'zip'
                : ['.md', '.txt', '.json'].includes(extension) ? 'document' : 'unsupported'
        };
        if (item.kind === 'image' && items.filter((candidate) => candidate.thumbnailDataUrl).length < 24) {
          try {
            const thumbnail = await sharp(absolute).rotate().resize({ width: 240, height: 160, fit: 'cover' }).jpeg({ quality: 72 }).toBuffer();
            item.thumbnailDataUrl = `data:image/jpeg;base64,${thumbnail.toString('base64')}`;
          } catch {
            item.warning = '图片损坏或无法读取';
            unreadableFiles.push(relativePath);
          }
        }
        items.push(item);
      }
    }
    await walk(input);
    const project = await readProject(root);
    const summary: AssetSummary = {
      totalFiles: items.length,
      totalBytes: items.reduce((sum, item) => sum + item.bytes, 0),
      imageCount: items.filter((item) => item.kind === 'image').length,
      pdfCount: items.filter((item) => item.kind === 'pdf').length,
      zipCount: items.filter((item) => item.kind === 'zip').length,
      logoDetected: project.logoFiles.length > 0 || items.some((item) => /logo|标志|标识/i.test(item.name)),
      unreadableFiles,
      items
    };
    await update(projectId, {
      assetCount: summary.totalFiles,
      imageCount: summary.imageCount,
      status: summary.totalFiles ? 'ready' : 'draft'
    });
    return summary;
  }

  async function importFiles(projectId: string, paths: string[], kind: 'assets' | 'logo' | 'brief'): Promise<ImportResult> {
    const root = await rootForId(projectId);
    const input = path.join(root, 'input');
    const project = await readProject(root);
    const imported: string[] = [];
    const extracted: string[] = [];
    const skipped: string[] = [];
    const logoFiles = [...project.logoFiles];
    const briefFiles = [...project.briefFiles];
    for (const supplied of paths) {
      const source = path.resolve(supplied);
      const stat = await fs.stat(source).catch(() => null);
      const extension = path.extname(source).toLowerCase();
      if (!stat?.isFile() || !SUPPORTED_DIRECT.has(extension)) { skipped.push(path.basename(source)); continue; }
      if (extension === '.zip') {
        const zipDestination = path.join(input, 'extracted', sanitizeFilenamePart(path.parse(source).name));
        await fs.mkdir(zipDestination, { recursive: true });
        const result = await extractZip(source, zipDestination);
        extracted.push(...result.extracted.map((item) => `extracted/${sanitizeFilenamePart(path.parse(source).name)}/${item}`));
        skipped.push(...result.skipped);
        continue;
      }
      const folder = kind === 'logo' ? path.join(input, 'logo') : kind === 'brief' ? path.join(input, 'brief') : input;
      await fs.mkdir(folder, { recursive: true });
      const destination = await uniqueDestination(folder, path.basename(source));
      await fs.copyFile(source, destination);
      const relative = path.relative(input, destination).replaceAll('\\', '/');
      imported.push(relative);
      if (kind === 'logo') logoFiles.push(relative);
      if (kind === 'brief') briefFiles.push(relative);
    }
    await update(projectId, { logoFiles: [...new Set(logoFiles)], briefFiles: [...new Set(briefFiles)] });
    return { imported, extracted, skipped, summary: await scan(projectId) };
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

  return { create, list, get, update, scan, importFiles, remove, paths };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
