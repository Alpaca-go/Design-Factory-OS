import path from 'node:path';
import { isUsableProjectName } from './project-intake.ts';
import { validateReferenceTranslationMarkdown, type ReportType } from './reference-translation-report.ts';

const WINDOWS_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001F]/g;
const ASSET_DECISIONS = new Set(['保留', '升级', '替换', '删除', '新增']);

export function sanitizeFilenamePart(value: string): string {
  const safe = String(value || '')
    .trim()
    .replace(WINDOWS_FORBIDDEN, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[-. ]+|[-. ]+$/g, '');
  return safe || '未命名';
}

export function buildReportFilename(projectName: string, modelName: string, language = 'zh-CN'): string {
  const safeProject = sanitizeFilenamePart(projectName);
  const safeModel = sanitizeFilenamePart(modelName);
  return language === 'en'
    ? `${safeProject}-Creative-Upgrade-Report-${safeModel}.md`
    : `${safeProject}-视觉方案升级报告-${safeModel}.md`;
}

export function buildFusionEnhancedTask(description: string, provisionalProjectName = ''): string {
  return `${description.trim() || '深度审计现有视觉方案并提出唯一、可执行的视觉升级方向'}

分析配置：Fusion Enhanced。只调用一次模型，直接输出融合增强报告。
- 必须优先从视觉内容、Logo / 品牌规范页、PDF 封面或高频品牌文字识别真实项目名称，并把报告第一行写为“# 真实项目名称视觉方案升级报告”。
- “${provisionalProjectName || '当前临时项目名称'}”仅是本地导入阶段的临时线索，不得覆盖视觉内容中明确出现的真实名称。
- 不得把 input、images、assets、visual、upload、project、未命名等通用文件名作为品牌或项目名称。
- 不得把设计公司或作品集平台水印、Mockup 模板名、软件界面文字、页码、文件编号、设计师署名作为项目名称；无法从素材可靠识别时保留临时名称，不得自行创造。
- 项目元数据中的品牌与行业来自上传素材自动识别；高置信度线索作为事实边界，低置信度线索必须明确标记“基于现有素材推断”或“待确认”，不得编造。
- 强化行业理解、真实业务触点、合规边界、资产取舍、唯一视觉命题与图片职责。
- 同时把材质、微结构、负形、触觉工艺、压纹、蚀刻、喷砂、透明分层、光线和表面细节转译为可执行动作。
- 不得先生成多份报告再融合，不得追加第二次总结或模型裁决。`;
}

export function extractProjectNameFromReport(markdown: string): string | null {
  const heading = String(markdown || '').match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() || '';
  const candidate = heading
    .replace(/[\s|｜·:：—-]*(?:视觉方案升级报告|Creative Upgrade Report)\s*$/i, '')
    .replace(/^(?:项目名称|项目|品牌名称|品牌)\s*[:：]\s*/i, '')
    .replace(/^[《「『【\[]+|[》」』】\]]+$/g, '')
    .trim();
  return isUsableProjectName(candidate) ? candidate : null;
}

export function desktopFactualConstraints(industry: string, lockedFacts: string[], industryConfidence = 1): string[] {
  const industryConstraint = industryConfidence >= 0.75
    ? `行业线索“${industry.trim()}”来自现有素材自动识别（置信度 ${industryConfidence.toFixed(2)}），分析不得擅自改写，并须说明识别来源。`
    : '现有素材不足以可靠确认行业属性；报告必须使用“基于现有素材推断”或“待确认”，不得将行业猜测写成确定事实。';
  return [
    industryConstraint,
    ...lockedFacts.map((item) => item.trim()).filter(Boolean)
  ];
}

export function normalizeReportTitle(markdown: string, projectName: string, language = 'zh-CN'): string {
  const title = language === 'en'
    ? `# ${projectName} Creative Upgrade Report`
    : `# ${projectName}视觉方案升级报告`;
  const value = String(markdown || '').trim();
  return /^#\s+.+$/m.test(value) ? value.replace(/^#\s+.+$/m, title) + '\n' : `${title}\n\n${value}\n`;
}

export function validateVisualUpgradeMarkdown(markdown: string): void {
  const required = Array.from({ length: 11 }, (_, index) => `## ${index}.`);
  const missing = required.filter((heading) => !markdown.includes(heading));
  if (missing.length) throw new Error(`Markdown 校验失败：缺少章节 ${missing.join('、')}`);
  if (!markdown.includes('唯一视觉升级命题')) throw new Error('Markdown 校验失败：缺少唯一视觉升级命题');
  const decisionSection = markdown.match(/## 3\.\s*视觉资产决策([\s\S]*?)(?=\n## 4\.|$)/u)?.[1] || '';
  const decisionRows = decisionSection.split(/\r?\n/u).flatMap((line) => {
    if (!/^\s*\|.*\|\s*$/u.test(line) || /^\s*\|[\s:|-]+\|\s*$/u.test(line)) return [];
    const cells = line.split('|').slice(1, -1).map((cell) => cell.replace(/\*\*/gu, '').trim());
    if (cells[0] === '视觉资产' || cells.length < 2) return [];
    return [{ asset: cells[0] || '', decision: cells[1] || '' }];
  });
  if (!decisionRows.length) {
    throw new Error('Markdown 校验失败：视觉资产决策表为空或格式无效');
  }
  const invalid = decisionRows.filter((row) => !ASSET_DECISIONS.has(row.decision));
  if (invalid.length) {
    throw new Error(`Markdown 校验失败：资产决策值无效 ${invalid.map((row) => `${row.asset}:${row.decision}`).join('、')}`);
  }
}

export function validateMarkdownReport(
  reportType: ReportType,
  markdown: string,
  structuredResult?: unknown
): void {
  if (reportType === 'visual_upgrade') return validateVisualUpgradeMarkdown(markdown);
  if (reportType === 'reference_translation') {
    return validateReferenceTranslationMarkdown(markdown, structuredResult as Parameters<typeof validateReferenceTranslationMarkdown>[1]);
  }
  throw new Error(`Unsupported report type: ${reportType}`);
}

// Backward-compatible visual-upgrade entry point.
export const validateDesktopReport = validateVisualUpgradeMarkdown;

export function assertInside(parent: string, target: string): string {
  const resolvedParent = path.resolve(parent);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedParent, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('目标路径超出项目数据目录');
  return resolvedTarget;
}

export function redactSecret(message: unknown, secret: string): string {
  const value = String(message || '未知错误');
  return secret ? value.split(secret).join('[REDACTED]') : value;
}
