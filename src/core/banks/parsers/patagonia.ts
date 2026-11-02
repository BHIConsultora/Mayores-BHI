import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parsePatagoniaStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '0340287200287004751000';

  let titular = '';
  const titularMatch = text.match(/(?:GACEFA S\.A\.|[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) titular = titularMatch[0].trim();

  let cuenta = '';
  const cuentaMatch = text.match(/CUENTA CORRIENTE EN PESOS\s*([0-9]+)/i);
  if (cuentaMatch) cuenta = cuentaMatch[1];

  let saldoInicial: number | null = null;
  const saldoAntMatch = text.match(/SALDO\s+ANTERIOR\s+([\d.,]+-?)/i);
  if (saldoAntMatch) saldoInicial = parseArgentineAmount(saldoAntMatch[1]);

  let saldoFinal: number | null = null;
  const saldoFinMatch = text.match(/SALDO\s+ACTUAL\s+([\d.,]+-?)/i);
  if (saldoFinMatch) saldoFinal = parseArgentineAmount(saldoFinMatch[1]);

  const movimientos: MovimientoBancario[] = [];
  let runningSaldo = saldoInicial;

  const dateRegex = /^(\d{1,2}\/\d{2}\/\d{2,4})\s+(.+)$/;

  for (const line of lines) {
    if (
      line.includes('FECHA CONCEPTO REFER') ||
      line.includes('SALDO ANTERIOR') ||
      line.includes('SALDO ACTUAL') ||
      line.includes('TRANSFERENCIAS RECIBIDAS') ||
      line.includes('DETALLE - COMISION') ||
      line.includes('SITUACION IMPOSITIVA') ||
      line.includes('Patagonia SINGULAR')
    ) {
      continue;
    }

    const dMatch = line.match(dateRegex);
    if (!dMatch) continue;

    const fecha = dMatch[1];
    const rest = dMatch[2];

    // Numbers at end: "[IMPORTE] [SALDO]" or "[IMPORTE]"
    const twoNumsMatch = rest.match(/([\d.]+,\d{2}-?)\s+([\d.]+,\d{2}-?)$/);
    const oneNumMatch = rest.match(/([\d.]+,\d{2}-?)$/);

    let amt: number | null = null;
    let sld: number | null = null;
    let mainText = rest;

    if (twoNumsMatch) {
      amt = parseArgentineAmount(twoNumsMatch[1]);
      sld = parseArgentineAmount(twoNumsMatch[2]);
      mainText = rest.slice(0, twoNumsMatch.index).trim();
    } else if (oneNumMatch) {
      amt = parseArgentineAmount(oneNumMatch[1]);
      mainText = rest.slice(0, oneNumMatch.index).trim();
    }

    if (amt === null) continue;

    let debito: number | null = null;
    let credito: number | null = null;
    let neto = amt;

    const lower = mainText.toLowerCase();
    const isCredit = lower.includes('transferencia entre cuentas') || lower.includes('deposito') || lower.includes('cred');

    if (runningSaldo !== null && sld !== null) {
      const delta = Math.round((sld - runningSaldo) * 100) / 100;
      if (delta < 0) {
        debito = Math.abs(amt);
        neto = -debito;
      } else {
        credito = Math.abs(amt);
        neto = credito;
      }
    } else if (isCredit) {
      credito = amt;
      neto = amt;
    } else {
      debito = amt;
      neto = -amt;
    }

    if (sld !== null) {
      runningSaldo = sld;
    } else if (runningSaldo !== null) {
      runningSaldo = Math.round((runningSaldo + neto) * 100) / 100;
      sld = runningSaldo;
    }

    movimientos.push({
      id: `patagonia-${movimientos.length + 1}`,
      fecha: normalizeDate(fecha),
      concepto: mainText,
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
