import { arrayValue, enumValue, numberValue, objectValue, stringArray, stringValue } from '../../../shared/analysis/runtime-contracts.js';

function normalized(value) { return JSON.stringify(value).toLowerCase().replace(/[\s，。；、：,.!！?？"']/g, ''); }

export function validateVisualCreativeDirections(value, context) {
  const root = objectValue(value?.visualCreativeDirections || value, 'visualCreativeDirections');
  const signalIds = new Set(context.signalMap.signals.map((item) => item.signalId));
  const evidenceIds = new Set(context.evidenceMap.evidence.map((item) => item.evidenceId));
  const directions = arrayValue(root.directions, 'visualCreativeDirections.directions', { min: 3, max: 3 }).map((raw, index) => {
    const path = `visualCreativeDirections.directions[${index}]`;
    const item = objectValue(raw, path);
    const strategicSignals = stringArray(item.strategicSignals, `${path}.strategicSignals`, { min: 2 });
    const refs = stringArray(item.evidenceIds, `${path}.evidenceIds`, { min: 2 });
    if (strategicSignals.some((id) => !signalIds.has(id))) throw Object.assign(new Error(`${path}.strategicSignals 包含未知信号`), { code: 'FAILED_SCHEMA', path });
    if (refs.some((id) => !evidenceIds.has(id))) throw Object.assign(new Error(`${path}.evidenceIds 包含未知证据`), { code: 'FAILED_SCHEMA', path });
    const subject = objectValue(item.subjectPolicy, `${path}.subjectPolicy`);
    return {
      directionId: `D0${index + 1}`,
      name: stringValue(item.name, `${path}.name`),
      oneSentenceConcept: stringValue(item.oneSentenceConcept, `${path}.oneSentenceConcept`, { maxLength: 180 }),
      strategicSignals,
      evidenceIds: refs,
      coreMetaphor: stringValue(item.coreMetaphor, `${path}.coreMetaphor`),
      distinctiveMechanism: stringValue(item.distinctiveMechanism, `${path}.distinctiveMechanism`),
      graphicLanguage: stringArray(item.graphicLanguage, `${path}.graphicLanguage`, { min: 2 }),
      colorLogic: stringValue(item.colorLogic, `${path}.colorLogic`),
      materialLanguage: stringArray(item.materialLanguage, `${path}.materialLanguage`, { min: 2 }),
      lightingLanguage: stringValue(item.lightingLanguage, `${path}.lightingLanguage`),
      compositionLanguage: stringValue(item.compositionLanguage, `${path}.compositionLanguage`),
      subjectPolicy: {
        people: stringValue(subject.people, `${path}.subjectPolicy.people`),
        products: stringValue(subject.products, `${path}.subjectPolicy.products`),
        environment: stringValue(subject.environment, `${path}.subjectPolicy.environment`)
      },
      suitableApplications: stringArray(item.suitableApplications, `${path}.suitableApplications`, { min: 2 }),
      brandFit: numberValue(item.brandFit, `${path}.brandFit`, { min: 0, max: 100 }),
      inspirationValue: numberValue(item.inspirationValue, `${path}.inspirationValue`, { min: 0, max: 100 }),
      distinctiveness: numberValue(item.distinctiveness, `${path}.distinctiveness`, { min: 0, max: 100 }),
      categoryClicheRisk: enumValue(item.categoryClicheRisk, ['low', 'medium', 'high'], `${path}.categoryClicheRisk`),
      risks: stringArray(item.risks, `${path}.risks`, { min: 1 })
    };
  });
  if (new Set(directions.map((item) => item.name)).size !== 3) throw Object.assign(new Error('三个视觉方向名称必须不同'), { code: 'DIRECTIONS_NOT_DISTINCT' });
  for (let left = 0; left < directions.length; left += 1) {
    for (let right = left + 1; right < directions.length; right += 1) {
      const a = directions[left]; const b = directions[right];
      const dimensions = [
        ['coreMetaphor', a.coreMetaphor, b.coreMetaphor],
        ['graphicLanguage', a.graphicLanguage, b.graphicLanguage],
        ['colorLogic', a.colorLogic, b.colorLogic],
        ['materialLanguage', a.materialLanguage, b.materialLanguage],
        ['lightingLanguage', a.lightingLanguage, b.lightingLanguage],
        ['compositionLanguage', a.compositionLanguage, b.compositionLanguage],
        ['subjectPolicy', a.subjectPolicy, b.subjectPolicy]
      ];
      const differing = dimensions.filter(([, av, bv]) => normalized(av) !== normalized(bv)).map(([name]) => name);
      if (differing.length < 3) throw Object.assign(new Error(`${a.directionId} 与 ${b.directionId} 仅有 ${differing.length} 个显著差异维度`), { code: 'DIRECTIONS_NOT_DISTINCT', pair: [a.directionId, b.directionId], differing });
    }
  }
  return Object.freeze({ directions });
}
