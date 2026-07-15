import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROMPT_ROOT = path.join(REPOSITORY_ROOT, 'prompts', 'v5');

const PROMPT_FILES = Object.freeze({
  system: 'deep-creative-director.md',
  benchmark: 'benchmark-instructions.md',
  executionCore: 'execution-core-template.md',
  reportSchema: 'report-schema.md'
});

let templateCache = null;

async function loadTemplates() {
  if (!templateCache) {
    templateCache = Object.freeze(Object.fromEntries(await Promise.all(
      Object.entries(PROMPT_FILES).map(async ([key, filename]) => [
        key,
        (await fs.readFile(path.join(PROMPT_ROOT, filename), 'utf8')).trim()
      ])
    )));
  }
  return templateCache;
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function renderProjectInput(context) {
  const { config, projectName } = context;
  return `## Project Input

${json({
    projectName,
    brandName: config.brandFacts.brandName,
    industry: config.brandFacts.industry,
    userTask: config.userTask || '基于全部视觉资产完成品牌视觉系统审计与升级',
    requiredApplications: config.overrides.requiredApplications
  })}`;
}

function renderManifest(inventory, visualPreparation) {
  const assets = inventory.items.map((item, index) => ({
    assetId: `asset-${String(index + 1).padStart(3, '0')}`,
    path: item.path,
    type: item.type,
    extension: item.extension,
    bytes: item.bytes,
    isImage: item.isImage,
    detail: item.detail,
    warning: item.warning
  }));
  const preparation = visualPreparation ? {
    fingerprint: visualPreparation.fingerprint,
    strategy: visualPreparation.strategy,
    contactSheet: visualPreparation.contactSheetPath ? 'contact-sheet' : null,
    priorityAssetIds: visualPreparation.priorityAssetIds,
    attachmentCount: visualPreparation.attachmentCount,
    instruction: '先整体阅读 Contact Sheet，再精读 priorityAssetIds；资产决策仍须覆盖完整 index，不得把未单独附加的图片视为未提供。'
  } : null;
  return {
    markdown: `## Asset Manifest

你必须查看清单中的全部可读视觉资产。重复 Mockup 只作为重复证据，不得提高相关元素的保留权重。不可读文件必须明确写入审计范围，不得猜测内容。

${json({ totalFiles: inventory.totalFiles, imageCount: inventory.imageCount, preparation, assets })}`,
    assets
  };
}

function renderConstraints(config) {
  const logoRule = config.overrides.allowLogoRedesign
    ? '用户已显式授权本项目进行 Logo 重设计；仍不得伪造品牌名称或客观事实。'
    : '原始 Logo Locked：不得修改、重绘、拆解、重组、替换或改变内部字形。';
  return `## Explicit User Constraints

- ${logoRule}
- Creative Authority：Maximum。
- 除 Logo、客观事实及下列显式锁定项外，全部视觉资产都可保留、升级、替换、删除或新增。

${json({
    factualConstraints: config.brandFacts.factualConstraints,
    logoAssets: config.brandFacts.logoAssets,
    additionalLockedAssets: config.overrides.additionalLockedAssets,
    forbiddenChanges: config.overrides.forbiddenChanges,
    requiredApplications: config.overrides.requiredApplications
  })}`;
}

function attachments(inventory) {
  return inventory.items.map((item, index) => Object.freeze({
    assetId: `asset-${String(index + 1).padStart(3, '0')}`,
    path: path.resolve(inventory.root, item.path),
    mediaType: item.isImage ? 'image' : 'document',
    readable: !item.warning
  }));
}

function renderPreparedBenchmarks(benchmarkPreparation) {
  if (!benchmarkPreparation) return '';
  return `## Prepared Benchmark Context

以下内容来自受限的项目配置或行业缓存。只提取与当前设计问题相关的可迁移原则；不得为凑数量继续扩展名单。

${json({
    category: benchmarkPreparation.category,
    creativeExcellence: benchmarkPreparation.creativeExcellence
  })}`;
}

/** Build one model request from maintainable prompt modules without performing reasoning. */
export async function buildDeepCreativeDirectorPrompt(context) {
  if (!context?.inventory || !context?.config) throw new Error('Prompt Builder 缺少 inventory 或 v5 config');
  const templates = await loadTemplates();
  const manifest = renderManifest(context.inventory, context.visualPreparation);
  const userSections = [
    renderProjectInput(context),
    manifest.markdown,
    renderConstraints(context.config),
    templates.benchmark,
    renderPreparedBenchmarks(context.benchmarkPreparation),
    '## GPT Execution Core Contract\n\nExecution Core 必须位于报告最前部并控制在约 600～1,200 中文字。不得把完整分析复制进 Core。\n\n' + templates.executionCore,
    `## Report Budget\n\n整份报告目标为 6,000～${context.config.performance.maxReportCharacters.toLocaleString('en-US')} 个中文字符。优先删除重复解释，不得牺牲资产决策、视觉系统或应用动作。`,
    '## Required Report Schema\n\n严格使用以下章节顺序和标题，不得新增第二份文档：\n\n' + templates.reportSchema
  ].filter(Boolean);
  const messages = Object.freeze([
    Object.freeze({ role: 'system', content: templates.system }),
    Object.freeze({ role: 'user', content: userSections.join('\n\n---\n\n') })
  ]);
  const attachmentList = context.visualPreparation?.attachments || Object.freeze(attachments(context.inventory));
  const canonical = JSON.stringify({ messages, attachments: attachmentList });
  return Object.freeze({
    contractVersion: '5.0.0',
    modelCalls: 1,
    messages,
    attachments: attachmentList,
    sections: Object.freeze(['projectInput', 'assetManifest', 'explicitConstraints', 'benchmark', 'executionCore', 'reportBudget', 'reportSchema']),
    promptDigest: crypto.createHash('sha256').update(canonical).digest('hex')
  });
}

export function clearPromptTemplateCache() {
  templateCache = null;
}
