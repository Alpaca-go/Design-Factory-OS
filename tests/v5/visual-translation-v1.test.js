import test from 'node:test';
import assert from 'node:assert/strict';
import { runVisualTranslationV1 } from '../../src/v5/visual-translation/v1/index.js';
import { validateVisualCreativeDirections } from '../../src/v5/visual-translation/v1/schemas/visual-creative-directions-v1.js';
import { groundEvidenceQuote, resolveGroundedQuote, validateVisualEvidenceMap } from '../../src/v5/visual-translation/v1/schemas/visual-evidence-map-v1.js';
import { parseStructuredResponse } from '../../src/v5/shared/analysis/response-parser.js';
import { createOpenAICompatibleTextReasoner } from '../../src/v5/adapters/openai-compatible-text-reasoner.js';
import { audienceBoundary, corpus, directionsOutput, evidenceOutput, mockReasoner, signalOpportunityOutput } from './helpers/visual-translation-phase35-fixtures.js';

test('Sprint 1 runs three model stages, compiles a visual-first directions report and saves checkpoints', async () => {
  const mock = mockReasoner(); const checkpoints = {};
  const result = await runVisualTranslationV1({ projectId: 'project-1', corpus, reasoner: mock.reasoner, provider: 'mock', modelId: 'mock-visual-model', reportMode: 'full', onCheckpoint(stage, value) { checkpoints[stage] = structuredClone(value); } });
  assert.equal(result.modelCallCount, 3);
  assert.deepEqual(mock.calls.map((item) => item.stage), ['01-visual-evidence', '02-visual-signal-opportunity', '04-three-creative-directions']);
  assert.equal(result.directions.directions.length, 3);
  assert.equal(result.recommendation.humanSelectionRequired, true);
  assert.equal(result.status, 'completed-directions');
  assert.ok(result.composition.visualRatio >= 0.65);
  assert.match(result.reportMarkdown, /六类视觉策略信号/);
  assert.match(result.reportMarkdown, /方向语义差异矩阵/);
  assert.match(result.reportMarkdown, /基础分/);
  assert.ok(checkpoints['10-local-report-compiler'].checkpoint.outputHash);
});

test('valid Visual Translation checkpoints resume without another model call', async () => {
  const first = mockReasoner(); const checkpoints = {};
  await runVisualTranslationV1({ projectId: 'project-1', corpus, reasoner: first.reasoner, provider: 'mock', modelId: 'mock-visual-model', reportMode: 'full', onCheckpoint(stage, value) { checkpoints[stage] = structuredClone(value); } });
  let calls = 0;
  const result = await runVisualTranslationV1({ projectId: 'project-1', corpus, checkpoints, reasoner: async () => { calls += 1; throw new Error('should not run'); }, provider: 'mock', modelId: 'mock-visual-model', reportMode: 'full' });
  assert.equal(calls, 0);
  assert.equal(result.modelCallCount, 0);
  assert.ok(result.metrics.some((item) => item.stageId === '04-three-creative-directions' && item.resumed));
});

test('evidence schema failure gets one bounded model repair retry', async () => {
  let evidenceAttempts = 0;
  const reasoner = async (messages) => {
    const content = messages.map((message) => message.content).join('\n');
    const stage = content.match(/PROTOCOL_STAGE=([^\n]+)/)?.[1];
    const chunkId = content.match(/"chunkId":"([^"]+)"/)?.[1];
    if (stage === '01-visual-evidence') {
      evidenceAttempts += 1;
      const output = evidenceOutput(chunkId);
      if (evidenceAttempts === 1) output.visualEvidenceMap.evidence[0].type = 'unsupported-type';
      return { provider: 'mock', model: 'mock', text: JSON.stringify(output) };
    }
    return { provider: 'mock', model: 'mock', text: JSON.stringify(stage === '02-visual-signal-opportunity' ? signalOpportunityOutput() : directionsOutput()) };
  };
  const result = await runVisualTranslationV1({ projectId: 'retry-project', corpus, reasoner, provider: 'mock', modelId: 'mock', reportMode: 'full' });
  assert.equal(evidenceAttempts, 2);
  assert.equal(result.modelCallCount, 4);
  assert.ok(result.metrics.some((metric) => metric.kind === 'model-retry' && metric.stageId === '01-visual-evidence'));
});

