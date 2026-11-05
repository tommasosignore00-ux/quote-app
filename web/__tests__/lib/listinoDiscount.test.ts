/**
 * @jest-environment node
 */
const inserted: any[] = [];
jest.mock('../../lib/supabase-server', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: { supplier_discount_percent: 10 },
          error: null,
        }),
        insert: async (rows: any[]) => {
          inserted.push(...rows);
          return { error: null };
        },
        then: (resolve: any) =>
          resolve(
            table === 'listino_category_markups'
              ? { data: [{ category: 'Tubi', markup_percent: 25 }], error: null }
              : { data: [], error: null }
          ),
      };
      return query;
    },
  },
}));

import { saveListinoItems } from '../../lib/listinoItemsStore';

it('stores the file price as list price, the discounted net price and the category markup', async () => {
  await saveListinoItems({
    listinoId: 'L1',
    profileId: 'P1',
    existingRows: [],
    items: [
      {
        description: 'Tubo rame 12',
        unit_price: 10,
        markup_percent: 5,
        category: 'Tubi',
      },
      {
        description: 'Vite 4x40',
        unit_price: 0.2,
        markup_percent: 5,
        category: 'Viteria',
      },
    ],
  });

  expect(inserted).toEqual([
    expect.objectContaining({
      description: 'Tubo rame 12',
      list_price: 10,
      unit_price: 9,
      markup_percent: 25,
    }),
    expect.objectContaining({
      description: 'Vite 4x40',
      list_price: 0.2,
      unit_price: 0.18,
      markup_percent: 5,
    }),
  ]);
});
