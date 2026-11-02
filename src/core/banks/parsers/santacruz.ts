import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parseSantaCruzStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '0860001101800043220772';

  let titular = '';
  const titularMatch = text.match(/(?:SSSERVICIOS SAS|[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) titular = titularMatch[0].trim();

  let cuenta = '';
  const cuentaMatch = text.match(/CUENTA CORRIENTE\s*([0-9\/\-]+)/i);
  if (cuentaMatch) cuenta = cuentaMatch[1];

  let saldoInicial: number | null = null;
  const saldoAntMatch = text.match(/SALDO\s+(?:DEL\s+)?PERIODO\s+ANTERIOR\s+([\d.,]+)/i);
  if (saldoAntMatch) saldoInicial = parseArgentineAmount(saldoAntMatch[1]);

  const movimientos: MovimientoBancario[] = [];
  let runningSaldo = saldoInicial;

  const dateRegex = /^(\d{2}\/\d{2}\/\d{2,4})\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.includes('Fecha Concepto Debito Credito Saldo') ||
      line.includes('SALDO DEL PERIODO ANTERIOR') ||
      line.includes('SUBTOTAL') ||
      line.includes('T R A N S P O R T E') ||
      line.includes('Avda. Pte Dr. Néstor C. Kirchner') ||
      line.includes('DETALLE DE LAS CUENTAS')
    ) {
      continue;
    }

    const dMatch = line.match(dateRegex);
    if (!dMatch) continue;

    const fecha = dMatch[1];
    const rest = dMatch[2];

    // Numbers at end: "[IMPORTE] [SALDO]"
    const numMatch = rest.match(/([\d.]+,\d{2})\s+([\d.]+,\d{2})$/);
    if (!numMatch) continue;

    const amt = parseArgentineAmount(numMatch[1]);
    const sld = parseArgentineAmount(numMatch[2]);
    let concepto = rest.slice(0, numMatch.index).trim();

    // Check if next line is a subline (like "VAR-SSSERVICIOS SAS 30715863452")
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (!nextLine.match(dateRegex) && !nextLine.includes('SUBTOTAL') && !nextLine.includes('Hoja:')) {
        concepto += ' - ' + nextLine;
        i++;
      }
    }

    if (amt === null) continue;

    // Reconciliation by delta
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
      const isCredit = concepto.toLowerCase().includes('cred') || concepto.toLowerCase().includes('deposito');
      if (isCredit) {
        credito = amt;
        neto = amt;
      } else {
        debito = amt;
        neto = -amt;
      }
    }

    if (sld !== null) runningSaldo = sld;

    const refMatch = concepto.match(/NRO\.?\s*(\d{6,14})/i);
    const referencia = refMatch ? refMatch[1] : '';

    movimientos.push({
      id: `santacruz-${movimientos.length + 1}`,
      fecha: normalizeDate(fecha),
      concepto,
      referencia,
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
