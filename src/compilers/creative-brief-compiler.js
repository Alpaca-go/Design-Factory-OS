import {
  BRAND_DNA_DIMENSION_IDS,
  CREATIVE_BRIEF_SECTION_ORDER
} from '../creative-decision-state.js';
import {
  assertCompilerInput,
  brandElementIndex,
  clone,
  compilerEnvelope,
  limitCharacters,
  sortByDisplayOrder
} from './compiler-contract.js';

export const CREATIVE_BRIEF_COMPILER_ID = 'creative-brief-compiler-v4';

const SOURCE_PATHS = Object.freeze([
  'meta.schemaVersion',
  'meta.decisionId',
  'meta.status',
  'meta.stateDigest',
  'creativeBrief.contractVersion',
  'creativeBrief.sectionOrder',
  'creativeBrief.sectionBindings',
  'creativeBrief.contentPolicy',
  'creativeBrief.audienceProfiles',
  'strategy.creativeVision',
  'strategy.creativeFreedom.recommendation.freedom',
  'strategy.creativeFreedom.recommendation.mode',
  'strategy.creativeFreedom.recommendation.confidence',
  'strategy.creativeFreedom.recommendation.briefWhy',
  'strategy.creativeFreedom.effective',
  'strategy.thesis',
  'strategy.actions',
  'constraints.elementPolicies',
  'constraints.forbiddenDirections',
  'brand.elements',
  'brand.personality',
  'brand.approvedBrandDNA',
  'strategy.creativePrinciples',
  'strategy.photographyDirection',
  'strategy.designGoal',
  'governance.readiness',
  'governance.blockers'
]);

const SECTION_TITLES = Object.freeze({
  'creative-vision': 'Creative Vision',
  'creative-strategy': 'Creative Strategy',
  'design-constraints': 'Design Constraints',
  'brand-personality': 'Brand Personality',
  'approved-brand-dna': 'Approved Brand DNA',
  'creative-principles': 'Creative Principles',
  'must-keep': 'Must Keep',
  'can-explore': 'Can Explore',
  'photography-direction': 'Photography Direction',
  'design-goal': 'Design Goal'
});

function elementLabel(ref, elements) {
  const element = elements.get(ref);
  return element ? `${element.name} (${element.elementId})` : ref;
}

function briefAction(action, elements) {
  return {
    actionId: action.actionId,
    actionType: action.actionType,
    domain: action.domain,
    elements: action.elementRefs.map((ref) => elementLabel(ref, elements)),
    directive: action.directive,
    transformationDepth: action.transformationDepth,
    ...(action.identityGuardRefs !== undefined ? { identityGuardRefs: clone(action.identityGuardRefs) } : {}),
    displayOrder: action.displayOrder
  };
}

function briefPolicy(policy, elements) {
  return {
    policyId: policy.policyId,
    element: elementLabel(policy.elementRef, elements),
    classification: policy.classification,
    directive: policy.directive,
    ...(policy.identityGuardRefs !== undefined ? { identityGuardRefs: clone(policy.identityGuardRefs) } : {}),
    displayOrder: policy.displayOrder
  };
}

function briefForbiddenDirection(rule) {
  return {
    ruleId: rule.ruleId,
    statement: rule.statement,
    appliesToRefs: clone(rule.appliesToRefs),
    displayOrder: rule.displayOrder
  };
}

function renderList(items, formatter) {
  return items.map((item) => `- ${formatter(item)}`).join('\n');
}

function renderSectionBody(section) {
  const content = section.content;
  switch (section.id) {
    case 'creative-vision':
      return `${content.statement}\n\nDirection: ${content.direction}`;
    case 'creative-strategy': {
      const why = renderList(content.recommendation.briefWhy, (item) => item);
      const actions = renderList(content.actions, (item) => `[${item.actionType}] ${item.domain}: ${item.directive}`);
      return [
        `Recommended Freedom: ${content.recommendation.freedom}%`,
        `Recommended Mode: ${content.recommendation.mode}`,
        `Confidence: ${content.recommendation.confidence}`,
        why,
        `Effective Freedom: ${content.effective.freedom === null ? '—' : `${content.effective.freedom}%`}`,
        `Effective Mode: ${content.effective.mode}`,
        `Effective Source: ${content.effective.source}`,
        content.thesis,
        actions
      ].filter(Boolean).join('\n\n');
    }
    case 'design-constraints': {
      const policies = renderList(content.policies, (item) => `[${item.classification}] ${item.element}: ${item.directive}`);
      const forbidden = renderList(content.forbiddenDirections, (item) => `Forbidden: ${item.statement}`);
      return [policies, forbidden].filter(Boolean).join('\n\n');
    }
    case 'brand-personality':
      return [
        content.statement,
        `Desired: ${content.desired.join('、')}`,
        `Avoid: ${content.avoid.join('、')}`
      ].join('\n\n');
    case 'approved-brand-dna':
      return renderList(content.dimensions, (item) => `${item.dimension}: ${item.directive}`);
    case 'creative-principles':
      return renderList(content, (item) => item.statement);
    case 'must-keep':
    case 'can-explore':
      return renderList(content, (item) => `[${item.classification}] ${item.element}: ${item.directive}`);
    case 'photography-direction':
      return [
        `Lighting: ${content.lighting}`,
        `Framing: ${content.framing}`,
        `Depth: ${content.depth}`,
        `Materials: ${content.materials}`,
        `Atmosphere: ${content.atmosphere}`
      ].join('\n\n');
    case 'design-goal':
      return content;
    default:
      return '';
  }
}

