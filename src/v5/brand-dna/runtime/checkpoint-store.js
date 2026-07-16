import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BRAND_DNA_PROTOCOL } from '../protocol-config.js';

export const CHECKPOINT_SCHEMA_VERSION = 'brand-dna-checkpoint-v1';

export function stableJsonHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function sourceHashes(corpus) {
  const documents = (corpus?.documents || []).map((document) => ({
    id: document.id,
    filename: document.filename,
    sha256: document.sha256 || stableJsonHash(document.rawText || ''),
    sourceType: document.sourceType,
    characterCount: document.characterCount
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    sourceDocumentHash: stableJsonHash(documents.map((item) => item.sha256)),
    sourceManifestHash: stableJsonHash(documents)
  };
}

async function atomicWrite(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, filename);
}

function safeName(stageId) {
  return String(stageId).replace(/[^a-z0-9._-]+/gi, '-');
}

export function createBrandDnaCheckpointStore(options) {
  const root = path.resolve(options.root);
  const checkpointDirectory = path.join(root, 'checkpoints');
  const outputDirectory = path.join(root, 'stage-outputs');
  const runStatePath = path.join(root, 'run-state.json');
  const hashes = sourceHashes(options.corpus);

  function filenames(stageId, stageSequence) {
    const prefix = String(stageSequence).padStart(2, '0');
    const base = `${prefix}-${safeName(stageId)}`;
    return {
      checkpoint: path.join(checkpointDirectory, `${base}.checkpoint.json`),
      output: path.join(outputDirectory, `${base}.json`)
    };
  }

  async function saveStage({
    stageId,
    stageSequence,
    upstreamOutputHash,
    promptVersion,
    schemaVersion,
    stageProfile,
    output,
    normalizationWarnings = [],
    usageRecordIds = [],
    startedAt,
    completedAt
  }) {
    const files = filenames(stageId, stageSequence);
    const outputHash = stableJsonHash(output);
    await atomicWrite(files.output, output);
    const checkpoint = {
      version: '1',
      checkpointSchemaVersion: CHECKPOINT_SCHEMA_VERSION,
      analysisRunId: options.analysisRunId,
      projectId: options.projectId,
      stageId,
      stageSequence,
      ...hashes,
      upstreamOutputHash,
      promptVersion,
      schemaVersion,
      protocolVersion: BRAND_DNA_PROTOCOL.protocolVersion,
      provider: options.provider,
      modelId: options.modelId,
      apiProfileId: options.apiProfileId,
      thinkingEnabled: Boolean(stageProfile?.thinking?.enabled),
      thinkingBudgetTokens: stageProfile?.thinking?.budgetTokens ?? null,
      maxOutputTokens: stageProfile?.maxOutputTokens ?? null,
      outputFile: path.relative(root, files.output).replace(/\\/g, '/'),
      outputHash,
      validationStatus: 'passed',
      normalizationWarnings,
      usageRecordIds,
      startedAt,
      completedAt
    };
    await atomicWrite(files.checkpoint, checkpoint);
    return checkpoint;
  }

  async function loadStage({
    stageId,
    stageSequence,
    upstreamOutputHash,
    promptVersion,
    schemaVersion,
    validator
  }) {
    const files = filenames(stageId, stageSequence);
    try {
      const checkpoint = JSON.parse(await fs.readFile(files.checkpoint, 'utf8'));
      const compatible = checkpoint.version === '1'
        && checkpoint.checkpointSchemaVersion === CHECKPOINT_SCHEMA_VERSION
        && checkpoint.stageId === stageId
        && checkpoint.stageSequence === stageSequence
        && checkpoint.sourceDocumentHash === hashes.sourceDocumentHash
        && checkpoint.sourceManifestHash === hashes.sourceManifestHash
        && checkpoint.upstreamOutputHash === upstreamOutputHash
        && checkpoint.promptVersion === promptVersion
        && checkpoint.schemaVersion === schemaVersion
        && checkpoint.protocolVersion === BRAND_DNA_PROTOCOL.protocolVersion
        && checkpoint.provider === options.provider
        && checkpoint.modelId === options.modelId
        && checkpoint.apiProfileId === options.apiProfileId
        && checkpoint.validationStatus === 'passed';
      if (!compatible) return null;
      const output = JSON.parse(await fs.readFile(files.output, 'utf8'));
      if (stableJsonHash(output) !== checkpoint.outputHash) return null;
      const value = validator ? validator(output) : output;
      return { value, checkpoint, output };
    } catch {
      return null;
    }
  }

  async function writeRunState(state) {
    await atomicWrite(runStatePath, {
      ...state,
      updatedAt: new Date().toISOString()
    });
  }

  async function readRunState() {
    try {
      return JSON.parse(await fs.readFile(runStatePath, 'utf8'));
    } catch {
      return null;
    }
  }

  async function clear() {
    const resolved = path.resolve(root);
    if (resolved !== root || !root.endsWith(`${path.sep}brand-dna`)) {
      throw new Error('拒绝清理非 Brand DNA checkpoint 目录。');
    }
    await fs.rm(root, { recursive: true, force: true });
  }

  return {
    root,
    hashes,
    saveStage,
    loadStage,
    writeRunState,
    readRunState,
    clear
  };
}
