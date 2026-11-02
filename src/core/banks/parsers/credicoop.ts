import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parseCredicoopStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '1910130155013000237664';

  let titular = '';
  const titularMatch = text.match(/(?:TECNOSTORE SA|[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) titular = titularMatch[0].trim();

  let cuenta = '';
  const cuentaMatch = text.match(/Cta\.?\s*([0-9\.]+)/i);
  if (cuentaMatch) cuenta = cuentaMatch[1];

  let saldoInicial: number | null = null;
  const saldoAntMatch = text.match(/SALDO\s+ANTERIOR\s+([\d.,]+)/i);
  if (saldoAntMatch) saldoInicial = parseArgentineAmount(saldoAntMatch[1]);

  const movimientos: MovimientoBancario[] = [];
  let runningSaldo = saldoInicial;

  const dateRegex = /^(\d{2}\/\d{2}\/\d{2,4})\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.includes('FECHA COMBTE DESCRIPCION') ||
      line.includes('PAGINA ') ||
      line.includes('VIENE DE PAGINA') ||
      line.includes('Debito directo − CBU') ||
      line.includes('SALDO ANTERIOR')
    ) {
      continue;
    }

    const dMatch = line.match(dateRegex);
    if (!dMatch) continue;

    const fecha = dMatch[1];
    const rest = dMatch[2];

    // Check for 2 numbers at the end (amount & saldo) or 1 number (amount)
    // Numbers look like: "45.177,50 18.232.800,00" or "43.469,30"
    const twoNumsMatch = rest.match(/([\d.]+,\d{2})\s+([\d.]+,\d{2})$/);
    const oneNumMatch = rest.match(/([\d.]+,\d{2})$/);

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

    // Split mainText into optional comprobante (digits) and description
    const compMatch = mainText.match(/^(\d{4,8})\s+(.+)$/);
    let comprobante = '';
    let concepto = mainText;
    if (compMatch) {
      comprobante = compMatch[1];
      concepto = compMatch[2];
    }

    // Determine debito vs credito
    let debito: number | null = null;
    let credito: number | null = null;
    let neto = amt;

    const lowerConcept = concepto.toLowerCase();
    const isExplicitCredit =
      lowerConcept.includes('transf. interbanking e/ cuentas propias') ||
      lowerConcept.includes('transf.inmediata e/ctas.dist tit') ||
      lowerConcept.includes('deposito') ||
      lowerConcept.includes('acreditacion') ||
      lowerConcept.includes('plazo fijo');

    const isExplicitDebit =
      lowerConcept.includes('debito') ||
      lowerConcept.includes('sircreb') ||
      lowerConcept.includes('servicio') ||
      lowerConcept.includes('i.v.a.') ||
      lowerConcept.includes('comision') ||
      lowerConcept.includes('impuesto') ||
      lowerConcept.includes('compra local');

    if (runningSaldo !== null && sld !== null) {
      const delta = Math.round((sld - runningSaldo) * 100) / 100;
      if (delta < 0) {
        debito = Math.abs(amt);
        neto = -debito;
      } else {
        credito = Math.abs(amt);
        neto = credito;
      }
    } else if (isExplicitCredit && !isExplicitDebit) {
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
      id: `credicoop-${movimientos.length + 1}`,
      fecha: normalizeDate(fecha),
      concepto: concepto.trim(),
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
