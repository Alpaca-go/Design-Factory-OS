import crypto from 'node:crypto';
import { BRAND_DNA_V3, STAGE_SEQUENCE } from '../protocol/stage-definitions.js';

export function valueHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildCheckpoint({ projectId, analysisRunId, stageId, documentSetHash, upstreamHash, promptVersion, schemaVersion, profile, outputFile, output, usageRecordIds = [] }) {
  return Object.freeze({
    version: BRAND_DNA_V3.checkpointVersion,
    projectId,
    analysisRunId,
    stageId,
    stageSequence: STAGE_SEQUENCE[stageId],
    documentSetHash,
    upstreamHash,
    protocolVersion: BRAND_DNA_V3.protocolVersion,
    promptVersion,
    schemaVersion,
    provider: profile?.provider || null,
    modelId: profile?.modelId || null,
    thinkingEnabled: profile?.thinking ?? null,
    maxOutputTokens: profile?.maxOutputTokens ?? null,
    outputFile,
    outputHash: valueHash(output),
    validationStatus: 'passed',
    usageRecordIds,
    completedAt: new Date().toISOString()
  });
}

export function canResumeCheckpoint(saved, expected, output) {
  return Boolean(saved
    && saved.version === BRAND_DNA_V3.checkpointVersion
    && saved.protocolVersion === BRAND_DNA_V3.protocolVersion
    && saved.stageId === expected.stageId
    && saved.documentSetHash === expected.documentSetHash
    && saved.upstreamHash === expected.upstreamHash
    && saved.promptVersion === expected.promptVersion
    && saved.schemaVersion === expected.schemaVersion
    && saved.validationStatus === 'passed'
    && saved.outputHash === valueHash(output));
}
