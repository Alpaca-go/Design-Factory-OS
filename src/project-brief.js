import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PROJECT_BRIEF_FILENAMES = ['Project Brief.md', 'Project-Brief.md'];
export const DEFAULT_PROJECT_BRIEF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'Project Brief.md'
);

async function readable(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function inferProjectRoot(input, options) {
  if (options.projectRoot) return path.resolve(options.projectRoot);
  const root = path.resolve(input);
  return path.basename(root).toLowerCase() === 'input' ? path.dirname(root) : root;
}

async function findProjectBrief(projectRoot) {
  for (const filename of PROJECT_BRIEF_FILENAMES) {
    const candidate = path.join(projectRoot, filename);
    if (await readable(candidate)) return candidate;
  }
  return null;
}

function requirementsFrom(content) {
  const v4Contract = /Masterpiece\s*OS\s*v4\.0|Version\s*[：:]\s*v4\.0/i.test(content);
  const defaultMatch = content.match(/\b(Quick|Standard|Studio)\s*[（(]\s*默认\s*[）)]/i);
  const defaultMode = (defaultMatch?.[1] || 'standard').toLowerCase();
  const minBenchmarks = v4Contract || /至少\s*(?:3|三)\s*个/.test(content) ? 3 : 0;
  const performanceTargetMatch = content.match(/Performance Target[^\d]*(\d+)\s*[～~\-]\s*(\d+)\s*分钟/i);
  return {
    defaultMode,
    visualInspection: v4Contract || /必须实际查看全部图片/.test(content),
    onlineBenchmarks: v4Contract || /联网分析/.test(content),
    sameIndustryBenchmarks: v4Contract || /不得跨行业/.test(content),
    minBenchmarks,
    performanceProfiling: /Performance Profiling/i.test(content),
    validationReport: /#\s*Validation Report|Validation Report\s*必须/i.test(content),
    performanceTarget: performanceTargetMatch
      ? { minMinutes: Number(performanceTargetMatch[1]), maxMinutes: Number(performanceTargetMatch[2]) }
      : { minMinutes: 10, maxMinutes: 11 },
    standardOutputs: [
      '01-Analysis.md', '02-Creative-Brief.md', '03-Design-Decisions.md', '04-Design-Review.md'
    ]
  };
}

/**
 * Resolve the analysis contract used by the Pipeline. A project-specific
 * brief may override the workspace default, while the default keeps every
 * visual project runnable without copying documentation into the project.
 */
export async function loadProjectBrief(input, options = {}) {
  const projectRoot = inferProjectRoot(input, options);
  let briefPath;
  let source;
  if (options.projectBrief) {
    briefPath = path.resolve(options.projectBrief);
    source = 'explicit';
    if (!await readable(briefPath)) throw new Error(`Project Brief 无法读取：${briefPath}`);
  } else {
    briefPath = await findProjectBrief(projectRoot);
    source = briefPath ? 'project' : 'workspace-default';
    if (!briefPath) briefPath = DEFAULT_PROJECT_BRIEF;
    if (!await readable(briefPath)) throw new Error(`缺少默认分析文档：${briefPath}`);
  }

  const content = await fs.readFile(briefPath, 'utf8');
  if (!content.trim()) throw new Error(`Project Brief 为空：${briefPath}`);
  const requirements = requirementsFrom(content);
  return {
    path: briefPath,
    source,
    projectRoot,
    defaultMode: requirements.defaultMode,
    requirements,
    sha256: crypto.createHash('sha256').update(content).digest('hex')
  };
}
