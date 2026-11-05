/**
 * @jest-environment node
 */
import { isMetelText, parseMetelText } from '../../lib/listinoMetel';

function metelRow(p: {
  brand?: string;
  code?: string;
  description?: string;
  wholesale?: string;
  publicPrice?: string;
  multiplier?: string;
  unit?: string;
  status?: string;
}) {
  return [
    (p.brand ?? 'BTI').padEnd(3),
    (p.code ?? 'A4C20').padEnd(16),
    '8012199000000',
    (p.description ?? 'INTERRUTTORE 16A').padEnd(43),
    '00010',
    '00001',
    '00001',
    '000000',
    ' ',
    p.wholesale ?? '00000000850',
    p.publicPrice ?? '00000001250',
    p.multiplier ?? '000001',
    'EUR',
    (p.unit ?? 'PZ').padEnd(3),
    '0',
    p.status ?? '3',
    '20250101',
    ''.padEnd(18),
    ''.padEnd(18),
  ].join('');
}

describe('METEL price lists', () => {
  const header = 'LISTINO METEL'.padEnd(20) + 'BTI'.padEnd(155);

  it('builds records of the official length', () => {
    expect(metelRow({})).toHaveLength(177);
  });

  it('detects the format with and without the header record', () => {
    expect(isMetelText([header, metelRow({})].join('\r\n'))).toBe(true);
    expect(isMetelText(Array(5).fill(metelRow({})).join('\n'))).toBe(true);
    expect(isMetelText('Descrizione;Prezzo\nTubo rame;4,20\n')).toBe(false);
  });

  it('reads public price, applies the multiplier and skips obsolete products', () => {
    const result = parseMetelText(
      [
        header,
        metelRow({}),
        metelRow({
          code: 'CAVO1',
          description: 'CAVO FS17 1,5',
          publicPrice: '00000045000',
          multiplier: '000100',
          unit: 'MT',
        }),
        metelRow({ code: 'OLD1', status: '9' }),
        metelRow({ code: 'WHOLE', publicPrice: '00000000000', wholesale: '00000000900' }),
      ].join('\r\n')
    );

    expect(
      result.items.map((i) => [i.description, i.unit_price, i.pricing_basis_unit])
    ).toEqual([
      ['INTERRUTTORE 16A (cod. BTI A4C20)', 12.5, 'pcs'],
      ['CAVO FS17 1,5 (cod. BTI CAVO1)', 4.5, 'm'],
      ['INTERRUTTORE 16A (cod. BTI WHOLE)', 9, 'pcs'],
    ]);
    expect(result.summary.skippedRows).toBe(1);
  });
});
