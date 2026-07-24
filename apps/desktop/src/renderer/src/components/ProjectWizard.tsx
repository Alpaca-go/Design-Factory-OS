import { useMemo, useState } from 'react';
import type { AssetSummary, ProjectRecord, PublicSettings } from '../../../shared/types';
import { cleanError, formatBytes } from '../utils';
import { VisualAssetUploader } from './VisualAssetUploader';

interface Props {
  settings: PublicSettings;
  onStart(project: ProjectRecord, apiProfileId: string): void;
  onCancel(): void;
}

export function ProjectWizard({ settings, onStart, onCancel }: Props) {
  const enabledProfiles = settings.profiles.filter((profile) => profile.isEnabled);
  const [apiProfileId, setApiProfileId] = useState(
    enabledProfiles.find((profile) => profile.isDefault)?.id || enabledProfiles[0]?.id || ''
  );
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [summary, setSummary] = useState<AssetSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selectedProfile = enabledProfiles.find((profile) => profile.id === apiProfileId);
  const batches = useMemo(() => {
    const result = new Map<string, { label: string; count: number }>();
    for (const item of summary?.items || []) {
      const existing = result.get(item.batchId);
      const label = item.archiveSourceName || (item.sourceType === 'folder' ? '文件夹批次' : item.name);
      result.set(item.batchId, { label: existing?.label || label, count: (existing?.count || 0) + 1 });
    }
    return [...result.entries()];
  }, [summary]);

  async function refreshProject(projectId: string, nextSummary?: AssetSummary) {
    const [nextProject, scanned] = await Promise.all([
      window.masterpiece.projects.get(projectId),
      nextSummary ? Promise.resolve(nextSummary) : window.masterpiece.projects.scanAssets(projectId)
    ]);
    setProject(nextProject);
    setSummary(scanned);
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
        const imported = await window.masterpiece.projects.importFiles(project.id, unique, 'assets');
        await refreshProject(project.id, imported.summary);
        if (imported.skipped.length) setNotice(`已忽略 ${imported.skipped.length} 个不支持或重复的文件。`);
      } else {
        const created = await window.masterpiece.projects.create({ sourcePaths: unique, apiProfileId });
        setProject(created);
        setSummary(await window.masterpiece.projects.scanAssets(created.id));
      }
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(assetId: string) {
    if (!project) return;
    setBusy(true);
    try { await refreshProject(project.id, await window.masterpiece.projects.removeAsset(project.id, assetId)); }
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

  async function clearAssets() {
    if (!project || !window.confirm('确定清空全部素材吗？\n已生成的视觉总览缓存将失效。')) return;
    setBusy(true);
    try { await refreshProject(project.id, await window.masterpiece.projects.clearAssets(project.id)); }
    catch (reason) { setError(cleanError(reason)); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (project) await window.masterpiece.projects.remove(project.id).catch(() => {});
    onCancel();
  }

  const ready = Boolean(project && summary?.totalFiles && selectedProfile?.hasApiKey && selectedProfile.baseUrl && selectedProfile.modelId);

  return <div className="page wizard-page minimal-intake-page">
    <header className="page-header">
      <div><p className="eyebrow">NEW ANALYSIS</p><h1>导入视觉方案</h1><p>ZIP 会直接解压并哈希去重，原压缩包不会进入素材列表或分析附件。</p></div>
      <button className="button ghost" onClick={() => void cancel()}>取消</button>
    </header>

    <section className="panel intake-panel">
      <VisualAssetUploader
        role="current_project"
        busy={busy}
        notice={notice}
        items={(summary?.items || []).map((item) => ({
          id: item.id,
          name: item.name,
          extension: item.extension,
          bytes: item.bytes,
          thumbnailDataUrl: item.thumbnailDataUrl
        }))}
        onAddPaths={prepare}
        onChooseFiles={() => window.masterpiece.projects.chooseFiles('assets')}
        onChooseFolder={() => window.masterpiece.projects.chooseFolder()}
        onRemove={removeAsset}
        onClear={clearAssets}
      />

      {error && <div className="notice error">{error}</div>}

      {project && summary && <div className="intake-result">
        <div className="intake-heading">
          <div><small>当前识别项目</small><h2>{project.projectName}</h2><p>深度分析后会优先使用视觉内容中真实出现的名称。</p></div>
          <div className="button-row"><button className="button text-button" disabled={busy} onClick={() => void window.masterpiece.projects.chooseFiles('assets').then(prepare)}>+ 继续添加</button><button className="button danger" disabled={busy || !summary.totalFiles} onClick={() => void clearAssets()}>清空全部</button></div>
        </div>
        <div className="intake-metrics">
          <div><small>素材</small><strong>{summary.totalFiles}</strong></div>
          <div><small>图片</small><strong>{summary.imageCount}</strong></div>
          <div><small>PDF</small><strong>{summary.pdfCount}</strong></div>
          <div><small>总大小</small><strong>{formatBytes(summary.totalBytes)}</strong></div>
          <div><small>Logo 线索</small><strong>{summary.logoDetected ? '已识别' : '默认锁定'}</strong></div>
        </div>
        {batches.length > 1 && <div className="batch-actions"><small>导入批次</small>{batches.map(([batchId, batch]) => <button key={batchId} disabled={busy} onClick={() => void removeBatch(batchId, batch.label)} title="删除整个批次">{batch.label} · {batch.count} 个 ×</button>)}</div>}
        <div className="auto-facts-note">
          <div><small>品牌线索</small><strong>{project.detectedBrandName}</strong><span>置信度 {Math.round(project.factConfidence.brandName * 100)}%</span></div>
          <div><small>行业线索</small><strong>{project.detectedIndustry}</strong><span>置信度 {Math.round(project.factConfidence.industry * 100)}%</span></div>
          <p>通用文件名不会成为最终项目名；不确定信息会标记为“基于现有素材推断”或“待确认”。</p>
        </div>
      </div>}
    </section>

    <footer className="intake-footer">
      <label className="analysis-profile-select">分析模型<select value={apiProfileId} onChange={(event) => setApiProfileId(event.target.value)}>
        {!enabledProfiles.length && <option value="">尚无可用配置</option>}
        {enabledProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.displayName} / {profile.modelId}</option>)}
      </select><span>{selectedProfile ? `${selectedProfile.provider} · ${selectedProfile.hasApiKey ? 'Key 已保存' : '缺少 Key'}` : '请前往设置添加 API Profile'}</span></label>
      <div className="button-row"><button className="button ghost" onClick={() => void cancel()}>取消</button><button className="button primary large" disabled={!ready || busy} onClick={() => project && onStart(project, apiProfileId)}>开始分析</button></div>
    </footer>
  </div>;
}
