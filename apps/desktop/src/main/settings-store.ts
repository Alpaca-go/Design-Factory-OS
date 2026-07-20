import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import sharp from 'sharp';
import type {
  ApiProfile,
  ConnectionTestResult,
  DirectionGenerationMode,
  ProviderKind,
  PublicSettings,
  SaveApiProfileInput,
  SaveSettingsInput
} from '../shared/types';
import { redactSecret } from './analysis-contract';

interface StoredProfile extends Omit<ApiProfile, 'hasApiKey'> {}

interface StoredSettings {
  profiles: StoredProfile[];
  defaultProfileId: string | null;
  defaultDataPath: string;
  cacheEnabled: boolean;
  logLevel: 'error' | 'info' | 'debug';
  directionGenerationMode: DirectionGenerationMode;
}

const DIRECTION_GENERATION_MODES = Object.freeze(['conceptual_v1', 'execution_oriented_v2']);

interface LegacySettings {
  provider?: ProviderKind;
  baseUrl?: string;
  model?: string;
  encryptedApiKey?: string;
  defaultDataPath?: string;
  cacheEnabled?: boolean;
  logLevel?: 'error' | 'info' | 'debug';
  connectionStatus?: 'untested' | 'connected' | 'failed';
}

export interface ProviderCredentials {
  profileId: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function credentialsDirectory(): string {
  return path.join(app.getPath('userData'), 'credentials');
}

function credentialPath(profileId: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(profileId)) throw new Error('API Profile ID 无效');
  return path.join(credentialsDirectory(), `${profileId}.bin`);
}

function defaults(): StoredSettings {
  return {
    profiles: [],
    defaultProfileId: null,
    defaultDataPath: path.join(app.getPath('documents'), 'Masterpiece OS Data'),
    cacheEnabled: true,
    logLevel: 'info',
    directionGenerationMode: 'conceptual_v1'
  };
}

function profileStatus(profile: StoredProfile): PublicSettings['connectionStatus'] {
  if (profile.lastTestStatus === 'success') return 'connected';
  if (profile.lastTestStatus === 'failed') return 'failed';
  return 'untested';
}

async function hasCredential(profileId: string): Promise<boolean> {
  return fs.stat(credentialPath(profileId)).then((value) => value.isFile()).catch(() => false);
}

async function writeStored(settings: StoredSettings): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function migrateLegacy(value: LegacySettings): Promise<StoredSettings> {
  const migrated = defaults();
  migrated.defaultDataPath = value.defaultDataPath || migrated.defaultDataPath;
  migrated.cacheEnabled = value.cacheEnabled ?? migrated.cacheEnabled;
  migrated.logLevel = value.logLevel || migrated.logLevel;
  if (value.baseUrl || value.model || value.encryptedApiKey) {
    const now = new Date().toISOString();
    const id = 'profile-default';
    const profile: StoredProfile = {
      id,
      displayName: value.model || '默认 API 配置',
      provider: value.provider || 'openai-compatible',
      modelId: value.model || '',
      baseUrl: value.baseUrl || '',
      credentialKey: `masterpiece-os/${id}`,
      isDefault: true,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
      lastTestedAt: value.connectionStatus === 'untested' ? undefined : now,
      lastTestStatus: value.connectionStatus === 'connected'
        ? 'success'
        : value.connectionStatus === 'failed' ? 'failed' : undefined
    };
    migrated.profiles.push(profile);
    migrated.defaultProfileId = id;
    if (value.encryptedApiKey) {
      await fs.mkdir(credentialsDirectory(), { recursive: true });
      await fs.writeFile(credentialPath(id), Buffer.from(value.encryptedApiKey, 'base64'), { mode: 0o600 });
    }
  }
  await writeStored(migrated);
  return migrated;
}

async function readStored(): Promise<StoredSettings> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as StoredSettings | LegacySettings;
    if (!Array.isArray((parsed as StoredSettings).profiles)) return migrateLegacy(parsed as LegacySettings);
    const stored = { ...defaults(), ...(parsed as StoredSettings) };
    stored.profiles = stored.profiles.map((profile) => ({
      ...profile,
      provider: String(profile.provider || 'openai-compatible').trim(),
      credentialKey: profile.credentialKey || `masterpiece-os/${profile.id}`,
      isEnabled: profile.isEnabled !== false,
      isDefault: profile.id === stored.defaultProfileId
    }));
    return stored;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return defaults();
    throw error;
  }
}

