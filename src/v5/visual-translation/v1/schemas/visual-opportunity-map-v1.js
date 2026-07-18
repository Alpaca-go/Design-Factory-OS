import { arrayValue, enumValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';

export function validateVisualOpportunityMap(value, evidenceMap) {
  const root = objectValue(value?.visualOpportunityMap || value, 'visualOpportunityMap');
  const evidenceIds = new Set(evidenceMap.evidence.map((item) => item.evidenceId));
  const opportunities = (items, path, prefix, minimum = 1) => arrayValue(items, path, { min: minimum }).map((raw, index) => {
    const item = objectValue(raw, `${path}[${index}]`);
    const refs = stringArray(item.evidenceIds, `${path}[${index}].evidenceIds`, { min: 1 });
    if (refs.some((id) => !evidenceIds.has(id))) throw Object.assign(new Error(`${path}[${index}].evidenceIds 包含未知证据`), { code: 'FAILED_SCHEMA', path });
    return {
      opportunityId: `${prefix}${String(index + 1).padStart(2, '0')}`,
      statement: stringValue(item.statement, `${path}[${index}].statement`, { maxLength: 180 }),
      rationale: stringValue(item.rationale, `${path}[${index}].rationale`, { maxLength: 260 }),
      evidenceIds: refs,
      brandability: enumValue(item.brandability, ['high', 'medium', 'low'], `${path}[${index}].brandability`)
    };
  });
  const categoryCliches = arrayValue(root.categoryCliches, 'visualOpportunityMap.categoryCliches', { min: 2 }).map((raw, index) => {
    const path = `visualOpportunityMap.categoryCliches[${index}]`;
    const item = objectValue(raw, path);
    return {
      clicheId: `VC${String(index + 1).padStart(2, '0')}`,
      pattern: stringValue(item.pattern, `${path}.pattern`),
      risk: stringValue(item.risk, `${path}.risk`),
      allowedWhen: stringValue(item.allowedWhen, `${path}.allowedWhen`),
      prohibitedWhen: stringValue(item.prohibitedWhen, `${path}.prohibitedWhen`)
    };
  });
  return Object.freeze({
    visualizableFacts: opportunities(root.visualizableFacts, 'visualOpportunityMap.visualizableFacts', 'VF'),
    metaphors: opportunities(root.metaphors, 'visualOpportunityMap.metaphors', 'VM'),
    aestheticTensions: opportunities(root.aestheticTensions, 'visualOpportunityMap.aestheticTensions', 'VT'),
    categoryCliches
  });
}
