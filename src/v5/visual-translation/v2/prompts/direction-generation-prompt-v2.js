// Single-call execution-oriented Direction Generation Prompt v2.
// Stage 04 must produce one complete JSON response; runtime validation may
// request at most one field-level repair after this generation.

import {
  ANTI_CONCEPT_ART_CONSTRAINTS,
  COMPOSITION_TOUCHPOINTS,
  CONSUMER_VALUE_ROLES,
  DIRECTION_FAMILIES,
  DIRECTION_FAMILY_TYPES,
  EXECUTION_EXAMPLE_CATEGORIES,
  PHOTOGRAPHY_REQUIREMENT_MODES,
  REUSABLE_ASSET_TYPES
} from '../schemas/direction-contract-v2.js';

export const VISUAL_DIRECTIONS_PROMPT_V2_VERSION = 'visual-direction-v2-execution-step4-r3';

const OUTPUT_TYPE_SKELETON = Object.freeze({
  visualDirectionV2Set: {
    directions: [{
      direction_id: 'E01',
      direction_name: '中文正式方向名',
      strategic_idea: '品牌事实、行业对象与执行机制组成的中文句子',
      direction_family: 'A',
      family_type: 'supply_chain_trust',
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
        asset_id: 'E01-G-01',
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
        template_id: 'E01-T-01',
        touchpoint: 'poster',
        subject_position: '主体具体位置',
        information_position: '信息具体位置',
        reusable_assets: ['E01-G-01'],
        image_object_rule: '图像对象规则',
        negative_constraints: ['一条负向约束']
      }],
      material_and_light_support: {
        material_support: '辅助执行的材质原则',
        light_support: '辅助执行的光线原则'
      },
      execution_examples: [{
        example_id: 'E01-X-01',
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
        reused_assets: ['E01-G-01'],
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
        "direction_family": "${DIRECTION_FAMILIES.join('|')}",
        "family_type": "${DIRECTION_FAMILY_TYPES.join('|')}",
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
          "information_zone":{"position":"string","width_or_height":"string","alignment":"string","hierarchy_behavior":"string","collision_avoidance":"string"},
          "brand_zone":{"position":"string","logo_scale":"string","safe_area":"string","relationship_to_hero":"string","fixed_or_adaptive":"string"},
          "whitespace_behavior":"string","canvas_ratio":"string","photography_ratio":0.4,"graphic_ratio":0.35,"information_ratio":0.25,"responsive_adaptation":"string","graphic_overlay":"string",
          "reused_assets":["asset_id"],"industry_recognition_source":"string","industry_content":"string","layout_structure":"string","information_hierarchy":"string","brand_specific_detail":"string","anti_concept_art_rule":"string","prohibited_content":"string","anti_concept_art_note":"string",
          "downstream_consumer_value":{"present":true,"consumer_value_role":"${CONSUMER_VALUE_ROLES.join('|')}","value_statement":"string","visual_expression":"string","touchpoints":["string"],"evidence_ids":["Evidence ID"]}
        }],
        "brand_evidence":"Chinese string <=200 chars","compliance_weights":{"compliance_weight":0.2,"supply_chain_weight":0.3,"product_material_weight":0.1,"ecosystem_weight":0.2,"brand_aesthetic_weight":0.1,"consumer_value_weight":0.1},
        "industry_recognition_classification":{"regulatory_objects":["string"],"supply_chain_objects":["string"],"product_material_objects":["string"],"institution_service_objects":["string"],"consumer_value_objects":["string"],"aesthetic_culture_objects":["string"]},
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
1. 三方向分别使用 direction_family A、B、C，family_type 分别体现全链可信、产品材料美学、产业协同与机构赋能。
2. industry_recognition_layer 必须先于抽象表达，识别强度不低于 4。
3. 每方向提供 3-5 个 core_reusable_assets，并覆盖 graphic_asset、information_asset、photography_asset、layout_asset。
4. 每方向至少两个 composition_templates；每方向恰好三个 execution_examples，覆盖 core_brand、capability_product、digital_event，触点不重复。
5. 每个触点必须完整提供 information_zone、brand_zone、canvas_ratio、whitespace_behavior、responsive_adaptation 和全部 Schema 必填字段。
6. compliance_weights 六项总和必须为 1.00 ± 0.01；只能有一个方向以合规为 Primary。
7. B 方向 product_material_weight 最高且不低于 0.30，brand_aesthetic_weight 不低于 0.15，consumer_value_weight 不低于 0.10，并建立品牌专属材料视觉机制。
8. C 方向 ecosystem_weight 最高，协同关系必须进入平面传播，不得滑向展厅、地产或建筑空间语言。
9. 不得生成未经 Evidence 支持的具体姓名、编号、指标、比例、资质、产品参数或合作成果；仅允许 structure_only 字段结构。
10. 以下九项 anti_concept_art_constraints 是固定协议字段，由程序统一注入；模型不得修改，也不要在 JSON 中重复输出：
${ANTI_CONCEPT_ART_CONSTRAINTS.map((item, index) => `   ${index + 1}. ${item.constraint_id}`).join('\n')}

asset_authorization 是程序注入的运行时策略元数据，模型不得输出该字段。

关键字段类型（输出前在同一次生成内检查并就地更正，不得重新生成）：
- brand_evidence：required string，中文，最大 500 字；禁止 object、array、null、number。
- execution_constraints：required non-empty string[]；每一项必须是 string。
- template_risks：required non-empty string[]；每一项必须是 string。
- information_zone：object，必须含 position、width_or_height、alignment、hierarchy_behavior、collision_avoidance。
- brand_zone：object，必须含 position、logo_scale、safe_area、relationship_to_hero、fixed_or_adaptive。

画布比例必须匹配载体且三个触点不得统一：海报 4:5 或 1:1；手册 A4；官网 16:9 或 21:9；峰会/展览 16:9 或 3:1；短视频 9:16。
E01 必须提供 brand_asset_derivation；E02 品牌专属材料机制必须说明来源、微观图形规则、材质光线、产品对象、信息美学、消费者感知与跨触点复用。

三个方向的质量定义（必须写入现有字段，不新增 Schema 字段）：
- E01「全链可信」：以验证窗口、温控时间带、批次轨迹切片、交付证据层、机构验收界面构成专属机制。资质覆盖地图、省区高亮、机构清单、印章、批号和集团 VI 只有在 Evidence 与授权同时存在时才可使用；否则在 prohibited_content / execution_constraints 中明确禁止。
- E02「平台品质选择」：九州美学是筛选、组织、解释并交付高质量医美产品与解决方案的平台，不是成分、配方、实验室、护肤品或单一医械品牌。主机制应是品质选择框、产品切片陈列、平台标准层叠、多品类统一展示和“产品对象 + 平台标准”对照；禁止自有成分、浓度、配方研发、培养皿、提取装置和虚构实验室。
- E03「生态价值流」：必须显式形成“上游品牌 → 九州平台 → 医美机构 → 消费者 → 安全、稳定、透明体验”的闭环。通过角色带、价值流层、服务交换单元、消费者结果回流和上下游双向界面表达；消费者不能只是末端节点，exhibition_backdrop 不能作为核心机制。

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
- Prohibited Directions: ${JSON.stringify(context.prohibited_directions || [])}
- Evidence Constraints: ${JSON.stringify(context.evidence_constraints || {})}

不要重新分析完整商业战略，不要复述市场规模和行业数据。联网案例是视觉参照而非模仿对象；三个方向必须分别从不同 Visual Opportunity 出发，并在 strategic_idea 或 brand_evidence 中保留对应 opportunity_id。品牌事实的优先级高于 Benchmark。` : ''}

输出必须简洁：同一品牌事实和消费者价值不要在不同层级重复全文；资产通过 ID 引用；每个执行示例的全部文字合计尽量不超过 600 中文字符；资产描述不超过 120 字；约束和风险每项不超过 80 字。

下方是格式化字段合同，不得复制类型说明充当项目事实：
${OUTPUT_FIELD_CONTRACT}

只返回完整 JSON。不得输出 Markdown、解释或 JSON 之外的尾随文字。` }];
}
