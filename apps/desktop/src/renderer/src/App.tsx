import { useEffect, useState } from 'react';
import type { AnalysisProgress, AssetSummary, ProjectRecord, PublicSettings } from '../../shared/types';
import { AnalysisView } from './components/AnalysisView';
import { ProjectWizard } from './components/ProjectWizard';
import { ReportView } from './components/ReportView';
import { SettingsPanel } from './components/SettingsPanel';
import { cleanError, formatBytes, formatDuration } from './utils';

type Screen = 'home' | 'settings' | 'create' | 'project' | 'analysis' | 'report';

function StatusBadge({ status }: { status: ProjectRecord['status'] }) {
  const labels: Record<ProjectRecord['status'], string> = { draft: '待导入', ready: '可分析', running: '分析中', completed: '已完成', failed: '失败', cancelled: '已取消' };
  return <span className={`badge ${status}`}>{labels[status]}</span>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selected, setSelected] = useState<ProjectRecord | null>(null);
  const [assets, setAssets] = useState<AssetSummary | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [nextSettings, nextProjects] = await Promise.all([window.masterpiece.settings.get(), window.masterpiece.projects.list()]);
    setSettings(nextSettings); setProjects(nextProjects);
    return { settings: nextSettings, projects: nextProjects };
  }

  useEffect(() => {
    void refresh().then(({ settings: loaded, projects: existing }) => {
      if (!loaded.hasApiKey && existing.length === 0) setScreen('settings');
    }).catch((reason) => setError(cleanError(reason))).finally(() => setLoading(false));
    return window.masterpiece.analysis.onProgress((event) => setProgress(event));
  }, []);

  async function openProject(project: ProjectRecord) {
    setSelected(project); setError(''); setScreen(project.status === 'completed' ? 'report' : 'project');
    try { setAssets(await window.masterpiece.projects.scanAssets(project.id)); }
    catch (reason) { setError(cleanError(reason)); }
  }

  async function refreshSelected(projectId: string) {
    const project = await window.masterpiece.projects.get(projectId);
    setSelected(project);
    setProjects(await window.masterpiece.projects.list());
    return project;
  }

  async function run(project: ProjectRecord, forceReasoning: boolean) {
    setSelected(project); setError(''); setProgress(null); setScreen('analysis');
    try {
      await window.masterpiece.analysis.start(project.id, forceReasoning);
      const updated = await refreshSelected(project.id);
      setScreen('report'); setSelected(updated);
    } catch (reason) {
      setError(cleanError(reason));
      const updated = await refreshSelected(project.id).catch(() => project);
      setSelected(updated); setScreen('project');
    }
  }

  async function importMore(kind: 'assets' | 'logo' | 'brief') {
    if (!selected) return;
    const paths = await window.masterpiece.projects.chooseFiles(kind);
    if (!paths.length) return;
    try {
      const result = await window.masterpiece.projects.importFiles(selected.id, paths, kind);
      setAssets(result.summary); await refreshSelected(selected.id);
    } catch (reason) { setError(cleanError(reason)); }
  }

  if (loading || !settings) return <div className="splash"><div className="brand-mark">M</div><p>正在启动 Masterpiece OS…</p></div>;

  if (screen === 'settings') return <SettingsPanel settings={settings} onSaved={setSettings} onClose={() => setScreen('home')} />;
  if (screen === 'create') return <ProjectWizard settings={settings} onCancel={() => setScreen('home')} onCreated={(project) => { setSelected(project); void openProject(project); void refresh(); }} />;
  if (screen === 'analysis' && selected) return <AnalysisView project={selected} progress={progress} onCancel={() => window.masterpiece.analysis.cancel(selected.id)} />;
  if (screen === 'report' && selected) return <ReportView project={selected} onBack={() => setScreen('project')} onRerun={(force) => void run(selected, force)} />;

  if (screen === 'project' && selected) return <div className="page project-page">
    <header className="page-header"><div><p className="eyebrow">PROJECT WORKSPACE</p><div className="title-line"><h1>{selected.projectName}</h1><StatusBadge status={selected.status} /></div><p>{selected.brandName} · {selected.industry}</p></div><div className="button-row"><button className="button ghost" onClick={() => { setScreen('home'); void refresh(); }}>返回首页</button>{selected.status === 'completed' && <button className="button secondary" onClick={() => setScreen('report')}>查看报告</button>}</div></header>
    {error && <div className="notice error top-notice">{error}</div>}
    <div className="project-grid">
      <section className="panel assets-panel">
        <div className="section-heading"><span>01</span><div><h2>视觉素材</h2><p>{assets?.totalFiles ?? selected.assetCount} 个文件 · {assets ? formatBytes(assets.totalBytes) : '正在读取'}</p></div><button className="button text-button" onClick={() => importMore('assets')}>+ 添加素材</button></div>
        {assets?.items.length ? <div className="asset-grid">{assets.items.map((item) => <div className="asset-card" key={item.relativePath}>{item.thumbnailDataUrl ? <img src={item.thumbnailDataUrl} alt="" /> : <div className={`file-placeholder ${item.kind}`}>{item.extension.replace('.', '').toUpperCase()}</div>}<strong title={item.relativePath}>{item.name}</strong><small>{formatBytes(item.bytes)}</small>{item.warning && <em>{item.warning}</em>}</div>)}</div> : <div className="empty-state"><strong>尚未导入素材</strong><p>支持 ZIP、JPG、JPEG、PNG、WEBP 和 PDF。</p><button className="button secondary" onClick={() => importMore('assets')}>选择视觉方案</button></div>}
      </section>
      <aside className="panel project-sidebar">
        <div className="section-heading"><span>02</span><div><h2>运行前检查</h2><p>必须全部明确</p></div></div>
        <ul className="check-list"><li className={assets?.totalFiles ? 'pass' : ''}><span>{assets?.totalFiles ? '✓' : '!'}</span>项目素材不为空</li><li className={selected.industry ? 'pass' : ''}><span>✓</span>行业事实：{selected.industry}</li><li className="pass"><span>✓</span>Logo：{selected.logoLocked ? '锁定' : '已授权重设计'}</li><li className={settings.hasApiKey ? 'pass' : ''}><span>{settings.hasApiKey ? '✓' : '!'}</span>API Key 已安全保存</li><li className={settings.baseUrl && settings.model ? 'pass' : ''}><span>{settings.baseUrl && settings.model ? '✓' : '!'}</span>{settings.model || '模型未配置'}</li></ul>
        <div className="facts-box"><small>用户锁定事实</small>{selected.lockedFacts.length ? selected.lockedFacts.map((fact) => <p key={fact}>{fact}</p>) : <p>无额外锁定项</p>}<button className="button text-button" onClick={() => importMore('logo')}>+ 补充独立 Logo</button><button className="button text-button" onClick={() => importMore('brief')}>+ 补充说明文件</button></div>
        <div className="profile-card"><small>默认分析模式</small><strong>融合增强</strong><p>一次多模态调用，强化事实判断、真实触点、材料与工艺。</p></div>
        <button className="button primary full" disabled={!assets?.totalFiles || !settings.hasApiKey || !settings.baseUrl || !settings.model} onClick={() => void run(selected, true)}>开始分析</button>
        <button className="button ghost full" disabled={!selected.lastReportFilename} onClick={() => void run(selected, false)}>使用精确缓存</button>
      </aside>
    </div>
  </div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="logo-lockup"><div className="brand-mark">M</div><div><strong>Masterpiece OS</strong><small>Desktop / v5</small></div></div><nav><button className="active">项目</button><button onClick={() => setScreen('settings')}>设置</button></nav><div className="sidebar-footer"><span className={`status-dot ${settings.connectionStatus}`} /><div><small>当前模型</small><strong>{settings.model || '未配置'}</strong></div></div></aside>
    <main className="home-main"><header className="home-header"><div><p className="eyebrow">CREATIVE DIRECTOR PREPARATION SYSTEM</p><h1>让视觉判断<br />成为可执行的系统。</h1></div><div className="header-actions"><button className="button ghost" onClick={() => setScreen('settings')}>API 设置</button><button className="button primary large" onClick={() => setScreen('create')}>新建视觉分析 <span>↗</span></button></div></header>
      {!settings.hasApiKey && <div className="setup-banner"><div><strong>完成首次 API 配置</strong><p>Provider、Base URL、Model ID 与系统安全凭据尚未全部就绪。</p></div><button className="button secondary" onClick={() => setScreen('settings')}>前往设置</button></div>}
      {error && <div className="notice error">{error}</div>}
      <section className="recent-section"><div className="section-title"><div><span>RECENT PROJECTS</span><h2>最近项目</h2></div><small>{projects.length} 个本地项目</small></div>
        {projects.length ? <div className="project-list">{projects.map((project, index) => <button className="project-row" key={project.id} onClick={() => void openProject(project)}><span className="project-index">{String(index + 1).padStart(2, '0')}</span><div className="project-name"><strong>{project.projectName}</strong><small>{project.industry} · {project.assetCount} 个素材</small></div><StatusBadge status={project.status} /><div className="project-model"><small>MODEL</small><strong>{project.model || '—'}</strong></div><div className="project-time"><small>DURATION</small><strong>{formatDuration(project.lastDurationMs)}</strong></div><span className="row-arrow">→</span></button>)}</div> : <div className="empty-home"><div className="empty-orbit" /><strong>还没有分析项目</strong><p>创建项目、导入视觉方案，开始第一次融合增强分析。</p><button className="button primary" onClick={() => setScreen('create')}>创建第一个项目</button></div>}
      </section>
    </main>
  </div>;
}
