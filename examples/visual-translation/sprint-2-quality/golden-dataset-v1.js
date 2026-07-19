import { validateSprint2QualityFixture } from '../../../src/v5/visual-translation/v1/schemas/sprint-2-quality-fixture-v1.js';

const PROJECTS = ['b2b', 'consumer_goods', 'cultural_brand', 'packaging', 'ip', 'technology_service'];

const SCENARIOS = [
  scenario('ANC-001', 'anchor_direction', '正常 Anchor：受控路径关系可约束图形、构图、材质与动态', [], []),
  scenario('ANC-002', 'anchor_direction', '口号型 Anchor：连接未来，共创美好', ['AP-ANC-001'], ['将口号改写为可观察的视觉关系机制']),
  scenario('ANC-003', 'anchor_direction', '单物件 Anchor：一个发光玻璃球承担全部视觉逻辑', ['AP-ANC-002'], ['提炼玻璃球背后的关系、边界与行为']),
  scenario('ANC-004', 'anchor_direction', '三个同等级 Primary Anchor 同时竞争', ['AP-ANC-003'], ['保留一个 Primary Anchor，其余降为 Supporting']),
  scenario('ANC-005', 'anchor_direction', '只有 Inclusion Boundary，没有任何排除边界', ['AP-ANC-004'], ['补充可观察的 Exclusion Boundary']),
  scenario('ANC-006', 'anchor_direction', '必须依赖 Midjourney cinematic 与特定风格词才能成立', ['AP-ANC-005'], ['删除模型词并定义模型无关的结构规则']),
  scenario('ANC-007', 'anchor_direction', 'Anchor 描述自然疗愈花园，但 Selected Direction 是产业验证网络', ['CAL-ANC-DIRECTION-CONTINUITY'], ['重新继承 Selected Direction 的核心机制']),
  scenario('ANC-008', 'anchor_direction', 'Anchor 引用的结论没有 Evidence ID 支撑', ['CAL-ANC-EVIDENCE-SUFFICIENCY'], ['补充有效 Evidence 引用或降低结论置信度']),
  scenario('ANC-009', 'anchor_direction', '三个候选仅更换名称，核心命题与边界完全一致', ['CAL-ANC-CANDIDATE-HOMOGENEITY'], ['仅重构重复候选并保留差异候选']),
  scenario('ANC-010', 'anchor_direction', '口号型 Anchor 同时缺少排除边界', ['AP-ANC-001', 'AP-ANC-004'], ['改写为视觉机制', '补充排除边界']),
  scenario('DNA-001', 'visual_dna', '正常 DNA：验证路径、分层网格与透明边界具有组合关系', [], []),
  scenario('DNA-002', 'visual_dna', 'DNA 只包含 Logo 与品牌主色', ['AP-DNA-001'], ['增加不依赖 Logo 和颜色的识别机制']),
  scenario('DNA-003', 'visual_dna', 'Visual DNA 包含八个同等级单元', ['AP-DNA-002'], ['收敛到三至五个有层级的 DNA 单元']),
  scenario('DNA-004', 'visual_dna', '验证路径与流程轨迹两个 DNA 单元语义完全重复', ['CAL-DNA-SEMANTIC-DUPLICATION'], ['合并重复 DNA 并重新明确功能角色']),
  scenario('DNA-005', 'visual_dna', '茶园山峰被固定为所有媒介必须出现的场景', ['AP-DNA-004'], ['将固定场景抽象为可跨媒介的关系机制']),
  scenario('DNA-006', 'visual_dna', 'DNA 没有允许变化与硬限制', ['AP-DNA-005'], ['定义 Variation Range 与不可越界条件']),
  scenario('DNA-007', 'visual_dna', 'DNA 单元只有元素清单，没有 Combination Rules', ['AP-DNA-003'], ['补充 DNA 之间的主次和共存规则']),
  scenario('DNA-008', 'visual_dna', 'DNA 描述无法转化为任何可观察 QA Condition', ['CAL-DNA-QA-CONDITION'], ['将抽象描述改写为可观察验证条件']),
  scenario('DNA-009', 'visual_dna', '两个重复 DNA 同时绑定单一东方建筑场景', ['CAL-DNA-SEMANTIC-DUPLICATION', 'AP-DNA-004'], ['合并重复单元', '解除固定场景绑定']),
  scenario('DNA-010', 'visual_dna', '五个 DNA 各自独立且没有共同 Anchor 关系', ['AP-DNA-003'], ['用 Anchor 关系定义跨单元组合顺序']),
  scenario('GRA-001', 'visual_grammar', '正常 Grammar：六类规则均可观察、可变化并继承同一 Anchor', [], []),
  scenario('GRA-002', 'visual_grammar', '规则只有克制、精致、高级、有呼吸感', ['AP-GRA-001'], ['把形容词改写为可观察结构规则']),
  scenario('GRA-003', 'visual_grammar', 'Allowed、Preferred 与 Avoid 三组规则内容完全相同', ['CAL-GRA-RULE-DUPLICATION'], ['重新划分允许、优先与禁止边界']),
  scenario('GRA-004', 'visual_grammar', 'Shape 要求连续曲线，Composition 要求全部元素正交断开', ['AP-GRA-003', 'CAL-GRA-CROSS-CONFLICT'], ['统一 Shape 与 Composition 的关系逻辑']),
  scenario('GRA-005', 'visual_grammar', 'Material 要求完全哑光，Lighting 要求所有表面产生镜面高光', ['AP-GRA-003', 'CAL-GRA-CROSS-CONFLICT'], ['协调材质反射属性与光线行为']),
  scenario('GRA-006', 'visual_grammar', 'Motion 使用随机弹跳，与静态的受控路径结构无关', ['CAL-GRA-MOTION-CONTINUITY'], ['让 Motion 继承静态结构的方向与节奏']),
  scenario('GRA-007', 'visual_grammar', 'Information Grammar 仅写注意层级、保持可读等通用排版建议', ['CAL-GRA-INFORMATION-GENERIC'], ['建立品牌专属的信息组织机制']),
  scenario('GRA-008', 'visual_grammar', '六类 Grammar 分别引用不同且互不相关的 Anchor', ['CAL-GRA-ANCHOR-INHERITANCE'], ['让六类 Grammar 继承同一 Confirmed Anchor']),
  scenario('GRA-009', 'visual_grammar', 'Visual Grammar 只定义蓝色与白色', ['AP-GRA-002'], ['补齐 shape、composition、material、lighting、motion 与 information 规则']),
  scenario('GRA-010', 'visual_grammar', '所有 Grammar 都是单一固定值，不允许任何变化', ['AP-GRA-004'], ['为每类 Grammar 定义允许区间与硬限制']),
  scenario('GRA-011', 'visual_grammar', '通用排版建议与 Allowed/Preferred/Avoid 重复同时出现', ['CAL-GRA-INFORMATION-GENERIC', 'CAL-GRA-RULE-DUPLICATION'], ['改写品牌专属信息机制', '重新划分三类规则边界'])
];

