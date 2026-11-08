import { scrubQuoteTokens } from '../../lib/sentryScrub';

const TOKEN = '11111111-2222-4333-8444-555555555555';

describe('scrubQuoteTokens', () => {
  it('removes the token from nested URLs, breadcrumbs and transaction names', () => {
    const event = scrubQuoteTokens({
      transaction: `GET /q/${TOKEN}`,
      request: { url: `https://app.test/q/${TOKEN}?a=1` },
      breadcrumbs: [{ data: { url: `/api/public/quote/${TOKEN}` } }],
      other: 42,
    });
    expect(JSON.stringify(event)).not.toContain(TOKEN);
    expect(event.request.url).toBe('https://app.test/q/[token]?a=1');
    expect(event.breadcrumbs[0].data.url).toBe('/api/public/quote/[token]');
    expect(event.other).toBe(42);
  });

  it('survives circular objects', () => {
    const event: Record<string, unknown> = { url: `/q/${TOKEN}` };
    event.self = event;
    expect(scrubQuoteTokens(event).url).toBe('/q/[token]');
  });
});
