// One-off fixture augmentation to v2.1 (doc section 十二/十六 regression).
// Adds direction_family / family_type, compliant compliance_weights (E02 meets
// the aesthetic thresholds), downstream_consumer_value, complete execution
// examples, and industry_recognition_classification so the new v2.1 gates pass
// for 九州美学 (and the other two projects regress cleanly).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'tests', 'fixtures', 'visual-direction-v2');
const PROJECTS = ['jiuzhou-meixue', 'mingjitang', 'vanke-suwan'];

const FAMILY_BY_INDEX = ['A', 'B', 'C'];
const FAMILY_TYPE_BY_LETTER = { A: 'supply_chain_trust', B: 'product_material_aesthetics', C: 'industry_ecosystem' };

// Weights per family (sum to 1.0). E02 (B) satisfies the aesthetic gate:
// brand_aesthetic >= 0.15, consumer_value >= 0.10, product_material >= 0.30.
const WEIGHTS = {
  A: { compliance_weight: 0.55, supply_chain_weight: 0.20, product_material_weight: 0.10, ecosystem_weight: 0.10, brand_aesthetic_weight: 0.03, consumer_value_weight: 0.02 },
  B: { compliance_weight: 0.10, supply_chain_weight: 0.07, product_material_weight: 0.50, ecosystem_weight: 0.08, brand_aesthetic_weight: 0.15, consumer_value_weight: 0.10 },
  C: { compliance_weight: 0.10, supply_chain_weight: 0.10, product_material_weight: 0.10, ecosystem_weight: 0.50, brand_aesthetic_weight: 0.10, consumer_value_weight: 0.10 }
};

const CONSUMER_VALUE = {
  A: { present: true, consumer_value_role: 'strong_secondary', value_statement: '上游供应链可信如何转化为消费者安全保障与安心感', visual_expression: '温控追溯可视化、资质透明化带来安心感', touchpoints: ['官网安心专区', '招商物料'], evidence_ids: [] },
  B: { present: true, consumer_value_role: 'primary', value_statement: '医美材料科学美学如何转化为消费者可感知的安心、品质与精致体验', visual_expression: '材料微观精密质感与纯净透明美学传递品质感', touchpoints: ['产品详情页', '品牌美学传播'], evidence_ids: [] },
  C: { present: true, consumer_value_role: 'primary', value_statement: '平台生态协同如何为消费者带来安心的美学价值与机构专业体验', visual_expression: '机构专业服务与消费者安心体验一体化', touchpoints: ['机构合作页', '消费者体验空间'], evidence_ids: [] }
};

const TOUCHPOINT_BY_CATEGORY = {
  core_brand: '品牌主视觉传播页',
  capability_product: '能力/产品介绍页',
  digital_event: '数字活动首屏'
};

function augmentExample(example, assetName, dirRole) {
  const cat = example.touchpoint_category;
  return {
    ...example,
    touchpoint: TOUCHPOINT_BY_CATEGORY[cat] || example.touchpoint || '执行触点',
    audience: 'B2B 采购决策者 / 医美机构运营者',
    communication_goal: '建立平台专业可信与安心感',
    hero_subject: example.subject,
    supporting_subjects: '品牌专属节点图形、数据信息卡',
    industry_content: example.industry_recognition_source,
    layout_structure: '左图右信息栅格',
    information_hierarchy: '品牌-能力-数据-CTA',
    brand_specific_detail: assetName,
    anti_concept_art_rule: '不得概念稿化、不得地产/展厅大片',
    prohibited_content: '建筑/展馆主体',
    downstream_consumer_value: { present: true, consumer_value_role: dirRole, value_statement: '', visual_expression: '', touchpoints: [], evidence_ids: [] }
  };
}

for (const project of PROJECTS) {
  const file = join(FIX, project, 'v2-directions.json');
  const dirs = JSON.parse(readFileSync(file, 'utf8'));
  const out = dirs.map((raw, i) => {
    const letter = FAMILY_BY_INDEX[i] || 'A';
    const base = structuredClone(raw);
    base.direction_family = letter;
    base.family_type = FAMILY_TYPE_BY_LETTER[letter];
    base.compliance_weights = { ...WEIGHTS[letter] };
    base.downstream_consumer_value = { ...CONSUMER_VALUE[letter] };
    const assetName = base.core_reusable_assets?.[0]?.asset_name || '品牌专属资产';
    if (Array.isArray(base.execution_examples)) {
      base.execution_examples = base.execution_examples.map((ex) => augmentExample(ex, assetName, CONSUMER_VALUE[letter].consumer_value_role));
    }
    // Industry recognition classification derived from the existing layer arrays.
    const layer = base.industry_recognition_layer || {};
    base.industry_recognition_classification = {
      regulatory_objects: [],
      supply_chain_objects: (layer.industry_process_objects || []).filter((s) => /供应链|仓储|物流|配送|追溯|温控/.test(s)).slice(0, 3),
      product_material_objects: (layer.industry_visual_objects || []).slice(0, 3),
      institution_service_objects: (layer.usable_business_objects || []).filter((s) => /机构|诊所|医院|门店|服务/.test(s)).slice(0, 3),
      consumer_value_objects: CONSUMER_VALUE[letter].value_statement ? ['消费者安心美学'] : [],
      aesthetic_culture_objects: (layer.industry_visual_objects || []).filter((s) => /美学|文化|艺术|视觉/.test(s)).slice(0, 3)
    };
    base.asset_authorization = { data_authorization_level: 'abstracted', document_visualization_mode: 'structure_only', credential_usage_mode: 'redacted', generated_data_policy: 'abstracted' };
    return base;
  });
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`augmented ${project}: ${out.length} directions`);
}
