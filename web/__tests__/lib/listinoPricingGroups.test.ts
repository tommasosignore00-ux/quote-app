/**
 * @jest-environment node
 */
jest.mock('../../lib/supabase-server', () => ({ supabaseAdmin: {} }));

import type { UniversalParsedItem } from '../../lib/listinoUniversalImport';
import {
  applyCanonicalGroups,
  isPricelessCatalogue,
  normalizeGroupCasing,
  priceGroupedItems,
} from '../../lib/listinoPricingGroups';

function technicalItem(group: string, size: string, kg: number): UniversalParsedItem {
  return {
    description: `${group} ${size} - ${kg} kg/m (prezzo al metro)`,
    unit_price: 0,
    markup_percent: 0,
    category: group,
    pricing_source: 'needs_reference',
    pricing_status: 'needs_reference',
    pricing_basis_unit: 'kg',
    pricing_basis_quantity: kg,
    inferred_rule_key: 'metal_ferrous',
    pricing_group: group,
  };
}

describe('pricing groups', () => {
  it('writes every shape name the same way', () => {
    expect(normalizeGroupCasing('Tondi Laminati Trafilati')).toBe(
      'Tondi laminati trafilati'
    );
    expect(normalizeGroupCasing('TRAVI HEA')).toBe('Travi HEA');
    expect(normalizeGroupCasing('Profilati a T')).toBe('Profilati a T');
    expect(normalizeGroupCasing('FERRI ANGOLARI AD ALI UGUALI')).toBe(
      'Ferri angolari ad ali uguali'
    );
    expect(normalizeGroupCasing('travi ipe')).toBe('Travi IPE');
  });

  it('renames items to the canonical shape and remembers the old description', () => {
    const [item] = applyCanonicalGroups(
      [technicalItem('Tondi laminati trafilati', '40 mm', 12.6)],
      new Map([['Tondi laminati trafilati', 'Tondi laminati']])
    );
    expect(item.description).toBe('Tondi laminati 40 mm - 12.6 kg/m (prezzo al metro)');
    expect(item.source_description).toBe(
      'Tondi laminati trafilati 40 mm - 12.6 kg/m (prezzo al metro)'
    );
    expect(item.category).toBe('Tondi laminati');
    expect(item.pricing_group).toBe('Tondi laminati');
  });

  it('prices only the shapes that have a price, as weight x price', () => {
    const items = [
      technicalItem('Travi HEA', '100', 16.7),
      technicalItem('Lamiere striate', '3 mm', 57.2),
    ];
    const priced = priceGroupedItems(items, [
      {
        name: 'Travi HEA',
        reference_unit: 'kg',
        unit_price: 1.05,
        item_count: 1,
        sort_order: 0,
      },
      {
        name: 'Lamiere striate',
        reference_unit: 'kg',
        unit_price: null,
        item_count: 1,
        sort_order: 1,
      },
    ]);
    expect(priced).toHaveLength(1);
    expect(priced[0].unit_price).toBe(17.535);
  });

  it('treats a PDF as "without prices" only when it has (almost) no amounts', () => {
    const technical = Array.from({ length: 10 }, (_, i) =>
      technicalItem('Tondi', `${i} mm`, i + 1)
    );
    expect(isPricelessCatalogue(technical)).toBe(true);
    const priced = Array.from({ length: 10 }, (_, i) => ({
      ...technicalItem('Tondi', `${i}`, 1),
      unit_price: 5,
    }));
    expect(isPricelessCatalogue([...technical, ...priced])).toBe(false);
  });
});
