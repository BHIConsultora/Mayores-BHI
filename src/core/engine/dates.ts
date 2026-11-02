import { txt } from './normalizer';

const RE_FECHA = /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/;

type PiezasFecha = { date: Date } | { amb: [number, number, number] } | null;

export function piezasFecha(v: any): PiezasFecha {
  if (v instanceof Date && !isNaN(v.getTime())) return { date: v };
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return { date: new Date(Math.round((v - 25569) * 86400000)) };
  }
  let s = txt(v);
  if (!s) return null;
  s = s.split(' ')[0];
  const m = RE_FECHA.exec(s);
  if (!m) return null;
  const a = +m[1], b = +m[2], c = +m[3];
  if (m[1].length === 4) {
    const dt = armar(a, b, c);
    return dt ? { date: dt } : null;
  }
  return { amb: [a, b, c] };
}

export function armar(y: number, mo: number, d: number): Date | null {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCDate() === d && dt.getUTCMonth() === mo - 1 ? dt : null;
}

export function esFecha(v: any): boolean {
  const p = piezasFecha(v);
  return !!(p && ('date' in p || 'amb' in p));
}

export function resolverFecha(v: any, diaPrimero: boolean): Date | null {
  const p = piezasFecha(v);
  if (!p) return null;
  if ('date' in p) return p.date;
  const x = p.amb;
  return diaPrimero ? armar(x[2], x[1], x[0]) : armar(x[2], x[0], x[1]);
}
