jest.mock('../../lib/supabase-server', () => ({ supabaseAdmin: {} }));
jest.mock('../../lib/openaiServer', () => ({ openai: {} }));
import { generateQuoteHTML, type QuoteData } from '../../lib/QuoteTemplate';
import { compactSourceForModel } from '../../lib/templateConversion';

const render = (customTemplateHtml: string, extra: Partial<QuoteData> = {}) =>
  generateQuoteHTML({
    lavoroTitle: 'Lavoro',
    clienteName: 'Rossi',
    revision: 1,
    items: [],
    vat_percent: 22,
    companyName: 'Ditta',
    countryCode: 'IT',
    templateType: 'custom',
    customTemplateHtml,
    ...extra,
  } as QuoteData);

describe('data-if', () => {
  it('removes a block with an inner div whole', () => {
    const html = render(
      '<div data-if="clienteVat"><div>P.IVA</div> resto</div><p>dopo</p>'
    );
    expect(html).not.toContain('P.IVA');
    expect(html).not.toContain('resto');
    expect(html).toContain('dopo');
  });

  it('keeps it when the field is there and checks nested conditions', () => {
    const html = render(
      '<div data-if="clienteVat">IVA {{clienteVat}}<span data-if="clienteCity">CITTA</span></div>',
      {
        clienteVat: '123',
      }
    );
    expect(html).toContain('IVA 123');
    expect(html).not.toContain('CITTA');
    expect(html).not.toContain('data-if');
  });
});

describe('compactSourceForModel', () => {
  it('keeps the totals of a long table and the footer', () => {
    const rows = Array.from(
      { length: 900 },
      (_, i) => `<tr><td>riga ${i} ${'x'.repeat(80)}</td></tr>`
    ).join('');
    const source = `<table>${rows}<tr><td>TOTALE</td></tr></table><footer>IBAN</footer>`;
    const out = compactSourceForModel(source);
    expect(out.length).toBeLessThan(5000);
    expect(out).toContain('TOTALE');
    expect(out).toContain('IBAN');
  });

  it('keeps head and tail when the text alone is too long', () => {
    const out = compactSourceForModel(`INIZIO ${'a '.repeat(50000)} FINE`, 1000);
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out).toContain('INIZIO');
    expect(out).toContain('FINE');
  });
});
