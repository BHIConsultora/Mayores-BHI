export function norm(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/ /g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.:]+$/, '')
    .replace(/\s+/g, ' ');
}

export function txt(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return '';
  return String(v).replace(/ /g, ' ').trim();
}
