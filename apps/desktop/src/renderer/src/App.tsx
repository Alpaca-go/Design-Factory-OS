import { useEffect, useMemo, useState } from 'react';
import type {
  AnalysisProgress,
  AssetSummary,
  ProjectRecord,
  PublicSettings,
  ReferenceTranslationRunRecord,
  VisualTranslationRunRecord
} from '../../shared/types';
import { AnalysisModeTabs, type AnalysisMode } from './components/AnalysisModeTabs';
import { AnalysisView } from './components/AnalysisView';
import { ProjectWizard } from './components/ProjectWizard';
import { ReportView } from './components/ReportView';
import { SettingsPanel } from './components/SettingsPanel';
import { VisualTranslationWorkspace } from './components/VisualTranslationWorkspace';
import { ReferenceTranslationWorkspace } from './components/ReferenceTranslationWorkspace';
import { cleanError, formatBytes, formatDuration } from './utils';

type Screen = 'home' | 'settings' | 'create' | 'project' | 'analysis' | 'report';

function StatusBadge({ status }: { status: ProjectRecord['status'] }) {
  const labels: Record<ProjectRecord['status'], string> = { draft: '待导入', ready: '可分析', running: '分析中', completed: '已完成', failed: '失败', cancelled: '已取消' };
  return <span className={`badge ${status}`}>{labels[status]}</span>;
}

function TranslationStatusBadge({ status }: { status: VisualTranslationRunRecord['status'] }) {
  const labels: Record<VisualTranslationRunRecord['status'], string> = { pending: '等待中', running: '运行中', completed: '已完成', failed: '失败', timed_out: '已超时', cancelled: '已取消' };
  return <span className={`badge ${status}`}>{labels[status]}</span>;
}

