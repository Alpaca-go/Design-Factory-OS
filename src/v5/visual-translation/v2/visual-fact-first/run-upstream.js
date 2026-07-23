import { valueHash } from '../../../shared/analysis/checkpoint-store.js';
import { compileBenchmarkQueryPlan } from './benchmark-query-compiler.js';
import { retrieveBenchmarkCases } from './benchmark-retrieval.js';
import { compileVisualAssetEvidenceMarkdown, compileVisualOpportunityMarkdown } from './markdown-compilers.js';
import { buildVisualAssetEvidencePrompt, buildVisualFactsPrompt, buildVisualOpportunitySynthesisPrompt, VISUAL_ASSET_EVIDENCE_PROMPT_VERSION, VISUAL_FACTS_PROMPT_VERSION, VISUAL_OPPORTUNITY_SYNTHESIS_PROMPT_VERSION } from './prompts.js';
import { validateBenchmarkQueryPlan, validateVisualAssetEvidence, validateVisualOpportunitySynthesis, validateVisualRelevantBrandFacts } from './schemas.js';
import { adaptVisualFactFirstToStep4, buildCompatibilityEvidenceMap } from './step4-input-adapter.js';
import { evaluatePipelineCompleteness, VISUAL_FACT_FIRST_REQUIRED_ARTIFACTS } from './pipeline-completeness.js';
import { compileVisualBrief, compileVisualBriefMarkdown } from '../retrieval-first/visual-brief.js';
import { buildVisualAssetPipelineStatus } from './visual-asset-pipeline-status.js';

const PROFILE = Object.freeze({ thinking: false, thinkingBudget: null, maxOutputTokens: 7000, requestTimeoutMs: 240000 });
const SYNTHESIS_PROFILE = Object.freeze({ thinking: true, thinkingBudget: 3000, maxOutputTokens: 7000, requestTimeoutMs: 300000 });

