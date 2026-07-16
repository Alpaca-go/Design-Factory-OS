import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import type {
  AnalysisRunUsageSummary,
  ModelUsageRecord,
  MonthlyUsageSummary,
  NormalizedModelUsage,
  PricingRule,
  SavePricingRuleInput,
  UsageRecordPage,
  UsageRecordQuery
} from '../shared/types';

// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { aggregateUsageRecords } from '../../../../src/v5/usage/usage-aggregator.js';
// @ts-ignore JavaScript core module intentionally has no TypeScript declaration file.
import { calculateEstimatedCost, matchPricingRule, pricingSnapshot } from '../../../../src/v5/usage/pricing.js';

const MIGRATION = `
CREATE TABLE IF NOT EXISTS model_usage_records (
  id TEXT PRIMARY KEY,
  analysis_run_id TEXT NOT NULL,
  project_id TEXT,
  project_name_snapshot TEXT,
  analysis_mode TEXT NOT NULL,
  pipeline_stage TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  parent_call_id TEXT,
  api_profile_id TEXT NOT NULL,
  api_profile_name_snapshot TEXT NOT NULL,
  provider TEXT NOT NULL,
  protocol TEXT NOT NULL,
  region TEXT,
  model_id TEXT NOT NULL,
  local_request_id TEXT NOT NULL,
  provider_request_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  first_token_duration_ms INTEGER,
  status TEXT NOT NULL,
  http_status INTEGER,
  error_code TEXT,
  error_category TEXT,
  finish_reason TEXT,
  thinking_enabled INTEGER,
  thinking_budget_tokens INTEGER,
  structured_output_mode TEXT,
  max_output_tokens INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cached_input_tokens INTEGER,
  reasoning_tokens INTEGER,
  text_input_tokens INTEGER,
  image_input_tokens INTEGER,
  video_input_tokens INTEGER,
  audio_input_tokens INTEGER,
  text_output_tokens INTEGER,
  audio_output_tokens INTEGER,
  usage_source TEXT NOT NULL,
  pricing_rule_id TEXT,
  pricing_snapshot_json TEXT,
  estimated_cost_micros INTEGER,
  currency TEXT,
  cost_estimate_status TEXT NOT NULL,
  provider_raw_usage_json TEXT,
  validation_warnings_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_analysis_run ON model_usage_records(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_usage_project ON model_usage_records(project_id);
CREATE INDEX IF NOT EXISTS idx_usage_model ON model_usage_records(model_id);
CREATE INDEX IF NOT EXISTS idx_usage_provider ON model_usage_records(provider);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON model_usage_records(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_pipeline_stage ON model_usage_records(pipeline_stage);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_pattern TEXT NOT NULL,
  region TEXT,
  protocol TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  currency TEXT NOT NULL,
  min_input_tokens_exclusive INTEGER,
  max_input_tokens_inclusive INTEGER,
  input_price_per_million_micros TEXT NOT NULL,
  output_price_per_million_micros TEXT NOT NULL,
  cached_input_multiplier_ppm INTEGER,
  batch_multiplier_ppm INTEGER,
  source_name TEXT,
  source_updated_at TEXT,
  notes TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pricing_match
ON pricing_rules(provider, model_pattern, effective_from, effective_to);
`;
const SCHEMA_VERSION = 2;

type Row = Record<string, SQLOutputValue>;

