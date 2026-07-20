// Experimental v2 execution report adapter (doc section 十一).
//
// Produces an INDEPENDENT experimental report
// `visual-directions-execution-report-v2-experimental.md`. It does NOT replace
// the v1.3.3 Decision Report Compiler. It summarises the validated v2
// directions, their Execution Readiness scores, regression-guard results and an
// optional A/B comparison against the conceptual_v1 baseline.

const METRIC_LABELS = {
  industry_recognition_strength: '行业识别强度',
  directly_executable_degree: '可直接执行程度',
  reusable_visual_asset_count: '可复用视觉资产数量',
  flat_design_conversion_ability: '平面设计转化能力',
  real_touchpoint_coverage: '真实触点覆盖',
  brand_exclusivity: '品牌专属性',
  concept_art_risk: '概念稿风险',
  real_estate_drift_risk: '地产/展厅漂移风险',
  abstract_object_dependency: '抽象物体依赖'
};

function metricLine(key, value) {
  const lowerIsBetter = key === 'concept_art_risk' || key === 'real_estate_drift_risk' || key === 'abstract_object_dependency';
  const flag = lowerIsBetter ? (value <= 2 ? '✅' : '⚠️') : (value >= 4 ? '✅' : '⚠️');
  return `- ${METRIC_LABELS[key] || key}：**${value}** ${flag}`;
}

