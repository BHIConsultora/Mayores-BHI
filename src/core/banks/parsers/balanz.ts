import { BankParserContext, BankParserOutput, parseArgentineAmount, normalizeDate } from './base';
import { MovimientoBancario, ExtractoMetadata } from '../types';

export const BALANZ_COLUMNS = [
  'Descripción',
  'Cant. VN',
  'Saldo',
  'Precio',
  'Bruto',
  'Arancel Impor.',
  'IVA Impor.',
  'Derech Impor.',
  'IVA',
  'Neto',
  'Fecha Co.',
  'Fecha Li.'
];

interface ColBoundary {
  name: string;
  minX: number;
  maxX: number;
}

function getPageColumns(items: { str: string; x: number; y: number }[]): { headerY: number; bounds: ColBoundary[] } | null {
  let descItem = items.find(i => i.str.indexOf('Descripción') !== -1);
  if (!descItem) return null;
  const headerY = descItem.y;
  const headerItems = items.filter(i => Math.abs(i.y - headerY) < 14 && i.str.trim());
  headerItems.sort((a, b) => a.x - b.x);

  const pos: Record<string, number> = {};
  for (const it of headerItems) {
    const s = it.str;
    const x = it.x;
    if (s.indexOf('Descripción') !== -1 && pos['Descripción'] === undefined) pos['Descripción'] = x;
    else if (s.indexOf('Cant. VN') !== -1 && pos['Cant. VN'] === undefined) pos['Cant. VN'] = x;
    else if (s.indexOf('Saldo') !== -1 && pos['Saldo'] === undefined) pos['Saldo'] = x;
    else if (s.indexOf('Precio') !== -1 && pos['Precio'] === undefined) pos['Precio'] = x;
    else if (s.indexOf('Bruto') !== -1 && pos['Bruto'] === undefined) pos['Bruto'] = x;
    else if (s.indexOf('Arancel') !== -1 && pos['Arancel Impor.'] === undefined) pos['Arancel Impor.'] = x;
    else if (s.indexOf('IVA') !== -1 && pos['IVA Impor.'] === undefined && x < (pos['Derech Impor.'] || 600)) pos['IVA Impor.'] = x;
    else if (s.indexOf('Derech') !== -1 && pos['Derech Impor.'] === undefined) pos['Derech Impor.'] = x;
    else if (s.indexOf('IVA') !== -1 && pos['Derech Impor.'] !== undefined && x > pos['Derech Impor.'] && pos['IVA'] === undefined) pos['IVA'] = x;
    else if (s.indexOf('Neto') !== -1 && pos['Neto'] === undefined) pos['Neto'] = x;
    else if (s.indexOf('Co.') !== -1 || (s.indexOf('Fecha') !== -1 && x < 760)) {
      if (pos['Fecha Co.'] === undefined) pos['Fecha Co.'] = x;
    }
    else if (s.indexOf('Li.') !== -1 || (s.indexOf('Fecha') !== -1 && x >= 760)) {
      if (pos['Fecha Li.'] === undefined) pos['Fecha Li.'] = x;
    }
  }

  const entries: { name: string; x: number }[] = [];
  for (const col of BALANZ_COLUMNS) {
    if (pos[col] !== undefined) {
      entries.push({ name: col, x: pos[col] });
    }
  }
  entries.sort((a, b) => a.x - b.x);

  const bounds: ColBoundary[] = [];
  for (let i = 0; i < entries.length; i++) {
    const minX = i === 0 ? 0 : (entries[i - 1].x + entries[i].x) / 2;
    const maxX = i === entries.length - 1 ? 99999 : (entries[i].x + entries[i + 1].x) / 2;
    bounds.push({ name: entries[i].name, minX, maxX });
  }
  return { headerY, bounds };
}

