import { MapeoColumnas, Movimiento, ResultadoAnalisis, OpcionesAnalisis } from '../domain/types';
import { detectarEncabezado } from './header';
import { esFecha, piezasFecha, resolverFecha } from './dates';
import { txt, norm } from './normalizer';
import { aNumero } from './numbers';
import { esRuido, tituloDe, claseDe, esApertura } from './classifier';

function extraerFechaInicio(filas: any[][]): Date | null {
  for (let r = 0; r < Math.min(filas.length, 30); r++) {
    const fila = filas[r];
    if (!fila) continue;
    for (let c = 0; c < fila.length; c++) {
      const val = String(fila[c] || '');
      const match = val.match(/(?:de|desde|del)\s*[:]?\s*([0-3]?[0-9][\/\-.][0-1]?[0-9][\/\-.][12][0-9]{3})/i);
      if (match) return resolverFecha(match[1], true);
      const matchIso = val.match(/(?:de|desde|del)\s*[:]?\s*([12][0-9]{3}[\/\-.][0-1]?[0-9][\/\-.][0-3]?[0-9])/i);
      if (matchIso) return resolverFecha(matchIso[1], false);
    }
  }
  return null;
}

function limpiarReferencia(comp: string, com: string): string {
  const c1 = (comp || '').trim();
  let c2 = (com || '').trim();

  if (!c2 || c2.toLowerCase() === 'none') return c1;

  // 1. Si contiene facturas (FA-A, FC-A, etc.), capturar solo las facturas y asociarlas al comprobante
  const matchFac = c2.match(/((?:(?:FA|FC|NC|ND|TK|REC|OP|OPG)-\w+\s+[0-9A-Za-z_-]+(?:\s+|$))+)/i);
  if (matchFac && matchFac[1]) {
    const facs = matchFac[1].trim();
    return c1 ? `${c1} - ${facs}` : facs;
  }

  // 2. Limpiar relleno automatico en ingles de Odoo (Customer Payment, Check received, None, fechas redundantes)
  c2 = c2.replace(/\bNone\b/gi, '');
  c2 = c2.replace(/(?:Customer Payment|Supplier Payment|Internal Transfer|Customer Invoices|Vendor Bills)\s*\$[\s\d,.]+/gi, '');
  c2 = c2.replace(/Check\s+\d+\s+(?:received|delivered)/gi, '');
  c2 = c2.replace(/\s*-\s*\d{2}[\/\-]\d{2}[\/\-]\d{4}\s*$/g, '');
  c2 = c2.replace(/(\s*-\s*)+/g, ' - ').replace(/^[\s-]+|[\s-]+$/g, '').trim();

  if (!c2) return c1;
  return c1 && c2 !== c1 ? `${c1} - ${c2}` : (c1 || c2);
}

