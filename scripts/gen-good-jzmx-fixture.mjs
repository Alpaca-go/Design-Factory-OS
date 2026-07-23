// Regenerate the 九州美学 v2-directions fixture as a genuinely family-distinct
// (A/B/C) v2.1 set so it passes the new v2.1 gates (doc section 十二 通过标准).
// Uses the same makeGoodRaw construction the test suite already validates.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'tests', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions.json');

function loadFixture() {
  return JSON.parse(readFileSync(FIX, 'utf8'));
}

const FAMILIES = {
  A: {
    id: 'E01', name: '九州美学·全链可信系统',
    idea: '九州美学以供应链上游 GSP 温控仓储与全链合规追溯，建立 B2B 协同平台可信视觉，赋能医美机构与消费者安心',
    visual: ['GSP 仓储温控实时看板', '冷链运输轨迹', '资质审核流程墙'],
    data: ['在库温控合格率', '批次追溯覆盖率'],
    process: ['资质审核流程', '冷链配送链路'],
    space: ['仓储分拣实景', '平台运营中心'],
    business: ['合作机构铭牌', '温控标签'],
    prohibited: ['纯女性脸特写堆砌', '玻璃球科技感', '奢华地产大片'],
    assetName: ['供应链节点图', '资质数据卡', '冷链运输实景', '左图右信息栅格'],
    assetDesc: ['由温控节点与追溯链路构成', 'GSP 与资质追溯数据', '真实温控箱摄影', '可信栅格版式'],
    assetRole: ['主体识别图形贯穿触点', '资质/数据信息模块', '真实行业对象摄影', '左图右信息栅格版式'],
    photo: ['GSP 仓储货架', '冷链温控运输箱'],
    photoSubj: 'GSP 仓储货架为前景，冷链实景为背景',
    people: '仓储运营人员与温控设备同框',
    core: '九州美学是医美全链生态平台，以供应链上游温控仓储与合规追溯为底座',
    cap: '资质审核与 GSP 温控能力',
    qual: '批次追溯与在库温控',
    cta: '预约平台 Demo',
    compSubj: ['左侧真实温控仓储', '中部能力说明', '背景冷链实景'],
    compInfo: ['右侧信息模块', '流程与资质', '前景信息'],
    exSubj: ['GSP 仓储温控看板', '资质审核流程', '平台运营中心'],
    exStruct: ['左图右信息栅格', '能力说明页', '页面 hero'],
    weights: { compliance_weight: 0.55, supply_chain_weight: 0.2, product_material_weight: 0.1, ecosystem_weight: 0.1, brand_aesthetic_weight: 0.03, consumer_value_weight: 0.02 },
    classification: { regulatory_objects: ['资质审核流程'], supply_chain_objects: ['GSP 仓储', '冷链配送'], product_material_objects: [], institution_service_objects: ['合作机构'], consumer_value_objects: ['安心溯源'], aesthetic_culture_objects: [] },
    touch: ['合规白皮书', '供应链能力手册封面', '官网首屏'],
    consumer_role: 'strong_secondary',
    consumer_statement: '上游供应链可信如何转化为消费者安全保障与安心感',
    consumer_visual: '温控追溯可视化、资质透明化带来安心感',
    consumer_touchpoints: ['官网安心专区', '招商物料']
  },
  B: {
    id: 'E02', name: '九州美学·材料与科学美学',
    idea: '九州美学连接上游材料科学与终端美学价值，以医美器械微观结构与材料精密感，呈现科学美学与品牌专属资产',
    visual: ['医美器械微观结构', '材料表面精密纹理', '成分配比可视化'],
    data: ['材料耐受参数', '成分配比'],
    process: ['材料工艺', '精密注塑'],
    space: ['实验室实景', '材料检测台'],
    business: ['品牌专属材质样本', '科学美学标识'],
    prohibited: ['纯女性脸特写堆砌', '玻璃球科技感', '奢华地产大片'],
    assetName: ['材料微观结构图', '成分数据卡', '器械精密摄影', '材质栅格'],
    assetDesc: ['微观结构抽象图形', '材料参数数据', '真实器械精密摄影', '材质栅格版式'],
    assetRole: ['科学美学主图形', '材料信息模块', '真实器械摄影', '材质栅格版式'],
    photo: ['医美器械', '材料样本'],
    photoSubj: '医美器械微观结构为前景，实验室为背景',
    people: '材料研发人员与样本同框',
    core: '九州美学连接上游材料科学与终端美学价值，以平台能力赋能医美机构与消费者安心',
    cap: '医美材料与器械精密能力',
    qual: '材料参数与耐受',
    cta: '预约平台 Demo',
    compSubj: ['左侧器械微观结构', '中部材料说明', '背景实验室'],
    compInfo: ['右侧信息模块', '材料与能力', '前景信息'],
    exSubj: ['医美器械微观结构', '材料成分配比', '科学美学主视觉'],
    exStruct: ['左图右信息栅格', '能力说明页', '产品生态介绍页'],
    weights: { compliance_weight: 0.1, supply_chain_weight: 0.07, product_material_weight: 0.5, ecosystem_weight: 0.08, brand_aesthetic_weight: 0.15, consumer_value_weight: 0.1 },
    classification: { regulatory_objects: [], supply_chain_objects: [], product_material_objects: ['医美器械', '材料样本'], institution_service_objects: ['医美机构'], consumer_value_objects: ['消费者安心美学'], aesthetic_culture_objects: ['科学美学'] },
    touch: ['产品生态介绍页', '品牌峰会主视觉', '终端美学价值传播页'],
    consumer_role: 'primary',
    consumer_statement: '医美材料科学美学如何转化为消费者可感知的安心、品质与精致体验',
    consumer_visual: '材料微观精密质感与纯净透明美学传递品质感',
    consumer_touchpoints: ['产品详情页', '品牌美学传播']
  },
  C: {
    id: 'E03', name: '九州美学·生态协同与机构赋能',
    idea: '九州美学以 B2B2C 生态协同，赋能上游品牌、医美机构与消费者价值共存，平台、机构与终端美学价值一体',
    visual: ['上游品牌合作墙', '医美机构门头', '消费者体验空间'],
    data: ['机构入驻数', '生态协同指数'],
    process: ['上游品牌入驻', '机构赋能流程'],
    space: ['品牌峰会现场', '机构合作洽谈室'],
    business: ['上游品牌铭牌', '生态协同标识'],
    prohibited: ['纯女性脸特写堆砌', '玻璃球科技感', '奢华地产大片'],
    assetName: ['生态协同网络图', '机构赋能数据卡', '机构实景', '协同栅格'],
    assetDesc: ['生态节点图形', '协同数据', '真实机构摄影', '协同栅格版式'],
    assetRole: ['生态主图形', '协同信息模块', '真实机构摄影', '协同栅格版式'],
    photo: ['医美机构门头', '上游品牌展位'],
    photoSubj: '医美机构门头为前景，品牌峰会为背景',
    people: '机构运营者与消费者同框',
    core: '九州美学是医美全链生态平台，上游品牌、平台、机构与消费者价值共存',
    cap: '机构赋能与生态协同',
    qual: '生态协同数据',
    cta: '预约平台 Demo',
    compSubj: ['左侧机构门头', '中部协同说明', '背景品牌峰会'],
    compInfo: ['右侧信息模块', '协同与赋能', '前景信息'],
    exSubj: ['上游品牌合作墙', '医美机构门头', '消费者体验空间'],
    exStruct: ['左图右信息栅格', '能力说明页', '机构合作页面'],
    weights: { compliance_weight: 0.1, supply_chain_weight: 0.1, product_material_weight: 0.1, ecosystem_weight: 0.5, brand_aesthetic_weight: 0.1, consumer_value_weight: 0.1 },
    classification: { regulatory_objects: [], supply_chain_objects: [], product_material_objects: [], institution_service_objects: ['医美机构'], consumer_value_objects: ['消费者价值'], aesthetic_culture_objects: ['生态美学'] },
    touch: ['招商海报', '上游品牌合作提案', '机构合作页面'],
    consumer_role: 'primary',
    consumer_statement: '平台生态协同如何为消费者带来安心的美学价值与机构专业体验',
    consumer_visual: '机构专业服务与消费者安心体验一体化',
    consumer_touchpoints: ['机构合作页', '消费者体验空间']
  }
};