export function parseBalanzStatement(ctx: BankParserContext): BankParserOutput {
  const { text, pages, bank, cbuDetected } = ctx;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Metadata
  const comitenteMatch = text.match(/Comitente\s*[:\s]*(\d+)\s*\|\s*([^\n\r]+)/i);
  const comitente = comitenteMatch ? comitenteMatch[1].trim() : (cbuDetected || '110272');
  const titular = comitenteMatch ? comitenteMatch[2].trim() : 'SOXPIGUE S.A.';

  const periodoMatch = text.match(/Cuenta Corriente por Concertaci[óo]n del\s*([0-9\/\s]+al[0-9\/\s]+)/i);
  const periodo = periodoMatch ? periodoMatch[1].trim() : '';

  const cuenta = 'Comitente N° ' + comitente;
  const cbu = 'Comitente ' + comitente;

  // 1. Table Extraction (12 columns)
  const rawRows: Record<string, string>[] = [];

  for (const p of pages) {
    if (!p.items || p.items.length === 0) continue;
    const items = p.items.filter(i => i.str && i.str.trim());
    items.sort((a, b) => (Math.abs(a.y - b.y) > 3.5 ? b.y - a.y : a.x - b.x));

    const cols = getPageColumns(items);
    if (!cols) continue;

    const contentItems = items.filter(i => i.y < cols.headerY - 12 && i.y > 25);
    const lineGroups: (typeof items)[] = [];
    let curY: number | null = null;
    let currentLine: typeof items = [];

    for (const it of contentItems) {
      if (curY === null || Math.abs(curY - it.y) <= 3.5) {
        currentLine.push(it);
        curY = it.y;
      } else {
        lineGroups.push(currentLine);
        currentLine = [it];
        curY = it.y;
      }
    }
    if (currentLine.length) lineGroups.push(currentLine);

    for (const line of lineGroups) {
      const row: Record<string, string> = {};
      for (const c of BALANZ_COLUMNS) row[c] = '';

      for (const it of line) {
        let b = cols.bounds.filter(bd => it.x >= bd.minX && it.x < bd.maxX)[0];
        if (!b) continue;

        const parts = it.str.trim().split(/\s+/);
        if (parts.length > 1 && b.name !== 'Descripción') {
          const startColIdx = BALANZ_COLUMNS.indexOf(b.name);
          parts.forEach((part, idx) => {
            const colName = BALANZ_COLUMNS[startColIdx + idx];
            if (colName) row[colName] = part;
          });
        } else {
          row[b.name] = (row[b.name] ? row[b.name] + ' ' : '') + it.str.trim();
        }
      }
      rawRows.push(row);
    }
  }

  // Merge wrapped lines
  const mergedRows: Record<string, string>[] = [];
  let pendingDesc = '';

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    let hasValues = false;
    for (let c = 1; c < BALANZ_COLUMNS.length; c++) {
      if (r[BALANZ_COLUMNS[c]]) {
        hasValues = true;
        break;
      }
    }

    if (!hasValues) {
      const d = r['Descripción'] || '';
      if (
        d.indexOf('Liquidación') === 0 ||
        d.indexOf('Boleto') === 0 ||
        d.indexOf('Transferencia') === 0 ||
        d.indexOf('Amortización') === 0 ||
        d.indexOf('Renta') === 0
      ) {
        pendingDesc = d;
      } else if (pendingDesc) {
        pendingDesc += ' ' + d;
      } else {
        mergedRows.push(r);
      }
    } else {
      if (pendingDesc) {
        r['Descripción'] = (pendingDesc + ' ' + (r['Descripción'] || '')).trim();
        pendingDesc = '';
      }
      let nextIdx = i + 1;
      while (nextIdx < rawRows.length) {
        const nextRow = rawRows[nextIdx];
        let nextHasValues = false;
        for (let c = 1; c < BALANZ_COLUMNS.length; c++) {
          if (nextRow[BALANZ_COLUMNS[c]]) {
            nextHasValues = true;
            break;
          }
        }
        const nextDesc = nextRow['Descripción'] || '';
        if (!nextHasValues && nextDesc.length > 0 && nextDesc.length <= 15 && nextDesc.indexOf('Saldo') !== 0) {
          r['Descripción'] = (r['Descripción'] + ' ' + nextDesc).trim();
          i = nextIdx;
          nextIdx++;
        } else {
          break;
        }
      }
      mergedRows.push(r);
    }
  }

  // 2. Monetary movements fallback for standard summary & reconciliation
  const movimientos: MovimientoBancario[] = [];
  let inMonedas = false;
  let currentMoneda = 'ARS';
  let saldoInicial: number | null = null;
  let saldoFinal: number | null = null;
  let pendingConcept = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.indexOf('Monedas') !== -1) {
      inMonedas = true;
      continue;
    }
    if (!inMonedas) continue;

    if (line.indexOf('Pesos - $') !== -1) {
      currentMoneda = 'ARS';
      continue;
    }
    if (line.indexOf('Dólar MEP') !== -1 || line.indexOf('Dolar MEP') !== -1) {
      currentMoneda = 'USD';
      continue;
    }

    if (line.indexOf('Saldo Anterior') === 0) {
      const parts = line.split(/\s+/);
      const amtStr = parts[parts.length - 1];
      if (saldoInicial === null) {
        saldoInicial = parseArgentineAmount(amtStr);
      }
      continue;
    }

    if (line.indexOf('Saldo al 30/06/2026') === 0 || line.indexOf('Saldo al 30/6/2026') === 0 || line.indexOf('Saldo al 31/') === 0) {
      const parts = line.split(/\s+/);
      const amtStr = parts[parts.length - 1];
      saldoFinal = parseArgentineAmount(amtStr);
      continue;
    }

    const lineMatch = line.match(/(-?[\d.]+,\d{2})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})$/);
    if (lineMatch) {
      const neto = parseArgentineAmount(lineMatch[1]) || 0;
      const fechaLi = lineMatch[3];
      const rawDesc = line.slice(0, lineMatch.index).trim();
      const combinedDesc = pendingConcept ? pendingConcept + ' ' + rawDesc : rawDesc;
      pendingConcept = '';

      const isDeb = neto < 0;
      const absNeto = Math.abs(neto);
      const refMatch = combinedDesc.match(/(?:Boleto|Liquidaci[óo]n de (?:Rescate|Suscripci[óo]n))\s*\/\s*(\d+)/i);
      const referencia = refMatch ? refMatch[1] : '';

      movimientos.push({
        id: 'balanz-' + (movimientos.length + 1),
        fecha: normalizeDate(fechaLi),
        concepto: combinedDesc + ' (' + currentMoneda + ')',
        referencia,
        debito: isDeb ? absNeto : null,
        credito: !isDeb ? absNeto : null,
        importeNeto: neto,
        saldo: null,
        banco: bank.name,
        tipoBanco: bank.type,
        cbu,
        cuenta,
        titular,
        cuit: ''
      });
      continue;
    }

    if (
      line.indexOf('Liquidación') === 0 ||
      line.indexOf('Boleto') === 0 ||
      line.indexOf('Amortización') === 0 ||
      line.indexOf('Renta') === 0
    ) {
      pendingConcept = line;
    }
  }

  const metadata: ExtractoMetadata = {
    banco: bank.name,
    tipoBanco: bank.type,
    codigoBanco: bank.code,
    cbu,
    cuenta,
    titular,
    cuit: '',
    periodo,
    moneda: 'ARS/USD',
    saldoInicial,
    saldoFinal
  };

  return {
    metadata,
    movimientos,
    customColumns: BALANZ_COLUMNS,
    tableRows: mergedRows
  };
}
