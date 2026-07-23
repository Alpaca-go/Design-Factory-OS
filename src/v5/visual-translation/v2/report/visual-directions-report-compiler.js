import { buildVisualAssetPipelineStatus } from '../visual-fact-first/visual-asset-pipeline-status.js';

const LOCAL_STATUS_LABELS = Object.freeze({
  blocked: '存在阻断项',
  rewrite_required: '需修改',
  ready_with_warnings: '修改后可继续',
  ready: '可继续'
});

const STATUS_LABELS = Object.freeze({
  ...LOCAL_STATUS_LABELS,
  allowed: '允许执行',
  conditional: '条件执行',
  complete: '完整',
  partial: '部分完整',
  fallback: '降级运行',
  failed: '失败',
  not_available: '未提供',
  not_configured: '未配置',
  completed: '已完成',
  fixture: '离线样例',
  Recommended: '推荐',
  'Promising With Revision': '修改后可用',
  Weak: '较弱'
});

const FAMILY_LABELS = Object.freeze({
  supply_chain_trust: '可信交付',
  product_material_aesthetics: '品质选择',
  industry_ecosystem: '生态协同'
});

const ISSUE_COPY = Object.freeze({
  BRAND_NAME_NOT_PRESERVED: ['品牌关系否定语境误识别', '修复实体抽取与否定语境识别，不要求修改方向内容。'],
  CONSUMER_WEIGHT_CONSISTENCY: ['用户价值与表达权重不一致', '校准用户价值定位及相应的视觉权重。'],
  ASSET_AUTHORIZATION_WARNING: ['素材或数据需要占位处理', '只使用已确认的素材和事实，未确认内容改为结构占位。'],
  EVIDENCE_BOUND_VALUE_REQUIRED: ['无证据具体数据', '补充 confirmed EvidenceRef，或将具体数据改为结构占位。'],
  ANCHOR_MECHANISM_ENHANCEMENT_REQUIRED: ['核心视觉机制需要加强', '补齐选择维度、映射规则和差异化原则。'],
  EXECUTION_EXAMPLE_INCOMPLETE: ['执行触点信息不完整', '补齐画布、主体、信息区、品牌区和响应式适配。'],
  EXECUTION_EXAMPLE_SPECIFICITY: ['执行触点仍过于抽象', '把概念词改写为可见对象、位置、比例和组版行为。'],
  UNAUTHORIZED_INSTITUTION_PHOTOGRAPHY_RISK: ['机构摄影授权边界待确认', '将机构摄影改为匿名化服务场景、平台界面或服务交付节点。'],
  GENERIC_ECOSYSTEM_TOPOLOGY_RISK: ['生态图形机制过于通用', '减少通用节点与箭头，增加角色价值带、服务交换和结果回流。']
});

const CATEGORY_META = Object.freeze({
  pipeline: { title: '管线问题', order: 0 },
  evidence: { title: '事实与证据问题', order: 1 },
  brand_authorization: { title: '品牌与授权问题', order: 2 },
  direction_quality: { title: '方向内容问题', order: 3 },
  asset_placeholder: { title: '素材与占位问题', order: 4 }
});

const SEVERITY_ORDER = Object.freeze({ block: 0, rewrite: 1, warning: 2 });

function compact(value, fallback = '—') {
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(value)) return value.length ? value.map((item) => compact(item, '')).filter(Boolean).join('、') : fallback;
  if (typeof value === 'object') {
    const text = Object.values(value).map((item) => compact(item, '')).filter(Boolean).join('；');
    return text || fallback;
  }
  const text = String(value).replace(/\s+/gu, ' ').trim();
  return text && !['undefined', 'null', '[object Object]'].includes(text) ? text : fallback;
}