export const SPRINT_2_GOLDEN_DATASET = Object.freeze(SCENARIOS.map((item, index) => validateSprint2QualityFixture({
  fixture_id: `S2-GOLDEN-${String(index + 1).padStart(3, '0')}-${item.id}`,
  project_type: PROJECTS[index % PROJECTS.length],
  module: item.module,
  input: buildInput(item),
  expected_anti_patterns: item.expected,
  expected_module_status: item.expected.length ? 'failed' : 'passed',
  expected_repair_actions: item.repairs,
  semantic_evaluator_skip_allowed: item.expected.length === 0,
  human_notes: `脱敏人工标注：${item.summary}`
})));

function scenario(id, module, summary, expected, repairs) {
  return { id, module, summary, expected, repairs };
}

function buildInput(item) {
  const source_context = {
    selected_direction: { direction_id: 'D-SELECTED', core_metaphor: '受控关系逐级显现' },
    evidence_index: [{ evidence_id: 'EV-001', statement: '脱敏品牌证据强调可追踪关系' }]
  };
  if (item.module === 'anchor_direction') return { source_context, anchor_candidates: anchorArtifact(item) };
  if (item.module === 'visual_dna') return { source_context, confirmed_anchor_id: 'ANCHOR-CONFIRMED', visual_dna: dnaArtifact(item) };
  return { source_context, confirmed_anchor_id: 'ANCHOR-CONFIRMED', visual_grammar: grammarArtifact(item) };
}

