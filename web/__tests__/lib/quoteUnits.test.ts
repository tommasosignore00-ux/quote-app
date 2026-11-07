/**
 * @jest-environment node
 */
import { quoteLineExtras } from '../../lib/QuoteTemplate';
import {
  displayUnit,
  parseUniversalSpreadsheetRows,
  parseUniversalPdfText,
} from '../../lib/listinoUniversalImport';

describe('units of measure', () => {
  it('prefers the unit saved on the quote line', () => {
    expect(quoteLineExtras({ description: 'Manodopera', unit: 'gg' }).unit).toBe('gg');
    expect(quoteLineExtras({ description: 'Manodopera', unit: ' ' }).unit).toBe('h');
  });

  it('shows units the way quotes write them', () => {
    expect(displayUnit('pcs')).toBe('pz');
    expect(displayUnit('m2')).toBe('m²');
    expect(displayUnit('corpo')).toBe('a corpo');
    expect(displayUnit(null)).toBeNull();
  });

  it('keeps the U.M. column of a price list file', () => {
    const result = parseUniversalSpreadsheetRows([
      ['Descrizione', 'UM', 'Prezzo'],
      ['Tubo multistrato 16', 'mt', '2,40'],
      ['Raccordo a T', 'cad', '1,10'],
      ['Manodopera', 'ore', '35,00'],
    ]);
    expect(result.items.map((i) => i.unit)).toEqual(['m', 'pz', 'h']);
  });

  it('reads units of prezzario price rows', () => {
    const result = parseUniversalPdfText(
      [
        'XX.10.10 Punto luce sottotraccia',
        'XX.10.10.a - Punto luce semplice',
        'Cad 0,70 55,100 % 28,90',
        'XX.10.20.a - Tubo corrugato 20',
        'm 0,10 30,000 % 3,40',
      ].join('\n')
    );
    expect(result.items.map((i) => i.unit)).toEqual(['pz', 'm']);
  });
});
