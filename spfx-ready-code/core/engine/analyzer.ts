import { MapeoColumnas, Movimiento, ResultadoAnalisis } from '../domain/types';
import { detectarEncabezado } from './header';
import { esFecha, piezasFecha, resolverFecha } from './dates';
import { txt, norm } from './normalizer';
import { aNumero } from './numbers';
import { esRuido, tituloDe, claseDe } from './classifier';

export function analizar(filas: any[][], override?: Partial<Record<keyof MapeoColumnas, number | null>>): ResultadoAnalisis {
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
    for (const k in override) {
      const key = k as keyof MapeoColumnas;
      const ov = override[key];
      if (ov === -1 || ov === null) delete mapa[key];
      else if (ov !== undefined) mapa[key] = ov;
    }
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
  
  let totDeb = 0, totCred = 0, sinDesc = 0;
  const hayDebHaber = mapa.debito !== undefined || mapa.credito !== undefined;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila || !fila.length) continue;
    if (i === filaEnc) continue;

    const crudoCta = mapa.cuenta !== undefined ? txt(fila[mapa.cuenta]) : '';
    const fechaOk = esFecha(fila[mapa.fecha as number]);

    if (!fechaOk) {
      const t = tituloDe(fila);
      if (t) { mapaCtas[t.cod] = t.desc; actual = t; }
      continue;
    }
    
    if (esRuido(fila, mapa.ref)) continue;
    if (claseDe(norm(crudoCta))) continue; // encabezado repetido

    const cod = crudoCta || (actual ? actual.cod : '');
    if (!cod && mapa.cuenta !== undefined) continue;

    let desc = '';
    if (mapa.desccta !== undefined) desc = txt(fila[mapa.desccta]);
    if (!desc) desc = mapaCtas[cod] || (actual && actual.cod === cod ? actual.desc : '') || '';
    if (!desc && actual && !crudoCta) desc = actual.desc;
    if (!desc) sinDesc++;

    let deb = 0, cred = 0, mov = 0;
    if (hayDebHaber) {
      deb = mapa.debito !== undefined ? aNumero(fila[mapa.debito]) : 0;
      cred = mapa.credito !== undefined ? aNumero(fila[mapa.credito]) : 0;
      mov = deb - cred;
    } else if (mapa.importe !== undefined) {
      mov = aNumero(fila[mapa.importe]);
      if (mov >= 0) deb = mov; else cred = -mov;
    }

    totDeb += deb; 
    totCred += cred;
    if (cod) ctasUsadas[cod] = 1;

    movs.push({
      fecha: resolverFecha(fila[mapa.fecha as number], diaPrimero),
      cod: cod,
      desc: desc,
      ref: mapa.ref !== undefined ? txt(fila[mapa.ref]) : '',
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
    totalCredito: Math.round(totCred * 100) / 100
  };
}
