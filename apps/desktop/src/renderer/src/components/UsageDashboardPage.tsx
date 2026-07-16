import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MonthlyUsageSummary,
  PricingRule,
  ProjectRecord,
  PublicSettings,
  SavePricingRuleInput,
  UsageRecordPage,
  UsageRecordQuery
} from '../../../shared/types';
import {
  cleanError,
  currencyToMicros,
  formatCost,
  formatDurationHuman,
  formatTokens,
  microsToCurrency
} from '../utils';

interface Props {
  onClose(): void;
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  provider: string;
  modelId: string;
  pipelineStage: string;
  projectId: string;
  analysisMode: string;
  apiProfileId: string;
  status: string;
}

interface PricingEditor {
  id?: string;
  provider: string;
  modelPattern: string;
  region: string;
  protocol: string;
  currency: 'CNY' | 'USD';
  inputPrice: string;
  outputPrice: string;
  cachedInputMultiplier: string;
  batchMultiplier: string;
  minInputTokensExclusive: string;
  maxInputTokensInclusive: string;
  effectiveFrom: string;
  effectiveTo: string;
  sourceName: string;
  notes: string;
  isEnabled: boolean;
}

const EMPTY_PAGE: UsageRecordPage = { items: [], page: 1, pageSize: 50, total: 0 };
const EMPTY_FILTERS: Filters = {
  dateFrom: '',
  dateTo: '',
  provider: '',
  modelId: '',
  pipelineStage: '',
  projectId: '',
  analysisMode: '',
  apiProfileId: '',
  status: ''
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function localDateStart(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function localDateEnd(value: string): string | undefined {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;
}

function monthlyCost(summary: MonthlyUsageSummary): string {
  if (!summary.currency) return '未配置价格';
  const formatted = formatCost(summary.estimatedCostMicros, summary.currency);
  return summary.unpricedCallCount > 0 ? `${formatted}（部分）` : formatted;
}

function emptyPricingEditor(): PricingEditor {
  return {
    provider: '',
    modelPattern: '',
    region: '',
    protocol: 'openai-chat-completions',
    currency: 'CNY',
    inputPrice: '',
    outputPrice: '',
    cachedInputMultiplier: '1',
    batchMultiplier: '',
    minInputTokensExclusive: '',
    maxInputTokensInclusive: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    sourceName: '',
    notes: '',
    isEnabled: true
  };
}

function editorFromRule(rule: PricingRule): PricingEditor {
  return {
    id: rule.id,
    provider: rule.provider,
    modelPattern: rule.modelPattern,
    region: rule.region || '',
    protocol: rule.protocol || '',
    currency: rule.currency,
    inputPrice: microsToCurrency(rule.inputPricePerMillionMicros),
    outputPrice: microsToCurrency(rule.outputPricePerMillionMicros),
    cachedInputMultiplier: String((rule.cachedInputMultiplierPpm ?? 1_000_000) / 1_000_000),
    batchMultiplier: rule.batchMultiplierPpm === null ? '' : String(rule.batchMultiplierPpm / 1_000_000),
    minInputTokensExclusive: rule.minInputTokensExclusive === null ? '' : String(rule.minInputTokensExclusive),
    maxInputTokensInclusive: rule.maxInputTokensInclusive === null ? '' : String(rule.maxInputTokensInclusive),
    effectiveFrom: rule.effectiveFrom.slice(0, 10),
    effectiveTo: rule.effectiveTo?.slice(0, 10) || '',
    sourceName: rule.sourceName || '',
    notes: rule.notes || '',
    isEnabled: rule.isEnabled
  };
}

export function UsageDashboardPage({ onClose }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [pageNumber, setPageNumber] = useState(1);
  const [records, setRecords] = useState<UsageRecordPage>(EMPTY_PAGE);
  const [month, setMonth] = useState(currentMonth());
  const [monthly, setMonthly] = useState<MonthlyUsageSummary | null>(null);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [pricingEditor, setPricingEditor] = useState<PricingEditor | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const query = useMemo<UsageRecordQuery>(() => ({
    page: pageNumber,
    pageSize: 50,
    dateFrom: localDateStart(filters.dateFrom),
    dateTo: localDateEnd(filters.dateTo),
    provider: filters.provider || undefined,
    modelId: filters.modelId || undefined,
    pipelineStage: filters.pipelineStage || undefined,
    projectId: filters.projectId || undefined,
    analysisMode: filters.analysisMode || undefined,
    apiProfileId: filters.apiProfileId || undefined,
    status: filters.status ? filters.status as UsageRecordQuery['status'] : undefined
  }), [filters, pageNumber]);

  const loadRecords = useCallback(async () => {
    setRecords(await window.masterpiece.usage.listRecords(query));
  }, [query]);

  const loadSummary = useCallback(async () => {
    setMonthly(await window.masterpiece.usage.getMonthSummary(month));
  }, [month]);

  const loadPricing = useCallback(async () => {
    setPricingRules(await window.masterpiece.usage.listPricingRules());
  }, []);

  useEffect(() => {
    void loadRecords().catch((error) => setNotice({ tone: 'error', text: cleanError(error) }));
  }, [loadRecords]);

  useEffect(() => {
    void loadSummary().catch((error) => setNotice({ tone: 'error', text: cleanError(error) }));
  }, [loadSummary]);

  useEffect(() => {
    void loadPricing().catch((error) => setNotice({ tone: 'error', text: cleanError(error) }));
  }, [loadPricing]);

  useEffect(() => {
    void Promise.all([
      window.masterpiece.projects.list(),
      window.masterpiece.settings.get()
    ]).then(([nextProjects, nextSettings]) => {
      setProjects(nextProjects);
      setSettings(nextSettings);
    }).catch((error) => setNotice({ tone: 'error', text: cleanError(error) }));
  }, []);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setPageNumber(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updatePricing<K extends keyof PricingEditor>(key: K, value: PricingEditor[K]) {
    setPricingEditor((current) => current ? { ...current, [key]: value } : current);
  }

  async function exportCsv() {
    setBusy('export');
    setNotice(null);
    try {
      const saved = await window.masterpiece.usage.exportCsv({ ...query, page: undefined, pageSize: undefined });
      if (saved) setNotice({ tone: 'ok', text: `已导出：${saved}` });
    } catch (error) {
      setNotice({ tone: 'error', text: cleanError(error) });
    } finally {
      setBusy('');
    }
  }

  async function clearHistory() {
    if (!window.confirm('确定清空全部模型用量历史吗？价格规则会保留，此操作不可撤销。')) return;
    setBusy('clear');
    setNotice(null);
    try {
      await window.masterpiece.usage.clearHistory();
      await Promise.all([loadRecords(), loadSummary()]);
      setNotice({ tone: 'ok', text: '模型用量历史已清空。' });
    } catch (error) {
      setNotice({ tone: 'error', text: cleanError(error) });
    } finally {
      setBusy('');
    }
  }

  async function savePricingRule() {
    if (!pricingEditor) return;
    setBusy('pricing-save');
    setNotice(null);
    try {
      const multiplier = Number(pricingEditor.cachedInputMultiplier);
      if (!Number.isFinite(multiplier) || multiplier < 0) throw new Error('缓存输入倍率必须是非负数字');
      const batchMultiplier = pricingEditor.batchMultiplier ? Number(pricingEditor.batchMultiplier) : null;
      if (batchMultiplier !== null && (!Number.isFinite(batchMultiplier) || batchMultiplier < 0)) {
        throw new Error('Batch 倍率必须是非负数字');
      }
      const minInputTokens = pricingEditor.minInputTokensExclusive ? Number(pricingEditor.minInputTokensExclusive) : null;
      const maxInputTokens = pricingEditor.maxInputTokensInclusive ? Number(pricingEditor.maxInputTokensInclusive) : null;
      if (minInputTokens !== null && !Number.isSafeInteger(minInputTokens)) throw new Error('最小输入 Token 必须是整数');
      if (maxInputTokens !== null && !Number.isSafeInteger(maxInputTokens)) throw new Error('最大输入 Token 必须是整数');
      const input: SavePricingRuleInput = {
        id: pricingEditor.id,
        provider: pricingEditor.provider,
        modelPattern: pricingEditor.modelPattern,
        region: pricingEditor.region || null,
        protocol: pricingEditor.protocol || null,
        effectiveFrom: `${pricingEditor.effectiveFrom}T00:00:00.000Z`,
        effectiveTo: pricingEditor.effectiveTo ? `${pricingEditor.effectiveTo}T23:59:59.999Z` : null,
        currency: pricingEditor.currency,
        minInputTokensExclusive: minInputTokens,
        maxInputTokensInclusive: maxInputTokens,
        inputPricePerMillionMicros: currencyToMicros(pricingEditor.inputPrice),
        outputPricePerMillionMicros: currencyToMicros(pricingEditor.outputPrice),
        cachedInputMultiplierPpm: Math.round(multiplier * 1_000_000),
        batchMultiplierPpm: batchMultiplier === null ? null : Math.round(batchMultiplier * 1_000_000),
        sourceName: pricingEditor.sourceName || '用户配置',
        sourceUpdatedAt: new Date().toISOString(),
        notes: pricingEditor.notes || null,
        isEnabled: pricingEditor.isEnabled
      };
      setPricingRules(await window.masterpiece.usage.savePricingRule(input));
      setPricingEditor(null);
      setNotice({ tone: 'ok', text: '标准价格规则已保存；新调用会保存匹配时的价格快照。' });
    } catch (error) {
      setNotice({ tone: 'error', text: cleanError(error) });
    } finally {
      setBusy('');
    }
  }

  async function deletePricingRule(rule: PricingRule) {
    if (!window.confirm(`确定删除 ${rule.provider} / ${rule.modelPattern} 的价格规则吗？历史记录中的价格快照不会改变。`)) return;
    try {
      setPricingRules(await window.masterpiece.usage.deletePricingRule(rule.id));
      setNotice({ tone: 'ok', text: '价格规则已删除，历史成本快照保持不变。' });
    } catch (error) {
      setNotice({ tone: 'error', text: cleanError(error) });
    }
  }

  const totalPages = Math.max(1, Math.ceil(records.total / records.pageSize));

  return <div className="page usage-page">
    <header className="page-header">
      <div>
        <p className="eyebrow">MODEL USAGE & COST</p>
        <h1>模型用量</h1>
        <p>查看每次模型调用的 Token、状态、耗时与本地标准价估算。</p>
      </div>
      <div className="button-row">
        <button className="button secondary" onClick={() => void window.masterpiece.usage.openDatabaseFolder()}>打开数据库目录</button>
        <button className="button ghost" onClick={onClose}>返回</button>
      </div>
    </header>

    {notice && <div className={`notice ${notice.tone}`}>{notice.text}</div>}

    <section className="usage-overview">
      <div className="usage-month-picker"><label>统计月份<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></div>
      <div className="usage-overview-grid">
        <div><small>调用次数</small><strong>{monthly?.callCount ?? '—'}</strong></div>
        <div><small>失败调用</small><strong>{monthly?.failedCallCount ?? '—'}</strong></div>
        <div><small>总 Token</small><strong>{monthly ? formatTokens(monthly.totalTokens) : '—'}</strong></div>
        <div><small>缓存 Token</small><strong>{monthly ? formatTokens(monthly.cachedInputTokens) : '—'}</strong></div>
        <div><small>失败调用 Token</small><strong>{monthly ? formatTokens(monthly.failedCallTokens) : '—'}</strong></div>
        <div><small>标准价估算</small><strong>{monthly ? monthlyCost(monthly) : '—'}</strong></div>
      </div>
      {monthly?.models.length ? <div className="usage-model-breakdown">
        {monthly.models.map((model) => <div key={`${model.provider}:${model.modelId}`}>
          <span>{model.provider}</span><strong>{model.modelId}</strong>
          <small>{model.callCount} 次 · {formatTokens(model.totalTokens)} Token · {monthly.totalTokens ? ((model.totalTokens / monthly.totalTokens) * 100).toFixed(1) : '0.0'}% · {formatCost(model.estimatedCostMicros, model.currency)}{model.unpricedCallCount > 0 ? '（部分未定价）' : ''}</small>
        </div>)}
      </div> : null}
    </section>

    <section className="panel usage-records-panel">
      <div className="section-heading">
        <span>01</span>
        <div><h2>调用历史</h2><p>缺失的 Usage 字段显示为不可用，不会根据文本长度推算</p></div>
        <div className="button-row usage-heading-actions">
          <button className="button secondary" disabled={Boolean(busy)} onClick={() => void exportCsv()}>{busy === 'export' ? '导出中…' : '导出 CSV'}</button>
          <button className="button danger" disabled={Boolean(busy)} onClick={() => void clearHistory()}>{busy === 'clear' ? '清空中…' : '清空历史'}</button>
        </div>
      </div>
      <div className="usage-filters">
        <label>开始日期<input type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} /></label>
        <label>结束日期<input type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} /></label>
        <label>项目<select value={filters.projectId} onChange={(event) => updateFilter('projectId', event.target.value)}><option value="">全部项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectName}</option>)}</select></label>
        <label>分析模式<select value={filters.analysisMode} onChange={(event) => updateFilter('analysisMode', event.target.value)}><option value="">全部模式</option><option value="visual-evolution">视觉进化</option><option value="brand-dna">Brand DNA</option></select></label>
        <label>Provider<input value={filters.provider} placeholder="精确匹配" onChange={(event) => updateFilter('provider', event.target.value)} /></label>
        <label>模型<input value={filters.modelId} placeholder="精确匹配 Model ID" onChange={(event) => updateFilter('modelId', event.target.value)} /></label>
        <label>API Profile<select value={filters.apiProfileId} onChange={(event) => updateFilter('apiProfileId', event.target.value)}><option value="">全部配置</option>{settings?.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>
        <label>Pipeline 阶段<input value={filters.pipelineStage} placeholder="例如 brand-dna.repair" onChange={(event) => updateFilter('pipelineStage', event.target.value)} /></label>
        <label>状态<select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">全部</option><option value="success">成功</option><option value="failed">失败 / 异常中断</option><option value="timeout">超时</option><option value="cancelled">已取消</option></select></label>
      </div>
      <div className="usage-detail-table-wrap">
        <table className="usage-table wide">
          <thead><tr><th>时间 / 项目 / 模式</th><th>阶段</th><th>Provider / 模型</th><th>状态</th><th>输入</th><th>输出</th><th>总量</th><th>缓存</th><th>耗时</th><th>费用</th></tr></thead>
          <tbody>
            {records.items.map((record) => <tr key={record.id}>
              <td><strong>{new Date(record.createdAt).toLocaleString('zh-CN')}</strong><small>{record.projectNameSnapshot || '未关联项目'} · {record.analysisMode}</small></td>
              <td>{record.pipelineStage}{record.attemptNumber > 1 ? <small>第 {record.attemptNumber} 次 / 重试</small> : null}</td>
              <td><strong>{record.provider}</strong><small>{record.modelId}</small></td>
              <td><span className={`usage-status ${record.status}`}>{record.status}</span>{record.errorCategory && <small>{record.errorCategory}</small>}</td>
              <td>{formatTokens(record.inputTokens)}</td>
              <td>{formatTokens(record.outputTokens)}</td>
              <td>{formatTokens(record.totalTokens)}</td>
              <td>{formatTokens(record.cachedInputTokens)}</td>
              <td>{formatDurationHuman(record.durationMs)}</td>
              <td>{formatCost(record.estimatedCostMicros, record.currency)}</td>
            </tr>)}
            {!records.items.length && <tr><td colSpan={10}>当前筛选条件下没有模型调用记录。</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="usage-pagination">
        <span>共 {records.total} 条 · 第 {records.page} / {totalPages} 页</span>
        <div className="button-row">
          <button className="button ghost" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => value - 1)}>上一页</button>
          <button className="button ghost" disabled={pageNumber >= totalPages} onClick={() => setPageNumber((value) => value + 1)}>下一页</button>
        </div>
      </div>
    </section>

    <section className="panel usage-pricing-panel">
      <div className="section-heading">
        <span>02</span>
        <div><h2>标准价格规则</h2><p>费用仅为本地标准价估算；价格会按调用时间匹配并保存快照</p></div>
        <button className="button text-button" onClick={() => setPricingEditor(emptyPricingEditor())}>+ 添加价格规则</button>
      </div>
      {pricingRules.length ? <div className="pricing-list">
        {pricingRules.map((rule) => <article key={rule.id}>
          <div><span>{rule.provider}</span><strong>{rule.modelPattern}</strong><small>自 {rule.effectiveFrom.slice(0, 10)} 生效 · {rule.isEnabled ? '启用' : '停用'}</small></div>
          <div><small>输入 / 百万 Token</small><strong>{rule.currency} {microsToCurrency(rule.inputPricePerMillionMicros)}</strong></div>
          <div><small>输出 / 百万 Token</small><strong>{rule.currency} {microsToCurrency(rule.outputPricePerMillionMicros)}</strong></div>
          <div className="button-row"><button className="button ghost" onClick={() => setPricingEditor(editorFromRule(rule))}>编辑</button><button className="button danger" onClick={() => void deletePricingRule(rule)}>删除</button></div>
        </article>)}
      </div> : <div className="empty-pricing">尚未配置价格规则，因此调用记录会显示“未配置价格”。</div>}

      {pricingEditor && <div className="pricing-editor">
        <div className="field-grid">
          <label>Provider<input value={pricingEditor.provider} placeholder="例如 aliyun-bailian" onChange={(event) => updatePricing('provider', event.target.value)} /></label>
          <label>模型匹配<input value={pricingEditor.modelPattern} placeholder="精确 Model ID，或使用 * 通配符" onChange={(event) => updatePricing('modelPattern', event.target.value)} /></label>
          <label>地域（可选）<input value={pricingEditor.region} placeholder="例如 cn-beijing" onChange={(event) => updatePricing('region', event.target.value)} /></label>
          <label>协议（可选）<input value={pricingEditor.protocol} placeholder="openai-chat-completions" onChange={(event) => updatePricing('protocol', event.target.value)} /></label>
          <label>币种<select value={pricingEditor.currency} onChange={(event) => updatePricing('currency', event.target.value as 'CNY' | 'USD')}><option value="CNY">CNY</option><option value="USD">USD</option></select></label>
          <label>生效日期<input type="date" value={pricingEditor.effectiveFrom} onChange={(event) => updatePricing('effectiveFrom', event.target.value)} /></label>
          <label>失效日期（可选）<input type="date" value={pricingEditor.effectiveTo} onChange={(event) => updatePricing('effectiveTo', event.target.value)} /></label>
          <label>输入价格 / 百万 Token<input inputMode="decimal" value={pricingEditor.inputPrice} placeholder="例如 2.5" onChange={(event) => updatePricing('inputPrice', event.target.value)} /></label>
          <label>输出价格 / 百万 Token<input inputMode="decimal" value={pricingEditor.outputPrice} placeholder="例如 10" onChange={(event) => updatePricing('outputPrice', event.target.value)} /></label>
          <label>缓存输入倍率<input inputMode="decimal" value={pricingEditor.cachedInputMultiplier} placeholder="例如 0.25" onChange={(event) => updatePricing('cachedInputMultiplier', event.target.value)} /></label>
          <label>Batch 倍率（可选）<input inputMode="decimal" value={pricingEditor.batchMultiplier} placeholder="例如 0.5" onChange={(event) => updatePricing('batchMultiplier', event.target.value)} /></label>
          <label>最小输入 Token（不含）<input inputMode="numeric" value={pricingEditor.minInputTokensExclusive} placeholder="留空表示不限" onChange={(event) => updatePricing('minInputTokensExclusive', event.target.value)} /></label>
          <label>最大输入 Token（含）<input inputMode="numeric" value={pricingEditor.maxInputTokensInclusive} placeholder="留空表示不限" onChange={(event) => updatePricing('maxInputTokensInclusive', event.target.value)} /></label>
          <label>价格来源<input value={pricingEditor.sourceName} placeholder="例如官方价格页 / 内部标准价" onChange={(event) => updatePricing('sourceName', event.target.value)} /></label>
          <label className="toggle"><input type="checkbox" checked={pricingEditor.isEnabled} onChange={(event) => updatePricing('isEnabled', event.target.checked)} /><span>启用此规则</span></label>
        </div>
        <label>备注<textarea value={pricingEditor.notes} placeholder="价格来源、版本或特殊说明" onChange={(event) => updatePricing('notes', event.target.value)} /></label>
        <div className="button-row">
          <button className="button primary" disabled={Boolean(busy)} onClick={() => void savePricingRule()}>{busy === 'pricing-save' ? '保存中…' : '保存价格规则'}</button>
          <button className="button ghost" disabled={Boolean(busy)} onClick={() => setPricingEditor(null)}>取消</button>
        </div>
      </div>}
    </section>
  </div>;
}