export function analizar(
  filas: any[][],
  override?: Partial<Record<keyof MapeoColumnas, number | null>>,
  opciones?: OpcionesAnalisis
): ResultadoAnalisis {
  const det = detectarEncabezado(filas);
  let mapa: MapeoColumnas = {};
  let filaEnc = -1;
  let encabezadosOriginales: string[] = [];
  
  if (det) { 
    mapa = det.mapa; 
    filaEnc = det.fila; 
    encabezadosOriginales = filas[filaEnc].map(c => txt(c) || '');
  }
  
  if (override) {
    (Object.keys(override) as (keyof MapeoColumnas)[]).forEach((key) => {
      const ov = override[key];
      if (ov === -1 || ov === null) delete mapa[key];
      else if (ov !== undefined) mapa[key] = ov;
    });
  }

  if (mapa.fecha === undefined) mapa.fecha = 0;

  // dd/mm vs mm/dd
  let diaPrimero = true;
  let votoDia = 0, votoMes = 0;
  for (let r = 0; r < filas.length; r++) {
    const fila = filas[r];
    if (!fila) continue;
    const p = piezasFecha(fila[mapa.fecha as number]);
    if (p && 'amb' in p) {
      if (p.amb[0] > 12) votoDia++;
      else if (p.amb[1] > 12) votoMes++;
    }
    if (votoDia + votoMes > 400) break;
  }
  if (votoMes > votoDia) diaPrimero = false;

  const mapaCtas: Record<string, string> = {};
  let actual: { cod: string, desc: string } | null = null;
  const movs: Movimiento[] = [];
  const ctasUsadas: Record<string, number> = {};
  
  const incluirApertura = opciones?.incluirApertura ?? true;
  const fechaInicioPeriodo = incluirApertura ? extraerFechaInicio(filas) : null;
  let filasApertura = 0;

  let totDeb = 0, totCred = 0, sinDesc = 0;
  const hayDebHaber = mapa.debito !== undefined || mapa.credito !== undefined;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila || !fila.length) continue;
    if (i === filaEnc) continue;

    const esAp = esApertura(fila);
    const crudoCta = mapa.cuenta !== undefined ? txt(fila[mapa.cuenta]) : '';
    const fechaOk = esFecha(fila[mapa.fecha as number]);

    if (!fechaOk) {
      if (esAp && incluirApertura) {
        // Fila de apertura sin fecha explícita: se procesa como movimiento
      } else {
        const t = tituloDe(fila, mapa);
        if (t) { mapaCtas[t.cod] = t.desc; actual = t; }
        continue;
      }
    }
    
    if (!esAp && esRuido(fila, mapa.ref)) continue;
    if (esAp && !incluirApertura) continue;
    if (claseDe(norm(crudoCta))) continue; // encabezado repetido

    const cod = crudoCta || (actual ? actual.cod : '');
    if (!cod && mapa.cuenta !== undefined) continue;

    let desc = '';
    if (crudoCta && mapa.desccta !== undefined) {
      desc = txt(fila[mapa.desccta]);
    }
    if (!desc) desc = (actual && actual.cod === cod ? actual.desc : '') || mapaCtas[cod] || '';
    if (!desc && actual && !crudoCta) desc = actual.desc;
    if (!desc) sinDesc++;

    let ref = '';
    if (esAp) {
      ref = 'Saldo inicial';
    } else {
      const rawRef = mapa.ref !== undefined ? txt(fila[mapa.ref]) : '';
      let extraRef = '';
      if (!crudoCta && actual && mapa.desccta !== undefined) {
        const candidate = txt(fila[mapa.desccta]);
        if (candidate && candidate !== actual.desc && candidate !== desc) {
          extraRef = candidate;
        }
      }
      ref = limpiarReferencia(extraRef, rawRef);
    }

    let deb = 0, cred = 0, mov = 0;
    if (hayDebHaber) {
      deb = mapa.debito !== undefined ? aNumero(fila[mapa.debito]) : 0;
      cred = mapa.credito !== undefined ? aNumero(fila[mapa.credito]) : 0;
      mov = deb - cred;
    } else if (mapa.importe !== undefined) {
      mov = aNumero(fila[mapa.importe]);
      if (mov >= 0) deb = mov; else cred = -mov;
    }

    if (esAp && deb === 0 && cred === 0 && mapa.saldo !== undefined) {
      const sal = aNumero(fila[mapa.saldo]);
      if (sal > 0) deb = sal; else cred = -sal;
      mov = sal;
    }

    if (esAp) filasApertura++;

    totDeb += deb; 
    totCred += cred;
    if (cod) ctasUsadas[cod] = 1;

    let fechaMov: Date | null = null;
    if (fechaOk) {
      fechaMov = resolverFecha(fila[mapa.fecha as number], diaPrimero);
    } else if (esAp) {
      fechaMov = fechaInicioPeriodo || (fila[mapa.fecha as number] ? resolverFecha(fila[mapa.fecha as number], diaPrimero) : null);
    }

    movs.push({
      fecha: fechaMov,
      cod: cod,
      desc: desc,
      ref: ref,
      debito: Math.round(deb * 100) / 100,
      credito: Math.round(cred * 100) / 100,
      mov: Math.round(mov * 100) / 100,
      filaOriginal: fila
    });
  }

  return {
    filas: movs,
    mapa: mapa,
    filaEnc: filaEnc,
    encabezadosOriginales,
    diaPrimero: diaPrimero,
    modoImporte: hayDebHaber ? 'debe-haber' : (mapa.importe !== undefined ? 'importe' : 'ninguno'),
    cuentas: Object.keys(ctasUsadas).length,
    cuentasConNombre: Object.keys(mapaCtas).length,
    sinDescripcion: sinDesc,
    totalDebito: Math.round(totDeb * 100) / 100,
    totalCredito: Math.round(totCred * 100) / 100,
    filasApertura
  };
}
