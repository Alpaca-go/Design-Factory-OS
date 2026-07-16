import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.json']);
const IMAGE_MIME_TYPES = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
});
const MAX_DOCUMENT_CHARACTERS = 250_000;
const MAX_IMAGE_EDGE = 1600;
const IMAGE_JPEG_QUALITY = 82;

export class QwenReasonerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QwenReasonerError';
    this.code = code;
  }
}

function redact(value, secret) {
  const message = String(value || '');
  return secret ? message.split(secret).join('[REDACTED]') : message;
}

function completionUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new QwenReasonerError('QWEN_BASE_URL_INVALID', 'QWEN_BASE_URL 必须是有效的 HTTP(S) 地址');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new QwenReasonerError('QWEN_BASE_URL_INVALID', 'QWEN_BASE_URL 只允许 HTTP(S) 地址');
  }
  return parsed.pathname.endsWith('/chat/completions')
    ? parsed.toString()
    : `${parsed.toString().replace(/\/$/, '')}/chat/completions`;
}

async function defaultClient(request) {
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: request.signal
  });
  const raw = await response.text();
  let value = null;
  try { value = raw ? JSON.parse(raw) : null; } catch { /* handled as a bounded provider error below */ }
  if (!response.ok) {
    const detail = value?.error?.message || value?.message || response.statusText || 'unknown error';
    throw new QwenReasonerError('QWEN_API_ERROR', `Qwen API 请求失败（HTTP ${response.status}）：${detail}`);
  }
  if (!value) throw new QwenReasonerError('QWEN_RESPONSE_INVALID', 'Qwen API 返回了无效 JSON');
  return value;
}

function responseText(response) {
  if (typeof response?.outputText === 'string') return response.outputText.trim();
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((item) => typeof item === 'string' ? item : item?.text || '').join('').trim();
  }
  return '';
}

async function buildMultimodalUserContent(prompt, diagnostics) {
  const userMessage = prompt.messages.find((message) => message.role === 'user');
  const content = [{ type: 'text', text: String(userMessage?.content || '') }];
  const inspectedAssetIds = [];
  for (const attachment of prompt.attachments) {
    if (!attachment.readable) {
      diagnostics.push({ assetId: attachment.assetId, status: 'skipped', reason: 'unreadable' });
      continue;
    }
    const extension = path.extname(attachment.path).toLowerCase();
    if (attachment.mediaType === 'image' && IMAGE_MIME_TYPES[extension]) {
      try {
        const optimized = await sharp(attachment.path, { animated: false })
          .rotate()
          .resize({
            width: MAX_IMAGE_EDGE,
            height: MAX_IMAGE_EDGE,
            fit: 'inside',
            withoutEnlargement: true
          })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: IMAGE_JPEG_QUALITY, mozjpeg: true })
          .toBuffer();
        const encoded = optimized.toString('base64');
        content.push({ type: 'text', text: `视觉附件 ${attachment.assetId}（${path.basename(attachment.path)}）` });
        content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${encoded}` } });
        inspectedAssetIds.push(attachment.assetId);
        diagnostics.push({
          assetId: attachment.assetId,
          status: 'attached-as-optimized-image',
          encodedBytes: optimized.length
        });
      } catch (error) {
        diagnostics.push({ assetId: attachment.assetId, status: 'skipped', reason: `read-failed:${error.code || error.name}` });
      }
      continue;
    }
    if (attachment.mediaType === 'document' && TEXT_EXTENSIONS.has(extension)) {
      try {
        const raw = await fs.readFile(attachment.path, 'utf8');
        const text = raw.slice(0, MAX_DOCUMENT_CHARACTERS);
        const suffix = raw.length > text.length ? '\n[文档因长度限制已截断]' : '';
        content.push({ type: 'text', text: `文档附件 ${attachment.assetId}（${path.basename(attachment.path)}）\n\n${text}${suffix}` });
        diagnostics.push({ assetId: attachment.assetId, status: 'attached-as-text' });
      } catch (error) {
        diagnostics.push({ assetId: attachment.assetId, status: 'skipped', reason: `read-failed:${error.code || error.name}` });
      }
      continue;
    }
    diagnostics.push({ assetId: attachment.assetId, status: 'manifest-only', reason: 'unsupported-direct-attachment' });
  }
  return { content, inspectedAssetIds };
}

/** Create a single-request Qwen multimodal adapter using the OpenAI-compatible endpoint. */
export function createQwenReasoner(options = {}) {
  const environment = options.environment || process.env;
  const apiKey = String(options.apiKey || environment.QWEN_API_KEY || '').trim();
  const model = String(options.model || environment.QWEN_MODEL || '').trim();
  const baseUrl = String(options.baseUrl || environment.QWEN_BASE_URL || DEFAULT_BASE_URL).trim();
  const client = options.client || defaultClient;
  const onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};

  if (!apiKey) {
    throw new QwenReasonerError('QWEN_API_KEY_MISSING', '未检测到 QWEN_API_KEY，无法运行真实 Qwen Deep Creative Director 分析');
  }
  if (!model) throw new QwenReasonerError('QWEN_MODEL_MISSING', '未配置 QWEN_MODEL，无法选择 Qwen 多模态模型');
  const url = completionUrl(baseUrl);

  return async function qwenReasoner(context) {
    const diagnostics = [];
    const prepared = await buildMultimodalUserContent(context.prompt, diagnostics);
    for (const diagnostic of diagnostics) onDiagnostic(Object.freeze({ ...diagnostic }));
    const systemMessage = context.prompt.messages.find((message) => message.role === 'system');
    const body = {
      model,
      messages: [
        { role: 'system', content: String(systemMessage?.content || '') },
        { role: 'user', content: prepared.content }
      ],
      stream: false
    };
    let response;
    try {
      response = await client({
        url,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: context.signal,
        maximumDurationMs: context.maximumDurationMs
      });
    } catch (error) {
      if (error instanceof QwenReasonerError) {
        error.message = redact(error.message, apiKey);
        throw error;
      }
      throw new QwenReasonerError('QWEN_REQUEST_FAILED', `Qwen 请求失败：${redact(error.message, apiKey)}`);
    }
    const reportMarkdown = responseText(response);
    if (!reportMarkdown) throw new QwenReasonerError('QWEN_EMPTY_REPORT', 'Qwen 返回了空报告，分析失败');
    return {
      runId: String(response.id || `qwen-${crypto.randomUUID()}`),
      provider: 'qwen',
      model: String(response.model || model),
      completedAt: new Date().toISOString(),
      reportMarkdown,
      benchmarkSources: [],
      inspectedAssetIds: prepared.inspectedAssetIds
    };
  };
}
