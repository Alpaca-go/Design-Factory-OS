import fs from 'node:fs/promises';
import path from 'node:path';
import { mdCell, unique } from './utils.js';

export const KNOWLEDGE_CATEGORIES = ['Packaging', 'Brand', 'VI', 'Poster', 'Portfolio'];

const CATEGORY_ALIASES = new Map([
  ['packaging', 'Packaging'], ['包装', 'Packaging'], ['brand', 'Brand'], ['品牌', 'Brand'],
  ['vi', 'VI'], ['视觉识别', 'VI'], ['poster', 'Poster'], ['海报', 'Poster'],
  ['portfolio', 'Portfolio'], ['作品集', 'Portfolio']
]);

function categoryOf(value) {
  const raw = String(value || '').trim();
  return CATEGORY_ALIASES.get(raw.toLowerCase()) || CATEGORY_ALIASES.get(raw) || 'Brand';
}

function normalizedText(value) {
  return String(value || '').toLowerCase().replace(/#[0-9a-f]{3,8}\b/gi, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(value) {
  const normalized = normalizedText(value);
  if (!normalized) return new Set();
  const output = new Set(normalized.split(/\s+/).filter(Boolean));
  const compact = normalized.replace(/\s+/g, '');
  for (let i = 0; i < compact.length - 1; i++) output.add(compact.slice(i, i + 2));
  return output;
}

export function similarity(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function candidateText(candidate) {
  return `${candidate.title || ''} ${candidate.content || ''}`;
}

function ruleText(rule) {
  return `${rule.title || ''} ${rule.content || ''}`;
}

function normalizeCandidate(candidate, index) {
  return {
    id: candidate.id || `KC-${String(index + 1).padStart(3, '0')}`,
    title: candidate.title || '未命名候选',
    category: categoryOf(candidate.category),
    content: candidate.content || candidate.description || '',
    reason: candidate.reason || '由 Knowledge Engine 提交，等待人工审核。',
    source: candidate.source || 'Knowledge Engine',
    targetRule: candidate.targetRule || null,
    projectOnly: Boolean(candidate.projectOnly),
    projectOnlyReason: candidate.projectOnlyReason || null,
    verifiedProjects: unique(candidate.verifiedProjects || []),
    evidenceCount: Number(candidate.evidenceCount || candidate.verifiedProjects?.length || 1),
    priority: candidate.priority || null
  };
}

export function buildKnowledgeCandidates(result, config = {}) {
  const supplied = (config.knowledgeCandidates || []).map(normalizeCandidate);
  const brand = result.brandLock;
  const projectOnly = [];
  if (brand.primaryColor) projectOnly.push(normalizeCandidate({
    title: `${brand.brandName}品牌色`, category: 'Brand', content: `本项目主色为 ${brand.primaryColor}。`,
    reason: '客户品牌色属于项目专属资产，不具备跨项目迁移条件。', projectOnly: true,
    projectOnlyReason: '客户品牌色', source: 'Brand Lock'
  }, supplied.length + projectOnly.length));
  if (brand.packaging.length) projectOnly.push(normalizeCandidate({
    title: `${brand.brandName}包装盒型`, category: 'Packaging', content: `本项目采用${brand.packaging.join('、')}。`,
    reason: '单个项目采用的盒型不能直接归纳为通用包装规则。', projectOnly: true,
    projectOnlyReason: '单项目包装选择', source: 'Brand Lock'
  }, supplied.length + projectOnly.length));
  if (brand.fontTemperament) projectOnly.push(normalizeCandidate({
    title: `${brand.brandName}视觉气质`, category: 'VI', content: `本项目字体与视觉气质为：${brand.fontTemperament}。`,
    reason: '客户专属视觉偏好只保留在项目记录。', projectOnly: true,
    projectOnlyReason: '专属视觉偏好', source: 'Brand Lock'
  }, supplied.length + projectOnly.length));
  const gapTypes = result.gaps.topThree.map((x) => x.type);
  if (gapTypes.length) projectOnly.push(normalizeCandidate({
    title: `${brand.brandName}本次缺图优先级`, category: gapTypes.some((x) => x.includes('海报')) ? 'Poster' : 'Portfolio',
    content: `本项目优先补充：${gapTypes.join('、')}。`, reason: '由当前素材缺口决定，不代表其他项目的通用优先级。',
    projectOnly: true, projectOnlyReason: '单个项目构图与图片规划', source: '缺图分析'
  }, supplied.length + projectOnly.length));
  return [...supplied, ...projectOnly].map(normalizeCandidate);
}

function parseFrontmatter(text) {
  const match = String(text).match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { attributes: {}, body: text };
  const attributes = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (field) attributes[field[1]] = field[2].replace(/^['"]|['"]$/g, '');
  }
  return { attributes, body: match[2].trim() };
}

async function walkRules(root) {
  const output = [];
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walkRules(full));
    else if (entry.isFile() && !/^readme\.md$/i.test(entry.name) && ['.md', '.json'].includes(path.extname(entry.name).toLowerCase())) output.push(full);
  }
  return output;
}

export async function loadApprovedRules(root) {
  const files = await walkRules(root);
  const rules = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    if (path.extname(file).toLowerCase() === '.json') {
      const parsed = JSON.parse(text);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) rules.push({ ...item, sourceFile: file });
    } else {
      const parsed = parseFrontmatter(text);
      rules.push({ ...parsed.attributes, content: parsed.body, sourceFile: file });
    }
  }
  return rules.map((rule, index) => ({
    id: rule.id || `RULE-${String(index + 1).padStart(3, '0')}`,
    title: rule.title || path.basename(files[index] || `Rule ${index + 1}`, path.extname(files[index] || '')),
    category: categoryOf(rule.category), content: rule.content || '', sourceFile: rule.sourceFile || null
  }));
}