function truncate(value, max = 120) {
  const text = compact(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function cleanCriticText(value, fallback = '未提供') {
  const text = compact(value, '').replace(/[—–-]{2,}\s*$/gu, '').trim();
  return text || fallback;
}

function userSafeText(value) {
  const text = compact(value, '');
  if (!text
    || /visualDirectionV2\.|field_path|matched_rule|rule_id/iu.test(text)
    || /^[A-Z0-9_:-]+$/u.test(text)
    || /[a-z]+(?:_[a-z0-9]+){1,}/u.test(text)
    || /^(存在一项需要|根据技术审计|查看对应 Gate)/u.test(text)) return '';
  return text;
}

function normalizeText(value) {
  return compact(value, '').normalize('NFKC').toLowerCase().replace(/[\s，。；、：:“”‘’（）()【】\[\]—–_-]/gu, '');
}

function normalizeEvidence(issue) {
  return normalizeText(issue.normalized_evidence || issue.detected_value || issue.evidence_excerpt || issue.message);
}

function normalizeActionKey(value) {
  return normalizeText(value)
    .replace(/仅保留|只保留/gu, '保留')
    .replace(/未确认|未经确认|尚未确认/gu, '待确认')
    .replace(/修改后|修复后/gu, '修复');
}

function issueDirectionIds(issue) {
  return [...new Set([
    ...(issue.source_direction_ids || []),
    ...(issue.affected_direction_ids || []),
    ...(issue.direction_id ? [issue.direction_id] : [])
  ].filter(Boolean))].sort();
}

function issueOccurrenceCount(issue) {
  return Math.max(1, issue.occurrences?.length || 0, issue.field_paths?.length || 0);
}

function issueValues(issue) {
  const occurrences = issue.occurrences || [];
  return [...new Set([
    issue.detected_value,
    ...occurrences.map((item) => item.detected_value)
  ].map((value) => userSafeText(value)).filter(Boolean))];
}

function issueSeverity(value) {
  if (['blocking', 'blocked', 'block'].includes(value)) return 'block';
  if (['rewrite', 'rewrite_required'].includes(value)) return 'rewrite';
  return 'warning';
}

function issueCategory(issue) {
  const code = String(issue.code || issue.rule_id || issue.matched_rule || '').toUpperCase();
  if (/PIPELINE|RETRIEVAL/u.test(code)) return 'pipeline';
  if (/EVIDENCE|FABRICATED_DATA|SPECIFIC_VALUE/u.test(code)) return 'evidence';
  if (/BRAND|GROUP|INSTITUTION|AUTHORIZATION/u.test(code) && !/ASSET_AUTHORIZATION_WARNING/u.test(code)) return 'brand_authorization';
  if (/ASSET|PLACEHOLDER|CREDENTIAL|CERTIFICATE/u.test(code)) return 'asset_placeholder';
  return 'direction_quality';
}

function userIssueCopy(issue) {
  const mapped = ISSUE_COPY[issue.code];
  const title = mapped?.[0] || userSafeText(issue.user_title || issue.message);
  const action = mapped?.[1] || userSafeText(issue.user_action || issue.recommendation);
  return title && action ? { title, action } : null;
}

function groupingKey(issue, category, copy, directionIds) {
  const code = String(issue.code || 'UNCLASSIFIED');
  const brandNegation = category === 'brand_authorization'
    && /(不得|不可|禁止|未授权).*(集团|品牌)|(集团|品牌).*(不得|不可|禁止|未授权)/u.test(compact(issue.message || issue.evidence_excerpt || issue.detected_value, ''));
  if (brandNegation) return `brand-negation|${directionIds.join(',')}`;
  return [category, code, normalizeEvidence(issue), directionIds.join(','), normalizeActionKey(copy?.action || '')].join('|');
}

export function groupVisualDirectionIssues(issues = []) {
  const groups = new Map();
  for (const issue of issues.filter(Boolean)) {
    const directionIds = issueDirectionIds(issue);
    const category = issueCategory(issue);
    const copy = userIssueCopy(issue);
    const key = groupingKey(issue, category, copy, directionIds);
    const existing = groups.get(key);
    if (existing) {
      existing.hit_count += issueOccurrenceCount(issue);
      existing.affected_values = [...new Set([...existing.affected_values, ...issueValues(issue)])];
      existing.technical_issues.push(issue);
      continue;
    }
    groups.set(key, {
      group_id: '',
      category,
      title: copy?.title || '',
      affected_directions: directionIds,
      summary: truncate(userSafeText(issue.evidence_excerpt || issue.detected_value || issue.message), 100),
      hit_count: issueOccurrenceCount(issue),
      affected_values: issueValues(issue),
      action: copy?.action || '',
      severity: issueSeverity(issue.severity),
      code: issue.code || 'UNCLASSIFIED',
      hidden_from_user_report: issue.hide_from_user_issues === true || !copy,
      technical_issues: [issue]
    });
  }
  return [...groups.values()]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      || CATEGORY_META[a.category].order - CATEGORY_META[b.category].order)
    .map((group, index) => ({
      ...group,
      group_id: `IG-${String(index + 1).padStart(3, '0')}`,
      direction_ids: group.affected_directions,
      evidence_summary: group.summary
    }));
}

const ROOT_CAUSE_RULES = Object.freeze([
  {
    type: 'direction_scope_narrowing',
    pattern: /BRAND_ROLE|STRATEGIC_THESIS|PRODUCT_MATERIAL|DIRECTION_SCOPE|ANCHOR_MECHANISM/u,
    message: '方向过度缩减品牌角色，需重新扩展战略命题与视觉机制。',
    action: '回到来源机会与品牌事实，重写视觉主角、生成机制和品牌角色映射。'
  },
  {
    type: 'mechanism_generic',
    pattern: /GENERIC|TEMPLATE|SPECIFICITY|MECHANISM/u,
    message: '核心机制仍偏通用，多个 Gate 命中属于同一模板化根因。',
    action: '用品牌事实、真实资产和触点行为替换通用图形与布局描述。'
  },
  {
    type: 'authorization_unclear',
    pattern: /AUTHORIZATION|INSTITUTION_PHOTOGRAPHY|CREDENTIAL/u,
    message: '素材或拍摄主体的授权边界尚不明确。',
    action: '识别拍摄主体类型；仅真实可识别机构进入授权确认。'
  },
  {
    type: 'benchmark_insufficient',
    pattern: /BENCHMARK|RETRIEVAL/u,
    message: 'Benchmark 子门槛不足，方向差异判断证据不完整。',
    action: '补足未通过的同行业、同商业模式或反模板案例子门槛。'
  }
]);

export function aggregateRootCauseIssues(groups = []) {
  const merged = new Map();
  for (const group of groups) {
    const rule = ROOT_CAUSE_RULES.find((item) => item.pattern.test(String(group.code || '')));
    if (!rule) {
      merged.set(`raw:${group.group_id}`, group);
      continue;
    }
    const key = `${rule.type}|${group.affected_directions.join(',')}`;
    const existing = merged.get(key);
    if (existing) {
      existing.technical_issues.push(...group.technical_issues);
      existing.affected_issue_ids.push(group.group_id);
      existing.hit_count += group.hit_count;
      if (SEVERITY_ORDER[group.severity] < SEVERITY_ORDER[existing.severity]) existing.severity = group.severity;
      continue;
    }
    merged.set(key, {
      ...group,
      root_cause_id: `RC-${String(merged.size + 1).padStart(3, '0')}`,
      root_cause_type: rule.type,
      affected_issue_ids: [group.group_id],
      title: rule.message,
      summary: rule.message,
      action: rule.action
    });
  }
  const counts = new Map();
  return [...merged.values()].filter((group) => {
    if (!group.affected_directions.length) return true;
    return group.affected_directions.some((id) => {
      const count = counts.get(id) || 0;
      if (count >= 2) return false;
      counts.set(id, count + 1);
      return true;
    });
  });
}

function pipelineImpact(id, statusValue, hasCases) {
  if (statusValue === 'complete') return '本阶段信息可直接支持方向判断';
  const impacts = {
    visual_brief: '方向约束不完整，方向边界可信度降低',
    visual_asset_input: '没有项目视觉素材可供继承',
    visual_asset_analysis: '素材与授权边界无法完整确认',
    visual_asset_usage: '未继承现有素材，品牌专属性上限降低',
    benchmark_retrieval: hasCases ? '外部参照不足，方向差异判断受限' : '方向可生成，但缺少外部参照',
    visual_opportunity: '机会结论仅基于现有事实，可信度降低',
    direction_generation: '方向数量不足，无法完成三方向比较',
    validation: '无法确认方向是否可进入下一阶段',
    pipeline: '报告仍可阅读，但结论需在补齐管线后复核'
  };
  return impacts[id] || '本阶段缺失会降低报告结论的完整性';
}

function derivePipelineStages(compiled, visualFactFirst, pipelineCompleteness) {
  const retrieval = visualFactFirst?.benchmarkRetrieval;
  const opportunities = visualFactFirst?.visualOpportunitySynthesis?.differentiation_opportunities || [];
  const directions = compiled?.directions || [];
  const retrievalStatus = retrieval?.retrieval_status;
  const hasCases = Array.isArray(retrieval?.cases) && retrieval.cases.length > 0;
  const assetPipeline = buildVisualAssetPipelineStatus({
    visualAssetEvidence: visualFactFirst?.visualAssetEvidence,
    inputProvided: visualFactFirst?.visualAssetPipelineStatus?.input_status === 'provided',
    directions
  });
  const rows = [
    { id: 'visual_brief', name: 'Visual Brief', status: visualFactFirst?.visualBrief ? 'complete' : 'failed', detail: visualFactFirst?.visualBrief ? '已形成视觉任务约束' : '缺少 Visual Brief' },
    { id: 'visual_asset_input', name: '视觉素材输入', status: assetPipeline.input_status === 'provided' ? 'complete' : 'not_available', detail: assetPipeline.input_status === 'provided' ? '已提供' : '未提供' },
    { id: 'visual_asset_analysis', name: '视觉素材分析', status: assetPipeline.analysis_status === 'complete' ? 'complete' : assetPipeline.analysis_status === 'partial' ? 'partial' : assetPipeline.analysis_status === 'not_applicable' ? 'not_available' : 'failed', detail: ({ complete: '完整', partial: '部分完整', failed: '失败', not_applicable: '不适用' })[assetPipeline.analysis_status] },
    { id: 'visual_asset_usage', name: '方向资产引用', status: assetPipeline.usage_status === 'referenced' ? 'complete' : assetPipeline.usage_status === 'not_referenced' ? 'partial' : 'not_available', detail: assetPipeline.usage_status === 'referenced' ? `已引用 ${assetPipeline.referenced_asset_ids.length} 个资产` : assetPipeline.usage_status === 'not_referenced' ? '未发生；方向主要由品牌事实驱动' : '不适用' },
    { id: 'benchmark_retrieval', name: '标杆检索', status: hasCases && ['completed', 'fixture'].includes(retrievalStatus) ? 'complete' : hasCases || retrievalStatus === 'partial' ? 'partial' : 'failed', detail: hasCases ? `${retrieval.cases.length} 个可用案例` : '无可用检索案例' },
    { id: 'visual_opportunity', name: '视觉机会综合', status: opportunities.length >= 3 && hasCases ? 'complete' : opportunities.length ? 'partial' : 'failed', detail: opportunities.length ? `${opportunities.length} 个差异化机会` : '无可用差异化机会' },
    { id: 'direction_generation', name: '方向生成', status: directions.length === 3 ? 'complete' : directions.length ? 'partial' : 'failed', detail: `${directions.length} 个方向` },
    { id: 'validation', name: '结构校验', status: compiled?.overall_status ? 'complete' : 'failed', detail: STATUS_LABELS[compiled?.overall_status] || compact(compiled?.overall_status) },
    { id: 'pipeline', name: '管线总体', status: pipelineCompleteness || visualFactFirst?.pipelineCompleteness || 'partial', detail: STATUS_LABELS[pipelineCompleteness || visualFactFirst?.pipelineCompleteness] || compact(pipelineCompleteness) }
  ];
  return rows.map((item) => ({ ...item, impact: pipelineImpact(item.id, item.status, hasCases) }));
}

function status(value) {
  return STATUS_LABELS[value] || compact(value);
}

function permissionStatus(value) {
  if (value === 'blocked') return '禁止进入下一阶段';
  return status(value);
}

function anchorStatus(value) {
  if (value === 'ready') return '可进入';
  if (value === 'conditional' || value === 'ready_with_warnings') return '待修改';
  return '未就绪';
}

function directionCritic(modelCritic, directionId, direction, issueGroups) {
  const items = modelCritic?.per_direction || modelCritic?.directions || [];
  const found = items.find((item) => (item.direction_id || item.id) === directionId);
  const comparative = modelCritic?.set_level_critic?.comparative_direction_results
    ?.find((item) => item.direction_id === directionId);
  const problems = issueGroups.map((item) => item.title).filter(Boolean);
  const actions = issueGroups.map((item) => item.action).filter(Boolean);
  return {
    rating: status(found?.recommendation || found?.status || (problems.length ? 'Promising With Revision' : 'not_available')),
    decision: found?.decision || null,
    conclusion: found?.conclusion || (problems.length ? '可继续深化' : '待评估'),
    score: Number.isFinite(found?.score) ? found.score : null,
    dimensions: found?.dimensions || {},
    dimension_scores: found?.dimension_scores || {},
    relative_rank: comparative?.relative_rank ?? null,
    collection_size: items.length,
    strongest_dimension: comparative?.strongest_dimension || null,
    weakest_dimension: comparative?.weakest_dimension || null,
    template_risk: comparative?.template_risk || found?.template_risk || null,
    anchor_reason: comparative?.anchor_reason || found?.anchor_reason || null,
    strengths: cleanCriticText(found?.strengths || found?.primary_strengths
      || '已形成可比较的视觉机制、品牌表达与触点假设，需按设计维度继续复核。'),
    problems: cleanCriticText(found?.problems || found?.primary_problems || problems.slice(0, 2).join('；'), problems.length ? '存在待修正事项。' : '未发现独立问题。'),
    action: cleanCriticText(found?.action || found?.suggested_action || actions[0], problems.length ? '按修改建议修正后重新校验。' : '可继续深化关键触点。')
  };
}

function directionAssetInheritance(raw, visualAssetEvidence) {
  const items = Object.entries(visualAssetEvidence || {})
    .filter(([, value]) => Array.isArray(value))
    .flatMap(([group, value]) => value.map((item) => ({ ...item, group })));
  const byId = new Map(items.map((item) => [item.evidence_id || item.asset_id, item]));
  const referenced = [...new Set(raw.asset_references || [])];
  const inherited = referenced.filter((id) => byId.get(id)?.authorization === 'locked');
  const transformed = referenced.filter((id) => byId.get(id)?.authorization === 'editable');
  const rejected = items
    .filter((item) => !['locked', 'editable'].includes(item.authorization))
    .map((item) => item.evidence_id || item.asset_id)
    .filter(Boolean);
  const label = (id) => {
    const item = byId.get(id);
    return item ? `${id} ${item.asset_name || item.observation || item.description || item.group || ''}`.trim() : id;
  };
  return {
    inherited: inherited.map(label),
    transformed: transformed.map(label),
    rejected: [...new Set(rejected)].map(label),
    no_inheritance_reason: inherited.length || transformed.length
      ? null
      : '本方向主要由品牌事实驱动，未有效继承现有视觉资产。'
  };
}

function visualProtagonist(direction) {
  return direction.visual_protagonist
    || direction.execution_examples?.[0]?.hero_subject
    || direction.photography_object_system?.primary_subject
    || direction.execution_examples?.[0]?.subject
    || '待确认';
}

function mechanism(direction) {
  return direction.selection_mechanism?.visual_mapping_rule
    || direction.selection_mechanism?.mechanism_summary
    || direction.graphic_system?.how_graphics_form
    || direction.strategic_idea
    || '待确认';
}

function industrySystem(layer = {}) {
  return {
    visual_objects: compact(layer.industry_visual_objects),
    data_objects: compact(layer.industry_data_objects),
    process_objects: compact(layer.industry_process_objects),
    real_scenes: compact(layer.industry_space_and_real_scenes),
    information_carriers: compact(layer.usable_business_objects),
    prohibited_templates: compact(layer.prohibited_misleading_templates),
    recognition_strength: compact(layer.minimum_industry_recognition_strength)
  };
}

function photographySystem(system = {}) {
  const ratios = system.real_content_ratio || {};
  const ratioText = [
    ratios.real_industry_content_ratio !== undefined ? `摄影 ${Math.round(ratios.real_industry_content_ratio * 100)}%` : '',
    ratios.branded_graphic_ratio !== undefined ? `图形 ${Math.round(ratios.branded_graphic_ratio * 100)}%` : '',
    ratios.information_layout_ratio !== undefined ? `信息 ${Math.round(ratios.information_layout_ratio * 100)}%` : ''
  ].filter(Boolean).join(' / ');
  return {
    needed: ({ required: '需要', optional: '可选', prohibited: '不使用' })[system.needs_photography] || compact(system.needs_photography),
    subjects: compact(system.real_industry_objects || system.shooting_objects),
    composition: compact(system.subject_and_background || system.composition),
    people_boundary: compact(system.people_product_packaging || system.people_boundary),
    graphic_overlay: compact(system.graphic_overlay),
    ratio: ratioText || '未单独说明'
  };
}

function graphicSystem(system = {}) {
  return {
    generation: compact(system.how_graphics_form),
    brand_mapping: compact(system.brand_fact_mapping),
    reuse_rule: compact(system.scale_crop_repeat),
    touchpoints: compact(system.enter_touchpoints),
    prohibited_patterns: compact(system.must_not_become)
  };
}

function informationSystem(system = {}) {
  return {
    brand_role: compact(system.core_brand_info),
    capability: compact(system.capability_product_info),
    placeholder: compact(system.data_qualification_info),
    cta: compact(system.cta_info),
    hierarchy: compact(system.information_hierarchy),
    prohibited: compact(system.fabricated_info_prohibited)
  };
}

function dedupeDirectionActions(groups) {
  const unique = new Map();
  for (const group of groups) {
    const key = `${group.category}|${normalizeActionKey(group.action)}`;
    if (!unique.has(key)) unique.set(key, group);
  }
  return [...unique.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).slice(0, 3);
}

function mapDirection(entry, groups, modelCritic, visualAssetEvidence) {
  const raw = entry.direction || {};
  const id = raw.direction_id || '未编号';
  const examples = raw.execution_examples || [];
  const issueGroups = groups.filter((group) => group.affected_directions.includes(id) && !group.hidden_from_user_report);
  const mapped = {
    direction_id: id,
    id,
    name: compact(raw.direction_name, id),
    family: FAMILY_LABELS[raw.family_type] || FAMILY_LABELS[raw.direction_family] || `方向家族 ${id}`,
    strategic_idea: compact(raw.strategic_idea),
    source_opportunity_ids: raw.source_opportunity_ids || [],
    visual_protagonist: compact(visualProtagonist(raw)),
    mechanism: compact(mechanism(raw)),
    industry_system: industrySystem(raw.industry_recognition_layer),
    photography_system: photographySystem(raw.photography_object_system),
    graphic_system: graphicSystem(raw.graphic_system),
    information_system: informationSystem(raw.information_system),
    asset_inheritance: directionAssetInheritance(raw, visualAssetEvidence),
    examples: examples.map((example, index) => ({
      index: index + 1,
      touchpoint: compact(example.touchpoint || example.touchpoint_category, `触点 ${index + 1}`),
      audience: compact(example.audience),
      goal: compact(example.communication_goal),
      hero: compact(example.hero_subject || example.subject),
      structure: compact(example.visual_structure || example.layout_structure),
      information_zone: compact(example.information_zone || example.information_position),
      brand_zone: compact(example.brand_zone),
      canvas_ratio: compact(example.canvas_ratio),
      responsive: compact(example.responsive_adaptation)
    })),
    local_status: entry.local_status || entry.status || 'not_available',
    collection_status: entry.collection_status || entry.collection_execution_permission_status || 'not_available',
    permission: entry.local_execution_permission_status || entry.execution_permission_status || 'not_available',
    structural_score: entry.structural_completeness_score,
    content_score: entry.content_readiness_score,
    issue_groups: issueGroups,
    modification_actions: dedupeDirectionActions(issueGroups)
  };
  return { ...mapped, critic: directionCritic(modelCritic, id, mapped, issueGroups) };
}

function collectionCritic(modelCritic) {
  if (!modelCritic) return { label: '未提供', score: null, summary: '本次结果未包含集合 Critic。' };
  return {
    label: status(modelCritic.recommendation || modelCritic.status || '已评估'),
    score: Number.isFinite(modelCritic.score) ? modelCritic.score : null,
    summary: cleanCriticText(modelCritic.set_level_critic?.comparative_summary || modelCritic.summary || modelCritic.reason || modelCritic.message, '该评价用于方向比较，不改变 Runtime 状态。'),
    confidence: modelCritic.critic_confidence || modelCritic.set_level_critic?.recommendation_confidence || 'unavailable',
    set_level: modelCritic.set_level_critic || null
  };
}

function actionItem(actionId, priority, action, affectedDirections = [], sourceIssueIds = []) {
  return { action_id: actionId, priority, action, affected_directions: affectedDirections, source_issue_ids: sourceIssueIds };
}

function deriveNextActions(groups, pipelineStages, compiled) {
  const candidates = [];
  const pipelineCopy = {
    benchmark_retrieval: '修复 Benchmark Retrieval，达到最低案例数量。',
    visual_asset_input: '补充可观察的项目视觉素材。',
    visual_asset_analysis: '补齐视觉素材分析与授权边界。',
    visual_asset_usage: '为方向引用或重构现有视觉资产，并说明不适用原因。',
    visual_opportunity: '补齐检索后重新综合视觉机会。',
    direction_generation: '补齐三个可比较的视觉方向。',
    validation: '恢复结构校验并确认方向状态。'
  };
  for (const stage of pipelineStages.filter((item) => ['failed', 'partial'].includes(item.status) && pipelineCopy[item.id])) {
    candidates.push(actionItem(`pipeline-${stage.id}`, stage.status === 'failed' ? 'high' : 'medium', pipelineCopy[stage.id]));
  }
  for (const group of groups.filter((item) => !item.hidden_from_user_report && item.severity !== 'warning')) {
    candidates.push(actionItem(`issue-${group.group_id}`, group.severity === 'block' ? 'high' : 'medium', group.action, group.affected_directions, [group.group_id]));
  }
  for (const group of groups.filter((item) => !item.hidden_from_user_report && item.severity === 'warning')) {
    candidates.push(actionItem(`issue-${group.group_id}`, 'medium', group.action, group.affected_directions, [group.group_id]));
  }
  const tail = [];
  if (groups.length) tail.push(actionItem('rerun-validation', 'medium', '完成修改后，重新运行 Validator 与 Model Critic。', [], groups.map((item) => item.group_id)));
  if (compiled?.anchor_readiness !== 'ready') tail.push(actionItem('anchor-decision', 'medium', '集合状态解除后，再决定是否进入 Anchor。'));
  if (!candidates.length && !tail.length) candidates.push(actionItem('enter-anchor', 'low', '选定推荐方向，进入 Anchor 与关键触点深化。'));
  const deduped = new Map();
  for (const item of candidates) {
    const key = normalizeActionKey(item.action);
    if (!deduped.has(key)) deduped.set(key, item);
  }
  const main = [...deduped.values()];
  return [...main.slice(0, Math.max(0, 6 - tail.length)), ...tail].slice(0, 6);
}

function retrievalSummary(visualFactFirst) {
  const retrieval = visualFactFirst?.benchmarkRetrieval;
  return {
    status: retrieval?.retrieval_status || 'not_available',
    query_count: retrieval?.query_count || 0,
    result_count: retrieval?.result_count || 0,
    relevant_count: retrieval?.relevant_count || 0,
    case_count: retrieval?.cases?.length || 0,
    minimum_requirements_met: Boolean(retrieval?.minimum_case_requirements_met),
    requirement_status: retrieval?.requirement_status || null,
    failure_reason: retrieval?.failure_reason || null,
    failure_stage: retrieval?.failure_stage || null,
    fallback_query_count: retrieval?.fallback_query_count || 0,
    fallback_round_count: retrieval?.fallback_round_count || 0,
    opportunities: visualFactFirst?.visualOpportunitySynthesis?.differentiation_opportunities || []
  };
}

function buildEnterConditions({ retrieval, visibleGroups, best, compiled }) {
  const conditions = [];
  if (retrieval?.retrieval_status === 'failed') {
    conditions.push({ id: 'pipeline-benchmark', priority: 'high', source: 'pipeline', description: '恢复 Benchmark Provider，并达到总可用案例门槛。' });
  } else if (retrieval?.retrieval_status === 'partial') {
    const missing = Object.entries(retrieval.requirement_status || {})
      .filter(([, item]) => !item.passed).map(([key]) => key).join('、');
    conditions.push({ id: 'pipeline-benchmark', priority: 'medium', source: 'pipeline', description: `补足 Benchmark 分类子门槛：${missing || '未通过分类'}。` });
  }
  if (visibleGroups.some((item) => item.category === 'evidence' || item.category === 'asset_placeholder')) {
    conditions.push({ id: 'evidence-confirmation', priority: 'high', source: 'evidence', description: '为全部具体数据补 confirmed EvidenceRef，或降级为不含原数值的结构占位。' });
  }
  if (visibleGroups.some((item) => item.category === 'brand_authorization')) {
    conditions.push({ id: 'authorization-boundary', priority: 'high', source: 'authorization', description: '确认品牌与视觉资产授权边界；系统误识别项由实体识别规则修复。' });
  }
  for (const item of (best?.modification_actions || []).slice(0, 2)) {
    conditions.push({ id: `direction-${item.group_id}`, priority: 'medium', source: 'direction_quality', description: item.action });
  }
  if (conditions.length || compiled?.anchor_readiness !== 'ready') {
    conditions.push({ id: 'revalidation', priority: 'medium', source: 'system_defect', description: '完成修复后，重新运行 Validator 与 Model Critic。' });
  }
  return conditions;
}

function deriveRecommendation(compiled, directions, pipelineStages, visibleGroups, visualFactFirst) {
  const blockers = visibleGroups.filter((item) => item.severity === 'block');
  const retrievalFailed = pipelineStages.some((item) => item.id === 'benchmark_retrieval' && item.status === 'failed');
  const finalRanking = compiled?.model_critic?.final_direction_ranking
    || compiled?.model_critic?.set_level_critic?.final_direction_ranking;
  const best = directions.find((item) => item.id === finalRanking?.primary_direction_id);
  const retrieval = visualFactFirst?.benchmarkRetrieval;
  const enterConditions = buildEnterConditions({ retrieval, visibleGroups, best, compiled });
  if (!best || finalRanking?.recommendation_confidence === 'unavailable') return {
    priority_direction: '暂不选择', recommended_direction: '暂不确定',
    recommendation_mode: 'unavailable', recommendation_confidence: 'unavailable',
    reason: finalRanking?.recommendation_reason || 'FinalDirectionRanking 未提供可用首选方向。', entry_conditions: enterConditions
  };
  if (blockers.length || compiled?.overall_status === 'blocked') {
    return {
      priority_direction: best.id, recommended_direction: '暂不确定',
      recommendation_mode: 'unavailable', recommendation_confidence: 'unavailable',
      reason: `存在关键事实或 Gate 阻断：${blockers.slice(0, 2).map((item) => item.title).join('、') || '方向集合仍存在阻断项'}`,
      entry_conditions: enterConditions
    };
  }
  const assetPipeline = buildVisualAssetPipelineStatus({
    visualAssetEvidence: visualFactFirst?.visualAssetEvidence,
    inputProvided: visualFactFirst?.visualAssetPipelineStatus?.input_status === 'provided',
    directions: compiled?.directions || []
  });
  const assetComplete = assetPipeline.analysis_status === 'complete' && assetPipeline.usage_status === 'referenced';
  const minimumMet = retrieval?.minimum_case_requirements_met === true;
  const confidence = retrievalFailed ? 'low' : finalRanking.recommendation_confidence || (minimumMet && assetComplete ? 'high' : 'medium');
  return {
    priority_direction: best.id,
    recommended_direction: retrievalFailed ? '暂不确定' : best.id,
    recommendation_mode: retrievalFailed ? 'provisional' : 'formal',
    recommendation_confidence: confidence,
    reason: retrievalFailed
      ? '标杆检索失败，当前判断仅基于项目事实与现有视觉素材。'
      : finalRanking.recommendation_reason,
    entry_conditions: enterConditions
  };
}

export function compileVisualDirectionsReportViewModel({ projectId = 'unknown', compiled = {}, pipelineCompleteness, visualFactFirst, auditFilePath = '06-Visual-Directions-Audit.md' } = {}) {
  const allIssueGroups = aggregateRootCauseIssues(groupVisualDirectionIssues(compiled.gate_issues || []));
  const visibleGroups = allIssueGroups.filter((item) => !item.hidden_from_user_report).slice(0, 8);
  const pipelineStatus = derivePipelineStages(compiled, visualFactFirst, pipelineCompleteness);
  const directions = (compiled.directions || []).map((entry) => mapDirection(entry, visibleGroups, compiled.model_critic, visualFactFirst?.visualAssetEvidence));
  const nextActions = deriveNextActions(visibleGroups, pipelineStatus, compiled);
  const recommendation = deriveRecommendation(compiled, directions, pipelineStatus, visibleGroups, visualFactFirst);
  const benchmarkStatus = visualFactFirst?.benchmarkRetrieval?.retrieval_status;
  const benchmarkAtLeastPartial = ['partial', 'completed', 'fixture'].includes(benchmarkStatus)
    && (visualFactFirst?.benchmarkRetrieval?.cases?.length || 0) > 0;
  const hasLocallyUsableDirection = directions.some((item) => ['ready', 'ready_with_warnings'].includes(item.local_status));
  const comparativeResults = compiled.model_critic?.set_level_critic?.comparative_direction_results || [];
  const hasComparativeCritic = comparativeResults.length
    ? comparativeResults.length === directions.length
      && new Set(comparativeResults.map((item) => item.relative_rank)).size === directions.length
      && compiled.model_critic?.set_level_critic?.second_pass_resolved !== false
    : Boolean(compiled.model_critic?.set_level_critic?.dimension_rankings?.length);
  const logoOwnershipClear = !(compiled.gate_issues || []).some((item) =>
    item.code === 'UNKNOWN_VISUAL_ASSET_OWNERSHIP' && item.severity !== 'info'
  );
  const safeStructureNoiseSuppressed = !(compiled.gate_issues || []).some((item) =>
    item.placeholder_type === 'safe_structure_placeholder'
    && item.hide_from_user_issues !== true
  );
  const anchorTestReadiness = compiled.anchor_readiness === 'ready' ? 'formal_ready'
    : compiled.overall_status !== 'blocked' && benchmarkAtLeastPartial && hasLocallyUsableDirection
      && hasComparativeCritic && logoOwnershipClear && safeStructureNoiseSuppressed
      ? 'internal_test_only'
      : 'not_ready';
  const executiveSummary = {
    overall_status: compiled.overall_status || 'not_available',
    permission: compiled.execution_permission_status || 'not_available',
    anchor_readiness: visualFactFirst?.benchmarkRetrieval?.retrieval_status === 'failed' ? 'not_ready' : compiled.anchor_readiness || 'blocked',
    pipeline_completeness: pipelineCompleteness || visualFactFirst?.pipelineCompleteness || 'partial',
    collection_critic: collectionCritic(compiled.model_critic),
    anchor_test_readiness: anchorTestReadiness,
    ...recommendation
  };
  const retrieval = retrievalSummary(visualFactFirst);
  return Object.freeze({
    kind: 'VisualDirectionsReportViewModel',
    project_id: projectId,
    executive_summary: executiveSummary,
    pipeline_status: pipelineStatus,
    grouped_issues: visibleGroups,
    direction_comparison: directions.map((item) => ({
      direction_id: item.id,
      visual_protagonist: item.visual_protagonist,
      mechanism: item.mechanism,
      touchpoints: item.examples.map((example) => example.touchpoint),
      local_status: item.local_status,
      critic: item.critic,
      primary_modification: item.modification_actions[0]?.action || '无必须修改项',
      anchor: item.permission === 'allowed' ? '已准备' : '待修改'
    })),
    directions,
    next_actions: nextActions,
    retrieval_summary: retrieval,
    audit_file_path: auditFilePath,
    executive: executiveSummary,
    pipeline_stages: pipelineStatus,
    issue_groups: visibleGroups,
    retrieval
  });
}

function auditRecord(issue, groupId, index) {
  return {
    audit_id: `${groupId}-T${String(index + 1).padStart(2, '0')}`,
    group_id: groupId,
    direction_id: issue.direction_id || issue.source_direction_ids?.[0] || null,
    severity: issue.severity || 'warning',
    rule_id: issue.rule_id || issue.matched_rule || issue.code || 'UNCLASSIFIED',
    field_path: issue.field_path || issue.field_paths?.[0] || null,
    raw_value: issue.raw_value ?? issue.detected_value ?? null,
    evidence: issue.evidence ?? issue.evidence_excerpt ?? null,
    suggested_action: issue.suggested_action || issue.recommendation || null,
    hit_count: issueOccurrenceCount(issue),
    raw_issue: issue
  };
}

export function compileVisualDirectionsAuditViewModel(input = {}) {
  const report = compileVisualDirectionsReportViewModel(input);
  const compiled = input.compiled || {};
  const allGroups = groupVisualDirectionIssues(compiled.gate_issues || []);
  const records = allGroups.flatMap((group) => group.technical_issues.map((issue, index) => auditRecord(issue, group.group_id, index)));
  return Object.freeze({
    kind: 'VisualDirectionsAuditViewModel',
    project_id: report.project_id,
    runtime_status: {
      overall_status: compiled.overall_status,
      legacy_gate_status: compiled.legacy_gate_status,
      execution_permission_status: compiled.execution_permission_status,
      anchor_readiness: compiled.anchor_readiness,
      blocking_reasons: compiled.blocking_reasons || [],
      pipeline_completeness: report.executive_summary.pipeline_completeness
    },
    pipeline_raw: { stages: report.pipeline_status, completeness: input.pipelineCompleteness, visual_fact_first: input.visualFactFirst || null },
    gate_hits: records,
    gates: compiled.gates || {},
    evidence_audit: records.filter((item) => /EVIDENCE|FABRICATED|ASSET/i.test(item.rule_id)),
    brand_authorization_audit: records.filter((item) => /BRAND|GROUP|AUTHORIZATION|INSTITUTION/i.test(item.rule_id)),
    execution_completeness: compiled.gates?.execution_example_completeness || null,
    direction_similarity: compiled.gates?.direction_family_difference || null,
    model_critic: compiled.model_critic || null,
    raw_validator_output: compiled.lightweight_validation || null,
    field_path_index: records.map((item) => ({ audit_id: item.audit_id, group_id: item.group_id, direction_id: item.direction_id, rule_id: item.rule_id, field_path: item.field_path }))
  });
}

function score(value) {
  return Number.isFinite(value) ? `${Math.round(value)}/100` : '未单独评分';
}

function pushTable(lines, headers, rows) {
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) lines.push(`| ${row.map((cell) => compact(cell).replace(/\|/gu, '⁄').replace(/\n/gu, ' ')).join(' | ')} |`);
  lines.push('');
}

