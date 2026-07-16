import fs from 'node:fs/promises';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import type { ConnectionTestResult, ProviderKind, PublicSettings, SaveSettingsInput } from '../shared/types';
import { redactSecret } from './analysis-contract';

interface StoredSettings {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  encryptedApiKey?: string;
  defaultDataPath: string;
  cacheEnabled: boolean;
  logLevel: 'error' | 'info' | 'debug';
  connectionStatus: 'untested' | 'connected' | 'failed';
}

export interface ProviderCredentials {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function defaults(): StoredSettings {
  return {
    provider: 'qwen',
    baseUrl: '',
    model: '',
    defaultDataPath: path.join(app.getPath('documents'), 'Masterpiece OS Data'),
    cacheEnabled: true,
    logLevel: 'info',
    connectionStatus: 'untested'
  };
}

async function readStored(): Promise<StoredSettings> {
  try {
    return { ...defaults(), ...JSON.parse(await fs.readFile(settingsPath(), 'utf8')) } as StoredSettings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return defaults();
    throw error;
  }
}

async function writeStored(settings: StoredSettings): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function publicSettings(settings: StoredSettings): PublicSettings {
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    hasApiKey: Boolean(settings.encryptedApiKey),
    defaultDataPath: settings.defaultDataPath,
    cacheEnabled: settings.cacheEnabled,
    logLevel: settings.logLevel,
    connectionStatus: settings.connectionStatus
  };
}

async function encryptApiKey(apiKey: string): Promise<string> {
  if (!await safeStorage.isAsyncEncryptionAvailable()) {
    throw new Error('系统安全凭据服务不可用，API Key 未保存');
  }
  return (await safeStorage.encryptStringAsync(apiKey)).toString('base64');
}

async function decryptApiKey(value: string): Promise<string> {
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('系统安全凭据服务暂时不可用');
  const decrypted = await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'));
  return decrypted.result;
}

export async function getSettings(): Promise<PublicSettings> {
  return publicSettings(await readStored());
}

export async function saveSettings(input: SaveSettingsInput): Promise<PublicSettings> {
  const previous = await readStored();
  const next: StoredSettings = {
    provider: input.provider,
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
    defaultDataPath: path.resolve(input.defaultDataPath),
    cacheEnabled: input.cacheEnabled,
    logLevel: input.logLevel,
    connectionStatus: 'untested',
    encryptedApiKey: previous.encryptedApiKey
  };
  if (input.apiKey?.trim()) next.encryptedApiKey = await encryptApiKey(input.apiKey.trim());
  await writeStored(next);
  return publicSettings(next);
}

export async function deleteCredentials(): Promise<PublicSettings> {
  const settings = await readStored();
  delete settings.encryptedApiKey;
  settings.connectionStatus = 'untested';
  await writeStored(settings);
  return publicSettings(settings);
}

export async function getProviderCredentials(
  overrides: Partial<SaveSettingsInput> & { apiKey?: string } = {}
): Promise<ProviderCredentials> {
  const stored = await readStored();
  const apiKey = overrides.apiKey?.trim()
    || (stored.encryptedApiKey ? await decryptApiKey(stored.encryptedApiKey) : '');
  const credentials = {
    provider: overrides.provider || stored.provider,
    baseUrl: String(overrides.baseUrl ?? stored.baseUrl).trim(),
    model: String(overrides.model ?? stored.model).trim(),
    apiKey
  };
  if (!credentials.apiKey) throw new Error('API Key 尚未配置');
  if (!credentials.baseUrl) throw new Error('Base URL 尚未配置');
  if (!credentials.model) throw new Error('Model ID 尚未配置');
  return credentials;
}

function endpoint(baseUrl: string): string {
  let parsed: URL;
  try { parsed = new URL(baseUrl); }
  catch { throw new Error('Base URL 格式无效'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Base URL 必须使用 HTTP(S)');
  return parsed.pathname.endsWith('/chat/completions')
    ? parsed.toString()
    : `${parsed.toString().replace(/\/$/, '')}/chat/completions`;
}

const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export async function testConnection(
  overrides: Partial<SaveSettingsInput> & { apiKey?: string } = {}
): Promise<ConnectionTestResult> {
  const credentials = await getProviderCredentials(overrides);
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(endpoint(credentials.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: credentials.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: TEST_IMAGE } },
            { type: 'text', text: 'Reply with OK if you can read this image.' }
          ]
        }],
        max_tokens: 8,
        stream: false
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* bounded below */ }
    if (!response.ok) {
      const providerError = body.error as { message?: string; code?: string } | undefined;
      const detail = providerError?.message || providerError?.code || response.statusText;
      if (response.status === 401 || response.status === 403) throw new Error('API Key 无效或无权访问该模型');
      if (response.status === 404) throw new Error('Base URL 或 Model ID 不存在');
      if (/image|vision|multimodal/i.test(String(detail))) throw new Error('当前模型不支持图片输入');
      throw new Error(`连接失败（HTTP ${response.status}）：${detail}`);
    }
    const settings = await readStored();
    settings.connectionStatus = 'connected';
    await writeStored(settings);
    return {
      ok: true,
      message: '连接成功，模型可接收图片输入',
      model: String(body.model || credentials.model),
      supportsImages: true,
      elapsedMs: Math.round(performance.now() - started)
    };
  } catch (error) {
    const settings = await readStored();
    settings.connectionStatus = 'failed';
    await writeStored(settings).catch(() => {});
    const message = (error as Error).name === 'AbortError'
      ? '连接测试超时，请检查网络、Base URL 和模型状态'
      : redactSecret((error as Error).message, credentials.apiKey);
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}
