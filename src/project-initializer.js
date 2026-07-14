import fs from 'node:fs/promises';
import path from 'node:path';
import { assertSafeProjectRoot, DEFAULT_PROJECTS_ROOT } from './project-paths.js';

const RESERVED = new Set(['input', 'outputs', 'masterpiece-os.json', '.gitkeep']);
const SYSTEM_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

function ignoredEntry(name) {
  return name.startsWith('.') || name.startsWith('~$') || SYSTEM_FILES.has(name);
}

async function exists(target) {
  try { await fs.lstat(target); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function directoryEmpty(target) {
  return (await fs.readdir(target)).length === 0;
}

function relativePortable(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

export class ProjectInitializationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProjectInitializationError';
    Object.assign(this, { moved: [], pending: [], conflicts: [], ...details });
  }
}

export async function initializeProject(projectRoot, options = {}) {
  const projectsRoot = path.resolve(options.projectsRoot || DEFAULT_PROJECTS_ROOT);
  const resolvedProjectRoot = await assertSafeProjectRoot(projectRoot, projectsRoot);
  const projectName = path.basename(resolvedProjectRoot);
  const inputDir = path.join(resolvedProjectRoot, 'input');
  const outputsDir = path.join(resolvedProjectRoot, 'outputs');
  const legacyInputDir = path.join(resolvedProjectRoot, 'inputs');
  const created = [];
  if (!await exists(inputDir)) created.push(relativePortable(projectsRoot, inputDir) + '/');
  if (!await exists(outputsDir)) created.push(relativePortable(projectsRoot, outputsDir) + '/');
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });

  const rootEntries = await fs.readdir(resolvedProjectRoot, { withFileTypes: true });
  const operations = [];
  for (const entry of rootEntries) {
    if (RESERVED.has(entry.name) || entry.name === 'inputs' || ignoredEntry(entry.name)) continue;
    operations.push({ source: path.join(resolvedProjectRoot, entry.name), target: path.join(inputDir, entry.name), display: entry.name });
  }

  // v1.0 早期项目曾使用 inputs/；安全迁移其内容到标准 input/，不打散子目录。
  if (await exists(legacyInputDir)) {
    const legacyEntries = await fs.readdir(legacyInputDir, { withFileTypes: true });
    for (const entry of legacyEntries) {
      if (ignoredEntry(entry.name)) continue;
      operations.push({ source: path.join(legacyInputDir, entry.name), target: path.join(inputDir, entry.name), display: `inputs/${entry.name}` });
    }
  }

  const conflicts = [];
  const plannedTargets = new Set();
  for (const operation of operations) {
    const targetKey = process.platform === 'win32' ? operation.target.toLowerCase() : operation.target;
    if (plannedTargets.has(targetKey) || await exists(operation.target)) conflicts.push(relativePortable(projectsRoot, operation.target));
    plannedTargets.add(targetKey);
  }
  if (conflicts.length) {
    throw new ProjectInitializationError(
      `项目初始化失败。\n\n以下路径在 input 中已存在：\n${conflicts.map((item) => `- ${item}`).join('\n')}\n\n系统未覆盖任何文件，请人工解决冲突后重新运行。`,
      { conflicts, pending: operations.map((item) => item.display) }
    );
  }

  const moved = [];
  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index];
    try {
      await fs.rename(operation.source, operation.target);
      moved.push(operation.display);
    } catch (error) {
      const pending = operations.slice(index).map((item) => item.display);
      throw new ProjectInitializationError(
        `项目初始化移动失败：${operation.display}\n${error.message}\n\n已移动：${moved.length ? moved.join('、') : '无'}\n未移动：${pending.length ? pending.join('、') : '无'}`,
        { moved, pending, cause: error }
      );
    }
  }

  if (await exists(legacyInputDir) && await directoryEmpty(legacyInputDir)) await fs.rmdir(legacyInputDir);
  return {
    projectName, projectRoot: resolvedProjectRoot, inputDir, outputsDir,
    moved, skipped: rootEntries.filter((entry) => RESERVED.has(entry.name) || ignoredEntry(entry.name)).map((entry) => entry.name),
    conflicts: [], created, initialized: created.length > 0 || moved.length > 0
  };
}

export function formatInitializationSummary(result) {
  if (!result.initialized) {
    return `项目已符合标准结构：${result.projectName}\n输入目录：${result.inputDir}\n输出目录：${result.outputsDir}\n开始分析。`;
  }
  return `项目初始化完成：${result.projectName}\n\n已创建：\n${result.created.length ? result.created.map((item) => `- ${item}`).join('\n') : '- 无（目录已存在）'}\n\n已移动到 input：\n${result.moved.length ? result.moved.map((item) => `- ${item}`).join('\n') : '- 无'}\n\n即将开始分析：\n${result.inputDir}`;
}
