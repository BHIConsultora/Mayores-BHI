import { BankDefinition } from './types';

export const BANK_REGISTRY: Record<string, BankDefinition> = {
  '007': {
    code: '007',
    id: 'galicia',
    name: 'Banco Galicia',
    shortName: 'Galicia',
    type: 'Banco Privado Nacional',
    color: '#F97316'
  },
  '011': {
    code: '011',
    id: 'nacion',
    name: 'Banco de la Nación Argentina',
    shortName: 'Banco Nación',
    type: 'Banco Público Nacional',
    color: '#0284C7'
  },
  '014': {
    code: '014',
    id: 'bapro',
    name: 'Banco Provincia de Buenos Aires (BAPRO)',
    shortName: 'Banco Provincia',
    type: 'Banco Público Provincial',
    color: '#16A34A'
  },
  '015': {
    code: '015',
    id: 'icbc',
    name: 'ICBC Argentina',
    shortName: 'ICBC',
    type: 'Banco Privado Internacional',
    color: '#DC2626'
  },
  '017': {
    code: '017',
    id: 'bbva',
    name: 'BBVA Argentina',
    shortName: 'BBVA',
    type: 'Banco Privado Internacional',
    color: '#1E40AF'
  },
  '020': {
    code: '020',
    id: 'bancor',
    name: 'Banco de Córdoba (BANCOR)',
    shortName: 'Bancor',
    type: 'Banco Público Provincial',
    color: '#2563EB'
  },
  '027': {
    code: '027',
    id: 'supervielle',
    name: 'Banco Supervielle',
    shortName: 'Supervielle',
    type: 'Banco Privado Nacional',
    color: '#DC2626'
  },
  '029': {
    code: '029',
    id: 'ciudad',
    name: 'Banco Ciudad de Buenos Aires',
    shortName: 'Banco Ciudad',
    type: 'Banco Público Municipal',
    color: '#EA580C'
  },
  '034': {
    code: '034',
    id: 'patagonia',
    name: 'Banco Patagonia',
    shortName: 'Patagonia',
    type: 'Banco Privado Nacional',
    color: '#0D9488'
  },
  '072': {
    code: '072',
    id: 'santander',
    name: 'Banco Santander Argentina',
    shortName: 'Santander',
    type: 'Banco Privado Internacional',
    color: '#EF4444'
  },
  '086': {
    code: '086',
    id: 'santacruz',
    name: 'Banco de Santa Cruz',
    shortName: 'Banco Santa Cruz',
    type: 'Banco Mixto / Provincial',
    color: '#059669'
  },
  '097': {
    code: '097',
    id: 'bpn',
    name: 'Banco Provincia del Neuquén (BPN)',
    shortName: 'BPN Neuquén',
    type: 'Banco Público Provincial',
    color: '#0284C7'
  },
  '191': {
    code: '191',
    id: 'credicoop',
    name: 'Banco Credicoop Cooperativo Limitado',
    shortName: 'Credicoop',
    type: 'Banco Cooperativo',
    color: '#D97706'
  },
  '285': {
    code: '285',
    id: 'macro',
    name: 'Banco Macro',
    shortName: 'Macro',
    type: 'Banco Privado Nacional',
    color: '#1E3A8A'
  },
  '000': {
    code: '000',
    id: 'mercadopago',
    name: 'Mercado Pago (CVU)',
    shortName: 'Mercado Pago',
    type: 'PSP / Billetera Virtual',
    color: '#0284C7'
  },
  'BALANZ': {
    code: 'BALANZ',
    id: 'balanz',
    name: 'Balanz Capital Valores S.A.U.',
    shortName: 'Balanz',
    type: 'ALyC / Sociedad de Bolsa',
    color: '#0A2540'
  }
};

export const ALL_BANKS = Object.values(BANK_REGISTRY);

export function getBankByCode(code: string): BankDefinition | undefined {
  return BANK_REGISTRY[code.padStart(3, '0')];
}

