import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate, extractCUIT } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export function parseSantanderStatement(ctx: BankParserContext): BankParserOutput {
  const { text, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const cuit = extractCUIT(text);
  const cbu = cbuDetected || '0720553820000000684686';

  let titular = '';
  const titularMatch = text.match(/(?:SSSERVICIOS SAS|[A-Z\s]{4,40}\s+(?:SA|SRL|SAS|S\.A\.|S\.R\.L\.|S\.A\.S\.))/i);
  if (titularMatch) titular = titularMatch[0].trim();

  let cuenta = '';
  const cuentaMatch = text.match(/Cuenta Corriente Nº\s*([0-9\/\-\.]+)/i);
  if (cuentaMatch) cuenta = cuentaMatch[1];

  let saldoInicial: number | null = null;
  const saldoIniMatch = text.match(/Saldo Inicial\s*[\$U\$S]*\s*([\d.,]+)/i);
  if (saldoIniMatch) saldoInicial = parseArgentineAmount(saldoIniMatch[1]);

  const movimientos: MovimientoBancario[] = [];
  let runningSaldo = saldoInicial;

  let current: {
    fecha: string;
    comprobante?: string;
    conceptoParts: string[];
    amount: number | null;
    saldo: number | null;
  } | null = null;

  const startRegex = /^(\d{2}\/\d{2}\/\d{2,4})\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.includes('Fecha Comprobante Movimiento') ||
      line.includes('Banco Santander Argentina') ||
      line.includes('Saldo Inicial') ||
      line.includes('Saldo total')
    ) {
      continue;
    }

    // Case 1: Line has single-line movement with "$ IMPORTE $ SALDO"
    const singleMatch = line.match(/^(\d{2}\/\d{2}\/\d{2,4})\s+(.+?)\s+\$\s*([\d.]+,\d{2})\s+\$\s*([\d.]+,\d{2})$/);
    if (singleMatch) {
      if (current && current.amount !== null) pushMov(current);
      current = null;
      const amt = parseArgentineAmount(singleMatch[3]) || 0;
      const sld = parseArgentineAmount(singleMatch[4]);
      pushDirect(singleMatch[1], singleMatch[2], amt, sld);
      continue;
    }

    // Case 2: Line has amounts for multiline item "$ IMPORTE $ SALDO"
    const amountsMatch = line.match(/\$\s*([\d.]+,\d{2})\s+\$\s*([\d.]+,\d{2})/);
    if (amountsMatch && current) {
      current.amount = parseArgentineAmount(amountsMatch[1]);
      current.saldo = parseArgentineAmount(amountsMatch[2]);
      const prefix = line.slice(0, amountsMatch.index).trim();
      if (prefix) current.conceptoParts.push(prefix);
      pushMov(current);
      current = null;
      continue;
    }

    // Case 3: New movement start "DD/MM/YY ..."
    const dMatch = line.match(startRegex);
    if (dMatch) {
      if (current && current.amount !== null) pushMov(current);
      
      const words = dMatch[2].split(/\s+/);
      let comp = '';
      let restConcept = dMatch[2];
      if (/^\d{5,8}$/.test(words[0])) {
        comp = words[0];
        restConcept = words.slice(1).join(' ');
      }

      current = {
        fecha: dMatch[1],
        comprobante: comp,
        conceptoParts: [restConcept],
        amount: null,
        saldo: null
      };
      continue;
    }

    // Extra description line
    if (current) {
      current.conceptoParts.push(line);
    }
  }

  if (current && current.amount !== null) {
    pushMov(current);
  }

  function pushDirect(fecha: string, concepto: string, amt: number, sld: number | null) {
    let debito: number | null = null;
    let credito: number | null = null;
    let neto = amt;

    // Use running saldo delta to determine debito vs credito
    if (runningSaldo !== null && sld !== null) {
      const delta = Math.round((sld - runningSaldo) * 100) / 100;
      if (delta < 0) {
        debito = Math.abs(delta);
        neto = -debito;
      } else {
        credito = delta;
        neto = credito;
      }
    } else {
      // Santander debit indicator in text
      if (concepto.toLowerCase().includes('debito') || concepto.toLowerCase().includes('comision') || concepto.toLowerCase().includes('iva') || concepto.toLowerCase().includes('prestamo')) {
        debito = amt;
        neto = -amt;
      } else {
        credito = amt;
        neto = amt;
      }
    }

    if (sld !== null) runningSaldo = sld;

    movimientos.push({
      id: `santander-${movimientos.length + 1}`,
      fecha: normalizeDate(fecha),
      concepto: concepto.trim(),
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

  function pushMov(item: NonNullable<typeof current>) {
    const amt = item.amount || 0;
    const sld = item.saldo;
    let debito: number | null = null;
    let credito: number | null = null;
    let neto = amt;

    if (runningSaldo !== null && sld !== null) {
      const delta = Math.round((sld - runningSaldo) * 100) / 100;
      if (delta < 0) {
        debito = Math.abs(delta);
        neto = -debito;
      } else {
        credito = delta;
        neto = credito;
      }
    } else {
      const desc = item.conceptoParts.join(' ').toLowerCase();
      if (desc.includes('debito') || desc.includes('comision') || desc.includes('iva') || desc.includes('prestamo')) {
        debito = amt;
        neto = -amt;
      } else {
        credito = amt;
        neto = amt;
      }
    }

    if (sld !== null) runningSaldo = sld;

    movimientos.push({
      id: `santander-${movimientos.length + 1}`,
      fecha: normalizeDate(item.fecha),
      concepto: item.conceptoParts.join(' ').trim(),
      referencia: item.comprobante || '',
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
