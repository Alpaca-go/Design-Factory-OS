import { useEffect, useState } from 'react';
import type { PublicSettings, SaveSettingsInput } from '../../../shared/types';
import { cleanError } from '../utils';

interface Props {
  settings: PublicSettings;
  onSaved(settings: PublicSettings): void;
  onClose(): void;
}

export function SettingsPanel({ settings, onSaved, onClose }: Props) {
  const [form, setForm] = useState<SaveSettingsInput>({
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    defaultDataPath: settings.defaultDataPath,
    cacheEnabled: settings.cacheEnabled,
    logLevel: settings.logLevel,
    apiKey: ''
  });
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setForm((current) => ({ ...current, provider: settings.provider, baseUrl: settings.baseUrl, model: settings.model }));
  }, [settings]);

  const update = <K extends keyof SaveSettingsInput>(key: K, value: SaveSettingsInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function save() {
    setBusy('save'); setNotice(null);
    try {
      const saved = await window.masterpiece.settings.save(form);
      onSaved(saved);
      setForm((current) => ({ ...current, apiKey: '' }));
      setNotice({ tone: 'ok', text: '设置已保存。API Key 已由系统安全凭据加密。' });
    } catch (error) { setNotice({ tone: 'error', text: cleanError(error) }); }
    finally { setBusy(null); }
  }

  async function test() {
    setBusy('test'); setNotice(null);
    try {
      const result = await window.masterpiece.settings.test(form);
      setNotice({ tone: 'ok', text: `${result.message} · ${result.elapsedMs} ms` });
      onSaved(await window.masterpiece.settings.get());
    } catch (error) { setNotice({ tone: 'error', text: cleanError(error) }); }
    finally { setBusy(null); }
  }

  async function removeKey() {
    setBusy('delete'); setNotice(null);
    try {
      const next = await window.masterpiece.settings.deleteCredentials();
      onSaved(next);
      setNotice({ tone: 'ok', text: '系统凭据中的 API Key 已删除。' });
    } catch (error) { setNotice({ tone: 'error', text: cleanError(error) }); }
    finally { setBusy(null); }
  }

  return <div className="page settings-page">
    <header className="page-header">
      <div><p className="eyebrow">SYSTEM SETTINGS</p><h1>模型与本地数据</h1><p>凭据不会写入项目、报告或日志。</p></div>
      <button className="button ghost" onClick={onClose}>返回</button>
    </header>

    <div className="settings-grid">
      <section className="panel form-panel">
        <div className="section-heading"><span>01</span><div><h2>API 连接</h2><p>支持 Qwen 与 OpenAI-compatible 多模态端点</p></div></div>
        <label>Provider<select value={form.provider} onChange={(event) => update('provider', event.target.value as SaveSettingsInput['provider'])}>
          <option value="qwen">Qwen</option>
          <option value="openai-compatible">OpenAI Compatible</option>
          <option value="custom-openai-compatible">Custom OpenAI Compatible</option>
        </select></label>
        <label>API Key<div className="secret-field"><input type={showKey ? 'text' : 'password'} value={form.apiKey} placeholder={settings.hasApiKey ? '已安全保存；留空则保持不变' : '输入 API Key'} onChange={(event) => update('apiKey', event.target.value)} /><button onClick={() => setShowKey(!showKey)} type="button">{showKey ? '隐藏' : '显示'}</button></div></label>
        <label>Base URL<input value={form.baseUrl} placeholder="https://…/compatible-mode/v1" onChange={(event) => update('baseUrl', event.target.value)} /></label>
        <label>Model ID<input value={form.model} placeholder="qwen3-vl-plus" onChange={(event) => update('model', event.target.value)} /></label>
        <div className="connection-line"><span className={`status-dot ${settings.connectionStatus}`} />当前状态：{settings.connectionStatus === 'connected' ? '连接正常' : settings.connectionStatus === 'failed' ? '连接失败' : '尚未测试'}</div>
        <div className="button-row"><button className="button primary" disabled={Boolean(busy)} onClick={save}>{busy === 'save' ? '保存中…' : '保存配置'}</button><button className="button secondary" disabled={Boolean(busy)} onClick={test}>{busy === 'test' ? '测试中…' : '测试图片连接'}</button></div>
        {notice && <div className={`notice ${notice.tone}`}>{notice.text}</div>}
      </section>

      <aside className="panel side-panel">
        <div className="section-heading"><span>02</span><div><h2>本地行为</h2><p>项目数据始终位于仓库之外</p></div></div>
        <label>项目数据目录<input value={form.defaultDataPath} onChange={(event) => update('defaultDataPath', event.target.value)} /></label>
        <label className="toggle"><input type="checkbox" checked={form.cacheEnabled} onChange={(event) => update('cacheEnabled', event.target.checked)} /><span>启用视觉准备与精确结果缓存</span></label>
        <label>日志级别<select value={form.logLevel} onChange={(event) => update('logLevel', event.target.value as SaveSettingsInput['logLevel'])}><option value="error">仅错误</option><option value="info">标准</option><option value="debug">调试</option></select></label>
        <div className="security-card"><strong>Windows 安全存储</strong><p>API Key 使用 Electron safeStorage，由当前 Windows 用户的 DPAPI 凭据保护。应用只在发起请求时于主进程内短暂解密。</p></div>
        <button className="button danger" disabled={!settings.hasApiKey || Boolean(busy)} onClick={removeKey}>{busy === 'delete' ? '删除中…' : '删除已保存凭据'}</button>
      </aside>
    </div>
  </div>;
}