export function getBankById(id: string): BankDefinition | undefined {
  return ALL_BANKS.find(b => b.id.toLowerCase() === id.toLowerCase());
}

/**
 * Searches for a 22-digit CBU in text and maps it to a known bank.
 */
export function detectBankFromCBU(text: string): { bank: BankDefinition | null; cbu: string | null } {
  // Regex to look for explicit CBU label
  const labeledRegex = /C\.?B\.?U\.?(?:\s+de\s+su\s+cuenta)?[:\s]+([0-9\s-]{22,30})/i;
  const labeledMatch = text.match(labeledRegex);
  if (labeledMatch) {
    const clean = labeledMatch[1].replace(/[\s-]/g, '');
    if (clean.length === 22) {
      const code = clean.slice(0, 3);
      const bank = BANK_REGISTRY[code] || null;
      return { bank, cbu: clean };
    }
  }

  // Regex for any 22-digit sequence
  const all22 = text.match(/\b\d{22}\b/g);
  if (all22) {
    for (const raw of all22) {
      const code = raw.slice(0, 3);
      if (BANK_REGISTRY[code]) {
        return { bank: BANK_REGISTRY[code], cbu: raw };
      }
    }
    // Return first 22 digits even if bank is unknown
    return { bank: null, cbu: all22[0] };
  }

  // Also check for 8 digits + 14 digits split by space (e.g. "01702721 20000001018459")
  const splitMatch = text.match(/\b(\d{8})\s+(\d{14})\b/);
  if (splitMatch) {
    const combined = splitMatch[1] + splitMatch[2];
    const code = combined.slice(0, 3);
    const bank = BANK_REGISTRY[code] || null;
    return { bank, cbu: combined };
  }

  // Also check for Comitente / Balanz accounts without standard 22-digit banking CBU
  if (text.toUpperCase().includes('BALANZ') || text.includes('Comitente')) {
    const comMatch = text.match(/Comitente\s*[:\s]*(\d+)/i);
    if (comMatch) {
      return { bank: BANK_REGISTRY['BALANZ'], cbu: `Comitente ${comMatch[1]}` };
    }
  }

  return { bank: null, cbu: null };
}

/**
 * Detects bank from text keywords if CBU is absent.
 */
export function detectBankFromKeywords(text: string): BankDefinition | null {
  const upper = text.toUpperCase();
  if (upper.includes('BALANZ')) return BANK_REGISTRY['BALANZ'];
  if (upper.includes('BANCO DE GALICIA') || upper.includes('GALICIA')) return BANK_REGISTRY['007'];
  if (upper.includes('BBVA ARGENTINA') || upper.includes('BANCO BBVA') || upper.includes('BBVA')) return BANK_REGISTRY['017'];
  if (upper.includes('SANTANDER')) return BANK_REGISTRY['072'];
  if (upper.includes('CREDICOOP')) return BANK_REGISTRY['191'];
  if (upper.includes('BANCO DE LA NACION') || upper.includes('BANCO NACION')) return BANK_REGISTRY['011'];
  if (upper.includes('BANCO PROVINCIA DE BUENOS AIRES') || upper.includes('BAPRO')) return BANK_REGISTRY['014'];
  if (upper.includes('INDUSTRIAL AND COMMERCIAL BANK OF CHINA') || upper.includes('ICBC')) return BANK_REGISTRY['015'];
  if (upper.includes('BANCO DE SANTA CRUZ') || upper.includes('SANTA CRUZ')) return BANK_REGISTRY['086'];
  if (upper.includes('BANCO PATAGONIA') || upper.includes('PATAGONIA')) return BANK_REGISTRY['034'];
  if (upper.includes('PROVINCIA DEL NEUQUEN') || upper.includes('BPN')) return BANK_REGISTRY['097'];
  if (upper.includes('BANCO MACRO') || upper.includes('MACRO')) return BANK_REGISTRY['285'];
  return null;
}