function projectSpecific(candidate, projectName) {
  const value = `${candidate.title} ${candidate.content}`;
  if (candidate.projectOnly) return candidate.projectOnlyReason || '候选已标记为项目专属';
  if (projectName && value.includes(projectName)) return '包含客户或项目名称';
  if (/#[0-9a-f]{3,8}\b/i.test(value)) return '包含客户品牌色';
  if (/(本项目|客户|专属|单个项目)/.test(value)) return '依赖单个项目语境';
  return null;
}

function priorityFor(action, candidate) {
  if (['Ignore', 'Project Only'].includes(action)) return 'P3';
  if (candidate.priority && /^P[0-3]$/.test(candidate.priority)) return candidate.priority;
  if (action === 'Update') return candidate.evidenceCount >= 2 ? 'P1' : 'P2';
  if (action === 'New') return candidate.evidenceCount >= 2 ? 'P1' : 'P2';
  return 'P3';
}

export function analyzeKnowledge(candidates, approvedRules, projectName) {
  const items = [];
  for (const candidate of candidates) {
    const projectOnlyReason = projectSpecific(candidate, projectName);
    if (projectOnlyReason) {
      items.push({ candidate, action: 'Project Only', priority: 'P3', reason: projectOnlyReason, rule: null, similarity: 0 });
      continue;
    }
    const target = candidate.targetRule ? approvedRules.find((rule) => rule.id === candidate.targetRule) : null;
    const ranked = approvedRules.map((rule) => ({ rule, score: similarity(candidateText(candidate), ruleText(rule)) }))
      .sort((a, b) => b.score - a.score);
    const best = target ? { rule: target, score: similarity(candidateText(candidate), ruleText(target)) } : ranked[0];
    let action = 'New';
    let reason = '现有知识库中未发现足够相似的规则。';
    if (target) { action = 'Update'; reason = `候选明确指向 ${target.id}，需人工判断新增内容是否成立。`; }
    else if (best?.score >= 0.72) { action = 'Ignore'; reason = `与 ${best.rule.id} 高度相似（${best.score.toFixed(2)}），建议作为重复项忽略。`; }
    else if (best?.score >= 0.36 && best.rule.category === candidate.category) { action = 'Update'; reason = `与 ${best.rule.id} 属于同类且部分重合（${best.score.toFixed(2)}），建议审核是否补充原规则。`; }
    items.push({ candidate, action, priority: priorityFor(action, candidate), reason, rule: best?.rule || null, similarity: best?.score || 0 });
  }
  const byAction = (action) => items.filter((item) => item.action === action);
  const health = KNOWLEDGE_CATEGORIES.map((category) => {
    const approved = approvedRules.filter((rule) => rule.category === category).length;
    const pending = items.filter((item) => item.candidate.category === category && ['New', 'Update'].includes(item.action)).length;
    return {
      category, approved, pending, status: approved >= 1 ? '稳定' : '建议补充',
      basis: approved >= 1 ? `已有 ${approved} 条 Approved Rule${pending ? `，另有 ${pending} 条待审核建议` : ''}。` : `当前没有 Approved Rule${pending ? `，存在 ${pending} 条待审核建议` : '，需继续积累跨项目证据'}。`
    };
  });
  return {
    generatedAt: new Date().toISOString(), approvedRuleCount: approvedRules.length, items,
    statistics: { new: byAction('New').length, update: byAction('Update').length, duplicate: byAction('Ignore').length, projectOnly: byAction('Project Only').length },
    newSuggestions: byAction('New'), updateSuggestions: byAction('Update'), duplicates: byAction('Ignore'), projectOnly: byAction('Project Only'), health,
    priorities: Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((priority) => [priority, items.filter((item) => item.priority === priority)]))
  };
}