function nullableNumber(value: SQLOutputValue | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function nullableString(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function mapUsageRecord(row: Row): ModelUsageRecord {
  return {
    id: String(row.id),
    analysisRunId: String(row.analysis_run_id),
    projectId: nullableString(row.project_id),
    projectNameSnapshot: nullableString(row.project_name_snapshot),
    analysisMode: String(row.analysis_mode) as ModelUsageRecord['analysisMode'],
    pipelineStage: String(row.pipeline_stage),
    attemptNumber: Number(row.attempt_number),
    parentCallId: nullableString(row.parent_call_id),
    apiProfileId: String(row.api_profile_id),
    apiProfileNameSnapshot: String(row.api_profile_name_snapshot),
    provider: String(row.provider),
    protocol: String(row.protocol),
    region: nullableString(row.region),
    modelId: String(row.model_id),
    localRequestId: String(row.local_request_id),
    providerRequestId: nullableString(row.provider_request_id),
    startedAt: String(row.started_at),
    completedAt: nullableString(row.completed_at),
    durationMs: nullableNumber(row.duration_ms),
    firstTokenDurationMs: nullableNumber(row.first_token_duration_ms),
    status: String(row.status) as ModelUsageRecord['status'],
    httpStatus: nullableNumber(row.http_status),
    errorCode: nullableString(row.error_code),
    errorCategory: nullableString(row.error_category),
    finishReason: nullableString(row.finish_reason),
    thinkingEnabled: row.thinking_enabled === null || row.thinking_enabled === undefined
      ? null
      : Boolean(row.thinking_enabled),
    thinkingBudgetTokens: nullableNumber(row.thinking_budget_tokens),
    structuredOutputMode: nullableString(row.structured_output_mode),
    maxOutputTokens: nullableNumber(row.max_output_tokens),
    inputTokens: nullableNumber(row.input_tokens),
    outputTokens: nullableNumber(row.output_tokens),
    totalTokens: nullableNumber(row.total_tokens),
    cachedInputTokens: nullableNumber(row.cached_input_tokens),
    reasoningTokens: nullableNumber(row.reasoning_tokens),
    textInputTokens: nullableNumber(row.text_input_tokens),
    imageInputTokens: nullableNumber(row.image_input_tokens),
    videoInputTokens: nullableNumber(row.video_input_tokens),
    audioInputTokens: nullableNumber(row.audio_input_tokens),
    textOutputTokens: nullableNumber(row.text_output_tokens),
    audioOutputTokens: nullableNumber(row.audio_output_tokens),
    usageSource: String(row.usage_source) as ModelUsageRecord['usageSource'],
    pricingRuleId: nullableString(row.pricing_rule_id),
    pricingSnapshotJson: nullableString(row.pricing_snapshot_json),
    estimatedCostMicros: nullableNumber(row.estimated_cost_micros),
    currency: nullableString(row.currency),
    costEstimateStatus: String(row.cost_estimate_status) as ModelUsageRecord['costEstimateStatus'],
    providerRawUsageJson: nullableString(row.provider_raw_usage_json),
    validationWarningsJson: nullableString(row.validation_warnings_json),
    createdAt: String(row.created_at)
  };
}

function mapPricingRule(row: Row): PricingRule {
  return {
    id: String(row.id),
    provider: String(row.provider),
    modelPattern: String(row.model_pattern),
    region: nullableString(row.region),
    protocol: nullableString(row.protocol),
    effectiveFrom: String(row.effective_from),
    effectiveTo: nullableString(row.effective_to),
    currency: String(row.currency) as PricingRule['currency'],
    minInputTokensExclusive: nullableNumber(row.min_input_tokens_exclusive),
    maxInputTokensInclusive: nullableNumber(row.max_input_tokens_inclusive),
    inputPricePerMillionMicros: String(row.input_price_per_million_micros),
    outputPricePerMillionMicros: String(row.output_price_per_million_micros),
    cachedInputMultiplierPpm: nullableNumber(row.cached_input_multiplier_ppm),
    batchMultiplierPpm: nullableNumber(row.batch_multiplier_ppm),
    sourceName: nullableString(row.source_name),
    sourceUpdatedAt: nullableString(row.source_updated_at),
    notes: nullableString(row.notes),
    isEnabled: Boolean(row.is_enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function validatePricingRule(input: SavePricingRuleInput): void {
  if (!input || typeof input !== 'object') throw new Error('价格规则格式无效');
  if (!input.provider.trim()) throw new Error('Provider 不能为空');
  if (!input.modelPattern.trim()) throw new Error('模型匹配规则不能为空');
  if (!['CNY', 'USD'].includes(input.currency)) throw new Error('价格币种必须是 CNY 或 USD');
  if (!/^\d+$/.test(input.inputPricePerMillionMicros)) throw new Error('输入价格必须是非负整数微单位');
  if (!/^\d+$/.test(input.outputPricePerMillionMicros)) throw new Error('输出价格必须是非负整数微单位');
  if (!Number.isFinite(Date.parse(input.effectiveFrom))) throw new Error('价格生效时间无效');
  if (input.effectiveTo && !Number.isFinite(Date.parse(input.effectiveTo))) throw new Error('价格失效时间无效');
  if (input.effectiveTo && Date.parse(input.effectiveTo) < Date.parse(input.effectiveFrom)) {
    throw new Error('价格失效时间不能早于生效时间');
  }
  for (const [label, value] of [
    ['最小输入 Token', input.minInputTokensExclusive],
    ['最大输入 Token', input.maxInputTokensInclusive],
    ['缓存输入倍率', input.cachedInputMultiplierPpm],
    ['Batch 倍率', input.batchMultiplierPpm]
  ] as const) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${label} 必须是非负安全整数`);
    }
  }
  if (
    input.minInputTokensExclusive !== null
    && input.maxInputTokensInclusive !== null
    && input.maxInputTokensInclusive <= input.minInputTokensExclusive
  ) {
    throw new Error('最大输入 Token 必须大于最小输入 Token');
  }
}

export interface PendingUsageRecordInput {
  id: string;
  analysisRunId: string;
  projectId: string | null;
  projectNameSnapshot: string | null;
  analysisMode: ModelUsageRecord['analysisMode'];
  pipelineStage: string;
  attemptNumber: number;
  parentCallId: string | null;
  apiProfileId: string;
  apiProfileNameSnapshot: string;
  provider: string;
  protocol: string;
  region: string | null;
  modelId: string;
  localRequestId: string;
  thinkingEnabled?: boolean | null;
  thinkingBudgetTokens?: number | null;
  structuredOutputMode?: string | null;
  maxOutputTokens?: number | null;
  startedAt: string;
  createdAt: string;
}

export interface CompleteUsageRecordInput {
  status: ModelUsageRecord['status'];
  completedAt: string;
  durationMs: number;
  firstTokenDurationMs?: number | null;
  providerRequestId?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  errorCategory?: string | null;
  finishReason?: string | null;
  usage: NormalizedModelUsage;
}

export function createUsageDatabase(databasePath: string) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 250;');
  database.exec(MIGRATION);
  const columns = new Set(
    (database.prepare('PRAGMA table_info(model_usage_records)').all() as Row[])
      .map((row) => String(row.name))
  );
  for (const [column, definition] of ([
    ['finish_reason', 'TEXT'],
    ['thinking_enabled', 'INTEGER'],
    ['thinking_budget_tokens', 'INTEGER'],
    ['structured_output_mode', 'TEXT'],
    ['max_output_tokens', 'INTEGER']
  ] as const)) {
    if (!columns.has(column)) database.exec(`ALTER TABLE model_usage_records ADD COLUMN ${column} ${definition};`);
  }
  database.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);

  function insertPending(input: PendingUsageRecordInput): void {
    database.prepare(`
      INSERT INTO model_usage_records (
        id, analysis_run_id, project_id, project_name_snapshot, analysis_mode,
        pipeline_stage, attempt_number, parent_call_id, api_profile_id,
        api_profile_name_snapshot, provider, protocol, region, model_id,
        local_request_id, thinking_enabled, thinking_budget_tokens,
        structured_output_mode, max_output_tokens, started_at, status, usage_source,
        cost_estimate_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'missing', 'not-applicable', ?)
    `).run(
      input.id,
      input.analysisRunId,
      input.projectId,
      input.projectNameSnapshot,
      input.analysisMode,
      input.pipelineStage,
      input.attemptNumber,
      input.parentCallId,
      input.apiProfileId,
      input.apiProfileNameSnapshot,
      input.provider,
      input.protocol,
      input.region,
      input.modelId,
      input.localRequestId,
      input.thinkingEnabled === null || input.thinkingEnabled === undefined
        ? null
        : Number(input.thinkingEnabled),
      input.thinkingBudgetTokens ?? null,
      input.structuredOutputMode ?? null,
      input.maxOutputTokens ?? null,
      input.startedAt,
      input.createdAt
    );
  }

  function record(id: string): ModelUsageRecord | null {
    const row = database.prepare('SELECT * FROM model_usage_records WHERE id = ?').get(id) as Row | undefined;
    return row ? mapUsageRecord(row) : null;
  }

  function complete(id: string, input: CompleteUsageRecordInput): ModelUsageRecord {
    const current = record(id);
    if (!current) throw new Error('Usage 调用记录不存在');
    const rules = listPricingRules();
    const pricingRule = matchPricingRule(rules, {
      provider: current.provider,
      modelId: current.modelId,
      region: current.region,
      protocol: current.protocol,
      inputTokens: input.usage.inputTokens,
      startedAt: current.startedAt
    });
    const cost = calculateEstimatedCost(input.usage, pricingRule);
    const validationWarnings = [...cost.warnings];
    if (
      input.usage.totalTokens !== null
      && input.usage.inputTokens !== null
      && input.usage.outputTokens !== null
      && input.usage.totalTokens !== input.usage.inputTokens + input.usage.outputTokens
    ) {
      validationWarnings.push('Provider 返回的 totalTokens 与 inputTokens + outputTokens 不一致，已保留原始值');
    }
    database.prepare(`
      UPDATE model_usage_records SET
        provider_request_id = ?, completed_at = ?, duration_ms = ?,
        first_token_duration_ms = ?, status = ?, http_status = ?,
        error_code = ?, error_category = ?, finish_reason = ?,
        input_tokens = ?, output_tokens = ?,
        total_tokens = ?, cached_input_tokens = ?, reasoning_tokens = ?,
        text_input_tokens = ?, image_input_tokens = ?, video_input_tokens = ?,
        audio_input_tokens = ?, text_output_tokens = ?, audio_output_tokens = ?,
        usage_source = ?, pricing_rule_id = ?, pricing_snapshot_json = ?,
        estimated_cost_micros = ?, currency = ?, cost_estimate_status = ?,
        provider_raw_usage_json = ?, validation_warnings_json = ?
      WHERE id = ?
    `).run(
      input.providerRequestId ?? null,
      input.completedAt,
      input.durationMs,
      input.firstTokenDurationMs ?? null,
      input.status,
      input.httpStatus ?? null,
      input.errorCode ?? null,
      input.errorCategory ?? null,
      input.finishReason ?? null,
      input.usage.inputTokens,
      input.usage.outputTokens,
      input.usage.totalTokens,
      input.usage.cachedInputTokens,
      input.usage.reasoningTokens,
      input.usage.textInputTokens,
      input.usage.imageInputTokens,
      input.usage.videoInputTokens,
      input.usage.audioInputTokens,
      input.usage.textOutputTokens,
      input.usage.audioOutputTokens,
      input.usage.usageSource,
      pricingRule?.id ?? null,
      pricingRule ? JSON.stringify(pricingSnapshot(pricingRule)) : null,
      cost.estimatedCostMicros,
      cost.currency,
      cost.costEstimateStatus,
      input.usage.providerRawUsage ? JSON.stringify(input.usage.providerRawUsage) : null,
      validationWarnings.length ? JSON.stringify(validationWarnings) : null,
      id
    );
    return record(id)!;
  }

  function markInterruptedPending(): number {
    const now = new Date().toISOString();
    const result = database.prepare(`
      UPDATE model_usage_records
      SET status = 'failed',
          completed_at = ?,
          duration_ms = MAX(0, CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)),
          error_code = 'APP_INTERRUPTED',
          error_category = 'interrupted',
          cost_estimate_status = 'usage-missing'
      WHERE status = 'pending'
    `).run(now, now);
    return Number(result.changes);
  }

  function queryParts(query: UsageRecordQuery = {}) {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    const filters: Array<[keyof UsageRecordQuery, string]> = [
      ['projectId', 'project_id'],
      ['analysisMode', 'analysis_mode'],
      ['provider', 'provider'],
      ['modelId', 'model_id'],
      ['apiProfileId', 'api_profile_id'],
      ['pipelineStage', 'pipeline_stage'],
      ['status', 'status']
    ];
    for (const [key, column] of filters) {
      const value = query[key];
      if (!value) continue;
      conditions.push(`${column} = ?`);
      values.push(String(value));
    }
    if (query.dateFrom) {
      conditions.push('created_at >= ?');
      values.push(query.dateFrom);
    }
    if (query.dateTo) {
      conditions.push('created_at <= ?');
      values.push(query.dateTo);
    }
    return {
      where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      values
    };
  }

  function listRecords(query: UsageRecordQuery = {}): UsageRecordPage {
    const page = Math.max(1, Math.trunc(query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Math.trunc(query.pageSize || 50)));
    const parts = queryParts(query);
    const total = Number((database.prepare(
      `SELECT COUNT(*) AS total FROM model_usage_records ${parts.where}`
    ).get(...parts.values) as Row).total);
    const rows = database.prepare(`
      SELECT * FROM model_usage_records ${parts.where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...parts.values, pageSize, (page - 1) * pageSize) as Row[];
    return { items: rows.map(mapUsageRecord), page, pageSize, total };
  }

  function stageDetails(analysisRunId: string): ModelUsageRecord[] {
    return (database.prepare(`
      SELECT * FROM model_usage_records
      WHERE analysis_run_id = ?
      ORDER BY started_at ASC, attempt_number ASC
    `).all(analysisRunId) as Row[]).map(mapUsageRecord);
  }

  function runSummary(analysisRunId: string): AnalysisRunUsageSummary {
    return aggregateUsageRecords(stageDetails(analysisRunId)) as AnalysisRunUsageSummary;
  }

  function monthSummary(month = new Date().toISOString().slice(0, 7)): MonthlyUsageSummary {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('月份格式必须为 YYYY-MM');
    const startDate = new Date(`${month}-01T00:00:00`);
    const start = startDate.toISOString();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    const end = endDate.toISOString();
    const totals = database.prepare(`
      SELECT
        COUNT(*) AS call_count,
        SUM(CASE WHEN status IN ('failed', 'timeout') THEN 1 ELSE 0 END) AS failed_call_count,
        SUM(CASE WHEN cost_estimate_status = 'calculated' THEN 1 ELSE 0 END) AS priced_call_count,
        SUM(CASE WHEN usage_source != 'missing' AND cost_estimate_status != 'calculated' THEN 1 ELSE 0 END) AS unpriced_call_count,
        SUM(COALESCE(total_tokens, 0)) AS total_tokens,
        SUM(CASE WHEN status IN ('failed', 'timeout') THEN COALESCE(total_tokens, 0) ELSE 0 END) AS failed_call_tokens,
        SUM(COALESCE(cached_input_tokens, 0)) AS cached_input_tokens,
        SUM(COALESCE(estimated_cost_micros, 0)) AS estimated_cost_micros
      FROM model_usage_records
      WHERE created_at >= ? AND created_at < ?
    `).get(start, end) as Row;
    const modelRows = database.prepare(`
      SELECT
        provider,
        model_id,
        COUNT(DISTINCT currency) AS currency_count,
        MAX(currency) AS single_currency,
        COUNT(*) AS call_count,
        SUM(CASE WHEN usage_source != 'missing' AND cost_estimate_status != 'calculated' THEN 1 ELSE 0 END) AS unpriced_call_count,
        SUM(COALESCE(total_tokens, 0)) AS total_tokens,
        SUM(COALESCE(estimated_cost_micros, 0)) AS estimated_cost_micros
      FROM model_usage_records
      WHERE created_at >= ? AND created_at < ?
      GROUP BY provider, model_id
      ORDER BY total_tokens DESC
    `).all(start, end) as Row[];
    const currencyRows = database.prepare(`
      SELECT DISTINCT currency
      FROM model_usage_records
      WHERE created_at >= ? AND created_at < ? AND currency IS NOT NULL
    `).all(start, end) as Row[];
    const currencies = new Set(currencyRows.map((row) => String(row.currency)));
    return {
      month,
      callCount: Number(totals.call_count || 0),
      failedCallCount: Number(totals.failed_call_count || 0),
      pricedCallCount: Number(totals.priced_call_count || 0),
      unpricedCallCount: Number(totals.unpriced_call_count || 0),
      totalTokens: Number(totals.total_tokens || 0),
      failedCallTokens: Number(totals.failed_call_tokens || 0),
      cachedInputTokens: Number(totals.cached_input_tokens || 0),
      estimatedCostMicros: Number(totals.estimated_cost_micros || 0),
      currency: currencies.size === 1 ? String([...currencies][0]) : currencies.size ? 'MIXED' : '',
      models: modelRows.map((row) => ({
        modelId: String(row.model_id),
        provider: String(row.provider),
        callCount: Number(row.call_count || 0),
        unpricedCallCount: Number(row.unpriced_call_count || 0),
        totalTokens: Number(row.total_tokens || 0),
        estimatedCostMicros: Number(row.estimated_cost_micros || 0),
        currency: Number(row.currency_count || 0) > 1 ? 'MIXED' : nullableString(row.single_currency) || ''
      }))
    };
  }

  function listPricingRules(): PricingRule[] {
    return (database.prepare(`
      SELECT * FROM pricing_rules ORDER BY provider, model_pattern, effective_from DESC
    `).all() as Row[]).map(mapPricingRule);
  }

  function savePricingRule(input: SavePricingRuleInput): PricingRule[] {
    validatePricingRule(input);
    const now = new Date().toISOString();
    const id = input.id || `pricing-${crypto.randomUUID()}`;
    const existing = input.id
      ? database.prepare('SELECT created_at FROM pricing_rules WHERE id = ?').get(input.id) as Row | undefined
      : undefined;
    if (input.id && !existing) throw new Error('价格规则不存在');
    database.prepare(`
      INSERT INTO pricing_rules (
        id, provider, model_pattern, region, protocol, effective_from, effective_to,
        currency, min_input_tokens_exclusive, max_input_tokens_inclusive,
        input_price_per_million_micros, output_price_per_million_micros,
        cached_input_multiplier_ppm, batch_multiplier_ppm, source_name,
        source_updated_at, notes, is_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider = excluded.provider,
        model_pattern = excluded.model_pattern,
        region = excluded.region,
        protocol = excluded.protocol,
        effective_from = excluded.effective_from,
        effective_to = excluded.effective_to,
        currency = excluded.currency,
        min_input_tokens_exclusive = excluded.min_input_tokens_exclusive,
        max_input_tokens_inclusive = excluded.max_input_tokens_inclusive,
        input_price_per_million_micros = excluded.input_price_per_million_micros,
        output_price_per_million_micros = excluded.output_price_per_million_micros,
        cached_input_multiplier_ppm = excluded.cached_input_multiplier_ppm,
        batch_multiplier_ppm = excluded.batch_multiplier_ppm,
        source_name = excluded.source_name,
        source_updated_at = excluded.source_updated_at,
        notes = excluded.notes,
        is_enabled = excluded.is_enabled,
        updated_at = excluded.updated_at
    `).run(
      id,
      input.provider.trim(),
      input.modelPattern.trim(),
      input.region?.trim() || null,
      input.protocol?.trim() || null,
      input.effectiveFrom,
      input.effectiveTo || null,
      input.currency,
      input.minInputTokensExclusive,
      input.maxInputTokensInclusive,
      input.inputPricePerMillionMicros,
      input.outputPricePerMillionMicros,
      input.cachedInputMultiplierPpm,
      input.batchMultiplierPpm,
      input.sourceName?.trim() || null,
      input.sourceUpdatedAt || null,
      input.notes?.trim() || null,
      input.isEnabled ? 1 : 0,
      existing ? String(existing.created_at) : now,
      now
    );
    return listPricingRules();
  }

  function deletePricingRule(ruleId: string): PricingRule[] {
    database.prepare('DELETE FROM pricing_rules WHERE id = ?').run(ruleId);
    return listPricingRules();
  }

  function clearHistory(): void {
    database.exec('DELETE FROM model_usage_records;');
  }

  return {
    databasePath,
    insertPending,
    complete,
    record,
    markInterruptedPending,
    listRecords,
    stageDetails,
    runSummary,
    monthSummary,
    listPricingRules,
    savePricingRule,
    deletePricingRule,
    clearHistory,
    close: () => database.close()
  };
}

export type UsageDatabase = ReturnType<typeof createUsageDatabase>;
