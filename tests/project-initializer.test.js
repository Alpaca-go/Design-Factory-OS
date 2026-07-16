import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { initializeProject, ProjectInitializationError } from '../src/project-initializer.js';
import { getProjectPaths } from '../src/project-paths.js';
import { listProjects, selectProject } from '../src/project-selector.js';

const gitAvailable = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).status === 0;

async function fixture(projectName = '测试项目') {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'masterpiece-os-projects-'));
  const projectsRoot = path.join(workspace, 'projects');
  const projectRoot = path.join(projectsRoot, projectName);
  await fs.mkdir(projectRoot, { recursive: true });
  return { workspace, projectsRoot, projectRoot, projectName };
}

async function present(target) {
  try { await fs.access(target); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

test('空项目目录会创建 input 和 outputs', async () => {
  const f = await fixture();
  const result = await initializeProject(f.projectRoot, { projectsRoot: f.projectsRoot });
  assert.equal(await present(result.inputDir), true);
  assert.equal(await present(result.outputsDir), true);
  assert.equal(result.moved.length, 0);
});

test('项目根目录 JPG 全部移动到 input 且内容不变', async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.projectRoot, '01.jpg'), Buffer.from([1, 2, 3]));
  await fs.writeFile(path.join(f.projectRoot, '02.jpg'), Buffer.from([4, 5, 6]));
  const result = await initializeProject(f.projectRoot, { projectsRoot: f.projectsRoot });
  assert.deepEqual(result.moved, ['01.jpg', '02.jpg']);
  assert.deepEqual([...await fs.readFile(path.join(result.inputDir, '01.jpg'))], [1, 2, 3]);
  assert.equal(await present(path.join(f.projectRoot, '01.jpg')), false);
});

test('多级子目录整体移动且结构不打散', async () => {
  const f = await fixture();
  await fs.mkdir(path.join(f.projectRoot, 'packaging', 'source'), { recursive: true });
  await fs.writeFile(path.join(f.projectRoot, 'packaging', 'source', 'box.png'), 'asset');
  const result = await initializeProject(f.projectRoot, { projectsRoot: f.projectsRoot });
  assert.equal(await fs.readFile(path.join(result.inputDir, 'packaging', 'source', 'box.png'), 'utf8'), 'asset');
  assert.deepEqual(result.moved, ['packaging']);
});

test('已经初始化的项目重复执行保持幂等', async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.projectRoot, 'brief.md'), 'brief');
  await initializeProject(f.projectRoot, { projectsRoot: f.projectsRoot });
  const before = await fs.readdir(path.join(f.projectRoot, 'input'));
  const second = await initializeProject(f.projectRoot, { projectsRoot: f.projectsRoot });
  const after = await fs.readdir(path.join(f.projectRoot, 'input'));
  assert.deepEqual(after, before);
  assert.equal(second.initialized, false);
  assert.deepEqual(second.moved, []);
});

test('同名冲突时不覆盖且不移动任何素材', async () => {
  const f = await fixture();
  await fs.mkdir(path.join(f.projectRoot, 'input'));
  await fs.writeFile(path.join(f.projectRoot, 'input', '01.jpg'), 'existing');
  await fs.writeFile(path.join(f.projectRoot, '01.jpg'), 'new');
  await fs.writeFile(path.join(f.projectRoot, '02.jpg'), 'untouched');
  await assert.rejects(
    initializeProject(f.projectRoot, { projectsRoot: f.projectsRoot }),
    (error) => error instanceof ProjectInitializationError && error.conflicts.some((item) => item.endsWith('input/01.jpg'))
  );
  assert.equal(await fs.readFile(path.join(f.projectRoot, 'input', '01.jpg'), 'utf8'), 'existing');
  assert.equal(await fs.readFile(path.join(f.projectRoot, '01.jpg'), 'utf8'), 'new');
  assert.equal(await fs.readFile(path.join(f.projectRoot, '02.jpg'), 'utf8'), 'untouched');
});

test('多个项目时 --project 语义只选择并初始化指定项目', async () => {
  const f = await fixture('项目A');
  const projectB = path.join(f.projectsRoot, '项目B');
  await fs.mkdir(projectB);
  await fs.writeFile(path.join(f.projectRoot, 'a.jpg'), 'a');
  await fs.writeFile(path.join(projectB, 'b.jpg'), 'b');
  await assert.rejects(selectProject({ projectsRoot: f.projectsRoot }), /检测到多个项目/);
  const selected = await selectProject({ projectsRoot: f.projectsRoot, projectName: '项目B' });
  await initializeProject(selected.projectRoot, { projectsRoot: f.projectsRoot });
  assert.equal(await present(path.join(projectB, 'input', 'b.jpg')), true);
  assert.equal(await present(path.join(f.projectRoot, 'input')), false);
  assert.deepEqual(await listProjects(f.projectsRoot), ['项目A', '项目B']);
});

