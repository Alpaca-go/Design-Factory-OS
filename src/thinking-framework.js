import fs from 'node:fs/promises';
import path from 'node:path';
import { unique } from './utils.js';

export const THINKING_FRAMEWORKS = [
  ['identity', 'Brand Identity'],
  ['emotion', 'Emotional Direction'],
  ['visual', 'Visual DNA'],
  ['brand', 'Brand Positioning'],
  ['portfolio', 'Portfolio Coherence']
];

function extractQuestions(markdown) {
  return unique(String(markdown || '').split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, ''))
    .filter((line) => line && !line.startsWith('#') && /[？?]$/.test(line)));
}

export async function loadThinkingFramework(root) {
  const categories = [];
  const warnings = [];
  for (const [id, title] of THINKING_FRAMEWORKS) {
    const file = path.join(root, `${id}.md`);
    try {
      const content = await fs.readFile(file, 'utf8');
      categories.push({ id, title, file, questions: extractQuestions(content) });
    } catch (error) {
      if (error.code !== 'ENOENT') warnings.push(`${file}：${error.message}`);
      categories.push({ id, title, file, questions: [] });
    }
  }
  return { root, categories, warnings };
}

function projectQuestions(result) {
  const reasoning = result.creativeReasoning;
  const brand = result.brandLock;
  return {
    identity: [
      `如果不说明“${result.benchmarks.industry.value}”品类，受众还能从哪些资产认出“${brand.brandName}”？`,
      `“${reasoning.brandIdentity.statement}”中最不可被替换的核心究竟是什么？`,
      '品牌当前表达的是短期卖点，还是能够长期积累的身份？'
    ],
    emotion: [
      `受众接触品牌后的第一情绪是否真正接近“${reasoning.emotionalDirection.statement}”？`,
      '哪些现有视觉动作会制造与目标情绪相反的感受？',
      '品牌情绪在包装、空间、摄影和数字触点中是否保持同一种强度？'
    ],
    visual: [
      '去掉文案后，Logo、色彩、构图、材质和摄影是否仍属于同一个品牌？',
      '哪些视觉资产必须被固定为长期规则，哪些只是当前项目的表现手法？',
      'Visual DNA 在最小尺寸、复杂背景、真实材质和空间尺度中是否仍然成立？'
    ],
    brand: [
      `“${reasoning.brandPositioning.statement}”与同类品牌相比，真正具有独占性的部分是什么？`,
      '当前对标是帮助品牌建立差异，还是让品牌越来越像行业模板？',
      '品牌承诺是否有产品、服务或体验证据支撑？'
    ],
    portfolio: [
      '作品集能否清楚呈现从品牌理解到视觉系统的因果关系？',
      '现有展示是在重复效果图，还是证明同一设计逻辑可以跨触点成立？',
      '如果只能保留五个页面，哪些页面最能证明品牌价值和设计判断？'
    ]
  };
}

export function buildThinkingReview(result, framework, config = {}) {
  const generated = projectQuestions(result);
  const supplied = config.thinkingQuestions || {};
  const project = Object.fromEntries(THINKING_FRAMEWORKS.map(([id]) => [
    id,
    unique([
      ...(generated[id] || []),
      ...(Array.isArray(supplied[id]) ? supplied[id].map(String).map((item) => item.trim()).filter((item) => /[？?]$/.test(item)) : [])
    ])
  ]));
  return {
    generatedAt: new Date().toISOString(),
    frameworkRoot: framework.root,
    categories: framework.categories,
    warnings: framework.warnings,
    projectQuestions: project,
    statement: 'Knowledge 保存的是可复用的设计思考问题，而不是项目答案、风格结论或自动执行规则。'
  };
}
