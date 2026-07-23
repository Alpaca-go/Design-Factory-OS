// v2 regression guards (doc section 十/十四).
//
// These guards prove the experiment does NOT break the invariants protected by
// the frozen modules: Asset Authorization, Evidence preservation and the
// Audience Boundary. They are read-only checks against the v1 inputs that v2 is
// allowed to read (doc section 十一) — they never modify those inputs.

export function guardAssetAuthorization(direction, assetBoundary = {}) {
  const allowed = new Set((assetBoundary.allowed_assets || assetBoundary.allowed || []).map((a) => (typeof a === 'string' ? a : (a.asset_id || a.assetId || a.id))));
  const restricted = new Set((assetBoundary.restricted_assets || assetBoundary.restricted || []).map((a) => (typeof a === 'string' ? a : (a.asset_id || a.assetId || a.id))));
  const references = direction.asset_references || [];
  const violations = [];
  const forbidden = references.filter((id) => restricted.has(id));
  if (forbidden.length) violations.push(`asset_references contains restricted assets: ${forbidden.join(', ')}`);
  const unknown = references.filter((id) => allowed.size && !allowed.has(id));
  if (unknown.length) violations.push(`asset_references contains unknown assets: ${unknown.join(', ')}`);
  return { ok: violations.length === 0, violations, checked: references.length };
}

export function guardEvidencePreservation(direction, evidenceIndex = []) {
  const evidenceIds = new Set(evidenceIndex.map((e) => (e.evidence_id || e.evidenceId || e.id)));
  const references = direction.evidence_ids || [];
  const violations = [];
  const unknown = references.filter((id) => !evidenceIds.has(id));
  if (unknown.length) violations.push(`evidence_ids references unknown Evidence: ${unknown.join(', ')}`);
  return { ok: violations.length === 0, violations, preservedEvidenceCount: evidenceIds.size, referencedEvidenceCount: references.length };
}

export function guardAudienceBoundary(direction, audienceBoundary = {}) {
  const violations = [];
  const businessModel = audienceBoundary?.businessModel || audienceBoundary?.business_model;
  if (businessModel === 'b2b') {
    const people = direction.photography_object_system?.people_product_packaging || '';
    if (/消费者(核心|作为核心)|consumer_core|把消费者作为核心/.test(people)) {
      violations.push('B2B direction cannot present consumers as the core subject');
    }
    const coreConsumerTouchpoints = (direction.composition_templates || [])
      .filter((t) => t.touchpoint === 'poster' || t.touchpoint === 'digital_hero')
      .some((t) => /核心消费者|consumer_core|消费者核心触点/.test(t.information_position || ''));
    if (coreConsumerTouchpoints) violations.push('B2B direction cannot include core consumer touchpoints');
  }
  return { ok: violations.length === 0, violations, businessModel: businessModel || 'unknown' };
}
