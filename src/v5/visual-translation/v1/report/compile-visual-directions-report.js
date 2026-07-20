function escapeCell(value) { return String(value ?? '').replaceAll('|', '\\|').replace(/\s*\n\s*/g, '<br>'); }
function list(values, fallback = '暂无。') { return values?.length ? values.map((item) => `- ${item}`).join('\n') : fallback; }
function numbered(values, fallback = '暂无。') { return values?.length ? values.map((item, index) => `${index + 1}. ${item}`).join('\n') : fallback; }
import { measurePrimaryLanguage } from '../schemas/report-language-v1.js';

function evidenceLabel(ids) { return ids?.length ? ids.join('、') : '待确认'; }

function hasRestrictedCertificationBadge(view) {
  return view.boundaries.suggestedAssets?.some((asset) =>
    asset.assetType === 'certification_badge' && asset.status === 'restricted'
  );
}

function hasMissingParentBrandVI(view) {
  const missingInfo = view.boundaries.missingInformation || [];
  const conflicts = view.boundaries.conflicts || [];
  const all = [...missingInfo, ...conflicts];
  return all.some((item) =>
    /(?:母品牌|parent brand|vi|visual identity|品牌手册|brand guidelines)/iu.test(String(item))
  );
}

function cleanText(text) {
  return String(text || '').replace(/。{2,}/g, '。').replace(/,{2,}/g, ',').replace(/\.{2,}/g, '.').replace(/[ \t]{2,}/g, ' ').trim();
}

function sanitizeDirectionText(direction, view) {
  let text = cleanText(direction);
  if (hasRestrictedCertificationBadge(view)) {
    text = text.replace(/构建认证徽章体系|创建资质标识|生成合规徽章/g, '构建合规能力信息体系，通过数据、流程、追溯结构与文字标识传达信任，不生成官方认证徽章或资质标识');
  }
  if (hasMissingParentBrandVI(view)) {
    text = text.replace(/色彩微关联|Logo组合|专用图形继承|视觉体系复制/g, '预留背书位置，保留关系说明，等待正式VI');
  }
  return text;
}

// ── Display Label Mapper ───────────────────────────────────
const DISPLAY_LABELS = {
  'template_risk:low': '行业模板风险低',
  'template_risk:medium': '行业模板风险中等',
  'template_risk:high': '行业模板风险高',
  abstract_environment_role: '抽象环境表达',
  stable_emotional_role: '稳定可信的情绪角色',
  platform_environment_role: '平台型空间语言',
  use_of_warm_tones: '使用温暖色调',
  core_brand_direction: '核心品牌方向',
  cultural_expression_direction: '品牌文化表达方向',
  capability_communication_direction: '能力传播方向',
  balanced_direction: '综合平衡方向',
  pass: '明显不同',
  needs_strengthening: '可区分，需加强',
  rewrite_required: '差异不足，需重写',
  needs_rewrite: '差异不足，需重写',
  'evidence_basis:derived_evidence': '证据依据：衍生证据',
  'evidence_basis:confirmed_evidence': '证据依据：确认证据',
  'evidence_basis:reasonable_inference': '证据依据：合理推断',
  'evidence_basis:suggested_evidence': '证据依据：建议证据',
  evidence_basis: '证据依据',
  derived_evidence: '衍生证据',
  confirmed_evidence: '确认证据',
  reasonable_inference: '合理推断',
  suggested_evidence: '建议证据',
  'business_model:b2b': '业务模式：B2B',
  'business_model:b2c': '业务模式：B2C',
  'business_model:b2b2c': '业务模式：B2B2C',
  'business_model:unknown': '业务模式：待确认',
  business_model: '业务模式',
  'consumer_visual_policy:core_allowed': '消费者视觉政策：核心允许',
  'consumer_visual_policy:auxiliary_only': '消费者视觉政策：仅辅助使用',
  'consumer_visual_policy:excluded': '消费者视觉政策：排除',
  'consumer_visual_policy:unknown': '消费者视觉政策：待确认',
  consumer_visual_policy: '消费者视觉政策',
  auxiliary_only: '仅辅助使用',
  core_allowed: '核心允许',
  excluded: '排除',
  unknown: '待确认',
  b2b: 'B2B',
  b2c: 'B2C',
  b2b2c: 'B2B2C',
  proposed: '待设计',
  existing: '已存在',
  derived: '可派生',
  restricted: '受限',
  none: '无',
};

// ── Difference Matrix Key 映射 ───────────────────────────
const DIFFERENCE_MATRIX_KEY_LABELS = {
  core_metaphor: '核心隐喻',
  graphic_mechanism: '图形机制',
  composition_organization: '构图组织',
  composition_logic: '构图逻辑',
  material_family: '材质体系',
  emotional_role: '情绪角色',
  spatial_behavior: '空间逻辑',
  audience_role: '受众角色',
  environment_role: '环境表达',
};

// ── Recommendation 比较优势映射 ─────────────────────────
const RECOMMENDATION_ADVANTAGE_LABELS = {
  stronger_direct_evidence: '与直接品牌证据的连接更强',
  lower_template_risk: '行业模板风险更低',
  better_audience_fit: '对核心 B2B 受众表达更准确',
  stronger_brand_culture_fit: '对品牌文化的回应更直接',
  stronger_capability_expression: '对平台能力与合规结构的表达更清晰',
  greater_cross_media_scalability: '跨媒介延展性更强',
  lower_consumer_drift_risk: '更不容易滑向消费级医美视觉',
  lower_generic_network_dependency: '更少依赖通用网络与科技网格语言',
  lower_generic_nature_dependency: '更少依赖通用自然疗愈语言',
  better_balance_of_rationality_and_warmth: '理性与温度的平衡更稳定',
};

function mapDisplayLabel(value) {
  if (!value || typeof value !== 'string') return value || '';
  return DISPLAY_LABELS[value] || DIFFERENCE_MATRIX_KEY_LABELS[value] || RECOMMENDATION_ADVANTAGE_LABELS[value] || value;
}

