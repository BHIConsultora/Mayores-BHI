import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parseGaliciaStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Extract metadata
  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '0070082520000011920391';
  
  let titular = '';
  const titularMatch = text.match(/(?:INGENIERIA[^\n]+|EMPRESA[^\n]+|[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) {
    titular = titularMatch[0].trim();
  }

  let cuenta = '';
  const cuentaMatch = text.match(/N°\s*(\d+-\d+\s+\d+-\d+|\d+-\d+)/);
  if (cuentaMatch) {
    cuenta = cuentaMatch[1];
  }

  // Saldos header: often has "$X.XXX.XXX,XX"
  const saldosMatch = text.match(/Saldos[\s\S]*?(\$[\d.,]+)[\s\S]*?(\$[\d.,]+)/);
  const saldoInicial = saldosMatch ? parseArgentineAmount(saldosMatch[1]) : null;
  const saldoFinal = saldosMatch ? parseArgentineAmount(saldosMatch[2]) : null;

  // 2. Extract movements
  const movimientos: MovimientoBancario[] = [];
  const dateRegex = /^(\d{2}\/\d{2}\/\d{2,4})\s+(.+)$/;
  let current: {
    fecha: string;
    conceptoParts: string[];
    amount: number | null;
    saldo: number | null;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip recurring headers
    if (
      line.includes('Fecha Descripción Origen') ||
      line.includes('Resumen de Cuenta Corriente') ||
      line.includes('Disponés de 30 días') ||
      line.includes('Tasa Extraordinaria') ||
      line.includes('El monto de IVA') ||
      line.includes('Página ')
    ) {
      continue;
    }

    const dMatch = line.match(dateRegex);
    if (dMatch) {
      // If there was an unpushed current item with amount
      if (current && current.amount !== null) {
        pushMovimiento(current);
      }
      current = {
        fecha: dMatch[1],
        conceptoParts: [dMatch[2]],
        amount: null,
        saldo: null
      };
      continue;
    }

    if (current) {
      // Look for amount and balance at the end of the line
      // e.g. "-55.000,00 4.878,82-" or "00D5 200.000,00 183.171,88" or "20.000.000,00 20.200.845,08"
      const numMatch = line.match(/(-?[\d.]+,\d{2}-?)\s+(-?[\d.]+,\d{2}-?)$/);
      if (numMatch) {
        current.amount = parseArgentineAmount(numMatch[1]);
        current.saldo = parseArgentineAmount(numMatch[2]);
        const prefix = line.slice(0, numMatch.index).trim();
        if (prefix && prefix !== '-') current.conceptoParts.push(prefix);

        pushMovimiento(current);
        current = null;
      } else {
        // Line without numbers is part of description / details (e.g. "Diciembre 2025", "30712348255")
        current.conceptoParts.push(line);
      }
    }
  }

  if (current && current.amount !== null) {
    pushMovimiento(current);
  }

  function pushMovimiento(item: NonNullable<typeof current>) {
    const amt = item.amount || 0;
    const isDeb = amt < 0;
    const absAmt = Math.abs(amt);

    const fullConcepto = item.conceptoParts.join(' ').replace(/\s+/g, ' ').trim();
    // Extract potential reference / voucher
    const refMatch = fullConcepto.match(/\b(\d{7,16})\b/);
    const referencia = refMatch ? refMatch[1] : '';

    movimientos.push({
      id: `galicia-${movimientos.length + 1}`,
      fecha: normalizeDate(item.fecha),
      concepto: fullConcepto,
      referencia,
      debito: isDeb ? absAmt : null,
      credito: !isDeb ? absAmt : null,
      importeNeto: amt,
      saldo: item.saldo,
      banco: bank.name,
      tipoBanco: bank.type,
      cbu,
      cuenta,
      titular,
      cuit
    });
  }

  const metadata: ExtractoMetadata = {
    banco: bank.name,
    tipoBanco: bank.type,
    codigoBanco: bank.code,
    cbu,
    cuenta,
    titular,
    cuit,
    periodo: '',
    moneda: 'ARS',
    saldoInicial,
    saldoFinal: saldoFinal || (movimientos.length > 0 ? movimientos[movimientos.length - 1].saldo : null)
  };

  return { metadata, movimientos };
}
