const TOKEN_FIELD_PATTERN = /token|cached|reasoning|input|output|prompt|completion|text|image|video|audio/i;
const MAX_RAW_DEPTH = 5;
const MAX_RAW_KEYS = 100;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toNullableInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.trunc(number);
}

function valueAt(object, paths) {
  for (const path of paths) {
    let current = object;
    for (const segment of path) current = isObject(current) ? current[segment] : undefined;
    const value = toNullableInteger(current);
    if (value !== null) return value;
  }
  return null;
}

function sanitizeValue(value, depth, state) {
  if (depth > MAX_RAW_DEPTH || state.keys >= MAX_RAW_KEYS) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 50)
      .map((item) => sanitizeValue(item, depth + 1, state))
      .filter((item) => item !== undefined);
  }
  if (!isObject(value)) return undefined;
  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (state.keys >= MAX_RAW_KEYS) break;
    if (!TOKEN_FIELD_PATTERN.test(key) && depth === 0) continue;
    state.keys += 1;
    const next = sanitizeValue(item, depth + 1, state);
    if (next !== undefined) sanitized[key] = next;
  }
  return sanitized;
}

export function sanitizeUsageObject(value) {
  if (!isObject(value)) return undefined;
  return sanitizeValue(value, 0, { keys: 0 });
}

export function createMissingUsage() {
  return Object.freeze({
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    cachedInputTokens: null,
    reasoningTokens: null,
    textInputTokens: null,
    imageInputTokens: null,
    videoInputTokens: null,
    audioInputTokens: null,
    textOutputTokens: null,
    audioOutputTokens: null,
    usageSource: 'missing'
  });
}

function usageSourceFor(fields) {
  const available = fields.filter((value) => value !== null).length;
  if (!available) return 'missing';
  return fields[0] !== null && fields[1] !== null && fields[2] !== null
    ? 'provider'
    : 'provider-partial';
}

function normalizeUsage(usage, mapping) {
  if (!isObject(usage)) return createMissingUsage();
  const inputTokens = valueAt(usage, mapping.inputTokens);
  const outputTokens = valueAt(usage, mapping.outputTokens);
  const totalTokens = valueAt(usage, mapping.totalTokens);
  const normalized = {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: valueAt(usage, mapping.cachedInputTokens),
    reasoningTokens: valueAt(usage, mapping.reasoningTokens),
    textInputTokens: valueAt(usage, mapping.textInputTokens),
    imageInputTokens: valueAt(usage, mapping.imageInputTokens),
    videoInputTokens: valueAt(usage, mapping.videoInputTokens),
    audioInputTokens: valueAt(usage, mapping.audioInputTokens),
    textOutputTokens: valueAt(usage, mapping.textOutputTokens),
    audioOutputTokens: valueAt(usage, mapping.audioOutputTokens),
    usageSource: usageSourceFor([inputTokens, outputTokens, totalTokens]),
    providerRawUsage: sanitizeUsageObject(usage)
  };
  return Object.freeze(normalized);
}

const OPENAI_MAPPING = Object.freeze({
  inputTokens: [['prompt_tokens'], ['input_tokens']],
  outputTokens: [['completion_tokens'], ['output_tokens']],
  totalTokens: [['total_tokens']],
  cachedInputTokens: [
    ['prompt_tokens_details', 'cached_tokens'],
    ['input_tokens_details', 'cached_tokens']
  ],
  reasoningTokens: [
    ['completion_tokens_details', 'reasoning_tokens'],
    ['output_tokens_details', 'reasoning_tokens']
  ],
  textInputTokens: [['prompt_tokens_details', 'text_tokens'], ['input_tokens_details', 'text_tokens']],
  imageInputTokens: [['prompt_tokens_details', 'image_tokens'], ['input_tokens_details', 'image_tokens']],
  videoInputTokens: [['prompt_tokens_details', 'video_tokens'], ['input_tokens_details', 'video_tokens']],
  audioInputTokens: [['prompt_tokens_details', 'audio_tokens'], ['input_tokens_details', 'audio_tokens']],
  textOutputTokens: [['completion_tokens_details', 'text_tokens'], ['output_tokens_details', 'text_tokens']],
  audioOutputTokens: [['completion_tokens_details', 'audio_tokens'], ['output_tokens_details', 'audio_tokens']]
});

const DASHSCOPE_MAPPING = Object.freeze({
  inputTokens: [['input_tokens'], ['prompt_tokens']],
  outputTokens: [['output_tokens'], ['completion_tokens']],
  totalTokens: [['total_tokens']],
  cachedInputTokens: [
    ['prompt_tokens_details', 'cached_tokens'],
    ['input_tokens_details', 'cached_tokens']
  ],
  reasoningTokens: [
    ['output_tokens_details', 'reasoning_tokens'],
    ['completion_tokens_details', 'reasoning_tokens']
  ],
  textInputTokens: [['input_tokens_details', 'text_tokens']],
  imageInputTokens: [['input_tokens_details', 'image_tokens']],
  videoInputTokens: [['input_tokens_details', 'video_tokens']],
  audioInputTokens: [['input_tokens_details', 'audio_tokens']],
  textOutputTokens: [['output_tokens_details', 'text_tokens']],
  audioOutputTokens: [['output_tokens_details', 'audio_tokens']]
});

export function extractOpenAiCompatibleUsage(response) {
  const usage = isObject(response?.usage)
    ? response.usage
    : isObject(response?.output?.usage) ? response.output.usage : null;
  return normalizeUsage(usage, OPENAI_MAPPING);
}

export function extractDashScopeUsage(response) {
  const usage = isObject(response?.usage)
    ? response.usage
    : isObject(response?.output?.usage) ? response.output.usage : null;
  return normalizeUsage(usage, DASHSCOPE_MAPPING);
}

export function createOpenAiCompatibleStreamUsageCollector() {
  let finalUsage = createMissingUsage();
  return Object.freeze({
    consume(chunk) {
      const usage = extractOpenAiCompatibleUsage(chunk);
      if (usage.usageSource !== 'missing') finalUsage = usage;
      return usage;
    },
    finalUsage() {
      return finalUsage;
    }
  });
}