test('Git 只允许 projects/.gitkeep，真实项目内容被忽略', { skip: gitAvailable ? false : '当前副本不含 .git 元数据' }, () => {
  const ignored = spawnSync('git', ['check-ignore', '-q', 'projects/__policy_test__/asset.png']);
  const keep = spawnSync('git', ['check-ignore', '-q', 'projects/.gitkeep']);
  const visible = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'projects/.gitkeep'], { encoding: 'utf8' });
  assert.equal(ignored.status, 0);
  assert.equal(keep.status, 1);
  assert.match(visible.stdout.replaceAll('\\', '/'), /projects\/\.gitkeep/);
});

test('拒绝路径穿越和 projects 外部目录', async () => {
  const f = await fixture();
  assert.throws(() => getProjectPaths('../outside', { projectsRoot: f.projectsRoot }), /非法项目名称/);
  const outside = path.join(f.workspace, 'outside');
  await fs.mkdir(outside);
  await assert.rejects(initializeProject(outside, { projectsRoot: f.projectsRoot }), /拒绝处理 projects\/ 之外的路径/);
});

test('旧版 inputs 目录安全迁移为标准 input', async () => {
  const f = await fixture();
  await fs.mkdir(path.join(f.projectRoot, 'inputs', 'logo'), { recursive: true });
  await fs.writeFile(path.join(f.projectRoot, 'inputs', 'logo', 'mark.svg'), '<svg/>');
  const result = await initializeProject(f.projectRoot, { projectsRoot: f.projectsRoot });
  assert.equal(await present(path.join(result.inputDir, 'logo', 'mark.svg')), true);
  assert.equal(await present(path.join(f.projectRoot, 'inputs')), false);
  assert.deepEqual(result.moved, ['inputs/logo']);
});

test('根目录与旧 inputs 同名时在移动前发现计划冲突', async () => {
  const f = await fixture();
  await fs.mkdir(path.join(f.projectRoot, 'inputs'));
  await fs.writeFile(path.join(f.projectRoot, 'logo.svg'), 'root');
  await fs.writeFile(path.join(f.projectRoot, 'inputs', 'logo.svg'), 'legacy');
  await assert.rejects(initializeProject(f.projectRoot, { projectsRoot: f.projectsRoot }), /input\/logo\.svg/);
  assert.equal(await fs.readFile(path.join(f.projectRoot, 'logo.svg'), 'utf8'), 'root');
  assert.equal(await fs.readFile(path.join(f.projectRoot, 'inputs', 'logo.svg'), 'utf8'), 'legacy');
});

test('项目根目录配置与隐藏文件保留原位', async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.projectRoot, 'masterpiece-os.json'), '{}');
  await fs.writeFile(path.join(f.projectRoot, 'masterpiece-os-v5.json'), '{}');
  await fs.writeFile(path.join(f.projectRoot, '.local-note'), 'private');
  await initializeProject(f.projectRoot, { projectsRoot: f.projectsRoot });
  assert.equal(await present(path.join(f.projectRoot, 'masterpiece-os.json')), true);
  assert.equal(await present(path.join(f.projectRoot, 'masterpiece-os-v5.json')), true);
  assert.equal(await present(path.join(f.projectRoot, '.local-note')), true);
  assert.equal(await present(path.join(f.projectRoot, 'input', 'masterpiece-os.json')), false);
  assert.equal(await present(path.join(f.projectRoot, 'input', 'masterpiece-os-v5.json')), false);
});

test('项目级 Project Brief 保留在根目录且不作为视觉素材移动', async () => {
  const f = await fixture();
  const brief = path.join(f.projectRoot, 'Project Brief.md');
  await fs.writeFile(brief, '# Project Brief');
  const result = await initializeProject(f.projectRoot, { projectsRoot: f.projectsRoot });
  assert.equal(await present(brief), true);
  assert.equal(await present(path.join(result.inputDir, 'Project Brief.md')), false);
  assert.ok(result.skipped.includes('Project Brief.md'));
});
