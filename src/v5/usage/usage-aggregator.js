function sumNullable(records, key) {
  return records.reduce((sum, record) => (
    record[key] === null || record[key] === undefined ? sum : sum + Number(record[key])
  ), 0);
}

export function aggregateUsageRecords(records) {
  const items = [...(records || [])];
  const withUsage = items.filter((record) => record.usageSource !== 'missing');
  const usageCompleteness = !withUsage.length
    ? 'missing'
    : withUsage.length === items.length && withUsage.every((record) => record.usageSource === 'provider')
      ? 'complete'
      : 'partial';
  const currencies = new Set(items.map((record) => record.currency).filter(Boolean));
  return Object.freeze({
    analysisRunId: items[0]?.analysisRunId || '',
    projectId: items[0]?.projectId || null,
    projectName: items[0]?.projectNameSnapshot || null,
    analysisMode: items[0]?.analysisMode || 'unknown',
    modelCallCount: items.length,
    successfulCallCount: items.filter((record) => record.status === 'success').length,
    failedCallCount: items.filter((record) => record.status === 'failed' || record.status === 'timeout').length,
    cancelledCallCount: items.filter((record) => record.status === 'cancelled').length,
    retryCallCount: items.filter((record) => record.attemptNumber > 1 || record.parentCallId).length,
    pricedCallCount: items.filter((record) => record.costEstimateStatus === 'calculated').length,
    unpricedCallCount: items.filter((record) => (
      record.usageSource !== 'missing' && record.costEstimateStatus !== 'calculated'
    )).length,
    totalInputTokens: sumNullable(items, 'inputTokens'),
    totalOutputTokens: sumNullable(items, 'outputTokens'),
    totalTokens: sumNullable(items, 'totalTokens'),
    totalCachedInputTokens: sumNullable(items, 'cachedInputTokens'),
    totalReasoningTokens: sumNullable(items, 'reasoningTokens'),
    estimatedCostMicros: sumNullable(items, 'estimatedCostMicros'),
    currency: currencies.size === 1 ? [...currencies][0] : currencies.size ? 'MIXED' : '',
    usageCompleteness,
    startedAt: items.map((record) => record.startedAt).sort()[0] || '',
    completedAt: items.every((record) => record.completedAt)
      ? items.map((record) => record.completedAt).filter(Boolean).sort().at(-1) || null
      : null
  });
}
