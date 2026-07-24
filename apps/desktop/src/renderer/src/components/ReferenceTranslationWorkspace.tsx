import { useEffect, useState } from 'react';
import type {
  ProjectRecord,
  ReferenceAssetSelectionItem,
  ReferenceLedDirection,
  ReferenceStyleReconstruction,
  ReferenceTranslationProgress,
  ReferenceTranslationProfile,
  ReferenceTranslationRunRecord
} from '../../../shared/types';
import { cleanError, formatDurationHuman } from '../utils';
import { VisualAssetUploader } from './VisualAssetUploader';

interface Props {
  initialRunId?: string;
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

export function ReferenceTranslationWorkspace({ initialRunId = '', onBack }: Props) {
  const [referenceAssets, setReferenceAssets] = useState<ReferenceAssetSelectionItem[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [currentProjectSourcePaths, setCurrentProjectSourcePaths] = useState<string[]>([]);
  const [useIntermediateResults, setUseIntermediateResults] = useState(false);
  const [visualAnalysisPath, setVisualAnalysisPath] = useState('');
  const [projectContextPath, setProjectContextPath] = useState('');
  const [preference, setPreference] = useState('');
  const [confirmLowConfidenceSelections, setConfirmLowConfidenceSelections] = useState(false);
  const [runs, setRuns] = useState<ReferenceTranslationRunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<ReferenceTranslationRunRecord | null>(null);
  const [profile, setProfile] = useState<ReferenceTranslationProfile | null>(null);
  const [direction, setDirection] = useState<ReferenceLedDirection | null>(null);
  const [reconstruction, setReconstruction] = useState<ReferenceStyleReconstruction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<ReferenceTranslationProgress | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const showDebugInputs = import.meta.env.DEV;
  const selectedCurrentProject = projects.find((project) => project.id === currentProjectId);

  async function refreshRuns() {
    const next = await window.masterpiece.referenceTranslation.listRuns();
    setRuns(next);
    return next;
  }

  useEffect(() => {
    void refreshRuns()
      .then((items) => {
        const requested = items.find((item) => item.id === initialRunId);
        if (requested?.status === 'completed') void openRun(requested);
      })
      .catch((reason) => setError(cleanError(reason)));
    void window.masterpiece.projects.list()
      .then((items) => {
        setProjects(items);
        setCurrentProjectId((current) => current || items[0]?.id || '');
      })
      .catch((reason) => setError(cleanError(reason)));
    void window.masterpiece.referenceTranslation.getActive().then((active) => {
      if (active) {
        setProgress(active);
        setBusy(true);
      }
    });
    const unsubscribe = window.masterpiece.referenceTranslation.onProgress((next) => {
      setProgress((current) => !current || current.jobId !== next.jobId || next.progress >= current.progress ? next : current);
      setBusy(next.status === 'running');
      if (next.status === 'completed' || next.status === 'failed' || next.status === 'cancelled') {
        void refreshRuns();
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!progress || progress.status !== 'running') return;
    const update = () => setElapsedMs(Date.now() - new Date(progress.startedAt).getTime());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [progress?.jobId, progress?.status, progress?.startedAt]);

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

  async function prepareReferenceAssets(paths: string[]) {
    const sourcePaths = [...referenceAssets.map((item) => item.sourcePath), ...paths];
    if (!sourcePaths.length) return;
    setError('');
    try {
      const inspected = await window.masterpiece.referenceTranslation.inspectAssets(sourcePaths);
      setReferenceAssets(inspected.items);
      const messages = [];
      if (inspected.duplicateCount) messages.push(`已忽略 ${inspected.duplicateCount} 个重复文件`);
      if (inspected.skipped.length) messages.push(
        `已跳过 ${inspected.skipped.length} 个不支持的文件：${inspected.skipped.slice(0, 5).join('、')}${inspected.skipped.length > 5 ? '…' : ''}`
      );
      setNotice(messages.join('；'));
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
    const userReady = referenceAssets.length > 0
      && Boolean(currentProjectId || currentProjectSourcePaths.length);
    if (busy || (useIntermediateResults ? !developerReady : !userReady)) return;
    setBusy(true);
    setError('');
    setNotice('');
    setSelectedRun(null);
    setProfile(null);
    setDirection(null);
    setReconstruction(null);
    try {
      const result = useIntermediateResults
        ? await window.masterpiece.referenceTranslation.run({
          visualAnalysisPath,
          projectContextPath,
          referenceStylePreference: preference
        })
        : await window.masterpiece.referenceTranslation.runUserInput({
          referenceAssetPaths: referenceAssets.map((item) => item.sourcePath),
          currentProjectId: currentProjectId || undefined,
          currentProjectSourcePaths: currentProjectId ? undefined : currentProjectSourcePaths,
          referenceStylePreference: preference,
          force: confirmLowConfidenceSelections
        });
      setSelectedRun(result.run);
      setProfile(result.profile || null);
      setDirection(result.direction || null);
      setReconstruction(result.reconstruction || null);
      setNotice('视觉重构执行文档已生成，可与当前项目原视觉方案一起交给 GPT 进行生图。');
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setBusy(false);
      await refreshRuns().catch(() => {});
    }
  }

  async function cancelActive() {
    if (!progress || !window.confirm('确定取消当前参考风格重构任务吗？')) return;
    await window.masterpiece.referenceTranslation.cancel(progress.jobId);
  }

  async function retryReport(run: ReferenceTranslationRunRecord) {
    setError('');
    setBusy(true);
    try {
      const result = await window.masterpiece.referenceTranslation.retryReport(run.id);
      setSelectedRun(result.run);
      setProfile(result.profile || null);
      setDirection(result.direction || null);
      setReconstruction(result.reconstruction || null);
    } catch (reason) {
      setError(cleanError(reason));
    } finally {
      setBusy(false);
      await refreshRuns();
    }
  }

  async function openRun(run: ReferenceTranslationRunRecord) {
    setError('');
    try {
      setSelectedRun(run);
      const [nextProfile, nextDirection, nextReconstruction] = await Promise.all([
        window.masterpiece.referenceTranslation.getProfile(run.id).catch(() => null),
        window.masterpiece.referenceTranslation.getDirection(run.id).catch(() => null),
        window.masterpiece.referenceTranslation.getReconstruction(run.id).catch(() => null)
      ]);
      setProfile(nextProfile);
      setDirection(nextDirection);
      setReconstruction(nextReconstruction);
    } catch (reason) {
      setError(cleanError(reason));
    }
  }

  async function removeRun(run: ReferenceTranslationRunRecord) {
    if (!window.confirm(`确定删除参考风格重构记录（${run.visualAnalysisFilename}）吗？\n\n此操作会永久删除该任务的本地文件夹，且无法撤销。`)) return;
    try {
      await window.masterpiece.referenceTranslation.remove(run.id);
      setRuns((current) => current.filter((item) => item.id !== run.id));
      if (selectedRun?.id === run.id) {
        setSelectedRun(null);
        setProfile(null);
        setDirection(null);
        setReconstruction(null);
      }
    } catch (reason) {
      setError(cleanError(reason));
    }
  }

  if (selectedRun && reconstruction) {
    const current = reconstruction.currentProjectProfile;
    const style = reconstruction.referenceStyleProfile;
    const visualDirection = reconstruction.visualReconstructionDirection;
    const selectionProtocol = reconstruction.assetSelectionProtocol;
    const legacyCurrent = current as typeof current & { coreOffering?: string[] };
    const legacyDirection = visualDirection as typeof visualDirection & {
      imageSystem?: string[];
      prohibitedActions?: string[];
    };
    const photographySystem = visualDirection.photographySystem || legacyDirection.imageSystem || [];
    const prohibitedActions = visualDirection.prohibitedActions
      || reconstruction.styleApplicationPlan?.prohibitedActions
      || [];
    const applications = [
      visualDirection.visualAnchor,
      ...visualDirection.colorSystem,
      ...visualDirection.compositionSystem,
      ...visualDirection.graphicSystem,
      ...visualDirection.typographySystem,
      ...visualDirection.materialSystem,
      ...photographySystem
    ].slice(0, 10);
    const styleGroups = [
      ['色彩系统', style.colorSystem],
      ['构图与版式', style.compositionSystem],
      ['图形语言', style.graphicLanguage],
      ['字体层级', style.typographySystem],
      ['材质与灯光', style.materialSystem],
      ['触点延展', style.viExtensionSystem]
    ] as const;
    return <div className="page report-page reference-translation-report">
      <header className="page-header">
        <div><p className="eyebrow">REFERENCE STYLE RECONSTRUCTION</p><h1>参考风格重构结果</h1><p>{current.projectName} · GPT 可执行视觉重构文档</p></div>
        <button className="button ghost" onClick={() => { setSelectedRun(null); setProfile(null); setDirection(null); setReconstruction(null); }}>返回工作台</button>
      </header>
      <div className="result-summary">
        <div><small>当前品牌</small><strong>{current.brandName}</strong></div>
        <div><small>行业</small><strong>{current.industry}</strong></div>
        <div><small>业务触点</small><strong>{current.businessTouchpoints.length} 类</strong></div>
        <div><small>质量 Gate</small><strong>{reconstruction.validation.passed ? '已通过' : '未通过'}</strong></div>
      </div>
      <div className="result-actions">
        <button className="button secondary" onClick={() => void window.masterpiece.referenceTranslation.readReport(selectedRun.id)
          .then((markdown) => navigator.clipboard.writeText(markdown))
          .then(() => setNotice('视觉重构执行文档已复制。'))}>复制 GPT 执行文档</button>
        <button className="button secondary" onClick={() => void window.masterpiece.referenceTranslation.openFolder(selectedRun.id)}>打开输出文件夹</button>
      </div>
      {notice && <div className="notice ok">{notice}</div>}

      <section className="panel">
        <div className="section-heading"><span>01</span><div><h2>项目锁定信息</h2><p>当前项目决定设计对象、产品事实与不可修改边界</p></div></div>
        <div className="reference-lock-grid">
          <p><strong>核心产品</strong>{(current.coreProducts || legacyCurrent.coreOffering || []).join('；')}</p>
          <p><strong>目标用户</strong>{current.targetAudience.join('；')}</p>
          <p><strong>品牌定位</strong>{current.brandPositioning}</p>
          <p><strong>Locked Assets</strong>{current.lockedAssets.join('；')}</p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading"><span>02</span><div><h2>参考方案风格摘要</h2><p>只保留视觉形式与表现规则，不迁移参考品牌语义</p></div></div>
        <div className="reference-dna-list">
          {styleGroups.map(([label, rules]) => <div className="reference-dna-group" key={label}>
            <strong>{label}</strong>
            {rules.length ? <ul>{rules.slice(0, 6).map((rule) => <li key={rule.rule}><span>{rule.rule}</span><small>{rule.designEffect}</small></li>)}</ul> : <p className="muted">未提取到稳定规则</p>}
          </div>)}
        </div>
      </section>

      {selectionProtocol && <section className="panel">
        <div className="section-heading"><span>02A</span><div><h2>素材筛选协议</h2><p>核心资料、参考母集与各任务参考子集已分层隔离</p></div></div>
        <div className="reference-lock-grid">
          <p><strong>当前项目核心资料包</strong>{selectionProtocol.currentProjectCorePack.sourceAssetIds.length} 个资产</p>
          <p><strong>参考依据母集</strong>{selectionProtocol.referenceMasterSet.assetIds.length} 个资产</p>
          <p><strong>主要风格载体</strong>{selectionProtocol.referenceMasterSet.styleCarriers
            .filter((item) => item.priority === 'primary').map((item) => item.category).join('；') || '单参考降级提取'}</p>
          <p><strong>确认状态</strong>{selectionProtocol.requiresHumanConfirmation ? '建议人工复核低置信度项' : '自动筛选已通过'}</p>
        </div>
        <div className="reference-application-list">
          {selectionProtocol.taskReferenceSubsets.map((subset) => <div key={subset.outputType}>
            <small>{subset.outputType}</small>
            <strong>{subset.selectedAssetIds.length} 张 · 主参考 {subset.primaryReferenceAssetId || '无'}</strong>
          </div>)}
        </div>
      </section>}

      <section className="panel">
        <div className="section-heading"><span>03</span><div><h2>当前项目风格应用策略</h2><p>参考风格作用于当前项目内容，专属图形必须项目化重建</p></div></div>
        <div className="reference-application-list">
          {applications.map((item, index) => <div key={`${index}-${item}`}>
            <small>{index === 0 ? '主体' : '视觉系统'}</small>
            <strong>{item}</strong>
          </div>)}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading"><span>04</span><div><h2>重构后的核心视觉方向</h2><p>{visualDirection.directionName}</p></div></div>
        <div className="reference-direction-card">
          <p><strong>核心命题</strong>{visualDirection.coreProposition}</p>
          <p><strong>视觉锚点</strong>{visualDirection.visualAnchor}</p>
          <p><strong>构图系统</strong>{visualDirection.compositionSystem.join('；')}</p>
          <p><strong>材质系统</strong>{visualDirection.materialSystem.join('；')}</p>
          <p className="prohibited"><strong>禁止事项</strong>{prohibitedActions.join('；')}</p>
        </div>
      </section>
      {showDebugInputs && <details className="panel reference-advanced reference-intermediate-results">
        <summary>查看中间结果</summary>
        <div className="reference-intermediate-grid">
          <section>
            <strong>current-project-profile.json</strong>
            <span className={reconstruction.validation.projectProfileClean ? 'pass' : 'failed'}>
              {reconstruction.validation.projectProfileClean ? '通过' : '含污染项'}
            </span>
            <pre>{JSON.stringify(current, null, 2)}</pre>
          </section>
          <section>
            <strong>reference-style-profile.json</strong>
            <span className={reconstruction.validation.noReferenceBrandPollution ? 'pass' : 'failed'}>
              {reconstruction.validation.noReferenceBrandPollution ? '通过' : '含污染项'}
            </span>
            <pre>{JSON.stringify(style, null, 2)}</pre>
          </section>
          <section>
            <strong>visual-reconstruction-direction.json</strong>
            <span className={reconstruction.validation.visualDirectionSpecific ? 'pass' : 'failed'}>
              {reconstruction.validation.visualDirectionSpecific ? '通过' : '失败'}
            </span>
            <pre>{JSON.stringify(visualDirection, null, 2)}</pre>
          </section>
          <section>
            <strong>quality-validation.json</strong>
            <span className={reconstruction.validation.passed ? 'pass' : 'failed'}>
              {reconstruction.validation.passed ? '通过' : '失败'}
            </span>
            <pre>{JSON.stringify(reconstruction.validation, null, 2)}</pre>
          </section>
        </div>
      </details>}
    </div>;
  }

  if (selectedRun && profile) {
    const identity = profile.referenceIdentity;
    const transfer = profile.transferability;
    const dnaEntries = Object.entries(profile.referenceVisualDNA).filter(([, rules]) => rules.length);
    return <div className="page report-page reference-translation-report">
      <header className="page-header">
        <div><p className="eyebrow">REFERENCE TRANSLATION PROFILE</p><h1>参考转译结果</h1><p>{selectedRun.visualAnalysisFilename} → {selectedRun.projectContextFilename}</p></div>
        <button className="button ghost" onClick={() => { setSelectedRun(null); setProfile(null); setDirection(null); }}>返回工作台</button>
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
      {direction && <section className="panel">
        <div className="section-heading"><span>04</span><div><h2>Reference-led Primary Direction</h2><p>{direction.directionName}</p></div></div>
        <div className="reference-direction-card">
          <p><strong>核心命题</strong>{direction.coreProposition}</p>
          <p><strong>视觉锚点</strong>{direction.visualAnchor}</p>
          <p><strong>构图系统</strong>{direction.compositionSystem.join('；') || '依据当前项目触点建立'}</p>
          <p><strong>材质系统</strong>{direction.materialSystem.join('；') || '依据当前项目工艺重建'}</p>
          <p className="prohibited"><strong>禁止事项</strong>{direction.prohibitedActions.join('；')}</p>
        </div>
      </section>}
    </div>;
  }

  return <div className="page reference-translation-page">
    <header className="page-header">
      <div><p className="eyebrow">REFERENCE STYLE RECONSTRUCTION</p><h1>参考风格重构</h1><p>当前项目提供品牌身份、产品与 Locked Assets；参考方案只提供视觉风格、构图、色彩、材质和表现方式。</p></div>
      <div className="button-row"><button className="button ghost" onClick={onBack}>返回首页</button></div>
    </header>

    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice ok">{notice}</div>}
    {progress?.status === 'running' && <section className="panel reference-progress-card">
      <div className="section-heading"><span>{String(progress.stageIndex).padStart(2, '0')}</span><div><h2>{progress.message}</h2><p>阶段 {progress.stageIndex} / {progress.stageCount}</p></div></div>
      <div className="reference-progress-track"><i style={{ width: `${progress.progress}%` }} /></div>
      <div className="reference-progress-meta">
        <strong>{progress.progress}%</strong>
        {progress.totalAssetCount != null && <span>已完成 {progress.analyzedAssetCount || 0} / {progress.totalAssetCount} 个素材</span>}
        <span>已运行 {formatDurationHuman(elapsedMs)}</span>
      </div>
      <div className="button-row"><button className="button ghost" onClick={onBack}>返回项目</button><button className="button danger" onClick={() => void cancelActive()}>取消分析</button></div>
    </section>}

    <div className="visual-translation-grid">
      <section className="panel visual-translation-form">
        <div className="section-heading"><span>01</span><div><h2>准备视觉重构任务</h2><p>上传参考方案，并选择要应用到的当前项目</p></div></div>

        {!useIntermediateResults && <>
          <div className="reference-uploader-heading"><strong>参考视觉方案</strong><small>拖入图片或文件夹，或点击选择。建议上传 4–8 张能够代表整套视觉系统的关键图片。</small></div>
          <VisualAssetUploader
            role="reference"
            items={referenceAssets.map((item) => ({
              id: item.fingerprint,
              name: item.name,
              extension: item.extension,
              bytes: item.sizeBytes,
              thumbnailDataUrl: item.thumbnailDataUrl
            }))}
            busy={busy}
            onAddPaths={prepareReferenceAssets}
            onChooseFiles={() => window.masterpiece.referenceTranslation.chooseReferenceAssets()}
            onChooseFolder={() => window.masterpiece.projects.chooseFolder()}
            onRemove={(fingerprint) => setReferenceAssets((current) => current.filter((item) => item.fingerprint !== fingerprint))}
            onClear={() => { setReferenceAssets([]); setNotice(''); }}
          />

          <div className="reference-project-field">
            <strong>选择当前项目</strong>
            {projects.length ? <>
              <select value={currentProjectId} disabled={busy} onChange={(event) => setCurrentProjectId(event.target.value)}>
                {projects.map((project) => <option key={project.id} value={project.id}>
                  {project.projectName} · {project.status === 'completed' ? '已有品牌分析' : '将自动完成分析'}
                </option>)}
              </select>
              <small>系统会读取项目事实、已有品牌分析与 Locked Assets。</small>
              {selectedCurrentProject && <div className="reference-project-summary">
                <div><small>品牌</small><strong>{selectedCurrentProject.brandName || selectedCurrentProject.detectedBrandName}</strong></div>
                <div><small>行业</small><strong>{selectedCurrentProject.industry || selectedCurrentProject.detectedIndustry}</strong></div>
                <div><small>分析状态</small><strong>{selectedCurrentProject.status === 'completed' ? '品牌分析可用' : '将先完成品牌分析'}</strong></div>
                <div><small>Locked Assets</small><strong>{selectedCurrentProject.lockedFacts.length + (selectedCurrentProject.logoLocked ? 1 : 0)} 项</strong></div>
              </div>}
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

        <label>你最希望继承参考方案中的什么？（可选）
          <textarea value={preference} maxLength={500} rows={3} placeholder="例如：低饱和配色、留白构图、材质感、摄影光线和包装展示方式。" onChange={(event) => setPreference(event.target.value)} />
        </label>

        {!useIntermediateResults && <label className="reference-developer-toggle">
          <input
            type="checkbox"
            checked={confirmLowConfidenceSelections}
            onChange={(event) => setConfirmLowConfidenceSelections(event.target.checked)}
          />
          我已查看上次运行目录中的素材筛选结果，并确认继续使用低置信度项
        </label>}

        {showDebugInputs && <details className="reference-advanced" onToggle={(event) => {
          if (!(event.currentTarget as HTMLDetailsElement).open) setUseIntermediateResults(false);
        }}>
          <summary>高级设置</summary>
          <label className="reference-developer-toggle">
            <input type="checkbox" checked={useIntermediateResults} onChange={(event) => setUseIntermediateResults(event.target.checked)} />
            使用已有中间结果
          </label>
          {useIntermediateResults && <div className="reference-developer-inputs">
            <p>开发者模式会跳过前置分析，适用于调试风格重构算法和执行回归测试。</p>
            <div className="reference-input-row">
              <div><strong>reference-visual-analysis.json</strong><small>{visualAnalysisPath ? visualAnalysisPath.split(/[\\/]/).pop() : '直接上传已有参考视觉分析结果'}</small></div>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void chooseFile('visual-analysis')}>{visualAnalysisPath ? '重新选择' : '选择 JSON'}</button>
            </div>
            <div className="reference-input-row">
              <div><strong>project-context.json</strong><small>{projectContextPath ? projectContextPath.split(/[\\/]/).pop() : '直接上传已有项目上下文'}</small></div>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void chooseFile('project-context')}>{projectContextPath ? '重新选择' : '选择 JSON'}</button>
            </div>
          </div>}
        </details>}

        <div className="mode-hint">{useIntermediateResults
          ? '已启用开发者模式：系统将直接使用上传的中间结果，不调用前置视觉分析。'
          : '系统将自动分析参考方案，并在内部生成 reference-visual-analysis.json 与 project-context.json。普通用户无需准备 JSON。'}</div>
        <button className="button primary full" disabled={busy || (useIntermediateResults
          ? !visualAnalysisPath || !projectContextPath
          : !referenceAssets.length || !(currentProjectId || currentProjectSourcePaths.length))}
          onClick={() => void start()}>{busy ? '正在生成视觉重构文档…' : '开始生成视觉重构文档'}</button>
      </section>

      <aside className="panel visual-translation-history">
        <div className="section-heading"><span>02</span><div><h2>重构记录</h2><p>中间结果、质量校验与 GPT 执行文档均保存在独立 Job 目录</p></div></div>
        {runs.length ? <div className="visual-run-list">{runs.map((run) => (
          <div key={run.id} className={`visual-run-card ${run.status}`}>
            <div><strong>{run.visualAnalysisFilename}</strong><span>{run.status === 'completed' ? '已完成' : run.status === 'running' ? '运行中' : run.status === 'cancelled' ? '已取消' : '失败'}</span></div>
            <small>{run.projectContextFilename} · {run.reportFilename ? '执行文档已生成' : '处理中'}</small>
            <small>{new Date(run.createdAt).toLocaleString('zh-CN')}{run.durationMs != null ? ` · ${formatDurationHuman(run.durationMs)}` : ''}</small>
            {run.error ? <div className="reference-error-summary">
              <strong>失败步骤：{run.error.stage}</strong>
              <em>{run.error.message}</em>
              <small>{run.error.recoverable ? '前置分析与中间结果已保留，可直接重新编译报告。' : '核心分析未完成，需要重新运行分析。'}</small>
            </div> : run.lastError && <em>{run.lastError}</em>}
            <div className="button-row">
              {run.status === 'completed' && <button className="button secondary" onClick={() => void openRun(run)}>查看结果</button>}
              {run.error?.recoverable && <button className="button secondary" onClick={() => void retryReport(run)}>重新编译报告</button>}
              {run.status !== 'running' && <button className="button ghost" onClick={() => void window.masterpiece.referenceTranslation.openFolder(run.id)}>查看运行日志</button>}
              {run.status === 'running' && <button className="button danger" onClick={() => void window.masterpiece.referenceTranslation.cancel(run.id)}>取消</button>}
              <button className="button ghost" disabled={run.status === 'running'} onClick={() => void removeRun(run)}>删除</button>
            </div>
          </div>
        ))}</div> : <div className="visual-document-empty">还没有参考风格重构记录。</div>}
      </aside>
    </div>
  </div>;
}
