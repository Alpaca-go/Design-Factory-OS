const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const LATIN = /[A-Za-z]/g;
const TECHNICAL_TOKENS = /\b(?:D\d{2}|VE\d{3}|VS\d{2}|SA\d{3}|VF\d{2}|VM\d{2}|VT\d{2}|VC\d{2}|B2B|B2C|B2B2C|JSON|URL|ID|MQS|Anchor|Sprint|Provider|Token|Checkpoint|Evidence Index|Document Set Hash|Raw Score|Risk Penalty|Final Score|Penalty Reasons|Business Model|Primary Audience|Excluded Audience|Consumer Visual Policy|Suggested Assets|Direction Difference Matrix)\b/gi;

export function detectReportLanguage(prepared) {
  const text = prepared?.sourceDocuments?.map((item) => item.rawText || item.title || '').join('\n')
    || prepared?.chunks?.map((item) => item.text || '').join('\n')
    || '';
  const cjk = text.match(CJK)?.length || 0;
  const latin = text.match(LATIN)?.length || 0;
  return cjk >= 20 && cjk >= latin * 0.2 ? 'zh-CN' : 'en-US';
}

export function containsChinese(value) {
  return /\p{Script=Han}/u.test(String(value || ''));
}

export function measurePrimaryLanguage(markdown, reportLanguage = 'zh-CN') {
  const source = String(markdown || '');
  if (reportLanguage !== 'zh-CN') return Object.freeze({ report_language: reportLanguage, primary_language_ratio: 1, language_status: 'pass' });
  const prose = source
    .replace(/^英文代号：.*$/gmu, '')
    .replace(/`[^`]*`/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(TECHNICAL_TOKENS, '')
    .replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi, '')
    .replace(/\bvisual-[a-z0-9.-]+\b/gi, '')
    .replace(/\b(?:low|medium|high|critical|core|auxiliary|internal|consumer|b2b|direct_evidence|derived_evidence|inference|pass|needs_strengthening|needs_rewrite|confirmed|reasonable-inference|suggested|missing|conflicting|existing|derived|proposed|restricted|generic|identity|business-context|audience|capability|relationship|emotion|culture|aesthetic-tension|audience-boundary|prohibited|primary|secondary|supporting|completed-directions|max|ms|mock|fixture)\b/gi, '');
  const cjk = prose.match(CJK)?.length || 0;
  const latin = prose.match(LATIN)?.length || 0;
  const ratio = cjk + latin ? cjk / (cjk + latin) : 1;
  return Object.freeze({
    report_language: reportLanguage,
    primary_language_ratio: Math.round(ratio * 10000) / 10000,
    language_status: ratio >= 0.9 ? 'pass' : 'fail'
  });
}
