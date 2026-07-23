export type AnalysisMode = 'visual-analysis' | 'visual-translation';

interface Props {
  value: AnalysisMode;
  onChange(value: AnalysisMode): void;
}

export function AnalysisModeTabs({ value, onChange }: Props) {
  return <div className="analysis-mode-tabs" role="tablist" aria-label="分析功能">
    <button role="tab" aria-selected={value === 'visual-analysis'} className={value === 'visual-analysis' ? 'active' : ''} onClick={() => onChange('visual-analysis')}>
      <span>视觉分析</span><small>上传视觉方案、图片、PDF 或 ZIP</small>
    </button>
    <button role="tab" aria-selected={value === 'visual-translation'} className={value === 'visual-translation' ? 'active' : ''} onClick={() => onChange('visual-translation')}>
      <span>文档视觉转译</span><small>上传策略文档，生成三个视觉方向</small>
    </button>
  </div>;
}
