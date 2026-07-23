// Single-call execution-oriented Direction Generation Prompt v2.
// Stage 04 must produce one complete JSON response; runtime validation may
// request at most one field-level repair after this generation.

import {
  ANTI_CONCEPT_ART_CONSTRAINTS,
  COMPOSITION_TOUCHPOINTS,
  CONSUMER_VALUE_ROLES,
  EXECUTION_EXAMPLE_CATEGORIES,
  PHOTOGRAPHY_REQUIREMENT_MODES,
  REUSABLE_ASSET_TYPES
} from '../schemas/direction-contract-v2.js';

export const VISUAL_DIRECTIONS_PROMPT_V2_VERSION = 'visual-direction-v2-execution-step4-r6-dynamic-families';

const OUTPUT_TYPE_SKELETON = Object.freeze({
  visualDirectionV2Set: {
    directions: [{
      direction_id: 'D01',
      direction_name: '中文正式方向名',
      strategic_idea: '品牌事实、行业对象与执行机制组成的中文句子',
      direction_family: '运行时选中的 candidate_id',
      family_type: '运行时生成的方向家族名称',
      industry_recognition_layer: {
        industry_visual_objects: ['基于证据的行业视觉对象'],
        industry_data_objects: ['structure_only 数据字段'],
        industry_process_objects: ['基于证据的行业流程对象'],
        industry_space_and_real_scenes: ['真实行业场景'],
        usable_business_objects: ['可用于传播的业务对象'],
        prohibited_misleading_templates: ['禁止的误导模板'],
        minimum_industry_recognition_strength: 4
      },
      core_reusable_assets: [{
        asset_id: 'D01-G-01',
        asset_name: '可复用资产中文名',
        asset_type: 'graphic_asset',
        visual_description: '具体视觉描述',
        business_evidence: '对应的已验证业务证据',
        execution_role: '资产在触点中的具体作用',
        reusable_touchpoints: ['poster'],
        prohibited_use: '禁止的使用方式'
      }],
      graphic_system: {
        how_graphics_form: '图形形成规则',
        brand_fact_mapping: '品牌事实映射规则',
        scale_crop_repeat: '缩放裁切重复规则',
        enter_touchpoints: '进入触点的规则',
        must_not_become: '不得滑向的通用形式'
      },
      photography_object_system: {
        needs_photography: 'required',
        real_industry_objects: ['真实行业对象'],
        subject_and_background: '主体与背景规则',
        people_product_packaging: '人物、产品与包装规则',
        graphic_overlay: '图形叠加规则',
        real_content_ratio: {
          real_industry_content_ratio: 0.4,
          branded_graphic_ratio: 0.35,
          information_layout_ratio: 0.25
        }
      },
      information_system: {
        core_brand_info: '品牌核心信息',
        capability_product_info: '能力或产品信息',
        data_qualification_info: 'structure_only，不填未经验证的具体数值',
        cta_info: '行动信息',
        information_hierarchy: ['品牌', '能力', '数据结构', 'CTA'],
        fabricated_info_prohibited: ['未经证据支持的具体指标']
      },
      layout_behavior: {
        subject_area: '主体区域规则',
        info_area: '信息区域规则',
        brand_area: '品牌区域规则',
        whitespace_area: '留白区域规则',
        data_note_area: '数据注释区域规则',
        multi_size_adaptation: '多尺寸适配规则'
      },
      composition_templates: [{
        template_id: 'D01-T-01',
        touchpoint: 'poster',
        subject_position: '主体具体位置',
        information_position: '信息具体位置',
        reusable_assets: ['D01-G-01'],
        image_object_rule: '图像对象规则',
        negative_constraints: ['一条负向约束']
      }],
      material_and_light_support: {
        material_support: '辅助执行的材质原则',
        light_support: '辅助执行的光线原则'
      },
      execution_examples: [{
        example_id: 'D01-X-01',
        touchpoint_category: 'core_brand',
        touchpoint: '招商海报',
        audience: 'B2B采购决策者',
        communication_goal: '建立平台可信',
        hero_subject: '具体真实行业主体',
        hero_subject_position: '主体具体位置',
        hero_subject_scale: '主体画面占比',
        supporting_subjects: '辅助主体',
        subject: '画面主体',
        visual_structure: '视觉结构',
        information_position: '信息位置',
        information_zone: {
          position: '画面右下区域',
          width_or_height: '画面宽度的三分之一',
          alignment: '左对齐',
          hierarchy_behavior: '品牌、能力、行动信息依次分层',
          collision_avoidance: '与主体和品牌安全区保持间距'
        },
        brand_zone: {
          position: '画面左上区域',
          logo_scale: '画面宽度的十分之一',
          safe_area: '至少一个标志高度',
          relationship_to_hero: '与主视觉主体错位排列',
          fixed_or_adaptive: '按横竖版自适应'
        },
        whitespace_behavior: '品牌区与信息区之间保留明确功能留白',
        canvas_ratio: '4:5',
        photography_ratio: 0.4,
        graphic_ratio: 0.35,
        information_ratio: 0.25,
        responsive_adaptation: '竖版上下分区，横版左右分区',
        graphic_overlay: '品牌图形叠加规则',
        reused_assets: ['D01-G-01'],
        industry_recognition_source: '已验证行业事实',
        industry_content: '真实行业内容',
        layout_structure: '左主体右信息栅格',
        information_hierarchy: '品牌、能力、数据结构、CTA',
        brand_specific_detail: '项目品牌专属细节',
        anti_concept_art_rule: '必须可转化为平面设计',
        prohibited_content: '建筑或展馆主体',
        anti_concept_art_note: '避免通用概念稿语言',
        downstream_consumer_value: {
          present: true,
          consumer_value_role: 'strong_secondary',
          value_statement: '由已验证业务能力转化的消费者价值',
          visual_expression: '消费者能够感知的视觉表达',
          touchpoints: ['官网'],
          evidence_ids: []
        }
      }],
      brand_evidence: '一条不超过500字、仅基于证据的中文品牌事实句子',
      compliance_weights: {
        compliance_weight: 0.2,
        supply_chain_weight: 0.3,
        product_material_weight: 0.1,
        ecosystem_weight: 0.2,
        brand_aesthetic_weight: 0.1,
        consumer_value_weight: 0.1
      },
      industry_recognition_classification: {
        regulatory_objects: ['基于证据的监管对象'],
        supply_chain_objects: ['基于证据的供应链对象'],
        product_material_objects: ['基于证据的产品或材料对象'],
        institution_service_objects: ['基于证据的机构服务对象'],
        consumer_value_objects: ['基于证据的消费者价值对象'],
        aesthetic_culture_objects: ['基于证据的审美文化对象']
      },
      asset_authorization: {
        data_authorization_level: 'abstracted',
        document_visualization_mode: 'structure_only',
        credential_usage_mode: 'redacted',
        generated_data_policy: 'abstracted'
      },
      execution_constraints: ['一条具体执行约束'],
      anti_concept_art_constraints: ANTI_CONCEPT_ART_CONSTRAINTS,
      template_risks: ['一条具体模板化风险'],
      evidence_ids: ['真实 Evidence ID'],
      asset_references: []
    }]
  }
});

