/**
 * Removes tax codes, VAT numbers, IBANs, emails and phone numbers from a document before
 * it reaches OpenAI. Only visible text is touched: CSS and markup hold numbers too.
 * `keep` lists the company's own data, which belongs on its letterhead.
 */
export const REDACTED = '[DATO RIMOSSO]';

const PATTERNS = [
  /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{2,4}){3,8}\b/g, // IBAN, uppercase only: otherwise it swallows the next word
  /\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b/gi, // codice fiscale
  /\b(?:IT[ ]?)?\d{11}\b/gi, // partita IVA
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // email
  /(?:\+39[\s.-]?|\b)3\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g, // cellulare
  /(?:\+39[\s.-]?|\b)0\d{1,3}[\s./-]?\d{2,4}[\s.-]?\d{2,5}\b/g, // fisso
];

const normalize = (value: string) => value.replace(/[\s.\-/]/g, '').toUpperCase();

export function redactPersonalData(
  content: string,
  keep: Array<string | null | undefined> = []
) {
  const kept = new Set(keep.filter(Boolean).map((value) => normalize(String(value))));
  const redactText = (text: string) =>
    PATTERNS.reduce(
      (out, pattern) =>
        out.replace(pattern, (match) => {
          const clean = normalize(match);
          const withoutPrefix = clean.replace(/^IT/, '');
          return kept.has(clean) || kept.has(withoutPrefix) ? match : REDACTED;
        }),
      text
    );

  return content
    .split(/(<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]*>)/i)
    .map((part, index) => {
      if (index % 2 === 0) return redactText(part);
      // The address also hides in links.
      return part.replace(/\b(mailto:|tel:)[^"'\s>]*/gi, (match, scheme: string) =>
        kept.has(normalize(match.slice(scheme.length))) ? match : '#'
      );
    })
    .join('');
}
