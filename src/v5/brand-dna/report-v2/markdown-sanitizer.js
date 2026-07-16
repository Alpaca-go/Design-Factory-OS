export const MAX_TABLE_CELL_CHARS = 100;
export const MAX_TABLE_COLUMNS = 5;

export function cleanText(value, fallback = '') {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim()
    : fallback;
}

export function escapeMarkdownInline(value) {
  return cleanText(value)
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]<>])/g, '\\$1');
}

export function escapeMarkdownTableCell(value, maximum = MAX_TABLE_CELL_CHARS) {
  const text = cleanText(value).replace(/\s*\n+\s*/g, ' ').replaceAll('|', '\\|');
  return text.length > maximum ? `${text.slice(0, Math.max(1, maximum - 1)).trim()}…` : text;
}

export function bulletList(values, fallback = '暂无') {
  const items = (Array.isArray(values) ? values : [values])
    .map((item) => cleanText(item))
    .filter(Boolean);
  return items.length
    ? items.map((item) => `- ${escapeMarkdownInline(item)}`).join('\n')
    : `- ${fallback}`;
}

export function uniqueText(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [values])
    .map((item) => cleanText(item))
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

export function markdownTable(headers, rows) {
  if (headers.length > MAX_TABLE_COLUMNS) {
    throw new Error(`Markdown 表格不得超过 ${MAX_TABLE_COLUMNS} 列`);
  }
  return [
    `| ${headers.map((item) => escapeMarkdownTableCell(item)).join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.map((item) => escapeMarkdownTableCell(item)).join(' | ')} |`)
  ].join('\n');
}