const OUTPUT_FIELD_CONTRACT = `{
  "visualDirectionV2Set": {
    "directions": [
      {
        "direction_id": "string",
        "direction_name": "Chinese string",
        "strategic_idea": "Chinese string, 15-80 chars",
        "source_opportunity_ids": ["Opportunity ID"],
        "direction_family": "selected DirectionFamilyCandidate.candidate_id",
        "family_type": "selected DirectionFamilyCandidate.name",
        "industry_recognition_layer": {
          "industry_visual_objects": ["string"], "industry_data_objects": ["string"],
          "industry_process_objects": ["string"], "industry_space_and_real_scenes": ["string"],
          "usable_business_objects": ["string"], "prohibited_misleading_templates": ["string"],
          "minimum_industry_recognition_strength": 4
        },
        "core_reusable_assets": [{
          "asset_id": "globally unique string", "asset_name": "string", "asset_type": "${REUSABLE_ASSET_TYPES.join('|')}",
          "visual_description": "<=120 Chinese chars", "business_evidence": "string",
          "execution_role": "string", "reusable_touchpoints": ["string"], "prohibited_use": "string"
        }],
        "graphic_system": {"how_graphics_form":"string","brand_fact_mapping":"string","scale_crop_repeat":"string","enter_touchpoints":"string","must_not_become":"string"},
        "photography_object_system": {"needs_photography":"${PHOTOGRAPHY_REQUIREMENT_MODES.join('|')}","real_industry_objects":["string"],"subject_and_background":"string","people_product_packaging":"string","graphic_overlay":"string","real_content_ratio":{"real_industry_content_ratio":0.4,"branded_graphic_ratio":0.35,"information_layout_ratio":0.25}},
        "information_system": {"core_brand_info":"string","capability_product_info":"string","data_qualification_info":"structure_only string","cta_info":"string","information_hierarchy":["string"],"fabricated_info_prohibited":["string"]},
        "layout_behavior": {"subject_area":"string","info_area":"string","brand_area":"string","whitespace_area":"string","data_note_area":"string","multi_size_adaptation":"string"},
        "composition_templates": [{"template_id":"string","touchpoint":"${COMPOSITION_TOUCHPOINTS.join('|')}","subject_position":"string","information_position":"string","reusable_assets":["asset_id"],"image_object_rule":"string","negative_constraints":["string"]}],
        "material_and_light_support": {"material_support":"string","light_support":"string"},
        "execution_examples": [{
          "example_id":"string","touchpoint_category":"${EXECUTION_EXAMPLE_CATEGORIES.join('|')}","touchpoint":"string","audience":"string","communication_goal":"string",
          "hero_subject":"string","hero_subject_position":"string","hero_subject_scale":"string","supporting_subjects":"string","subject":"string","visual_structure":"string","information_position":"string",
          "information_zone":{"position":"string","width_or_height":"string","content_types":["string"],"alignment":"string","background_relationship":"string"},
          "brand_zone":{"position":"string","logo_usage":"string","safety_margin":"string","relationship_to_main_visual":"string","prohibited_behavior":["string"]},
          "whitespace_behavior":"string","canvas_ratio":"string","photography_ratio":0.4,"graphic_ratio":0.35,"information_ratio":0.25,"responsive_adaptation":"string","graphic_overlay":"string",
          "reused_assets":["asset_id"],"industry_recognition_source":"string","industry_content":"string","layout_structure":"string","information_hierarchy":"string","brand_specific_detail":"string","anti_concept_art_rule":"string","prohibited_content":"string","anti_concept_art_note":"string",
          "downstream_consumer_value":{"present":true,"consumer_value_role":"${CONSUMER_VALUE_ROLES.join('|')}","value_statement":"string","visual_expression":"string","touchpoints":["string"],"evidence_ids":["Evidence ID"]}
        }],
        "brand_evidence":"Chinese string <=200 chars","compliance_weights":{"compliance_weight":0.2,"supply_chain_weight":0.3,"product_material_weight":0.1,"ecosystem_weight":0.2,"brand_aesthetic_weight":0.1,"consumer_value_weight":0.1},
        "industry_recognition_classification":{"regulatory_objects":["string"],"supply_chain_objects":["string"],"product_material_objects":["string"],"institution_service_objects":["string"],"consumer_value_objects":["string"],"aesthetic_culture_objects":["string"]},
        "selection_mechanism":{"selection_dimensions":["string"],"visual_mapping_rule":"string","multi_category_rule":"string","comparison_behavior":"string","platform_signature":"string"},
        "execution_constraints":["string <=80 chars"],"template_risks":["string <=80 chars"],"evidence_ids":["Evidence ID"],"asset_references":["allowed asset ID"]
      }
    ]
  }
}`;

