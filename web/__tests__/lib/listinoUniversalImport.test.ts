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
