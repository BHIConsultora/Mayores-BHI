import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT, extractStatementYear } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parseBBVAStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const year = extractStatementYear(text);

  // Metadata
  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '0170272120000001018459';
  
  let titular = '';
  const titularMatch = text.match(/(?:SS SERVICIOS SAS|[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) titular = titularMatch[0].trim();

  let cuenta = '';
  const cuentaMatch = text.match(/CC\s*[\$U\$S]*\s*([0-9\/\-\.]+)/i);
  if (cuentaMatch) cuenta = cuentaMatch[1];

  let saldoInicial: number | null = null;
  const saldoAntMatch = text.match(/SALDO\s+ANTERIOR\s+([\d.,]+)/i);
  if (saldoAntMatch) saldoInicial = parseArgentineAmount(saldoAntMatch[1]);

  const movimientos: MovimientoBancario[] = [];

  // Line regex: "DD/MM [ORIGEN] CONCEPTO [IMPORTE] [SALDO]"
  // e.g.: "02/03 D PAGO CHEQUE 48HS CAP.FED. N 90023178 -374.945,12 10.044.917,41"
  const lineRegex = /^(\d{2}\/\d{2})\s+(?:([A-Z0-9]{1,4})\s+)?(.+?)\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})$/;

  for (const line of lines) {
    if (line.includes('FECHA ORIGEN CONCEPTO') || line.includes('Sobre (') || line.includes('Banco BBVA Argentina')) {
      continue;
    }

    const m = line.match(lineRegex);
    if (m) {
      const amt = parseArgentineAmount(m[4]) || 0;
      const saldo = parseArgentineAmount(m[5]);
      const concepto = m[3].trim();
      const origen = m[2] || '';

      const isDeb = amt < 0;
      const absAmt = Math.abs(amt);

      const refMatch = concepto.match(/\b(N°?\s*\d{6,16}|\d{8,16})\b/i);
      const referencia = refMatch ? refMatch[1] : (origen || '');

      movimientos.push({
        id: `bbva-${movimientos.length + 1}`,
        fecha: normalizeDate(m[1], year),
        concepto,
        referencia,
        debito: isDeb ? absAmt : null,
        credito: !isDeb ? absAmt : null,
        importeNeto: amt,
        saldo,
        banco: bank.name,
        tipoBanco: bank.type,
        cbu,
        cuenta,
        titular,
        cuit
      });
    }
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