function mapDisplayLabelsInText(text) {
  if (!text || typeof text !== 'string') return text || '';
  let result = text;
  for (const [key, label] of Object.entries(DISPLAY_LABELS)) {
    result = result.replaceAll(key, label);
  }
  for (const [key, label] of Object.entries(DIFFERENCE_MATRIX_KEY_LABELS)) {
    result = result.replaceAll(key, label);
  }
  for (const [key, label] of Object.entries(RECOMMENDATION_ADVANTAGE_LABELS)) {
    result = result.replaceAll(key, label);
  }
  return result;
}

// ── Markdown Block Renderer ────────────────────────────────
function joinMarkdownBlocks(blocks) {
  return blocks
    .filter((block) => typeof block === 'string' && block.trim())
    .map((block) => block.trim())
    .join('\n\n');
}

function renderHeading(level, text) {
  return `${'#'.repeat(level)} ${text}`;
}

function renderBlockquote(text) {
  if (!text) return '';
  return text.split('\n').map((line) => `> ${line}`).join('\n');
}

function renderBulletList(items) {
  if (!items?.length) return '';
  return items.map((item) => `- ${item}`).join('\n');
}

function renderNestedRiskList(risks) {
  if (!risks?.length) return '';
  const lines = risks.map((r) => `  - ${cleanText(r)}`).join('\n');
  return `- 关键风险：\n${lines}`;
}

function renderMarkdownTable(headers, rows) {
  if (!rows?.length) return '';
  const headerLine = `| ${headers.join(' | ')} |`;
  const separator = `|${headers.map(() => '---').join('|')}|`;
  const rowLines = rows.map((row) => `| ${row.map((cell) => escapeCell(cell)).join(' | ')} |`).join('\n');
  return `${headerLine}\n${separator}\n${rowLines}`;
}

// ── P0 统一名称解析 ─────────────────────────────────────
export function getDirectionDisplayName(direction) {
  return (
    direction.display_name ??
    direction.name ??
    direction.title ??
    direction.direction_name ??
    direction.id ??
    '未命名方向'
  );
}

// ── P0 统一数字格式 ─────────────────────────────────────
export function formatScore(value) {
  if (!Number.isFinite(value)) return '—';
  return Number(value.toFixed(1)).toString();
}

function formatPercent(value, decimals = 2) {
  if (!Number.isFinite(value)) return '未计算';
  return `${(value * 100).toFixed(decimals)}%`;
}

// ── P1 信号类型中文映射 ───────────────────────────────────
function getSignalTypeLabel(type) {
  const labels = {
    'audience-boundary': '受众边界',
    'capability': '能力结构',
    'relationship': '生态连接',
    'emotion': '品牌情绪',
    'culture': '品牌文化',
    'aesthetic-tension': '审美张力'
  };
  return labels[type] || type;
}

// ── 推荐强度解析 ─────────────────────────────────────────
function getRecommendationStrength(comparison) {
  if (!comparison || comparison.length < 2) return { strength: 'normal', label: '推荐', display: '推荐' };
  const top1 = comparison[0];
  const top2 = comparison[1];
  const gap = (top1?.final_score ?? 0) - (top2?.final_score ?? 0);
  if (gap >= 10) return { strength: 'strong', label: '明确推荐', display: '明确推荐' };
  if (gap >= 5) return { strength: 'normal', label: '推荐', display: '推荐' };
  if (gap >= 2) return { strength: 'weak', label: '弱推荐', display: '弱推荐' };
  return { strength: 'tied', label: '并列候选，需人工选择', display: '并列候选' };
}

// ── P1 触点精简 ───────────────────────────────────────────
function buildSuitableApplications(direction, view) {
  const apps = direction.suitableApplications || [];
  const coreB2B = apps.filter((a) => a.audience === 'b2b' && a.role === 'core').slice(0, 2);
  const auxiliary = apps.filter((a) => a.role === 'auxiliary' || (a.audience !== 'b2b' && a.audience !== 'internal')).slice(0, 1);
  const selected = [...coreB2B, ...auxiliary].slice(0, 3);
  return selected.map((item) => `${item.name}[${mapDisplayLabel(item.audience)}/${mapDisplayLabel(item.role)}]`).join('、');
}

// ── P1 风险格式化 ─────────────────────────────────────────
function buildRisks(direction, _view) {
  const risks = (direction.risks || []).slice(0, 2);
  if (risks.length === 0) return '';
  return renderNestedRiskList(risks);
}

// ── 布局词过滤（D03 过度具体构图修复）──────────────────
function sanitizeLayoutText(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/左侧|右侧|中间色带|上半区|下半区|固定镜头|固定场景/g, '[具体布局细节已抽象]')
    .replace(/\[具体布局细节已抽象\]\s*，\s*\[具体布局细节已抽象\]/g, '[具体布局细节已抽象]')
    .replace(/\[具体布局细节已抽象\]\s*；\s*\[具体布局细节已抽象\]/g, '[具体布局细节已抽象]');
}

function buildDecisionAssetRows(view) {
  return view.boundaries.suggestedAssets.map((asset) =>
    `| ${asset.assetId} | ${escapeCell(asset.name)} | ${mapDisplayLabel(asset.status)} | ${asset.executable ? '是' : '否'} | ${escapeCell(asset.reason)} |`
  ).join('\n');
}

function buildDecisionCoreEvidence(view) {
  const signals = view.signals;
  const all = [];
  const usedTypes = new Set();

  for (const signal of signals) {
    const label = getSignalTypeLabel(signal.type);
    if (!usedTypes.has(label)) {
      all.push({ basis: signal.statement, opportunity: label, evidence: evidenceLabel(signal.evidenceIds) });
      usedTypes.add(label);
    }
  }

  const prohibitedEvidence = view.evidenceIndex.filter((item) => item.type === 'prohibited').slice(0, 1);
  if (!usedTypes.has('合规与信任') && prohibitedEvidence.length) {
    all.push({ basis: prohibitedEvidence[0].statement, opportunity: '合规与信任', evidence: evidenceLabel([prohibitedEvidence[0].evidenceId]) });
    usedTypes.add('合规与信任');
  }

  const identityEvidence = view.evidenceIndex.filter((item) => item.type === 'identity').slice(0, 1);
  if (!usedTypes.has('资产边界') && identityEvidence.length) {
    all.push({ basis: identityEvidence[0].statement, opportunity: '资产边界', evidence: evidenceLabel([identityEvidence[0].evidenceId]) });
    usedTypes.add('资产边界');
  }

  if (all.length === 0 && view.opportunities.visualizableFacts?.length) {
    view.opportunities.visualizableFacts.slice(0, 5).forEach((f) => {
      all.push({ basis: f.statement, opportunity: '可视化事实', evidence: evidenceLabel(f.evidenceIds) });
    });
  }

  return all.slice(0, 5);
}

