// Generate the v2.1.4 deliverable reports for 九州美学:
//  - NEW (good set, v2-directions.json)  -> ready / ready_with_warnings
//  - DEGENERATE (homogeneous, v2-directions-homogeneous.json) -> blocked / rewrite_required
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as v2 from '../src/v5/visual-translation/v2/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'tests', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue');
const OUT = join(HERE, '..', 'docs', 'v2.1-deliverables');
mkdirSync(OUT, { recursive: true });

function ctx() {
  const ei = JSON.parse(readFileSync(join(FIX, 'evidence-index.json'), 'utf8'));
  const ab = JSON.parse(readFileSync(join(FIX, 'asset-boundary.json'), 'utf8'));
  return {
    evidenceIndex: ei,
    assetBoundary: ab,
    audienceBoundary: JSON.parse(readFileSync(join(FIX, 'audience-boundary.json'), 'utf8')),
    selectedTouchpoints: JSON.parse(readFileSync(join(FIX, 'selected-touchpoints.json'), 'utf8')),
    brandFacts: { reportLanguage: 'zh-CN', identity: { brandName: '九州美学', brandRole: '医美全链生态平台' } }
  };
}

function build(label, file) {
  const raw = JSON.parse(readFileSync(join(FIX, file), 'utf8')).map((r) => v2.validateExecutionDirectionV2(r, ctx()));
  const compiled = v2.compileExecutionDirectionV2({ ...ctx(), rawDirections: raw });
  const report = v2.compileExecutionDirectionsReportV2({ projectId: 'jiuzhou-meixue', compiled });
  writeFileSync(join(OUT, `jiuzhou-meixue-execution-report-${label}.md`), report, 'utf8');
  writeFileSync(join(OUT, `jiuzhou-meixue-compiled-${label}.json`), JSON.stringify(compiled, null, 2) + '\n', 'utf8');
  console.log(`[${label}] overall=${compiled.overall_status} permission=${compiled.execution_permission_status} reasons=${JSON.stringify(compiled.blocking_reasons)} info=${JSON.stringify(compiled.info_issues)}`);
  return compiled;
}

const good = build('v21', 'v2-directions.json');
const old = build('degenerate', 'v2-directions-homogeneous.json');

// v2.1.4 — five-level status counters (doc §七).
function countLevels(compiled) {
  const br = compiled.blocking_reasons || [];
  const info = compiled.info_issues || [];
  const gates = compiled.gates || {};

  let blocked = 0;
  let rewrite = 0;
  let conditional = 0;
  let warning = 0;
  let infoCount = 0;

  // Overall status
  if (compiled.overall_status === 'blocked') blocked++;
  else if (compiled.overall_status === 'rewrite_required') rewrite++;
  else if (compiled.overall_status === 'ready_with_warnings') conditional++;
  else if (compiled.overall_status === 'ready') {
    if (br.length > 0) warning++;
    else if (info.length > 0) infoCount++;
  }

  // Gate-level counters
  if (gates.brand_identity_preservation?.blocking_reasons?.length) blocked += gates.brand_identity_preservation.blocking_reasons.length;
  if (gates.asset_authorization?.forgery_detected) blocked++;
  if (gates.asset_id_uniqueness?.duplicate_detected) blocked++;
  if (gates.execution_example_completeness?.any_blocked) blocked++;
  if (gates.consumer_value_coverage?.set_missing_consumer_value) blocked++;

  if (gates.e02_aesthetic_gate?.rewrite_required) rewrite++;
  if (gates.direction_family_difference?.rewrite_required) rewrite++;
  if (gates.compliance_weight_control?.rewrite_required) rewrite++;
  if (gates.spatial_drift?.rewrite_required) rewrite++;
  if (gates.consumer_weight_consistency?.rewrite_required) rewrite++;
  if (gates.business_model_coverage?.business_model_undercoverage) rewrite++;
  if (gates.industry_recognition_coverage?.rewrite_required) rewrite++;

  if (gates.e02_aesthetic_gate?.positive_quality_status === 'conditional') conditional++;
  if (gates.spatial_drift?.spatial_drift_status === 'warning') conditional++;
  if (gates.execution_example_completeness?.any_conditional) conditional++;

  if (gates.e02_aesthetic_gate?.positive_quality_status === 'pass_with_warning') warning++;
  if (gates.execution_example_specificity?.template_warning) warning++;
  if (gates.execution_example_completeness?.any_warning) warning++;

  if (gates.e02_aesthetic_gate?.positive_quality_status === 'pass_with_warning') infoCount++;
  if (gates.execution_example_specificity?.template_warning) infoCount++;
  if (gates.execution_example_completeness?.warning) infoCount++;
  if (compiled.info_issues?.length) infoCount += compiled.info_issues.length;

  // Fabricated data (doc §七): count blocked / high-confidence warning / info-level
  const aa = gates.asset_authorization;
  let fabBlocked = 0;
  let fabWarning = 0;
  let fabInfo = 0;
  if (aa) {
    for (const item of aa.per_direction || []) {
      for (const det of item.detections || []) {
        if (det.risk_level === 'blocked') fabBlocked++;
        else if (det.confidence >= 0.7) fabWarning++;
        else fabInfo++;
      }
    }
  }

  return { blocked, rewrite, conditional, warning, infoCount, fabBlocked, fabWarning, fabInfo };
}

const gCounts = countLevels(good);
const oCounts = countLevels(old);

