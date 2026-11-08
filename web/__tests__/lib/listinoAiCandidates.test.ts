jest.mock('openai', () => jest.fn());
jest.mock('../../lib/supabase-server', () => ({ supabaseAdmin: {} }));
import { mapAiCandidateItems } from '../../lib/listinoImportShared';

describe('AI candidates from PDF', () => {
  it('reads Italian numbers and normalizes units', () => {
    const [item] = mapAiCandidateItems([
      {
        description: 'Trave',
        unit_price: '1.250,50',
        pricing_basis_unit: 'MQ',
        pricing_basis_quantity: '10,4',
      },
    ]);
    expect(item.unit_price).toBe(1250.5);
    expect(item.pricing_basis_unit).toBe('m2');
    expect(item.pricing_basis_quantity).toBe(10.4);
    expect(item.pricing_status).toBe('resolved');
  });

  it('drops a quantity whose unit is unknown', () => {
    const [item] = mapAiCandidateItems([
      {
        description: 'X',
        unit_price: null,
        pricing_basis_unit: 'bancale',
        pricing_basis_quantity: 4,
      },
    ]);
    expect(item.pricing_basis_unit).toBeNull();
    expect(item.pricing_basis_quantity).toBeNull();
    expect(item.pricing_status).toBe('needs_reference');
  });
});
