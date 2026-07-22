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
    if ((id === 'E02' || direction.direction_family === 'B') && touchpoints.includes('packaging_front')) {
      risks.push({ touchpoint: 'packaging_front', code: 'PLATFORM_PRODUCT_BRAND_TOUCHPOINT_RISK', recommendation: '改用 platform_product_showcase、quality_selection_board、institutional_product_guide 或 product_selection_catalog；仅在自有包装产品有证据时保留。' });
    }
    if ((id === 'E03' || direction.direction_family === 'C') && touchpoints.includes('exhibition_backdrop')) {
      risks.push({ touchpoint: 'exhibition_backdrop', code: 'ECOSYSTEM_EXHIBITION_TOUCHPOINT_RISK', recommendation: '改用 ecosystem_service_map、partner_portal_hero 或 institutional_collaboration_guide；展会背板仅作可选示例。' });
    }
    const directionText = JSON.stringify(direction);
    if ((id === 'E03' || direction.direction_family === 'C') && /机构门头|门头拼接|机构\s*Logo|真实机构网络门头/iu.test(directionText)) {
      risks.push({ touchpoint: 'photography_object_system', code: 'UNAUTHORIZED_INSTITUTION_PHOTOGRAPHY_RISK', recommendation: '改为匿名化机构服务场景、平台操作界面、物流基础设施、角色行为摄影或服务交付节点。' });
    }
    const topologyHits = (directionText.match(/节点|箭头|拓扑|生态网格/gu) || []).length;
    const valueMechanismHits = (directionText.match(/角色价值带|服务交换单元|交付结果层|消费者结果回流|平台编排界面/gu) || []).length;
    if ((id === 'E03' || direction.direction_family === 'C') && topologyHits >= 4 && valueMechanismHits < 2) {
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
