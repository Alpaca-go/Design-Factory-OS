import { validateSprint2FixtureImport } from '../../../src/v5/visual-translation/v1/schemas/sprint-2-quality-fixture-v1.js';

const TYPES = [
  ['b2b', '产业协作平台，受众为企业采购与生态伙伴'],
  ['consumer_goods', '日用消费品，受众为家庭购买者'],
  ['cultural_brand', '地方文化品牌，强调当代转译而非文旅模板'],
  ['packaging', '包装项目，盒型与既有版式均为 Locked Assets'],
  ['ip', '角色 IP 项目，角色轮廓与核心设定不可修改'],
  ['technology_service', '企业科技服务，禁止消费电子广告化表达']
];

export const SPRINT_2_REAL_PROJECT_IMPORT_FIXTURES = Object.freeze(TYPES.map(([project_type, summary], index) => validateSprint2FixtureImport({
  fixture_id: `S2-IMPORT-${String(index + 1).padStart(2, '0')}`,
  project_type,
  source_kind: 'desensitized_fixture',
  input: {
    project_id: `redacted-${project_type}`,
    selected_direction_id: 'D-SELECTED',
    brand_context: { project_type, summary },
    evidence_index: [{ evidence_id: 'EV-REDACTED-001', statement: '已脱敏的方向依据' }],
    assets: { allowed: [], restricted: [] }
  },
  redaction_notes: ['删除真实品牌名称', '删除原始文件路径', '删除客户、人员与商业数据']
})));
