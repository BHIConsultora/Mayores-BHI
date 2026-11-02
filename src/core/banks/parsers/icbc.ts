import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT, extractStatementYear } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parseICBCStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const year = extractStatementYear(text);

  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '0150539902000104888052';

  let titular = '';
  const titularMatch = text.match(/(?:INGENIERIA Y REPRESENTACIONES BAHIENSES|[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) titular = titularMatch[0].trim();

  let cuenta = '';
  const cuentaMatch = text.match(/N°\s*(\d+\/\d+\/\d+)/i);
  if (cuentaMatch) cuenta = cuentaMatch[1];

  let saldoInicial: number | null = null;
  const saldoAntMatch = text.match(/SALDO\s+ULTIMO\s+EXTRACTO[^\d]+([\d.,]+)/i);
  if (saldoAntMatch) saldoInicial = parseArgentineAmount(saldoAntMatch[1]);

  let saldoFinal: number | null = null;
  const saldoFinMatch = text.match(/SALDO\s+FINAL[^\d]+([\d.,]+)/i);
  if (saldoFinMatch) saldoFinal = parseArgentineAmount(saldoFinMatch[1]);

  const movimientos: MovimientoBancario[] = [];
  let runningSaldo = saldoInicial;

  const dateRegex = /^(\d{2}[-/]\d{2})\s+(.+)$/;

  for (const line of lines) {
    if (
      line.includes('FECHA CONCEPTO F.VALOR') ||
      line.includes('SALDO ULTIMO EXTRACTO') ||
      line.includes('TOT.IMP.LEY') ||
      line.includes('Industrial and Commercial Bank')
    ) {
      continue;
    }

    const dMatch = line.match(dateRegex);
    if (!dMatch) continue;

    const fecha = dMatch[1];
    const rest = dMatch[2];

    // Detect amounts at the end: e.g. "43.000,00-" or "2.150,00- 441.974,68" or "4.400.000,00 4.841.641,86"
    const amountsRegex = /(-?[\d.]+,\d{2}-?)(?:\s+(-?[\d.]+,\d{2}-?))?$/;
    const aMatch = rest.match(amountsRegex);
    if (!aMatch) continue;

    let amt: number | null = null;
    let sld: number | null = null;
    const mainText = rest.slice(0, aMatch.index).trim();

    if (aMatch[2]) {
      amt = parseArgentineAmount(aMatch[1]);
      sld = parseArgentineAmount(aMatch[2]);
    } else {
      amt = parseArgentineAmount(aMatch[1]);
    }

    if (amt === null) continue;

    const isDeb = amt < 0 || aMatch[1].endsWith('-');
    const debito = isDeb ? Math.abs(amt) : null;
    const credito = !isDeb ? Math.abs(amt) : null;
    const importeNeto = isDeb ? -Math.abs(amt) : Math.abs(amt);

    if (sld !== null) {
      runningSaldo = sld;
    } else if (runningSaldo !== null) {
      runningSaldo = Math.round((runningSaldo + importeNeto) * 100) / 100;
      sld = runningSaldo;
    }

    // Extract reference if present (like "VISA096079365" or "0171 LINK")
    const refMatch = mainText.match(/\b([A-Z]{3,6}\d{6,14}|\d{4,8})\b/);
    const referencia = refMatch ? refMatch[1] : '';

    movimientos.push({
      id: `icbc-${movimientos.length + 1}`,
      fecha: normalizeDate(fecha, year),
      concepto: mainText,
      referencia,
      debito,
      credito,
      importeNeto,
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
