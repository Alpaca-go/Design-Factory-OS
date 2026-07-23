// Generate v2.1.2 Precision Patch deliverable reports for 九州美学
//  - GOOD (v2-directions.json)  -> ready
//  - DEGENERATE (homogeneous)   -> rewrite_required
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as v2 from '../src/v5/visual-translation/v2/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'tests', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue');
const OUT = join(HERE, '..', 'docs', 'v2.1.2-deliverables');
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
  console.log(`[${label}] overall=${compiled.overall_status} permission=${compiled.execution_permission_status} reasons=${JSON.stringify(compiled.blocking_reasons)}`);
  return compiled;
}

const good = build('v212', 'v2-directions.json');
const old = build('degenerate', 'v2-directions-homogeneous.json');

// --- v2.1.2 new gate accessors ---
function gStatus(g, key) {
  const v = g?.[key];
  if (!v) return 'N/A';
  if (v.rewrite_required != null) return v.rewrite_required ? '需重写' : '通过';
  if (v.allowed != null) return v.allowed ? '允许' : '阻断';
  if (v.set_missing_consumer_value != null) return v.set_missing_consumer_value ? '缺失' : '已覆盖';
  if (v.business_model_undercoverage != null) return v.business_model_undercoverage ? '不足' : '充分';
  if (v.compliance_overweight != null || v.compliance_supplychain_dominant != null) {
    return (v.compliance_overweight || v.compliance_supplychain_dominant) ? '越界' : '正常';
  }
  return JSON.stringify(v).slice(0, 40);
}

function e02Status(g) {
  const e = g?.e02_aesthetic_gate;
  if (!e) return 'N/A';
  if (!e.evaluated) return '未评估';
  const scores = e.degradation_score;
  if (!scores) return e.rewrite_required ? '未达(需重写)' : '达标';
  const parts = [
    `lab=${scores.lab_scene_dominance}`,
    `sci=${scores.scientific_info_dominance}`,
    `prod=${scores.product_presentation_strength}`,
    `brand=${scores.brand_aesthetic_strength}`,
    `consumer=${scores.consumer_value_strength}`,
    `variety=${scores.execution_variety}`
  ].join(' ');
  return e.rewrite_required ? `未达(需重写) [${parts}]` : `达标 [${parts}]`;
}

function brandStatus(g) {
  const b = g?.brand_identity_preservation;
  if (!b) return 'N/A';
  if (b.hard_blocked) return `阻断(置信=${b.highest_confidence?.toFixed(2) ?? 'N/A'})`;
  if (b.warnings?.length) return `通过(${b.warnings.length}条警告)`;
  return '通过';
}

function fabricatedStatus(g) {
  const a = g?.asset_authorization;
  if (!a) return 'N/A';
  const total = a.total_detections ?? 0;
  const blocked = a.total_blocked ?? 0;
  return `${blocked}阻断/${total}总检测`;
}

function consumerWeightStatus(g) {
  const c = g?.consumer_weight_consistency;
  if (!c) return 'N/A';
  return c.rewrite_required ? '不一致(需重写)' : '一致';
}

function assetIdStatus(g) {
  const a = g?.asset_id_uniqueness;
  if (!a) return 'N/A';
  return a.duplicate_detected ? '重复' : '唯一';
}

function spatialStatus(g) {
  const s = g?.spatial_drift;
  if (!s) return 'N/A';
  return s.rewrite_required ? `需重写(arch=${s.architecture_as_primary_subject})` : '通过';
}

const gDfd = good.gates?.direction_family_difference?.rewrite_required ? '重叠(需重写)' : '正常';
const oDfd = old.gates?.direction_family_difference?.rewrite_required ? '重叠(需重写)' : '正常';

const summary = [
  '# 九州美学 视觉方向 v2.1.2 Precision Patch 新旧对比',
  '',
  '| 维度 | 旧（同质/退化输入） | 新（v2.1.2 好集合） |',
  '| --- | --- | --- |',
  `| 整体状态 | ${old.overall_status} | ${good.overall_status} |`,
  `| 整体执行许可 | ${old.execution_permission_status} | ${good.execution_permission_status} |`,
  `| 阻断原因数 | ${old.blocking_reasons.length} | ${good.blocking_reasons.length} |`,
  `| 方向家族差异 | ${oDfd} | ${gDfd} |`,
  `| 消费者价值覆盖 | ${gStatus(old.gates, 'consumer_value_coverage')} | ${gStatus(good.gates, 'consumer_value_coverage')} |`,
  `| E02 美学门槛 | ${e02Status(old.gates)} | ${e02Status(good.gates)} |`,
  `| 业务模型覆盖 | ${gStatus(old.gates, 'business_model_coverage')} | ${gStatus(good.gates, 'business_model_coverage')} |`,
  `| 合规权重 | ${gStatus(old.gates, 'compliance_weight_control')} | ${gStatus(good.gates, 'compliance_weight_control')} |`,
  `| 品牌身份保护 | ${brandStatus(old.gates)} | ${brandStatus(good.gates)} |`,
  `| 伪造数据检测 | ${fabricatedStatus(old.gates)} | ${fabricatedStatus(good.gates)} |`,
  `| 消费者角色/权重一致 | ${consumerWeightStatus(old.gates)} | ${consumerWeightStatus(good.gates)} |`,
  `| Asset ID 全局唯一 | ${assetIdStatus(old.gates)} | ${assetIdStatus(good.gates)} |`,
  `| 空间漂移(E03) | ${spatialStatus(old.gates)} | ${spatialStatus(good.gates)} |`,
  '',
  '> 旧报告（退化输入）对应文件：jiuzhou-meixue-execution-report-degenerate.md',
  '> 新报告（v2.1.2 好集合）对应文件：jiuzhou-meixue-execution-report-v212.md',
  '',
  '## v2.1.2 Precision Patch 关键改进',
  '',
  '1. **品牌身份保护**：增加置信度评分(0.1-0.98)、上下文分析、非品牌短语排除、hard-block/warning 分级',
  '2. **伪造数据降噪**：设计语境字段（画布比例/图文比例/版式参数）不再触发 blocked，仅保留 field_structure warning',
  '3. **E02 Degradation 组合评分**：6 维评分（lab_scene / scientific_info / product_presentation / brand_aesthetic / consumer_value / execution_variety），组合阈值触发阻断',
  '4. **Execution Example 展示补全**：补齐 18 个字段，主报告只显示 blocked + 最多 5 条高置信 warning',
  '5. **Consumer Role/Weight 一致性**：修复 E02/E03 的 consumer_value_role 从 primary 改为 strong_secondary，权重对齐 0.10',
  '6. **Asset ID 全局唯一**：确保 E01/E02/E03 方向资产 ID 不重复',
  '7. **Spatial Drift(E03)**：禁止句过滤后 per-direction max 计数，避免误报'
].join('\n');

writeFileSync(join(OUT, 'jiuzhou-meixue-before-after-v212.md'), summary, 'utf8');
console.log('wrote v2.1.2 before/after summary');
