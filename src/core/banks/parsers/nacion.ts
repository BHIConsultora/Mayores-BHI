import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parseNacionStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '0110566720056602345753';

  let titular = '';
  const titularMatch = text.match(/(?:INGENIERIA Y REPRESENTACIONES BAHIENSES S\.A\.|[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) titular = titularMatch[0].trim();

  let cuenta = '';
  const cuentaMatch = text.match(/NRO\.?\s*CUENTA\s*[:\s]*(\d{5,15})/i);
  if (cuentaMatch) cuenta = cuentaMatch[1];

  let saldoInicial: number | null = null;
  const saldoAntMatch = text.match(/SALDO\s+(?:ANTERIOR)?\s*[:\s]*([\d.,]+)/i);
  if (saldoAntMatch) saldoInicial = parseArgentineAmount(saldoAntMatch[1]);

  let saldoFinal: number | null = null;
  const saldoFinMatch = text.match(/SALDO\s+FINAL\s*[:\s]*([\d.,]+)/i);
  if (saldoFinMatch) saldoFinal = parseArgentineAmount(saldoFinMatch[1]);

  const movimientos: MovimientoBancario[] = [];
  let runningSaldo = saldoInicial;

  const dateRegex = /^(\d{2}\/\d{2}\/\d{2,4})\s+(.+)$/;

  for (const line of lines) {
    if (
      line.includes('FECHA') && line.includes('MOVIMIENTOS') ||
      line.includes('SALDO ANTERIOR') ||
      line.includes('SALDO FINAL') ||
      line.includes('TOTAL GRAV') ||
      line.includes('USTED PUEDE SOLICITAR') ||
      line.includes('BANCO DE LA NACION')
    ) {
      continue;
    }

    const dMatch = line.match(dateRegex);
    if (!dMatch) continue;

    const fecha = dMatch[1];
    const rest = dMatch[2];

    // Look for numbers at the end: [IMPORTE] [SALDO]
    const numMatch = rest.match(/([\d.]+,\d{2})\s+([\d.]+,\d{2})$/);
    if (!numMatch) continue;

    const amt = parseArgentineAmount(numMatch[1]);
    const sld = parseArgentineAmount(numMatch[2]);
    let mainText = rest.slice(0, numMatch.index).trim();

    if (amt === null) continue;

    // Split comprobante if at end of mainText (digits like 37188684 or 3417701)
    let comprobante = '';
    const compMatch = mainText.match(/\s+(\d{6,10})$/);
    if (compMatch) {
      comprobante = compMatch[1];
      mainText = mainText.slice(0, compMatch.index).trim();
    }

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
    } else {
      const isCredit = mainText.toUpperCase().includes('CRED') || mainText.toUpperCase().includes('DEPOSITO');
      if (isCredit) {
        credito = amt;
        neto = amt;
      } else {
        debito = amt;
        neto = -amt;
      }
    }

    if (sld !== null) runningSaldo = sld;

    movimientos.push({
      id: `nacion-${movimientos.length + 1}`,
      fecha: normalizeDate(fecha),
      concepto: mainText.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim(),
      referencia: comprobante,
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