const TOUCHPOINT_BY_CATEGORY = { core_brand: '品牌主视觉传播页', capability_product: '能力/产品介绍页', digital_event: '数字活动首屏' };

function makeGoodRaw(family, idx) {
  const base = structuredClone(loadFixture()[0]);
  const fam = FAMILIES[family];
  base.direction_id = fam.id;
  base.direction_name = fam.name;
  base.strategic_idea = fam.idea;
  base.brand_evidence = fam.core;
  const layer = base.industry_recognition_layer;
  layer.industry_visual_objects = fam.visual;
  layer.industry_data_objects = fam.data;
  layer.industry_process_objects = fam.process;
  layer.industry_space_and_real_scenes = fam.space;
  layer.usable_business_objects = fam.business;
  layer.prohibited_misleading_templates = fam.prohibited;
  base.core_reusable_assets.forEach((a, i) => {
    a.asset_name = fam.assetName[i];
    a.visual_description = fam.assetDesc[i];
    a.execution_role = fam.assetRole[i];
  });
  const g = base.graphic_system;
  g.how_graphics_form = fam.assetName[0] + '抽象为图形';
  g.brand_fact_mapping = '图形对应' + fam.core;
  const p = base.photography_object_system;
  p.real_industry_objects = fam.photo;
  p.subject_and_background = fam.photoSubj;
  p.people_product_packaging = fam.people;
  const info = base.information_system;
  info.core_brand_info = fam.core;
  info.capability_product_info = fam.cap;
  info.data_qualification_info = fam.qual;
  info.cta_info = fam.cta;
  base.composition_templates.forEach((t, i) => {
    t.subject_position = fam.compSubj[i];
    t.information_position = fam.compInfo[i];
    t.image_object_rule = fam.photoSubj;
  });
  base.execution_examples.forEach((e, i) => {
    e.subject = fam.exSubj[i];
    e.visual_structure = fam.exStruct[i];
    e.information_position = fam.compInfo[i];
    e.industry_recognition_source = '来自' + fam.exSubj[i];
    e.touchpoint = fam.touch[i];
    e.audience = 'B2B 采购决策者';
    e.communication_goal = '建立平台可信';
    e.hero_subject = fam.exSubj[i];
    e.supporting_subjects = '品牌专属节点图形、数据信息卡';
    e.industry_content = fam.visual[i] || fam.exSubj[i];
    e.layout_structure = '左图右信息栅格';
    e.information_hierarchy = '品牌-能力-数据-CTA';
    e.brand_specific_detail = fam.assetName[0];
    e.anti_concept_art_rule = '不得概念稿化';
    e.prohibited_content = '建筑/展馆主体';
  });
  base.direction_family = family;
  base.family_type = { A: 'supply_chain_trust', B: 'product_material_aesthetics', C: 'industry_ecosystem' }[family];
  base.compliance_weights = fam.weights;
  base.industry_recognition_classification = fam.classification;
  base.asset_authorization = { data_authorization_level: 'abstracted', document_visualization_mode: 'structure_only', credential_usage_mode: 'redacted', generated_data_policy: 'abstracted' };
  base.downstream_consumer_value = {
    present: true,
    consumer_value_role: fam.consumer_role,
    value_statement: fam.consumer_statement,
    visual_expression: fam.consumer_visual,
    touchpoints: fam.consumer_touchpoints,
    evidence_ids: []
  };
  return base;
}

const out = [makeGoodRaw('A', 0), makeGoodRaw('B', 1), makeGoodRaw('C', 2)];
writeFileSync(FIX, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('regenerated jiuzhou-meixue fixture as good v2.1 set:', out.map((d) => d.direction_id).join(','));
