import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');

async function filesUnder(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(target));
    else result.push(target);
  }
  return result;
}

test('core v5 never depends on Desktop', async () => {
  const files = await filesUnder(path.join(repositoryRoot, 'src', 'v5'));
  const source = (await Promise.all(files.filter((file) => file.endsWith('.js')).map((file) => fs.readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(source, /apps[\\/]desktop|desktop[\\/](src|out)/i);
});

test('Desktop calls runV5Pipeline directly and does not build terminal commands', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'main', 'pipeline-service.ts'), 'utf8');
  assert.match(source, /runV5Pipeline/);
  assert.doesNotMatch(source, /child_process|exec\s*\(|spawn\s*\(|npm run analyze/);
});

test('sandboxed renderer loads the bundled CommonJS preload artifact', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'main', 'index.ts'), 'utf8');
  const config = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'electron.vite.config.ts'), 'utf8');
  assert.match(source, /preload\/index\.cjs/);
  assert.doesNotMatch(source, /preload\/index\.js/);
  assert.match(config, /format:\s*'cjs'/);
  assert.match(config, /entryFileNames:\s*'\[name\]\.cjs'/);
});

test('default Windows artifact is portable and does not create an installer', async () => {
  const config = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'electron-builder.yml'), 'utf8');
  const rootPackage = await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8');
  assert.match(config, /target:\s*\r?\n\s*- portable/);
  assert.match(config, /Desktop-Portable/);
  assert.doesNotMatch(config, /\bnsis\b/i);
  assert.match(rootPackage, /desktop:package[^\n]+package:portable/);
});

test('new analysis UI contains intake actions and API Profile choice without metadata form', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'components', 'ProjectWizard.tsx'), 'utf8');
  const uploader = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'components', 'VisualAssetUploader.tsx'), 'utf8');
  assert.doesNotMatch(source, /<input|<textarea/);
  assert.match(source, /分析模型/);
  assert.doesNotMatch(source, /choose\('logo'\)|choose\('brief'\)/);
  assert.match(source, /VisualAssetUploader/);
  assert.match(uploader, /选择文件夹/);
  assert.match(uploader, /onDrop=/);
  assert.match(source, /开始分析/);
  assert.match(source, /sourcePaths/);
});

test('API Profile provider is free-form and not restricted to Qwen choices', async () => {
  const types = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'shared', 'types.ts'), 'utf8');
  const settings = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'components', 'SettingsPanel.tsx'), 'utf8');
  assert.match(types, /type ProviderKind = string/);
  assert.match(settings, /Provider 标识/);
  assert.match(settings, /provider-suggestions/);
  assert.doesNotMatch(settings, /<select value=\{editor\.provider\}/);
});

test('Visual Translation API selection is controlled by App and survives settings navigation', async () => {
  const app = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'App.tsx'), 'utf8');
  const workspace = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'components', 'VisualTranslationWorkspace.tsx'), 'utf8');
  assert.match(app, /selectedApiProfileId=\{selectedApiProfileId\}/);
  assert.match(app, /onApiProfileChange=\{setSelectedApiProfileId\}/);
  assert.match(app, /setSettingsReturnScreen\('create'\)/);
  assert.match(workspace, /onApiProfileChange\(event\.target\.value\)/);
  assert.doesNotMatch(workspace, /useState\(initialProfile\?\.id/);
});

test('Visual Translation exposes one formal workflow without internal version selectors', async () => {
  const workspace = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'components', 'VisualTranslationWorkspace.tsx'), 'utf8');
  assert.match(workspace, /系统将提取视觉相关品牌事实/);
  assert.match(workspace, /'开始分析'/);
  assert.doesNotMatch(workspace, /方向生成模式|文档分析流程|概念方向 V1|执行向 V2|视觉事实优先 V2|深度分析 V1|实验分支|生产基线/u);
});

test('analysis intake shares tabs, translation supports drop upload, and home distinguishes all record types', async () => {
  const app = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'App.tsx'), 'utf8');
  const tabs = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'components', 'AnalysisModeTabs.tsx'), 'utf8');
  const workspace = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'components', 'VisualTranslationWorkspace.tsx'), 'utf8');
  assert.match(app, /<AnalysisModeTabs/);
  assert.match(tabs, /视觉分析/);
  assert.match(tabs, /文档视觉转译/);
  assert.match(workspace, /onDrop=/);
  assert.match(workspace, /getPathForFile/);
  assert.doesNotMatch(workspace, /项目名称<input/);
  assert.match(app, /record-type visual-analysis/);
  assert.match(app, /record-type visual-translation/);
  assert.match(app, /record-type reference-reconstruction/);
  assert.match(app, /visualTranslation\.listRuns\(\)/);
  assert.match(app, /referenceTranslation\.listRuns\(\)/);
  assert.match(app, /initialRunId=\{requestedReconstructionRunId\}/);
});

test('recent project rows expose a destructive local-folder delete action', async () => {
  const app = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'App.tsx'), 'utf8');
  const store = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'main', 'project-store.ts'), 'utf8');
  assert.match(app, /project-delete/);
  assert.match(app, /永久删除该项目对应的本地文件夹/);
  assert.match(app, /projects\.remove\(project\.id\)/);
  assert.match(store, /fs\.rm\(root,\s*\{\s*recursive:\s*true/);
});

test('reference reconstruction isolates project facts, reference style and the independent decision step', async () => {
  const service = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'main', 'reference-translation-service.ts'), 'utf8');
  const prompts = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'main', 'reference-reconstruction-prompts.ts'), 'utf8');
  const workspace = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer', 'src', 'components', 'ReferenceTranslationWorkspace.tsx'), 'utf8');
  assert.match(service, /analyzeCurrentProjectProfile/);
  assert.match(service, /analyzeReferenceStyle/);
  assert.match(service, /generateVisualReconstructionDecision/);
  assert.doesNotMatch(service, /const currentReport|const referenceReport|reportObservations/);
  assert.match(prompts, /只能使用下面两个干净 JSON/);
  assert.match(prompts, /不得假设或引用任何上游 Markdown 报告/);
  assert.doesNotMatch(prompts, /CATEGORY_PREFIX|wrapAsStyleRule/);
  assert.match(workspace, /查看中间结果/);
  assert.match(workspace, /quality-validation\.json/);
});

test('API Key is encrypted outside project records', async () => {
  const credentials = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'main', 'settings-store.ts'), 'utf8');
  const projects = await fs.readFile(path.join(repositoryRoot, 'apps', 'desktop', 'src', 'main', 'project-store.ts'), 'utf8');
  assert.match(credentials, /safeStorage\.encryptStringAsync/);
  assert.match(credentials, /encryptedApiKey/);
  assert.doesNotMatch(projects, /apiKey|encryptedApiKey/);
});
