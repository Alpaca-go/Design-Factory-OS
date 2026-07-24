import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleAssetSelectionProtocol,
  assertAssetSelectionProtocol,
  buildReferenceMasterSet,
  buildTaskReferenceSubsets,
  createFallbackCurrentProjectDecisions,
  createFallbackReferenceDecisions,
  groupReferenceNearDuplicates,
  validateReferenceMasterSet
} from '../src/main/asset-selection-protocol/index.ts';
import type { ProjectAsset, ProjectRecord, ReferenceAssetDecision } from '../src/shared/types.ts';

function asset(id: string, originalName: string, sha256 = id): ProjectAsset {
  return {
    id,
    batchId: 'batch',
    sourceType: 'file',
    originalName,
    relativePath: `assets/${originalName}`,
    mimeType: 'image/png',
    sizeBytes: 100,
    sha256,
    status: 'ready'
  };
}

function project(assets: ProjectAsset[]): ProjectRecord {
  return {
    id: 'project-1',
    projectName: '云岭茶集',
    brandName: '云岭茶集',
    detectedBrandName: '云岭茶集',
    industry: '茶饮',
    detectedIndustry: '茶饮',
    logoLocked: true,
    logoFiles: ['logo.png'],
    lockedFacts: ['品牌名称不可更改'],
    assets
  } as ProjectRecord;
}

test('current core pack removes exact duplicates and keeps identity evidence separate from legacy style', () => {
  const assets = [
    asset('logo', 'brand-logo.png', 'same-logo'),
    asset('logo-copy', 'brand-logo-copy.png', 'same-logo'),
    asset('pack', 'cup-packaging.png'),
    asset('product', 'tea-product.png')
  ];
  const current = createFallbackCurrentProjectDecisions(assets);
  const reference = createFallbackReferenceDecisions([
    asset('overview', 'system-overview.png'),
    asset('poster', 'campaign-poster.png')
  ]);
  const protocol = assembleAssetSelectionProtocol(project(assets), current, reference);

  assert.equal(protocol.currentProjectCorePack.sourceAssetIds.includes('logo-copy'), false);
  assert.equal(protocol.currentCorePackValidation.excludesDuplicateAssets, true);
  assert.equal(protocol.currentCorePackValidation.hasLogoEvidence, true);
  assert.equal(current.find((item) => item.assetId === 'logo')?.includeInAnalysisEvidencePack, true);
  assert.equal(current.find((item) => item.assetId === 'logo')?.generationUsage, 'identity');
  assert.doesNotThrow(() => assertAssetSelectionProtocol(protocol));
});

test('reference master set excludes text, business pages and near duplicates', () => {
  const decisions: ReferenceAssetDecision[] = [
    {
      assetId: 'overview',
      filename: 'overview.png',
      role: 'system_overview',
      styleCarrierStrength: 'high',
      includeInMasterSet: true,
      eligibleOutputTypes: ['anchor_vi_system', 'vi_application'],
      representedStyleCarriers: ['color', 'layout', 'graphic'],
      duplicationGroupId: 'group-overview',
      confidence: 0.94,
      reason: '系统总览',
      requiresHumanReview: false
    },
    {
      assetId: 'overview-copy',
      filename: 'overview-copy.png',
      role: 'system_overview',
      styleCarrierStrength: 'medium',
      includeInMasterSet: true,
      eligibleOutputTypes: ['anchor_vi_system'],
      representedStyleCarriers: ['color', 'layout'],
      duplicationGroupId: 'group-overview',
      confidence: 0.82,
      reason: '近重复总览',
      requiresHumanReview: false
    },
    {
      assetId: 'text',
      filename: 'strategy.png',
      role: 'brand_strategy_text',
      styleCarrierStrength: 'low',
      includeInMasterSet: false,
      eligibleOutputTypes: [],
      representedStyleCarriers: [],
      confidence: 0.95,
      reason: '商业策略文字',
      requiresHumanReview: false
    }
  ];
  const master = buildReferenceMasterSet(decisions);
  const validation = validateReferenceMasterSet(master, decisions);

  assert.deepEqual(master.assetIds, ['overview']);
  assert.equal(validation.excludesBusinessAnalysisPages, true);
  assert.equal(validation.excludesNearDuplicates, true);
});

test('perceptual hashes group visually near files even when their SHA-256 values differ', () => {
  const decisions = createFallbackReferenceDecisions([
    asset('first', 'poster-a.png', 'sha-a'),
    asset('second', 'poster-b.png', 'sha-b'),
    asset('third', 'poster-c.png', 'sha-c')
  ]);
  const grouped = groupReferenceNearDuplicates(decisions, {
    first: '00000000',
    second: '00000001',
    third: '11111111'
  }, 1);

  assert.equal(grouped[0]?.duplicationGroupId, grouped[1]?.duplicationGroupId);
  assert.notEqual(grouped[0]?.duplicationGroupId, grouped[2]?.duplicationGroupId);
});

test('task subsets contain at most four task-matched references and preserve one primary reference', () => {
  const decisions = createFallbackReferenceDecisions([
    asset('overview', 'system-overview.png'),
    asset('pack', 'packaging.png'),
    asset('poster', 'poster.png'),
    asset('vi', 'vi-application.png'),
    asset('space', 'store-space.png')
  ]);
  decisions[0]!.styleCarrierStrength = 'high';
  const master = buildReferenceMasterSet(decisions);
  const { subsets } = buildTaskReferenceSubsets(master);

  assert.equal(subsets.length, 8);
  for (const subset of subsets) {
    assert.ok(subset.selectedAssetIds.length >= 1 && subset.selectedAssetIds.length <= 4);
    assert.ok(subset.selectedAssetIds.includes(subset.primaryReferenceAssetId));
    assert.equal(
      subset.supportingReferenceAssetIds.includes(subset.primaryReferenceAssetId),
      false
    );
  }
});

test('VI overview with packaging as a secondary role is a compatible packaging reference', () => {
  const decisions = createFallbackReferenceDecisions([
    asset('vi', 'vi-application-overview.png')
  ]);
  assert.ok(decisions[0]?.secondaryRoles?.includes('packaging'));
  const master = buildReferenceMasterSet(decisions);
  const packaging = buildTaskReferenceSubsets(master).subsets
    .find((item) => item.outputType === 'packaging_single')!;

  assert.equal(packaging.matchLevel, 'compatible');
  assert.match(packaging.selectionReason, /兼容参考/);
  assert.doesNotMatch(packaging.selectionReason, /精确匹配/);
});
