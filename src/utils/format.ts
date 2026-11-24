export function formatCurrency(amount: number): string {
  const value = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
  return value < 0 ? `-UGX ${formatted}` : `UGX ${formatted}`;
}

export function formatCompactCurrency(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const text = m % 1 === 0 ? m.toFixed(0) : m.toFixed(1);
    return `${sign}UGX ${text}M`;
  }
  if (abs >= 1_000) {
    const k = Math.round(abs / 1_000);
    return `${sign}UGX ${k}k`;
  }
  return `${sign}UGX ${Math.round(abs)}`;
}

export function formatNumber(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDateShort(isoOrYmd: string): string {
  if (!isoOrYmd) return '—';
  const d = new Date(isoOrYmd.includes('T') ? isoOrYmd : `${isoOrYmd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoOrYmd;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
