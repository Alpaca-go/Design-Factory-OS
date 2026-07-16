import { useMemo, useState } from 'react';
import type {
  AnalysisMode,
  AssetSummary,
  DocumentSummary,
  ProjectRecord,
  PublicSettings
} from '../../../shared/types';
import { cleanError, formatBytes } from '../utils';

interface Props {
  settings: PublicSettings;
  onStart(project: ProjectRecord, apiProfileId: string): void;
  onCancel(): void;
}

export function ProjectWizard({ settings, onStart, onCancel }: Props) {
  const enabledProfiles = settings.profiles.filter((profile) => profile.isEnabled);
  const [mode, setMode] = useState<AnalysisMode>('visual-evolution');
  const [apiProfileId, setApiProfileId] = useState(
    enabledProfiles.find((profile) => profile.isDefault)?.id || enabledProfiles[0]?.id || ''
  );
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [assets, setAssets] = useState<AssetSummary | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selectedProfile = enabledProfiles.find((profile) => profile.id === apiProfileId);
  const isBrandDna = mode === 'brand-dna';

  const batches = useMemo(() => {
    const result = new Map<string, { label: string; count: number }>();
    for (const item of assets?.items || []) {
      const existing = result.get(item.batchId);
      const label = item.archiveSourceName || (item.sourceType === 'folder' ? '文件夹批次' : item.name);
      result.set(item.batchId, { label: existing?.label || label, count: (existing?.count || 0) + 1 });
    }
    return [...result.entries()];
  }, [assets]);

  async function refreshProject(projectId: string, summary?: AssetSummary | DocumentSummary) {
    const nextProject = await window.masterpiece.projects.get(projectId);
    setProject(nextProject);
    if (nextProject.mode === 'brand-dna') {
      setDocuments(summary && 'parsedCount' in summary
        ? summary
        : await window.masterpiece.projects.scanDocuments(projectId));
    } else {
      setAssets(summary && 'imageCount' in summary
        ? summary
        : await window.masterpiece.projects.scanAssets(projectId));
    }
  }

  async function prepare(paths: string[]) {
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) return;
    if (!apiProfileId) {
      setError('请先在设置中添加并启用一个 API Profile。');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (project) {
        if (isBrandDna) {
          const imported = await window.masterpiece.projects.importDocuments(project.id, unique);
          await refreshProject(project.id, imported.summary);
          if (imported.skipped.length) setNotice(`已忽略 ${imported.skipped.length} 个不支持或重复的文档。`);
        } else {
          const imported = await window.masterpiece.projects.importFiles(project.id, unique, 'assets');
          await refreshProject(project.id, imported.summary);
          if (imported.skipped.length) setNotice(`已忽略 ${imported.skipped.length} 个不支持或重复的文件。`);
        }
      } else {
        const created = await window.masterpiece.projects.create({ sourcePaths: unique, apiProfileId, mode });
        setProject(created);
        if (isBrandDna) setDocuments(await window.masterpiece.projects.scanDocuments(created.id));
        else setAssets(await window.masterpiece.projects.scanAssets(created.id));
      }
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function chooseFiles() {
    await prepare(await window.masterpiece.projects.chooseFiles(isBrandDna ? 'documents' : 'assets'));
  }

  async function removeAsset(assetId: string) {
    if (!project) return;
    setBusy(true);
    try { await refreshProject(project.id, await window.masterpiece.projects.removeAsset(project.id, assetId)); }
    catch (reason) { setError(cleanError(reason)); }
    finally { setBusy(false); }
  }

  async function removeDocument(documentId: string) {
    if (!project) return;
    setBusy(true);
    try { await refreshProject(project.id, await window.masterpiece.projects.removeDocument(project.id, documentId)); }
    catch (reason) { setError(cleanError(reason)); }
    finally { setBusy(false); }
  }

  async function removeBatch(batchId: string, label: string) {
    if (!project || !window.confirm(`确定删除批次“${label}”中的全部素材吗？`)) return;
    setBusy(true);
    try { await refreshProject(project.id, await window.masterpiece.projects.removeBatch(project.id, batchId)); }
    catch (reason) { setError(cleanError(reason)); }
    finally { setBusy(false); }
  }

  async function clearAll() {
    if (!project) return;
    const message = isBrandDna
      ? '确定清空全部策划文档吗？\n已解析的文档缓存与报告将失效。'
      : '确定清空全部素材吗？\n已生成的视觉总览缓存将失效。';
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const summary = isBrandDna
        ? await window.masterpiece.projects.clearDocuments(project.id)
        : await window.masterpiece.projects.clearAssets(project.id);
      await refreshProject(project.id, summary);
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (project) await window.masterpiece.projects.remove(project.id).catch(() => {});
    onCancel();
  }

  const itemCount = isBrandDna ? documents?.parsedCount : assets?.totalFiles;
  const ready = Boolean(project && itemCount && selectedProfile?.hasApiKey && selectedProfile.baseUrl && selectedProfile.modelId);

  return <div className="page wizard-page minimal-intake-page">
    <header className="page-header">
      <div>
        <p className="eyebrow">NEW ANALYSIS</p>
        <h1>{isBrandDna ? '导入品牌策划文档' : '导入视觉方案'}</h1>
        <p>{isBrandDna
          ? '从文档事实建立品牌 DNA、诊断策略问题，并转译为唯一创意方向与生图任务。'
          : 'ZIP 会直接解压并哈希去重，原压缩包不会进入素材列表或分析附件。'}</p>
      </div>
      <button className="button ghost" onClick={() => void cancel()}>取消</button>
    </header>

    <div className="mode-selector" aria-label="分析模式">
      <button className={mode === 'visual-evolution' ? 'active' : ''} disabled={Boolean(project)} onClick={() => setMode('visual-evolution')}>
        <strong>视觉方案进化</strong><span>图片 / PDF / ZIP，多模态视觉分析</span>
      </button>
      <button className={mode === 'brand-dna' ? 'active' : ''} disabled={Boolean(project)} onClick={() => setMode('brand-dna')}>
        <strong>品牌 DNA 分析</strong><span>PDF / DOCX / MD / TXT，纯文本推理</span>
      </button>
    </div>

    <section className="panel intake-panel">
      <div className={`drop-zone intake-drop-zone ${busy ? 'busy' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault();
        void prepare(Array.from(event.dataTransfer.files).map((file) => window.masterpiece.files.getPathForFile(file)));
      }}>
        <div className="upload-orbit">↥</div>
        <strong>{busy
          ? (isBrandDna ? '正在读取与解析文档…' : '正在读取、解压与去重…')
          : (isBrandDna ? '将品牌策划文档或文件夹拖到这里' : '将 ZIP、图片、PDF 或文件夹拖到这里')}</strong>
        <p>{isBrandDna ? '支持 PDF、DOCX、Markdown、TXT，可多选' : '支持 ZIP、JPG、JPEG、PNG、WEBP、PDF，可多选'}</p>
        <div className="button-row">
          <button className="button secondary" type="button" disabled={busy} onClick={() => void chooseFiles()}>选择文件</button>
          <button className="button ghost" type="button" disabled={busy} onClick={() => void window.masterpiece.projects.chooseFolder().then(prepare)}>选择文件夹</button>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {notice && <div className="notice ok">{notice}</div>}

      {project && <div className="intake-result">
        <div className="intake-heading">
          <div>
            <small>当前识别项目</small>
            <h2>{project.projectName}</h2>
            <p>{isBrandDna ? '分析后会使用文档中有证据支持的项目名称。' : '深度分析后会优先使用视觉内容中真实出现的名称。'}</p>
          </div>
          <div className="button-row">
            <button className="button text-button" disabled={busy} onClick={() => void chooseFiles()}>+ 继续添加</button>
            <button className="button danger" disabled={busy || !itemCount} onClick={() => void clearAll()}>清空全部</button>
          </div>
        </div>

        {isBrandDna && documents ? <>
          <div className="intake-metrics document-metrics">
            <div><small>文档</small><strong>{documents.totalFiles}</strong></div>
            <div><small>已解析</small><strong>{documents.parsedCount}</strong></div>
            <div><small>页数</small><strong>{documents.totalPages || '—'}</strong></div>
            <div><small>字符</small><strong>{documents.totalCharacters.toLocaleString('zh-CN')}</strong></div>
            <div><small>告警</small><strong>{documents.warningCount + documents.failedCount}</strong></div>
          </div>
          <div className="document-list">
            {documents.items.map((item) => <article className="document-card" key={item.id}>
              <div className="document-type">{item.extension.replace('.', '').toUpperCase()}</div>
              <div><strong>{item.name}</strong><small>{formatBytes(item.bytes)} · {item.pageCount ? `${item.pageCount} 页 · ` : ''}{(item.characterCount || 0).toLocaleString('zh-CN')} 字符</small>
                {item.parseWarnings.map((warning) => <em key={warning}>{warning}</em>)}</div>
              <span className={`parse-status ${item.parseStatus}`}>{item.parseStatus === 'parsed' ? '已解析' : item.parseStatus === 'warning' ? '有告警' : item.parseStatus === 'failed' ? '解析失败' : '等待解析'}</span>
              <button className="document-remove" disabled={busy} onClick={() => void removeDocument(item.id)}>删除</button>
            </article>)}
          </div>
        </> : assets ? <>
          <div className="intake-metrics">
            <div><small>素材</small><strong>{assets.totalFiles}</strong></div>
            <div><small>图片</small><strong>{assets.imageCount}</strong></div>
            <div><small>PDF</small><strong>{assets.pdfCount}</strong></div>
            <div><small>总大小</small><strong>{formatBytes(assets.totalBytes)}</strong></div>
            <div><small>Logo 线索</small><strong>{assets.logoDetected ? '已识别' : '默认锁定'}</strong></div>
          </div>
          {batches.length > 1 && <div className="batch-actions"><small>导入批次</small>{batches.map(([batchId, batch]) => <button key={batchId} disabled={busy} onClick={() => void removeBatch(batchId, batch.label)} title="删除整个批次">{batch.label} · {batch.count} 个 ×</button>)}</div>}
          {assets.items.length > 0 && <div className="intake-thumbnails">
            {assets.items.map((item) => <div className="asset-card removable" key={item.id}>
              <button className="asset-remove" disabled={busy} title={`删除 ${item.name}`} aria-label={`删除 ${item.name}`} onClick={() => void removeAsset(item.id)}>×</button>
              {item.thumbnailDataUrl ? <img src={item.thumbnailDataUrl} alt="" /> : <div className={`file-placeholder ${item.kind}`}>{item.extension.replace('.', '').toUpperCase()}</div>}
              <strong title={item.relativePath}>{item.name}</strong><small>{formatBytes(item.bytes)}</small>
            </div>)}
          </div>}
        </> : null}

        <div className="auto-facts-note">
          <div><small>品牌线索</small><strong>{project.detectedBrandName}</strong><span>置信度 {Math.round(project.factConfidence.brandName * 100)}%</span></div>
          <div><small>行业线索</small><strong>{project.detectedIndustry}</strong><span>置信度 {Math.round(project.factConfidence.industry * 100)}%</span></div>
          <p>{isBrandDna
            ? '报告会逐项标记“已确认 / 合理推断 / 建议 / 内容冲突 / 信息缺失”，不会把推断写成事实。'
            : '通用文件名不会成为最终项目名；不确定信息会标记为“基于现有素材推断”或“待确认”。'}</p>
        </div>
      </div>}
    </section>

    <footer className="intake-footer">
      <label className="analysis-profile-select">分析模型<select value={apiProfileId} onChange={(event) => setApiProfileId(event.target.value)}>
        {!enabledProfiles.length && <option value="">尚无可用配置</option>}
        {enabledProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.displayName} / {profile.modelId}</option>)}
      </select><span>{selectedProfile
        ? `${selectedProfile.provider} · ${selectedProfile.hasApiKey ? 'Key 已保存' : '缺少 Key'} · ${isBrandDna ? `只需文本能力 · ${selectedProfile.qualityTier}` : '需要图片能力'}`
        : '请前往设置添加 API Profile'}</span></label>
      <div className="button-row"><button className="button ghost" onClick={() => void cancel()}>取消</button><button className="button primary large" disabled={!ready || busy} onClick={() => project && onStart(project, apiProfileId)}>开始分析</button></div>
    </footer>
  </div>;
}