export function renderCandidateReport(candidates, result) {
  const rows = candidates.map((candidate) => `| ${candidate.id} | ${mdCell(candidate.title)} | ${candidate.category} | ${mdCell(candidate.content)} | ${mdCell(candidate.reason)} | ${candidate.evidenceCount} |`).join('\n');
  return `# Knowledge Candidate\n\n> 项目：${result.brandLock.brandName}  \n> 生成时间：${result.generatedAt}  \n> 状态：仅供 Knowledge Analysis 使用，未经人工审核不得写入 knowledge/approved/。\n\n` +
    `| ID | 标题 | 分类 | 候选内容 | 形成原因 | 证据项目数 |\n|---|---|---|---|---|---:|\n${rows || '| — | 本次无候选 | — | — | — | 0 |'}\n`;
}

function suggestionSection(title, items, empty, renderer) {
  return `## ${title}\n\n${items.length ? items.map(renderer).join('\n\n') : empty}\n\n`;
}

export function renderKnowledgeAnalysis(analysis, result) {
  const stats = analysis.statistics;
  const noUniversal = stats.new === 0 && stats.update === 0;
  let output = `# Knowledge Analysis\n\n> 项目：${result.brandLock.brandName}  \n> 生成时间：${analysis.generatedAt}  \n> Approved Rule：${analysis.approvedRuleCount} 条\n\n`;
  if (noUniversal) output += `> 本次项目未发现新的通用设计规律，仅产生项目级经验。\n\n`;
  output += `## 一、本次统计\n\n- 新增规则建议数量：${stats.new}\n- 更新规则建议数量：${stats.update}\n- 重复规则数量：${stats.duplicate}\n- 忽略项目经验数量：${stats.projectOnly}\n\n`;
  output += suggestionSection('二、新增建议', analysis.newSuggestions, '本次没有新增 Rule 建议。', (item) =>
    `### ${item.candidate.id}｜${item.candidate.title}\n\n- 分类：${item.candidate.category}\n- 原因：${item.reason}\n- 建议动作：New`);
  output += suggestionSection('三、更新建议', analysis.updateSuggestions, '本次没有更新 Rule 建议。', (item) =>
    `### ${item.candidate.id}｜${item.candidate.title}\n\n- 对应 Rule：${item.rule?.id || item.candidate.targetRule || '待确认'}｜${item.rule?.title || '待确认'}\n- 新增内容：${item.candidate.content}\n- 建议修改原因：${item.reason}\n- 建议动作：Update`);
  output += suggestionSection('四、重复规则', analysis.duplicates, '本次没有重复规则。', (item) =>
    `### ${item.candidate.id}｜${item.candidate.title}\n\n- Candidate：${item.candidate.content}\n- 已存在 Rule：${item.rule?.id}｜${item.rule?.title}\n- 重复原因：${item.reason}\n- 建议动作：Ignore`);
  output += suggestionSection('五、项目专属经验', analysis.projectOnly, '本次没有项目专属经验。', (item) =>
    `### ${item.candidate.id}｜${item.candidate.title}\n\n- 内容：${item.candidate.content}\n- 不进入知识库原因：${item.reason}\n- 建议动作：Project Only`);
  output += `## 六、知识库健康度\n\n| 分类 | 状态 | 依据 |\n|---|---|---|\n${analysis.health.map((item) => `| ${item.category} | ${item.status} | ${mdCell(item.basis)} |`).join('\n')}\n\n`;
  output += `## 七、建议优先级\n\n${['P0', 'P1', 'P2', 'P3'].map((priority) => `### ${priority}\n\n${analysis.priorities[priority].length ? analysis.priorities[priority].map((item) => `- ${item.candidate.id}｜${item.candidate.title}｜${item.action}`).join('\n') : '- 无'}`).join('\n\n')}\n\n`;
  output += `## 八、人工审核清单\n\n- [ ] 批准新增 Rule\n- [ ] 更新已有 Rule\n- [ ] 忽略 Candidate\n- [ ] 保留项目经验\n\n> Knowledge Analysis 不会修改 knowledge/approved/。任何正式写入都必须由人工审核并另行执行。\n`;
  return output;
}
