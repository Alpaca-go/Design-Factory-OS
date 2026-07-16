import { useEffect, useState } from 'react';
import type {
  AnalysisRunUsageSummary,
  ModelUsageRecord,
  PublicSettings
} from '../../../shared/types';
import { cleanError, formatCost, formatDurationHuman, formatTokens } from '../utils';

interface Props {
  analysisRunId: string | null;
  settings: PublicSettings;
}

const STAGE_LABELS: Record<string, string> = {
  'visual.deep-reasoning': '视觉深度推理',
  'brand-dna.evidence-extraction': '证据提取',
  'brand-dna.fact-normalization': '事实标准化',
  'brand-dna.strategy-reconstruction': '战略重建',
  'brand-dna.strategic-critique': '战略批判',
  'brand-dna.dna-synthesis': 'DNA 合成',
  'brand-dna.creative-thesis': '创意命题',
  'brand-dna.visual-translation': '视觉转译',
  'brand-dna.image-spec-compilation': '生图规格编译',
  'brand-dna.quality-audit': '质量审计',
  'brand-dna.repair': '结构 / 质量修复'
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] || stage;
}

function usageValue(record: ModelUsageRecord, key: 'inputTokens' | 'outputTokens' | 'totalTokens'): string {
  return formatTokens(record[key]);
}

function summaryCost(summary: AnalysisRunUsageSummary): string {
  if (!summary.currency) return '未配置价格';
  const formatted = formatCost(summary.estimatedCostMicros, summary.currency);
  return summary.unpricedCallCount > 0 ? `${formatted}（部分调用未定价）` : formatted;
}

export function RunUsageSummary({ analysisRunId, settings }: Props) {
  const [summary, setSummary] = useState<AnalysisRunUsageSummary | null>(null);
  const [details, setDetails] = useState<ModelUsageRecord[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSummary(null);
    setDetails([]);
    setExpanded(false);
    setError('');
    if (!analysisRunId || !settings.usageTrackingEnabled || !settings.showUsageSummary) return;
    void window.masterpiece.usage.getRunSummary(analysisRunId)
      .then(setSummary)
      .catch((reason) => setError(cleanError(reason)));
  }, [analysisRunId, settings.usageTrackingEnabled, settings.showUsageSummary]);

  async function toggleDetails() {
    const next = !expanded;
    setExpanded(next);
    if (!next || details.length || !analysisRunId) return;
    try {
      setDetails(await window.masterpiece.usage.getStageDetails(analysisRunId));
    } catch (reason) {
      setError(cleanError(reason));
    }
  }

  if (!analysisRunId || !settings.showUsageSummary) return null;
  if (!settings.usageTrackingEnabled) {
    return <section className="usage-run-card"><strong>本次未记录用量</strong><p className="usage-run-note">本地 Token 记录已在设置中关闭，模型分析不受影响。</p></section>;
  }
  if (error) return <div className="notice error">{error}</div>;
  if (!summary) return <section className="usage-run-card"><span>正在读取模型用量…</span></section>;

  return <section className="usage-run-card">
    <div className="usage-run-heading">
      <div>
        <small>MODEL USAGE</small>
        <h2>本次模型调用</h2>
      </div>
      <button className="button ghost" onClick={() => void toggleDetails()}>
        {expanded ? '收起阶段明细' : '查看阶段明细'}
      </button>
    </div>
    <div className="usage-run-metrics">
      <div><small>调用次数</small><strong>{summary.modelCallCount}（成功 {summary.successfulCallCount} / 失败 {summary.failedCallCount}）</strong></div>
      <div><small>输入 Token</small><strong>{summary.usageCompleteness === 'missing' ? 'Token 用量不可用' : formatTokens(summary.totalInputTokens)}</strong></div>
      <div><small>输出 Token</small><strong>{summary.usageCompleteness === 'missing' ? 'Token 用量不可用' : formatTokens(summary.totalOutputTokens)}</strong></div>
      <div><small>总 Token</small><strong>{summary.usageCompleteness === 'missing' ? 'Token 用量不可用' : formatTokens(summary.totalTokens)}</strong></div>
      <div><small>缓存输入</small><strong>{summary.usageCompleteness === 'missing' ? 'Token 用量不可用' : formatTokens(summary.totalCachedInputTokens)}</strong></div>
      <div><small>思考 Token</small><strong>{summary.usageCompleteness === 'missing' ? 'Token 用量不可用' : formatTokens(summary.totalReasoningTokens)}</strong></div>
      <div><small>标准价估算</small><strong>{settings.showCostEstimate ? summaryCost(summary) : '已隐藏'}</strong></div>
    </div>
    {summary.retryCallCount > 0 && <p className="usage-run-note">
      本次包含 {summary.retryCallCount} 次重试 / 修复调用，已计入总用量。
    </p>}
    {summary.usageCompleteness !== 'complete' && <p className="usage-run-note warning">
      Provider 未返回全部 Usage 字段，缺失项保持为空，不会用猜测值补齐。
    </p>}
    {expanded && <div className="usage-detail-table-wrap">
      <table className="usage-table">
        <thead><tr><th>阶段</th><th>模型</th><th>状态</th><th>输入</th><th>输出</th><th>缓存</th><th>总量</th><th>耗时</th><th>费用</th></tr></thead>
        <tbody>
          {details.map((record) => <tr key={record.id}>
            <td>{stageLabel(record.pipelineStage)}{record.attemptNumber > 1 ? ` · 第 ${record.attemptNumber} 次` : ''}</td>
            <td>{record.modelId}</td>
            <td><span className={`usage-status ${record.status}`}>{record.status}</span></td>
            <td>{usageValue(record, 'inputTokens')}</td>
            <td>{usageValue(record, 'outputTokens')}</td>
            <td>{formatTokens(record.cachedInputTokens)}</td>
            <td>{usageValue(record, 'totalTokens')}</td>
            <td>{formatDurationHuman(record.durationMs)}</td>
            <td>{settings.showCostEstimate ? formatCost(record.estimatedCostMicros, record.currency) : '已隐藏'}</td>
          </tr>)}
          {!details.length && <tr><td colSpan={9}>本次运行没有模型调用记录。</td></tr>}
        </tbody>
      </table>
    </div>}
  </section>;
}