function anchorArtifact(item) {
  const count = item.id === 'ANC-009' ? 3 : 1;
  return Array.from({ length: count }, (_, index) => ({
    anchor_id: `ANCHOR-${index + 1}`,
    core_visual_proposition: item.id === 'ANC-009' ? '相同的受控路径关系' : item.summary,
    primary_anchors: Array.from({ length: item.id === 'ANC-004' ? 3 : 1 }, (__, primaryIndex) => ({ id: `P-${primaryIndex + 1}`, mechanism: item.summary })),
    controlled_visual_dimensions: ['shape', 'composition', 'material', 'motion'],
    inclusion_boundary: ['画面关系必须可追踪'],
    exclusion_boundary: ['ANC-005', 'ANC-010'].includes(item.id) ? [] : ['不得退化为随机装饰'],
    evidence_ids: item.id === 'ANC-008' ? [] : ['EV-001'],
    cross_media_behavior: '在平面、空间与动态中保持同一关系顺序',
    model_dependency: item.id === 'ANC-006' ? ['Midjourney cinematic', 'specific style preset'] : []
  }));
}

function dnaArtifact(item) {
  const count = item.id === 'DNA-003' ? 8 : 3;
  const units = Array.from({ length: count }, (_, index) => ({
    dna_id: `DNA-${index + 1}`,
    name: ['DNA-004', 'DNA-009'].includes(item.id) ? '重复的验证路径' : `脱敏 DNA ${index + 1}`,
    category: item.id === 'DNA-002' ? (index === 0 ? 'logo' : 'color') : ['relationship', 'composition', 'material'][index % 3],
    functional_role: item.summary,
    scene_binding: ['DNA-005', 'DNA-009'].includes(item.id) ? '固定东方建筑场景' : null,
    variation_range: item.id === 'DNA-006' ? [] : ['密度和尺度允许在边界内变化'],
    combination_rules: ['DNA-007', 'DNA-010'].includes(item.id) ? [] : ['Primary 控制关系，Supporting 控制表现层'],
    qa_conditions: item.id === 'DNA-008' ? [] : ['输出中可观察到稳定关系顺序']
  }));
  return { primary_dna: units.slice(0, 1), supporting_dna: units.slice(1), forbidden_mutations: ['不得退化为行业模板'] };
}

function grammarArtifact(item) {
  const categories = ['shape', 'composition', 'material', 'lighting', 'motion', 'information'];
  return Object.fromEntries(categories.map((category, index) => {
    const genericAdjective = item.id === 'GRA-002' ? '克制、精致、高级、有呼吸感' : `${category} 必须保持可观察的受控关系`;
    const repeated = ['GRA-003', 'GRA-011'].includes(item.id) ? '保持一致' : null;
    return [category, {
      allowed: [repeated || genericAdjective],
      preferred: [repeated || `${category} 优先强化主次关系`],
      avoid: [repeated || `${category} 避免随机装饰`],
      variation_range: item.id === 'GRA-010' ? [] : ['密度和尺度可在硬边界内变化'],
      anchor_inheritance: item.id === 'GRA-008' ? `ANCHOR-${index + 1}` : 'ANCHOR-CONFIRMED',
      conflict_note: item.id === 'GRA-004' && ['shape', 'composition'].includes(category)
        ? '连续曲线与完全正交断开互相冲突'
        : (item.id === 'GRA-005' && ['material', 'lighting'].includes(category) ? '完全哑光与镜面高光互相冲突' : null),
      continuity_note: item.id === 'GRA-006' && category === 'motion' ? '随机弹跳与静态 Anchor 无关' : null,
      specificity_note: ['GRA-007', 'GRA-011'].includes(item.id) && category === 'information' ? '仅包含通用排版建议' : null,
      color_only: item.id === 'GRA-009'
    }];
  }));
}
