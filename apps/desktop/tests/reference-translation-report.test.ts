import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileReferenceTranslationMarkdown,
  generateReferenceLedDirection,
  validateReferenceTranslationMarkdown
} from '../src/main/reference-translation-report.ts';
import { validateVisualUpgradeMarkdown } from '../src/main/analysis-contract.ts';
import type { ReferenceTranslationProfile } from '../src/shared/types.ts';

const profile: ReferenceTranslationProfile = {
  schema_version: 'reference-translation-profile-v1',
  source_role: 'reference_project',
  referenceIdentity: {
    touchpoints: [],
    assetCount: 4,
    completeness: 'medium',
    consistency: 'medium',
    missingEvidence: []
  },
  referenceVisualDNA: {
    visualTemperament: [],
    compositionRules: [],
    graphicGrammar: [],
    colorLogic: [],
    typographyLogic: [],
    materialAndLighting: [],
    extensionMechanism: []
  },
  transferability: {
    directlyTransferable: [],
    requiresReinterpretation: [],
    prohibitedToCopy: []
  },
  sourceRisks: {
    signatureAssets: [],
    recognizableCombinations: [],
    similarityWarnings: []
  },
  projectTranslationMatrix: [{
    translation_id: 'PTM-001',
    referenceMechanism: '稳定网格',
    referenceFunction: '建立秩序',
    projectCondition: '当前项目事实',
    translatedMechanism: '以当前项目信息重建网格',
    retainedProperties: ['秩序'],
    changedProperties: ['品牌内容'],
    prohibitedElements: ['参考 Logo'],
    confidence: 0.8
  }]
};

test('reference report validator accepts empty transferability classes without visual-upgrade asset decisions', () => {
  const direction = generateReferenceLedDirection(profile);
  const markdown = compileReferenceTranslationMarkdown({
    profile,
    projectContext: {
      brandIdentity: { brandName: '测试品牌', industry: '测试行业' },
      projectFacts: { projectName: '测试项目' },
      lockedAssets: ['当前项目 Logo']
    },
    direction
  });
  assert.doesNotThrow(() => validateReferenceTranslationMarkdown(markdown, { profile, direction }));
  assert.doesNotMatch(markdown, /资产决策未覆盖/);
  assert.throws(() => validateVisualUpgradeMarkdown(markdown), /缺少章节|唯一视觉升级命题|资产决策/);
});

test('reference report validator reports missing semantic sections', () => {
  assert.throws(
    () => validateReferenceTranslationMarkdown('# incomplete', { profile }),
    /缺少章节/
  );
});

