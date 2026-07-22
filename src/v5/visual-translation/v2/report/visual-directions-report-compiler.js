const STATUS_LABELS = Object.freeze({
  ready: '可执行',
  ready_with_warnings: '可执行（有提示）',
  rewrite_required: '需修改',
  blocked: '已阻断',
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
  BRAND_NAME_NOT_PRESERVED: ['品牌身份尚未稳定保留', '在战略、品牌信息和执行示例中统一使用项目品牌身份。'],
  CONSUMER_WEIGHT_CONSISTENCY: ['用户价值与表达权重不一致', '校准用户价值定位及相应的视觉权重。'],
  ASSET_AUTHORIZATION_WARNING: ['素材或数据使用需确认授权', '只使用已确认的素材和事实，未确认内容保留为占位。'],
  EVIDENCE_BOUND_VALUE_REQUIRED: ['具体数值缺少事实依据', '回到原始资料确认数值及引用，否则移除具体数值。'],
  ANCHOR_MECHANISM_ENHANCEMENT_REQUIRED: ['核心视觉机制需要加强', '补齐选择维度、映射规则和差异化原则。'],
  EXECUTION_EXAMPLE_INCOMPLETE: ['执行触点信息不完整', '补齐画布、主体、信息区、品牌区和响应式适配。'],
  EXECUTION_EXAMPLE_SPECIFICITY: ['执行触点仍过于抽象', '把概念词改写为可见对象、位置、比例和组版行为。']
});

const AUDIT_SECTIONS = Object.freeze([
  ['Brand Identity & Authorization', ['brand_identity_preservation', 'group_visual_authorization']],
  ['Fact & Evidence Protection', ['asset_authorization']],
  ['Business Model Coverage', ['business_model_coverage']],
  ['Consumer / User Value', ['consumer_value_coverage', 'consumer_weight_consistency']],
  ['Direction Family Difference', ['direction_family_difference']],
  ['Execution Template Difference', ['execution_example_quality']],
  ['Industry Recognition', ['industry_recognition_coverage']],
  ['Category / Spatial Drift', ['spatial_drift', 'direction_touchpoint_risk']],
  ['Asset ID Integrity', ['asset_id_uniqueness']],
  ['Execution Example Completeness', ['execution_example_completeness']],
  ['Execution Example Specificity', ['execution_example_specificity']],
  ['Anchor Mechanism Critic', ['e02_aesthetic_gate']],
  ['Collection Status Compilation', ['compliance_weight_control']]
]);

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

function userSafeText(value, fallback = '需要进一步确认') {
  const text = compact(value, '');
  if (!text || /visualDirectionV2\.|field_path|matched_rule/u.test(text) || /^[A-Z0-9_:-]+$/u.test(text) || /[a-z]+(?:_[a-z0-9]+){1,}/u.test(text)) return fallback;
  return text;
}

function normalizeEvidence(issue) {
  return compact(issue.normalized_evidence || issue.detected_value || issue.evidence_excerpt || issue.message, '')
    .normalize('NFKC').replace(/[\s–—~～至]+/gu, '').toLowerCase();
}

function issueDirectionIds(issue) {
  return [...new Set([
    ...(issue.source_direction_ids || []),
    ...(issue.direction_id ? [issue.direction_id] : [])
  ].filter(Boolean))].sort();
}

function issueOccurrenceCount(issue) {
  return Math.max(1, issue.occurrences?.length || 0, issue.field_paths?.length || 0);
}

function userIssueCopy(issue) {
  const mapped = ISSUE_COPY[issue.code];
  if (mapped) return { title: mapped[0], action: mapped[1] };
  const severityLabel = { blocking: '阻断', rewrite: '修改', warning: '确认', info: '提示' }[issue.severity] || '确认';
  const title = userSafeText(issue.user_title || issue.message, `存在一项需要${severityLabel}的问题`);
  const action = userSafeText(issue.recommendation || issue.user_action, '根据技术审计中的定位证据完成定向修改。');
  return { title, action };
}

