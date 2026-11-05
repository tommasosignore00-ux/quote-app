/**
 * @jest-environment node
 */
const insertMock = jest.fn();
const upsertMock = jest.fn();

jest.mock('../../lib/supabase-server', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      insert: (rows: unknown) => {
        insertMock(rows);
        return Promise.resolve({ error: null });
      },
      upsert: (rows: unknown, options: unknown) => {
        upsertMock(rows, options);
        return Promise.resolve({ error: null });
      },
    })),
  },
}));

import { saveListinoItems } from '../../lib/listinoItemsStore';

describe('saveListinoItems', () => {
  beforeEach(() => {
    insertMock.mockClear();
    upsertMock.mockClear();
  });

  it('updates prices of existing items and inserts only new ones on re-upload', async () => {
    const result = await saveListinoItems({
      listinoId: 'L1',
      profileId: 'P1',
      existingRows: [
        { id: 'row-1', description: 'Tubo rame 12 mm', category: 'Tubi rame' },
      ],
      items: [
        {
          description: 'tubo  RAME 12 mm',
          unit_price: 4.5,
          markup_percent: 0,
          category: null,
        },
        {
          description: 'Raccordo ottone 1/2',
          unit_price: 1.1,
          markup_percent: 0,
          category: 'Raccordi',
        },
        {
          description: 'Raccordo ottone 1/2',
          unit_price: 1.2,
          markup_percent: 0,
          category: 'Raccordi',
        },
      ],
    });

    expect(result).toMatchObject({ inserted: 1, updated: 1, duplicatesSkipped: 1 });

    const [upserted, options] = upsertMock.mock.calls[0];
    expect(options).toEqual({ onConflict: 'id' });
    expect(upserted).toEqual([
      expect.objectContaining({ id: 'row-1', unit_price: 4.5, category: 'Tubi rame' }),
    ]);
    expect(upserted[0]).not.toHaveProperty('embedding');

    const inserted = insertMock.mock.calls[0][0];
    expect(inserted).toEqual([
      expect.objectContaining({
        description: 'Raccordo ottone 1/2',
        unit_price: 1.1,
        embedding: null,
      }),
    ]);
  });

  it('keeps 4 decimals and truncates categories to the column size', async () => {
    await saveListinoItems({
      listinoId: 'L1',
      profileId: 'P1',
      existingRows: [],
      items: [
        { description: 'Vite 3x16', unit_price: 0.00456, category: 'x'.repeat(150) },
      ],
    });

    const [row] = insertMock.mock.calls[0][0];
    expect(row.unit_price).toBe(0.0046);
    expect(row.category).toHaveLength(100);
  });
});

describe('saveListinoItems renames', () => {
  it('updates the row saved under the old description instead of duplicating it', async () => {
    insertMock.mockClear();
    upsertMock.mockClear();
    const result = await saveListinoItems({
      listinoId: 'L1',
      profileId: 'P1',
      existingRows: [
        { id: 'row-9', description: 'Tondi laminati trafilati 40 mm', category: 'Tondi' },
      ],
      items: [
        {
          description: 'Tondi laminati 40 mm',
          source_description: 'Tondi laminati trafilati 40 mm',
          unit_price: 13.23,
          category: 'Tondi laminati',
          pricing_group: 'Tondi laminati',
        },
      ],
    });

    expect(result).toMatchObject({ inserted: 0, updated: 1, duplicatesSkipped: 0 });
    expect(upsertMock.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        id: 'row-9',
        description: 'Tondi laminati 40 mm',
        pricing_group: 'Tondi laminati',
        category: 'Tondi laminati',
        embedding: null,
      }),
    ]);
  });
});

describe('saveListinoItems price changes', () => {
  it('reports increases, decreases, unchanged and missing items and keeps history', async () => {
    insertMock.mockClear();
    upsertMock.mockClear();
    const result = await saveListinoItems({
      listinoId: 'L1',
      profileId: 'P1',
      existingRows: [
        { id: 'a', description: 'Tubo rame 12', category: null, unit_price: 4 },
        { id: 'b', description: 'Raccordo 1/2', category: null, unit_price: '1.10' },
        { id: 'c', description: 'Valvola 3/4', category: null, unit_price: 9 },
        { id: 'd', description: 'Fuori produzione', category: null, unit_price: 2 },
      ],
      items: [
        { description: 'Tubo rame 12', unit_price: 4.6 },
        { description: 'Raccordo 1/2', unit_price: 1 },
        { description: 'Valvola 3/4', unit_price: 9 },
        { description: 'Nuovo articolo', unit_price: 3 },
      ],
    });

    expect(result.inserted).toBe(1);
    expect(result.changes).toMatchObject({
      increased: 1,
      decreased: 1,
      unchanged: 1,
      missing: 1,
    });
    expect(result.changes.examples[0]).toEqual({
      description: 'Tubo rame 12',
      oldPrice: 4,
      newPrice: 4.6,
    });
    const history = insertMock.mock.calls
      .map((call) => call[0])
      .find((rows) => rows[0]?.old_price !== undefined);
    expect(history).toEqual([
      expect.objectContaining({ item_id: 'a', old_price: 4, new_price: 4.6 }),
      expect.objectContaining({ item_id: 'b', old_price: 1.1, new_price: 1 }),
    ]);
  });
});
