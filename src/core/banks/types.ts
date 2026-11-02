export type BankType = 
  | 'Banco Privado Nacional'
  | 'Banco Privado Internacional'
  | 'Banco Público Nacional'
  | 'Banco Público Provincial'
  | 'Banco Público Municipal'
  | 'Banco Cooperativo'
  | 'Banco Mixto / Provincial'
  | 'PSP / Billetera Virtual'
  | 'ALyC / Sociedad de Bolsa'
  | 'Entidad Financiera';

export interface BankDefinition {
  code: string; // 3-digit BCRA code (e.g. '072')
  id: string; // slug identifier (e.g. 'santander')
  name: string; // Full name (e.g. 'Banco Santander Argentina')
  shortName: string; // e.g. 'Santander'
  type: BankType;
  color?: string; // Brand accent color
}

export interface MovimientoBancario {
  id: string;
  fecha: string; // DD/MM/YYYY
  concepto: string;
  referencia?: string;
  debito: number | null;
  credito: number | null;
  importeNeto: number; // +credito -debito
  saldo: number | null;
  banco: string;
  tipoBanco: string;
  cbu: string;
  cuenta?: string;
  titular?: string;
  cuit?: string;
}

export interface ExtractoMetadata {
  banco: string;
  tipoBanco: string;
  codigoBanco: string;
  cbu: string;
  cuenta: string;
  titular: string;
  cuit: string;
  periodo: string;
  moneda: string; // 'ARS' | 'USD' | etc.
  saldoInicial: number | null;
  saldoFinal: number | null;
}

export interface ExtractoTotales {
  totalDebitos: number;
  totalCreditos: number;
  cantidadMovimientos: number;
  saldoCalculado: number | null;
  saldoInformado: number | null;
  diferenciaCuadre: number;
  cuadra: boolean;
}

export interface ExtractoBancarioResult {
  metadata: ExtractoMetadata;
  movimientos: MovimientoBancario[];
  totales: ExtractoTotales;
  paginas: number;
  textoLongitud: number;
  parserUsado: string;
  customColumns?: string[];
  tableRows?: Record<string, string>[];
}