export function groupVisualDirectionIssues(issues = []) {
  const groups = new Map();
  for (const issue of issues.filter(Boolean)) {
    const directionIds = issueDirectionIds(issue);
    const scope = issue.issue_scope || issue.scope || (directionIds.length ? 'direction' : 'collection');
    const key = [issue.code || 'UNCLASSIFIED', normalizeEvidence(issue), directionIds.join(','), scope].join('|');
    const existing = groups.get(key);
    if (existing) {
      existing.hit_count += issueOccurrenceCount(issue);
      existing.technical_issues.push(issue);
      continue;
    }
    const copy = userIssueCopy(issue);
    groups.set(key, {
      group_id: '',
      code: issue.code || 'UNCLASSIFIED',
      severity: issue.severity || 'warning',
      scope,
      direction_ids: directionIds,
      normalized_evidence: normalizeEvidence(issue),
      evidence_summary: truncate(userSafeText(issue.detected_value || issue.evidence_excerpt || issue.message, '详见技术审计')),
      title: copy.title,
      action: copy.action,
      collection_effect: Boolean(issue.collection_effect),
      hit_count: issueOccurrenceCount(issue),
      technical_issues: [issue]
    });
  }
  return [...groups.values()]
    .sort((a, b) => ['blocking', 'rewrite', 'warning', 'info'].indexOf(a.severity) - ['blocking', 'rewrite', 'warning', 'info'].indexOf(b.severity))
    .map((group, index) => ({ ...group, group_id: `IG-${String(index + 1).padStart(3, '0')}` }));
}

function derivePipelineStages(compiled, visualFactFirst, pipelineCompleteness) {
  const retrieval = visualFactFirst?.benchmarkRetrieval;
  const opportunities = visualFactFirst?.visualOpportunitySynthesis?.differentiation_opportunities || [];
  const directions = compiled?.directions || [];
  const retrievalStatus = retrieval?.retrieval_status;
  const hasCases = Array.isArray(retrieval?.cases) && retrieval.cases.length > 0;
  return [
    { id: 'visual_brief', name: 'Visual Brief', status: visualFactFirst?.visualBrief ? 'complete' : 'failed', detail: visualFactFirst?.visualBrief ? '已形成视觉任务约束' : '缺少 Visual Brief' },
    { id: 'visual_asset_evidence', name: '视觉素材证据', status: visualFactFirst?.visualAssetEvidence ? 'complete' : 'failed', detail: visualFactFirst?.visualAssetEvidence ? '已编目素材与授权边界' : '缺少素材证据' },
    { id: 'benchmark_retrieval', name: '标杆检索', status: hasCases && ['completed', 'fixture'].includes(retrievalStatus) ? 'complete' : hasCases || retrievalStatus === 'partial' ? 'partial' : 'failed', detail: hasCases ? `${retrieval.cases.length} 个可用案例` : '无可用检索案例' },
    { id: 'visual_opportunity', name: '视觉机会综合', status: opportunities.length >= 3 && hasCases ? 'complete' : opportunities.length ? 'partial' : 'failed', detail: `${opportunities.length} 个差异化机会` },
    { id: 'direction_generation', name: '方向生成', status: directions.length === 3 ? 'complete' : directions.length ? 'partial' : 'failed', detail: `${directions.length} 个方向` },
    { id: 'validation', name: '结构校验', status: compiled?.overall_status ? 'complete' : 'failed', detail: STATUS_LABELS[compiled?.overall_status] || compact(compiled?.overall_status) },
    { id: 'pipeline', name: '管线总体', status: pipelineCompleteness || visualFactFirst?.pipelineCompleteness || 'partial', detail: STATUS_LABELS[pipelineCompleteness || visualFactFirst?.pipelineCompleteness] || compact(pipelineCompleteness) }
  ];
}

