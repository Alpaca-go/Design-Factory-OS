import { classifyFieldSemanticRole, isNegatedContext } from './field-semantic-role.js';
import { resolveAssetAuthorizationStatus, resolveAssetOwnership } from './asset-ownership-resolver.js';

const VISUAL_USE = /(logo|标志|水印|\bvi\b|视觉识别|集团视觉|集团品牌.*(?:主体|主视觉))/iu;

function collectStringLeaves(value, path = 'visualDirectionV2', output = []) {
  if (typeof value === 'string') output.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((item, index) => collectStringLeaves(item, `${path}[${index}]`, output));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => collectStringLeaves(child, `${path}.${key}`, output));
  return output;
}

export function evaluateGroupVisualAuthorization(directions = [], brandRelationship = {}, projectBrandName = '') {
  if (!brandRelationship || !brandRelationship.visual_authorization) {
    return { evaluator_version: 'group-visual-authorization-v1', authorization: 'not_applicable', rewrite_required: false, per_direction: [], issues: [] };
  }
  const authorization = brandRelationship?.visual_authorization || 'not_confirmed';
  const relatedName = brandRelationship?.related_brand_name || '';
  if (authorization === 'confirmed' || authorization === 'not_applicable') {
    return { evaluator_version: 'group-visual-authorization-v1', authorization, rewrite_required: false, per_direction: [], issues: [] };
  }
  const perDirection = [];
  const issues = [];
  let hasWarning = false;
  for (const direction of directions) {
    const detections = [];
    for (const leaf of collectStringLeaves(direction)) {
      if (classifyFieldSemanticRole(leaf.path) === 'negative_constraint') continue;
      const match = leaf.text.match(VISUAL_USE);
      if (!match || isNegatedContext(leaf.text, match.index || 0)) continue;
      const owner = resolveAssetOwnership({
        text: leaf.text, fieldPath: leaf.path,
        projectBrandName, parentBrandName: relatedName
      });
      const authorizationStatus = resolveAssetAuthorizationStatus(owner, authorization);
      if (owner === 'project_brand') continue;
      if (owner === 'unknown') {
        hasWarning = true;
        issues.push({
          code: 'UNKNOWN_VISUAL_ASSET_OWNERSHIP', severity: 'warning', scope: 'direction',
          direction_id: direction.direction_id, issue_scope: 'direction', source_direction_ids: [direction.direction_id],
          collection_effect: false, affected_execution_scope: 'local_direction',
          field_path: leaf.path, detected_value: match[0],
          matched_rule: 'visual_asset_owner_requires_context',
          evidence_excerpt: leaf.text, confidence: 0.6,
          asset_owner: owner, authorization_status: authorizationStatus,
          message: '视觉标识归属无法从当前语境确定。',
          recommendation: '明确写为项目品牌 Logo，或注明相关品牌及授权状态。'
        });
        continue;
      }
      if (authorizationStatus === 'confirmed') continue;
      detections.push({
        field_path: leaf.path, evidence_excerpt: leaf.text, detected_value: match[0],
        asset_owner: owner, authorization_status: authorizationStatus
      });
    }
    if (!detections.length) continue;
    perDirection.push({ direction_id: direction.direction_id, detections });
    for (const detection of detections) {
      issues.push({
        code: 'UNSUPPORTED_GROUP_VISUAL_AUTHORIZATION', severity: 'rewrite', scope: 'direction',
        direction_id: direction.direction_id, issue_scope: 'direction', source_direction_ids: [direction.direction_id],
        collection_effect: true, affected_execution_scope: 'local_direction',
        field_path: detection.field_path, detected_value: detection.detected_value,
        matched_rule: 'group_visual_use_requires_confirmed_authorization',
        evidence_excerpt: detection.evidence_excerpt, confidence: 0.95,
        asset_owner: detection.asset_owner,
        authorization_status: detection.authorization_status,
        message: '集团关系存在，但集团 Logo、水印、VI 或视觉主体授权未确认。',
        recommendation: '改为“集团关系视觉位预留，仅在授权确认后启用”。'
      });
    }
  }
  return {
    evaluator_version: 'group-visual-authorization-v2', authorization,
    warning: hasWarning,
    rewrite_required: perDirection.length > 0, per_direction: perDirection, issues
  };
}
