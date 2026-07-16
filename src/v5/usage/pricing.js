function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesPattern(value, pattern) {
  const normalizedPattern = normalize(pattern);
  if (!normalizedPattern || normalizedPattern === '*') return true;
  const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`, 'i').test(String(value || ''));
}

function activeAt(rule, timestamp) {
  const callTime = Date.parse(timestamp);
  const start = Date.parse(rule.effectiveFrom);
  const end = rule.effectiveTo ? Date.parse(rule.effectiveTo) : Infinity;
  return Number.isFinite(callTime) && Number.isFinite(start) && callTime >= start && callTime <= end;
}

function inputTierMatches(rule, inputTokens) {
  if (inputTokens === null || inputTokens === undefined) {
    return rule.minInputTokensExclusive == null && rule.maxInputTokensInclusive == null;
  }
  return (rule.minInputTokensExclusive == null || inputTokens > rule.minInputTokensExclusive)
    && (rule.maxInputTokensInclusive == null || inputTokens <= rule.maxInputTokensInclusive);
}

function specificity(rule, context) {
  let score = normalize(rule.modelPattern) === normalize(context.modelId) ? 8 : 0;
  if (rule.region) score += normalize(rule.region) === normalize(context.region) ? 4 : -100;
  if (rule.protocol) score += normalize(rule.protocol) === normalize(context.protocol) ? 2 : -100;
  if (rule.minInputTokensExclusive != null || rule.maxInputTokensInclusive != null) score += 1;
  return score;
}

export function matchPricingRule(rules, context) {
  return [...(rules || [])]
    .filter((rule) => rule?.isEnabled !== false)
    .filter((rule) => normalize(rule.provider) === normalize(context.provider))
    .filter((rule) => matchesPattern(context.modelId, rule.modelPattern))
    .filter((rule) => activeAt(rule, context.startedAt))
    .filter((rule) => inputTierMatches(rule, context.inputTokens))
    .map((rule) => ({ rule, score: specificity(rule, context) }))
    .filter((item) => item.score >= 0)
    .sort((first, second) => (
      second.score - first.score
      || Date.parse(second.rule.effectiveFrom) - Date.parse(first.rule.effectiveFrom)
      || String(first.rule.id).localeCompare(String(second.rule.id))
    ))[0]?.rule || null;
}

function asBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  throw new Error('价格规则必须使用非负整数微单位');
}

function roundedDivide(value, divisor) {
  return (value + divisor / 2n) / divisor;
}

export function pricingSnapshot(rule) {
  if (!rule) return null;
  return Object.freeze({
    ...rule,
    inputPricePerMillionMicros: String(rule.inputPricePerMillionMicros),
    outputPricePerMillionMicros: String(rule.outputPricePerMillionMicros)
  });
}

export function calculateEstimatedCost(usage, rule) {
  if (!usage || usage.usageSource === 'missing') {
    return Object.freeze({
      estimatedCostMicros: null,
      currency: null,
      costEstimateStatus: 'usage-missing',
      warnings: []
    });
  }
  if (!rule) {
    return Object.freeze({
      estimatedCostMicros: null,
      currency: null,
      costEstimateStatus: 'pricing-rule-missing',
      warnings: []
    });
  }
  if (usage.inputTokens === null || usage.outputTokens === null) {
    return Object.freeze({
      estimatedCostMicros: null,
      currency: rule.currency,
      costEstimateStatus: 'unsupported',
      warnings: ['缺少输入或输出 Token，无法生成可靠价格预估']
    });
  }
  const warnings = [];
  const inputTokens = BigInt(Math.max(0, usage.inputTokens));
  const outputTokens = BigInt(Math.max(0, usage.outputTokens));
  const reportedCached = BigInt(Math.max(0, usage.cachedInputTokens || 0));
  const cachedTokens = reportedCached > inputTokens ? inputTokens : reportedCached;
  if (reportedCached > inputTokens) warnings.push('缓存 Token 大于输入 Token，已按输入 Token 截断');
  const standardInputTokens = inputTokens - cachedTokens;
  const inputPrice = asBigInt(rule.inputPricePerMillionMicros);
  const outputPrice = asBigInt(rule.outputPricePerMillionMicros);
  const cachedMultiplier = BigInt(rule.cachedInputMultiplierPpm ?? 1_000_000);
  const standardInputCost = roundedDivide(standardInputTokens * inputPrice, 1_000_000n);
  const cachedInputCost = roundedDivide(
    cachedTokens * inputPrice * cachedMultiplier,
    1_000_000n * 1_000_000n
  );
  const outputCost = roundedDivide(outputTokens * outputPrice, 1_000_000n);
  const estimatedCostMicros = standardInputCost + cachedInputCost + outputCost;
  if (estimatedCostMicros > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('费用预估超过安全整数范围');
  return Object.freeze({
    estimatedCostMicros: Number(estimatedCostMicros),
    currency: rule.currency,
    costEstimateStatus: 'calculated',
    warnings
  });
}