export function buildExecutionDirectionV2Prompt(context) {
  const reportLanguage = context.brandFacts?.reportLanguage || context.evidenceMap?.reportLanguage || context.reportLanguage || 'zh-CN';
  const brandIdentity = context.brandFacts?.identity || context.evidenceMap?.identity || {};
  const brandName = brandIdentity.brandName || brandIdentity.projectName || '当前项目品牌';
  const brandRole = brandIdentity.brandRole || '当前项目已验证品牌角色';
  const allowedAssets = context.assetBoundary?.allowed_assets || context.assetBoundary?.allowed || [];
  const restrictedAssets = context.assetBoundary?.restricted_assets || context.assetBoundary?.restricted || [];
  const assetId = (asset) => typeof asset === 'string' ? asset : asset.asset_id || asset.assetId;

  return [{ role: 'system', content: `PROTOCOL_STAGE=04-execution-oriented-directions-v2
PROMPT_VERSION=${VISUAL_DIRECTIONS_PROMPT_V2_VERSION}
DIRECTION_GENERATION_MODE=execution_oriented_v2

使用 ${reportLanguage}，在一次生成中输出恰好三个显著不同、可执行的视觉方向。不得拆分 Stage A / Stage B，不得等待中间文件，不得在输出前重新调用模型。

项目品牌（必须原样保留）：
- 品牌名称：${brandName}
- 品牌角色：${brandRole}
- 不得引入其他品牌名，不得把品牌缩减为单一供应链、合规 SaaS、采购或物流职能。

执行硬约束：
1. 只能从 Selected Direction Families 各选择一个候选，分别生成 D01、D02、D03；direction_family 写 candidate_id，family_type 写候选 name。禁止预设可信、材料、生态三槽。
2. industry_recognition_layer 必须先于抽象表达，识别强度不低于 4。
3. 每方向提供 3-5 个 core_reusable_assets，并覆盖 graphic_asset、information_asset、photography_asset、layout_asset。
4. 每方向至少两个 composition_templates；每方向恰好三个 execution_examples，覆盖 core_brand、capability_product、digital_event，触点不重复。
5. 每个触点必须完整提供 information_zone、brand_zone、canvas_ratio、whitespace_behavior、responsive_adaptation 和全部 Schema 必填字段。
6. compliance_weights 六项总和必须为 1.00 ± 0.01；权重由候选战略轴与项目事实决定，不得按方向编号固定。
7. 三方向的来源机会、视觉主角、生成机制、主要触点和品牌价值侧重点必须分别不同。
8. 空间、展厅或建筑只能在项目机会明确以其为主要战略轴时成为主视觉；局部室内背景不得被扩张为空间叙事。
9. 不得生成未经 Evidence 支持的具体姓名、编号、指标、比例、资质、产品参数或合作成果；仅允许 structure_only 字段结构。
9a. 每个方向必须填写 source_opportunity_ids，且只能引用 Visual Opportunities 中存在的 ID。confirmed facts 可直接使用；inferred 只能作为弱提示；unknown 不得转成视觉资产；requires_confirmation 只能写入风险和约束。
9b. 每个方向都必须完整填写 selection_mechanism：selection_dimensions 至少 2 项，visual_mapping_rule、multi_category_rule、comparison_behavior、platform_signature 均为非空具体字符串；禁止输出空字符串或占位符。五项必须说明本方向如何从判断标准生成可观察视觉规则，而不是风格形容词。
10. 以下九项 anti_concept_art_constraints 是固定协议字段，由程序统一注入；模型不得修改，也不要在 JSON 中重复输出：
${ANTI_CONCEPT_ART_CONSTRAINTS.map((item, index) => `   ${index + 1}. ${item.constraint_id}`).join('\n')}

asset_authorization 是程序注入的运行时策略元数据，模型不得输出该字段。

关键字段类型（输出前在同一次生成内检查并就地更正，不得重新生成）：
- brand_evidence：required string，中文，最大 500 字；禁止 object、array、null、number。
- execution_constraints：required non-empty string[]；每一项必须是 string。
- template_risks：required non-empty string[]；每一项必须是 string。
- selection_mechanism：object；五个字段全部必填且有实际内容。selection_dimensions 为至少 2 项的 string[]；其余四项为 non-empty string。输出前逐字段检查，三个方向都必须填写。
- information_zone：object，必须含 position、width_or_height、content_types、alignment、background_relationship。
- brand_zone：object，必须含 position、logo_usage、safety_margin、relationship_to_main_visual、prohibited_behavior。

画布比例必须匹配载体且三个触点不得统一：海报 4:5 或 1:1；手册 A4；官网 16:9 或 21:9；峰会/展览 16:9 或 3:1；短视频 9:16。
若 Asset Boundary (allowed) 非空，每个方向至少在 asset_references 引用一个允许的原始资产 ID；locked 资产按原身份继承，editable 资产必须在 core_reusable_assets.business_evidence / visual_description 中说明如何重构及原因。restricted 资产不得引用。若确实没有可继承资产，必须在 brand_evidence 中明确“本方向主要由品牌事实驱动，未有效继承现有视觉资产”。

三个方向的质量定义（必须写入现有字段，不新增 Schema 字段）：
- 每个方向忠实展开其 Selected Direction Family 的 strategic_axis、visual_protagonist_seed 与 generative_mechanism_seed。
- 视觉机制必须从对应 brand fact、visual asset 或 benchmark gap 产生；没有具体证据时不得把通用行业词包装成品牌专属机制。
- 摄影主体须注明真实可识别机构、真实匿名场景、生成示意、界面或物体中的一种；只有真实可识别机构需要机构授权。

生成前逐方向回答并落实到 strategic_idea、graphic_system、layout_behavior、composition_templates、execution_examples、brand_evidence、execution_constraints 和 template_risks：
1. 视觉主角是什么；2. 视觉机制如何持续生成资产；3. 平台角色如何被看见；4. 消费者结果如何被看见；
5. 哪些内容必须有真实证据；6. 哪些内容禁止虚构；7. 三个方向第一眼轮廓为何不同；8. 三个方向的构图、摄影和图形关系为何不同。
三个方向不得共享“左侧主体 + 低透明叠加 + 底部 CTA + 移动端垂直堆叠”的同一模板；主体位置、图像/图形/信息比例、叠加方式、信息层级和响应式规则必须形成可检测差异。

Evidence Index: ${JSON.stringify(context.evidenceIndex || [])}
Audience Boundary: ${JSON.stringify(context.audienceBoundary || {})}
Asset Boundary (allowed): ${allowedAssets.map(assetId).filter(Boolean).join(', ') || 'none'}
Asset Boundary (restricted): ${restrictedAssets.map(assetId).filter(Boolean).join(', ') || 'none'}
Selected Touchpoints: ${(context.selectedTouchpoints || []).join(', ') || 'none'}
${context.visual_opportunities ? `
Visual Fact First 决策上下文（只用于视觉决策，不得重新分析商业战略）：
- Brand Identity: ${JSON.stringify(context.brand_identity || {})}
- Business Model: ${JSON.stringify(context.business_model || {})}
- Audience Structure: ${JSON.stringify(context.audience_structure || {})}
- Visual Positioning: ${JSON.stringify(context.visual_positioning || {})}
- Locked Assets: ${JSON.stringify(context.locked_assets || {})}
- Visual Asset Evidence: ${JSON.stringify(context.visual_asset_evidence || {})}
- Benchmark Findings: ${JSON.stringify(context.benchmark_findings || {})}
- Visual Opportunities: ${JSON.stringify(context.visual_opportunities || {})}
- Direction Family Candidates (5-7): ${JSON.stringify(context.direction_family_candidates || [])}
- Selected Direction Families (exactly 3): ${JSON.stringify(context.selected_direction_families || [])}
- Direction Set Diversity Requirements: ${JSON.stringify(context.direction_set_diversity_requirements || {})}
- Fact Status Groups: ${JSON.stringify(context.fact_status_groups || {})}
- Brand Relationship / Authorization: ${JSON.stringify(context.brand_relationship || {})}
- Authorization Risks: ${JSON.stringify(context.authorization_risks || [])}
- Confirmed Evidence-Bound Values: ${JSON.stringify(context.evidence_bound_values || [])}
- Rejected Specific Values: ${JSON.stringify(context.rejected_evidence_bound_values || [])}
- Prohibited Directions: ${JSON.stringify(context.prohibited_directions || [])}
- Evidence Constraints: ${JSON.stringify(context.evidence_constraints || {})}

不要重新分析完整商业战略，不要复述市场规模和行业数据。联网案例是视觉参照而非模仿对象；三个方向必须分别从不同 Visual Opportunity 出发，并在 strategic_idea 或 brand_evidence 中保留对应 opportunity_id。品牌事实的优先级高于 Benchmark。` : ''}

输出必须简洁：同一品牌事实和消费者价值不要在不同层级重复全文；资产通过 ID 引用；每个执行示例的全部文字合计尽量不超过 600 中文字符；资产描述不超过 120 字；约束和风险每项不超过 80 字。

下方是格式化字段合同，不得复制类型说明充当项目事实：
${OUTPUT_FIELD_CONTRACT}

只返回完整 JSON。不得输出 Markdown、解释或 JSON 之外的尾随文字。` }];
}
