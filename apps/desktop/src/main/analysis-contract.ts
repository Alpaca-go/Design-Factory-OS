import path from 'node:path';

const WINDOWS_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001F]/g;

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

export function buildFusionEnhancedTask(description: string): string {
  return `${description.trim() || '深度审计现有视觉方案并提出唯一、可执行的视觉升级方向'}

分析配置：Fusion Enhanced。只调用一次模型，直接输出融合增强报告。
- 以用户确认的品牌事实与行业属性为最高事实边界，不得重新推断、覆盖或改写。
- 强化行业理解、真实业务触点、合规边界、资产取舍、唯一视觉命题与图片职责。
- 同时把材质、微结构、负形、触觉工艺、压纹、蚀刻、喷砂、透明分层、光线和表面细节转译为可执行动作。
- 不得先生成多份报告再融合，不得追加第二次总结或模型裁决。`;
}

export function desktopFactualConstraints(industry: string, lockedFacts: string[]): string[] {
  return [
    `行业属性“${industry.trim()}”为用户确认事实，不得重新推断、覆盖或修改。`,
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

export function validateDesktopReport(markdown: string): void {
  const required = Array.from({ length: 11 }, (_, index) => `## ${index}.`);
  const missing = required.filter((heading) => !markdown.includes(heading));
  if (missing.length) throw new Error(`Markdown 校验失败：缺少章节 ${missing.join('、')}`);
  if (!markdown.includes('唯一视觉升级命题')) throw new Error('Markdown 校验失败：缺少唯一视觉升级命题');
  if (!['保留', '升级', '替换', '删除', '新增'].every((action) => markdown.includes(action))) {
    throw new Error('Markdown 校验失败：资产决策未覆盖保留、升级、替换、删除、新增');
  }
}

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
