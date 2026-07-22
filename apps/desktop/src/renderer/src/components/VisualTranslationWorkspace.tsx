import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useState } from 'react';
import type {
  PublicSettings,
  VisualTranslationDocumentSummary,
  VisualTranslationProgress,
  VisualTranslationRunRecord,
  VisualTranslationStage,
  VisualTranslationUserError
} from '../../../shared/types';
import { cleanError, formatDurationHuman } from '../utils';

interface Props {
  settings: PublicSettings;
  selectedApiProfileId: string;
  initialRunId?: string;
  onApiProfileChange(profileId: string): void;
  onBack(): void;
  onOpenSettings(): void;
}

const STAGES: Array<[VisualTranslationStage, string]> = [
  ['00-document-preparation', '文档准备'],
  ['01-visual-brief', '视觉简报'],
  ['02-visual-asset-evidence', '视觉资产证据'],
  ['03b-benchmark-retrieval', '实时案例研究'],
  ['03c-visual-opportunity-synthesis', '视觉机会综合'],
  ['04-three-creative-directions', '三个视觉方向'],
  ['10-local-report-compiler', '报告编译'],
  ['10b-local-audit-compiler', '技术审计']
];

const stageGroupIndex = (stage?: VisualTranslationStage): number => {
  if (!stage) return -1;
  if (stage === '00-document-preparation') return 0;
  if (stage === '01-visual-relevant-facts' || stage === '01-visual-brief' || stage === '01b-visual-brief-review') return 1;
  if (stage === '02-visual-asset-evidence' || stage === '02b-visual-asset-evidence-review') return 2;
  if (stage === '03a-benchmark-query-compiler' || stage === '03b-benchmark-retrieval') return 3;
  if (stage === '03c-visual-opportunity-synthesis' || stage === '03d-visual-opportunity-review') return 4;
  if (stage === '04-three-creative-directions' || stage === '04b-compile-execution-directions') return 5;
  if (stage === '10-local-report-compiler' || stage === '10b-local-audit-compiler') return 6;
  return -1;
};

const STATUS_LABELS: Record<VisualTranslationRunRecord['status'], string> = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  timed_out: '已超时',
  cancelled: '已取消'
};

function runStatusLabel(run: VisualTranslationRunRecord): string {
  if (run.analysisStatus === 'completed' && run.persistenceStatus !== 'healthy') return '分析已完成，可恢复';
  if (run.analysisStatus === 'result_committed' && run.persistenceStatus !== 'healthy') return '结果已保存，可恢复';
  if (run.analysisStatus === 'result_committed') return '方向结果已保存';
  return STATUS_LABELS[run.status];
}

function TruncationErrorNotice({ userError, fallback }: { userError: VisualTranslationUserError | null; fallback: string }) {
  if (!userError) return <div className="notice error">{fallback}</div>;
  return (
    <div className="notice error truncation-error">
      <strong>{userError.title}</strong>
      <p>{userError.message}</p>
      <ul>
        {userError.stageId && <li>失败阶段：{userError.stageId}</li>}
        {userError.modelId && <li>当前模型：{userError.modelId}</li>}
        {userError.requestedMaxOutputTokens != null && <li>请求输出预算：{userError.requestedMaxOutputTokens} tokens</li>}
        {userError.providerMaxOutputTokens != null && <li>Provider 最大输出：{userError.providerMaxOutputTokens} tokens</li>}
        {userError.retried != null && <li>是否已重试：{userError.retried ? '是（升级预算后仍截断）' : '否'}</li>}
      </ul>
      {userError.suggestedAction && <p className="suggested">建议：{userError.suggestedAction}</p>}
    </div>
  );
}

