/**
 * @jest-environment node
 */
jest.mock('../../lib/supabase-server', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { resolveImportPricing } from '../../lib/listinoPricing';
import { supabaseAdmin } from '../../lib/supabase-server';

const mockedFrom = supabaseAdmin.from as unknown as jest.Mock;

function makeThenableQuery(result: { data: any; error: any }) {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    is: jest.fn(() => query),
    then: (resolve: (value: any) => any, reject?: (reason: any) => any) =>
      Promise.resolve(result).then(resolve, reject),
  };

  return query;
}

function mockStoredRules(params: { profileRules?: any[]; globalRules?: any[] }) {
  mockedFrom
    .mockImplementationOnce(() =>
      makeThenableQuery({
        data: params.profileRules || [],
        error: null,
      })
    )
    .mockImplementationOnce(() =>
      makeThenableQuery({
        data: params.globalRules || [],
        error: null,
      })
    );
}

describe('resolveImportPricing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the only active rule for a unit when the item has no explicit material key', async () => {
    mockStoredRules({
      profileRules: [
        {
          rule_key: 'metal_ferrous',
          reference_unit: 'kg',
          reference_price: 2.5,
          active: true,
        },
      ],
    });

    const result = await resolveImportPricing({
      profileId: 'profile-1',
      parsed: {
        items: [
          {
            description: 'Profilo HEA 100 zincato',
            unit_price: 0,
            markup_percent: 0,
            category: 'Profili',
            pricing_source: 'needs_reference',
            pricing_status: 'needs_reference',
            pricing_basis_unit: 'kg',
            pricing_basis_quantity: 12,
            inferred_rule_key: null,
          },
        ],
        summary: {
          totalRows: 1,
          parsedRows: 1,
          skippedRows: 0,
          normalizedPriceRows: 0,
          unitDetectedRows: 1,
          pendingReferenceRows: 1,
        },
      },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].unit_price).toBe(30);
    expect(result.items[0].pricing_source).toBe('reference_rule');
    expect(result.items[0].inferred_rule_key).toBe('metal_ferrous');
    expect(result.diagnostics.resolvedFromRule).toBe(1);
  });

  it('does not guess when multiple active rules share the same unit', async () => {
    mockStoredRules({
      profileRules: [
        {
          rule_key: 'metal_ferrous',
          reference_unit: 'kg',
          reference_price: 2.5,
          active: true,
        },
        {
          rule_key: 'metal_nonferrous',
          reference_unit: 'kg',
          reference_price: 8,
          active: true,
        },
      ],
    });

    const result = await resolveImportPricing({
      profileId: 'profile-1',
      parsed: {
        items: [
          {
            description: 'Accessorio tecnico da catalogo',
            unit_price: 0,
            markup_percent: 0,
            category: 'Accessori',
            pricing_source: 'needs_reference',
            pricing_status: 'needs_reference',
            pricing_basis_unit: 'kg',
            pricing_basis_quantity: 3,
            inferred_rule_key: null,
          },
        ],
        summary: {
          totalRows: 1,
          parsedRows: 1,
          skippedRows: 0,
          normalizedPriceRows: 0,
          unitDetectedRows: 1,
          pendingReferenceRows: 1,
        },
      },
    });

    expect(result.items).toHaveLength(0);
    expect(result.unresolvedItems).toHaveLength(1);
    expect(result.diagnostics.resolvedFromRule).toBe(0);
  });

  it('still prefers the explicit inferred rule when multiple rules share the same unit', async () => {
    mockStoredRules({
      profileRules: [
        {
          rule_key: 'metal_ferrous',
          reference_unit: 'kg',
          reference_price: 2.5,
          active: true,
        },
        {
          rule_key: 'metal_nonferrous',
          reference_unit: 'kg',
          reference_price: 8,
          active: true,
        },
      ],
    });

    const result = await resolveImportPricing({
      profileId: 'profile-1',
      parsed: {
        items: [
          {
            description: 'Barra tecnica non ferrosa',
            unit_price: 0,
            markup_percent: 0,
            category: 'Barre',
            pricing_source: 'needs_reference',
            pricing_status: 'needs_reference',
            pricing_basis_unit: 'kg',
            pricing_basis_quantity: 5,
            inferred_rule_key: 'metal_nonferrous',
          },
        ],
        summary: {
          totalRows: 1,
          parsedRows: 1,
          skippedRows: 0,
          normalizedPriceRows: 0,
          unitDetectedRows: 1,
          pendingReferenceRows: 1,
        },
      },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].unit_price).toBe(40);
    expect(result.items[0].inferred_rule_key).toBe('metal_nonferrous');
    expect(result.diagnostics.resolvedFromRule).toBe(1);
  });
});
