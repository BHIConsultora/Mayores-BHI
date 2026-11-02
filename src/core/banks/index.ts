import { BankDefinition, ExtractoBancarioResult } from './types';
import { ALL_BANKS, getBankByCode, getBankById, detectBankFromCBU, detectBankFromKeywords, BANK_REGISTRY } from './registry';
import { BankParserContext, BankParserOutput, computeTotales } from './parsers/base';
import { parseGaliciaStatement } from './parsers/galicia';
import { parseBBVAStatement } from './parsers/bbva';
import { parseSantanderStatement } from './parsers/santander';
import { parseCredicoopStatement } from './parsers/credicoop';
import { parseICBCStatement } from './parsers/icbc';
import { parseSantaCruzStatement } from './parsers/santacruz';
import { parseNacionStatement } from './parsers/nacion';
import { parsePatagoniaStatement } from './parsers/patagonia';
import { parseBAPROStatement } from './parsers/bapro';
import { parseBPNStatement } from './parsers/bpn';
import { parseBalanzStatement } from './parsers/balanz';
import { parseGenericStatement } from './parsers/generic';

export * from './types';
export * from './registry';

export interface ProcessPdfOptions {
  selectedBankId?: string; // Optional user-chosen bank ID (e.g. 'santander')
  forcedCBU?: string;
}

export function parseBankStatementText(
  fullText: string,
  pages: { text: string; num: number }[],
  options: ProcessPdfOptions = {}
): ExtractoBancarioResult {
  // 1. Detect CBU and Bank
  const { bank: detectedBankFromCbu, cbu: detectedCbu } = detectBankFromCBU(fullText);
  const keywordBank = detectBankFromKeywords(fullText);

  let selectedBank: BankDefinition;

  if (options.selectedBankId && options.selectedBankId !== 'auto') {
    const userBank = getBankById(options.selectedBankId) || getBankByCode(options.selectedBankId);
    selectedBank = userBank || detectedBankFromCbu || keywordBank || {
      code: '000',
      id: 'generic',
      name: 'Banco General / No Especificado',
      shortName: 'General',
      type: 'Entidad Financiera'
    };
  } else {
    selectedBank = detectedBankFromCbu || keywordBank || {
      code: '000',
      id: 'generic',
      name: 'Banco General / No Especificado',
      shortName: 'General',
      type: 'Entidad Financiera'
    };
  }

  const cbu = options.forcedCBU || detectedCbu || '';

  const ctx: BankParserContext = {
    text: fullText,
    pages,
    bank: selectedBank,
    cbuDetected: cbu
  };

  // 2. Select parser based on bank ID or code
  let parsed: BankParserOutput;
  let parserUsado = selectedBank.id;

  switch (selectedBank.id) {
    case 'galicia':
      parsed = parseGaliciaStatement(ctx);
      break;
    case 'bbva':
      parsed = parseBBVAStatement(ctx);
      break;
    case 'santander':
      parsed = parseSantanderStatement(ctx);
      break;
    case 'credicoop':
      parsed = parseCredicoopStatement(ctx);
      break;
    case 'icbc':
      parsed = parseICBCStatement(ctx);
      break;
    case 'santacruz':
      parsed = parseSantaCruzStatement(ctx);
      break;
    case 'nacion':
      parsed = parseNacionStatement(ctx);
      break;
    case 'patagonia':
      parsed = parsePatagoniaStatement(ctx);
      break;
    case 'bapro':
      parsed = parseBAPROStatement(ctx);
      break;
    case 'bpn':
      parsed = parseBPNStatement(ctx);
      break;
    case 'balanz':
      parsed = parseBalanzStatement(ctx);
      break;
    default:
      parsed = parseGenericStatement(ctx);
      parserUsado = 'generic';
      break;
  }

  // 3. Ensure metadata preserves the detected CBU and correct bank name/type
  if (cbu && !parsed.metadata.cbu) {
    parsed.metadata.cbu = cbu;
  }
  parsed.metadata.banco = selectedBank.name;
  parsed.metadata.tipoBanco = selectedBank.type;
  parsed.metadata.codigoBanco = selectedBank.code;

  for (const mov of parsed.movimientos) {
    if (!mov.cbu && cbu) mov.cbu = cbu;
    if (!mov.banco) mov.banco = selectedBank.name;
    if (!mov.tipoBanco) mov.tipoBanco = selectedBank.type;
  }

  // 4. Compute totals
  const totales = computeTotales(
    parsed.movimientos,
    parsed.metadata.saldoInicial,
    parsed.metadata.saldoFinal
  );

  return {
    metadata: parsed.metadata,
    movimientos: parsed.movimientos,
    totales,
    paginas: pages.length,
    textoLongitud: fullText.length,
    parserUsado,
    customColumns: parsed.customColumns,
    tableRows: parsed.tableRows
  };
}
