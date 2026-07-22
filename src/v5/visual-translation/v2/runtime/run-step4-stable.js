import crypto from 'node:crypto';
import { parseStructuredResponse } from '../../../shared/analysis/response-parser.js';
import { VISUAL_TRANSLATION_V2_RUNTIME_CONFIG } from '../config/visual-translation-v2-runtime-config.js';
import {
  ANTI_CONCEPT_ART_CONSTRAINTS,
  REQUIRED_REUSABLE_ASSET_TYPES
} from '../schemas/direction-contract-v2.js';

const STEP4_CONFIG = VISUAL_TRANSLATION_V2_RUNTIME_CONFIG.step4;
export const STEP4_PROVIDER_TIMEOUT_MS = STEP4_CONFIG.mainHardTimeoutMs;
export const STEP4_REPAIR_TIMEOUT_MS = STEP4_CONFIG.repairHardTimeoutMs;
export const STEP4_TOTAL_TIMEOUT_MS = STEP4_CONFIG.totalTimeoutMs;
export const STEP4_HEARTBEAT_INTERVAL_MS = STEP4_CONFIG.heartbeatIntervalMs;

export const STEP4_TERMINAL_STATUSES = Object.freeze(new Set([
  'completed', 'failed', 'timed_out', 'cancelled'
]));

const REPAIRABLE_VALIDATION_CODES = new Set([
  'FAILED_SCHEMA', 'DIRECTIONS_NOT_DISTINCT', 'B2B_BOUNDARY_VIOLATION',
  'INDUSTRY_TEMPLATE_RISK', 'RESTRICTED_ASSET_EXECUTION', 'REPORT_LANGUAGE_POLLUTION',
  'PEOPLE_POLICY_MAPPING_CONFLICT', 'DIFFERENCE_MATRIX_SHARED_TRAIT_CONFLICT'
]);

export const SAFE_ASSET_AUTHORIZATION = Object.freeze({
  data_authorization_level: 'abstracted',
  document_visualization_mode: 'structure_only',
  credential_usage_mode: 'redacted',
  generated_data_policy: 'abstracted'
});

function codedError(code, message, cause) {
  return Object.assign(new Error(message || code), { code, ...(cause ? { cause } : {}) });
}

function abortError() {
  return new DOMException('User cancelled the analysis', 'AbortError');
}

function extractDirections(value) {
  const set = value?.visualDirectionV2Set || value;
  const list = Array.isArray(set) ? set : set?.directions;
  if (!Array.isArray(list) || list.length < 1) {
    throw codedError('FAILED_SCHEMA', 'v2 方向集合为空或结构不符');
  }
  return list;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return value;
  return value.filter((item) => typeof item === 'string');
}

export function conservativelyNormalizeDirectionSet(value) {
  const cloned = structuredClone(value);
  const directions = extractDirections(cloned);
  for (const direction of directions) {
    const evidence = direction?.brand_evidence;
    if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)
      && typeof evidence.statement === 'string' && Object.keys(evidence).length <= 2) {
      direction.brand_evidence = evidence.statement;
    }
    direction.execution_constraints = normalizeStringArray(direction.execution_constraints);
    direction.template_risks = normalizeStringArray(direction.template_risks);
    // Authorization is runtime policy metadata, not creative model output. Always
    // replace it so invented provider values can never weaken or break the gate.
    direction.asset_authorization = structuredClone(SAFE_ASSET_AUTHORIZATION);
    if (direction.anti_concept_art_constraints === undefined) {
      direction.anti_concept_art_constraints = structuredClone(ANTI_CONCEPT_ART_CONSTRAINTS);
    }
  }
  return cloned;
}

function parseJsonOrThrow(text) {
  try {
    return parseStructuredResponse(text);
  } catch (error) {
    throw codedError('STEP4_JSON_PARSE_FAILED', error.message, error);
  }
}

function receivedType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function valueAtPath(value, path) {
  if (!path) return undefined;
  const normalizedPath = String(path)
    .replace(/^visualDirectionV2Set\.directions/u, 'directions')
    .replace(/^visualDirectionV2/u, 'directions[0]');
  const tokens = [...normalizedPath.matchAll(/(?:^|\.)([^.[\]]+)|\[(\d+)\]/gu)]
    .map((match) => match[1] ?? Number(match[2]));
  let current = value?.visualDirectionV2Set || value;
  for (const token of tokens) current = current?.[token];
  return current;
}

