// v2 specialized-fix gates — unit + integration tests
// (doc: Masterpiece OS v2 执行向视觉方向专项修复开发文档). Fully offline and
// deterministic.
//
// Covers the six gates (Brand Identity Preservation, Business Model Coverage,
// Direction Family Difference, Compliance Weight Control, Industry Recognition
// Classification, Asset Authorization / forgery) plus the §11 readiness-score
// cap and the prompt hard-constraints. The "good" directions are built from the
// existing schema-valid fixture and mutated into three genuinely different
// Direction Families (A/B/C); the original homogeneous fixture is kept as the
// negative regression case.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateExecutionDirectionV2, VISUAL_DIRECTION_V2_CONTRACT_VERSION } from '../../src/v5/visual-translation/v2/schemas/direction-contract-v2.js';
import { evaluateExecutionReadiness } from '../../src/v5/visual-translation/v2/runtime/execution-readiness-evaluator.js';
import { detectUnexpectedBrandNames, evaluateBrandIdentityPreservation } from '../../src/v5/visual-translation/v2/runtime/brand-identity-preservation-evaluator.js';
import { evaluateBusinessModelCoverage } from '../../src/v5/visual-translation/v2/runtime/business-model-coverage-evaluator.js';
import { evaluateDirectionFamilyDifference } from '../../src/v5/visual-translation/v2/runtime/direction-family-difference-evaluator.js';
import { evaluateComplianceWeight } from '../../src/v5/visual-translation/v2/runtime/compliance-weight-controller.js';
import { evaluateIndustryRecognitionCoverage } from '../../src/v5/visual-translation/v2/runtime/industry-recognition-classifier.js';
import { evaluateAssetAuthorizationSet } from '../../src/v5/visual-translation/v2/runtime/asset-authorization-evaluator.js';
import { compileExecutionDirectionV2 } from '../../src/v5/visual-translation/v2/runtime/compile-execution-direction-v2.js';
import { buildExecutionDirectionV2Prompt } from '../../src/v5/visual-translation/v2/prompts/direction-generation-prompt-v2.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions.json');

function loadFixture() {
  return JSON.parse(readFileSync(FIX, 'utf8'));
}
// The canonical jiuzhou-meixue fixture (v2-directions.json) is a v2.1 GOOD set.
// The negative regression case is the homogeneous/degenerate fixture below.
const HOM = join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'v2-directions-homogeneous.json');
function loadHomogeneous() {
  return JSON.parse(readFileSync(HOM, 'utf8'));
}
function fixtureContext() {
  const ei = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'evidence-index.json'), 'utf8'));
  const ab = JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'asset-boundary.json'), 'utf8'));
  return {
    evidenceIndex: ei,
    assetBoundary: ab,
    audienceBoundary: JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'audience-boundary.json'), 'utf8')),
    selectedTouchpoints: JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue', 'selected-touchpoints.json'), 'utf8')),
    brandFacts: { reportLanguage: 'zh-CN', identity: { brandName: '九州美学', brandRole: '医美全链生态平台' } }
  };
}

// ---- P0: brand-name contamination detection ----
test('detectUnexpectedBrandNames flags a leaked example brand and passes the project brand', () => {
  const hit = detectUnexpectedBrandNames({
    expectedBrandName: '九州美学',
    sourceText: '安迹与九州美学对比分析',
    knownExampleBrandNames: ['安迹']
  });
  assert.equal(hit.hasUnexpected, true);
  assert.ok(hit.found.includes('安迹'));

  const clean = detectUnexpectedBrandNames({
    expectedBrandName: '九州美学',
    sourceText: '九州美学是医美全链生态平台，以供应链上游温控仓储为底座',
    knownExampleBrandNames: ['安迹']
  });
  assert.equal(clean.hasUnexpected, false);
});

