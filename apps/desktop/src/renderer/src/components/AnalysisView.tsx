import type { AnalysisProgress, ProjectRecord } from '../../../shared/types';
import { formatDuration } from '../utils';

const stages: Array<[AnalysisProgress['stage'], string]> = [
  ['preparing-assets', '素材准备'], ['locking-facts', '品牌事实锁定'], ['building-prompt', '分析任务构建'],
  ['reasoning', '深度创意导演分析'], ['generating-report', '报告生成'], ['validating-output', '输出校验'], ['completed', '分析完成']
];

interface Props { project: ProjectRecord; progress: AnalysisProgress | null; onCancel(): void; }

export function AnalysisView({ project, progress, onCancel }: Props) {
  const current = stages.findIndex(([stage]) => stage === progress?.stage);
  return <div className="analysis-screen">
    <div className="analysis-orbit"><div className="orbit-ring" /><span>{progress?.progress ?? 0}<small>%</small></span></div>
    <p className="eyebrow">FUSION ENHANCED</p><h1>{progress?.message || '正在准备分析'}</h1><p className="analysis-subtitle">隐藏推理过程不会显示；这里只呈现可理解的 Pipeline 阶段。</p>
    <div className="run-metrics"><div><small>项目</small><strong>{project.projectName}</strong></div><div><small>当前模型</small><strong>{progress?.model || project.model}</strong></div><div><small>素材</small><strong>{progress?.assetCount ?? project.assetCount} 个</strong></div><div><small>已用时间</small><strong>{formatDuration(progress?.elapsedMs ?? 0)}</strong></div><div><small>缓存状态</small><strong>{progress?.cacheStatus === 'hit' ? '已命中' : progress?.cacheStatus === 'forced' ? '强制新推理' : '未命中'}</strong></div></div>
    <div className="stage-list">{stages.map(([stage, label], index) => <div key={stage} className={`stage-row ${index < current ? 'done' : index === current ? 'active' : ''}`}><span>{index < current ? '✓' : index === current ? '●' : '○'}</span><strong>{label}</strong></div>)}</div>
    <button className="button ghost" onClick={onCancel}>取消分析</button>
  </div>;
}