function buildDecisionDirectionSection(direction, view, scoreMap) {
  const apps = buildSuitableApplications(direction, view);
  const risks = buildRisks(direction, view);
  const directionBaseScore = direction.brandFit * 0.40 + direction.inspirationValue * 0.20 + direction.distinctiveness * 0.25 + direction.scalability * 0.15;
  const finalScore = formatScore(scoreMap.get(direction.directionId) ?? directionBaseScore);
  const finalScoreNum = scoreMap.get(direction.directionId) ?? directionBaseScore;

  // 最多 11 个展示字段
  const fields = [
    renderBlockquote(direction.oneSentenceConcept),
    `- 核心隐喻：${direction.coreMetaphor}`,
    `- 品牌专属机制：${direction.distinctiveMechanism}`,
    `- 品牌证据：${evidenceLabel(direction.evidenceIds)}`,
    `- 图形语言：${direction.graphicLanguage.join('、')}`,
    `- 构图逻辑：${sanitizeLayoutText(direction.compositionLanguage)}`,
    `- 色彩与材质倾向：${direction.colorLogic}；${direction.materialLanguage.join('、')}`,
    `- 情绪角色：${direction.emotionalRole}`,
    `- 适用触点：${apps}`,
    risks,
    `- 最终分：${finalScore}`
  ].filter((f) => f !== '');

  let section = renderHeading(3, `${direction.directionId}「${getDirectionDisplayName(direction)}」`);

  // 低分状态
  if (finalScoreNum < 50) {
    section += '\n\n> 方向状态：不建议进入 Sprint 2';
  } else if (finalScoreNum < 60) {
    section += '\n\n> 状态：低优先级方向，仅保留用于比较，不建议进入下一阶段。';
  }

  section += '\n\n' + fields.join('\n');
  return section;
}

function buildDecisionMatrixRows(view) {
  return view.differenceMatrix.pairs.map((pair) => {
    const traits = pair.shared_visual_traits
      .slice(0, 3)
      .map((trait) => mapDisplayLabelsInText(trait))
      .join('、') || '无显著共性';
    const conclusion = mapDisplayLabel(pair.status) || (pair.total_score < 9 ? '需继续拉开' : '明显不同');
    return `| ${pair.direction_pair} | ${escapeCell(traits)} | ${formatScore(pair.total_score)} / ${formatScore(pair.max_score)} | ${escapeCell(conclusion)} |`;
  }).join('\n');
}

function buildDecisionComparisonRows(view) {
  return view.recommendation.comparison.map((item) => {
    const direction = view.directions.find((candidate) => candidate.directionId === item.directionId);
    return `| ${item.rank} | ${item.directionId}「${escapeCell(getDirectionDisplayName(direction))}」 | ${formatScore(item.base_score)} | ${formatScore(item.confidence_adjusted_score)} | ${formatScore(item.risk_penalty)} | ${formatScore(item.final_score)} |`;
  }).join('\n');
}

// ── P1 摘要推荐理由（60-140 字，包含至少两类）────────────────
function buildDecisionSummaryRecommendation(view) {
  const top = view.recommendation.comparison[0];
  const second = view.recommendation.comparison[1];
  const reasons = [];
  const brandName = view.identity.brandName;

  if (top?.base_score >= 75) {
    reasons.push('品牌匹配度高');
  }

  if (second) {
    if (top.final_score > second.final_score + 5) {
      reasons.push(`与${second.directionId}相比综合优势显著`);
    } else if (top.final_score > second.final_score) {
      reasons.push(`与${second.directionId}相比领先幅度有限`);
    }
  }

  const topRisks = top?.penalty_reasons || [];
  const mappedRisks = topRisks.map((r) => mapDisplayLabelsInText(r)).filter((r) => r && !r.includes('template_risk:'));
  if (mappedRisks.length > 0) {
    reasons.push(`需注意${mappedRisks[0]}`);
  } else if (top?.risk_penalty > 5) {
    reasons.push('风险较高，需在 Sprint 2 中加强约束');
  } else if (top?.risk_penalty > 2) {
    reasons.push('模板风险可控');
  }

  if (top?.evidence_confidence >= 0.85) {
    reasons.push('品牌证据充分');
  }

  if (reasons.length < 2) {
    reasons.push('综合表现最优');
  }

  const text = reasons.slice(0, 3).join('，');
  if (text.length > 140) return text.slice(0, 137) + '...';
  return text;
}

function buildDecisionRecommendationText(view) {
  const comparison = view.recommendation.comparison;
  const top = comparison[0];
  const second = comparison[1];
  const third = comparison[2];
  const topDirection = view.directions.find((d) => d.directionId === top?.directionId);
  const topName = getDirectionDisplayName(topDirection || top);
  const strength = getRecommendationStrength(comparison);

  // 1. 专属价值（使用稳定字段，不截断长文本）
  let text = `${topName} `;
  if (topDirection?.oneSentenceConcept) {
    text += `直接承接品牌定位的核心表达，`;
  } else {
    text += '对品牌定位回应最直接，';
  }

  // 2. 与其他方向比较（禁止截断 mechanism，使用 score 等稳定字段）
  if (second) {
    const secondDirection = view.directions.find((d) => d.directionId === second.directionId);
    const secondName = getDirectionDisplayName(secondDirection || second);
    const scoreGap = formatScore((top?.final_score ?? 0) - (second?.final_score ?? 0));
    text += `与${secondName}相比最终分领先${scoreGap}分`;
    if (top?.evidence_confidence > second?.evidence_confidence) {
      text += '，证据置信度更高';
    }
    if (top?.risk_penalty < second?.risk_penalty) {
      text += '，风险更低';
    }
    if (third) {
      const thirdDirection = view.directions.find((d) => d.directionId === third.directionId);
      const thirdName = getDirectionDisplayName(thirdDirection || third);
      text += `；相比${thirdName}，其综合稳定性更优`;
    }
    text += '。';
  }

  text = cleanText(text);
  if (text.length > 250) text = text.slice(0, 247) + '...';
  return text;
}

