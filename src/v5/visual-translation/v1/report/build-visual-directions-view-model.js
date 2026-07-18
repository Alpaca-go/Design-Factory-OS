import { VISUAL_TRANSLATION_V1 } from '../protocol/stage-registry.js';

export function buildVisualDirectionsViewModel(result) {
  const recommendation = result.recommendation;
  const recommended = result.directions.directions.find((item) => item.directionId === recommendation.recommendedDirectionId);
  const evidenceById = new Map(result.evidenceMap.evidence.map((item) => [item.evidenceId, item]));
  const sourceById = new Map(result.prepared.sourceDocuments.map((item) => [item.sourceId, item]));
  return Object.freeze({
    protocol: {
      protocolVersion: VISUAL_TRANSLATION_V1.protocolVersion,
      reportVersion: VISUAL_TRANSLATION_V1.directionsReportVersion,
      status: 'completed-directions'
    },
    identity: result.evidenceMap.identity,
    boundaries: {
      lockedAssets: result.evidenceMap.lockedAssets,
      suggestedAssets: result.evidenceMap.suggestedAssets,
      conflicts: result.evidenceMap.conflicts,
      missingInformation: result.evidenceMap.missingInformation
    },
    signals: result.signalMap.signals,
    opportunities: result.opportunityMap,
    directions: result.directions.directions,
    recommendation,
    recommended,
    evidenceIndex: result.evidenceMap.evidence.map((item) => ({
      ...item,
      sourceFile: sourceById.get(item.sourceId)?.originalFileName || item.sourceId
    })),
    metadata: {
      documentSetHash: result.prepared.documentSetHash,
      sourceFiles: result.prepared.sourceDocuments.map((item) => item.originalFileName),
      modelCallCount: result.metrics.filter((item) => item.kind === 'model').length,
      durationMs: result.metrics.reduce((sum, item) => sum + (item.durationMs || 0), 0),
      models: [...new Set(result.metrics.map((item) => item.modelId).filter(Boolean))],
      usage: result.metrics.reduce((summary, item) => ({
        inputTokens: summary.inputTokens + (item.usage?.inputTokens || 0),
        outputTokens: summary.outputTokens + (item.usage?.outputTokens || 0)
      }), { inputTokens: 0, outputTokens: 0 })
    },
    evidenceById
  });
}
