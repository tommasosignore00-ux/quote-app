/**
 * @jest-environment node
 */
import {
  parseUniversalCsvText,
  parseUniversalPdfText,
  parseUniversalSpreadsheetRows,
  parseLocalizedNumber,
} from '../../lib/listinoUniversalImport';

describe('parseLocalizedNumber', () => {
  it.each([
    ['12,50', 12.5],
    ['12.50', 12.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.234.567', 1234567],
    ['1.234.567,89', 1234567.89],
    ['1,234,567', 1234567],
    ['€ 1.250,00', 1250],
    ['1.250', 1250],
    ['0.250', 0.25],
    ['3,5 €/kg', 3.5],
    ['-', null],
    ['', null],
    ['abc', null],
  ])('%s -> %s', (input, expected) => {
    expect(parseLocalizedNumber(input)).toBe(expected);
  });
});

describe('header mapping on Italian listini', () => {
  it('uses the Descrizione column, not "Codice articolo"', () => {
    const result = parseUniversalSpreadsheetRows([
      ['Codice articolo', 'Descrizione', 'UM', 'Prezzo unitario'],
      ['A001', 'Tubo rame 12 mm', 'm', '4,20'],
      ['A002', 'Raccordo ottone 1/2', 'pz', '1,10'],
    ]);
    expect(result.items.map((i) => i.description)).toEqual([
      'Tubo rame 12 mm',
      'Raccordo ottone 1/2',
    ]);
    expect(result.items.map((i) => i.unit_price)).toEqual([4.2, 1.1]);
  });

  it('does not read "Prezzo unitario" as the unit column', () => {
    const result = parseUniversalSpreadsheetRows([
      ['Descrizione', 'Prezzo unitario'],
      ['Lamiera alluminio liscia', '18,00'],
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unit_price).toBe(18);
    expect(result.summary.unitDetectedRows).toBe(0);
  });

  it('does not match short aliases inside other words (um in alluminio, kg in prezzo/kg)', () => {
    const result = parseUniversalSpreadsheetRows([
      ['Descrizione', 'Profilo alluminio', 'Prezzo €/kg'],
      ['Barra piatta', 'sì', '3,50'],
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unit_price).toBe(3.5);
  });

  it('prefers net price over list price when both exist', () => {
    const result = parseUniversalSpreadsheetRows([
      ['Descrizione', 'Prezzo listino', 'Sconto %', 'Prezzo netto'],
      ['Valvola a sfera 3/4', '20,00', '30', '14,00'],
    ]);
    expect(result.items[0].unit_price).toBe(14);
  });

  it('finds the header row below a long letterhead', () => {
    const letterhead = Array.from({ length: 14 }, (_, i) => [
      `Riga intestazione ${i + 1}`,
    ]);
    const result = parseUniversalSpreadsheetRows([
      ...letterhead,
      ['Codice', 'Descrizione', 'Prezzo'],
      ['X1', 'Cavo FG16 3x2,5', '2,10'],
    ]);
    expect(result.items.map((i) => i.description)).toEqual(['Cavo FG16 3x2,5']);
  });

  it('does not divide the price by a size written in the description', () => {
    const result = parseUniversalSpreadsheetRows([
      ['Descrizione', 'Prezzo'],
      ['Lamiera alluminio 1 mm', '18,00'],
      ['Tubo multistrato 16 mm', '1,90'],
      ['Sacco cemento 25 kg', '7,50'],
    ]);
    expect(result.items.map((i) => i.unit_price)).toEqual([18, 1.9, 7.5]);
  });

  it('still normalizes explicit packs (rotolo da 100 m)', () => {
    const result = parseUniversalSpreadsheetRows([
      ['Descrizione', 'Prezzo'],
      ['Cavo FS17 1,5 rotolo da 100 m', '45,00'],
    ]);
    expect(result.items[0].unit_price).toBeCloseTo(0.45, 6);
  });

  it('does not divide the price by an order quantity column', () => {
    const result = parseUniversalSpreadsheetRows([
      ['Descrizione', 'Quantità minima', 'Prezzo'],
      ['Silicone neutro 300 ml', '12', '6,00'],
    ]);
    expect(result.items[0].unit_price).toBe(6);
  });
});

describe('parseUniversalCsvText', () => {
  it('handles Italian Excel CSV (semicolon, BOM, decimal comma)', () => {
    const csv =
      '﻿Codice;Descrizione;Prezzo\r\nB1;Vite autofilettante 4x40;0,12\r\nB2;"Tassello; nylon 8";0,30\r\n';
    const result = parseUniversalCsvText(csv);
    expect(result.items.map((i) => [i.description, i.unit_price])).toEqual([
      ['Vite autofilettante 4x40', 0.12],
      ['Tassello; nylon 8', 0.3],
    ]);
  });

  it('skips empty-price filler rows without crashing', () => {
    const csv = 'Descrizione;Prezzo\nGuaina corrugata 20;0,45\n;\nTOTALE;\n';
    const result = parseUniversalCsvText(csv);
    expect(result.items.map((i) => i.description)).toEqual(['Guaina corrugata 20']);
  });
});

describe('parseUniversalPdfText on real-world PDF layouts', () => {
  it('reads a prezzario where the price row follows the item (price = largest amount)', () => {
    const text = [
      'PREZZARIO IMPIANTI ESEMPIO 2025',
      'CODICE DESCRIZIONE U.M. SIC.€ MAN.% PREZZO',
      'XX25_EL.10.10.10 Fornitura e posa in opera di punto luce sottotraccia a partire dalla',
      'scatola di derivazione. Sono comprese le scatole e i conduttori.',
      'XX25_EL.10.10.10.a - Punto luce semplice',
      'Cad 0,70 55,100 % 28,90',
      'XX25_EL.10.10.10.b - Punto luce doppio',
      'Cad 0,95 54,000 % 37,15',
      '- 12 -',
      'XX25_EL.20.10.130 Tubo corrugato a doppia parete posato in scavo',
      'XX25_EL.20.10.130.a - Diametro mm 50',
      'm 0,30 30,000 % 1.205,40',
    ].join('\n');

    const result = parseUniversalPdfText(text);
    expect(result.items.map((i) => i.unit_price)).toEqual([28.9, 37.15, 1205.4]);
    expect(result.items[0].description).toBe(
      'Fornitura e posa in opera di punto luce sottotraccia a partire dalla scatola di… - Punto luce semplice (cod. XX25_EL.10.10.10.a)'
    );
    expect(result.items[2].pricing_basis_unit).toBe('m');
  });

  it('reads inline supplier rows and ignores amounts dumped column by column', () => {
    const text = [
      'Catalogo Listino Prezzi 2025',
      'Raccordo a gomito',
      'RG1600',
      'RG1800',
      'Codice',
      '4,10',
      '8,90',
      '€/Pz.',
      '100',
      '70',
      'RG3200 16,40\t20\t5\tSerie a pressare 32x32',
      'RG4000 24,80\t10\t2\tSerie a pressare 40x40',
    ].join('\n');

    const result = parseUniversalPdfText(text);
    expect(result.items.map((i) => [i.description, i.unit_price])).toEqual([
      ['Serie a pressare 32x32 (cod. RG3200)', 16.4],
      ['Serie a pressare 40x40 (cod. RG4000)', 24.8],
    ]);
  });
});

describe('parseUniversalPdfText on technical catalogues without prices', () => {
  const page = (n: number, body: string[]) => [
    `-- ${n} of 9 --`,
    ...body,
    'Tel. 0444 000000',
    'Fax 0444 000001',
    'LAMINATI',
    'TRAVI E ROTAIE',
  ];

  it('turns weight tables and sheet matrices into items priced by €/kg rules', () => {
    const text = [
      ...page(1, [
        'FERRI A ELLE',
        'A SPIGOLI VIVI',
        'dimensioni',
        'peso',
        '(kg/m)',
        '30 x 20 x 4 \t1,45',
        '40 x 20 x 5 \t2,17',
      ]),
      ...page(2, [
        'TRAVI HEA',
        'profilo \tpeso',
        '(kg/m)',
        '100 \t96 \t100 \t5,0 \t8,0 \t12,0 \t16,7',
      ]),
      ...page(3, [
        'LAMIERE STRIATE',
        'spessore',
        'dimensioni (mm)',
        '1000 x 2000 \t1250 x 2500',
        'mm / 10 \tpeso / kg',
        '30/10 \t57,2 \t89,4',
      ]),
      ...page(4, [
        'TUBI ZINCATI',
        'ø esterno \tspessore \tkg/m',
        '15 \t1/2 \t21,3 \t2,6 \t1,28',
      ]),
      ...page(5, ['acciaio S275JR']),
      ...page(6, []),
      ...page(7, []),
    ].join('\n');

    const result = parseUniversalPdfText(text);
    expect(
      result.items.map((i) => [
        i.description,
        i.pricing_basis_quantity,
        i.inferred_rule_key,
      ])
    ).toEqual([
      [
        'Ferri a elle a spigoli vivi 30 x 20 x 4 mm - 1,45 kg/m (prezzo al metro)',
        1.45,
        'metal_ferrous',
      ],
      [
        'Ferri a elle a spigoli vivi 40 x 20 x 5 mm - 2,17 kg/m (prezzo al metro)',
        2.17,
        'metal_ferrous',
      ],
      [
        'Travi HEA 100 (96 x 100 x 5,0 x 8,0 x 12,0) - 16,7 kg/m (prezzo al metro)',
        16.7,
        'metal_ferrous',
      ],
      [
        'Lamiere striate sp. 3 mm 1000 x 2000 - 57,2 kg (prezzo a foglio)',
        57.2,
        'metal_ferrous',
      ],
      [
        'Lamiere striate sp. 3 mm 1250 x 2500 - 89,4 kg (prezzo a foglio)',
        89.4,
        'metal_ferrous',
      ],
      [
        'Tubi zincati 15 (1/2" x 21,3 x 2,6) - 1,28 kg/m (prezzo al metro)',
        1.28,
        'metal_ferrous',
      ],
    ]);
    expect(
      result.items.every((i) => i.pricing_basis_unit === 'kg' && i.unit_price === 0)
    ).toBe(true);
    expect(result.items.some((i) => /tel|fax/i.test(i.description))).toBe(false);
  });
});
