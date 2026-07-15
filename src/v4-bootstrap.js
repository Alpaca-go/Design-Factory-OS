import fs from 'node:fs/promises';
import path from 'node:path';
import { inventoryProjectWithTrace } from './inventory.js';
import { loadProjectBrief } from './project-brief.js';
import { readJson, ensureDir, writeText } from './utils.js';
import { normalizeMode } from './pipeline.js';
import { runBrandUnderstandingProvider } from './brand-understanding-provider.js';
import { runIndustryBenchmarkProvider } from './industry-benchmark-provider.js';
import { buildCreativeDecisionIRWithTrace } from './creative-decision-ir-builder.js';
import {
  activateCreativeDecisionStateWithTrace,
  readCreativeDecisionState
} from './creative-decision-state-store.js';
import { compileCreativeDecisionState } from './compiler-pipeline.js';
import { createPerformanceProfiler } from './performance-profiler.js';
import { runtimeTraceFromError } from './runtime-trace.js';
import { createHandoffTiming, publishValidationReport } from './validation-report.js';

export const V4_PIPELINE_ID = 'masterpiece-os-v4-pipeline';
export const V4_STANDARD_OUTPUT_FILES = Object.freeze([
  '01-Analysis.md',
  '02-Creative-Brief.md',
  '03-Design-Decisions.md',
  '04-Design-Review.md'
]);
export const V4_QUICK_OUTPUT_FILES = Object.freeze(['02-Creative-Brief.md']);

const RETIRED_OUTPUTS = Object.freeze([
  '01-项目分析报告.md', '02-Chat生图任务包.md', '03-Knowledge-Review.md',
  '03-Decision-Log.md', 'Creative-Brief-GPT.md', '02-Creative-Brief-GPT.md'
]);

function inferProjectRoot(input, options) {
  if (options.projectRoot) return path.resolve(options.projectRoot);
  const root = path.resolve(input);
  return path.basename(root).toLowerCase() === 'input' ? path.dirname(root) : root;
}

function lineList(items, formatter = (item) => item, empty = '无') {
  return items?.length ? items.map((item) => `- ${formatter(item)}`).join('\n') : `- ${empty}`;
}

function stateHeader(title, state) {
  return [
    `# ${title}`,
    '',
    '> Masterpiece OS v4.0',
    `> Decision ID: ${state.meta.decisionId}`,
    `> State Digest: ${state.meta.stateDigest}`,
    ''
  ].join('\n');
}

function renderAnalysis(state, brandUnderstanding, industryBenchmark) {
  const assessment = state.brand.currentVisualAssessment;
  const freedom = state.strategy.creativeFreedom;
  const evidence = state.provenance.evidenceIndex;
  return `${stateHeader('Analysis', state)}
## Brand Understanding

### Original Intent

${state.brand.originalIntent.statement}

### Brand Identity

${state.brand.identity.statement}

### Positioning

${state.brand.positioning.statement}

### Current Visual Assessment

${assessment.summary}

- Maturity: ${assessment.maturity}
- Strengths: ${assessment.strengths.join('、')}
- Weaknesses: ${assessment.weaknesses.join('、')}
- Outdated Areas: ${assessment.outdatedAreas.join('、')}
- Visual Inspection: ${brandUnderstanding.visualInspection.inspectedImages.length}/${brandUnderstanding.visualInspection.inspectedImages.length}

## Industry Benchmark

### Same-category Cases

${lineList(industryBenchmark.cases, (item) => `[${item.name}](${item.url})：${item.relevance}`)}

### Observations

${lineList(industryBenchmark.observations)}

### Opportunities

${lineList(industryBenchmark.opportunities)}

## Creative Decision

${state.decisionRecord.statement}

### Creative Freedom

- Recommended: ${freedom.recommendation.freedom}% / ${freedom.recommendation.mode}
- Confidence: ${freedom.recommendation.confidence}
- Effective: ${freedom.effective.freedom === null ? '—' : `${freedom.effective.freedom}%`} / ${freedom.effective.mode}

${lineList(freedom.recommendation.why)}

### Rationale

${lineList(state.decisionRecord.rationale, (item) => item.statement)}

### Tradeoffs

${lineList(state.decisionRecord.tradeoffs, (item) => item.statement)}

### Rejected Directions

${lineList(state.decisionRecord.rejectedDirections, (item) => item.statement)}

## Evidence Index

${lineList(evidence, (item) => `${item.evidenceId} — ${item.summary} (${item.locator})`)}

## Governance

- State: ${state.meta.status}
- Readiness: ${state.governance.readiness}
- Brand DNA Approval: ${state.governance.approvals.brandDNA.status}
- Creative Decision Approval: ${state.governance.approvals.creativeDecision.status}
- Blockers: ${state.governance.blockers.length}
`;
}

