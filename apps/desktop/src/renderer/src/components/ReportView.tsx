import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useState } from 'react';
import type { ProjectRecord } from '../../../shared/types';
import { cleanError, formatDurationHuman } from '../utils';

interface Props { project: ProjectRecord; onBack(): void; onRerun(force: boolean): void; }

export function ReportView({ project, onBack, onRerun }: Props) {
  const [markdown, setMarkdown] = useState('');
  const [html, setHtml] = useState('');
  const [filename, setFilename] = useState(project.lastReportFilename || '');
  const [notice, setNotice] = useState('');
  useEffect(() => { void window.masterpiece.report.read(project.id).then(setMarkdown).catch((error) => setNotice(cleanError(error))); }, [project.id]);
  useEffect(() => { void Promise.resolve(marked.parse(markdown)).then((value) => setHtml(DOMPurify.sanitize(value))); }, [markdown]);
  async function copy() { await navigator.clipboard.writeText(markdown); setNotice('报告内容已复制。'); }
  async function exportReport() {
    try {
      if (filename !== project.lastReportFilename) {
        const updated = await window.masterpiece.report.rename(project.id, filename);
        setFilename(updated.lastReportFilename || filename);
      }
      const saved = await window.masterpiece.report.export(project.id);
      if (saved) setNotice(`已导出：${saved}`);
    } catch (error) { setNotice(cleanError(error)); }
  }
  async function renameReport() {
    try {
      const updated = await window.masterpiece.report.rename(project.id, filename);
      setFilename(updated.lastReportFilename || filename);
      setNotice('报告文件名已更新。');
    } catch (error) { setNotice(cleanError(error)); }
  }
  return <div className="page report-page">
    <header className="page-header"><div><p className="eyebrow">ANALYSIS COMPLETE</p><h1>{project.projectName}</h1><p>{filename}</p></div><button className="button ghost" onClick={onBack}>返回项目</button></header>
    <div className="result-summary"><div><small>模型</small><strong>{project.model}</strong></div><div><small>耗时</small><strong>{formatDurationHuman(project.lastDurationMs)}</strong></div><div><small>素材</small><strong>{project.assetCount} 个</strong></div><div><small>模式</small><strong>融合增强</strong></div></div>
    <div className="report-filename-editor"><label>导出文件名<input value={filename} onChange={(event) => setFilename(event.target.value)} /></label><button className="button secondary" onClick={() => void renameReport()}>更新文件名</button></div>
    <div className="result-actions"><button className="button primary" onClick={() => void exportReport()}>导出报告</button><button className="button secondary" onClick={() => void copy()}>复制内容</button><button className="button secondary" onClick={() => void window.masterpiece.report.openFolder(project.id)}>打开输出文件夹</button><button className="button ghost" onClick={() => onRerun(true)}>强制重新分析</button><button className="button ghost" onClick={() => onRerun(false)}>使用缓存</button></div>
    {notice && <div className={`notice ${/失败|不能为空|存在/.test(notice) ? 'error' : 'ok'}`}>{notice}</div>}
    <article className="markdown-preview" dangerouslySetInnerHTML={{ __html: html }} />
  </div>;
}
