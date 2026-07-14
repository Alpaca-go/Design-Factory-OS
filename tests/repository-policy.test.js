import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const forbiddenExtensions = new Set(['.psd', '.ai', '.cdr', '.pdf', '.zip', '.rar', '.7z']);
const forbiddenNames = new Set(['review.md', 'chat生图任务包.md', 'knowledge-candidate.md', 'knowledge-analysis.md', '01-项目分析报告.md', '02-chat生图任务包.md', '03-knowledge-review.md', '04-design-review.md']);
const forbiddenRoots = ['Design-Factory-Projects/'];
const localProjectNames = ['九州美学', '帅府', '香辣虾', '小熊工坊'];

function repositoryFiles() {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split('\0').filter(Boolean).map((file) => file.replaceAll('\\', '/'));
}

test('仓库不包含项目源文件或项目交付物', () => {
  const violations = [];
  for (const file of repositoryFiles()) {
    const lower = file.toLowerCase();
    const basename = path.posix.basename(lower);
    const extension = path.posix.extname(lower);
    if (forbiddenExtensions.has(extension)) violations.push(`${file}：禁止的客户源文件格式`);
    if (forbiddenNames.has(basename) && !lower.startsWith('docs/')) violations.push(`${file}：禁止的项目交付文件`);
    if (forbiddenRoots.some((root) => lower.startsWith(root.toLowerCase()))) violations.push(`${file}：真实项目目录`);
    if (lower.startsWith('projects/') && lower !== 'projects/.gitkeep') violations.push(`${file}：projects/ 只允许 .gitkeep`);
    if (lower.startsWith('history/reviews/') && lower !== 'history/reviews/.gitkeep') violations.push(`${file}：history/reviews/ 只允许 .gitkeep`);
    if (localProjectNames.some((name) => file.includes(name))) violations.push(`${file}：包含真实项目名称`);
  }
  assert.deepEqual(violations, [], `发现 GitHub 文件管理规范违规：\n${violations.join('\n')}`);
});

test('仓库内栅格图片只能用于脱敏示例、测试或模板', () => {
  const raster = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
  const violations = repositoryFiles().filter((file) => raster.has(path.posix.extname(file).toLowerCase()))
    .filter((file) => !/^(examples|tests|templates)\//.test(file));
  assert.deepEqual(violations, [], `栅格图片位置不合规：\n${violations.join('\n')}`);
});
