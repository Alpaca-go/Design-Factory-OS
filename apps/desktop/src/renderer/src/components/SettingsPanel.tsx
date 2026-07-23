import { useState } from 'react';
import type {
  ApiProfile,
  PublicSettings,
  SaveApiProfileInput,
  SaveSettingsInput
} from '../../../shared/types';
import { cleanError } from '../utils';

interface Props {
  settings: PublicSettings;
  onSaved(settings: PublicSettings): void;
  onClose(): void;
}

function profileInput(profile?: ApiProfile): SaveApiProfileInput {
  return {
    id: profile?.id,
    displayName: profile?.displayName || '',
    provider: profile?.provider || '',
    modelId: profile?.modelId || '',
    baseUrl: profile?.baseUrl || '',
    apiKey: '',
    isDefault: profile?.isDefault || false,
    isEnabled: profile?.isEnabled ?? true
  };
}

function statusLabel(profile: ApiProfile): string {
  if (profile.lastTestStatus === 'success') return '连接正常';
  if (profile.lastTestStatus === 'failed') return '连接失败';
  return '尚未测试';
}

export function SettingsPanel({ settings, onSaved, onClose }: Props) {
  const [localForm, setLocalForm] = useState<SaveSettingsInput>({
    defaultDataPath: settings.defaultDataPath,
    cacheEnabled: settings.cacheEnabled,
    logLevel: settings.logLevel
  });
  const [editor, setEditor] = useState<SaveApiProfileInput | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const updateLocal = <K extends keyof SaveSettingsInput>(key: K, value: SaveSettingsInput[K]) => {
    setLocalForm((current) => ({ ...current, [key]: value }));
  };
  const updateProfile = <K extends keyof SaveApiProfileInput>(key: K, value: SaveApiProfileInput[K]) => {
    setEditor((current) => current ? { ...current, [key]: value } : current);
  };

  async function perform(key: string, action: () => Promise<PublicSettings>, message: string) {
    setBusy(key);
    setNotice(null);
    try {
      const next = await action();
      onSaved(next);
      setNotice({ tone: 'ok', text: message });
      return next;
    } catch (error) {
      setNotice({ tone: 'error', text: cleanError(error) });
      return null;
    } finally {
      setBusy('');
    }
  }

  async function saveLocal() {
    await perform('local', () => window.masterpiece.settings.save(localForm), '本地设置已保存。');
  }

  async function saveProfile() {
    if (!editor) return;
    const next = await perform(
      'profile-save',
      () => window.masterpiece.settings.saveProfile(editor),
      'API Profile 已保存，Key 已写入独立的系统安全凭据文件。'
    );
    if (next) {
      setEditor(null);
      setShowKey(false);
    }
  }

  async function testProfile(input: SaveApiProfileInput, busyKey: string) {
    setBusy(busyKey);
    setNotice(null);
    try {
      const result = await window.masterpiece.settings.testProfile(input);
      onSaved(await window.masterpiece.settings.get());
      setNotice({ tone: 'ok', text: `${result.message} · ${result.elapsedMs} ms` });
    } catch (error) {
      onSaved(await window.masterpiece.settings.get().catch(() => settings));
      setNotice({ tone: 'error', text: cleanError(error) });
    } finally {
      setBusy('');
    }
  }

  async function removeProfile(profile: ApiProfile) {
    if (!window.confirm(`确定删除 API Profile“${profile.displayName}”吗？\n对应的安全凭据也会同步删除。`)) return;
    await perform(
      `delete-${profile.id}`,
      () => window.masterpiece.settings.deleteProfile(profile.id),
      `已删除“${profile.displayName}”及其安全凭据。`
    );
    if (editor?.id === profile.id) setEditor(null);
  }

  return <div className="page settings-page">
    <header className="page-header">
      <div><p className="eyebrow">SYSTEM SETTINGS</p><h1>API 与模型</h1><p>每个 Profile 的 Key 独立加密，不进入设置 JSON、项目、报告或日志。</p></div>
      <button className="button ghost" onClick={onClose}>返回</button>
    </header>

    {notice && <div className={`notice ${notice.tone}`}>{notice.text}</div>}

    <div className="settings-grid">
      <section className="panel form-panel">
        <div className="section-heading">
          <span>01</span>
          <div><h2>API Profile 列表</h2><p>可新增、编辑、测试、启停并设置默认配置</p></div>
          <button className="button text-button" onClick={() => { setEditor(profileInput()); setShowKey(false); }}>+ 添加 API 配置</button>
        </div>

        {settings.profiles.length ? <div className="profile-list">
          {settings.profiles.map((profile) => <article className={`api-profile-card ${profile.isEnabled ? '' : 'disabled'}`} key={profile.id}>
            <div className="api-profile-title">
              <div>
                <span className={`status-dot ${profile.lastTestStatus === 'success' ? 'connected' : profile.lastTestStatus === 'failed' ? 'failed' : 'untested'}`} />
                <strong>{profile.displayName}</strong>
              </div>
              <div className="profile-tags">{profile.isDefault && <span>默认</span>}{!profile.isEnabled && <span>已停用</span>}</div>
            </div>
            <dl>
              <div><dt>Provider</dt><dd>{profile.provider}</dd></div>
              <div><dt>Model</dt><dd>{profile.modelId}</dd></div>
              <div><dt>状态</dt><dd>{statusLabel(profile)} · {profile.hasApiKey ? 'Key 已保存' : '缺少 Key'}</dd></div>
            </dl>
            <div className="button-row compact-buttons">
              <button className="button secondary" disabled={Boolean(busy) || !profile.isEnabled} onClick={() => void testProfile(profileInput(profile), `test-${profile.id}`)}>{busy === `test-${profile.id}` ? '测试中…' : '测试连接'}</button>
              <button className="button ghost" disabled={Boolean(busy)} onClick={() => { setEditor(profileInput(profile)); setShowKey(false); }}>编辑</button>
              {!profile.isDefault && <button className="button ghost" disabled={Boolean(busy) || !profile.isEnabled} onClick={() => void perform(`default-${profile.id}`, () => window.masterpiece.settings.setDefaultProfile(profile.id), '默认 API Profile 已更新。')}>设为默认</button>}
              <button className="button ghost" disabled={Boolean(busy)} onClick={() => void perform(`enable-${profile.id}`, () => window.masterpiece.settings.setProfileEnabled(profile.id, !profile.isEnabled), profile.isEnabled ? 'API Profile 已停用。' : 'API Profile 已启用。')}>{profile.isEnabled ? '停用' : '启用'}</button>
              <button className="button danger" disabled={Boolean(busy)} onClick={() => void removeProfile(profile)}>删除</button>
            </div>
          </article>)}
        </div> : <div className="empty-profile-list"><strong>尚未配置 API Profile</strong><p>添加任意厂商提供的 OpenAI-compatible 多模态端点后即可开始分析。</p><button className="button primary" onClick={() => setEditor(profileInput())}>添加第一个配置</button></div>}

        {editor && <div className="profile-editor">
          <div className="section-heading compact"><span>+</span><div><h2>{editor.id ? '编辑 API 配置' : '新增 API 配置'}</h2><p>API Key 留空时保留已保存的凭据</p></div></div>
          <label>配置名称<input value={editor.displayName} placeholder="例如：千问 VL Plus / GPT Vision / 本地模型" onChange={(event) => updateProfile('displayName', event.target.value)} /></label>
          <label>Provider 标识<input list="provider-suggestions" value={editor.provider} placeholder="自由输入，例如 aliyun-bailian" onChange={(event) => updateProfile('provider', event.target.value)} /><small className="field-help">仅作为配置与运行记录标识，不限制厂商；请求协议需兼容 OpenAI Chat Completions。</small></label>
          <datalist id="provider-suggestions">
            <option value="aliyun-bailian" />
            <option value="openai" />
            <option value="azure-openai" />
            <option value="deepseek" />
            <option value="siliconflow" />
            <option value="openrouter" />
            <option value="local-openai-compatible" />
          </datalist>
          <label>API Key<div className="secret-field"><input type={showKey ? 'text' : 'password'} value={editor.apiKey || ''} placeholder={editor.id ? '留空则保持现有 Key' : '输入 API Key'} onChange={(event) => updateProfile('apiKey', event.target.value)} /><button onClick={() => setShowKey(!showKey)} type="button">{showKey ? '隐藏' : '显示'}</button></div></label>
          <label>Base URL<input value={editor.baseUrl} placeholder="https://…/compatible-mode/v1" onChange={(event) => updateProfile('baseUrl', event.target.value)} /></label>
          <label>Model ID<input value={editor.modelId} placeholder="输入端点实际支持的多模态 Model ID" onChange={(event) => updateProfile('modelId', event.target.value)} /></label>
          <div className="field-grid">
            <label className="toggle"><input type="checkbox" checked={editor.isEnabled} onChange={(event) => updateProfile('isEnabled', event.target.checked)} /><span>启用此配置</span></label>
            <label className="toggle"><input type="checkbox" checked={editor.isDefault} onChange={(event) => updateProfile('isDefault', event.target.checked)} /><span>设为默认配置</span></label>
          </div>
          <div className="button-row">
            <button className="button primary" disabled={Boolean(busy)} onClick={() => void saveProfile()}>{busy === 'profile-save' ? '保存中…' : '保存配置'}</button>
            <button className="button secondary" disabled={Boolean(busy)} onClick={() => void testProfile(editor, 'editor-test')}>{busy === 'editor-test' ? '测试中…' : '测试图片连接'}</button>
            <button className="button ghost" disabled={Boolean(busy)} onClick={() => setEditor(null)}>取消编辑</button>
          </div>
        </div>}
      </section>

      <aside className="panel side-panel">
        <div className="section-heading"><span>02</span><div><h2>本地行为</h2><p>项目数据始终位于仓库之外</p></div></div>
        <label>项目数据目录<input value={localForm.defaultDataPath} onChange={(event) => updateLocal('defaultDataPath', event.target.value)} /></label>
        <label className="toggle"><input type="checkbox" checked={localForm.cacheEnabled} onChange={(event) => updateLocal('cacheEnabled', event.target.checked)} /><span>启用视觉准备与精确结果缓存</span></label>
        <label>日志级别<select value={localForm.logLevel} onChange={(event) => updateLocal('logLevel', event.target.value as SaveSettingsInput['logLevel'])}><option value="error">仅错误</option><option value="info">标准</option><option value="debug">调试</option></select></label>
        <button className="button primary full" disabled={Boolean(busy)} onClick={() => void saveLocal()}>{busy === 'local' ? '保存中…' : '保存本地设置'}</button>
        <div className="security-card"><strong>Windows 安全存储</strong><p>每个 API Key 使用 Electron safeStorage 加密后独立保存，仅在主进程发起请求时短暂解密。删除 Profile 会同步删除对应凭据。</p></div>
      </aside>
    </div>
  </div>;
}
