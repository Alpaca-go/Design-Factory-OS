import type {
  ReferenceLedDirection,
  ReferenceTranslationProfile
} from '../shared/types.ts';

export type ReportType = 'visual_upgrade' | 'reference_translation';

function lines(values: string[], fallback = '无'): string {
  return values.length ? values.map((value) => `- ${value}`).join('\n') : `- ${fallback}`;
}

function contextValue(projectContext: unknown, key: string): unknown {
  if (!projectContext || typeof projectContext !== 'object') return undefined;
  return (projectContext as Record<string, unknown>)[key];
}

export function generateReferenceLedDirection(
  profile: ReferenceTranslationProfile,
  preference = ''
): ReferenceLedDirection {
  const rules = profile.referenceVisualDNA;
  const category = (name: string) => rules[name] || [];
  const mechanisms = profile.projectTranslationMatrix.map((item) => item.translatedMechanism);
  const prohibitedActions = [...new Set([
    ...profile.projectTranslationMatrix.flatMap((item) => item.prohibitedElements),
    ...profile.sourceRisks.similarityWarnings
  ])];
  return {
    directionName: preference ? `参考驱动方向 · ${preference.slice(0, 24)}` : '参考机制重构方向',
    coreProposition: mechanisms[0] || '以当前项目事实重建参考方案的视觉功能，不复制其品牌表层形式。',
    visualAnchor: category('visualTemperament')[0]?.mechanism
      || category('graphicGrammar')[0]?.mechanism
      || '以当前项目事实和 Locked Assets 为视觉锚点。',
    compositionSystem: category('compositionRules').map((item) => item.mechanism),
    graphicSystem: category('graphicGrammar').map((item) => item.mechanism),
    colorSystem: category('colorLogic').map((item) => item.mechanism),
    materialSystem: category('materialAndLighting').map((item) => item.mechanism),
    typographySystem: category('typographyLogic').map((item) => item.mechanism),
    touchpointRules: {
      packaging: mechanisms.slice(0, 3),
      poster: mechanisms.slice(0, 3),
      vi: mechanisms.slice(0, 3),
      spatial: category('extensionMechanism').map((item) => item.mechanism)
    },
    prohibitedActions
  };
}

export function compileReferenceTranslationMarkdown(input: {
  profile: ReferenceTranslationProfile;
  projectContext: unknown;
  direction: ReferenceLedDirection;
}): string {
  const { profile, direction } = input;
  const brandIdentity = contextValue(input.projectContext, 'brandIdentity') as Record<string, unknown> | undefined;
  const projectFacts = contextValue(input.projectContext, 'projectFacts') as Record<string, unknown> | undefined;
  const lockedAssets = Array.isArray(contextValue(input.projectContext, 'lockedAssets'))
    ? contextValue(input.projectContext, 'lockedAssets') as string[]
    : [];
  const projectName = String(projectFacts?.projectName || brandIdentity?.brandName || '当前项目');
  const dnaSections = Object.entries(profile.referenceVisualDNA)
    .map(([category, rules]) => `### ${category}\n${lines(rules.map((item) => `${item.name}：${item.mechanism}`))}`)
    .join('\n\n');
  const transfer = profile.transferability;
  const matrix = profile.projectTranslationMatrix.map((item) => [
    `### ${item.translation_id}`,
    `- 参考机制：${item.referenceMechanism}`,
    `- 项目条件：${item.projectCondition}`,
    `- 转译机制：${item.translatedMechanism}`,
    `- 约束：${item.prohibitedElements.join('；')}`
  ].join('\n')).join('\n\n');

  return `# ${projectName} Reference-led Visual Direction

## 1. 项目视觉信息摘要
- 项目：${projectName}
- 品牌：${String(brandIdentity?.brandName || '待确认')}
- 行业：${String(brandIdentity?.industry || '待确认')}

## 2. Locked Assets
${lines(lockedAssets, '当前项目未记录额外 Locked Assets')}

## 3. Reference Visual DNA
${dnaSections}

## 4. 可以继承的视觉机制
${lines(transfer.directlyTransferable.map((item) => `${item.name}：${item.reason}`))}

## 5. 需要重新解释的视觉机制
${lines(transfer.requiresReinterpretation.map((item) => `${item.name}：${item.reason}`))}

## 6. 禁止复制的品牌专属资产
${lines(transfer.prohibitedToCopy.map((item) => `${item.name}：${item.reason}`))}

## 7. 项目转译矩阵
${matrix}

## 8. Reference-led Primary Direction
### ${direction.directionName}
- 核心命题：${direction.coreProposition}
- 视觉锚点：${direction.visualAnchor}
- 构图系统：${direction.compositionSystem.join('；') || '依据当前项目触点建立'}
- 图形系统：${direction.graphicSystem.join('；') || '依据当前项目语义重建'}
- 色彩系统：${direction.colorSystem.join('；') || '不得复制参考品牌专属色值'}
- 材质系统：${direction.materialSystem.join('；') || '依据可执行工艺重建'}
- 字体系统：${direction.typographySystem.join('；') || '依据当前品牌语气重建'}

## 9. 相似性风险与禁止事项
${lines(direction.prohibitedActions, '保持机制级迁移，禁止复制参考方案完整构图')}
`;
}

export function validateReferenceTranslationMarkdown(
  markdown: string,
  structured: { profile?: ReferenceTranslationProfile; direction?: ReferenceLedDirection } = {}
): void {
  const required = [
    '项目视觉信息摘要',
    'Locked Assets',
    'Reference Visual DNA',
    '可以继承的视觉机制',
    '需要重新解释的视觉机制',
    '禁止复制的品牌专属资产',
    '项目转译矩阵',
    'Reference-led Primary Direction',
    '相似性风险与禁止事项'
  ];
  const missing = required.filter((heading) => !markdown.includes(heading));
  if (missing.length) {
    throw Object.assign(
      new Error(`参考转译 Markdown 校验失败：缺少章节 ${missing.join('、')}`),
      { code: 'MARKDOWN_VALIDATION_FAILED' }
    );
  }
  if (structured.profile) {
    if (!structured.profile.referenceVisualDNA || !structured.profile.transferability
      || !structured.profile.projectTranslationMatrix) {
      throw Object.assign(new Error('参考转译 Markdown 校验失败：结构化结果不完整'), {
        code: 'MARKDOWN_VALIDATION_FAILED'
      });
    }
  }
  if (structured.direction && !structured.direction.coreProposition) {
    throw Object.assign(new Error('参考转译 Markdown 校验失败：缺少参考驱动视觉方向'), {
      code: 'MARKDOWN_VALIDATION_FAILED'
    });
  }
}
