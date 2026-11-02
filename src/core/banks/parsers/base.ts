import { MovimientoBancario, ExtractoMetadata, ExtractoTotales, BankDefinition } from '../types';

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

export interface BankParserContext {
  text: string;
  pages: { text: string; num: number; items?: PdfTextItem[] }[];
  bank: BankDefinition;
  cbuDetected: string | null;
}

export interface BankParserOutput {
  metadata: ExtractoMetadata;
  movimientos: MovimientoBancario[];
  customColumns?: string[];
  tableRows?: Record<string, string>[];
}

/**
 * Parses numbers in various Argentine bank formats:
 * - "1.234.567,89" -> 1234567.89
 * - "-55.000,00" -> -55000.00
 * - "4.878,82-" -> -4878.82
 * - "$ 1.100.000,00" -> 1100000.00
 * - "55975665.36" -> 55975665.36
 */
export function parseArgentineAmount(str: string | null | undefined): number | null {
  if (!str) return null;
  let s = str.replace(/[$\sU$S]/g, '').trim();
  if (!s) return null;

  const isNegative = s.startsWith('-') || s.endsWith('-');
  s = s.replace(/^-|-$/g, '');

  if (s.includes('.') && s.includes(',')) {
    // Standard Argentine: 1.234.567,89
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // 1234,56
    s = s.replace(',', '.');
  } else if (s.includes('.')) {
    // Could be 1234.56 or 1.234 (thousands)
    // If it has 2 decimals (e.g. .56 or .00)
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      s = s; // decimal dot
    } else if (parts.length > 2) {
      s = s.replace(/\./g, '');
    }
  }

  const val = parseFloat(s);
  if (isNaN(val)) return null;
  return isNegative ? -Math.abs(val) : val;
}

/**
 * Standardizes dates to DD/MM/YYYY.
 * If statement provides DD/MM without year, defaultYear is appended.
 */
export function normalizeDate(dateStr: string, defaultYear?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim().replace(/[-.]/g, '/');
  const parts = clean.split('/');

  if (parts.length === 2 && defaultYear) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const yr = defaultYear.length === 2 ? '20' + defaultYear : defaultYear;
    return `${day}/${month}/${yr}`;
  }

  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let yr = parts[2];
    if (yr.length === 2) {
      yr = '20' + yr;
    }
    return `${day}/${month}/${yr}`;
  }

  return dateStr;
}

/**
 * Extracts statement year from text (e.g. from "2026", "Periodo: ... 2026", etc.)
 */
export function extractStatementYear(text: string): string {
  const match = text.match(/\b(202[0-9])\b/);
  return match ? match[1] : new Date().getFullYear().toString();
}

/**
 * Extracts CUIT from text (XX-XXXXXXXX-X or XXXXXXXXXXX)
 */
export function extractCUIT(text: string): string {
  const labeled = text.match(/C\.?U\.?I\.?T\.?(?:\s+N[°ro\.]*)?[:\s]+(\d{2}-?\d{8}-?\d{1})/i);
  if (labeled) return labeled[1];

  const generic = text.match(/\b(20|23|24|27|30|33|34)-?(\d{8})-?(\d{1})\b/);
  if (generic) return `${generic[1]}-${generic[2]}-${generic[3]}`;

  return '';
}

/**
 * Extracts Account number from text with common keywords
 */
export function extractAccountNumber(text: string): string {
  const match = text.match(/(?:Cuenta|Nro\.?\s*Cuenta|Cta\.?|N°)\s*[:]?\s*([0-9\/\-\.]{5,25})/i);
  return match ? match[1].trim() : '';
}

/**
 * Calculates summary totals and validates accounting balance
 */
export function computeTotales(
  movimientos: MovimientoBancario[],
  saldoInicial: number | null,
  saldoFinal: number | null
): ExtractoTotales {
  let totalDebitos = 0;
  let totalCreditos = 0;

  for (const mov of movimientos) {
    if (mov.debito !== null && mov.debito > 0) {
      totalDebitos += mov.debito;
    }
    if (mov.credito !== null && mov.credito > 0) {
      totalCreditos += mov.credito;
    }
  }

  totalDebitos = Math.round(totalDebitos * 100) / 100;
  totalCreditos = Math.round(totalCreditos * 100) / 100;

  let saldoCalculado: number | null = null;
  let diferenciaCuadre = 0;
  let cuadra = false;

  if (saldoInicial !== null) {
    saldoCalculado = Math.round((saldoInicial + totalCreditos - totalDebitos) * 100) / 100;
    if (saldoFinal !== null) {
      diferenciaCuadre = Math.round(Math.abs(saldoCalculado - saldoFinal) * 100) / 100;
      cuadra = diferenciaCuadre <= 0.05; // 5 cents tolerance for rounding
    }
  } else if (movimientos.length > 0) {
    // If saldoInicial is not provided in statement header, check last movement balance
    const lastMovWithSaldo = [...movimientos].reverse().find(m => m.saldo !== null);
    if (lastMovWithSaldo && lastMovWithSaldo.saldo !== null) {
      saldoCalculado = lastMovWithSaldo.saldo;
      if (saldoFinal !== null) {
        diferenciaCuadre = Math.round(Math.abs(saldoCalculado - saldoFinal) * 100) / 100;
        cuadra = diferenciaCuadre <= 0.05;
      } else {
        cuadra = true;
      }
    }
  }

  return {
    totalDebitos,
    totalCreditos,
    cantidadMovimientos: movimientos.length,
    saldoCalculado,
    saldoInformado: saldoFinal,
    diferenciaCuadre,
    cuadra
  };
}
