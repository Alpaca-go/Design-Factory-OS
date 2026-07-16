const MAX_LOCAL_REPAIRS = 50;

function escapeControlCharacter(character) {
  if (character === '\b') return '\\b';
  if (character === '\f') return '\\f';
  if (character === '\n') return '\\n';
  if (character === '\r') return '\\r';
  if (character === '\t') return '\\t';
  return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
}

function normalizeJsonCandidate(candidate) {
  let normalized = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < candidate.length; index += 1) {
    const character = candidate[index];
    if (inString) {
      if (escaped) {
        normalized += character;
        escaped = false;
        continue;
      }
      if (character === '\\') {
        normalized += character;
        escaped = true;
        continue;
      }
      if (character === '"') {
        normalized += character;
        inString = false;
        continue;
      }
      if (character.charCodeAt(0) <= 0x1F) {
        normalized += escapeControlCharacter(character);
        continue;
      }
      normalized += character;
      continue;
    }
    if (character === '"') {
      normalized += character;
      inString = true;
      continue;
    }
    if (character === ',') {
      let next = index + 1;
      while (next < candidate.length && /\s/.test(candidate[next])) next += 1;
      if (candidate[next] === '}' || candidate[next] === ']') continue;
    }
    if (character.charCodeAt(0) <= 0x1F && !/[\n\r\t]/.test(character)) continue;
    normalized += character;
  }
  return normalized;
}

function extractJsonCandidate(value) {
  const text = String(value || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  if (start < 0) throw new Error('模型输出中未找到 JSON 对象');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{' || character === '[') depth += 1;
    else if (character === '}' || character === ']') depth -= 1;
    if (depth === 0) return normalizeJsonCandidate(text.slice(start, index + 1));
  }
  throw new Error('模型输出中的 JSON 对象不完整，可能因输出长度限制被截断');
}

function significantIndex(candidate, start, direction) {
  let index = start;
  while (index >= 0 && index < candidate.length && /\s/.test(candidate[index])) index += direction;
  return index;
}

function repairMissingComma(candidate, error) {
  const position = Number(error.message.match(/position\s+(\d+)/i)?.[1]);
  if (!Number.isInteger(position)) return null;
  if (!/Expected ',' or '[}\]]'|Unexpected (?:token|string|number)/i.test(error.message)) return null;
  const next = significantIndex(candidate, position, 1);
  const previous = significantIndex(candidate, next - 1, -1);
  if (next < 0 || next >= candidate.length || previous < 0) return null;
  const previousCharacter = candidate[previous];
  const nextCharacter = candidate[next];
  const canEndValue = /[}\]"0-9el]/.test(previousCharacter);
  const canStartValueOrProperty = /[{\["0-9tfn-]/.test(nextCharacter);
  if (!canEndValue || !canStartValueOrProperty || previousCharacter === ',') return null;
  return `${candidate.slice(0, next)},${candidate.slice(next)}`;
}

function parseWithLocalRepairs(candidate) {
  let repaired = candidate;
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_LOCAL_REPAIRS; attempt += 1) {
    try {
      return JSON.parse(repaired);
    } catch (error) {
      lastError = error;
      const next = repairMissingComma(repaired, error);
      if (!next || next === repaired) break;
      repaired = next;
    }
  }
  if (/Unexpected end of JSON input|end of data/i.test(lastError?.message || '')) {
    throw new Error('模型输出中的 JSON 对象不完整，可能因输出长度限制被截断');
  }
  throw lastError;
}

export function parseBrandDnaResponse(value) {
  const candidate = extractJsonCandidate(value);
  try {
    return parseWithLocalRepairs(candidate);
  } catch (error) {
    throw new Error(`Brand DNA JSON 解析失败：${error.message}`);
  }
}