test('direction validator rejects cosmetic variants under the six-dimension matrix', () => {
  const evidence = validateVisualEvidenceMap(evidenceOutput('doc-1-chunk-001'), {
    sourceDocuments: [{ sourceId: 'doc-1' }], chunks: [{ sourceId: 'doc-1', chunkId: 'doc-1-chunk-001', text: corpus.mergedText }]
  });
  const signalMap = { signals: signalOpportunityOutput().visualStrategySignalMap.signals.map((item, index) => ({ ...item, signalId: `VS${String(index + 1).padStart(2, '0')}` })) };
  const output = directionsOutput();
  const pair = output.visualCreativeDirections.differenceMatrix.pairs[0];
  pair.dimensions.forEach((dimension, index) => { dimension.score = index < 3 ? 0 : 1; dimension.reason = `Both directions remain semantically close in ${dimension.name}`; });
  pair.total_score = 3;
  pair.status = 'needs_rewrite';
  assert.throws(() => validateVisualCreativeDirections(output, { evidenceMap: evidence, signalMap }), (error) => error.code === 'DIRECTIONS_NOT_DISTINCT' && error.repairDirectionIds.includes('D02'));
});

test('structured response parser accepts fenced JSON with a trailing comma', () => {
  assert.deepEqual(parseStructuredResponse('```json\n{"ok":true,}\n```'), { ok: true });
});

test('structured response parser repairs missing commas between object elements in arrays', () => {
  const raw = '{"items":[{"a":1}{"b":2}]}';
  assert.deepEqual(parseStructuredResponse(raw), { items: [{ a: 1 }, { b: 2 }] });
});

test('structured response parser repairs missing commas between object properties', () => {
  const raw = '{"a":1 "b":2}';
  assert.deepEqual(parseStructuredResponse(raw), { a: 1, b: 2 });
});

test('structured response parser repairs missing commas between string elements in arrays', () => {
  const raw = '{"items":["a" "b" "c"]}';
  assert.deepEqual(parseStructuredResponse(raw), { items: ['a', 'b', 'c'] });
});

test('structured response parser does NOT repair inside string literals', () => {
  const raw = '{"msg":"a}  {b"}';
  assert.deepEqual(parseStructuredResponse(raw), { msg: 'a}  {b' });
});

test('structured response parser safely closes complete containers truncated at EOF', () => {
  const parsed = parseStructuredResponse('{"corrections":[{"path":"x","value":[{"asset_type":"graphic_asset"}]}');
  assert.deepEqual(parsed, {
    corrections: [{ path: 'x', value: [{ asset_type: 'graphic_asset' }] }]
  });
});

test('structured response parser does not invent an unterminated string value', () => {
  assert.throws(
    () => parseStructuredResponse('{"corrections":[{"path":"x","value":"unfinished'),
    (error) => error.code === 'FAILED_SCHEMA'
  );
});

test('evidence quote grounding recovers punctuation and spacing but rejects paraphrases', () => {
  const chunk = 'Jiuzhou Aesthetics — a B2B industry platform.';
  assert.equal(resolveGroundedQuote('Jiuzhou Aesthetics', chunk), 'Jiuzhou Aesthetics');
  assert.equal(resolveGroundedQuote('consumer skincare brand', chunk), null);
});

test('evidence quote grounding deterministically replaces a paraphrase with an exact source sentence', () => {
  const prepared = { sourceDocuments: [{ sourceId: 'doc-1' }, { sourceId: 'doc-2' }], chunks: [
    { sourceId: 'doc-1', chunkId: 'chunk-1', text: 'The market is growing.' },
    { sourceId: 'doc-2', chunkId: 'chunk-2', text: 'Transparent fulfillment creates long-term trust.' }
  ] };
  const grounded = groundEvidenceQuote({ requestedQuote: 'transparent delivery builds trust', statement: 'Transparent fulfillment creates trust', sourceId: 'doc-1', chunkId: 'chunk-1' }, prepared);
  assert.equal(grounded.sourceId, 'doc-2');
  assert.ok(prepared.chunks[1].text.includes(grounded.shortestQuote));
});

test('text reasoner sends text-only messages and applies stage thinking controls', async () => {
  const requests = [];
  const reasoner = createOpenAICompatibleTextReasoner({ apiKey: 'secret-key', model: 'qwen-test', provider: 'qwen', baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', client: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'r1', model: 'qwen-test', choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
  } });
  const result = await reasoner([{ role: 'user', content: 'document text' }], { enableThinking: true, thinkingBudget: 2048, maxOutputTokens: 6000 });
  assert.equal(requests[0].enable_thinking, true);
  assert.equal(requests[0].thinking_budget, 2048);
  assert.equal(requests[0].max_tokens, 6000);
  assert.ok(requests[0].messages.every((message) => typeof message.content === 'string'));
  assert.equal(result.usage.inputTokens, 10);
});

test('text reasoner exposes truncated output before structured parsing', async () => {
  const reasoner = createOpenAICompatibleTextReasoner({ apiKey: 'secret-key', model: 'limited', baseUrl: 'https://example.test/v1', client: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{"broken":' } }] }) }) });
  await assert.rejects(reasoner([{ role: 'user', content: 'test' }]), (error) => error.code === 'OUTPUT_TRUNCATED');
});