function criticForDirection(modelCritic, directionId) {
  const items = modelCritic?.per_direction || modelCritic?.directions || [];
  const found = items.find((item) => (item.direction_id || item.id) === directionId);
  if (!found) return { status: 'not_available', label: '未提供', summary: '本次结构化结果未包含该方向的独立 Critic。' };
  return {
    status: found.status || found.recommendation || 'available',
    label: status(found.recommendation || found.status || '已评估'),
    summary: compact(found.summary || found.reason || found.message || found.critique)
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

function mapDirection(entry, groups, modelCritic) {
  const direction = entry.direction || {};
  const id = direction.direction_id || '未编号';
  const examples = direction.execution_examples || [];
  return {
    id,
    name: compact(direction.direction_name, id),
    family: FAMILY_LABELS[direction.family_type] || FAMILY_LABELS[direction.direction_family] || `方向家族 ${id}`,
    strategic_idea: compact(direction.strategic_idea),
    source_opportunity_ids: direction.source_opportunity_ids || [],
    visual_protagonist: compact(visualProtagonist(direction)),
    mechanism: compact(mechanism(direction)),
    industry_recognition: compact(direction.industry_recognition_layer),
    assets: (direction.core_reusable_assets || []).map((asset) => compact(asset.asset_name || asset.name || asset.asset_id || asset)),
    asset_references: direction.asset_references || [],
    photography_system: compact(direction.photography_object_system),
    graphic_system: compact(direction.graphic_system),
    information_system: compact(direction.information_system),
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
    status: entry.local_status || entry.status || 'not_available',
    collection_status: entry.collection_status || compiledCollectionStatus(entry),
    permission: entry.local_execution_permission_status || entry.execution_permission_status || 'not_available',
    structural_score: entry.structural_completeness_score,
    content_score: entry.content_readiness_score,
    readiness_score: entry.readiness_score,
    issue_groups: groups.filter((group) => group.direction_ids.includes(id)),
    critic: criticForDirection(modelCritic, id)
  };
}

function compiledCollectionStatus(entry) {
  return entry.collection_execution_permission_status || 'not_available';
}

function collectionCritic(modelCritic) {
  if (!modelCritic) return { label: '未提供', score: null, summary: '本次结构化结果未包含集合 Critic。' };
  return {
    label: status(modelCritic.recommendation || modelCritic.status || '已评估'),
    score: Number.isFinite(modelCritic.score) ? modelCritic.score : null,
    summary: compact(modelCritic.summary || modelCritic.reason || modelCritic.message || '该建议不改变 Runtime 状态。')
  };
}

function deriveNextActions(groups, pipelineStages, compiled) {
  const actions = [];
  for (const stage of pipelineStages.filter((item) => ['failed', 'partial'].includes(item.status) && item.id !== 'pipeline')) {
    actions.push({ priority: stage.status === 'failed' ? '高' : '中', action: `补齐${stage.name}：${stage.detail}` });
  }
  for (const group of groups.filter((item) => item.severity !== 'info')) {
    actions.push({ priority: group.severity === 'blocking' ? '高' : '中', action: group.action, direction_ids: group.direction_ids });
  }
  if (!actions.length) actions.push({ priority: '低', action: '选定一个方向进入样式帧、组件和关键页面设计。' });
  if (compiled?.anchor_readiness !== 'ready') actions.unshift({ priority: '高', action: '完成阻断项修改前，不进入 Anchor 定稿或批量延展。' });
  return [...new Map(actions.map((item) => [`${item.action}|${(item.direction_ids || []).join(',')}`, item])).values()].slice(0, 10);
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
    opportunities: visualFactFirst?.visualOpportunitySynthesis?.differentiation_opportunities || []
  };
}

export function compileVisualDirectionsReportViewModel({ projectId = 'unknown', compiled = {}, pipelineCompleteness, visualFactFirst } = {}) {
  const issueGroups = groupVisualDirectionIssues(compiled.gate_issues || []);
  const pipelineStages = derivePipelineStages(compiled, visualFactFirst, pipelineCompleteness);
  return Object.freeze({
    kind: 'VisualDirectionsReportViewModel',
    project_id: projectId,
    executive: {
      overall_status: compiled.overall_status || 'not_available',
      permission: compiled.execution_permission_status || 'not_available',
      anchor_readiness: compiled.anchor_readiness || 'blocked',
      pipeline_completeness: pipelineCompleteness || visualFactFirst?.pipelineCompleteness || 'partial',
      legacy_fallback: (pipelineCompleteness || visualFactFirst?.pipelineCompleteness) === 'fallback',
      collection_critic: collectionCritic(compiled.model_critic)
    },
    pipeline_stages: pipelineStages,
    issue_groups: issueGroups,
    directions: (compiled.directions || []).map((entry) => mapDirection(entry, issueGroups, compiled.model_critic)),
    next_actions: deriveNextActions(issueGroups, pipelineStages, compiled),
    retrieval: retrievalSummary(visualFactFirst)
  });
}

export function compileVisualDirectionsAuditViewModel(input = {}) {
  const report = compileVisualDirectionsReportViewModel(input);
  const compiled = input.compiled || {};
  return Object.freeze({
    kind: 'VisualDirectionsAuditViewModel',
    project_id: report.project_id,
    runtime_status: {
      overall_status: compiled.overall_status,
      legacy_gate_status: compiled.legacy_gate_status,
      execution_permission_status: compiled.execution_permission_status,
      anchor_readiness: compiled.anchor_readiness,
      blocking_reasons: compiled.blocking_reasons || [],
      pipeline_completeness: report.executive.pipeline_completeness
    },
    pipeline_stages: report.pipeline_stages,
    issue_groups: report.issue_groups,
    technical_issues: report.issue_groups.flatMap((group) => group.technical_issues.map((issue, index) => ({
      technical_id: `${group.group_id}-T${String(index + 1).padStart(2, '0')}`,
      group_id: group.group_id,
      ...issue
    }))),
    gates: compiled.gates || {},
    model_critic: compiled.model_critic || null,
    lightweight_validation: compiled.lightweight_validation || null,
    directions: (compiled.directions || []).map((entry) => ({
      direction_id: entry.direction?.direction_id,
      local_status: entry.local_status,
      collection_status: entry.collection_status,
      local_execution_permission_status: entry.local_execution_permission_status,
      collection_execution_permission_status: entry.collection_execution_permission_status,
      structural_completeness_score: entry.structural_completeness_score,
      content_readiness_score: entry.content_readiness_score,
      readiness_score: entry.readiness_score,
      local_gate_reasons: entry.local_gate_reasons,
      validation_error: entry.validation_error
    })),
    retrieval: report.retrieval
  });
}

function status(value) {
  return STATUS_LABELS[value] || compact(value);
}

function score(value) {
  return Number.isFinite(value) ? `${Math.round(value)}/100` : '未计算';
}

function pushTable(lines, headers, rows) {
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) lines.push(`| ${row.map((cell) => compact(cell).replace(/\|/gu, '⁄')).join(' | ')} |`);
  lines.push('');
}

