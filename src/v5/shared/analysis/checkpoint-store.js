import crypto from 'node:crypto';

export function valueHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildAnalysisCheckpoint(options) {
  return Object.freeze({
    version: options.checkpointVersion,
    protocolVersion: options.protocolVersion,
    projectId: options.projectId,
    analysisRunId: options.analysisRunId,
    stageId: options.stageId,
    stageSequence: options.stageSequence,
    documentSetHash: options.documentSetHash,
    upstreamHash: options.upstreamHash,
    promptVersion: options.promptVersion,
    schemaVersion: options.schemaVersion,
    provider: options.profile?.provider || null,
    modelId: options.profile?.modelId || null,
    thinkingEnabled: options.profile?.thinking ?? null,
    maxOutputTokens: options.profile?.maxOutputTokens ?? null,
    outputFile: options.outputFile,
    outputHash: valueHash(options.output),
    validationStatus: 'passed',
    completedAt: new Date().toISOString()
  });
}

export function canResumeAnalysisCheckpoint(saved, expected, output) {
  return Boolean(saved
    && saved.version === expected.checkpointVersion
    && saved.protocolVersion === expected.protocolVersion
    && saved.stageId === expected.stageId
    && saved.documentSetHash === expected.documentSetHash
    && saved.upstreamHash === expected.upstreamHash
    && saved.promptVersion === expected.promptVersion
    && saved.schemaVersion === expected.schemaVersion
    && saved.validationStatus === 'passed'
    && saved.outputHash === valueHash(output));
}
