// Generate a v2.1-VALID negative (homogeneous / degenerate) fixture from the
// original Three-identical-directions jiuzhou-meixue file. Used by the v2.1
// specialized-fix test as the "bad" regression case. This file is NOT the
// canonical fixture (that is v2-directions.json, a v2.1 good set).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'tests', 'fixtures', 'visual-direction-v2', 'jiuzhou-meixue');

const original = JSON.parse(readFileSync(join(FIX, 'v2-directions-homogeneous.json'), 'utf8'));

const NEG_WEIGHTS = {
  compliance_weight: 0.30,
  supply_chain_weight: 0.40,
  product_material_weight: 0.10,
  ecosystem_weight: 0.10,
  brand_aesthetic_weight: 0.05,
  consumer_value_weight: 0.05
};

const out = original.map((raw, i) => {
  const base = structuredClone(raw);
  base.direction_family = 'A';
  base.family_type = 'supply_chain_trust';
  base.compliance_weights = { ...NEG_WEIGHTS };
  base.downstream_consumer_value = {
    present: true,
    consumer_value_role: 'none',
    value_statement: '',
    visual_expression: '',
    touchpoints: [],
    evidence_ids: []
  };
  // Sparse classification: only regulatory + supply_chain -> set misses the
  // other required categories (product_material / institution / consumer).
  base.industry_recognition_classification = {
    regulatory_objects: ['资质审核流程'],
    supply_chain_objects: ['GSP 仓储', '冷链配送'],
    product_material_objects: [],
    institution_service_objects: [],
    consumer_value_objects: [],
    aesthetic_culture_objects: []
  };
  base.asset_authorization = {
    data_authorization_level: 'abstracted',
    document_visualization_mode: 'structure_only',
    credential_usage_mode: 'redacted',
    generated_data_policy: 'abstracted'
  };
  return base;
});

writeFileSync(join(FIX, 'v2-directions-homogeneous.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('wrote negative fixture:', out.length, 'directions');
