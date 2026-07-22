import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

import { createOpenAICompatibleTextReasoner } from '../src/v5/adapters/openai-compatible-text-reasoner.js';
import { runVisualTranslationV2 } from '../src/v5/visual-translation/v2/runtime/run-visual-translation-v2.js';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const { app, safeStorage } = requireDesktop('electron');
const AdmZip = requireDesktop('adm-zip');

const sourceArgument = process.env.MASTERPIECE_SMOKE_DOCUMENT || process.argv[2];
if (!sourceArgument) throw new Error('Usage: electron scripts/real-provider-vff-smoke.mjs <document>');
const sourceFile = path.resolve(sourceArgument);

const userData = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'masterpiece-os-desktop');
app.setPath('userData', userData);

function decodeXml(value) {
  return value.replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&amp;/gu, '&');
}

function parseDocx(filename) {
  const zip = new AdmZip(filename);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) throw new Error('DOCX is missing word/document.xml');
  const xml = entry.getData().toString('utf8');
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)].map((match) =>
    [...match[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)].map((item) => decodeXml(item[1] || '')).join('').trim()
  ).filter(Boolean);
  const rawText = paragraphs.join('\n');
  if (!rawText) throw new Error('No text extracted from DOCX');
  return {
    id: `smoke-${crypto.createHash('sha256').update(filename).digest('hex').slice(0, 12)}`,
    filename: path.basename(filename), sourceType: 'docx', rawText,
    sections: [{ heading: path.parse(filename).name, content: rawText }], characterCount: rawText.length
  };
}

async function main() {
  await app.whenReady();
  const settings = JSON.parse(await fs.readFile(path.join(userData, 'settings.json'), 'utf8'));
  const profile = settings.profiles.find((item) => item.id === settings.defaultProfileId && item.isEnabled)
    || settings.profiles.find((item) => item.isEnabled);
  if (!profile) throw new Error('No enabled API Profile');
  const encrypted = await fs.readFile(path.join(userData, 'credentials', `${profile.id}.bin`));
  const decrypted = await safeStorage.decryptStringAsync(encrypted);
  const apiKey = decrypted?.result || '';
  if (!apiKey) throw new Error('Configured API credential could not be decrypted');

  const document = parseDocx(sourceFile);
  const corpus = { documents: [document], sourceIndex: [], mergedText: document.rawText, warnings: [] };
  const runId = crypto.randomUUID();
  const outputRoot = path.join(os.tmpdir(), `masterpiece-vff-real-smoke-${runId}`);
  await fs.mkdir(path.join(outputRoot, 'checkpoints'), { recursive: true });
  await fs.mkdir(path.join(outputRoot, 'outputs'), { recursive: true });
  const started = Date.now();
  const reasoner = createOpenAICompatibleTextReasoner({ apiKey, model: profile.modelId, provider: profile.provider, baseUrl: profile.baseUrl });
  const result = await runVisualTranslationV2({
    projectId: `real-smoke-${runId}`, analysisRunId: runId, step4RunId: runId,
    corpus, provider: profile.provider, modelId: profile.modelId, reasoner,
    analysisPipelineMode: 'visual_fact_first', lockedFacts: [], lockedAssets: [], checkpoints: {},
    onProgress(stageId) { process.stdout.write(`${JSON.stringify({ event: 'progress', stage: stageId, elapsed_ms: Date.now() - started })}\n`); },
    async onCheckpoint(stageId, payload) {
      await fs.writeFile(path.join(outputRoot, 'checkpoints', `${stageId}.json`), JSON.stringify(payload, null, 2), 'utf8');
      const target = path.join(outputRoot, 'outputs', path.basename(payload.checkpoint.outputFile));
      await fs.writeFile(target, typeof payload.output === 'string' ? payload.output : JSON.stringify(payload.output, null, 2), 'utf8');
    },
    async onModelResponse(stageId, payload) {
      process.stdout.write(`${JSON.stringify({ event: 'model_response', stage: stageId, attempt: payload.attempt, finish_reason: payload.finishReason || null, output_chars: payload.text?.length || 0 })}\n`);
    },
    onStep4Event(event) { process.stdout.write(`${JSON.stringify({ event: event.event, stage: '04-three-creative-directions', elapsed_ms: event.elapsed_ms, received_chars: event.received_chars })}\n`); },
    onStep4Status(status) { process.stdout.write(`${JSON.stringify({ event: 'step4_status', status: status.status, code: status.code || null })}\n`); }
  });
  const reportPath = path.join(outputRoot, 'outputs', result.reportBasename);
  await fs.writeFile(reportPath, result.reportMarkdown, 'utf8');
  const summary = {
    provider: profile.provider, model: profile.modelId, terminal_status: result.status,
    pipeline_mode: result.analysisPipelineMode, model_call_count: result.modelCallCount,
    duration_ms: Date.now() - started, report_path: reportPath,
    composition: result.composition, final_gate_status: result.compiled?.overall_status || null,
    benchmark_status: result.visualFactFirst?.benchmarkRetrieval?.retrieval_status || null
  };
  process.stdout.write(`${JSON.stringify({ event: 'REAL_PROVIDER_SMOKE_COMPLETE', ...summary })}\n`);
}

main().then(() => app.quit()).catch((error) => {
  process.stderr.write(`${JSON.stringify({ event: 'REAL_PROVIDER_SMOKE_FAILED', code: error.code || error.name, message: error.message, stage: error.stageId || null })}\n`);
  app.exitCode = 1;
  app.quit();
});