// ---- build a schema-valid, family-distinct "good" set ----
function makeGoodRaw(family, idx) {
  const fixtures = loadFixture();
  const base = structuredClone(fixtures[{ A: 0, B: 1, C: 2 }[family]]);
  const fam = {
    A: {
      id: 'E0' + (idx + 1),
      name: '九州美学·全链可信系统',
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
      touch: ['合规白皮书', '供应链能力手册封面', '官网首屏']
    },
    B: {
      id: 'E0' + (idx + 1),
      name: '九州美学·材料与科学美学',
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
      touch: ['产品生态介绍页', '品牌峰会主视觉', '终端美学价值传播页']
    },
    C: {
      id: 'E0' + (idx + 1),
      name: '九州美学·生态协同与机构赋能',
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
      weights: { compliance_weight: 0.1, supply_chain_weight: 0.1, product_material_weight: 0.1, ecosystem_weight: 0.55, brand_aesthetic_weight: 0.1, consumer_value_weight: 0.05 },
      classification: { regulatory_objects: [], supply_chain_objects: [], product_material_objects: [], institution_service_objects: ['医美机构'], consumer_value_objects: ['消费者价值'], aesthetic_culture_objects: ['生态美学'] },
      touch: ['招商海报', '上游品牌合作提案', '机构合作页面']
    }
  }[family];

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
  // v2.1.1 — asset IDs cloned from a single fixture would be identical across
  // all three directions; make them globally unique so the asset_id_uniqueness
  // gate does not block the good set.
  const assetIdRemap = {};
  base.core_reusable_assets.forEach((a) => {
    const newId = `${family}-${a.asset_id}`;
    assetIdRemap[a.asset_id] = newId;
    a.asset_id = newId;
  });
  const rewriteAssetRefs = (ids) => (ids || []).map((id) => assetIdRemap[id] || id);
  base.composition_templates.forEach((t) => { t.reusable_assets = rewriteAssetRefs(t.reusable_assets); });
  base.execution_examples.forEach((e) => { e.reused_assets = rewriteAssetRefs(e.reused_assets); });
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
  base.compliance_weights = fam.weights;
  // v2.1.1 — keep consumer_value_weight consistent with the inherited
  // downstream_consumer_value role (strong_secondary requires >= 0.08).
  base.compliance_weights.consumer_value_weight = 0.10;
  base.industry_recognition_classification = fam.classification;
  base.asset_authorization = { data_authorization_level: 'abstracted', document_visualization_mode: 'structure_only', credential_usage_mode: 'redacted', generated_data_policy: 'abstracted' };
  return base;
}

function buildGoodSet() {
  return [makeGoodRaw('A', 0), makeGoodRaw('B', 1), makeGoodRaw('C', 2)];
}

// ---- Brand Identity Preservation Gate ----
test('Brand Identity Preservation passes a clean family-distinct set and blocks a leaked brand', () => {
  const ctx = fixtureContext();
  const good = buildGoodSet();
  const goodValidated = good.map((raw) => validateExecutionDirectionV2(raw, ctx));
  const pass = evaluateBrandIdentityPreservation({ directions: goodValidated, expectedBrandName: '九州美学', brandRole: '医美全链生态平台' });
  assert.equal(pass.brand_identity_preserved, true);
  assert.equal(pass.contamination_detected, false);

  const leaked = structuredClone(goodValidated[0]);
  leaked.strategic_idea = leaked.strategic_idea.replace('九州美学', '安迹');
  const fail = evaluateBrandIdentityPreservation({ directions: [leaked, goodValidated[1], goodValidated[2]], expectedBrandName: '九州美学', knownExampleBrandNames: ['安迹'] });
  assert.equal(fail.brand_identity_preserved, false);
  assert.equal(fail.contamination_detected, true);
  assert.equal(fail.error_code, 'UNEXPECTED_BRAND_IDENTITY');
});

// ---- Business Model Coverage Gate ----
test('Business Model Coverage passes the good set and flags the homogeneous fixture', () => {
  const ctx = fixtureContext();
  const good = buildGoodSet().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const goodG = evaluateBusinessModelCoverage(good);
  assert.equal(goodG.business_model_undercoverage, false);
  assert.equal(goodG.all_four_dimensions_covered, true);
  assert.ok(goodG.per_direction.every((d) => d.meets_minimum));

  const bad = loadHomogeneous().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const badG = evaluateBusinessModelCoverage(bad);
  assert.equal(badG.business_model_undercoverage, true);
});

// ---- Direction Family Difference Gate ----
test('Direction Family Difference passes the good set and flags the homogeneous fixture', () => {
  const ctx = fixtureContext();
  const good = buildGoodSet().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const goodD = evaluateDirectionFamilyDifference(good);
  assert.equal(goodD.rewrite_required, false);
  assert.ok(Object.values(goodD.pairwise_similarity).every((s) => s <= 0.72), JSON.stringify(goodD.pairwise_similarity));
  assert.equal(goodD.declared_families_distinct, true);

  const bad = loadHomogeneous().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const badD = evaluateDirectionFamilyDifference(bad);
  assert.equal(badD.direction_family_overlap, true);
  assert.equal(badD.rewrite_required, true);
});