export async function runVisualFactFirstUpstream({ input, prepared, model, local, save, resume, selectedTouchpoints }) {
  const expected = (stageId, upstreamHash, promptVersion, schemaVersion) => ({
    stageId, documentSetHash: prepared.documentSetHash, upstreamHash, promptVersion, schemaVersion
  });

  const factsExpected = expected('01-visual-relevant-facts', prepared.documentSetHash, VISUAL_FACTS_PROMPT_VERSION, 'visual-facts-v1');
  let visualFacts = resume('01-visual-relevant-facts', factsExpected, (value) => validateVisualRelevantBrandFacts(value, prepared));
  if (!visualFacts) {
    visualFacts = await model('01-visual-relevant-facts', buildVisualFactsPrompt(prepared, input.lockedFacts, input.lockedAssets), (value) => validateVisualRelevantBrandFacts(value, prepared), { profile: PROFILE });
    await save('01-visual-relevant-facts', visualFacts, { ...factsExpected, profile: { ...PROFILE, provider: input.provider, modelId: input.modelId }, outputFile: 'runtime-visual-facts.json' });
  }
  const visualBrief = await local('01-visual-brief', () => compileVisualBrief(visualFacts));
  await save('01-visual-brief', visualBrief, { upstreamHash: valueHash(visualFacts), promptVersion: 'visual-brief-compiler-v1', schemaVersion: 'visual-brief-v1', outputFile: '01-Visual-Brief.json' });
  await save('01b-visual-brief-review', compileVisualBriefMarkdown(visualBrief), { upstreamHash: valueHash(visualBrief), promptVersion: 'visual-brief-markdown-v1', schemaVersion: 'visual-brief-markdown-v1', outputFile: '01-Visual-Brief.md' });

  const assetUpstream = valueHash({ visualFacts, observations: input.visualAssetObservations || [] });
  const assetExpected = expected('02-visual-asset-evidence', assetUpstream, VISUAL_ASSET_EVIDENCE_PROMPT_VERSION, 'visual-asset-evidence-v1');
  let visualAssetEvidence = resume('02-visual-asset-evidence', assetExpected, validateVisualAssetEvidence);
  if (!visualAssetEvidence) {
    const observations = Array.isArray(input.visualAssetObservations) ? input.visualAssetObservations : [];
    if (observations.length) {
      visualAssetEvidence = await model('02-visual-asset-evidence', buildVisualAssetEvidencePrompt({ prepared, visualFacts, visualAssetObservations: observations }), validateVisualAssetEvidence, { profile: PROFILE });
    } else {
      visualAssetEvidence = await local('02-visual-asset-evidence', () => validateVisualAssetEvidence({
        logo: [], color: [], typography: [], graphic_assets: [], photography: [], layout: [], packaging_structure: [],
        reusable_assets: [], weak_assets: [], replaceable_assets: [],
        unresolved: ['未提供可观察的关键视觉图片；不根据文字气质推测 Logo、色彩、字体、摄影或版式']
      }));
    }
    await save('02-visual-asset-evidence', visualAssetEvidence, { ...assetExpected, profile: observations.length ? { ...PROFILE, provider: input.provider, modelId: input.modelId } : undefined, outputFile: '02-Visual-Asset-Evidence.json' });
  }
  await save('02b-visual-asset-evidence-review', compileVisualAssetEvidenceMarkdown(visualAssetEvidence), { upstreamHash: valueHash(visualAssetEvidence), promptVersion: 'visual-asset-evidence-markdown-v1', schemaVersion: 'visual-asset-evidence-markdown-v1', outputFile: '02-Visual-Asset-Evidence.md' });
  const visualAssetPipelineStatus = buildVisualAssetPipelineStatus({
    visualAssetEvidence,
    inputProvided: Array.isArray(input.visualAssetObservations) && input.visualAssetObservations.length > 0
  });

  const queryUpstream = valueHash(visualFacts);
  const queryExpected = expected('03a-benchmark-query-compiler', queryUpstream, 'benchmark-query-compiler-v1', 'benchmark-query-plan-v1');
  let benchmarkQueryPlan = resume('03a-benchmark-query-compiler', queryExpected, validateBenchmarkQueryPlan);
  if (!benchmarkQueryPlan) {
    benchmarkQueryPlan = await local('03a-benchmark-query-compiler', () => compileBenchmarkQueryPlan(visualFacts));
    await save('03a-benchmark-query-compiler', benchmarkQueryPlan, { ...queryExpected, outputFile: '03-Benchmark-Query-Plan.json' });
  }

  const retrievalUpstream = valueHash({ benchmarkQueryPlan, seeds: input.benchmarkCases || [] });
  const retrievalExpected = expected('03b-benchmark-retrieval', retrievalUpstream, 'benchmark-retrieval-v2', 'benchmark-retrieval-v2');
  let benchmarkRetrieval = resume('03b-benchmark-retrieval', retrievalExpected, (value) => value);
  if (!benchmarkRetrieval) {
    benchmarkRetrieval = await local('03b-benchmark-retrieval', () => retrieveBenchmarkCases({ queryPlan: benchmarkQueryPlan, retriever: input.benchmarkRetriever, seedCases: input.benchmarkCases, signal: input.abortSignal }));
    await save('03b-benchmark-retrieval', benchmarkRetrieval, { ...retrievalExpected, outputFile: '03-Benchmark-Cases.json' });
  }

  const synthesisUpstream = valueHash({ visualFacts, visualAssetEvidence, benchmarkQueryPlan, benchmarkRetrieval });
  const synthesisExpected = expected('03c-visual-opportunity-synthesis', synthesisUpstream, VISUAL_OPPORTUNITY_SYNTHESIS_PROMPT_VERSION, 'visual-opportunity-synthesis-v1');
  const evidenceIds = new Set(visualFacts.evidence_registry.map((item) => item.evidence_id));
  let visualOpportunitySynthesis = resume('03c-visual-opportunity-synthesis', synthesisExpected, (value) => validateVisualOpportunitySynthesis(value, evidenceIds));
  if (!visualOpportunitySynthesis) {
    visualOpportunitySynthesis = await model('03c-visual-opportunity-synthesis', buildVisualOpportunitySynthesisPrompt({ visualFacts, visualAssetEvidence, benchmarkQueryPlan, benchmarkCases: benchmarkRetrieval.cases }), (value) => validateVisualOpportunitySynthesis(value, evidenceIds), { profile: SYNTHESIS_PROFILE });
    await save('03c-visual-opportunity-synthesis', visualOpportunitySynthesis, { ...synthesisExpected, profile: { ...SYNTHESIS_PROFILE, provider: input.provider, modelId: input.modelId }, outputFile: '04-Visual-Opportunity-Synthesis.json' });
  }
  await save('03d-visual-opportunity-review', compileVisualOpportunityMarkdown(visualOpportunitySynthesis), { upstreamHash: valueHash(visualOpportunitySynthesis), promptVersion: 'visual-opportunity-markdown-v1', schemaVersion: 'visual-opportunity-markdown-v1', outputFile: '04-Visual-Opportunity-Synthesis.md' });

  const step4Context = adaptVisualFactFirstToStep4({ visualFacts, visualAssetEvidence, benchmarkRetrieval, visualOpportunitySynthesis, selectedTouchpoints });
  await save('04-step4-input-context', step4Context, {
    upstreamHash: valueHash({ visualFacts, visualAssetEvidence, benchmarkRetrieval, visualOpportunitySynthesis }),
    promptVersion: 'visual-fact-first-step4-adapter-v3', schemaVersion: 'visual-fact-first-step4-context-v3',
    outputFile: '05-Step4-Input-Context.json'
  });
  const artifactNames = VISUAL_FACT_FIRST_REQUIRED_ARTIFACTS.slice(0, 9);
  const pipelineCompleteness = evaluatePipelineCompleteness({
    artifactNames, visualFacts, benchmarkRetrieval, visualOpportunitySynthesis, step4Context
  });
  return Object.freeze({
    visualBrief, visualFacts, visualAssetEvidence, visualAssetPipelineStatus,
    benchmarkQueryPlan, benchmarkRetrieval, visualOpportunitySynthesis,
    step4Context, evidenceMap: buildCompatibilityEvidenceMap(step4Context),
    signalMap: { pipeline_mode: 'retrieval_first', visual_positioning: step4Context.visual_positioning },
    opportunityMap: visualOpportunitySynthesis,
    pipelineCompleteness,
    artifactNames: Object.freeze(artifactNames)
  });
}
