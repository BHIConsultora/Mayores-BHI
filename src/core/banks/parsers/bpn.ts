import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parseBPNStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '0970026010008544980021';

  let titular = '';
  const titularMatch = text.match(/(?:GRUPO MASUR SA|[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) titular = titularMatch[0].trim();

  let cuenta = '';
  const cuentaMatch = text.match(/Cuenta Nro:\s*([0-9\/\s]+)/i) || text.match(/(\d{6}\s*\/\s*\d)/);
  if (cuentaMatch) cuenta = cuentaMatch[1].trim();

  let saldoInicial: number | null = null;
  const saldoAntMatch = text.match(/Saldo anterior:\s*([\d.,]+)/i);
  if (saldoAntMatch) saldoInicial = parseArgentineAmount(saldoAntMatch[1]);

  let saldoFinal: number | null = null;
  const saldoFinMatch = text.match(/Total\s+([\d.,-]+)/i);
  if (saldoFinMatch) saldoFinal = parseArgentineAmount(saldoFinMatch[1]);

  const movimientos: MovimientoBancario[] = [];

  // Line format: "DD/MM/YY [IMPORTE] [SALDO] [DETALLE] [Db/Cr] [TRANS] [REF]"
  // e.g.: "31/07/26 40.85 24,295.64 INTERES SDOS.DEU.SIN ACUERDO Db 97 13583 10"
  const lineRegex = /^(\d{2}\/\d{2}\/\d{2,4})\s+([\d.,]+)\s+([\d.,-]+)\s+(.+?)(?:\s+(Db|Cr))?(?:\s+\d+\s+\d+)?$/i;

  for (const line of lines) {
    if (
      line.includes('Fecha Detalle Db/Cr') ||
      line.includes('Saldo anterior:') ||
      line.includes('Sobregiro formal') ||
      line.includes('Total -') ||
      line.includes('Página:')
    ) {
      continue;
    }

    const m = line.match(lineRegex);
    if (m) {
      const fecha = m[1];
      const amt = parseArgentineAmount(m[2]) || 0;
      const sld = parseArgentineAmount(m[3]);
      const detalle = m[4].trim();
      const indicator = (m[5] || '').toUpperCase();

      const isDeb = indicator === 'DB' || detalle.toLowerCase().includes('debito') || detalle.toLowerCase().includes('interes') || detalle.toLowerCase().includes('impuesto') || detalle.toLowerCase().includes('comis');
      const debito = isDeb ? amt : null;
      const credito = !isDeb ? amt : null;
      const importeNeto = isDeb ? -amt : amt;

      movimientos.push({
        id: `bpn-${movimientos.length + 1}`,
        fecha: normalizeDate(fecha),
        concepto: detalle,
        referencia: '',
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