function reviewCompilation(state, compilation, profiler) {
  return profiler.syncStage('designReview', () => {
  const envelopes = [
    compilation.creativeFreedom,
    compilation.creativeStrategy,
    compilation.designConstraints,
    compilation.creativeBrief,
    compilation.designDecisions
  ];
  const identityReady = envelopes.every((item) => (
    item.decisionId === state.meta.decisionId && item.stateDigest === state.meta.stateDigest
  ));
  const brief = compilation.creativeBrief.creativeBrief;
  const checks = [
    {
      check: 'Active State',
      passed: state.meta.status === 'approved' && state.governance.readiness === 'release-ready',
      evidence: `${state.meta.status} / ${state.governance.readiness}`
    },
    {
      check: 'Single Source Identity',
      passed: identityReady,
      evidence: '五个 Compiler 使用相同 decisionId 与 stateDigest'
    },
    {
      check: 'Compiler Stage Order',
      passed: compilation.stageOrder.join('|') === 'creativeFreedom|creativeStrategy|designConstraints|creativeBrief|designDecisions',
      evidence: compilation.stageOrder.join(' → ')
    },
    {
      check: 'Creative Brief Contract',
      passed: brief.sections.length === 10 && brief.sectionOrder.length === 10,
      evidence: `${brief.sections.length} sections / ${brief.characterCount} characters`
    },
    {
      check: 'Three-state Model',
      passed: ['locked', 'evolve', 'flexible'].every((key) => key in compilation.designConstraints.groups),
      evidence: 'locked / evolve / flexible'
    },
    {
      check: 'Runtime Brief Persistence',
      passed: compilation.creativeBrief.runtimeGptBrief.persistence === 'forbidden',
      evidence: 'Runtime GPT Brief 仅保留在内存'
    },
    {
      check: 'Blockers',
      passed: state.governance.blockers.length === 0,
      evidence: `${state.governance.blockers.length} blockers`
    }
  ];
  return {
    status: checks.every((item) => item.passed) ? 'PASS' : 'FAIL',
    checks
  };
  }, {
    label: 'Design Review',
    provider: 'review',
    inputCount: 5,
    resultDetails: () => ({ outputCount: 1 })
  });
}

function renderReview(state, review) {
  const rows = review.checks.map((item) => (
    `| ${item.check} | ${item.passed ? 'PASS' : 'FAIL'} | ${String(item.evidence).replace(/\|/g, '\\|')} |`
  )).join('\n');
  return `${stateHeader('Design Review', state)}
## Overall

${review.status}

## Deterministic Architecture Checks

| Check | Result | Evidence |
|---|---|---|
${rows}

## Output Boundary

- Analysis、Creative Brief、Design Decisions 与 Design Review 使用同一 Active State。
- Review 不调用 GPT、不联网、不修改 State。
- Runtime GPT Brief 未持久化为第五个正式文件。
`;
}

