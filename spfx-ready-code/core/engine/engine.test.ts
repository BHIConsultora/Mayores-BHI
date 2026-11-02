import { describe, it, expect } from 'vitest';
import * as xlsx from 'xlsx';
import path from 'path';
import { analizar } from './analyzer';
import { aNumero } from './numbers';
import { esRuido } from './classifier';

describe('Engine Unit Tests', () => {
  it('aNumero - maneja comas y puntos correctamente', () => {
    expect(aNumero('1.234,56')).toBe(1234.56);
    expect(aNumero('1,234.56')).toBe(1234.56);
    expect(aNumero('(1.234,56)')).toBe(-1234.56);
    expect(aNumero('- 1234,56')).toBe(-1234.56);
    expect(aNumero('1234,56')).toBe(1234.56);
    expect(aNumero('1234.56')).toBe(1234.56);
  });

  it('esRuido - trampas reales no descartan filas válidas', () => {
    // Proveedor que empieza con TRANSPORTE no debe ser ruido
    expect(esRuido(['TRANSPORTE AL SUR S.R.L.'])).toBe(false);
    
    // Pero si es 'transporte' exacto, es ruido
    expect(esRuido(['transporte'])).toBe(true);
    
    // Prefijos de saldo
    expect(esRuido(['saldo inicial del periodo'])).toBe(true);
  });
});

describe('Test de Regresion contra el Mayor Real', () => {
  it('Procesa el archivo completo y verifica los resultados exactos', () => {
    const filePath = path.join(process.cwd(), 'docs', 'v2. Libro mayor XLSX (1).xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // header: 1 devuelve array de arrays
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });
    
    const result = analizar(rows);
    
    expect(result.filas.length).toBe(193128);
    expect(result.cuentas).toBe(198);
    expect(result.sinDescripcion).toBe(0);
    const sinFecha = result.filas.filter(f => !f.fecha);
    expect(sinFecha.length).toBe(0);
    
    expect(result.totalDebito).toBeCloseTo(61275076216.10, 2);
    expect(result.totalCredito).toBeCloseTo(61275076216.10, 2);
    expect(Math.abs(result.totalDebito - result.totalCredito)).toBeLessThan(0.01);
  }, 30000);
});