export function VisualTranslationWorkspace({ settings, selectedApiProfileId, initialRunId, onApiProfileChange, onBack, onOpenSettings }: Props) {
  const profiles = settings.profiles.filter((profile) => profile.isEnabled);
  const initialProfile = profiles.find((profile) => profile.isDefault) || profiles[0];
  const profileId = profiles.some((profile) => profile.id === selectedApiProfileId) ? selectedApiProfileId : initialProfile?.id || '';
  const [documents, setDocuments] = useState<VisualTranslationDocumentSummary[]>([]);
  const [runs, setRuns] = useState<VisualTranslationRunRecord[]>([]);
  const [activeRunId, setActiveRunId] = useState('');
  const [progress, setProgress] = useState<VisualTranslationProgress | null>(null);
  const [selectedRun, setSelectedRun] = useState<VisualTranslationRunRecord | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState('');
  const [reportHtml, setReportHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [userError, setUserError] = useState<VisualTranslationUserError | null>(null);
  const [notice, setNotice] = useState('');
  const activeStageIndex = stageGroupIndex(progress?.stage);
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

  async function addDocuments(paths: string[]) {
    setError('');
    try {
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

  async function chooseDocuments() {
    await addDocuments(await window.masterpiece.visualTranslation.chooseDocuments());
  }

  async function openInitialRun() {
    if (!initialRunId) return;
    const next = await refreshRuns();
    const run = next.find((item) => item.id === initialRunId);
    if (run?.status === 'completed') await openReport(run);
  }

  useEffect(() => {
    void openInitialRun().catch((reason) => setError(cleanError(reason)));
  }, [initialRunId]);

  async function start() {
    if (!documents.length || !profileId) return;
    setBusy(true);
    setError('');
    setUserError(null);
    setNotice('');
    setProgress(null);
    setSelectedRun(null);
    setReportMarkdown('');
    try {
      const result = await window.masterpiece.visualTranslation.start({ documentPaths: documents.map((document) => document.path), apiProfileId: profileId });
      setSelectedRun(result.run);
      setReportMarkdown(result.reportMarkdown);
      setNotice('分析完成。三个方向仍需人工确认，客户端不会自动替你做最终选择。');
    } catch (reason) {
      setError(cleanError(reason));
      setUserError((reason as { userError?: VisualTranslationUserError })?.userError || null);
    } finally {
      setBusy(false);
      await refreshRuns().catch(() => {});
    }
  }

  async function resume(run: VisualTranslationRunRecord) {
    setBusy(true);
    setError('');
    setUserError(null);
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
      setUserError((reason as { userError?: VisualTranslationUserError })?.userError || null);
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
      <div><p className="eyebrow">VISUAL DIRECTIONS COMPLETE</p><h1>{selectedRun.projectName}</h1><p>{selectedRun.reportFilename}</p></div>
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
    {error && <TruncationErrorNotice userError={userError} fallback={error} />}
    <article className="markdown-preview" dangerouslySetInnerHTML={{ __html: reportHtml }} />
  </div>;

  return <div className="page visual-translation-page">
    <header className="page-header">
      <div><p className="eyebrow">DOCUMENT → VISUAL DIRECTIONS</p><h1>视觉方向</h1><p>上传项目资料，系统将编译视觉简报并生成三个可执行方向。</p></div>
      <div className="button-row"><button className="button ghost" onClick={onOpenSettings}>API 设置</button><button className="button ghost" onClick={onBack}>返回首页</button></div>
    </header>

    {error && <TruncationErrorNotice userError={userError} fallback={error} />}
    {notice && <div className="notice ok">{notice}</div>}

    <div className="visual-translation-grid">
      <section className="panel visual-translation-form">
        <div className="section-heading"><span>01</span><div><h2>准备分析任务</h2><p>支持 PDF、DOCX、Markdown 和 TXT</p></div></div>
        <label>分析模型<select value={profileId} onChange={(event) => onApiProfileChange(event.target.value)}><option value="">请选择 API Profile</option>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.displayName} / {profile.modelId}</option>)}</select></label>
        <div className="mode-hint">系统将提取视觉相关品牌事实，研究同品类与相同商业模式案例，并生成 3 个可执行视觉方向。</div>
        <div className="document-toolbar"><div><strong>策略文档</strong><small>{documents.length} 份 · {totalCharacters.toLocaleString('zh-CN')} 字符</small></div></div>
        <div className={`drop-zone translation-drop-zone ${busy ? 'busy' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault();
          void addDocuments(Array.from(event.dataTransfer.files).map((file) => window.masterpiece.files.getPathForFile(file)));
        }}>
          <div className="upload-orbit">↥</div>
          <strong>{busy ? '正在读取与解析文档…' : '将策略文档拖到这里'}</strong>
          <p>支持 PDF、DOCX、Markdown 和 TXT，可一次拖入多份文档</p>
          <button className="button secondary" type="button" disabled={busy} onClick={() => void chooseDocuments()}>选择文档</button>
        </div>
        {documents.length ? <div className="visual-document-list translation-selected-documents">{documents.map((document) => <div key={document.path}><span className="document-kind">{document.sourceType.toUpperCase()}</span><div><strong>{document.filename}</strong><small>{document.title || '未识别标题'} · {document.characterCount.toLocaleString('zh-CN')} 字符{document.pageCount ? ` · ${document.pageCount} 页` : ''}</small>{document.warnings.map((warning) => <em key={warning}>{warning}</em>)}</div><button aria-label={`移除 ${document.filename}`} onClick={() => setDocuments((current) => current.filter((item) => item.path !== document.path))}>×</button></div>)}</div> : <div className="auto-project-name-note">上传后将从文档标题和正文自动识别项目名称，无需手动填写。</div>}
        {!profiles.some((profile) => profile.hasApiKey) && <div className="notice error">尚未配置可用的 API Profile，请先前往 API 设置。</div>}
        <button className="button primary full" disabled={busy || !documents.length || !profiles.find((profile) => profile.id === profileId)?.hasApiKey} onClick={() => void start()}>{busy ? '分析运行中…' : '开始分析'}</button>
      </section>

      <aside className="panel visual-translation-history">
        <div className="section-heading"><span>02</span><div><h2>分析记录</h2><p>未完成任务可继续分析；已保存结果只执行恢复，不会重复调用模型</p></div></div>
        {runs.length ? <div className="visual-run-list">{runs.map((run) => {
          const resultSaved = run.analysisStatus === 'result_committed' || run.analysisStatus === 'completed';
          const needsRecovery = resultSaved && run.persistenceStatus !== 'healthy';
          return <div key={run.id} className={`visual-run-card ${resultSaved ? 'completed' : run.status}`}><div><strong>{run.projectName}</strong><span>{runStatusLabel(run)}</span></div><small>{run.documentCount} 份文档 · {run.model}</small><small>{new Date(run.createdAt).toLocaleString('zh-CN')}{run.durationMs ? ` · ${formatDurationHuman(run.durationMs)}` : ''}</small>{(run.uiMessage || run.userError?.message || run.lastError) && <em>{run.uiMessage || run.userError?.message || run.lastError}</em>}<div className="button-row">{run.status === 'completed' && run.reportFilename && <button className="button secondary" onClick={() => void openReport(run)}>查看报告</button>}{run.status !== 'running' && <button className="button ghost" disabled={busy} onClick={() => void resume(run)}>{needsRecovery ? '恢复结果' : resultSaved ? '查看已保存结果' : '继续分析'}</button>}</div></div>;
        })}</div> : <div className="visual-document-empty">还没有 Visual Translation 任务。</div>}
      </aside>
    </div>

    {(busy || progress) && <section className="panel visual-progress-panel">
      <div><p className="eyebrow">分析进度</p><h2>{progress?.message || '正在创建任务'}</h2><p>{progress?.model || profiles.find((profile) => profile.id === profileId)?.modelId}</p></div>
      <div className="visual-stage-strip">{STAGES.map(([stage, label], index) => <div key={stage} className={index < activeStageIndex ? 'done' : index === activeStageIndex ? 'active' : ''}><span>{index < activeStageIndex ? '✓' : String(index + 1).padStart(2, '0')}</span><strong>{label}</strong></div>)}</div>
      {busy && activeRunId && <button className="button danger" onClick={() => void window.masterpiece.visualTranslation.cancel(activeRunId)}>取消分析</button>}
    </section>}
  </div>;
}