async function removeEmptyDebugDir(output) {
  const debugDir = path.join(output, 'debug');
  try {
    if ((await fs.readdir(debugDir)).length === 0) await fs.rmdir(debugDir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function publishOutputs(result, output, profiler, options = {}) {
  return profiler.asyncStage('outputPublishing', async () => {
    await ensureDir(output);
    for (const name of [...new Set([...RETIRED_OUTPUTS, ...V4_STANDARD_OUTPUT_FILES])]) {
      await fs.rm(path.join(output, name), { force: true });
    }
    await fs.rm(path.join(output, 'Creative-Brief-GPT.md'), { force: true });
    if (!options.debug) await fs.rm(path.join(output, 'masterpiece-os-result.json'), { force: true });
    if (!options.performanceJson) {
      await fs.rm(path.join(output, 'debug', 'performance.json'), { force: true });
      await removeEmptyDebugDir(output);
    }

    const documents = {
      '01-Analysis.md': renderAnalysis(result.state, result.brandUnderstanding, result.industryBenchmark),
      '02-Creative-Brief.md': result.compilation.creativeBrief.creativeBrief.markdown,
      '03-Design-Decisions.md': result.compilation.designDecisions.markdown,
      '04-Design-Review.md': renderReview(result.state, result.review)
    };
    const names = result.mode === 'quick' ? V4_QUICK_OUTPUT_FILES : V4_STANDARD_OUTPUT_FILES;
    for (const name of names) await writeText(path.join(output, name), documents[name]);
    return names;
  }, {
    label: 'Output Publishing',
    provider: 'filesystem',
    inputCount: result.mode === 'quick' ? 1 : 4,
    resultDetails: (names) => ({ outputCount: names.length, metrics: { fileReads: 0, retries: 0 } })
  });
}

async function publishDebugArtifacts(result, output, options = {}) {
  if (options.performanceJson) {
    await writeText(path.join(output, 'debug', 'performance.json'), `${JSON.stringify(result.performance, null, 2)}\n`);
  }
  if (options.debug) {
    const debugResult = {
      ...result,
      compilation: {
        ...result.compilation,
        creativeBrief: {
          ...result.compilation.creativeBrief,
          runtimeGptBrief: {
            ...result.compilation.creativeBrief.runtimeGptBrief,
            content: '[runtime-only content omitted from persistence]'
          }
        }
      }
    };
    await writeText(path.join(output, 'masterpiece-os-result.json'), `${JSON.stringify(debugResult, null, 2)}\n`);
  }
}

/** Run the approved v4 reasoning → State → Compiler → Outputs pipeline. */
export async function runV4Pipeline(input, options = {}) {
  const profiler = createPerformanceProfiler(options.performanceThresholds || {});
  const root = path.resolve(input);
  const projectRoot = inferProjectRoot(root, options);
  const output = path.resolve(options.output || path.join(projectRoot, 'outputs'));
  const configPath = options.config ? path.resolve(options.config) : path.join(projectRoot, 'masterpiece-os.json');
  const performanceJson = Boolean(options.debug || options.profile);
  let mode = null;

  try {
    const inventoryExecution = await inventoryProjectWithTrace(root, {
      ignore: [options.outputName || 'outputs', 'masterpiece-os-output', '.masterpiece-os'],
      ignorePaths: [output]
    });
    profiler.add(inventoryExecution.runtimeTrace);
    const inventory = inventoryExecution.inventory;
    const projectBrief = await loadProjectBrief(root, { ...options, projectRoot });
    const config = await readJson(configPath, {});
    mode = normalizeMode(options.mode || projectBrief.defaultMode);
    const currentState = await readCreativeDecisionState(projectRoot);

    const brandUnderstanding = await runBrandUnderstandingProvider(
      { inventory, projectBrief, config, projectRoot },
      { reasoner: options.brandUnderstandingReasoner }
    );
    profiler.add(brandUnderstanding.runtimeTrace);

    const industryBenchmark = await runIndustryBenchmarkProvider(
      { brandUnderstanding, projectBrief, config, projectRoot },
      { reasoner: options.industryBenchmarkReasoner }
    );
    profiler.add(industryBenchmark.runtimeTrace);

    const decisionExecution = await buildCreativeDecisionIRWithTrace(
      { inventory, projectBrief, config, projectRoot, brandUnderstanding, industryBenchmark, currentState },
      { reasoner: options.creativeDecisionReasoner }
    );
    profiler.add(decisionExecution.runtimeTrace);

    const activationExecution = await activateCreativeDecisionStateWithTrace(projectRoot, decisionExecution.state);
    profiler.add(activationExecution.runtimeTrace);
    const stateActivation = activationExecution.stateActivation;

    const compilation = compileCreativeDecisionState(stateActivation.state, { profiler });
    const review = reviewCompilation(stateActivation.state, compilation, profiler);
    const result = {
      version: '4.0.0',
      pipelineId: V4_PIPELINE_ID,
      mode,
      generatedAt: new Date().toISOString(),
      configPath,
      projectBrief,
      inventory,
      brandUnderstanding,
      industryBenchmark,
      state: stateActivation.state,
      stateActivation,
      compilation,
      runtimeGptBrief: compilation.creativeBrief.runtimeGptBrief,
      review
    };
    result.outputFiles = await publishOutputs(result, output, profiler, {
      debug: Boolean(options.debug),
      performanceJson
    });
    result.performance = profiler.snapshot({
      project: path.basename(projectRoot),
      decisionId: stateActivation.state.meta.decisionId,
      mode,
      model: stateActivation.state.provenance.reasoningRuns.creativeDecision.model,
      provider: stateActivation.state.provenance.reasoningRuns.creativeDecision.provider,
      inputImages: inventory.imageCount,
      publicNetworkRequests: industryBenchmark.publicNetworkRequests ?? null,
      schemaValidationFailures: 0
    });
    result.durationMs = result.performance.totalDurationMs;
    result.handoff = createHandoffTiming(result.performance);
    if (projectBrief.requirements.validationReport) {
      result.validationReport = await publishValidationReport(result, output, {
        projectRoot,
        projectName: path.basename(projectRoot),
        performanceTarget: projectBrief.requirements.performanceTarget
      });
    }
    await publishDebugArtifacts(result, output, {
      debug: Boolean(options.debug),
      performanceJson
    });
    return { result, output };
  } catch (error) {
    const failedTrace = profiler.addFromError(error) || runtimeTraceFromError(error);
    profiler.blockAfter(failedTrace?.stage || 'readAssets', error);
    const performance = profiler.snapshot({
      project: path.basename(projectRoot),
      mode,
      failed: true,
      failureStage: failedTrace?.stage || null,
      errorCode: error?.code || error?.name || 'PIPELINE_FAILED'
    });
    Object.defineProperty(error, 'performance', { value: performance, configurable: true });
    if (performanceJson) {
      await writeText(path.join(output, 'debug', 'performance.json'), `${JSON.stringify(performance, null, 2)}\n`).catch(() => {});
    }
    throw error;
  }
}
