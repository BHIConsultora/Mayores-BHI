import { norm, txt } from './normalizer';
import { MapeoColumnas } from '../domain/types';

export const SIN: Record<string, string[]> = {
  fecha:    ['fecha', 'fec', 'fecha asiento', 'fecha mov', 'fecha movimiento', 'fecha contable',
             'f emision', 'fecha emision', 'fecha registro', 'date', 'dia'],
  cuenta:   ['cuenta', 'cta', 'codigo', 'codigo cuenta', 'cod cuenta', 'cod cta', 'nro cuenta',
             'numero de cuenta', 'cuenta contable', 'imputacion', 'account'],
  desccta:  ['descripcion cuenta', 'nombre cuenta', 'denominacion', 'denominacion cuenta',
             'detalle cuenta', 'nombre de la cuenta', 'titulo cuenta', 'account name'],
  ref:      ['referencia', 'concepto', 'detalle', 'leyenda', 'glosa', 'observaciones',
             'observacion', 'descripcion', 'descripcion movimiento', 'comprobante', 'documento',
             'nro comprobante', 'numero comprobante', 'texto', 'memo', 'comunicacion', 'comunicaciones', 'etiqueta'],
  debito:   ['debito', 'debitos', 'debe', 'cargo', 'cargos', 'debit'],
  credito:  ['credito', 'creditos', 'haber', 'abono', 'abonos', 'credit'],
  importe:  ['importe', 'monto', 'movimiento', 'valor', 'importe movimiento', 'amount'],
  asiento:  ['asiento', 'nro asiento', 'numero asiento', 'diario', 'libro'],
  saldo:    ['saldo', 'saldo acumulado', 'saldo acumu', 'acumulado', 'saldo final', 'balance']
};

export const ORDEN = ['fecha', 'cuenta', 'desccta', 'ref', 'debito', 'credito', 'importe', 'asiento', 'saldo'];

export function claseDe(s: string): string | null {
  if (!s) return null;
  for (let i = 0; i < ORDEN.length; i++) {
    const k = ORDEN[i];
    if (SIN[k].indexOf(s) !== -1) return k;
  }
  for (let j = 0; j < ORDEN.length; j++) {
    const k2 = ORDEN[j], lista = SIN[k2];
    for (let m = 0; m < lista.length; m++) {
      if (lista[m].length >= 5 && s.indexOf(lista[m]) !== -1) return k2;
    }
  }
  return null;
}

const APERTURA_PREFIJO = [
  'saldo inicial',
  'saldos iniciales',
  'saldo anterior',
  'saldo al inicio',
  'asiento de apertura',
  'apertura'
];

export function esApertura(fila: any[]): boolean {
  if (!fila || !fila.length) return false;
  for (let i = 0; i < fila.length; i++) {
    const s = norm(fila[i]);
    if (!s) continue;
    if (s.indexOf('total') !== -1 || s.indexOf('subtotal') !== -1 || s.indexOf('saldo final') !== -1 || s.indexOf('saldos finales') !== -1) {
      return false;
    }
    for (let j = 0; j < APERTURA_PREFIJO.length; j++) {
      if (s.indexOf(APERTURA_PREFIJO[j]) === 0 || s === 'apertura') {
        return true;
      }
    }
  }
  return false;
}

const RUIDO_PREFIJO = ['saldo inicial', 'saldo final', 'saldo anterior', 'saldo al',
  'saldos iniciales', 'saldos finales', 'saldo del periodo', 'saldo acumulado inicial'];
const RUIDO_EXACTO = ['total', 'totales', 'total cuenta', 'total general', 'total del periodo',
  'subtotal', 'sub total', 'transporte', 'arrastre', 'suma y sigue', 'vienen', 'van',
  'acumulado', 'acumulado del periodo', 'saldo', 'saldos'];


export function esRuido(fila: any[], colRef?: number): boolean {
  for (let i = 0; i < fila.length; i++) {
    if (i === colRef) continue;
    const s = norm(fila[i]);
    if (!s) continue;
    if (RUIDO_EXACTO.indexOf(s) !== -1) return true;
    for (let j = 0; j < RUIDO_PREFIJO.length; j++) {
      if (s.indexOf(RUIDO_PREFIJO[j]) === 0) return true;
    }
  }
  return false;
}

const RE_TITULO = /^\s*([0-9][0-9A-Za-z._\-\/]*)\s*[-–—:]\s*(.+?)\s*$/;

export function tituloDe(fila: any[], mapa?: MapeoColumnas): { cod: string, desc: string } | null {
  // 1. Título en una sola celda: "1.1.01.0001 - CAJA"
  for (let i = 0; i < Math.min(fila.length, 4); i++) {
    const s = txt(fila[i]);
    if (!s || s.length > 160) continue;
    const m = RE_TITULO.exec(s);
    if (m && /\d/.test(m[1]) && m[2].length > 1 && !/^\d+$/.test(m[2])) {
      return { cod: m[1].replace(/[.\-\/]+$/, ''), desc: m[2] };
    }
  }

  // 2. Título en columnas separadas (ej. Odoo: Col Cuenta tiene código y Col Desccta tiene nombre)
  const colCta = mapa && mapa.cuenta !== undefined ? mapa.cuenta : 0;
  const colDesc = mapa && mapa.desccta !== undefined ? mapa.desccta : (colCta + 1);

  if (colCta < fila.length) {
    const rawCod = txt(fila[colCta]);
    if (rawCod && /\d/.test(rawCod) && /^[0-9][0-9A-Za-z._\-\/]{1,}$/.test(rawCod)) {
      const nCod = norm(rawCod);
      if (!claseDe(nCod) && !esRuido([rawCod])) {
        let rawDesc = colDesc < fila.length ? txt(fila[colDesc]) : '';
        const nDesc = norm(rawDesc);
        if (nDesc && (claseDe(nDesc) || esRuido([rawDesc]))) {
          rawDesc = '';
        }
        return { cod: rawCod.replace(/[.\-\/]+$/, ''), desc: rawDesc };
      }
    }
  }

  return null;
}