function ReconstructionStatusBadge({ status }: { status: ReferenceTranslationRunRecord['status'] }) {
  const labels: Record<ReferenceTranslationRunRecord['status'], string> = {
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  };
  return <span className={`badge ${status}`}>{labels[status]}</span>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [translationRuns, setTranslationRuns] = useState<VisualTranslationRunRecord[]>([]);
  const [reconstructionRuns, setReconstructionRuns] = useState<ReferenceTranslationRunRecord[]>([]);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('visual-analysis');
  const [requestedTranslationRunId, setRequestedTranslationRunId] = useState('');
  const [requestedReconstructionRunId, setRequestedReconstructionRunId] = useState('');
  const [selected, setSelected] = useState<ProjectRecord | null>(null);
  const [selectedApiProfileId, setSelectedApiProfileId] = useState('');
  const [settingsReturnScreen, setSettingsReturnScreen] = useState<Screen>('home');
  const [assets, setAssets] = useState<AssetSummary | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState('');
  const [runFailure, setRunFailure] = useState('');
  const [deletingProjectId, setDeletingProjectId] = useState('');
  const [deletingRunId, setDeletingRunId] = useState('');
  const [deletingReconstructionRunId, setDeletingReconstructionRunId] = useState('');
  const [loading, setLoading] = useState(true);
  const enabledProfiles = settings?.profiles.filter((profile) => profile.isEnabled) || [];
  const selectedProfile = enabledProfiles.find((profile) => profile.id === selectedApiProfileId)
    || enabledProfiles.find((profile) => profile.isDefault)
    || enabledProfiles[0];
  const batches = useMemo(() => {
    const result = new Map<string, { label: string; count: number }>();
    for (const item of assets?.items || []) {
      const current = result.get(item.batchId);
      const label = item.archiveSourceName || (item.sourceType === 'folder' ? '文件夹批次' : item.name);
      result.set(item.batchId, { label: current?.label || label, count: (current?.count || 0) + 1 });
    }
    return [...result.entries()];
  }, [assets]);

  async function refresh() {
    const [nextSettings, nextProjects, nextTranslationRuns, nextReconstructionRuns] = await Promise.all([
      window.masterpiece.settings.get(),
      window.masterpiece.projects.list(),
      window.masterpiece.visualTranslation.listRuns(),
      window.masterpiece.referenceTranslation.listRuns()
    ]);
    setSettings(nextSettings);
    setProjects(nextProjects);
    setTranslationRuns(nextTranslationRuns);
    setReconstructionRuns(nextReconstructionRuns);
    return {
      settings: nextSettings,
      projects: nextProjects,
      translationRuns: nextTranslationRuns,
      reconstructionRuns: nextReconstructionRuns
    };
  }

  useEffect(() => {
    if (!window.masterpiece) {
      setError('客户端安全桥接加载失败，请重新启动客户端。');
      setLoading(false);
      return;
    }
    void refresh().then(({ settings: loaded, projects: existing }) => {
      const initial = loaded.profiles.find((profile) => profile.isDefault && profile.isEnabled)
        || loaded.profiles.find((profile) => profile.isEnabled);
      setSelectedApiProfileId(initial?.id || '');
      if (!loaded.profiles.length && existing.length === 0) setScreen('settings');
    }).catch((reason) => setError(cleanError(reason))).finally(() => setLoading(false));
    return window.masterpiece.analysis.onProgress((event) => setProgress(event));
  }, []);

  async function openProject(project: ProjectRecord) {
    setSelected(project);
    setError('');
    setRunFailure('');
    const profile = enabledProfiles.find((item) => item.id === project.apiProfileId)
      || enabledProfiles.find((item) => item.isDefault)
      || enabledProfiles[0];
    setSelectedApiProfileId(profile?.id || '');
    setScreen(project.status === 'completed' && project.lastReportFilename ? 'report' : 'project');
    try { setAssets(await window.masterpiece.projects.scanAssets(project.id)); }
    catch (reason) { setError(cleanError(reason)); }
  }

  async function refreshSelected(projectId: string, nextAssets?: AssetSummary) {
    const summary = nextAssets || await window.masterpiece.projects.scanAssets(projectId);
    const [project, nextProjects] = await Promise.all([
      window.masterpiece.projects.get(projectId),
      window.masterpiece.projects.list()
    ]);
    setSelected(project);
    setProjects(nextProjects);
    setAssets(summary);
    return project;
  }

  async function run(project: ProjectRecord, forceReasoning: boolean, apiProfileId = selectedProfile?.id || '') {
    if (!apiProfileId) {
      setError('请先选择一个已启用的 API Profile。');
      setScreen('project');
      return;
    }
    setSelected(project);
    setSelectedApiProfileId(apiProfileId);
    setError('');
    setRunFailure('');
    setProgress(null);
    setScreen('analysis');
    try {
      const result = await window.masterpiece.analysis.start(project.id, forceReasoning, apiProfileId);
      setSelected(result.project);
      setProjects(await window.masterpiece.projects.list());
      setAssets(await window.masterpiece.projects.scanAssets(project.id));
      setScreen('report');
    } catch (reason) {
      const message = cleanError(reason);
      setRunFailure(message);
      const updated = await refreshSelected(project.id).catch(() => project);
      setSelected(updated);
      setProgress((current) => current?.stage === 'failed' || current?.stage === 'cancelled' ? current : {
        projectId: project.id,
        stage: /取消/.test(message) ? 'cancelled' : 'failed',
        message: /取消/.test(message) ? '分析已取消' : '分析失败',
        startedAt: new Date().toISOString(),
        elapsedMs: 0,
        assetCount: project.assetCount,
        model: selectedProfile?.modelId || project.model
      });
      setScreen('analysis');
    }
  }

  async function importMore(kind: 'assets' | 'logo' | 'brief') {
    if (!selected) return;
    const paths = await window.masterpiece.projects.chooseFiles(kind);
    if (!paths.length) return;
    try {
      const result = await window.masterpiece.projects.importFiles(selected.id, paths, kind);
      await refreshSelected(selected.id, result.summary);
      setError(result.skipped.length ? `已忽略 ${result.skipped.length} 个不支持或重复的文件。` : '');
    } catch (reason) { setError(cleanError(reason)); }
  }

  async function removeAsset(assetId: string) {
    if (!selected) return;
    try { await refreshSelected(selected.id, await window.masterpiece.projects.removeAsset(selected.id, assetId)); }
    catch (reason) { setError(cleanError(reason)); }
  }

  async function removeBatch(batchId: string, label: string) {
    if (!selected || !window.confirm(`确定删除批次“${label}”中的全部素材吗？`)) return;
    try { await refreshSelected(selected.id, await window.masterpiece.projects.removeBatch(selected.id, batchId)); }
    catch (reason) { setError(cleanError(reason)); }
  }

  async function clearAssets() {
    if (!selected || !window.confirm('确定清空全部素材吗？\n已生成的视觉总览缓存将失效。')) return;
    try { await refreshSelected(selected.id, await window.masterpiece.projects.clearAssets(selected.id)); }
    catch (reason) { setError(cleanError(reason)); }
  }

  async function deleteProject(project: ProjectRecord) {
    if (project.status === 'running') return;
    if (!window.confirm(`确定删除项目“${project.projectName}”吗？\n\n此操作会同时永久删除该项目对应的本地文件夹，包括素材、缓存、报告和运行记录，且无法撤销。`)) return;
    setDeletingProjectId(project.id);
    setError('');
    try {
      await window.masterpiece.projects.remove(project.id);
      setProjects((current) => current.filter((item) => item.id !== project.id));
      if (selected?.id === project.id) {
        setSelected(null);
        setAssets(null);
      }
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setDeletingProjectId('');
    }
  }

  async function deleteTranslationRun(run: VisualTranslationRunRecord) {
    if (run.status === 'running') return;
    if (!window.confirm(`确定删除文档视觉转译任务“${run.projectName}”吗？\n\n此操作会同时永久删除该任务对应的本地文件夹，包括策略文档、缓存、报告和运行记录，且无法撤销。`)) return;
    setDeletingRunId(run.id);
    setError('');
    try {
      await window.masterpiece.visualTranslation.remove(run.id);
      setTranslationRuns((current) => current.filter((item) => item.id !== run.id));
      if (requestedTranslationRunId === run.id) {
        setRequestedTranslationRunId('');
      }
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setDeletingRunId('');
    }
  }

  async function deleteReconstructionRun(run: ReferenceTranslationRunRecord) {
    if (run.status === 'running') return;
    if (!window.confirm(`确定删除参考风格重构任务“${run.projectContextFilename}”吗？\n\n此操作会永久删除该任务的中间产物、执行文档和本地任务文件夹，且无法撤销。`)) return;
    setDeletingReconstructionRunId(run.id);
    setError('');
    try {
      await window.masterpiece.referenceTranslation.remove(run.id);
      setReconstructionRuns((current) => current.filter((item) => item.id !== run.id));
      if (requestedReconstructionRunId === run.id) setRequestedReconstructionRunId('');
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setDeletingReconstructionRunId('');
    }
  }

  function saveSettings(next: PublicSettings) {
    setSettings(next);
    const currentStillEnabled = next.profiles.some((profile) => profile.id === selectedApiProfileId && profile.isEnabled);
    if (!currentStillEnabled) {
      const fallback = next.profiles.find((profile) => profile.isDefault && profile.isEnabled)
        || next.profiles.find((profile) => profile.isEnabled);
      setSelectedApiProfileId(fallback?.id || '');
    }
  }

  if (loading) return <div className="splash"><div className="brand-mark">M</div><p>正在启动 Masterpiece OS…</p></div>;
  if (!settings) return <div className="splash"><div className="brand-mark">!</div><p>{error || '客户端初始化失败，请重新启动。'}</p></div>;

  if (screen === 'settings') return <SettingsPanel settings={settings} onSaved={saveSettings} onClose={() => setScreen(settingsReturnScreen)} />;
  if (screen === 'create') return <div className="analysis-workspace-shell">
    <AnalysisModeTabs value={analysisMode} onChange={(mode) => {
      setAnalysisMode(mode);
      if (mode !== 'visual-translation') setRequestedTranslationRunId('');
      if (mode !== 'reference-translation') setRequestedReconstructionRunId('');
    }} />
    <div hidden={analysisMode !== 'visual-analysis'}><ProjectWizard settings={settings} onCancel={() => { setScreen('home'); void refresh(); }} onStart={(project, profileId) => {
      setSelected(project);
      setSelectedApiProfileId(profileId);
      void run(project, true, profileId);
    }} /></div>
    <div hidden={analysisMode !== 'visual-translation'}><VisualTranslationWorkspace settings={settings} selectedApiProfileId={selectedApiProfileId} initialRunId={requestedTranslationRunId} onApiProfileChange={setSelectedApiProfileId} onBack={() => { setScreen('home'); void refresh(); }} onOpenSettings={() => { setSettingsReturnScreen('create'); setScreen('settings'); }} /></div>
    <div hidden={analysisMode !== 'reference-translation'}><ReferenceTranslationWorkspace initialRunId={requestedReconstructionRunId} onBack={() => { setScreen('home'); void refresh(); }} /></div>
  </div>;
  if (screen === 'analysis' && selected) return <AnalysisView
    project={selected}
    progress={progress}
    error={runFailure}
    onCancel={() => window.masterpiece.analysis.cancel(selected.id)}
    onRetry={() => void run(selected, true, selectedApiProfileId)}
    onBack={() => { setError(runFailure); setRunFailure(''); setScreen('project'); }}
  />;
  if (screen === 'report' && selected) return <ReportView project={selected} onBack={() => setScreen('project')} onRerun={(force) => void run(selected, force, selectedApiProfileId)} />;

  if (screen === 'project' && selected) {
    const canAnalyze = Boolean(assets?.totalFiles && selectedProfile?.hasApiKey && selectedProfile.baseUrl && selectedProfile.modelId);
    return <div className="page project-page">
      <header className="page-header"><div><p className="eyebrow">PROJECT WORKSPACE</p><div className="title-line"><h1>{selected.projectName}</h1><StatusBadge status={selected.status} /></div><p>{selected.brandName} · {selected.industry}</p></div><div className="button-row"><button className="button ghost" onClick={() => { setScreen('home'); void refresh(); }}>返回首页</button>{selected.lastReportFilename && <button className="button secondary" onClick={() => setScreen('report')}>查看报告</button>}</div></header>
      {error && <div className={`notice ${/忽略/.test(error) ? 'ok' : 'error'} top-notice`}>{error}</div>}
      <div className="project-grid">
        <section className="panel assets-panel">
          <div className="section-heading"><span>01</span><div><h2>视觉素材</h2><p>{assets?.totalFiles ?? selected.assetCount} 个文件 · {assets ? formatBytes(assets.totalBytes) : '正在读取'}</p></div><div className="button-row asset-toolbar"><button className="button text-button" onClick={() => void importMore('assets')}>+ 添加素材</button><button className="button danger" disabled={!assets?.totalFiles} onClick={() => void clearAssets()}>清空全部</button></div></div>
          {batches.length > 1 && <div className="batch-actions"><small>导入批次</small>{batches.map(([batchId, batch]) => <button key={batchId} onClick={() => void removeBatch(batchId, batch.label)}>{batch.label} · {batch.count} 个 ×</button>)}</div>}
          {assets?.items.length ? <div className="asset-grid">{assets.items.map((item) => <div className="asset-card removable" key={item.id}><button className="asset-remove" title={`删除 ${item.name}`} aria-label={`删除 ${item.name}`} onClick={() => void removeAsset(item.id)}>×</button>{item.thumbnailDataUrl ? <img src={item.thumbnailDataUrl} alt="" /> : <div className={`file-placeholder ${item.kind}`}>{item.extension.replace('.', '').toUpperCase()}</div>}<strong title={item.relativePath}>{item.name}</strong><small>{formatBytes(item.bytes)}</small>{item.warning && <em>{item.warning}</em>}</div>)}</div> : <div className="empty-state"><strong>尚未导入素材</strong><p>支持 ZIP、JPG、JPEG、PNG、WEBP 和 PDF。</p><button className="button secondary" onClick={() => void importMore('assets')}>选择视觉方案</button></div>}
        </section>
        <aside className="panel project-sidebar">
          <div className="section-heading"><span>02</span><div><h2>运行前检查</h2><p>选择本次分析使用的配置</p></div></div>
          <label>分析模型<select value={selectedProfile?.id || ''} onChange={(event) => setSelectedApiProfileId(event.target.value)}>{!enabledProfiles.length && <option value="">尚无可用配置</option>}{enabledProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} / {profile.modelId}</option>)}</select></label>
          <ul className="check-list"><li className={assets?.totalFiles ? 'pass' : ''}><span>{assets?.totalFiles ? '✓' : '!'}</span>项目素材不为空</li><li className="pass"><span>✓</span>真实项目名将在同次视觉分析中确认</li><li className="pass"><span>✓</span>原始 Logo 默认锁定</li><li className="pass"><span>✓</span>固定输出简体中文</li><li className={selectedProfile?.hasApiKey ? 'pass' : ''}><span>{selectedProfile?.hasApiKey ? '✓' : '!'}</span>API Key 已安全保存</li><li className={selectedProfile?.baseUrl && selectedProfile.modelId ? 'pass' : ''}><span>{selectedProfile?.baseUrl && selectedProfile.modelId ? '✓' : '!'}</span>{selectedProfile?.modelId || '模型未配置'}</li></ul>
          <div className="facts-box"><small>当前导入线索</small><p>项目：{selected.detectedProjectName}（{Math.round(selected.projectNameConfidence * 100)}%）</p><p>行业：{selected.detectedIndustry}（{Math.round(selected.factConfidence.industry * 100)}%）</p><p>通用文件名不会成为最终报告名称。</p></div>
          <div className="profile-card"><small>默认分析模式</small><strong>融合增强</strong><p>一次多模态调用，强化事实判断、真实触点、材料与工艺。</p></div>
          <button className="button primary full" disabled={!canAnalyze} onClick={() => void run(selected, true, selectedProfile?.id)}>开始分析</button>
          <button className="button ghost full" disabled={!selected.lastReportFilename || !canAnalyze} onClick={() => void run(selected, false, selectedProfile?.id)}>使用精确缓存</button>
        </aside>
      </div>
    </div>;
  }

  const defaultProfile = settings.profiles.find((profile) => profile.isDefault)
    || settings.profiles.find((profile) => profile.isEnabled);
  const hasUsableProfile = enabledProfiles.some((profile) => profile.hasApiKey && profile.baseUrl && profile.modelId);
  const recentRecords = [
    ...projects.map((project) => ({ kind: 'visual-analysis' as const, createdAt: project.lastRunAt || project.updatedAt || project.createdAt, project })),
    ...translationRuns.map((run) => ({ kind: 'visual-translation' as const, createdAt: run.createdAt, run })),
    ...reconstructionRuns.map((run) => ({ kind: 'reference-reconstruction' as const, createdAt: run.createdAt, run }))
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return <div className="app-shell">
    <aside className="sidebar"><div className="logo-lockup"><div className="brand-mark">M</div><div><strong>Masterpiece OS</strong><small>Desktop / v5</small></div></div><nav><button className="active">项目</button><button onClick={() => { setAnalysisMode('visual-analysis'); setScreen('create'); }}>分析工作台</button><button onClick={() => { setSettingsReturnScreen('home'); setScreen('settings'); }}>设置</button></nav><div className="sidebar-footer"><span className={`status-dot ${settings.connectionStatus}`} /><div><small>默认模型</small><strong>{defaultProfile?.modelId || '未配置'}</strong></div></div></aside>
    <main className="home-main"><header className="home-header"><div><p className="eyebrow">CREATIVE DIRECTOR PREPARATION SYSTEM</p><h1>让视觉判断<br />成为可执行的系统。</h1></div><div className="header-actions"><button className="button secondary" onClick={() => { setAnalysisMode('visual-translation'); setRequestedTranslationRunId(''); setScreen('create'); }}>文档视觉转译</button><button className="button ghost" onClick={() => { setSettingsReturnScreen('home'); setScreen('settings'); }}>API 设置</button><button className="button primary large" onClick={() => { setAnalysisMode('visual-analysis'); setScreen('create'); }}>新建分析 <span>↗</span></button></div></header>
      {!hasUsableProfile && <div className="setup-banner"><div><strong>完成首次 API 配置</strong><p>请添加并启用一个包含 API Key、Base URL 与 Model ID 的 Profile。</p></div><button className="button secondary" onClick={() => setScreen('settings')}>前往设置</button></div>}
      {error && <div className="notice error">{error}</div>}
      <section className="recent-section"><div className="section-title"><div><span>RECENT ANALYSIS</span><h2>最近分析记录</h2></div><small>{recentRecords.length} 条本地记录</small></div>
        {recentRecords.length ? <div className="project-list">{recentRecords.map((record, index) => record.kind === 'visual-analysis' ? <div className="project-row" key={`analysis-${record.project.id}`}>
          <button className="project-row-open" onClick={() => void openProject(record.project)}>
            <span className="project-index">{String(index + 1).padStart(2, '0')}</span>
            <div className="project-name"><strong>{record.project.projectName}</strong><small><span className="record-type visual-analysis">视觉分析</span>{record.project.industry} · {record.project.assetCount} 个素材</small></div>
            <StatusBadge status={record.project.status} />
            <div className="project-model"><small>MODEL</small><strong>{record.project.model || '—'}</strong></div>
            <div className="project-time"><small>DURATION</small><strong>{formatDuration(record.project.lastDurationMs)}</strong></div>
            <span className="row-arrow">→</span>
          </button>
          <button className="project-delete" disabled={record.project.status === 'running' || deletingProjectId === record.project.id} title={record.project.status === 'running' ? '请先取消正在运行的分析' : `删除 ${record.project.projectName} 及本地文件夹`} aria-label={`删除项目 ${record.project.projectName}`} onClick={() => void deleteProject(record.project)}>{deletingProjectId === record.project.id ? '…' : '删除'}</button>
        </div> : record.kind === 'visual-translation' ? <div className="project-row translation-record" key={`translation-${record.run.id}`}>
          <button className="project-row-open" onClick={() => { setRequestedTranslationRunId(record.run.id); setAnalysisMode('visual-translation'); setScreen('create'); }}>
            <span className="project-index">{String(index + 1).padStart(2, '0')}</span>
            <div className="project-name"><strong>{record.run.projectName}</strong><small><span className="record-type visual-translation">文档视觉转译</span>{record.run.documentCount} 份文档</small></div>
            <TranslationStatusBadge status={record.run.status} />
            <div className="project-model"><small>MODEL</small><strong>{record.run.model || '—'}</strong></div>
            <div className="project-time"><small>DURATION</small><strong>{formatDuration(record.run.durationMs || null)}</strong></div>
            <span className="row-arrow">→</span>
          </button>
          <button className="project-delete" disabled={record.run.status === 'running' || deletingRunId === record.run.id} title={record.run.status === 'running' ? '请先取消正在运行的分析' : `删除文档视觉转译任务 ${record.run.projectName} 及本地文件夹`} aria-label={`删除文档视觉转译任务 ${record.run.projectName}`} onClick={() => void deleteTranslationRun(record.run)}>{deletingRunId === record.run.id ? '…' : '删除'}</button>
        </div> : <div className="project-row translation-record" key={`reconstruction-${record.run.id}`}>
          <button className="project-row-open" onClick={() => {
            setRequestedReconstructionRunId(record.run.id);
            setAnalysisMode('reference-translation');
            setScreen('create');
          }}>
            <span className="project-index">{String(index + 1).padStart(2, '0')}</span>
            <div className="project-name"><strong>{record.run.projectContextFilename}</strong><small><span className="record-type reference-reconstruction">参考风格重构</span>{record.run.visualAnalysisFilename}</small></div>
            <ReconstructionStatusBadge status={record.run.status} />
            <div className="project-model"><small>OUTPUT</small><strong>{record.run.reportFilename ? 'GPT 执行文档' : '—'}</strong></div>
            <div className="project-time"><small>DURATION</small><strong>{formatDuration(record.run.durationMs || null)}</strong></div>
            <span className="row-arrow">→</span>
          </button>
          <button className="project-delete" disabled={record.run.status === 'running' || deletingReconstructionRunId === record.run.id} title={record.run.status === 'running' ? '请先取消正在运行的重构任务' : `删除参考风格重构任务 ${record.run.projectContextFilename} 及本地文件夹`} aria-label={`删除参考风格重构任务 ${record.run.projectContextFilename}`} onClick={() => void deleteReconstructionRun(record.run)}>{deletingReconstructionRunId === record.run.id ? '…' : '删除'}</button>
        </div>)}</div> : <div className="empty-home"><div className="empty-orbit" /><strong>还没有分析记录</strong><p>进入分析工作台，选择视觉分析或文档视觉转译开始第一次任务。</p><button className="button primary" onClick={() => { setAnalysisMode('visual-analysis'); setScreen('create'); }}>开始第一次分析</button></div>}
      </section>
    </main>
  </div>;
}