function buildDecisionEvidenceRows(view) {
  return view.evidenceIndex.map((item) =>
    `| ${item.evidenceId} | ${item.type} | ${escapeCell(item.shortestQuote || item.statement)} | ${escapeCell(item.sourceFile)} |`
  ).join('\n');
}

// ── 最终输出清理器 ───────────────────────────────────────
export function sanitizeDecisionReport(markdown) {
  let text = String(markdown || '');
  // 清理双句号、重复空格（仅限行内空格，不破坏换行）
  text = text.replace(/。{2,}/g, '。').replace(/\.{2,}/g, '.').replace(/[ \t]{2,}/g, ' ');
  // 清理重复 Metadata Key（如 primary_language_ratio 出现两次）—— 仅针对附录元数据白名单，避免误伤正文 bullet
  const METADATA_KEYS = new Set([
    'report_version', 'report_mode', 'document_set_hash', 'model', 'model_calls',
    'input_tokens', 'output_tokens', 'duration_ms', 'primary_language_ratio', 'language_status'
  ]);
  const seenMetadataKeys = new Set();
  text = text.replace(/^- (\w+).*$/gmu, (match, key) => {
    if (!METADATA_KEYS.has(key)) return match;
    if (seenMetadataKeys.has(key)) return '';
    seenMetadataKeys.add(key);
    return match;
  });
  // 清理重复 Sprint 2 Notice（只保留第一个）
  let firstNotice = true;
  text = text.replace(/> 本阶段只定义视觉方向.*?Sprint 2。/g, (match) => {
    if (firstNotice) { firstNotice = false; return match; }
    return '';
  });
  // 清理重复全局人物政策（只保留第一个）
  let firstPolicy = true;
  text = text.replace(/> 全局人物政策：.*?(?:\n|$)/g, (match) => {
    if (firstPolicy) { firstPolicy = false; return match; }
    return '';
  });
  // 清理空列表行
  text = text.replace(/\n- \s*\n/g, '\n');
  // 清理 bullet 间多余空行（超过两个连续换行）
  text = text.replace(/(\n- [^\n]+)\n{2,}(?=- )/g, '$1\n');
  // 清理中英文标点混乱（保留中文逗号句号，移除英文逗号句号后的多余空格，但不破坏换行）
  text = text.replace(/，[ \t]+/g, '，').replace(/。[ \t]+/g, '。');
  // 清理 - 关键风险：- 的异常格式
  text = text.replace(/- 关键风险：\s*-\s+/g, '- 关键风险：\n  - ');
  // 修复 。- 粘连（Bullet 前缺少空行，但避免在 bullet 列表内部误伤）
  text = text.replace(/。(?!\n- )\s*-(?!-)\s/g, '。\n\n- ');
  // 修复所有标题前缺少空行的情况（避免在行首匹配，避免把 ### 拆成 # + ##）
  text = text.replace(/([^\n#])(#{2,3}\s)/g, '$1\n\n$2');
  // 修复 Blockquote 前缺少空行
  text = text.replace(/([^\n])(> )/g, '$1\n\n$2');
  // 清理孤立 #（空标题）—— 必须放在标题修复之后
  text = text.replace(/^#{1,6}\s*$/gm, '');
  // 清理 Enum 泄漏（通用 snake_case 和 key:value）
  text = text.replace(/[a-z_]+_[a-z_]+:[a-z_]+/g, (match) => {
    if (/^[a-z]+-[0-9]+$/.test(match) || /^v\d+\.\d+\.\d+$/.test(match) || match.includes('report_mode') || match.includes('evidence_basis')) return match;
    return mapDisplayLabel(match) || match;
  });
  // 清理孤立 snake_case（不是 key:value 形式）
  text = text.replace(/\b(core_metaphor|graphic_mechanism|composition_organization|composition_logic|material_family|emotional_role|spatial_behavior|audience_role|environment_role)\b/g, (match) => mapDisplayLabel(match) || match);
  // 清理未闭合括号（至少检查常见括号）
  const openParens = (text.match(/\(/g) || []).length;
  const closeParens = (text.match(/\)/g) || []).length;
  if (openParens > closeParens) {
    text = text.replace(/([^\n])$/, '$1');
  }
  // 清理重复连字符
  text = text.replace(/-{2,}/g, '-');
  return text.trim();
}

export function validateDecisionReportRender(markdown) {
  const text = String(markdown || '');
  const errors = [];
  const isDecisionReport = text.includes('决策摘要');

  const INVALID_RENDER = /undefined|null|NaN|\[object Object\]/i;
  if (INVALID_RENDER.test(text)) {
    const matches = [...text.matchAll(/undefined|null|NaN|\[object Object\]/gi)];
    errors.push(`invalid_render: 发现非法渲染值 ${matches.map((m) => m[0]).join(', ')}`);
  }
  // 检查孤立 #
  if (/^#{1,6}\s*$/gm.test(text)) {
    errors.push('orphan_heading: 发现孤立标题');
  }
  // 检查同一 Metadata Key 是否重复
  const METADATA_KEYS = new Set([
    'report_version', 'report_mode', 'document_set_hash', 'model', 'model_calls',
    'input_tokens', 'output_tokens', 'duration_ms', 'primary_language_ratio', 'language_status'
  ]);
  const metaKeys = [...text.matchAll(/^- (\w+).*$/gmu)].map((m) => m[1]).filter((key) => METADATA_KEYS.has(key));
  const dupes = metaKeys.filter((item, index) => metaKeys.indexOf(item) !== index);
  if (dupes.length) errors.push(`duplicate_metadata_key: ${dupes.join(', ')}`);
  // 检查 Direction 分数是否超过 3 位小数
  if (/\d+\.\d{3,}/.test(text)) {
    const badScores = [...text.matchAll(/\d+\.\d{3,}/g)].map((m) => m[0]);
    errors.push(`float_precision_leak: ${badScores.join(', ')}`);
  }
  // 检查 Recommendation Name 是否为空
  if (!text.includes('未命名方向') && /推荐.*[·|]\s*\n/.test(text)) {
    errors.push('empty_recommendation_name');
  }
  // 检查 Sprint 2 Notice 只出现一次
  const noticeCount = (text.match(/> 本阶段只定义视觉方向.*?Sprint 2。/g) || []).length;
  if (noticeCount > 1) errors.push(`sprint2_notice_duplicate: ${noticeCount} 次`);
  // 检查 Markdown 粘连
  if (/[^ \n#]#{2,3}\s/.test(text)) {
    errors.push('markdown_adhesion: 标题粘连（缺少前导空行）');
  }
  // 检查 .### 粘连
  if (/。#{2,3}\s/.test(text)) {
    errors.push('markdown_adhesion: 标题与句末粘连');
  }
  // 检查 .- 粘连
  const dotListMatch = text.match(/。-\s/);
  if (dotListMatch) {
    errors.push('markdown_adhesion: 列表与句末粘连');
  }
  // 检查 .> 粘连
  if (/。>\s/.test(text)) {
    errors.push('markdown_adhesion: Blockquote 与句末粘连');
  }
  // 检查 Enum 泄漏
  if (/template_risk:/.test(text)) {
    errors.push('enum_leak: template_risk');
  }
  if (/[a-z_]+_[a-z_]+:[a-z_]+/.test(text)) {
    const leaks = [...text.matchAll(/[a-z_]+_[a-z_]+:[a-z_]+/g)].map((m) => m[0]);
    const filtered = leaks.filter((l) => !/^v\d+\.\d+\.\d+$/.test(l) && !l.includes('report_mode') && !/^[a-z]+-[0-9]+$/.test(l) && !l.includes('evidence_basis') && !l.includes('derived_evidence') && !l.includes('confirmed_evidence') && !l.includes('reasonable_inference') && !l.includes('suggested_evidence'));
    if (filtered.length) errors.push(`enum_leak: ${filtered.join(', ')}`);
  }
  // 检查孤立 snake_case
  const isolatedSnake = [...text.matchAll(/\b(core_metaphor|graphic_mechanism|composition_organization|composition_logic|material_family|emotional_role|spatial_behavior|audience_role|environment_role)\b/g)].map((m) => m[0]);
  if (isolatedSnake.length) errors.push(`enum_leak: ${isolatedSnake.join(', ')}`);
  // 检查全局人物政策只出现一次
  const policyCount = (text.match(/> 全局人物政策：/g) || []).length;
  if (policyCount > 1) errors.push(`global_people_policy_duplicate: ${policyCount} 次`);
  // 检查 Direction 内是否仍有独立人物政策（不应出现）
  if (isDecisionReport) {
    const directionPeoplePolicy = text.match(/#{3}\s*D\d+.*?\n- 人物政策：/g);
    if (directionPeoplePolicy) errors.push('direction_people_policy_found: 人物政策应在全局输出');
  }
  // 检查风险列表粘连
  if (/- \S+。\s*- \S+。\s*- \S+。/.test(text)) {
    errors.push('risk_list_adhesion: 风险列表未正确换行');
  }
  // 检查未闭合括号
  const openRound = (text.match(/\(/g) || []).length;
  const closeRound = (text.match(/\)/g) || []).length;
  const openSquare = (text.match(/\[/g) || []).length;
  const closeSquare = (text.match(/\]/g) || []).length;
  if (openRound !== closeRound) errors.push(`unbalanced_parens: 圆括号未闭合 (${openRound} vs ${closeRound})`);
  if (openSquare !== closeSquare) errors.push(`unbalanced_brackets: 方括号未闭合 (${openSquare} vs ${closeSquare})`);
  // 检查 Bullet 多余空行
  const bulletBlankMatch = text.match(/(\n- [^\n]+)\n{2,}(?=- )/);
  if (bulletBlankMatch) {
    errors.push('bullet_extra_blank: Bullet 间存在多余空行');
  }
  // 检查内部字段泄漏（仅对 decision 报告）
  if (isDecisionReport) {
    if (text.includes('Provider 未返回')) errors.push('leak: Provider 未返回');
    if (/\b(evidence_basis|business_model|consumer_visual_policy)\b/.test(text)) {
      const fieldLeaks = [...text.matchAll(/\b(evidence_basis|business_model|consumer_visual_policy)\b/g)].map((m) => m[0]);
      errors.push(`enum_leak: ${fieldLeaks.join(', ')}`);
    }
  }

  // 仅对 decision 报告检查版本和模式
  if (isDecisionReport) {
    if (!text.includes('v1.3.3')) errors.push('missing_report_version');
    if (!text.includes('report_mode')) errors.push('missing_report_mode');
  }

  if (errors.length) {
    const error = new Error(`Decision Report 渲染验证失败：${errors.join('；')}`);
    error.code = 'INVALID_RENDER';
    error.errors = errors;
    throw error;
  }
  return true;
}

function compileDecisionReport(view) {
  const REPORT_VERSION = 'visual-directions-report-v1.3.3';
  const REPORT_MODE = 'decision';
  const COMPILER_VERSION = 'decision-report-compiler-v1.3.3';

  const scoreMap = new Map(view.recommendation.comparison.map((item) => [item.directionId, item.final_score]));

  const assetRows = buildDecisionAssetRows(view);
  const coreEvidence = buildDecisionCoreEvidence(view);
  const coreEvidenceRows = coreEvidence.map((item) =>
    `| ${escapeCell(item.basis)} | ${escapeCell(item.opportunity)} | ${item.evidence} |`
  ).join('\n');
  const directionSections = view.directions.map((d) => buildDecisionDirectionSection(d, view, scoreMap));
  const matrixRows = buildDecisionMatrixRows(view);
  const comparisonRows = buildDecisionComparisonRows(view);
  const evidenceRows = buildDecisionEvidenceRows(view);
  const recommendationText = buildDecisionRecommendationText(view);
  const summaryRecommendation = buildDecisionSummaryRecommendation(view);
  const strength = getRecommendationStrength(view.recommendation.comparison);

  const categoryCliches = view.opportunities.categoryCliches.slice(0, 5);
  const clicheRows = categoryCliches.map((item) =>
    `| ${escapeCell(mapDisplayLabel(item.pattern))} | ${escapeCell(mapDisplayLabelsInText(item.allowedWhen))} | ${escapeCell(mapDisplayLabelsInText(item.prohibitedWhen))} |`
  ).join('\n');

  const sprint2Notice = '> 本阶段只定义视觉方向，不锁定镜头、人物动作、精确灯光、产品摆拍或单一 Anchor 场景；上述决策统一后置至 Sprint 2。';
  const globalPeoplePolicy = '> 全局人物政策：默认不使用女性面部或肌肤特写；只有在明确的下游业务结果场景中，经人工批准后才可作为非核心辅助信息出现。';

  const recommendedRole = view.recommended.recommendedRole || 'core_brand_direction';
  const roleLabel = mapDisplayLabel(recommendedRole);

  // 使用结构化 Block API 构建
  const blocks = [];

  // Header
  blocks.push(
    renderHeading(1, `${view.identity.projectName} 视觉方向决策报告`),
    renderBlockquote(`**协议**：${view.protocol.protocolVersion}<br>
**报告版本**：${REPORT_VERSION}<br>
**报告模式**：${REPORT_MODE}<br>
**编译器**：${COMPILER_VERSION}<br>
**状态**：${view.protocol.status}`)
  );

  // 0. 决策摘要
  blocks.push(
    renderHeading(2, '0. 决策摘要'),
    renderBulletList([
      `品牌：${view.identity.brandName}`,
      `业务属性：${mapDisplayLabel(view.audienceBoundary.businessModel)}`,
      `推荐方向：${view.recommended.directionId}「${getDirectionDisplayName(view.recommended)}」`,
      `推荐角色：${roleLabel}`,
      `推荐强度：${strength.display}`,
      `推荐理由：${summaryRecommendation}`,
      `当前状态：${view.recommendation.humanSelectionRequired ? '等待人工确认' : '可直接进入下一阶段'}`,
      `下一阶段：Anchor Direction System`
    ]),
    strength.strength === 'tied' ? renderBlockquote(`建议优先比较：${view.recommended.directionId}「${getDirectionDisplayName(view.recommended)}」与 ${view.recommendation.comparison[1]?.directionId || '第二名'}`) : ''
  );

  // 1. 品牌边界与资产
  blocks.push(
    renderHeading(2, '1. 品牌边界与资产'),
    renderBulletList([
      `项目：${view.identity.projectName}`,
      `品牌：${view.identity.brandName}`,
      `业务模式：${mapDisplayLabel(view.audienceBoundary.businessModel)}`,
      `核心受众：${view.audienceBoundary.primaryAudience.map((item) => item.label).join('、') || 'unknown'}`,
      `排除受众：${view.audienceBoundary.excludedAudience.map((item) => item.label).join('、') || 'unavailable'}`,
      `消费者视觉政策：${mapDisplayLabel(view.audienceBoundary.consumerVisualPolicy)}`,
      `锁定资产：${view.boundaries.lockedAssets.join('、') || '无'}`
    ]),
    renderHeading(3, '建议资产'),
    renderMarkdownTable(
      ['ID', '资产', '状态', '当前可执行', '原因'],
      view.boundaries.suggestedAssets.map((asset) => [asset.assetId, asset.name, mapDisplayLabel(asset.status), asset.executable ? '是' : '否', asset.reason])
    ) || '| — | 无 | — | — | — |'
  );

  // 2. 核心视觉依据
  blocks.push(
    renderHeading(2, '2. 核心视觉依据'),
    renderMarkdownTable(
      ['核心依据', '视觉转译机会', '证据'],
      coreEvidence.map((item) => [item.basis, item.opportunity, item.evidence])
    ) || '| 暂无 | 暂无 | 待确认 |'
  );

  // 3. 行业模板与禁止项
  blocks.push(
    renderHeading(2, '3. 行业模板与禁止项'),
    renderMarkdownTable(
      ['风险模板', '允许', '禁止'],
      categoryCliches.map((item) => [mapDisplayLabel(item.pattern), item.allowedWhen, item.prohibitedWhen])
    ) || '| 暂无 | 暂无 | 暂无 |'
  );

  // 4. 三个视觉方向
  blocks.push(
    renderHeading(2, '4. 三个视觉方向'),
    globalPeoplePolicy,
    sprint2Notice,
    ...directionSections
  );

  // 5. 方向差异矩阵
  blocks.push(
    renderHeading(2, '5. 方向差异矩阵'),
    renderMarkdownTable(
      ['方向对', '共享特征', '差异分', '结论'],
      view.differenceMatrix.pairs.map((pair) => [
        pair.direction_pair,
        pair.shared_visual_traits.slice(0, 3).map((t) => mapDisplayLabelsInText(t)).join('、') || '无显著共性',
        `${formatScore(pair.total_score)} / ${formatScore(pair.max_score)}`,
        mapDisplayLabel(pair.status) || (pair.total_score < 9 ? '需继续拉开' : '明显不同')
      ])
    ) || '| 暂无 | 暂无 | 0 | 待确认 |'
  );

  // 6. 方向评分与比较
  blocks.push(
    renderHeading(2, '6. 方向评分与比较'),
    renderMarkdownTable(
      ['排名', '方向', '基础分', '置信度调整', '风险扣分', '最终分'],
      view.recommendation.comparison.map((item) => {
        const direction = view.directions.find((d) => d.directionId === item.directionId);
        return [item.rank, `${item.directionId}「${getDirectionDisplayName(direction)}」`, formatScore(item.base_score), formatScore(item.confidence_adjusted_score), formatScore(item.risk_penalty), formatScore(item.final_score)];
      })
    ),
    renderHeading(3, `推荐：${view.recommended.directionId}「${getDirectionDisplayName(view.recommended)}」`),
    recommendationText,
    '进入 Sprint 2 前需解决：',
    list(view.recommendation.unresolvedRisks)
  );

  // 7. 证据索引
  blocks.push(
    renderHeading(2, '7. 证据索引'),
    renderMarkdownTable(
      ['ID', '类型', '最短证据', '来源'],
      view.evidenceIndex.map((item) => [item.evidenceId, item.type, item.shortestQuote || item.statement, item.sourceFile])
    ) || '| 暂无 | 暂无 | 暂无 | 暂无 |'
  );

  // 附录：运行元数据
  const modelCalls = view.metadata.modelCallCount;
  const inputTokens = view.metadata.usage.inputTokens;
  const outputTokens = view.metadata.usage.outputTokens;
  blocks.push(
    renderHeading(2, '附录：运行元数据'),
    renderBulletList([
      `report_version：${REPORT_VERSION}`,
      `report_mode：${REPORT_MODE}`,
      `document_set_hash：${view.metadata.documentSetHash}`,
      `model：${view.metadata.models.join('、') || 'Checkpoint / 本地阶段'}`,
      `model_calls：${modelCalls}`,
      `input_tokens：${inputTokens !== undefined && inputTokens !== null ? inputTokens : '不适用'}`,
      `output_tokens：${outputTokens !== undefined && outputTokens !== null ? outputTokens : '不适用'}`,
      `duration_ms：${view.metadata.durationMs}`
    ])
  );

  let report = joinMarkdownBlocks(blocks);

  const body = report.trim();
  const language = measurePrimaryLanguage(body, view.reportLanguage);
  let fullReport = `${body}\n- primary_language_ratio：${formatPercent(language.primary_language_ratio)}\n- language_status：${language.language_status}\n`;

  fullReport = sanitizeDecisionReport(fullReport);
  validateDecisionReportRender(fullReport);
  return fullReport;
}

function compileFullReport(view) {
  const assetRows = view.boundaries.suggestedAssets.map((asset) => `| ${asset.assetId} | ${escapeCell(asset.name)} | ${asset.assetType} | ${asset.status} | ${asset.execution_scope} | ${asset.executable ? '是' : '否'} | ${asset.requires_human_approval ? '是' : '否'} | ${escapeCell(asset.restriction_reason || '无')} | ${escapeCell(asset.reason)} |`).join('\n');
  const directionSections = view.directions.map((direction) => {
    const sanitizedDistinctive = sanitizeDirectionText(direction.distinctiveMechanism, view);
    return `### ${direction.directionId} · ${direction.name}

${direction.internalCodeName ? `英文代号：${direction.internalCodeName}\n` : ''}

> ${direction.oneSentenceConcept}

- 核心隐喻：${direction.coreMetaphor}
- 专属机制：${sanitizedDistinctive}
- 品牌专属理由：${direction.mechanismAssessment.brandSpecificReason}
- 理由依据：${direction.mechanismAssessment.reasonBasis}
- 行业模板风险：${direction.mechanismAssessment.industryTemplateRisk}
- 替代机制：${direction.mechanismAssessment.replacementMechanism}
- 策略信号：${direction.strategicSignals.join('、')}
- 证据：${evidenceLabel(direction.evidenceIds)}
- 依据类型：${direction.reason_basis}
- 证据置信度：${direction.evidence_confidence}
- 图形语言：${direction.graphicLanguage.join('、')}
- 色彩逻辑：${direction.colorLogic}
- 材质家族：${direction.materialLanguage.join('、')}
- 高层光线原则：${direction.lightingLanguage}
- 构图原则：${direction.compositionLanguage}
- 情绪角色：${direction.emotionalRole}
- 空间行为：${direction.spatialBehavior}
- 人物政策：${direction.subjectPolicy.people}（${direction.subjectPolicy.peopleRole}）
- 产品政策：${direction.subjectPolicy.products}（${direction.subjectPolicy.productRole}）
- 环境政策：${direction.subjectPolicy.environment}（${direction.subjectPolicy.environmentRole}）
- 适用触点：${direction.suitableApplications.map((item) => `${item.name}[${item.audience}/${item.role}]`).join('、')}
- 可执行资产：${direction.executableAssetIds.join('、') || '无'}
- Sprint 2 后置项：${direction.deferredToAnchor.join('、')}
- 横向评分：品牌匹配 ${direction.brandFit} / 灵感价值 ${direction.inspirationValue} / 独特性 ${direction.distinctiveness} / 延展性 ${direction.scalability}
- 风险拆分：模板 ${direction.risk_breakdown.template_risk_penalty} / 受众 ${direction.risk_breakdown.audience_risk_penalty} / 证据 ${direction.risk_breakdown.evidence_risk_penalty} / 资产 ${direction.risk_breakdown.asset_risk_penalty} / 反模式 ${direction.risk_breakdown.anti_pattern_penalty}
- 风险扣分合计：${direction.risk_breakdown.risk_penalty_total}

**已知风险**

${list(direction.risks)}`;
  }).join('\n\n');

  const comparisonRows = view.recommendation.comparison.map((item) => {
    const direction = view.directions.find((candidate) => candidate.directionId === item.directionId);
    return `| ${item.rank} | ${item.directionId} · ${escapeCell(direction.name)} | ${item.base_score} | ${item.evidence_confidence} | ${item.confidence_adjusted_score} | ${item.risk_penalty} | ${item.final_score} | ${escapeCell(item.penalty_reasons.map((r) => mapDisplayLabelsInText(r)).join('、') || '无')} |`;
  }).join('\n');
  const matrixRows = view.differenceMatrix.pairs.map((pair) => `| ${pair.direction_pair} | ${escapeCell(pair.shared_visual_traits.join('、') || '无显著共性')} | ${pair.dimensions.map((item) => `${item.name}=${item.score}：${item.reason}`).join('<br>')} | ${pair.total_score} / ${pair.max_score} | ${pair.status} | ${pair.full_difference_review_required ? '需要' : '不需要'} | ${escapeCell(pair.review_result || '待复核')} |`).join('\n');
  const evidenceRows = view.evidenceIndex.map((item) => `| ${item.evidenceId} | ${item.type} | ${escapeCell(item.statement)} | ${escapeCell(item.shortestQuote)} | ${escapeCell(item.sourceFile)} |`).join('\n');
  const signalRows = view.signals.map((item) => `| ${item.signalId} | ${item.type} | ${escapeCell(item.statement)} | ${item.reason_basis} | ${item.evidence_confidence} | ${item.importance} | ${item.visualPotential} | ${evidenceLabel(item.evidenceIds)} |`).join('\n');
  const opportunityBlock = (title, items) => `### ${title}\n\n${items.map((item) => `- **${item.opportunityId}** ${item.statement}（品牌化潜力：${item.brandability}；依据类型：${item.reason_basis}；置信度：${item.evidence_confidence}；说明：${item.rationale}；证据：${evidenceLabel(item.evidenceIds)}）`).join('\n')}`;
  const report = `# ${view.identity.projectName}视觉方向报告

> **协议**：${view.protocol.protocolVersion}<br>
> **报告版本**：${view.protocol.reportVersion}<br>
> **状态**：${view.protocol.status}<br>
> **决策边界**：系统只做方向推荐，人工选择后才能进入 Anchor Direction System。

## 0. 视觉任务摘要

本报告将已批准文档压缩为视觉证据、策略信号与机会地图，并提出三个可比较方向。它不是完整品牌战略重建，也不提前锁定 Sprint 2 的 Anchor 场景、具体镜头或产品摆拍。

- 推荐方向：${view.recommended.directionId} · ${view.recommended.name}
- 推荐仍需人工确认：${view.recommendation.humanSelectionRequired ? '是' : '否'}
- 选择方法：${view.recommendation.selection_method}
- 来源文件：${view.metadata.sourceFiles.join('、')}

## 1. 品牌事实、受众与资产边界

- 项目：${view.identity.projectName}
- 品牌：${view.identity.brandName}
- Business Model：${view.audienceBoundary.businessModel}
- Primary Audience：${view.audienceBoundary.primaryAudience.map((item) => item.label).join('、') || 'unknown'}
- Excluded Audience：${view.audienceBoundary.excludedAudience.map((item) => item.label).join('、') || 'unavailable'}
- Consumer Visual Policy：${view.audienceBoundary.consumerVisualPolicy}
- Locked Assets：${view.boundaries.lockedAssets.join('、') || '无'}

### Suggested Assets

| ID | 资产 | 类型 | 状态 | 执行范围 | 可执行 | 需人工批准 | 限制原因 | 说明 |
|---|---|---|---|---|---|---|---|---|
${assetRows || '| — | 无 | — | — | — | — | — | — | — |'}

## 2. 六类视觉策略信号

| ID | 类型 | 信号 | 依据类型 | 置信度 | 重要度 | 视觉潜力 | 证据 |
|---|---|---|---|---:|---|---|---|
${signalRows}

## 3. 视觉机会地图

${opportunityBlock('可视化事实', view.opportunities.visualizableFacts)}

${opportunityBlock('视觉隐喻', view.opportunities.metaphors)}

${opportunityBlock('核心审美张力', view.opportunities.aestheticTensions)}

### 行业模板风险

${view.opportunities.categoryCliches.map((item) => `- **${item.clicheId} · ${item.pattern}**：${item.risk}。允许：${item.allowedWhen}；禁止：${item.prohibitedWhen}。`).join('\n')}

## 4. 三个视觉方向

${directionSections}

## 5. 方向语义差异矩阵

| 方向对 | 共享视觉特征 | 六维语义评分与说明 | 总分 | 状态 | 满分复核 | 复核结果 |
|---|---|---|---:|---|---|---|
${matrixRows}

评分含义：0 为高度相似，1 为部分差异，2 为明显差异。总分 0–5 需要重写，6–8 需要加强，9–12 通过。

## 6. 方向评分与比较

| 排名 | 方向 | 基础分 | 证据置信度 | 置信度调整分 | 风险扣分 | 最终分 | 扣分原因 |
|---:|---|---:|---:|---:|---:|---:|---|
${comparisonRows}

评分公式：base_score = brand_fit × 0.40 + inspiration_value × 0.20 + distinctiveness × 0.25 + scalability × 0.15；confidence_adjusted_score = base_score × evidence_confidence；final_score = max(0, confidence_adjusted_score - risk_penalty)。全部使用 0–100 量纲。

## 7. 推荐方向

### ${view.recommended.directionId} · ${view.recommended.name}

${numbered(view.recommendation.rationale)}

**决策因素**

${list(view.recommendation.strategic_factors.map((f) => mapDisplayLabelsInText(f)))}

**建议保留**

${list(view.recommendation.preservedStrengths)}

**仍需解决**

${list(view.recommendation.unresolvedRisks)}

## 附录 A：Evidence Index

| ID | 类型 | 陈述 | 最短必要引文 | 原始文件 |
|---|---|---|---|---|
${evidenceRows}

## 附录 B：运行元数据

- 报告语言：${view.reportLanguage}
- Document Set Hash：${view.metadata.documentSetHash}
- 模型调用：${view.metadata.modelCallCount}
- 输入 Token：${view.metadata.usage.inputTokens || 'Provider 未返回'}
- 输出 Token：${view.metadata.usage.outputTokens || 'Provider 未返回'}
- 阶段累计耗时：${view.metadata.durationMs} ms
- 模型：${view.metadata.models.join('、') || 'Checkpoint / 本地阶段'}
`;
  const body = report.trim();
  const language = measurePrimaryLanguage(body, view.reportLanguage);
  return `${body}\n- 主语言比例：${language.primary_language_ratio}\n- 语言状态：${language.language_status}\n`;
}

export function compileVisualDirectionsReport(view, { mode = 'decision' } = {}) {
  if (mode === 'full') {
    return compileFullReport(view);
  }
  return compileDecisionReport(view);
}

export function measureVisualReportComposition(markdown) {
  const text = String(markdown || '');
  const base = text.match(/## 1\. 品牌(?:事实|边界)([\s\S]*?)(?=\n## 2\.)/)?.[1]?.length || 0;
  const visual = text.match(/## 2\. (?:六类视觉策略信号|核心视觉依据)([\s\S]*?)(?=\n## (?:附录|7\. |6\. ))/)?.[1]?.length || 0;
  const substantive = base + visual;
  return { baseCharacters: base, visualCharacters: visual, visualRatio: substantive ? visual / substantive : 0 };
}
