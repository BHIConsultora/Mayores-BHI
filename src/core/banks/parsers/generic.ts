import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT, extractStatementYear, extractAccountNumber } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parseGenericStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const year = extractStatementYear(text);

  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '';
  const cuenta = extractAccountNumber(text);

  let titular = '';
  const titularMatch = text.match(/(?:[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) titular = titularMatch[0].trim();

  let saldoInicial: number | null = null;
  const saldoAntMatch = text.match(/SALDO\s+(?:ANTERIOR|INICIAL)[^\d]+([\d.,]+-?)/i);
  if (saldoAntMatch) saldoInicial = parseArgentineAmount(saldoAntMatch[1]);

  const movimientos: MovimientoBancario[] = [];
  let runningSaldo = saldoInicial;

  const dateRegex = /^(\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?)\s+(.+)$/;

  for (const line of lines) {
    const dMatch = line.match(dateRegex);
    if (!dMatch) continue;

    const fecha = dMatch[1];
    const rest = dMatch[2];

    // Try finding amounts at the end:
    // e.g. "CONCEPTO -1234,56 45000,00" or "CONCEPTO 1234,56"
    const twoNumsMatch = rest.match(/(-?[\d.]+,\d{2}-?)\s+(-?[\d.]+,\d{2}-?)$/);
    const oneNumMatch = rest.match(/(-?[\d.]+,\d{2}-?)$/);

    let amt: number | null = null;
    let sld: number | null = null;
    let concepto = rest;

    if (twoNumsMatch) {
      amt = parseArgentineAmount(twoNumsMatch[1]);
      sld = parseArgentineAmount(twoNumsMatch[2]);
      concepto = rest.slice(0, twoNumsMatch.index).trim();
    } else if (oneNumMatch) {
      amt = parseArgentineAmount(oneNumMatch[1]);
      concepto = rest.slice(0, oneNumMatch.index).trim();
    }

    if (amt === null) continue;

    let debito: number | null = null;
    let credito: number | null = null;
    let neto = amt;

    if (runningSaldo !== null && sld !== null) {
      const delta = Math.round((sld - runningSaldo) * 100) / 100;
      if (delta < 0) {
        debito = Math.abs(amt);
        neto = -debito;
      } else {
        credito = Math.abs(amt);
        neto = credito;
      }
    } else if (amt < 0) {
      debito = Math.abs(amt);
      neto = amt;
    } else {
      credito = amt;
      neto = amt;
    }

    if (sld !== null) {
      runningSaldo = sld;
    } else if (runningSaldo !== null) {
      runningSaldo = Math.round((runningSaldo + neto) * 100) / 100;
      sld = runningSaldo;
    }

    movimientos.push({
      id: `gen-${movimientos.length + 1}`,
      fecha: normalizeDate(fecha, year),
      concepto,
      referencia: '',
      debito,
      credito,
      importeNeto: neto,
      saldo: sld,
      banco: bank.name,
      tipoBanco: bank.type,
      cbu,
      cuenta,
      titular,
      cuit
    });
  }

  const saldoFinal = movimientos.length > 0 ? movimientos[movimientos.length - 1].saldo : null;

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
    saldoFinal
  };

  return { metadata, movimientos };
}
