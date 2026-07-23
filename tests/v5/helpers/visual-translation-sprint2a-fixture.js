export function sprint2InputFixture() {
  return {
    project_id: 'project-s2',
    run_id: 'run-s2',
    document_set_hash: 'a'.repeat(64),
    selected_direction_id: 'D01',
    selected_direction: {
      directionId: 'D01',
      name: '可信秩序',
      evidenceIds: ['VE001'],
      coreMetaphor: '受控流动',
      distinctiveMechanism: '验证节点逐级展开'
    },
    brand_context: { business_model: 'b2b', primary_audience: ['产业伙伴'] },
    locked_assets: ['brand_name', 'logo'],
    allowed_assets: [{ asset_id: 'ASSET-01', status: 'existing' }],
    restricted_assets: [{ asset_id: 'ASSET-R1', status: 'restricted' }],
    visual_signals: [{ signalId: 'VS01', statement: '流程透明度形成可信赖' }],
    evidence_index: [{ evidenceId: 'VE001', statement: '品牌强调可追踪的产业协作流程' }],
    direction_risks: ['避免通用科技节点模板'],
    direction_score: { raw_score: 82, confidence_adjusted_score: 82, risk_penalty: 7, final_score: 75, penalty_reasons: ['模板风险', '证据风险'] },
    human_selection_record: {
      selection_id: 'SEL-001',
      selected_direction_id: 'D01',
      selected_by: 'reviewer-01',
      selector_type: 'human',
      status: 'confirmed',
      selected_at: '2026-07-19T12:00:00.000Z',
      notes: '人工选择可信秩序方向进入 Sprint 2'
    }
  };
}

export function sprint2LanguageSystemFixture() {
  const anchorId = 'ANCHOR-01';
  return {
    anchor_direction: {
      anchor_id: anchorId,
      name: '可验证的流动秩序',
      anchor_type: 'relationship_system',
      core_visual_proposition: '信息与关系沿受控路径逐级显现，每一步都可追踪且保持清晰主次。',
      primary_anchor: component('ANCHOR-P1', '验证路径', '节点仅在完成验证后连接', '控制主要图形与构图节奏'),
      supporting_anchors: [component('ANCHOR-S1', '透明层级', '层级通过可读叠层显现', '支持信息深度')],
      anchor_mechanism: {
        relationship: '独立单元通过经过验证的路径形成有序协作关系',
        behavior: '路径从核心向外逐级展开，未验证节点保持分离',
        controlled_dimensions: ['shape', 'composition', 'material', 'lighting']
      },
      visual_role: '统一图形关系、构图节奏、材质层级与光线行为',
      inclusion_boundary: [{ rule: '必须呈现清晰路径层级', observable_condition: '画面至少包含一个起点、一个验证节点和一个有序终点' }],
      exclusion_boundary: [{ rule: '不得使用无意义发光网络', observable_condition: '每条连接必须对应可说明的关系，禁止随机节点背景' }],
      evidence_ids: ['VE001'],
      reason_basis: 'direct_evidence',
      evidence_confidence: 1,
      known_risks: ['节点机制可能接近行业模板'],
      unresolved_questions: ['动态节奏需要在 Sprint 2B 人工确认'],
      status: 'pending_human_confirmation'
    },
    visual_dna: {
      primary_dna: [dna('DNA-01', '验证路径', 'relationship', anchorId)],
      supporting_dna: [
        dna('DNA-02', '分层网格', 'composition', anchorId),
        dna('DNA-03', '半透明边界', 'material', anchorId)
      ],
      forbidden_mutations: ['不得把验证路径变成随机粒子网络', '不得使用认证徽章替代可信机制']
    },
    visual_grammar: Object.fromEntries([
      'shape_grammar', 'composition_grammar', 'material_grammar',
      'lighting_grammar', 'motion_grammar', 'information_grammar'
    ].map((name) => [name, grammar(name, anchorId)])),
    consistency_rules: Object.fromEntries([
      'must_preserve', 'may_vary', 'must_not_change', 'cross_media_rules',
      'asset_usage_rules', 'audience_boundary_rules', 'template_avoidance_rules'
    ].map((group, index) => [group, [consistencyRule(`CR-${index + 1}`, anchorId, group)]])),
    generation_boundary: {
      mandatory_prompt_inputs: ['selected_direction', 'anchor_direction', 'visual_dna', 'visual_grammar', 'consistency_rules'],
      optional_prompt_inputs: ['approved_scene_context'],
      negative_constraints: ['禁止随机发光节点', '禁止认证徽章与官方印章'],
      human_only_decisions: ['Anchor 最终确认', '新品牌资产授权'],
      deferred_to_sprint3: ['具体镜头规划', '模型适配参数', '图片任务拆分'],
      executable_assets: ['ASSET-01'],
      non_executable_assets: ['ASSET-R1']
    }
  };
}

function component(id, name, mechanism, role) {
  return { anchor_component_id: id, name, mechanism, visual_role: role };
}

function dna(id, name, category, anchorId) {
  return {
    dna_id: id,
    name,
    visual_form: { category, description: `${name}的可观察视觉形式`, observable_features: ['层级可见', '边界清晰'] },
    functional_role: '维持跨媒介品牌识别与结构一致性',
    fixed_properties: ['关系顺序保持稳定'],
    flexible_properties: ['比例可随媒介调整'],
    variation_range: { allowed_variations: ['可调整密度与尺度'], limits: ['不得改变核心关系顺序'] },
    combination_rules: ['与其他 DNA 共存时保持一主一辅'],
    forbidden_mutations: ['不得退化为装饰背景'],
    evidence_ids: ['VE001'],
    anchor_relation: { anchor_id: anchorId, relation: '继承 Anchor 的受控关系与可追踪性' },
    validation_conditions: ['删除品牌名后仍可观察到稳定的关系结构']
  };
}

function grammar(name, anchorId) {
  const rule = (verb) => [{ rule: `${verb}${name}的结构规则`, observable_condition: `可通过画面中的${name}关系直接检查` }];
  return {
    allowed: rule('允许'),
    preferred: rule('优先'),
    avoid: rule('避免'),
    relationships: rule('保持'),
    variation_range: { allowed_variations: ['密度和尺度可调整'], hard_limits: ['核心层级不得反转'] },
    anchor_inheritance: { anchor_ids: [anchorId], inherited_constraints: ['继承可验证路径与清晰主次'] },
    validation_notes: ['检查规则是否可以在不依赖形容词的情况下观察']
  };
}

function consistencyRule(id, anchorId, group) {
  return {
    rule_id: id,
    statement: `${group} 中必须保持可验证的品牌关系`,
    observable_condition: '输出可见清晰起点、验证节点和关系终点',
    validation_method: '检查路径结构与 Anchor 定义是否一致',
    maps_to: [{ type: 'anchor', id: anchorId }],
    locked_asset_impact: 'preserve'
  };
}
