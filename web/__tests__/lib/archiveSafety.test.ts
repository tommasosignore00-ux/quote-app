/**
 * @jest-environment node
 */
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { assertSafeArchive, hasExpectedSignature } from '../../lib/archiveSafety';

describe('archive safety', () => {
  it('reads a real workbook with the pinned parser', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Codice', 'Descrizione', 'Prezzo'],
      ['A1', 'Tubo multistrato 16', 2.5],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Listino');
    const file = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    expect(hasExpectedSignature(file, 'xlsx')).toBe(true);
    await expect(assertSafeArchive(file)).resolves.toBeUndefined();
    const parsed = XLSX.read(file, { type: 'buffer', sheetRows: 10 });
    expect(XLSX.utils.sheet_to_json(parsed.Sheets.Listino)).toEqual([
      { Codice: 'A1', Descrizione: 'Tubo multistrato 16', Prezzo: 2.5 },
    ]);
  });

  it('rejects a file whose content does not match its extension', () => {
    expect(hasExpectedSignature(Buffer.from('<html></html>'), 'xlsx')).toBe(false);
  });

  it('rejects highly compressed entries without inflating them', async () => {
    const zip = new JSZip();
    zip.file('bomb.xml', 'a'.repeat(10 * 1024 * 1024));
    const file = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await expect(assertSafeArchive(file)).rejects.toThrow();
  });
});