const gDfd = good.gates?.direction_family_difference?.rewrite_required ? '重叠(需重写)' : '正常';
const oDfd = old.gates?.direction_family_difference?.rewrite_required ? '重叠(需重写)' : '正常';
const gCv = good.gates?.consumer_value_coverage?.set_missing_consumer_value ? '缺失' : '已覆盖';
const oCv = old.gates?.consumer_value_coverage?.set_missing_consumer_value ? '缺失' : '已覆盖';
const gE02 = good.gates?.e02_aesthetic_gate?.rewrite_required ? '未达(需重写)' : (good.gates?.e02_aesthetic_gate?.positive_quality_status === 'pass_with_warning' ? 'Pass With Warning' : '达标');
const oE02 = old.gates?.e02_aesthetic_gate?.rewrite_required ? '未达(需重写)' : '达标';
const gBmc = good.gates?.business_model_coverage?.business_model_undercoverage ? '不足' : '充分';
const oBmc = old.gates?.business_model_coverage?.business_model_undercoverage ? '不足' : '充分';
const gCw = (good.gates?.compliance_weight_control?.compliance_overweight || good.gates?.compliance_weight_control?.compliance_supplychain_dominant) ? '越界' : '正常';
const oCw = (old.gates?.compliance_weight_control?.compliance_overweight || old.gates?.compliance_weight_control?.compliance_supplychain_dominant) ? '越界' : '正常';

// v2.1.4 — Specificity gate
const gSpec = good.gates?.execution_example_specificity?.template_overuse ? '模板过度复用(需重写)' : (good.gates?.execution_example_specificity?.template_warning ? '轻度重复' : '差异清楚');
const oSpec = old.gates?.execution_example_specificity?.template_overuse ? '模板过度复用(需重写)' : (old.gates?.execution_example_specificity?.template_warning ? '轻度重复' : '差异清楚');

// v2.1.4 — Touchpoint coverage using unified score
const gTpc = good.gates?.execution_example_quality?.final_touchpoint_score_5 ?? good.gates?.execution_example_completeness?.touchpoint_coverage_score ?? '—';
const oTpc = old.gates?.execution_example_quality?.final_touchpoint_score_5 ?? old.gates?.execution_example_completeness?.touchpoint_coverage_score ?? '—';

// v2.1.4 — E02 Product Material Direction Missing
const gE02Missing = good.gates?.e02_aesthetic_gate?.product_material_direction_missing ? '缺失' : '已检测';
const oE02Missing = old.gates?.e02_aesthetic_gate?.product_material_direction_missing ? '缺失' : '已检测';

const summary = [
  '# 九州美学 视觉方向 v2.1.4 新旧对比',
  '',
  '| 维度 | 旧（退化/同质输入） | 新（可放行结构集合） |',
  '| --- | --- | --- |',
  `| 整体状态 | ${old.overall_status} | ${good.overall_status} |`,
  `| 整体执行许可 | ${old.execution_permission_status} | ${good.execution_permission_status} |`,
  `| 阻断原因数 | ${old.blocking_reasons.length} | ${good.blocking_reasons.length} |`,
  `| 非阻断提示数 | ${old.info_issues?.length ?? 0} | ${good.info_issues?.length ?? 0} |`,
  '',
  '## 五级状态统计',
  '',
  '| 级别 | 旧 | 新 |',
  '| --- | --- | --- |',
  `| Blocked | ${oCounts.blocked} | ${gCounts.blocked} |`,
  `| Rewrite Required | ${oCounts.rewrite} | ${gCounts.rewrite} |`,
  `| Conditional | ${oCounts.conditional} | ${gCounts.conditional} |`,
  `| Warning | ${oCounts.warning} | ${gCounts.warning} |`,
  `| Info | ${oCounts.infoCount} | ${gCounts.infoCount} |`,
  '',
  '## Gate 明细对比',
  '',
  '| Gate | 旧 | 新 |',
  '| --- | --- | --- |',
  `| 方向家族差异 | ${oDfd} | ${gDfd} |`,
  `| 消费者价值覆盖 | ${oCv} | ${gCv} |`,
  `| E02 产品材料方向 | ${oE02Missing} | ${gE02Missing} |`,
  `| E02 美学门槛 | ${oE02} | ${gE02} |`,
  `| 业务模型覆盖 | ${oBmc} | ${gBmc} |`,
  `| 合规权重 | ${oCw} | ${gCw} |`,
  `| 触点覆盖 (5分制) | ${oTpc} | ${gTpc} |`,
  `| 模板特异性 | ${oSpec} | ${gSpec} |`,
  '',
  '## Fabricated Data 统计',
  '',
  `| 项目 | 旧 | 新 |`,
  `| --- | --- | --- |`,
  `| 阻断 | ${oCounts.fabBlocked} | ${gCounts.fabBlocked} |`,
  `| 高置信 Warning | ${oCounts.fabWarning} | ${gCounts.fabWarning} |`,
  `| 结构/低置信 Info | ${oCounts.fabInfo} | ${gCounts.fabInfo} |`,
  '',
  '> 旧报告（退化输入）对应文件：jiuzhou-meixue-execution-report-degenerate.md',
  '> 新报告（可放行结构集合）对应文件：jiuzhou-meixue-execution-report-v21.md'
].join('\n');
writeFileSync(join(OUT, 'jiuzhou-meixue-before-after.md'), summary, 'utf8');
console.log('wrote before/after summary');
