import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_PROJECTS_ROOT = path.join(REPOSITORY_ROOT, 'projects');

export function validateProjectName(projectName) {
  const name = String(projectName || '').trim();
  if (!name) throw new Error('项目名称不能为空');
  if (name === '.' || name === '..' || name.startsWith('.') || name.includes('/') || name.includes('\\') || path.isAbsolute(name)) {
    throw new Error(`非法项目名称：${projectName}。只允许 projects/ 下的一级目录名称，禁止路径穿越。`);
  }
  if (path.basename(name) !== name) throw new Error(`非法项目名称：${projectName}`);
  return name;
}

export function isPathInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}

export function getProjectPaths(projectName, options = {}) {
  const name = validateProjectName(projectName);
  const projectsRoot = path.resolve(options.projectsRoot || DEFAULT_PROJECTS_ROOT);
  const projectRoot = path.resolve(projectsRoot, name);
  if (!isPathInside(projectsRoot, projectRoot) || path.dirname(projectRoot) !== projectsRoot) {
    throw new Error(`项目路径越界：${projectRoot}`);
  }
  return {
    projectName: name,
    projectsRoot,
    projectRoot,
    inputDir: path.join(projectRoot, 'input'),
    outputsDir: path.join(projectRoot, 'outputs'),
    configFile: path.join(projectRoot, 'masterpiece-os.json')
  };
}

export async function assertSafeProjectRoot(projectRoot, projectsRoot = DEFAULT_PROJECTS_ROOT) {
  const root = path.resolve(projectsRoot);
  const project = path.resolve(projectRoot);
  if (!isPathInside(root, project) || path.dirname(project) !== root) throw new Error(`拒绝处理 projects/ 之外的路径：${project}`);
  const [realRoot, realProject] = await Promise.all([fs.realpath(root), fs.realpath(project)]);
  if (!isPathInside(realRoot, realProject) || path.dirname(realProject) !== realRoot) {
    throw new Error(`拒绝处理指向 projects/ 之外的项目目录：${project}`);
  }
  return realProject;
}