async function publicSettings(settings: StoredSettings): Promise<PublicSettings> {
  const profiles = await Promise.all(settings.profiles.map(async (profile): Promise<ApiProfile> => ({
    ...profile,
    isDefault: profile.id === settings.defaultProfileId,
    hasApiKey: await hasCredential(profile.id)
  })));
  const defaultProfile = profiles.find((profile) => profile.id === settings.defaultProfileId)
    || profiles.find((profile) => profile.isEnabled)
    || null;
  return {
    profiles,
    defaultProfileId: defaultProfile?.id || null,
    provider: defaultProfile?.provider || '',
    baseUrl: defaultProfile?.baseUrl || '',
    model: defaultProfile?.modelId || '',
    hasApiKey: Boolean(defaultProfile?.hasApiKey),
    defaultDataPath: settings.defaultDataPath,
    cacheEnabled: settings.cacheEnabled,
    logLevel: settings.logLevel,
    directionGenerationMode: settings.directionGenerationMode,
    connectionStatus: defaultProfile ? profileStatus(defaultProfile) : 'untested'
  };
}

async function encryptApiKey(apiKey: string): Promise<Buffer> {
  if (!await safeStorage.isAsyncEncryptionAvailable()) {
    throw new Error('系统安全凭据服务不可用，API Key 未保存');
  }
  return safeStorage.encryptStringAsync(apiKey);
}

async function decryptApiKey(profileId: string): Promise<string> {
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('系统安全凭据服务暂时不可用');
  const encrypted = await fs.readFile(credentialPath(profileId)).catch(() => null);
  if (!encrypted) return '';
  const decrypted = await safeStorage.decryptStringAsync(encrypted);
  return decrypted.result;
}

async function saveCredential(profileId: string, apiKey: string): Promise<void> {
  await fs.mkdir(credentialsDirectory(), { recursive: true });
  await fs.writeFile(credentialPath(profileId), await encryptApiKey(apiKey), { mode: 0o600 });
}

export async function getSettings(): Promise<PublicSettings> {
  return publicSettings(await readStored());
}

export async function saveSettings(input: SaveSettingsInput): Promise<PublicSettings> {
  const settings = await readStored();
  settings.defaultDataPath = path.resolve(input.defaultDataPath);
  settings.cacheEnabled = input.cacheEnabled;
  settings.logLevel = input.logLevel;
  if (input.directionGenerationMode && DIRECTION_GENERATION_MODES.includes(input.directionGenerationMode)) {
    settings.directionGenerationMode = input.directionGenerationMode;
  }
  await writeStored(settings);
  return publicSettings(settings);
}

function validateProfileInput(input: SaveApiProfileInput): void {
  if (!input.displayName.trim()) throw new Error('配置名称不能为空');
  if (!input.provider.trim()) throw new Error('Provider 标识不能为空');
  if (!input.baseUrl.trim()) throw new Error('Base URL 不能为空');
  if (!input.modelId.trim()) throw new Error('Model ID 不能为空');
  if (input.isDefault && !input.isEnabled) throw new Error('默认 API Profile 必须保持启用');
}

