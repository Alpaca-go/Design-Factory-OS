// Asset Authorization & Data Forgery Gate (doc section 9).
//
// Scans each direction for fabricated credentials, registration numbers, batch
// codes, pass rates, procurement scores, certification badges or official
// qualification icons. These are HARD blocking failures — the v2 contract must
// never invent regulated data. Also reports the four authorization-control
// fields when the model supplied them.

import { collectDirectionText } from './direction-text-util.js';
import { FORGERY_PATTERNS } from './evaluator-keywords.js';

export const ASSET_AUTHORIZATION_EVALUATOR_VERSION = 'asset-authorization-evaluator-v1';

const ALLOWED_MODES = ['abstracted', 'redacted', 'structure_only', 'real_data_required', 'prohibited'];

function detectForgery(text) {
  const violations = [];
  for (const pattern of FORGERY_PATTERNS) {
    const m = text.match(pattern);
    if (m) violations.push(m[0]);
  }
  return Array.from(new Set(violations));
}

export function evaluateAssetAuthorization(direction) {
  const text = collectDirectionText(direction);
  const forgeries = detectForgery(text);

  const explicit = direction.asset_authorization || {};
  const dataAuthorizationLevel = explicit.data_authorization_level || (forgeries.length ? 'prohibited' : 'abstracted');
  const documentVisualizationMode = explicit.document_visualization_mode || 'structure_only';
  const credentialUsageMode = explicit.credential_usage_mode || 'redacted';
  const generatedDataPolicy = explicit.generated_data_policy || (forgeries.length ? 'prohibited' : 'abstracted');

  const ok = forgeries.length === 0;
  return {
    direction_id: direction.direction_id,
    ok,
    forgery_violations: forgeries,
    data_authorization_level: ALLOWED_MODES.includes(dataAuthorizationLevel) ? dataAuthorizationLevel : 'abstracted',
    document_visualization_mode: ALLOWED_MODES.includes(documentVisualizationMode) ? documentVisualizationMode : 'structure_only',
    credential_usage_mode: ALLOWED_MODES.includes(credentialUsageMode) ? credentialUsageMode : 'redacted',
    generated_data_policy: ALLOWED_MODES.includes(generatedDataPolicy) ? generatedDataPolicy : 'abstracted'
  };
}

export function evaluateAssetAuthorizationSet(directions = []) {
  const perDirection = directions.map((d) => evaluateAssetAuthorization(d));
  const anyForgery = perDirection.some((item) => !item.ok);
  return {
    evaluator_version: ASSET_AUTHORIZATION_EVALUATOR_VERSION,
    per_direction: perDirection,
    forgery_detected: anyForgery,
    blocking_reasons: anyForgery ? ['fabricated_data_or_credentials'] : []
  };
}