export function renderVisualDirectionsReport(viewModel) {
  const vm = viewModel;
  const lines = [`# 视觉方向报告`, '', `> 项目：${vm.project_id}`, ''];
  lines.push('## 1. 执行摘要', '');
  lines.push(`- 总体状态：**${status(vm.executive.overall_status)}**`);
  lines.push(`- 执行许可：**${status(vm.executive.permission)}**`);
  lines.push(`- Anchor 就绪度：**${vm.executive.anchor_readiness === 'ready' ? '已就绪' : '未就绪'}**`);
  lines.push(`- 管线完整度：**${status(vm.executive.pipeline_completeness)}**`);
  lines.push(`- 集合 Critic：**${vm.executive.collection_critic.label}**${vm.executive.collection_critic.score === null ? '' : `（${vm.executive.collection_critic.score}/100）`}`);
  lines.push(`- 建议：${vm.executive.collection_critic.summary}`, '');

  lines.push('## 2. 管线完整度', '');
  pushTable(lines, ['阶段', '状态', '说明'], vm.pipeline_stages.map((item) => [item.name, status(item.status), item.detail]));

  lines.push('## 3. 关键阻断与待确认事项', '');
  if (!vm.issue_groups.length) lines.push('- 当前未发现需要阻断交付的结构化问题。', '');
  for (const group of vm.issue_groups) {
    const target = group.direction_ids.length ? `（${group.direction_ids.join('、')}）` : '（全局）';
    lines.push(`- **${group.title}** ${target}：${group.evidence_summary}${group.hit_count > 1 ? `；合并 ${group.hit_count} 处命中` : ''}`);
    lines.push(`  - 处理建议：${group.action}`);
  }
  lines.push('');

  lines.push('## 4. 三方向对比', '');
  pushTable(lines, ['方向', '视觉主角', '核心机制', '执行触点', '本地状态', '方向 Critic', 'Anchor 准备'], vm.directions.map((item) => [
    `${item.id} ${item.name}`, truncate(item.visual_protagonist, 45), truncate(item.mechanism, 60), item.examples.map((example) => example.touchpoint).join('、'), status(item.status), item.critic.label, item.permission === 'allowed' ? '已准备' : '待修改'
  ]));

  vm.directions.forEach((direction, index) => {
    lines.push(`## ${index + 5}. ${direction.id} ${direction.name}`, '');
    lines.push('### 策略与来源', '');
    lines.push(`- 方向家族：${direction.family}`);
    lines.push(`- 策略构想：${direction.strategic_idea}`);
    lines.push(`- 来源机会：${compact(direction.source_opportunity_ids)}`, '');
    lines.push('### 核心视觉系统', '');
    lines.push(`- 视觉主角：${direction.visual_protagonist}`);
    lines.push(`- 选择机制：${direction.mechanism}`);
    lines.push(`- 行业识别：${direction.industry_recognition}`);
    lines.push(`- 可复用素材：${compact(direction.assets)}`);
    lines.push(`- 摄影系统：${truncate(direction.photography_system, 240)}`);
    lines.push(`- 图形系统：${truncate(direction.graphic_system, 240)}`);
    lines.push(`- 信息系统：${truncate(direction.information_system, 240)}`, '');
    lines.push(`### 执行触点（${direction.examples.length}）`, '');
    for (const example of direction.examples) {
      lines.push(`#### ${example.index}. ${example.touchpoint}`, '');
      lines.push(`- 受众与目标：${example.audience}；${example.goal}`);
      lines.push(`- 主角与结构：${example.hero}；${example.structure}`);
      lines.push(`- 信息区 / 品牌区：${example.information_zone} / ${example.brand_zone}`);
      lines.push(`- 画布与适配：${example.canvas_ratio}；${example.responsive}`, '');
    }
    lines.push('### 本地状态与准备度', '');
    lines.push(`- 本地状态：${status(direction.status)}`);
    lines.push(`- 集合状态：${status(direction.collection_status)}`);
    lines.push(`- 执行许可：${status(direction.permission)}`);
    lines.push(`- 结构完整 / 内容就绪 / 综合就绪：${score(direction.structural_score)} / ${score(direction.content_score)} / ${score(direction.readiness_score)}`);
    lines.push(`- 方向 Critic：${direction.critic.label}——${direction.critic.summary}`, '');
    lines.push('### 修改建议', '');
    if (!direction.issue_groups.length) lines.push('- 无必须修改项，可继续深化。');
    else for (const group of direction.issue_groups) lines.push(`- ${group.action}`);
    lines.push('');
  });

  lines.push('## 8. 下一步动作', '');
  vm.next_actions.forEach((item, index) => lines.push(`${index + 1}. [${item.priority}] ${item.action}${item.direction_ids?.length ? `（${item.direction_ids.join('、')}）` : ''}`));
  lines.push('', '## 附录 A：Retrieval First 证据摘要', '');
  lines.push(`- 检索状态：${status(vm.retrieval.status)}`);
  lines.push(`- 查询 / 结果 / 相关结果 / 可用案例：${vm.retrieval.query_count} / ${vm.retrieval.result_count} / ${vm.retrieval.relevant_count} / ${vm.retrieval.case_count}`);
  lines.push(`- 最低案例要求：${vm.retrieval.minimum_requirements_met ? '已满足' : '未满足'}`);
  lines.push(`- 差异化机会：${compact(vm.retrieval.opportunities.map((item) => item.opportunity_name || item.title || item.opportunity_id))}`);
  return lines.join('\n');
}

