import { claseDe } from './classifier';
import { norm } from './normalizer';
import { MapeoColumnas } from '../domain/types';

export function detectarEncabezado(filas: any[][]): { fila: number, puntos: number, mapa: MapeoColumnas } | null {
  let mejor: { fila: number, puntos: number, mapa: MapeoColumnas } | null = null;
  const tope = Math.min(filas.length, 150);
  
  for (let r = 0; r < tope; r++) {
    const fila = filas[r];
    const vistos: Record<string, number> = {};
    let puntos = 0;
    const mapa: MapeoColumnas = {};
    
    for (let c = 0; c < fila.length; c++) {
      const k = claseDe(norm(fila[c]));
      if (k && !vistos[k]) { 
        vistos[k] = 1; 
        (mapa as any)[k] = c; 
        puntos++; 
      }
    }
    
    if (mapa.fecha === undefined) puntos -= 1;
    if (puntos >= 3 && (!mejor || puntos > mejor.puntos)) {
      mejor = { fila: r, puntos, mapa };
    }
  }
  return mejor;
}
