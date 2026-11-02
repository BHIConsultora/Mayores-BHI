import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';
import { parseBankStatementText } from './index';
import { generateBankExcelWorkbook } from '../../lib/excel/bank-exporter';

const SAMPLES_DIR = 'c:\\Users\\Usuario\\Desktop\\EJERMPLO RESUMENES BANCARIOS';

describe('Bank Statements Conversion to Excel & JSON', () => {
  const files = fs.existsSync(SAMPLES_DIR)
    ? fs.readdirSync(SAMPLES_DIR).filter(f => f.toLowerCase().endsWith('.pdf'))
    : [];

  it('found sample PDF files in user directory', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  for (const filename of files) {
    it(`should parse and convert ${filename} cleanly to JSON and Excel`, async () => {
      const filePath = path.join(SAMPLES_DIR, filename);
      const buffer = fs.readFileSync(filePath);

      const parser = new PDFParse(new Uint8Array(buffer));
      const parsed = await parser.getText();
      const pages = (parsed.pages || []).map((p: any, idx: number) => ({
        text: p.text || '',
        num: p.num || idx + 1
      }));

      const result = parseBankStatementText(parsed.text, pages, { selectedBankId: 'auto' });

      // Verifications
      expect(result.metadata.banco).toBeTruthy();
      expect(result.metadata.cbu).toBeTruthy();
      expect(result.metadata.cbu.length).toBe(22);
      expect(result.movimientos.length).toBeGreaterThan(0);

      // Verify each movement has valid required fields
      for (const m of result.movimientos.slice(0, 10)) {
        expect(m.fecha).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        expect(m.banco).toBe(result.metadata.banco);
        expect(m.cbu).toBe(result.metadata.cbu);
        expect(typeof m.importeNeto).toBe('number');
      }

      // Verify Excel generation
      const wb = generateBankExcelWorkbook(result);
      expect(wb.SheetNames).toContain('Movimientos');
      expect(wb.SheetNames).toContain('Resumen y Conciliación');

      console.log(`[PASS] ${filename.padEnd(38)} | Movs: ${String(result.movimientos.length).padStart(4)} | Banco: ${result.metadata.banco} | CBU: ${result.metadata.cbu}`);
    });
  }
});