const FIELD_RULES = Object.freeze({
  brand_evidence: {
    expected: 'string',
    required: 'one Chinese sentence (maximum 500 characters) summarizing verified brand facts',
    example: '九州美学是医美全链生态平台，以供应链、仓储、温控与机构协同能力为业务底座。',
    forbidden: 'object, array, number, boolean, null'
  },
  execution_constraints: {
    expected: 'string[] with at least one item',
    required: 'verified execution constraints; every array item must be a string',
    example: '["不使用建筑或展馆作为视觉主体。"]',
    forbidden: 'object items, number, boolean, null, empty array'
  },
  template_risks: {
    expected: 'string[] with at least one item',
    required: 'specific template risks; every array item must be a string',
    example: '["供应链节点网络容易滑向通用科技视觉。"]',
    forbidden: 'object items, number, boolean, null, empty array'
  },
  selection_dimensions: {
    expected: 'non-empty string[]',
    required: '2–4 concrete selection dimensions for this direction',
    example: '["证据可验证性","机构决策价值","跨触点复用性"]',
    forbidden: 'empty array, placeholder, object items, or changing another selection_mechanism field'
  },
  visual_mapping_rule: {
    expected: 'non-empty string',
    required: 'state how each selection dimension maps to an observable graphic, image, layout, or information rule',
    example: '将证据状态映射为可验证窗口，将流程节点映射为分层轨迹切片。',
    forbidden: 'empty string, abstract style label, invented fact, or changes to another field'
  },
  multi_category_rule: {
    expected: 'non-empty string',
    required: 'state the invariant visual grammar that unifies multiple products, services, or roles',
    example: '所有品类沿用同一证据分层、编号区和状态标签结构，仅替换真实业务对象。',
    forbidden: 'empty string, a generic style adjective, or an invented category'
  },
  comparison_behavior: {
    expected: 'non-empty string',
    required: 'state the observable comparison behavior used to distinguish choices or states',
    example: '以并列证据卡比较交付状态，不使用虚构评分、排名或百分比。',
    forbidden: 'empty string, fabricated score, ranking, metric, or certification'
  },
  platform_signature: {
    expected: 'non-empty string',
    required: 'state the project-brand-specific platform signature without using an unauthorized parent/group VI',
    example: '以项目品牌名称、平台验证区块和服务编排规则形成签名。',
    forbidden: 'empty string, another brand, or unauthorized group logo/VI'
  }
});

function validationIssues(validationError) {
  if (Array.isArray(validationError?.issues) && validationError.issues.length) return validationError.issues;
  return [{
    code: validationError?.code || 'FAILED_SCHEMA',
    path: validationError?.path || validationError?.details?.path || 'visualDirectionV2Set',
    expected: validationError?.expected,
    message: validationError?.message || 'FAILED_SCHEMA'
  }];
}

function assetCoverageRepairSpec(issue, current) {
  if (!String(issue?.path || '').endsWith('.core_reusable_assets') || !Array.isArray(current)) return null;
  const existingTypes = [...new Set(current.map((asset) => asset?.asset_type).filter(Boolean))];
  const missingTypes = REQUIRED_REUSABLE_ASSET_TYPES.filter((type) => !existingTypes.includes(type));
  if (!missingTypes.length) return null;
  return {
    repair_operation: 'append_missing_asset_types',
    existing_asset_types: existingTypes,
    required_asset_types: [...REQUIRED_REUSABLE_ASSET_TYPES],
    missing_asset_types: missingTypes,
    requirement: `Append exactly one new, complete reusable asset for each missing type: ${missingTypes.join(', ')}. Preserve every existing asset and its asset_id/asset_type unchanged.`,
    forbidden: 'replacing the array, deleting an existing asset, changing an existing asset_id or asset_type, reusing an asset_id, or returning an already-present type'
  };
}

