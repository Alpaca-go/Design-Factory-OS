// Direction text extraction (doc: specialized-fix evaluators).
//
// Collects every user-facing string inside a validated v2 direction so the
// gate evaluators can run keyword heuristics over free text when the model
// does not emit the optional structured fields.

const TEXT_FIELDS = [
  'direction_name',
  'strategic_idea',
  'brand_evidence',
  'execution_constraints',
  'template_risks'
];

function collectFrom(value, out) {
  if (typeof value === 'string') {
    if (value.trim().length) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFrom(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectFrom(item, out);
  }
}

export function collectDirectionText(direction) {
  const out = [];
  for (const field of TEXT_FIELDS) {
    if (direction[field] != null) collectFrom(direction[field], out);
  }
  const layer = direction.industry_recognition_layer;
  if (layer) collectFrom(layer, out);
  const graphic = direction.graphic_system;
  if (graphic) collectFrom(graphic, out);
  const photo = direction.photography_object_system;
  if (photo) collectFrom(photo, out);
  const info = direction.information_system;
  if (info) collectFrom(info, out);
  const layout = direction.layout_behavior;
  if (layout) collectFrom(layout, out);
  if (Array.isArray(direction.core_reusable_assets)) {
    for (const asset of direction.core_reusable_assets) collectFrom(asset, out);
  }
  if (Array.isArray(direction.composition_templates)) {
    for (const t of direction.composition_templates) collectFrom(t, out);
  }
  if (Array.isArray(direction.execution_examples)) {
    for (const e of direction.execution_examples) collectFrom(e, out);
  }
  if (Array.isArray(direction.anti_concept_art_constraints)) {
    for (const c of direction.anti_concept_art_constraints) collectFrom(c, out);
  }
  return out.join('\n');
}
