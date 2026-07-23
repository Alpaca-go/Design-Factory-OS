function extractJsonCandidate(value) {
  const text = String(value || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0) throw Object.assign(new Error('模型输出中未找到 JSON 对象'), { code: 'FAILED_SCHEMA' });
  return text.slice(start, end > start ? end + 1 : undefined)
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

// Complete only unambiguous EOF truncation: all strings must already be
// closed, every existing closer must match, the tail must contain a complete
// JSON value, and no more than a small number of containers may be missing.
// This repairs responses such as `...}]}` that merely omitted the outer `]}`
// without inventing keys, values, strings, commas, or semantic content.
function closeJsonContainersAtEof(text, maxClosers = 8) {
  const stack = [];
  let inString = false;
  let escape = false;
  for (const char of text) {
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if (char === '}' || char === ']') {
      if (stack.pop() !== char) return text;
    }
  }
  if (inString || stack.length === 0 || stack.length > maxClosers) return text;
  const tail = text.trimEnd();
  if (!/(?:[}\]"\d]|true|false|null)$/u.test(tail)) return text;
  return `${tail}${stack.reverse().join('')}`;
}

/**
 * Repair common JSON syntax errors produced by large-language-model outputs,
 * especially in very long JSON (~20 k tokens) where the model may forget
 * commas between array / object elements.
 *
 * Fixes applied (only outside of string literals):
 *   1. `}\s*{`   → `}, {`   (missing comma between objects)
 *   2. `]\s*[`   → `], [`   (missing comma between arrays)
 *   3. value `"`  → value, `"` (missing comma before next string: property
 *      name, array string element, or next property value after a string)
 */
function repairJsonSyntax(text) {
  let result = '';
  let inString = false;
  let escape = false;
  let lastSignificantChar = null; // last non-whitespace char outside strings

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      result += char;
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
        lastSignificantChar = '"';
      }
      continue;
    }

    if (char === '"') {
      // A new string literal starts. If the previous significant character
      // looks like the end of a value (number, true/false/null literal,
      // closing quote, `}` or `]`), the model probably forgot a comma.
      if (lastSignificantChar && /[0-9a-z"\}\]]/i.test(lastSignificantChar)) {
        result += ',';
      }
      result += char;
      inString = true;
      continue;
    }

    result += char;

    if (!/\s/.test(char)) {
      lastSignificantChar = char;
    }

    if (char === '}' || char === ']') {
      // `}` or `]` immediately followed by `{` or `[` → missing comma
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (j < text.length && (text[j] === '{' || text[j] === '[')) {
        result += ',';
      }
    }
  }

  return result;
}

export function parseStructuredResponse(value) {
  const candidate = extractJsonCandidate(value);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    // Attempt to repair common LLM JSON syntax errors before giving up.
    const repaired = repairJsonSyntax(candidate);
    try {
      return JSON.parse(repaired);
    } catch {
      const closed = closeJsonContainersAtEof(repaired);
      try {
        return JSON.parse(closed);
      } catch {
        // Repair did not help — preserve the original error message.
        throw Object.assign(new Error(`结构化 JSON 解析失败：${error.message}`), { code: 'FAILED_SCHEMA', cause: error });
      }
    }
  }
}