export function buildFieldRepairPrompt({ originalJson, validationError }) {
  const issues = validationIssues(validationError).map((issue) => {
    const field = String(issue.path).match(/([^.[\]]+)(?:\[\d+\])?$/u)?.[1];
    const rule = FIELD_RULES[field];
    const current = valueAtPath(originalJson, issue.path);
    const assetCoverage = assetCoverageRepairSpec(issue, current);
    return {
      path: issue.path,
      expected: issue.expected || rule?.expected || 'the type and constraints stated by the schema error',
      received_type: receivedType(current),
      received_value: current,
      repair_operation: assetCoverage?.repair_operation || 'replace',
      ...(assetCoverage || {}),
      requirement: assetCoverage?.requirement || rule?.required || issue.message,
      forbidden: assetCoverage?.forbidden || rule?.forbidden || 'invented facts or changes to unlisted fields'
    };
  });
  return [{ role: 'user', content: `The JSON has ${issues.length} validation error(s).
Return a bounded correction patch for every listed path and no other path.
Do not return the complete document. Do not add explanations or Markdown.
Output exactly this shape: {"corrections":[{"path":"one listed path","operation":"the listed repair_operation","value":"corrected JSON value"}]}
Each listed path must appear exactly once. Preserve all unlisted fields. Do not invent facts.
For append_missing_asset_types, value MUST be an array containing only new complete asset objects, exactly one per missing_asset_types entry. Never return or rewrite the existing array.

Validation errors:
${JSON.stringify(issues)}

Original JSON (read-only context):
${JSON.stringify(originalJson)}` }];
}

function pathTokens(path) {
  if (!String(path).startsWith('visualDirectionV2Set.directions[')) {
    throw codedError('STEP4_REPAIR_PATCH_INVALID', `Repair path is outside the direction set: ${path}`);
  }
  const tokens = [...String(path).matchAll(/(?:^|\.)([^.[\]]+)|\[(\d+)\]/gu)]
    .map((match) => match[1] ?? Number(match[2]));
  if (tokens.some((token) => ['__proto__', 'prototype', 'constructor'].includes(token))) {
    throw codedError('STEP4_REPAIR_PATCH_INVALID', `Unsafe repair path: ${path}`);
  }
  return tokens;
}

export function applyFieldRepairPatch(originalJson, patch, validationError) {
  const corrections = patch?.corrections;
  const issues = validationIssues(validationError);
  if (!Array.isArray(corrections) || corrections.length !== issues.length || corrections.length > 100) {
    throw codedError('STEP4_REPAIR_PATCH_INVALID', 'Repair must contain exactly one correction for every validation issue');
  }
  const allowed = new Set(issues.map((issue) => issue.path));
  const seen = new Set();
  const repaired = structuredClone(originalJson);
  for (const correction of corrections) {
    const path = correction?.path;
    if (typeof path !== 'string' || !allowed.has(path) || seen.has(path) || !Object.hasOwn(correction, 'value')) {
      throw codedError('STEP4_REPAIR_PATCH_INVALID', `Invalid, duplicate, or unlisted repair path: ${path}`);
    }
    seen.add(path);
    const tokens = pathTokens(path);
    let target = repaired;
    for (let index = 0; index < tokens.length - 1; index += 1) {
      target = target?.[tokens[index]];
      if (!target || typeof target !== 'object') {
        throw codedError('STEP4_REPAIR_PATCH_INVALID', `Repair path has a missing parent: ${path}`);
      }
    }
    const key = tokens.at(-1);
    const current = target[key];
    const assetCoverage = assetCoverageRepairSpec(issues.find((issue) => issue.path === path), current);
    if (assetCoverage) {
      if ((correction.operation || 'append_missing_asset_types') !== 'append_missing_asset_types' || !Array.isArray(correction.value)) {
        throw codedError('STEP4_REPAIR_PATCH_INVALID', `Asset coverage repair must append only missing types: ${path}`);
      }
      const additions = correction.value;
      const additionTypes = additions.map((asset) => asset?.asset_type);
      const expectedTypes = assetCoverage.missing_asset_types;
      if (additions.length !== expectedTypes.length
        || expectedTypes.some((type) => additionTypes.filter((candidate) => candidate === type).length !== 1)
        || additionTypes.some((type) => !expectedTypes.includes(type))) {
        throw codedError('STEP4_REPAIR_PATCH_INVALID', `Asset coverage repair must add exactly: ${expectedTypes.join(', ')}`);
      }
      const existingIds = new Set(current.map((asset) => asset?.asset_id).filter(Boolean));
      const additionIds = additions.map((asset) => asset?.asset_id);
      if (additionIds.some((id) => typeof id !== 'string' || !id.trim() || existingIds.has(id))
        || new Set(additionIds).size !== additionIds.length) {
        throw codedError('STEP4_REPAIR_PATCH_INVALID', `Asset coverage repair requires new unique asset_id values: ${path}`);
      }
      target[key] = [...structuredClone(current), ...structuredClone(additions)];
    } else {
      if (correction.operation && correction.operation !== 'replace') {
        throw codedError('STEP4_REPAIR_PATCH_INVALID', `Unsupported repair operation for path: ${path}`);
      }
      target[key] = structuredClone(correction.value);
    }
  }
  return repaired;
}