function jsonBlock(value) {
  return ['```json', JSON.stringify(value ?? null, null, 2), '```', ''];
}

export function renderVisualDirectionsAudit(viewModel) {
  const vm = viewModel;
  const lines = ['# 视觉方向技术审计报告', '', `> 项目：${vm.project_id}`, ''];
  lines.push('## 1. Pipeline Integrity', '');
  lines.push(...jsonBlock({ runtime_status: vm.runtime_status, pipeline_stages: vm.pipeline_stages, retrieval: vm.retrieval, lightweight_validation: vm.lightweight_validation }));
  AUDIT_SECTIONS.forEach(([title, gateKeys], index) => {
    lines.push(`## ${index + 2}. ${title}`, '');
    const gates = Object.fromEntries(gateKeys.filter((key) => Object.hasOwn(vm.gates, key)).map((key) => [key, vm.gates[key]]));
    lines.push(...jsonBlock(gates));
  });
  lines.push('## 技术问题与聚合回链', '');
  lines.push(...jsonBlock({ issue_groups: vm.issue_groups.map(({ technical_issues, ...group }) => group), technical_issues: vm.technical_issues }));
  lines.push('## 方向本地与集合状态', '');
  lines.push(...jsonBlock(vm.directions));
  lines.push('## Critic 原始结果', '');
  lines.push(...jsonBlock(vm.model_critic));
  return lines.join('\n');
}

export function compileExecutionDirectionsReportV2(input = {}) {
  return renderVisualDirectionsReport(compileVisualDirectionsReportViewModel(input));
}

export function compileExecutionDirectionsAuditV2(input = {}) {
  return renderVisualDirectionsAudit(compileVisualDirectionsAuditViewModel(input));
}