export async function saveApiProfile(input: SaveApiProfileInput): Promise<PublicSettings> {
  validateProfileInput(input);
  const settings = await readStored();
  const current = input.id ? settings.profiles.find((profile) => profile.id === input.id) : undefined;
  if (input.id && !current) throw new Error('API Profile 不存在');
  const id = current?.id || `profile-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const connectionChanged = current ? (
    current.provider !== input.provider
    || current.modelId !== input.modelId.trim()
    || current.baseUrl !== input.baseUrl.trim()
    || Boolean(input.apiKey?.trim())
  ) : false;
  const profile: StoredProfile = {
    id,
    displayName: input.displayName.trim(),
    provider: input.provider.trim(),
    modelId: input.modelId.trim(),
    baseUrl: input.baseUrl.trim(),
    credentialKey: `masterpiece-os/${id}`,
    isDefault: input.isDefault || settings.profiles.length === 0,
    isEnabled: input.isEnabled,
    createdAt: current?.createdAt || now,
    updatedAt: now,
    lastTestedAt: connectionChanged ? undefined : current?.lastTestedAt,
    lastTestStatus: connectionChanged ? undefined : current?.lastTestStatus
  };
  settings.profiles = current
    ? settings.profiles.map((item) => item.id === id ? profile : item)
    : [...settings.profiles, profile];
  if (profile.isDefault) {
    settings.defaultProfileId = id;
    settings.profiles = settings.profiles.map((item) => ({ ...item, isDefault: item.id === id }));
  } else if (!settings.defaultProfileId) {
    settings.defaultProfileId = id;
    settings.profiles = settings.profiles.map((item) => ({ ...item, isDefault: item.id === id }));
  }
  if (!profile.isEnabled && settings.defaultProfileId === id) {
    settings.defaultProfileId = settings.profiles.find((item) => item.id !== id && item.isEnabled)?.id || null;
    settings.profiles = settings.profiles.map((item) => ({ ...item, isDefault: item.id === settings.defaultProfileId }));
  }
  if (input.apiKey?.trim()) await saveCredential(id, input.apiKey.trim());
  await writeStored(settings);
  return publicSettings(settings);
}

export async function deleteApiProfile(profileId: string): Promise<PublicSettings> {
  const settings = await readStored();
  if (!settings.profiles.some((profile) => profile.id === profileId)) throw new Error('API Profile 不存在');
  settings.profiles = settings.profiles.filter((profile) => profile.id !== profileId);
  await fs.rm(credentialPath(profileId), { force: true });
  if (settings.defaultProfileId === profileId) {
    settings.defaultProfileId = settings.profiles.find((profile) => profile.isEnabled)?.id || settings.profiles[0]?.id || null;
  }
  settings.profiles = settings.profiles.map((profile) => ({
    ...profile,
    isDefault: profile.id === settings.defaultProfileId
  }));
  await writeStored(settings);
  return publicSettings(settings);
}

export async function setDefaultApiProfile(profileId: string): Promise<PublicSettings> {
  const settings = await readStored();
  const profile = settings.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error('API Profile 不存在');
  if (!profile.isEnabled) throw new Error('停用的 API Profile 不能设为默认');
  settings.defaultProfileId = profileId;
  settings.profiles = settings.profiles.map((item) => ({ ...item, isDefault: item.id === profileId }));
  await writeStored(settings);
  return publicSettings(settings);
}

export async function setApiProfileEnabled(profileId: string, enabled: boolean): Promise<PublicSettings> {
  const settings = await readStored();
  if (!settings.profiles.some((profile) => profile.id === profileId)) throw new Error('API Profile 不存在');
  settings.profiles = settings.profiles.map((profile) => profile.id === profileId
    ? { ...profile, isEnabled: enabled, updatedAt: new Date().toISOString() }
    : profile);
  if (!enabled && settings.defaultProfileId === profileId) {
    settings.defaultProfileId = settings.profiles.find((profile) => profile.isEnabled)?.id || null;
  }
  settings.profiles = settings.profiles.map((profile) => ({
    ...profile,
    isDefault: profile.id === settings.defaultProfileId
  }));
  await writeStored(settings);
  return publicSettings(settings);
}

export async function getProviderCredentials(profileId?: string): Promise<ProviderCredentials> {
  const stored = await readStored();
  const profile = stored.profiles.find((item) => item.id === profileId)
    || stored.profiles.find((item) => item.id === stored.defaultProfileId)
    || stored.profiles.find((item) => item.isEnabled);
  if (!profile) throw new Error('尚未配置可用的 API Profile');
  if (!profile.isEnabled) throw new Error('所选 API Profile 已停用');
  const apiKey = await decryptApiKey(profile.id);
  if (!apiKey) throw new Error('所选 API Profile 尚未保存 API Key');
  if (!profile.baseUrl) throw new Error('Base URL 尚未配置');
  if (!profile.modelId) throw new Error('Model ID 尚未配置');
  return {
    profileId: profile.id,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    model: profile.modelId,
    apiKey
  };
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

async function connectionRequest(credentials: Omit<ProviderCredentials, 'profileId'>): Promise<ConnectionTestResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const testImage = await sharp({
      create: { width: 96, height: 96, channels: 3, background: { r: 112, g: 68, b: 216 } }
    }).png().toBuffer();
    const response = await fetch(endpoint(credentials.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: credentials.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${testImage.toString('base64')}` } },
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
      if (/(does not support|unsupported|not capable).*(image|vision|multimodal)|(image|vision|multimodal).*(not supported|unsupported)/i.test(String(detail))) {
        throw new Error('当前模型或部署端点明确不支持图片输入');
      }
      throw new Error(`连接失败（HTTP ${response.status}）：${detail}`);
    }
    return {
      ok: true,
      message: '连接成功，模型可接收图片输入',
      model: String(body.model || credentials.model),
      supportsImages: true,
      elapsedMs: Math.round(performance.now() - started)
    };
  } catch (error) {
    const message = (error as Error).name === 'AbortError'
      ? '连接测试超时，请检查网络、Base URL 和模型状态'
      : redactSecret((error as Error).message, credentials.apiKey);
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function testApiProfile(input: SaveApiProfileInput): Promise<ConnectionTestResult> {
  validateProfileInput(input);
  const storedKey = input.id ? await decryptApiKey(input.id) : '';
  const apiKey = input.apiKey?.trim() || storedKey;
  if (!apiKey) throw new Error('请先输入或保存 API Key');
  try {
    const result = await connectionRequest({
      provider: input.provider,
      baseUrl: input.baseUrl.trim(),
      model: input.modelId.trim(),
      apiKey
    });
    if (input.id) {
      const settings = await readStored();
      settings.profiles = settings.profiles.map((profile) => profile.id === input.id
        ? { ...profile, lastTestedAt: new Date().toISOString(), lastTestStatus: 'success' }
        : profile);
      await writeStored(settings);
    }
    return result;
  } catch (error) {
    if (input.id) {
      const settings = await readStored();
      settings.profiles = settings.profiles.map((profile) => profile.id === input.id
        ? { ...profile, lastTestedAt: new Date().toISOString(), lastTestStatus: 'failed' }
        : profile);
      await writeStored(settings).catch(() => {});
    }
    throw error;
  }
}