// ---- Compliance Weight Control Gate ----
test('Compliance Weight Control allows one compliance-primary direction and flags overweight', () => {
  const ctx = fixtureContext();
  const good = buildGoodSet().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const goodC = evaluateComplianceWeight(good);
  assert.equal(goodC.compliance_overweight, false);
  assert.equal(goodC.rewrite_required, false);
  assert.equal(goodC.primary_compliance_direction_count, 1);

  const bad = loadHomogeneous().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const badC = evaluateComplianceWeight(bad);
  assert.equal(badC.compliance_supplychain_dominant, true);
  assert.equal(badC.rewrite_required, true);
});

// ---- Industry Recognition Classification Gate ----
test('Industry Recognition Classification passes the good set and flags the fixture', () => {
  const ctx = fixtureContext();
  const good = buildGoodSet().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const goodI = evaluateIndustryRecognitionCoverage(good);
  assert.equal(goodI.rewrite_required, false);
  assert.equal(goodI.all_required_categories_covered, true);

  const bad = loadHomogeneous().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const badI = evaluateIndustryRecognitionCoverage(bad);
  assert.equal(badI.rewrite_required, true);
});

// ---- Asset Authorization / forgery Gate ----
test('Asset Authorization detects fabricated credentials and passes clean directions', () => {
  const ctx = fixtureContext();
  const good = buildGoodSet().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const goodA = evaluateAssetAuthorizationSet(good);
  assert.equal(goodA.forgery_detected, false);

  const forged = structuredClone(good[0]);
  forged.information_system.data_qualification_info = '注册证号 ABC123 合格率 99.2%';
  const forgedA = evaluateAssetAuthorizationSet([forged, good[1], good[2]]);
  assert.equal(forgedA.forgery_detected, true);
  assert.equal(forgedA.per_direction[0].data_authorization_level, 'prohibited');
  assert.equal(forgedA.per_direction[0].generated_data_policy, 'prohibited');
});

// ---- §11 Readiness Score cap ----
test('Readiness score is capped at 59 when a hard criterion fails (no 100/100 + rewrite_required)', () => {
  const ctx = fixtureContext();
  const validated = validateExecutionDirectionV2(loadFixture()[0], ctx);
  const ready = evaluateExecutionReadiness(validated);
  assert.equal(ready.execution_status, 'ready');
  assert.ok(ready.readiness_score > 59);

  const bad = structuredClone(validated);
  bad.layout_behavior.subject_area = '以建筑作为视觉主体，远景宏大空间装置';
  const rewrite = evaluateExecutionReadiness(bad);
  assert.equal(rewrite.execution_status, 'rewrite_required');
  assert.ok(rewrite.readiness_score <= 59, `expected capped score, got ${rewrite.readiness_score}`);
  assert.equal(rewrite.score_capped, true);
});

// ---- Full compile: good set ready, homogeneous fixture rewrite_required ----
test('compile reports ready for the good family-distinct set and rewrite_required for the homogeneous fixture', () => {
  const ctx = fixtureContext();
  const good = buildGoodSet().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const goodCompiled = compileExecutionDirectionV2({ ...ctx, rawDirections: good });
  assert.equal(goodCompiled.overall_status, 'ready');
  assert.equal(goodCompiled.gates.brand_identity_preservation.brand_identity_preserved, true);
  assert.equal(goodCompiled.gates.compliance_weight_control.compliance_overweight, false);
  assert.equal(goodCompiled.gates.direction_family_difference.rewrite_required, false);

  const bad = loadHomogeneous().map((raw) => validateExecutionDirectionV2(raw, ctx));
  const badCompiled = compileExecutionDirectionV2({ ...ctx, rawDirections: bad });
  assert.equal(badCompiled.overall_status, 'rewrite_required');
  assert.ok(badCompiled.blocking_reasons.length > 0);
});

// ---- Prompt hard constraints ----
test('v2 prompt injects the project brand and the 10 hard constraints', () => {
  const prompt = buildExecutionDirectionV2Prompt({
    evidenceMap: { reportLanguage: 'zh-CN', identity: { brandName: '九州美学', brandRole: '医美全链生态平台' } },
    audienceBoundary: {},
    assetBoundary: { allowed_assets: [], restricted_assets: [] },
    selectedTouchpoints: ['poster']
  });
  const text = prompt[0].content;
  assert.ok(text.includes('九州美学'));
  assert.ok(text.includes('医美全链生态平台'));
  for (let i = 1; i <= 10; i += 1) assert.ok(text.includes(`${i}.`), `missing hard constraint ${i}`);
  assert.ok(text.includes('direction_family'));
  assert.ok(text.includes('compliance_weights'));
  assert.ok(text.includes('industry_recognition_classification'));
  assert.ok(text.includes('asset_authorization'));
});