function pushVisualSystem(lines, direction) {
  lines.push('### 核心视觉系统', '');
  lines.push(`- 视觉主角：${direction.visual_protagonist}`);
  lines.push(`- 核心机制：${direction.mechanism}`, '');
  lines.push('#### 行业识别', '');
  lines.push(`- 视觉对象：${direction.industry_system.visual_objects}`);
  lines.push(`- 数据对象：${direction.industry_system.data_objects}`);
  lines.push(`- 流程对象：${direction.industry_system.process_objects}`);
  lines.push(`- 真实场景：${direction.industry_system.real_scenes}`);
  lines.push(`- 信息载体：${direction.industry_system.information_carriers}`);
  lines.push(`- 禁止模板：${direction.industry_system.prohibited_templates}`);
  lines.push(`- 识别强度：${direction.industry_system.recognition_strength}`, '');
  lines.push('#### 摄影系统', '');
  lines.push(`- 是否需要摄影：${direction.photography_system.needed}`);
  lines.push(`- 拍摄对象：${direction.photography_system.subjects}`);
  lines.push(`- 构图方式：${direction.photography_system.composition}`);
  lines.push(`- 人物边界：${direction.photography_system.people_boundary}`);
  lines.push(`- 图形叠加：${direction.photography_system.graphic_overlay}`);
  lines.push(`- 摄影 / 图形 / 信息比例：${direction.photography_system.ratio}`, '');
  lines.push('#### 图形系统', '');
  lines.push(`- 生成方式：${direction.graphic_system.generation}`);
  lines.push(`- 品牌事实映射：${direction.graphic_system.brand_mapping}`);
  lines.push(`- 复用规律：${direction.graphic_system.reuse_rule}`);
  lines.push(`- 适用触点：${direction.graphic_system.touchpoints}`);
  lines.push(`- 禁止模式：${direction.graphic_system.prohibited_patterns}`, '');
  lines.push('#### 信息系统', '');
  lines.push(`- 品牌角色：${direction.information_system.brand_role}`);
  lines.push(`- 能力信息：${direction.information_system.capability}`);
  lines.push(`- 结构占位：${direction.information_system.placeholder}`);
  lines.push(`- CTA：${direction.information_system.cta}`);
  lines.push(`- 信息层级：${direction.information_system.hierarchy}`);
  lines.push(`- 禁止信息：${direction.information_system.prohibited}`, '');
}