function renderWithinLimit(state, sections, maximum) {
  const prefix = `# Creative Brief\n\nDecision ID: ${state.meta.decisionId}\n\nState Digest: ${state.meta.stateDigest}\n\n`;
  const headings = sections.map((section, index) => `## ${index + 1}. ${section.title}`);
  const fixed = `${prefix}${headings.map((heading) => `${heading}\n\n`).join('\n\n')}`;
  let remaining = Math.max(0, maximum - fixed.length);
  const bodies = sections.map((section, index) => {
    const raw = renderSectionBody(section);
    const slots = sections.length - index;
    const allowance = Math.floor(remaining / slots);
    const body = limitCharacters(raw, allowance);
    remaining -= body.length;
    return body;
  });
  return `${prefix}${sections.map((section, index) => `${headings[index]}\n\n${bodies[index]}`).join('\n\n')}`;
}

function buildSections(state) {
  const elements = brandElementIndex(state);
  const actions = sortByDisplayOrder(state.strategy.actions).map((item) => briefAction(item, elements));
  const policies = sortByDisplayOrder(state.constraints.elementPolicies).map((item) => briefPolicy(item, elements));
  const forbiddenDirections = sortByDisplayOrder(state.constraints.forbiddenDirections).map(briefForbiddenDirection);
  const dimensions = BRAND_DNA_DIMENSION_IDS
    .map((dimension) => ({ dimension, ...state.brand.approvedBrandDNA.dimensions[dimension] }))
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((item) => ({ dimension: item.dimension, directive: item.directive, status: item.status, displayOrder: item.displayOrder }));
  const principles = sortByDisplayOrder(state.strategy.creativePrinciples)
    .map((item) => ({ principleId: item.principleId, statement: item.statement, status: item.status, displayOrder: item.displayOrder }));
  const contentById = {
    'creative-vision': clone(state.strategy.creativeVision),
    'creative-strategy': {
      recommendation: {
        freedom: state.strategy.creativeFreedom.recommendation.freedom,
        mode: state.strategy.creativeFreedom.recommendation.mode,
        confidence: state.strategy.creativeFreedom.recommendation.confidence,
        briefWhy: clone(state.strategy.creativeFreedom.recommendation.briefWhy)
      },
      effective: clone(state.strategy.creativeFreedom.effective),
      thesis: state.strategy.thesis,
      actions
    },
    'design-constraints': { policies, forbiddenDirections },
    'brand-personality': {
      statement: state.brand.personality.statement,
      desired: clone(state.brand.personality.desired),
      avoid: clone(state.brand.personality.avoid)
    },
    'approved-brand-dna': { status: state.brand.approvedBrandDNA.status, dimensions },
    'creative-principles': principles,
    'must-keep': policies.filter((item) => item.classification === 'locked'),
    'can-explore': policies.filter((item) => item.classification === 'evolve' || item.classification === 'flexible'),
    'photography-direction': clone(state.strategy.photographyDirection),
    'design-goal': state.strategy.designGoal
  };
  return CREATIVE_BRIEF_SECTION_ORDER.map((id) => ({ id, title: SECTION_TITLES[id], content: contentById[id] }));
}

export function compileCreativeBriefV4(state) {
  assertCompilerInput(state, CREATIVE_BRIEF_COMPILER_ID);
  const sections = buildSections(state);
  const designerMaximum = state.creativeBrief.contentPolicy.designerMaxCharacters;
  const runtimeMaximum = state.creativeBrief.contentPolicy.runtimeMaxCharacters;
  const markdown = renderWithinLimit(state, sections, designerMaximum);
  const runtimeContent = renderWithinLimit(state, sections, runtimeMaximum);
  const designerProfile = state.creativeBrief.audienceProfiles.find((item) => item.id === 'designer');
  const runtimeProfile = state.creativeBrief.audienceProfiles.find((item) => item.id === 'gpt-runtime');

  return compilerEnvelope(
    state,
    CREATIVE_BRIEF_COMPILER_ID,
    'CreativeBriefCompilation',
    SOURCE_PATHS,
    {
      creativeBrief: {
        contractVersion: state.creativeBrief.contractVersion,
        audience: 'designer',
        audienceProfile: clone(designerProfile),
        sectionOrder: clone(state.creativeBrief.sectionOrder),
        sections,
        markdown,
        characterCount: markdown.length,
        maximumCharacters: designerMaximum
      },
      runtimeGptBrief: {
        contractVersion: state.creativeBrief.contractVersion,
        audience: 'gpt-runtime',
        audienceProfile: clone(runtimeProfile),
        persistence: runtimeProfile.persistence,
        content: runtimeContent,
        characterCount: runtimeContent.length,
        maximumCharacters: runtimeMaximum
      }
    }
  );
}
