import { useEffect, useState } from 'react';
import type {
  ProjectRecord,
  ReferenceTranslationProfile,
  ReferenceTranslationRunRecord
} from '../../../shared/types';
import { cleanError, formatDurationHuman } from '../utils';

interface Props {
  onBack(): void;
}

const COMPLETENESS_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高' };
const DNA_CATEGORY_LABELS: Record<string, string> = {
  visualTemperament: '视觉气质',
  compositionRules: '构图规则',
  graphicGrammar: '图形语法',
  colorLogic: '色彩逻辑',
  typographyLogic: '字体逻辑',
  materialAndLighting: '材质与光线',
  extensionMechanism: '延展机制'
};

function levelLabel(value?: string): string {
  return (value && COMPLETENESS_LABELS[value]) || value || '—';
}

export function ReferenceTranslationWorkspace({ onBack }: Props) {
  const [referenceAssetPaths, setReferenceAssetPaths] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [currentProjectSourcePaths, setCurrentProjectSourcePaths] = useState<string[]>([]);
  const [useIntermediateResults, setUseIntermediateResults] = useState(false);
  const [visualAnalysisPath, setVisualAnalysisPath] = useState('');
  const [projectContextPath, setProjectContextPath] = useState('');
  const [preference, setPreference] = useState('');
  const [runs, setRuns] = useState<ReferenceTranslationRunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<ReferenceTranslationRunRecord | null>(null);
  const [profile, setProfile] = useState<ReferenceTranslationProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refreshRuns() {
    const next = await window.masterpiece.referenceTranslation.listRuns();
    setRuns(next);
    return next;
  }

  useEffect(() => {
    void refreshRuns().catch((reason) => setError(cleanError(reason)));
    void window.masterpiece.projects.list()
      .then((items) => {
        setProjects(items);
        setCurrentProjectId((current) => current || items[0]?.id || '');
      })
      .catch((reason) => setError(cleanError(reason)));
  }, []);

  async function chooseFile(kind: 'visual-analysis' | 'project-context') {
    setError('');
    try {
      const [chosen] = await window.masterpiece.referenceTranslation.chooseInput();
      if (!chosen) return;
      if (kind === 'visual-analysis') setVisualAnalysisPath(chosen);
      else setProjectContextPath(chosen);
    } catch (reason) {
      setError(cleanError(reason));
    }
  }

  async function chooseReferenceAssets() {
    setError('');
    try {
      const chosen = await window.masterpiece.referenceTranslation.chooseReferenceAssets();
      if (chosen.length) setReferenceAssetPaths(chosen);
    } catch (reason) {
      setError(cleanError(reason));
    }
  }

  async function chooseProjectSources() {
    setError('');
    try {
      const chosen = await window.masterpiece.referenceTranslation.chooseProjectSources();
      if (chosen.length) setCurrentProjectSourcePaths(chosen);
    } catch (reason) {
      setError(cleanError(reason));
    }
  }

  async function start() {
    const developerReady = visualAnalysisPath && projectContextPath;
    const userReady = referenceAssetPaths.length > 0
      && Boolean(currentProjectId || currentProjectSourcePaths.length);
    if (busy || (useIntermediateResults ? !developerReady : !userReady)) return;
    setBusy(true);
    setError('');
    setNotice('');
    setSelectedRun(null);
    setProfile(null);
    try {
      const result = useIntermediateResults
        ? await window.masterpiece.referenceTranslation.run({
          visualAnalysisPath,
          projectContextPath,
          preference
        })
        : await window.masterpiece.referenceTranslation.runUserInput({
          referenceAssetPaths,
          currentProjectId: currentProjectId || undefined,
          currentProjectSourcePaths: currentProjectId ? undefined : currentProjectSourcePaths,
          preference
        });
      setSelectedRun(result.run);
      setProfile(result.profile);
      setNotice('参考转译完成。转译矩阵仅提供机制级迁移建议，禁止复制项不会进入执行资产。');
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setBusy(false);
      await refreshRuns().catch(() => {});
    }
  }

  async function openRun(run: ReferenceTranslationRunRecord) {
    setError('');
    try {
      setSelectedRun(run);
      setProfile(await window.masterpiece.referenceTranslation.getProfile(run.id));
    } catch (reason) {
      setError(cleanError(reason));
    }
  }

  async function removeRun(run: ReferenceTranslationRunRecord) {
    if (!window.confirm(`确定删除参考转译记录（${run.visualAnalysisFilename}）吗？\n\n此操作会永久删除该任务的本地文件夹，且无法撤销。`)) return;
    try {
      await window.masterpiece.referenceTranslation.remove(run.id);
      setRuns((current) => current.filter((item) => item.id !== run.id));
      if (selectedRun?.id === run.id) {
        setSelectedRun(null);
        setProfile(null);
      }
    } catch (reason) {
      setError(cleanError(reason));
    }
  }

  if (selectedRun && profile) {
    const identity = profile.referenceIdentity;
    const transfer = profile.transferability;
    const dnaEntries = Object.entries(profile.referenceVisualDNA).filter(([, rules]) => rules.length);
    return <div className="page report-page reference-translation-report">
      <header className="page-header">
        <div><p className="eyebrow">REFERENCE TRANSLATION PROFILE</p><h1>参考转译结果</h1><p>{selectedRun.visualAnalysisFilename} → {selectedRun.projectContextFilename}</p></div>
        <button className="button ghost" onClick={() => { setSelectedRun(null); setProfile(null); }}>返回工作台</button>
      </header>
      <div className="result-summary">
        <div><small>参考完整度</small><strong>{levelLabel(identity.completeness)}（{identity.assetCount} 项证据源）</strong></div>
        <div><small>规律一致性</small><strong>{levelLabel(identity.consistency)}</strong></div>
        <div><small>转译矩阵</small><strong>{profile.projectTranslationMatrix.length} 项</strong></div>
        <div><small>禁止复制</small><strong>{transfer.prohibitedToCopy.length} 项</strong></div>
      </div>
      <div className="result-actions">
        <button className="button secondary" onClick={() => void navigator.clipboard.writeText(JSON.stringify(profile, null, 2)).then(() => setNotice('Profile JSON 已复制。'))}>复制 Profile JSON</button>
        <button className="button secondary" onClick={() => void window.masterpiece.referenceTranslation.openFolder(selectedRun.id)}>打开输出文件夹</button>
      </div>
      {notice && <div className="notice ok">{notice}</div>}
      {error && <div className="notice error">{error}</div>}
      {identity.missingEvidence.length > 0 && <div className="notice error">{identity.missingEvidence.join(' ')}</div>}

      <section className="panel">
        <div className="section-heading"><span>01</span><div><h2>可迁移性分类</h2><p>直接迁移 {transfer.directlyTransferable.length} · 需重构 {transfer.requiresReinterpretation.length} · 禁止复制 {transfer.prohibitedToCopy.length}</p></div></div>
        <div className="reference-transfer-groups">
          {([['directlyTransferable', '可直接迁移'], ['requiresReinterpretation', '需重新演绎'], ['prohibitedToCopy', '禁止复制']] as const).map(([key, label]) => (
            <div key={key} className={`reference-transfer-group ${key}`}>
              <strong>{label}</strong>
              {transfer[key].length ? <ul>{transfer[key].map((item) => <li key={item.item_id}><span>{item.name}</span><small>{item.reason}</small></li>)}</ul> : <p className="muted">无</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading"><span>02</span><div><h2>项目转译矩阵</h2><p>保留参考机制的运行属性，用当前项目事实重建表层形式</p></div></div>
        <div className="reference-matrix-list">
          {profile.projectTranslationMatrix.map((item) => (
            <div key={item.translation_id} className="reference-matrix-card">
              <div className="reference-matrix-head"><span>{item.translation_id}</span><small>置信度 {Math.round(item.confidence * 100)}%</small></div>
              <p><strong>参考机制</strong>{item.referenceMechanism}</p>
              <p><strong>转译后机制</strong>{item.translatedMechanism}</p>
              <p><strong>保留</strong>{item.retainedProperties.join('、')}</p>
              <p><strong>重建</strong>{item.changedProperties.join('、')}</p>
              <p className="prohibited"><strong>禁止</strong>{item.prohibitedElements.join('；')}</p>
            </div>
          ))}
        </div>
      </section>

      {dnaEntries.length > 0 && <section className="panel">
        <div className="section-heading"><span>03</span><div><h2>参考视觉 DNA</h2><p>从参考证据中提炼的稳定视觉规律</p></div></div>
        <div className="reference-dna-list">
          {dnaEntries.map(([category, rules]) => (
            <div key={category} className="reference-dna-group">
              <strong>{DNA_CATEGORY_LABELS[category] || category}</strong>
              <ul>{rules.map((rule) => <li key={rule.name}><span>{rule.name}</span><small>{rule.mechanism}</small></li>)}</ul>
            </div>
          ))}
        </div>
      </section>}
    </div>;
  }

  return <div className="page reference-translation-page">
    <header className="page-header">
      <div><p className="eyebrow">REFERENCE → PROJECT TRANSLATION</p><h1>参考转译</h1><p>从参考项目的视觉分析中提取可迁移机制，映射到当前项目，不复制签名资产。本功能离线运行，不调用模型。</p></div>
      <div className="button-row"><button className="button ghost" onClick={onBack}>返回首页</button></div>
    </header>

    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice ok">{notice}</div>}

    <div className="visual-translation-grid">
      <section className="panel visual-translation-form">
        <div className="section-heading"><span>01</span><div><h2>准备转译任务</h2><p>上传参考方案，并选择要应用到的当前项目</p></div></div>

        {!useIntermediateResults && <>
          <div className="reference-input-row">
            <div>
              <strong>参考视觉方案</strong>
              <small>{referenceAssetPaths.length
                ? `已选择 ${referenceAssetPaths.length} 个文件：${referenceAssetPaths.map((item) => item.split(/[\\/]/).pop()).join('、')}`
                : '支持多张 JPG、PNG、WebP，以及 PDF、ZIP'}</small>
            </div>
            <button className="button secondary" type="button" disabled={busy} onClick={() => void chooseReferenceAssets()}>
              {referenceAssetPaths.length ? '重新选择' : '上传参考方案'}
            </button>
          </div>

          <div className="reference-project-field">
            <strong>选择当前项目</strong>
            {projects.length ? <>
              <select value={currentProjectId} disabled={busy} onChange={(event) => setCurrentProjectId(event.target.value)}>
                {projects.map((project) => <option key={project.id} value={project.id}>
                  {project.projectName} · {project.status === 'completed' ? '已有品牌分析' : '将自动完成分析'}
                </option>)}
              </select>
              <small>系统会读取项目事实、已有品牌分析与 Locked Assets。</small>
            </> : <div className="reference-input-row compact">
              <div>
                <small>{currentProjectSourcePaths.length
                  ? `已选择 ${currentProjectSourcePaths.length} 个项目文件`
                  : '尚无现有项目，请上传项目文档和视觉资产，系统将自动创建并分析项目。'}</small>
              </div>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void chooseProjectSources()}>
                {currentProjectSourcePaths.length ? '重新选择' : '上传项目资料'}
              </button>
            </div>}
          </div>
        </>}

        <label>转译偏好（可选）
          <textarea value={preference} maxLength={500} rows={3} placeholder="填写最希望继承的气质、材质、版式或构图特征" onChange={(event) => setPreference(event.target.value)} />
        </label>

        <details className="reference-advanced" onToggle={(event) => {
          if (!(event.currentTarget as HTMLDetailsElement).open) setUseIntermediateResults(false);
        }}>
          <summary>高级设置</summary>
          <label className="reference-developer-toggle">
            <input type="checkbox" checked={useIntermediateResults} onChange={(event) => setUseIntermediateResults(event.target.checked)} />
            使用已有中间结果
          </label>
          {useIntermediateResults && <div className="reference-developer-inputs">
            <p>开发者模式会跳过前置分析，适用于调试转译算法和执行回归测试。</p>
            <div className="reference-input-row">
              <div><strong>reference-visual-analysis.json</strong><small>{visualAnalysisPath ? visualAnalysisPath.split(/[\\/]/).pop() : '直接上传已有参考视觉分析结果'}</small></div>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void chooseFile('visual-analysis')}>{visualAnalysisPath ? '重新选择' : '选择 JSON'}</button>
            </div>
            <div className="reference-input-row">
              <div><strong>project-context.json</strong><small>{projectContextPath ? projectContextPath.split(/[\\/]/).pop() : '直接上传已有项目上下文'}</small></div>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void chooseFile('project-context')}>{projectContextPath ? '重新选择' : '选择 JSON'}</button>
            </div>
          </div>}
        </details>

        <div className="mode-hint">{useIntermediateResults
          ? '已启用开发者模式：系统将直接使用上传的中间结果，不调用前置视觉分析。'
          : '系统将自动分析参考方案，并在内部生成 reference-visual-analysis.json 与 project-context.json。普通用户无需准备 JSON。'}</div>
        <button className="button primary full" disabled={busy || (useIntermediateResults
          ? !visualAnalysisPath || !projectContextPath
          : !referenceAssetPaths.length || !(currentProjectId || currentProjectSourcePaths.length))}
          onClick={() => void start()}>{busy ? '正在分析并转译…' : '开始参考转译'}</button>
      </section>

      <aside className="panel visual-translation-history">
        <div className="section-heading"><span>02</span><div><h2>转译记录</h2><p>全部在本地离线完成，可随时重新查看</p></div></div>
        {runs.length ? <div className="visual-run-list">{runs.map((run) => (
          <div key={run.id} className={`visual-run-card ${run.status}`}>
            <div><strong>{run.visualAnalysisFilename}</strong><span>{run.status === 'completed' ? '已完成' : '失败'}</span></div>
            <small>{run.projectContextFilename} · 矩阵 {run.matrixCount ?? 0} 项</small>
            <small>{new Date(run.createdAt).toLocaleString('zh-CN')}{run.durationMs != null ? ` · ${formatDurationHuman(run.durationMs)}` : ''}</small>
            {run.lastError && <em>{run.lastError}</em>}
            <div className="button-row">
              {run.status === 'completed' && <button className="button secondary" onClick={() => void openRun(run)}>查看结果</button>}
              <button className="button ghost" onClick={() => void removeRun(run)}>删除</button>
            </div>
          </div>
        ))}</div> : <div className="visual-document-empty">还没有参考转译记录。</div>}
      </aside>
    </div>
  </div>;
}
