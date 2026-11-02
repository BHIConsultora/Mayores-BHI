export function aNumero(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).replace(/ /g, ' ').trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s);
  s = s.replace(/[()]/g, '').replace(/[^0-9.,\-]/g, '');
  if (!s) return 0;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    if (coma > punto) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (coma > -1) {
    s = (s.length - coma - 1) === 3 && !/^-?\d{1,3},\d{3}$/.test(s) === false
      ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return neg && n > 0 ? -n : n;
}
