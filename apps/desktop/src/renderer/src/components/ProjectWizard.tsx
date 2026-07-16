import { useMemo, useState } from 'react';
import type { CreateProjectInput, ProjectRecord, PublicSettings } from '../../../shared/types';
import { cleanError, filename } from '../utils';

interface Props {
  settings: PublicSettings;
  onCreated(project: ProjectRecord): void;
  onCancel(): void;
}

type FileGroup = 'assets' | 'logo' | 'brief';

export function ProjectWizard({ settings, onCreated, onCancel }: Props) {
  const [form, setForm] = useState<CreateProjectInput>({ projectName: '', brandName: '', industry: '', description: '', logoLocked: true, lockedFacts: [], outputLanguage: 'zh-CN' });
  const [factsText, setFactsText] = useState('');
  const [files, setFiles] = useState<Record<FileGroup, string[]>>({ assets: [], logo: [], brief: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = useMemo(() => Boolean(form.projectName.trim() && form.brandName.trim() && form.industry.trim() && files.assets.length), [form, files]);

  async function choose(kind: FileGroup) {
    const selected = await window.masterpiece.projects.chooseFiles(kind);
    if (selected.length) setFiles((current) => ({ ...current, [kind]: [...current[kind], ...selected] }));
  }

  function addDropped(fileList: FileList | null) {
    if (!fileList) return;
    const paths = Array.from(fileList).map((file) => window.masterpiece.files.getPathForFile(file)).filter(Boolean);
    setFiles((current) => ({ ...current, assets: [...current.assets, ...paths] }));
  }

  async function create() {
    if (!ready) return;
    setBusy(true); setError('');
    try {
      const project = await window.masterpiece.projects.create({
        ...form,
        lockedFacts: factsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
      });
      await window.masterpiece.projects.importFiles(project.id, files.assets, 'assets');
      if (files.logo.length) await window.masterpiece.projects.importFiles(project.id, files.logo, 'logo');
      if (files.brief.length) await window.masterpiece.projects.importFiles(project.id, files.brief, 'brief');
      onCreated(await window.masterpiece.projects.get(project.id));
    } catch (reason) { setError(cleanError(reason)); }
    finally { setBusy(false); }
  }

  return <div className="page wizard-page">
    <header className="page-header"><div><p className="eyebrow">NEW ANALYSIS</p><h1>创建视觉分析项目</h1><p>五步信息在本地一次确认；行业属性不会交给模型重新猜测。</p></div><button className="button ghost" onClick={onCancel}>取消</button></header>
    <div className="step-rail">{['项目信息', '素材导入', '锁定事实', '模型设置', '确认运行'].map((step, index) => <div className="step-item" key={step}><span>{index + 1}</span><small>{step}</small></div>)}</div>
    <div className="wizard-grid">
      <section className="panel form-panel wide">
        <div className="section-heading"><span>01</span><div><h2>品牌与行业事实</h2><p>这些内容将作为 Prompt 的不可覆盖事实</p></div></div>
        <div className="field-grid"><label>项目名称<input value={form.projectName} onChange={(event) => setForm({ ...form, projectName: event.target.value })} placeholder="例如：九州美学" /></label><label>品牌名称<input value={form.brandName} onChange={(event) => setForm({ ...form, brandName: event.target.value })} /></label></div>
        <label>行业属性 <em>必填</em><input value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} placeholder="例如：医学美学 / 医疗美容" /></label>
        <label>项目说明<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="本次希望解决的视觉问题、业务阶段与核心目标" /></label>

        <div className="section-heading compact"><span>02</span><div><h2>导入视觉方案</h2><p>ZIP、JPG、JPEG、PNG、WEBP 或 PDF</p></div></div>
        <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addDropped(event.dataTransfer.files); }}>
          <strong>将视觉方案拖到这里</strong><p>或选择一个 ZIP / 多张图片 / PDF</p><button className="button secondary" type="button" onClick={() => choose('assets')}>选择素材</button>
        </div>
        {files.assets.length > 0 && <div className="file-chips">{files.assets.map((file, index) => <span key={`${file}-${index}`}>{filename(file)}</span>)}</div>}
      </section>

      <aside className="panel side-panel wizard-side">
        <div className="section-heading"><span>03</span><div><h2>锁定边界</h2><p>Logo 默认锁定</p></div></div>
        <label className="toggle"><input type="checkbox" checked={form.logoLocked} onChange={(event) => setForm({ ...form, logoLocked: event.target.checked })} /><span>原始 Logo Locked，不允许重绘或替换</span></label>
        <button className="button text-button" onClick={() => choose('logo')}>+ 上传独立 Logo</button>
        {files.logo.map((file, index) => <div className="mini-file" key={`${file}-${index}`}>{filename(file)}</div>)}
        <label>其他锁定事实<textarea value={factsText} onChange={(event) => setFactsText(event.target.value)} placeholder={'每行一项，例如：\n包装结构必须保留\n产品类别不得修改'} /></label>
        <button className="button text-button" onClick={() => choose('brief')}>+ 上传项目说明文件</button>
        <div className="model-summary"><span>04</span><div><small>当前模型</small><strong>{settings.model || '尚未配置'}</strong><small>{settings.provider} · {settings.connectionStatus === 'connected' ? '连接正常' : '连接未确认'}</small></div></div>
        <label>输出语言<select value={form.outputLanguage} onChange={(event) => setForm({ ...form, outputLanguage: event.target.value as CreateProjectInput['outputLanguage'] })}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
        <div className="profile-card"><small>分析模式</small><strong>融合增强 Fusion Enhanced</strong><p>单模型、单次调用；同时强化事实判断与材质工艺细节。</p></div>
        {error && <div className="notice error">{error}</div>}
        <button className="button primary full" disabled={!ready || busy || !settings.hasApiKey} onClick={create}>{busy ? '正在创建项目…' : '创建并检查素材'}</button>
        {!settings.hasApiKey && <p className="inline-warning">请先在设置中保存 API Key。</p>}
      </aside>
    </div>
  </div>;
}