export function renderVisualDirectionsReport(viewModel) {
  const vm = viewModel;
  const executive = vm.executive_summary;
  const lines = ['# 视觉方向报告', '', `> 项目：${vm.project_id}`, ''];
  lines.push('## 1. 执行摘要', '');
  lines.push(`- 总体状态：**${status(executive.overall_status)}**`);
  lines.push(`- 执行许可：**${permissionStatus(executive.permission)}**`);
  lines.push(`- Anchor 测试就绪度：**${{ not_ready: '未就绪', internal_test_only: '仅限内部测试', formal_ready: '正式就绪' }[executive.anchor_test_readiness] || '未就绪'}**`);
  lines.push(`- 正式 Anchor 就绪度：**${anchorStatus(executive.anchor_readiness)}**`);
  lines.push(`- 管线完整度：**${status(executive.pipeline_completeness)}**`);
  lines.push(`- 集合 Critic：**${executive.collection_critic.label}**${executive.collection_critic.score === null ? '' : `（${executive.collection_critic.score}/100）`}`);
  if (executive.collection_critic.set_level) {
    const setLevel = executive.collection_critic.set_level;
    const top = (dimension) => setLevel.dimension_rankings.find((item) => item.dimension === dimension)?.ranking?.[0] || '未评估';
    lines.push(`- 集合内品牌专属性最高：${top('brand_exclusivity')}`);
    lines.push(`- 集合内商业模式最准确：${top('business_model_accuracy')}`);
    lines.push(`- 集合内 Anchor 潜力最高：${top('anchor_potential')}`);
    lines.push(`- 当前相对最弱方向：${setLevel.weakest_direction_id || '未评估'}`);
    lines.push(`- Critic 置信度：${{ high: '高', medium: '中', low: '低', unavailable: '不可用' }[executive.collection_critic.confidence] || '未评估'}`);
    lines.push(`- 集合比较：${executive.collection_critic.summary}`);
  }
  lines.push(`- 当前优先保留方向：**${executive.priority_direction || executive.recommended_direction}**`);
  lines.push(`- 正式推荐方向：**${executive.recommended_direction}**`);
  lines.push(`- 推荐置信度：**${{ high: '高', medium: '中', low: '低', unavailable: '不可用' }[executive.recommendation_confidence] || '未评估'}**`);
  lines.push(`- 推荐原因：${executive.reason}`);
  lines.push('- 进入条件：');
  if (!executive.entry_conditions?.length) lines.push('  1. 当前无额外进入条件。');
  else executive.entry_conditions.forEach((item, index) => lines.push(`  ${index + 1}. ${item.description}`));
  lines.push('');

  lines.push('## 2. 管线完整度', '');
  pushTable(lines, ['阶段', '状态', '说明', '对本次报告的影响'], vm.pipeline_status.map((item) => [item.name, status(item.status), item.detail, item.impact]));

  lines.push('## 3. 关键阻断与待确认事项', '');
  if (!vm.grouped_issues.length) lines.push('- 当前没有需要阻断交付的结构化问题。', '');
  for (const [category, meta] of Object.entries(CATEGORY_META)) {
    const groups = vm.grouped_issues.filter((item) => item.category === category);
    if (!groups.length) continue;
    lines.push(`### ${meta.title}`, '');
    for (const group of groups) {
      lines.push(`#### ${group.title}`, '');
      lines.push(`- 影响方向：${group.affected_directions.length ? group.affected_directions.join('、') : '全部方向'}`);
      if (group.affected_values.length) lines.push(`- 涉及内容：${truncate(group.affected_values, 100)}`);
      lines.push(`- 命中次数：${group.hit_count}`);
      lines.push(`- 影响：${group.severity === 'block' ? '当前不能进入下一阶段' : group.severity === 'rewrite' ? '修改后重新校验' : '进入下一阶段前确认'}`);
      lines.push(`- 处理：${group.action}`, '');
    }
  }

  lines.push('## 4. 三方向对比', '');
  pushTable(lines, ['方向', '视觉主角', '核心机制', '执行触点', '本地状态', 'Critic', '主要修改项', 'Anchor'], vm.direction_comparison.map((item) => [
    item.direction_id,
    truncate(item.visual_protagonist, 38),
    truncate(item.mechanism, 50),
    truncate(item.touchpoints, 40),
    status(item.local_status),
    item.critic.rating,
    truncate(item.primary_modification, 50),
    item.anchor
  ]));

  vm.directions.forEach((direction, index) => {
    lines.push(`## ${index + 5}. ${direction.id} ${direction.name}`, '');
    lines.push('### 策略与来源', '');
    lines.push(`- 方向家族：${direction.family}`);
    lines.push(`- 策略构想：${direction.strategic_idea}`);
    lines.push(`- 来源机会：${compact(direction.source_opportunity_ids)}`, '');
    pushVisualSystem(lines, direction);
    lines.push('### 视觉资产继承', '');
    lines.push(`- 继承：${compact(direction.asset_inheritance.inherited, '无')}`);
    lines.push(`- 重构：${compact(direction.asset_inheritance.transformed, '无')}`);
    lines.push(`- 不使用：${compact(direction.asset_inheritance.rejected, '无')}`);
    if (direction.asset_inheritance.no_inheritance_reason) lines.push(`- 说明：${direction.asset_inheritance.no_inheritance_reason}`);
    lines.push('');
    lines.push(`### 执行触点（${direction.examples.length}）`, '');
    for (const example of direction.examples) {
      lines.push(`#### ${example.index}. ${example.touchpoint}`, '');
      lines.push(`- 受众与目标：${example.audience}；${example.goal}`);
      lines.push(`- 主角与结构：${example.hero}；${example.structure}`);
      lines.push(`- 信息区 / 品牌区：${example.information_zone} / ${example.brand_zone}`);
      lines.push(`- 画布与适配：${example.canvas_ratio}；${example.responsive}`, '');
    }
    lines.push('### 本地状态与准备度', '');
    lines.push(`- 本地状态：${status(direction.local_status)}`);
    lines.push(`- 集合状态：${status(direction.collection_status)}`);
    lines.push(`- 执行许可：${permissionStatus(direction.permission)}`);
    lines.push(`- 结构完整度：${Number.isFinite(direction.structural_score) ? `${Math.round(direction.structural_score)}/100` : '暂不计算'}`);
    lines.push(`- 内容就绪度：${Number.isFinite(direction.content_score) ? `${Math.round(direction.content_score)}/100` : '暂不计算'}`);
    if (['ready', 'ready_with_warnings'].includes(direction.local_status) && executive.anchor_readiness !== 'ready') {
      lines.push('- 集合说明：该方向可继续修改，但因方向集合仍存在阻断项，当前不能进入 Anchor。');
    }
    lines.push('');
    lines.push('### 方向 Critic', '');
    lines.push(`- 结论：${direction.critic.conclusion}`);
    lines.push(`- 评级：${direction.critic.rating}`);
    lines.push(`- 分数：${score(direction.critic.score)}`);
    if (direction.critic.relative_rank) lines.push(`- 集合排名：${direction.critic.relative_rank} / ${direction.critic.collection_size}`);
    if (direction.critic.strongest_dimension) lines.push(`- 最强维度：${direction.critic.strongest_dimension}`);
    if (direction.critic.weakest_dimension) lines.push(`- 最弱维度：${direction.critic.weakest_dimension}`);
    if (direction.critic.template_risk) lines.push(`- 模板风险：${direction.critic.template_risk}`);
    if (direction.critic.anchor_reason) lines.push(`- Anchor 理由：${direction.critic.anchor_reason}`);
    const dimensionLabels = {
      brand_exclusivity: '品牌专属性', business_model_accuracy: '商业模式准确性',
      visual_freshness: '视觉新鲜度', anchor_potential: 'Anchor 潜力',
      cross_touchpoint_scalability: '跨触点延展', touchpoint_realism: '触点真实性',
      anti_template_strength: '反模板强度'
    };
    for (const [key, label] of Object.entries(dimensionLabels)) {
      if (Number.isFinite(direction.critic.dimensions?.[key])) lines.push(`- ${label}：${direction.critic.dimensions[key]}/5`);
    }
    lines.push(`- 主要优点：${direction.critic.strengths}`);
    lines.push(`- 主要问题：${direction.critic.problems}`);
    lines.push(`- 建议动作：${direction.critic.action}`, '');
    lines.push('### 修改建议', '');
    if (!direction.modification_actions.length) lines.push('1. 无必须修改项，可继续深化。');
    else direction.modification_actions.forEach((group, actionIndex) => lines.push(`${actionIndex + 1}. ${group.action}`));
    lines.push('');
  });

  lines.push('## 8. 下一步动作', '');
  vm.next_actions.forEach((item, index) => lines.push(`${index + 1}. [${{ high: '高', medium: '中', low: '低' }[item.priority]}] ${item.action}${item.affected_directions.length ? `（${item.affected_directions.join('、')}）` : ''}`));
  lines.push('', '## 附录 A：Retrieval First 证据摘要', '');
  lines.push(`- 检索状态：${status(vm.retrieval_summary.status)}`);
  lines.push(`- 查询 / 结果 / 相关结果 / 可用案例：${vm.retrieval_summary.query_count} / ${vm.retrieval_summary.result_count} / ${vm.retrieval_summary.relevant_count} / ${vm.retrieval_summary.case_count}`);
  const requirementLabels = {
    total_usable: '总可用案例',
    same_industry: '同行业案例',
    same_business_model: '同商业模式案例',
    anti_template: '反模板案例'
  };
  const requirements = vm.retrieval_summary.requirement_status || {};
  if (Object.keys(requirements).length) {
    for (const [key, item] of Object.entries(requirements)) {
      lines.push(`- ${requirementLabels[key] || key}：${item.actual} / ${item.required}，${item.passed ? '通过' : '未通过'}`);
    }
  } else {
    lines.push(`- 最低案例要求：${vm.retrieval_summary.minimum_requirements_met ? '已满足' : '未满足'}`);
  }
  if (vm.retrieval_summary.failure_reason) lines.push(`- 失败原因：${vm.retrieval_summary.failure_reason}`);
  if (vm.retrieval_summary.failure_stage) lines.push(`- 失败阶段：${vm.retrieval_summary.failure_stage}`);
  lines.push(`- Fallback Query：${vm.retrieval_summary.fallback_query_count} 个查询 / ${vm.retrieval_summary.fallback_round_count} 轮`);
  lines.push(`- 差异化机会：${compact(vm.retrieval_summary.opportunities.map((item) => item.opportunity_name || item.title || item.opportunity_id))}`, '');
  if (vm.audit_file_path) lines.push('> 技术字段路径、Gate 规则与原始命中记录见：', `> \`${vm.audit_file_path}\``);
  return lines.join('\n');
}