export function compileExecutionDirectionsReportV2({ projectId = 'unknown', compiled, abComparison } = {}) {
  const lines = [];
  lines.push(`# 执行向视觉方向 v2 实验报告（experimental）`);
  lines.push('');
  lines.push(`> 报告版本：` + 'visual-directions-execution-report-v2-experimental');
  lines.push(`> 项目：` + projectId);
  lines.push(`> 生成模式：` + (compiled?.direction_generation_mode || 'execution_oriented_v2'));
  lines.push(`> 整体状态：` + (compiled?.overall_status || 'unknown'));
  lines.push('');

  if (!compiled || !compiled.directions?.length) {
    lines.push('_未提供已编译的 v2 方向。_');
    return lines.join('\n');
  }

  for (const item of compiled.directions) {
    const d = item.direction;
    const r = item.readiness;
    lines.push(`## ${d.direction_id} · ${d.direction_name}`);
    lines.push('');
    lines.push(`**战略构想：** ${d.strategic_idea}`);
    lines.push('');
    lines.push(`**执行就绪：** ${r.execution_status} ｜ 综合就绪分 ${r.readiness_score}/100`);
    lines.push('');
    lines.push('**行业识别层**');
    const layer = d.industry_recognition_layer;
    lines.push(`- 行业视觉对象：${(layer.industry_visual_objects || []).join('、') || '—'}`);
    lines.push(`- 行业数据对象：${(layer.industry_data_objects || []).join('、') || '—'}`);
    lines.push(`- 行业流程对象：${(layer.industry_process_objects || []).join('、') || '—'}`);
    lines.push(`- 真实场景：${(layer.industry_space_and_real_scenes || []).join('、') || '—'}`);
    lines.push(`- 最低行业识别强度：${layer.minimum_industry_recognition_strength}`);
    lines.push('');
    lines.push(`**可复用视觉资产（${d.core_reusable_assets.length}）**`);
    for (const asset of d.core_reusable_assets) {
      lines.push(`- [${asset.asset_type}] ${asset.asset_name}（${asset.asset_id}）：${asset.visual_description}`);
    }
    lines.push('');
    lines.push('**执行就绪指标**');
    for (const [key, value] of Object.entries(r.metrics)) lines.push(metricLine(key, value));
    if (r.failed_criteria.length) {
      lines.push('');
      lines.push(`**未通过标准：**` + r.failed_criteria.map((f) => `${f.metric}(${f.actual})`).join('、'));
    }
    if (r.concept_art_violations.length) {
      lines.push(`**概念稿违规：** ` + r.concept_art_violations.join('、'));
    }
    lines.push('');
    lines.push(`**回归守卫：** 资产权限 ${item.assetAuthorization.ok ? 'OK' : 'FAIL'} ｜ 证据保护 ${item.evidencePreservation.ok ? 'OK' : 'FAIL'} ｜ 受众边界 ${item.audienceBoundaryGuard.ok ? 'OK' : 'FAIL'}`);
    const fam = d.direction_family ? ` ｜ 方向家族 ${d.direction_family}` : '';
    lines.push(`**品牌身份：** ${compiled.gates.brand_identity_preservation.brand_identity_preserved ? '保留 ✅' : '污染 ❌'}${fam}`);
    if (item.readiness.score_capped) lines.push(`**就绪分已封顶：** 59（存在未通过 Gate 或硬指标）`);
    lines.push('');
  }

  // ── 专项修复 Gate 总览（doc section 13 评估顺序）──
  const gates = compiled.gates || {};
  lines.push('---');
  lines.push('## 专项修复 Gate 总览');
  lines.push('');
  lines.push(`> 整体状态：**${compiled.overall_status}**`);
  if (compiled.blocking_reasons?.length) {
    lines.push(`> 阻断原因：${compiled.blocking_reasons.join('、')}`);
  }
  lines.push('');

  const bip = gates.brand_identity_preservation;
  if (bip) {
    lines.push(`### 1. 品牌身份保护 ${bip.brand_identity_preserved ? '✅' : '❌'}`);
    lines.push(`- 品牌名保留：${bip.brand_name_preserved ? '是' : '否'} ｜ 角色保留：${bip.brand_role_preserved ? '是' : '否'} ｜ 核心命题保留：${bip.strategic_thesis_preserved ? '是' : '否'} ｜ 行业身份未被简化：${bip.industry_identity_preserved ? '是' : '否'}`);
    if (bip.contamination_detected) lines.push(`- ⚠️ 检测到非项目品牌：${bip.contamination_sources.map((s) => `${s.direction_id}:${s.unexpected_brand_names?.join('/') || s.reason}`).join('、')}`);
    lines.push('');
  }

  const bmc = gates.business_model_coverage;
  if (bmc) {
    lines.push(`### 2. 业务模型覆盖 ${bmc.business_model_undercoverage ? '❌ 需重写' : '✅'}`);
    for (const item of bmc.per_direction) {
      lines.push(`- ${item.direction_id}：已覆盖 ${item.covered_dimension_count}/4 维（上游${item.b2b_coverage ? '✓' : '✗'} 平台${item.platform_role_coverage ? '✓' : '✗'} 机构${item.industry_ecosystem_coverage ? '✓' : '✗'} 消费者${item.consumer_value_coverage ? '✓' : '✗'}）`);
    }
    lines.push(`- 三方向整体是否覆盖全部 4 维：${bmc.all_four_dimensions_covered ? '是' : '否'}`);
    lines.push('');
  }

  const dfd = gates.direction_family_difference;
  if (dfd) {
    lines.push(`### 3. 方向家族差异 ${dfd.rewrite_required ? '❌ 需重写' : '✅'}`);
    const pairs = dfd.pairwise_similarity || {};
    for (const [pair, sim] of Object.entries(pairs)) {
      lines.push(`- ${pair} 相似度：${sim}${sim > 0.72 ? ' ⚠️ 超阈值' : ''}`);
    }
    if (dfd.declared_families_distinct === false) lines.push(`- ⚠️ 声明的 direction_family 未区分（需 A/B/C 不同）`);
    lines.push('');
  }

  const cwc = gates.compliance_weight_control;
  if (cwc) {
    lines.push(`### 4. 合规权重控制 ${cwc.rewrite_required ? '❌ 需重写' : '✅'}`);
    lines.push(`- 合规为 Primary 的方向数：${cwc.primary_compliance_direction_count}（上限 1）｜ 合规过重：${cwc.compliance_overweight ? '是' : '否'}`);
    for (const item of cwc.per_direction) {
      lines.push(`- ${item.direction_id}：合规 ${item.compliance_weight} 供应链 ${item.supply_chain_weight} 产品材料 ${item.product_material_weight} 生态 ${item.ecosystem_weight} 品牌美学 ${item.brand_aesthetic_weight} 消费者 ${item.consumer_value_weight}`);
    }
    lines.push('');
  }

  const irc = gates.industry_recognition_coverage;
  if (irc) {
    lines.push(`### 5. 行业识别分类 ${irc.rewrite_required ? '❌ 需重写' : '✅'}`);
    const sc = irc.set_coverage || {};
    lines.push(`- 整体是否覆盖前 5 类：${irc.all_required_categories_covered ? '是' : '否'}（regulatory${sc.regulatory_objects ? '✓' : '✗'} supply${sc.supply_chain_objects ? '✓' : '✗'} product${sc.product_material_objects ? '✓' : '✗'} institution${sc.institution_service_objects ? '✓' : '✗'} consumer${sc.consumer_value_objects ? '✓' : '✗'}）`);
    lines.push('');
  }

  const aa = gates.asset_authorization;
  if (aa) {
    lines.push(`### 6. 资产权限与伪造风险 ${aa.forgery_detected ? '❌ 阻断' : '✅'}`);
    if (aa.forgery_detected) {
      for (const item of aa.per_direction) {
        if (!item.ok) lines.push(`- ${item.direction_id} 检测到伪造：${item.forgery_violations.join('、')}`);
      }
    } else {
      lines.push('- 未检测到伪造资质/注册证/数据/责任人。');
    }
    lines.push('');
  }

  if (abComparison) {
    lines.push('## A/B 对比（conceptual_v1 vs execution_oriented_v2）');
    lines.push('');
    lines.push(`- 项目判定：${abComparison.project_verdict}`);
    lines.push(`- 人工偏好：${abComparison.human_preference}`);
    lines.push(`- v2 全部就绪：${abComparison.v2_all_ready}`);
    lines.push(`- 指标改善：${JSON.stringify(abComparison.measurable_criteria)}`);
    lines.push('');
  }

  return lines.join('\n');
}
