export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '—';
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatDurationHuman(milliseconds: number | null): string {
  if (milliseconds === null) return '—';
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${String(seconds % 60).padStart(2, '0')}秒`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function formatTokens(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined) return 'Token 用量不可用';
  return Math.max(0, tokens).toLocaleString('zh-CN');
}

export function formatCost(micros: number | null | undefined, currency?: string | null): string {
  if (micros === null || micros === undefined || !currency) return '未配置价格';
  if (currency === 'MIXED') return '多币种';
  const value = micros / 1_000_000;
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${value.toFixed(value >= 1 ? 4 : 6)}`;
}

export function currencyToMicros(value: string): string {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) throw new Error('价格最多支持 6 位小数');
  const [whole, fraction = ''] = normalized.split('.');
  return (BigInt(whole || '0') * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString();
}

export function microsToCurrency(value: string): string {
  const micros = BigInt(value || '0');
  const whole = micros / 1_000_000n;
  const fraction = String(micros % 1_000_000n).padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function filename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

export function cleanError(error: unknown): string {
  return String((error as Error)?.message || error || '未知错误')
    .replace(/^Error invoking remote method '[^']+': Error:\s*/, '')
    .replace(/^Error:\s*/, '');
}
