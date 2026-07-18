import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useState } from 'react';
import type {
  PublicSettings,
  VisualTranslationDocumentSummary,
  VisualTranslationProgress,
  VisualTranslationRunRecord,
  VisualTranslationStage
} from '../../../shared/types';
import { cleanError, formatDurationHuman } from '../utils';

interface Props {
  settings: PublicSettings;
  onBack(): void;
  onOpenSettings(): void;
}

const STAGES: Array<[VisualTranslationStage, string]> = [
  ['00-document-preparation', '文档准备'],
  ['01-visual-evidence', '视觉证据'],
  ['02-visual-signal-opportunity', '信号与机会地图'],
  ['04-three-creative-directions', '三个创意方向'],
  ['05-direction-recommendation', '本地方向排序'],
  ['10-local-report-compiler', '报告编译']
];

const STATUS_LABELS: Record<VisualTranslationRunRecord['status'], string> = {
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消'
};

export function VisualTranslationWorkspace({ settings, onBack, onOpenSettings }: Props) {
  const profiles = settings.profiles.filter((profile) => profile.isEnabled);
  const initialProfile = profiles.find((profile) => profile.isDefault) || profiles[0];
  const [projectName, setProjectName] = useState('');
  const [profileId, setProfileId] = useState(initialProfile?.id || '');
  const [documents, setDocuments] = useState<VisualTranslationDocumentSummary[]>([]);
  const [runs, setRuns] = useState<VisualTranslationRunRecord[]>([]);
  const [activeRunId, setActiveRunId] = useState('');
  const [progress, setProgress] = useState<VisualTranslationProgress | null>(null);
  const [selectedRun, setSelectedRun] = useState<VisualTranslationRunRecord | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState('');
  const [reportHtml, setReportHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeStageIndex = STAGES.findIndex(([stage]) => stage === progress?.stage);
  const totalCharacters = useMemo(() => documents.reduce((sum, document) => sum + document.characterCount, 0), [documents]);

  async function refreshRuns() {
    const next = await window.masterpiece.visualTranslation.listRuns();
    setRuns(next);
    if (selectedRun) setSelectedRun(next.find((run) => run.id === selectedRun.id) || selectedRun);
    return next;
  }

  useEffect(() => {
    void refreshRuns().catch((reason) => setError(cleanError(reason)));
    return window.masterpiece.visualTranslation.onProgress((event) => {
      setActiveRunId(event.runId);
      setProgress(event);
    });
  }, []);

  useEffect(() => {
    void Promise.resolve(marked.parse(reportMarkdown)).then((value) => setReportHtml(DOMPurify.sanitize(value)));
  }, [reportMarkdown]);

  async function chooseDocuments() {
    setError('');
    try {
      const paths = await window.masterpiece.visualTranslation.chooseDocuments();
      if (!paths.length) return;
      setBusy(true);
      const mergedPaths = [...new Set([...documents.map((document) => document.path), ...paths])];
      setDocuments(await window.masterpiece.visualTranslation.inspectDocuments(mergedPaths));
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!projectName.trim() || !documents.length || !profileId) return;
    setBusy(true);
    setError('');
    setNotice('');
    setProgress(null);
    setSelectedRun(null);
    setReportMarkdown('');
    try {
      const result = await window.masterpiece.visualTranslation.start({ projectName, documentPaths: documents.map((document) => document.path), apiProfileId: profileId });
      setSelectedRun(result.run);
      setReportMarkdown(result.reportMarkdown);
      setNotice('分析完成。三个方向仍需人工确认，客户端不会自动替你做最终选择。');
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setBusy(false);
      await refreshRuns().catch(() => {});
    }
  }

  async function resume(run: VisualTranslationRunRecord) {
    setBusy(true);
    setError('');
    setNotice('');
    setSelectedRun(null);
    setReportMarkdown('');
    setActiveRunId(run.id);
    try {
      const result = await window.masterpiece.visualTranslation.resume(run.id, profileId || run.apiProfileId);
      setSelectedRun(result.run);
      setReportMarkdown(result.reportMarkdown);
      setNotice(`已恢复任务；复用了 ${result.run.resumedStageCount || 0} 个有效 Checkpoint。`);
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setBusy(false);
      await refreshRuns().catch(() => {});
    }
  }

  async function openReport(run: VisualTranslationRunRecord) {
    setError('');
    try {
      setSelectedRun(run);
      setReportMarkdown(await window.masterpiece.visualTranslation.readReport(run.id));
    } catch (reason) {
      setError(cleanError(reason));
    }
  }

  async function exportReport() {
    if (!selectedRun) return;
    try {
      const destination = await window.masterpiece.visualTranslation.exportReport(selectedRun.id);
      if (destination) setNotice(`报告已导出：${destination}`);
    } catch (reason) { setError(cleanError(reason)); }
  }

  if (selectedRun && reportMarkdown) return <div className="page report-page visual-translation-report">
    <header className="page-header">
      <div><p className="eyebrow">VISUAL TRANSLATION V1 / DIRECTIONS COMPLETE</p><h1>{selectedRun.projectName}</h1><p>{selectedRun.reportFilename}</p></div>
      <button className="button ghost" onClick={() => { setSelectedRun(null); setReportMarkdown(''); }}>返回工作台</button>
    </header>
    <div className="result-summary">
      <div><small>模型</small><strong>{selectedRun.model}</strong></div>
      <div><small>模型调用</small><strong>{selectedRun.modelCallCount ?? 0} 次</strong></div>
      <div><small>Checkpoint</small><strong>复用 {selectedRun.resumedStageCount ?? 0}</strong></div>
      <div><small>视觉内容</small><strong>{Math.round((selectedRun.visualRatio || 0) * 100)}%</strong></div>
    </div>
    <div className="result-actions">
      <button className="button primary" onClick={() => void exportReport()}>导出 Markdown</button>
      <button className="button secondary" onClick={() => void navigator.clipboard.writeText(reportMarkdown).then(() => setNotice('报告内容已复制。'))}>复制内容</button>
      <button className="button secondary" onClick={() => void window.masterpiece.visualTranslation.openFolder(selectedRun.id)}>打开输出文件夹</button>
    </div>
    {notice && <div className="notice ok">{notice}</div>}
    {error && <div className="notice error">{error}</div>}
    <article className="markdown-preview" dangerouslySetInnerHTML={{ __html: reportHtml }} />
  </div>;

  return <div className="page visual-translation-page">
    <header className="page-header">
      <div><p className="eyebrow">DOCUMENT → VISUAL DIRECTIONS</p><h1>视觉转译 V1</h1><p>上传策略文档，通过三次模型调用生成三个可比较的创意方向。</p></div>
      <div className="button-row"><button className="button ghost" onClick={onOpenSettings}>API 设置</button><button className="button ghost" onClick={onBack}>返回首页</button></div>
    </header>

    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice ok">{notice}</div>}

    <div className="visual-translation-grid">
      <section className="panel visual-translation-form">
        <div className="section-heading"><span>01</span><div><h2>准备分析任务</h2><p>支持 PDF、DOCX、Markdown 和 TXT</p></div></div>
        <label>项目名称<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：九州美学" /></label>
        <label>分析模型<select value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="">请选择 API Profile</option>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.displayName} / {profile.modelId}</option>)}</select></label>
        <div className="document-toolbar"><div><strong>策略文档</strong><small>{documents.length} 份 · {totalCharacters.toLocaleString('zh-CN')} 字符</small></div><button className="button secondary" disabled={busy} onClick={() => void chooseDocuments()}>选择文档</button></div>
        {documents.length ? <div className="visual-document-list">{documents.map((document) => <div key={document.path}><span className="document-kind">{document.sourceType.toUpperCase()}</span><div><strong>{document.filename}</strong><small>{document.title || '未识别标题'} · {document.characterCount.toLocaleString('zh-CN')} 字符{document.pageCount ? ` · ${document.pageCount} 页` : ''}</small>{document.warnings.map((warning) => <em key={warning}>{warning}</em>)}</div><button aria-label={`移除 ${document.filename}`} onClick={() => setDocuments((current) => current.filter((item) => item.path !== document.path))}>×</button></div>)}</div> : <div className="visual-document-empty">选择用于视觉转译的品牌策略、创意简报、产品资料或市场研究文档。</div>}
        {!profiles.some((profile) => profile.hasApiKey) && <div className="notice error">尚未配置可用的 API Profile，请先前往 API 设置。</div>}
        <button className="button primary full" disabled={busy || !projectName.trim() || !documents.length || !profiles.find((profile) => profile.id === profileId)?.hasApiKey} onClick={() => void start()}>{busy ? '分析运行中…' : '开始 Visual Translation V1'}</button>
      </section>

      <aside className="panel visual-translation-history">
        <div className="section-heading"><span>02</span><div><h2>分析记录</h2><p>失败或取消的任务可以从有效 Checkpoint 恢复</p></div></div>
        {runs.length ? <div className="visual-run-list">{runs.map((run) => <div key={run.id} className={`visual-run-card ${run.status}`}><div><strong>{run.projectName}</strong><span>{STATUS_LABELS[run.status]}</span></div><small>{run.documentCount} 份文档 · {run.model}</small><small>{new Date(run.createdAt).toLocaleString('zh-CN')}{run.durationMs ? ` · ${formatDurationHuman(run.durationMs)}` : ''}</small>{run.lastError && <em>{run.lastError}</em>}<div className="button-row">{run.status === 'completed' && <button className="button secondary" onClick={() => void openReport(run)}>查看报告</button>}{run.status !== 'running' && <button className="button ghost" disabled={busy} onClick={() => void resume(run)}>{run.status === 'completed' ? '验证 Checkpoint' : '继续分析'}</button>}</div></div>)}</div> : <div className="visual-document-empty">还没有 Visual Translation 任务。</div>}
      </aside>
    </div>

    {(busy || progress) && <section className="panel visual-progress-panel">
      <div><p className="eyebrow">PIPELINE STATUS</p><h2>{progress?.message || '正在创建任务'}</h2><p>{progress?.model || profiles.find((profile) => profile.id === profileId)?.modelId}</p></div>
      <div className="visual-stage-strip">{STAGES.map(([stage, label], index) => <div key={stage} className={index < activeStageIndex ? 'done' : index === activeStageIndex ? 'active' : ''}><span>{index < activeStageIndex ? '✓' : String(index + 1).padStart(2, '0')}</span><strong>{label}</strong></div>)}</div>
      {busy && activeRunId && <button className="button danger" onClick={() => void window.masterpiece.visualTranslation.cancel(activeRunId)}>取消分析</button>}
    </section>}
  </div>;
}
