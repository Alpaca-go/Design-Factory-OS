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

const brandDnaProtocolStages: Array<[string, string]> = [
  ['atomic-evidence', '原子证据'],
  ['normalized-facts', '事实归一化'],
  ['strategic-model', '战略模型'],
  ['strategic-critic', '战略诊断'],
  ['dna-synthesis', '品牌 DNA'],
  ['creative-thesis-decision', '创意命题'],
  ['visual-causal-translation', '视觉转译'],
  ['gpt-image-task-compiler', '图片任务编译'],
  ['quality-auditor', '质量审计'],
  ['report-compiler', '报告编译']
];

interface Props {
  project: ProjectRecord;
  progress: AnalysisProgress | null;
  error?: string;
  onCancel(): Promise<boolean>;
  onResume(): void;
  onRetryCurrent(): void;
  onRestart(): void;
  onBack(): void;
}

export function AnalysisView({
  project,
  progress,
  error,
  onCancel,
  onResume,
  onRetryCurrent,
  onRestart,
  onBack
}: Props) {
  const mountedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isBrandDna = project.mode === 'brand-dna';
  const terminal = progress?.stage === 'failed' || progress?.stage === 'cancelled';
  const visualCurrent = visualStages.findIndex(([stage]) => stage === progress?.stage);
  const failedVisualStage = visualStages.find(([stage]) => stage === progress?.failedAtStage)?.[1];
  const started = progress?.startedAt ? Date.parse(progress.startedAt) : mountedAt.current;
  const elapsed = terminal ? (progress?.elapsedMs ?? now - started) : now - started;
  const currentStageElapsed = progress?.currentStageStartedAt
    ? Math.max(0, now - Date.parse(progress.currentStageStartedAt))
    : 0;
  const completedProtocolStages = new Set(progress?.completedStageIds || []);

  async function cancel() {
    if (!window.confirm('确定要取消当前分析吗？\n已通过校验的阶段会保留，下次可以从合法断点继续。')) return;
    setCancelling(true);
    try { await onCancel(); } finally { setCancelling(false); }
  }

  return <div className={`analysis-screen ${terminal ? 'terminal' : ''}`}>
    <div className={`analysis-orbit ${terminal ? progress?.stage : ''}`}>
      <div className="indeterminate-dots"><i /><i /><i /></div>
    </div>
    <p className="eyebrow">{isBrandDna ? 'BRAND DNA ANALYSIS' : 'FUSION ENHANCED'}</p>
    <h1>{progress?.message || '正在准备分析'}</h1>
    <p className="analysis-subtitle">{terminal
      ? `${failedVisualStage ? `结束阶段：${failedVisualStage} · ` : ''}${error || project.lastError || ''}`
      : isBrandDna
        ? '只发送文档文本；事实、推断、建议、冲突与缺失信息会分别标记。'
        : '隐藏推理过程不会显示；这里只呈现可理解的 Pipeline 阶段。'}</p>
    <div className="run-metrics">
      <div><small>任务状态</small><strong>{progress?.stage === 'failed' ? '分析失败' : progress?.stage === 'cancelled' ? '已取消' : '运行中'}</strong></div>
      <div><small>当前模型</small><strong>{progress?.model || project.model || '正在读取'}</strong></div>
      <div><small>{isBrandDna ? '已读取文档' : '已读取素材'}</small><strong>{progress?.assetCount ?? project.assetCount} 个</strong></div>
      <div><small>已运行时间</small><strong>{formatDuration(Math.max(0, elapsed))}</strong></div>
      <div><small>{isBrandDna ? '阶段进度' : '缓存状态'}</small><strong>{isBrandDna
        ? `${progress?.completedStageCount || 0} / ${progress?.totalStageCount || 10}`
        : progress?.cacheStatus === 'hit' ? '已命中' : progress?.cacheStatus === 'forced' ? '强制新推理' : progress?.cacheStatus === 'miss' ? '未命中' : '检查中'}</strong></div>
    </div>
    {isBrandDna && progress?.stageId && <p className="analysis-stage-time">本阶段已运行：{formatDuration(currentStageElapsed)}</p>}
    <div className="stage-list">{isBrandDna
      ? brandDnaProtocolStages.map(([stageId, label]) => {
          const done = completedProtocolStages.has(stageId) || progress?.stage === 'completed';
          const active = progress?.stageId === stageId && !done && !terminal;
          const failed = terminal && progress?.failedAtStageId === stageId;
          return <div key={stageId} className={`stage-row ${done ? 'done' : active ? 'active' : failed ? 'failed' : ''}`}>
            <span>{done ? '✓' : failed ? '!' : active ? '●' : '○'}</span>
            <strong>{label}{progress?.resumed && progress.stageId === stageId ? '（已复用）' : ''}</strong>
          </div>;
        })
      : visualStages.map(([stage, label], index) => (
        <div key={stage} className={`stage-row ${index < visualCurrent || progress?.stage === 'completed' ? 'done' : index === visualCurrent ? 'active' : ''}`}>
          <span>{index < visualCurrent || progress?.stage === 'completed' ? '✓' : index === visualCurrent ? '●' : '○'}</span>
          <strong>{label}</strong>
        </div>
      ))}</div>
    {terminal
      ? <div className="button-row">
        {isBrandDna && progress?.resumeAvailable && <>
          <button className="button primary" onClick={onResume}>从失败阶段继续</button>
          <button className="button secondary" onClick={onRetryCurrent}>重新运行当前阶段</button>
        </>}
        <button className={isBrandDna && progress?.resumeAvailable ? 'button danger' : 'button primary'} onClick={onRestart}>全部重新分析</button>
        <button className="button ghost" onClick={onBack}>返回{isBrandDna ? '文档' : '素材'}页</button>
      </div>
      : <button className="button ghost" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? '正在取消…' : '取消分析'}</button>}
  </div>;
}
