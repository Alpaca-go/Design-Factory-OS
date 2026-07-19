import { arrayValue, enumValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';
import { assertAudienceBoundaryMatches } from './audience-boundary-v1.js';
import { validateEvidenceConfidence } from './evidence-confidence-v1.js';

export const SIGNAL_TYPES = Object.freeze(['capability', 'relationship', 'emotion', 'culture', 'aesthetic-tension', 'audience-boundary']);

export function validateVisualStrategySignalMap(value, evidenceMap) {
  const root = objectValue(value?.visualStrategySignalMap || value, 'visualStrategySignalMap');
  const evidenceIds = new Set(evidenceMap.evidence.map((item) => item.evidenceId));
  const signals = arrayValue(root.signals, 'visualStrategySignalMap.signals', { min: 7, max: 12 }).map((raw, index) => {
    const path = `visualStrategySignalMap.signals[${index}]`;
    const item = objectValue(raw, path);
    const refs = stringArray(item.evidenceIds, `${path}.evidenceIds`, { min: 1 });
    if (refs.some((id) => !evidenceIds.has(id))) throw Object.assign(new Error(`${path}.evidenceIds 包含未知证据`), { code: 'FAILED_SCHEMA', path });
    return {
      signalId: `VS${String(index + 1).padStart(2, '0')}`,
      type: enumValue(item.type, SIGNAL_TYPES, `${path}.type`),
      statement: stringValue(item.statement, `${path}.statement`, { maxLength: 180 }),
      evidenceIds: refs,
      evidence_ids: refs,
      ...validateEvidenceConfidence(item, path),
      importance: enumValue(item.importance, ['primary', 'secondary', 'supporting'], `${path}.importance`),
      visualPotential: enumValue(item.visualPotential, ['high', 'medium', 'low'], `${path}.visualPotential`)
    };
  });
  const counts = new Map(SIGNAL_TYPES.map((type) => [type, signals.filter((item) => item.type === type).length]));
  for (const [type, count] of counts) {
    if (count < 1 || count > 3) throw Object.assign(new Error(`视觉信号 ${type} 必须为 1–3 条`), { code: 'FAILED_SCHEMA', path: 'visualStrategySignalMap.signals' });
  }
  return Object.freeze({
    audienceBoundary: assertAudienceBoundaryMatches(root.audienceBoundary, evidenceMap.audienceBoundary, 'visualStrategySignalMap.audienceBoundary'),
    signals
  });
}
