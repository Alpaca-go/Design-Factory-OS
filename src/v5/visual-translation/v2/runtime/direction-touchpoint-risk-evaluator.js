import { classifyPhotographySubject } from './photography-subject-classifier.js';

export function evaluateDirectionTouchpointRisk(directions = []) {
  const perDirection = [];
  const issues = [];
  for (const direction of directions) {
    const id = direction.direction_id;
    const touchpoints = [
      ...(direction.composition_templates || []).map((item) => item.touchpoint),
      ...(direction.execution_examples || []).map((item) => item.touchpoint)
    ];
    const risks = [];
    const directionText = JSON.stringify(direction);
    const presentsAsPlatform = /平台|聚合|筛选|多品牌|多品类/iu.test(directionText);
    const spatialAxisDominant = /(?:空间|展厅|建筑)[^。；]{0,20}(?:战略|主视觉|核心命题)|(?:战略|主视觉|核心命题)[^。；]{0,20}(?:空间|展厅|建筑)/iu.test(direction.strategic_idea || '');
    if (touchpoints.includes('packaging_front') && presentsAsPlatform && !/自有产品|自有包装|产品品牌/iu.test(directionText)) {
      risks.push({ touchpoint: 'packaging_front', code: 'PLATFORM_PRODUCT_BRAND_TOUCHPOINT_RISK', recommendation: '只有自有包装产品得到品牌事实支持时才保留 packaging_front。' });
    }
    if (touchpoints.includes('exhibition_backdrop') && !spatialAxisDominant) {
      risks.push({ touchpoint: 'exhibition_backdrop', code: 'ECOSYSTEM_EXHIBITION_TOUCHPOINT_RISK', recommendation: '展览不是主战略轴时，将其降为可选适配触点而非方向主机制。' });
    }
    const photographySubject = classifyPhotographySubject(direction);
    if (photographySubject.institution_authorization_required) {
      risks.push({ touchpoint: 'photography_object_system', code: 'UNAUTHORIZED_INSTITUTION_PHOTOGRAPHY_RISK', recommendation: '改为匿名化机构服务场景、平台操作界面、物流基础设施、角色行为摄影或服务交付节点。' });
    }
    const topologyHits = (directionText.match(/节点|箭头|拓扑|生态网格/gu) || []).length;
    const valueMechanismHits = (directionText.match(/角色价值带|服务交换单元|交付结果层|消费者结果回流|平台编排界面/gu) || []).length;
    if (topologyHits >= 4 && valueMechanismHits < 2) {
      risks.push({ touchpoint: 'graphic_system', code: 'GENERIC_ECOSYSTEM_TOPOLOGY_RISK', recommendation: '减少通用节点/箭头/拓扑，增加角色价值带、服务交换单元、交付结果层、消费者结果回流和平台编排界面。' });
    }
    if (!risks.length) continue;
    perDirection.push({ direction_id: id, risks });
    for (const risk of risks) issues.push({
      code: risk.code, severity: 'warning', scope: 'direction', direction_id: id,
      issue_scope: 'direction', source_direction_ids: [id], collection_effect: false,
      affected_execution_scope: 'local_direction', field_path: 'visualDirectionV2.composition_templates',
      detected_value: risk.touchpoint, matched_rule: 'direction_specific_touchpoint_boundary',
      evidence_excerpt: risk.touchpoint, confidence: 1,
      message: `触点“${risk.touchpoint}”可能混淆平台品牌与产品品牌或削弱核心机制。`,
      recommendation: risk.recommendation
    });
  }
  return { evaluator_version: 'direction-touchpoint-risk-v1', per_direction: perDirection, issues };
}