function jsonBlock(value) {
  return ['```json', JSON.stringify(value ?? null, null, 2), '```', ''];
}

export function renderVisualDirectionsAudit(viewModel) {
  const vm = viewModel;
  const lines = ['# 视觉方向技术审计', '', `> 项目：${vm.project_id}`, ''];
  lines.push('## 1. Runtime 状态', '', ...jsonBlock({ runtime_status: vm.runtime_status, validator: vm.raw_validator_output }));
  lines.push('## 2. Pipeline Completeness 原始数据', '', ...jsonBlock(vm.pipeline_raw));
  lines.push('## 3. Gate 命中明细', '', ...jsonBlock({ raw_gates: vm.gates, normalized_hits: vm.gate_hits }));
  lines.push('## 4. EvidenceRef 审计', '', ...jsonBlock(vm.evidence_audit));
  lines.push('## 5. 品牌与授权审计', '', ...jsonBlock(vm.brand_authorization_audit));
  lines.push('## 6. Execution Example 完整性', '', ...jsonBlock(vm.execution_completeness));
  lines.push('## 7. 方向相似度', '', ...jsonBlock(vm.direction_similarity));
  lines.push('## 8. Model Critic 原始结果', '', ...jsonBlock(vm.model_critic));
  lines.push('## 9. 原始字段路径索引', '', ...jsonBlock(vm.field_path_index));
  return lines.join('\n');
}

export function compileExecutionDirectionsReportV2(input = {}) {
  return renderVisualDirectionsReport(compileVisualDirectionsReportViewModel(input));
}

export function compileExecutionDirectionsAuditV2(input = {}) {
  return renderVisualDirectionsAudit(compileVisualDirectionsAuditViewModel(input));
}
