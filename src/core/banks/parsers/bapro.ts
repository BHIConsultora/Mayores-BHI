import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parseBAPROStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '0140479501622805063177';

  let titular = '';
  const titularMatch = text.match(/(?:INGENIERIA Y REPRESENTACIONES BAHIENSES SA|[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) titular = titularMatch[0].trim();

  let cuenta = '';
  const cuentaMatch = text.match(/(?:050631\/7|\b\d{5,8}\/\d\b)/);
  if (cuentaMatch) cuenta = cuentaMatch[0];

  let saldoInicial: number | null = null;
  const saldoAntMatch = text.match(/SALDO\s+ANTERIOR\s+([\d.,]+)/i);
  if (saldoAntMatch) saldoInicial = parseArgentineAmount(saldoAntMatch[1]);

  const movimientos: MovimientoBancario[] = [];

  const dateRegex = /^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/;
  const amountsRegex = /(-?[\d.]+)\s+(\d{2}-\d{2})\s+([\d.]+)$/;

  let current: {
    fecha: string;
    conceptoParts: string[];
    amount: number | null;
    saldo: number | null;
    fValor?: string;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.includes('Fecha Concepto Fecha Valor') ||
      line.includes('Extracto de Cuenta Informativo') ||
      line.includes('SALDO ANTERIOR') ||
      line.includes('Emitido el') ||
      line.includes('Frecuencia')
    ) {
      continue;
    }

    // Check if line has both start date and amounts in a single line
    // e.g. "01/04/2026 CHEQUE DE CAMARA 009235042 -5174370.00 01-04 50801295.36"
    const dMatch = line.match(dateRegex);
    if (dMatch) {
      if (current && current.amount !== null) pushMov(current);

      const rest = dMatch[2];
      const inlineAmounts = rest.match(amountsRegex);

      if (inlineAmounts) {
        current = null;
        const amt = parseArgentineAmount(inlineAmounts[1]);
        const sld = parseArgentineAmount(inlineAmounts[3]);
        const conc = rest.slice(0, inlineAmounts.index).trim();
        pushDirect(dMatch[1], conc, amt, sld, inlineAmounts[2]);
        continue;
      } else {
        current = {
          fecha: dMatch[1],
          conceptoParts: [rest],
          amount: null,
          saldo: null
        };
        continue;
      }
    }

    // Check if subline has amounts: e.g. "-31046.22 01-04 50770249.14"
    if (current) {
      const endAmounts = line.match(amountsRegex);
      if (endAmounts) {
        current.amount = parseArgentineAmount(endAmounts[1]);
        current.saldo = parseArgentineAmount(endAmounts[3]);
        current.fValor = endAmounts[2];
        const prefix = line.slice(0, endAmounts.index).trim();
        if (prefix) current.conceptoParts.push(prefix);
        pushMov(current);
        current = null;
      } else {
        current.conceptoParts.push(line);
      }
    }
  }

  if (current && current.amount !== null) {
    pushMov(current);
  }

  function pushDirect(fecha: string, conc: string, amt: number | null, sld: number | null, fVal?: string) {
    const val = amt || 0;
    const isDeb = val < 0;
    const absVal = Math.abs(val);

    const refMatch = conc.match(/(?:NRO:?|REF\.?)\s*(\d{6,16})/i);
    const referencia = refMatch ? refMatch[1] : (fVal || '');

    movimientos.push({
      id: `bapro-${movimientos.length + 1}`,
      fecha: normalizeDate(fecha),
      concepto: conc,
      referencia,
      debito: isDeb ? absVal : null,
      credito: !isDeb ? absVal : null,
      importeNeto: val,
      saldo: sld,
      banco: bank.name,
      tipoBanco: bank.type,
      cbu,
      cuenta,
      titular,
      cuit
    });
  }

  function pushMov(item: NonNullable<typeof current>) {
    const val = item.amount || 0;
    const isDeb = val < 0;
    const absVal = Math.abs(val);

    const fullConc = item.conceptoParts.join(' ').replace(/\s+/g, ' ').trim();
    const refMatch = fullConc.match(/(?:NRO:?|REF\.?)\s*(\d{6,16})/i);
    const referencia = refMatch ? refMatch[1] : (item.fValor || '');

    movimientos.push({
      id: `bapro-${movimientos.length + 1}`,
      fecha: normalizeDate(item.fecha),
      concepto: fullConc,
      referencia,
      debito: isDeb ? absVal : null,
      credito: !isDeb ? absVal : null,
      importeNeto: val,
      saldo: item.saldo,
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
