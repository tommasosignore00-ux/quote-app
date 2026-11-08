import { REDACTED, redactPersonalData } from '../../lib/templateRedaction';

describe('redactPersonalData', () => {
  it.each([
    ['codice fiscale', 'CF RSSMRA85T10A562S fine'],
    ['partita IVA', 'P.IVA 01234567890 fine'],
    ['IBAN', 'IT60 X054 2811 1010 0000 0123 456 fine'],
    ['email', 'scrivi a mario.rossi@example.com fine'],
    ['cellulare', 'tel. 333 123 4567 fine'],
    ['fisso', 'tel. 02 1234 5678 fine'],
  ])('removes a %s', (_label, text) => {
    const out = redactPersonalData(text);
    expect(out).toContain(REDACTED);
    expect(out).toMatch(/fine$/);
    expect(out.replace(REDACTED, '')).not.toMatch(/\d{3}/);
  });

  it('leaves amounts, measures and CSS alone', () => {
    const html =
      '<style>.a{width:333 123 4567}</style><p>Tubo 12x1000 € 1.930,00 IVA 22%</p>';
    expect(redactPersonalData(html)).toBe(html);
  });

  it('keeps the data of the company and cleans links', () => {
    const out = redactPersonalData(
      '<a href="mailto:x@y.it">P.IVA IT01234567890</a><a href="mailto:ok@az.it">a</a>',
      ['01234567890', 'ok@az.it']
    );
    expect(out).toContain('IT01234567890');
    expect(out).toContain('mailto:ok@az.it');
    expect(out).toContain('href="#"');
  });
});
