import { useEffect, useRef, useState } from 'react';
import type { AnalysisProgress, ProjectRecord } from '../../../shared/types';
import { formatDuration } from '../utils';

const visualStages: Array<[AnalysisProgress['stage'], string]> = [
  ['preparing-assets', '素材准备'],
  ['extracting-project-facts', '项目信息识别'],
  ['building-contact-sheet', '视觉总览生成'],
  ['building-prompt', '分析任务构建'],
  ['reasoning', '深度创意导演分析'],
  ['generating-report', '报告生成'],
  ['validating-output', '输出校验'],
  ['completed', '分析完成']
];

const brandDnaStages: Array<[AnalysisProgress['stage'], string]> = [
  ['preparing-documents', '文档准备'],
  ['parsing-documents', '文档解析'],
  ['normalizing-content', '内容标准化'],
  ['extracting-project-facts', '项目事实提取'],
  ['building-brand-dna', '品牌 DNA 建立'],
  ['diagnosing-strategy', '策略诊断'],
  ['translating-creative-direction', '创意方向转译'],
  ['planning-generation-tasks', '生图任务规划'],
  ['validating-output', '事实与结构校验'],
  ['generating-report', '报告生成'],
  ['completed', '分析完成']
];

interface Props {
  project: ProjectRecord;
  progress: AnalysisProgress | null;
  error?: string;
  onCancel(): Promise<boolean>;
  onRetry(): void;
  onBack(): void;
}

export function AnalysisView({ project, progress, error, onCancel, onRetry, onBack }: Props) {
  const mountedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isBrandDna = project.mode === 'brand-dna';
  const stages = isBrandDna ? brandDnaStages : visualStages;
  const terminal = progress?.stage === 'failed' || progress?.stage === 'cancelled';
  const current = stages.findIndex(([stage]) => stage === progress?.stage);
  const failedStage = stages.find(([stage]) => stage === progress?.failedAtStage)?.[1];
  const started = progress?.startedAt ? Date.parse(progress.startedAt) : mountedAt.current;
  const elapsed = terminal ? (progress?.elapsedMs ?? now - started) : now - started;

  async function cancel() {
    if (!window.confirm('确定要取消当前分析吗？\n已经产生的临时文件将被清理。')) return;
    setCancelling(true);
    try { await onCancel(); } finally { setCancelling(false); }
  }

  return <div className={`analysis-screen ${terminal ? 'terminal' : ''}`}>
    <div className={`analysis-orbit ${terminal ? progress?.stage : ''}`}>
      <div className="indeterminate-dots"><i /><i /><i /></div>
    </div>
    <p className="eyebrow">{isBrandDna ? 'BRAND DNA ANALYSIS' : 'FUSION ENHANCED'}</p>
    <h1>{progress?.message || '正在准备分析'}</h1>
    <p className="analysis-subtitle">{terminal ? `${failedStage ? `结束阶段：${failedStage} · ` : ''}${error || project.lastError || ''}` : (isBrandDna
      ? '仅发送文档文本；事实、推断、建议、冲突与缺失信息会分别标记。'
      : '隐藏推理过程不会显示；这里只呈现可理解的 Pipeline 阶段。')}</p>
    <div className="run-metrics">
      <div><small>任务状态</small><strong>{progress?.stage === 'failed' ? '分析失败' : progress?.stage === 'cancelled' ? '已取消' : '运行中'}</strong></div>
      <div><small>当前模型</small><strong>{progress?.model || project.model || '正在读取'}</strong></div>
      <div><small>{isBrandDna ? '已读取文档' : '已读取素材'}</small><strong>{progress?.assetCount ?? project.assetCount} 个</strong></div>
      <div><small>已运行时间</small><strong>{formatDuration(Math.max(0, elapsed))}</strong></div>
      <div><small>{isBrandDna ? '分析约束' : '缓存状态'}</small><strong>{isBrandDna ? '证据优先' : progress?.cacheStatus === 'hit' ? '已命中' : progress?.cacheStatus === 'forced' ? '强制新推理' : progress?.cacheStatus === 'miss' ? '未命中' : '检查中'}</strong></div>
    </div>
    <div className="stage-list">{stages.map(([stage, label], index) => <div key={stage} className={`stage-row ${index < current || progress?.stage === 'completed' ? 'done' : index === current ? 'active' : ''}`}><span>{index < current || progress?.stage === 'completed' ? '✓' : index === current ? '●' : '○'}</span><strong>{label}</strong></div>)}</div>
    {terminal
      ? <div className="button-row"><button className="button primary" onClick={onRetry}>重新分析</button><button className="button ghost" onClick={onBack}>返回{isBrandDna ? '文档' : '素材'}页</button></div>
      : <button className="button ghost" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? '正在取消…' : '取消分析'}</button>}
  </div>;
}