function linkAbortSignal(parentSignal, controller) {
  if (!parentSignal) return () => {};
  const abort = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abort();
  else parentSignal.addEventListener('abort', abort, { once: true });
  return () => parentSignal.removeEventListener('abort', abort);
}

async function callWithTimeout(action, timeoutMs, code, controller) {
  let timer;
  let abortListener;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => {
        abortListener = () => {
          const reason = controller.signal.reason;
          reject(typeof reason === 'string' && reason.startsWith('STEP4_')
            ? codedError(reason, reason)
            : abortError());
        };
        controller.signal.addEventListener('abort', abortListener, { once: true });
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(codedError(code, code));
          controller.abort(code);
        }, timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    clearTimeout(timer);
    if (abortListener) controller.signal.removeEventListener('abort', abortListener);
  }
}

export async function runStableStep4(options) {
  const runId = options.runId || crypto.randomUUID();
  const startedAt = Date.now();
  const controller = new AbortController();
  const unlinkAbort = linkAbortSignal(options.abortSignal, controller);
  const events = [];
  let currentPhase = 'starting';
  let providerRequestActive = false;
  let repairAttempted = Boolean(options.repairCheckpoint);
  let terminalStatus = null;
  let modelCallCount = 0;
  const totalTimeoutMs = options.totalTimeoutMs ?? STEP4_TOTAL_TIMEOUT_MS;
  const processingReserveMs = options.processingReserveMs ?? STEP4_CONFIG.processingReserveMs;
  const minimumRepairBudgetMs = options.minimumRepairBudgetMs ?? STEP4_CONFIG.minimumRepairBudgetMs;

  const emit = (event, fields = {}) => {
    const record = {
      event,
      project_id: options.projectId,
      run_id: runId,
      attempt: fields.attempt ?? modelCallCount,
      elapsed_ms: Date.now() - startedAt,
      prompt_chars: fields.prompt_chars ?? 0,
      output_chars: fields.output_chars ?? 0,
      status: fields.status ?? terminalStatus ?? 'running',
      error_code: fields.error_code ?? null,
      ...fields
    };
    events.push(record);
    options.onEvent?.(record);
    return record;
  };
  const setStatus = (status, details = {}) => {
    if (terminalStatus) return false;
    if (STEP4_TERMINAL_STATUSES.has(status)) terminalStatus = status;
    options.onStatus?.({ project_id: options.projectId, run_id: runId, status, updated_at: new Date().toISOString(), ...details });
    return true;
  };

  setStatus('running');
  emit('STEP4_START', { attempt: 0 });
  const heartbeat = setInterval(() => emit('STEP4_HEARTBEAT', {
    current_phase: currentPhase,
    provider_request_active: providerRequestActive,
    repair_attempted: repairAttempted
  }), options.heartbeatIntervalMs ?? STEP4_HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  const execute = async () => {
    const invoke = async (messages, timeoutMs, timeoutCode, attempt, eventPrefix) => {
      currentPhase = eventPrefix === 'STEP4_PROVIDER' ? 'provider' : 'repair';
      providerRequestActive = true;
      modelCallCount += 1;
      const promptChars = messages.reduce((sum, message) => sum + String(message.content || '').length, 0);
      let firstActivityMs = null;
      let firstContentMs = null;
      let lastProgressAt = 0;
      let lastProgressChars = 0;
      const providerCallStartedAt = Date.now();
      emit(`${eventPrefix}_START`, { attempt, prompt_chars: promptChars });
      try {
        const response = await callWithTimeout(() => options.reasoner(messages, {
          signal: controller.signal,
          enableThinking: options.profile.thinking,
          thinkingBudget: options.profile.thinkingBudget,
          maxOutputTokens: options.maxOutputTokens,
          requestTimeoutMs: timeoutMs,
          timeoutErrorCode: timeoutCode,
          stream: true,
          firstActivityTimeoutMs: options.firstActivityTimeoutMs ?? STEP4_CONFIG.firstActivityTimeoutMs,
          streamIdleTimeoutMs: options.streamIdleTimeoutMs ?? STEP4_CONFIG.streamIdleTimeoutMs,
          onStreamEvent(streamEvent) {
            const common = {
              attempt,
              received_chars: streamEvent.receivedChars,
              reasoning_chars: streamEvent.reasoningChars,
              estimated_output_tokens: Math.ceil((streamEvent.receivedChars + streamEvent.reasoningChars) / 2.2),
              chunks_received: streamEvent.chunksReceived
            };
            if (streamEvent.type === 'first_activity') {
              firstActivityMs = streamEvent.elapsedMs;
              emit('STEP4_FIRST_ACTIVITY', { ...common, first_activity_ms: firstActivityMs, activity_kind: streamEvent.activityKind });
            } else if (streamEvent.type === 'first_reasoning_token') {
              emit('STEP4_FIRST_REASONING_TOKEN', common);
            } else if (streamEvent.type === 'first_content_token') {
              firstContentMs = streamEvent.elapsedMs;
              emit('STEP4_FIRST_TOKEN', { ...common, first_content_ms: firstContentMs });
              emit('STEP4_FIRST_CONTENT_TOKEN', { ...common, first_content_ms: firstContentMs });
            } else if (streamEvent.type === 'progress') {
              const now = Date.now();
              if (now - lastProgressAt >= 5_000 || streamEvent.receivedChars - lastProgressChars >= 2_000) {
                lastProgressAt = now;
                lastProgressChars = streamEvent.receivedChars;
                emit('STEP4_STREAM_PROGRESS', { ...common, last_chunk_at: new Date().toISOString() });
              }
            } else if (streamEvent.type === 'end') {
              emit('STEP4_STREAM_END', { ...common, finish_reason: streamEvent.finishReason });
            }
          }
        }), timeoutMs, timeoutCode, controller);
        const outputChars = String(response?.text || '').length;
        const providerElapsedMs = Date.now() - providerCallStartedAt;
        const outputTokens = response?.usage?.outputTokens ?? null;
        emit(`${eventPrefix}_END`, {
          attempt,
          prompt_chars: promptChars,
          prompt_tokens_estimate: Math.ceil(promptChars / 2.2),
          output_chars: outputChars,
          output_tokens: outputTokens,
          thinking_budget: options.profile.thinkingBudget,
          max_output_tokens: options.maxOutputTokens,
          first_activity_ms: firstActivityMs,
          first_content_ms: firstContentMs,
          stream_duration_ms: firstActivityMs == null ? null : Math.max(0, providerElapsedMs - firstActivityMs),
          total_provider_ms: providerElapsedMs,
          estimated_tokens_per_second: outputTokens == null || providerElapsedMs <= 0 ? null : Number((outputTokens / (providerElapsedMs / 1000)).toFixed(2))
        });
        await options.onModelResponse?.(attempt, response);
        return response;
      } finally {
        providerRequestActive = false;
      }
    };

    let parsed;
    if (options.repairCheckpoint?.originalJson) {
      currentPhase = 'repair-resume';
      parsed = conservativelyNormalizeDirectionSet(options.repairCheckpoint.originalJson);
      emit('STEP4_REPAIR_RESUME', { attempt: 2, repair_resumed: true });
    } else {
      const response = await invoke(options.messages, options.providerTimeoutMs ?? STEP4_PROVIDER_TIMEOUT_MS, 'STEP4_PROVIDER_HARD_TIMEOUT', 1, 'STEP4_PROVIDER');
      currentPhase = 'parse';
      emit('STEP4_PARSE_START', { attempt: 1, output_chars: String(response?.text || '').length });
      parsed = conservativelyNormalizeDirectionSet(parseJsonOrThrow(response?.text));
      emit('STEP4_PARSE_END', { attempt: 1, output_chars: String(response?.text || '').length });
    }
    currentPhase = 'validate';
    emit('STEP4_VALIDATE_START', { attempt: 1 });
    try {
      return options.validate(extractDirections(parsed));
    } catch (error) {
      emit('STEP4_VALIDATE_FAILED', { attempt: 1, error_code: error.code || 'FAILED_SCHEMA' });
      if (!REPAIRABLE_VALIDATION_CODES.has(error.code || 'FAILED_SCHEMA')) throw error;
      if (!options.repairCheckpoint) {
        await options.onRepairPending?.({
          kind: 'step4_repair_pending',
          originalJson: parsed,
          createdAt: new Date().toISOString()
        });
      }
      const remainingMs = totalTimeoutMs - (Date.now() - startedAt) - processingReserveMs;
      if (remainingMs < minimumRepairBudgetMs) {
        throw codedError('STEP4_REPAIR_BUDGET_INSUFFICIENT', `Step 4 repair requires at least ${minimumRepairBudgetMs}ms but only ${Math.max(0, remainingMs)}ms remains`);
      }
      repairAttempted = true;
      const repairMessages = buildFieldRepairPrompt({ originalJson: parsed, validationError: error });
      const repairTimeoutMs = Math.min(options.repairTimeoutMs ?? STEP4_REPAIR_TIMEOUT_MS, remainingMs);
      const repairedResponse = await invoke(repairMessages, repairTimeoutMs, 'STEP4_REPAIR_TIMEOUT', 2, 'STEP4_REPAIR');
      currentPhase = 'parse';
      emit('STEP4_PARSE_START', { attempt: 2, output_chars: String(repairedResponse?.text || '').length });
      const repairPatch = parseJsonOrThrow(repairedResponse?.text);
      const repaired = conservativelyNormalizeDirectionSet(applyFieldRepairPatch(parsed, repairPatch, error));
      emit('STEP4_PARSE_END', { attempt: 2, output_chars: String(repairedResponse?.text || '').length });
      currentPhase = 'validate';
      emit('STEP4_VALIDATE_START', { attempt: 2 });
      try {
        return options.validate(extractDirections(repaired));
      } catch (finalValidationError) {
        const remainingIssues = validationIssues(finalValidationError);
        emit('STEP4_REPAIR_INCOMPLETE', {
          attempt: 2,
          error_code: finalValidationError.code || 'FAILED_SCHEMA',
          remaining_issue_count: remainingIssues.length,
          remaining_issue_paths: remainingIssues.map((issue) => issue.path)
        });
        if (REPAIRABLE_VALIDATION_CODES.has(finalValidationError.code || 'FAILED_SCHEMA')) {
          await options.onRepairPending?.({
            kind: 'step4_repair_pending',
            originalJson: repaired,
            createdAt: new Date().toISOString(),
            previousRepairIncomplete: true
          });
        }
        throw finalValidationError;
      }
    }
  };

  let watchdog;
  try {
    const result = await Promise.race([
      execute(),
      new Promise((_, reject) => {
        watchdog = setTimeout(() => {
          reject(codedError('STEP4_TOTAL_TIMEOUT', 'STEP4_TOTAL_TIMEOUT'));
          controller.abort('STEP4_TOTAL_TIMEOUT');
        }, totalTimeoutMs);
        watchdog.unref?.();
      })
    ]);
    setStatus('completed', { repaired: repairAttempted, elapsed_ms: Date.now() - startedAt });
    emit('STEP4_COMPLETED', { status: 'completed' });
    return { directions: result, events, modelCallCount, repaired: repairAttempted, runId };
  } catch (error) {
    const cancelled = options.abortSignal?.aborted || error?.name === 'AbortError' || error?.code === 'STEP4_CANCELLED';
    const status = cancelled ? 'cancelled' : 'failed';
    setStatus(status, { code: error.code || 'STEP4_UNKNOWN_ERROR', message: error.message, elapsed_ms: Date.now() - startedAt });
    if (error?.code === 'STEP4_STREAM_IDLE_TIMEOUT') emit('STEP4_STREAM_IDLE', { status, error_code: error.code });
    if (String(error?.code || '').includes('TIMEOUT')) emit('STEP4_TIMEOUT', { status, error_code: error.code });
    emit('STEP4_FAILED', { status, error_code: error.code || 'STEP4_UNKNOWN_ERROR' });
    throw error;
  } finally {
    clearInterval(heartbeat);
    clearTimeout(watchdog);
    unlinkAbort();
  }
}
