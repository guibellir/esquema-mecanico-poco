/** Converte valor numérico para exibição em input (vazio se null/undefined/NaN) */
export function numToInput(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return String(n);
}

/** Parse de input: vazio → null (não força zero) */
export function inputToNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '' || t === '-' || t === '.' || t === '-.') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Valor numérico seguro para cálculos / desenho */
export function n(v: number | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || Number.isNaN(v)) return fallback;
  return v;
}

export function fmt(num: number | null | undefined): string {
  const v = n(num, NaN);
  if (!Number.isFinite(v)) return '—';
  if (Number.isInteger(v)) return String(v);
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
