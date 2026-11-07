/**
 * @jest-environment node
 */
import {
  ACCEPTANCE_LINK_MARKER,
  ACCEPTANCE_URL_MARKER,
  generateQuoteHTML,
} from '../../lib/QuoteTemplate';

const base = {
  lavoroTitle: 'Bagno',
  clienteName: 'Mario Rossi',
  revision: 1,
  items: [],
  vat_percent: 22,
  companyName: 'Rossi Impianti',
  templateType: 'custom' as const,
};

describe('custom templates and the acceptance link', () => {
  it('keeps the quote document clean where the template asks for the button', () => {
    const html = generateQuoteHTML({
      ...base,
      customTemplateHtml: '<div>{{companyName}}</div><div>{{acceptanceLink}}</div>',
    });
    expect(html).toContain('Rossi Impianti');
    expect(html).toContain(ACCEPTANCE_LINK_MARKER);
    expect(html).not.toContain('{{acceptanceLink}}');
  });

  it('lets a template use its own button through the bare link', () => {
    const html = generateQuoteHTML({
      ...base,
      customTemplateHtml: '<a href="{{acceptanceUrl}}" class="mio-bottone">Conferma</a>',
    });
    expect(html).toContain(`href="${ACCEPTANCE_URL_MARKER}"`);
  });
});
