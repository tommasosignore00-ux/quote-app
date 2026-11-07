/**
 * @jest-environment node
 */
jest.mock('../../lib/supabase-server', () => ({ supabaseAdmin: {} }));
const createMock = jest.fn();
jest.mock('../../lib/openaiServer', () => ({
  openai: {
    chat: { completions: { create: (...args: unknown[]) => createMock(...args) } },
  },
}));

import fs from 'fs';
import path from 'path';
import { generateQuoteHTML, sanitizeTemplateMarkup } from '../../lib/QuoteTemplate';
import { convertToTemplate, readTemplateSource } from '../../lib/templateConversion';

const render = (customTemplateHtml: string, extra: Record<string, unknown> = {}) =>
  generateQuoteHTML({
    lavoroTitle: 'Bagno',
    clienteName: 'Mario Rossi',
    revision: 1,
    vat_percent: 22,
    countryCode: 'IT',
    templateType: 'custom',
    items: [{ description: 'Posa', quantity: 2, unit_price: 50 }],
    customTemplateHtml,
    ...extra,
  });

const aiAnswer = (html: string, finish = 'stop') => ({
  choices: [
    { finish_reason: finish, message: { content: JSON.stringify({ html, notes: '' }) } },
  ],
});

describe('template safety and robustness', () => {
  beforeEach(() => createMock.mockReset());

  it('strips anything that could run code, load external content or submit data', () => {
    const dirty =
      '<meta http-equiv="refresh" content="0;url=https://evil.example"><link rel="stylesheet" href="https://evil.example/x.css">' +
      '<script>alert(1)</script><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input name="x"></form>' +
      '<p onclick="steal()">ok</p><a href="javascript:steal()">x</a><img src="http://tracker.example/p.gif">' +
      '<div style="background:url(https://tracker.example/p.gif)">y</div><style>@import url(https://evil.example/a.css);</style>' +
      '<img src="https://cdn.example/logo.png"><meta charset="utf-8">';
    const clean = sanitizeTemplateMarkup(dirty);
    expect(clean).not.toMatch(
      /<script|<iframe|<form|<input|<link|http-equiv|onclick|javascript:|tracker\.example|@import/i
    );
    expect(clean).toContain('<p>ok</p>');
    expect(clean).toContain('<img src="https://cdn.example/logo.png">');
    expect(clean).toContain('<meta charset="utf-8">');
  });

  it('hides optional client data with its label when it is missing', () => {
    const template =
      '<p>{{clienteName}}<span data-if="clienteAddress"> - {{clienteAddress}}</span>' +
      '<span data-if="clienteVat"> - P.IVA {{clienteVat}}</span></p><p>IVA {{vatPercent}}</p>' +
      '<table><tbody>{{#items}}<tr><td>{{item.description}}</td></tr>{{/items}}</tbody></table>{{total}}';
    expect(render(template)).toContain('<p>Mario Rossi</p>');
    const full = render(template, {
      clienteAddress: 'Via Roma 1',
      clienteVat: '01234567890',
    });
    expect(full).toContain(
      '<p>Mario Rossi<span> - Via Roma 1</span><span> - P.IVA 01234567890</span></p>'
    );
    expect(full).toContain('<p>IVA 22%</p>');
  });

  it('never shows unknown placeholders to the client', () => {
    expect(
      render('<p>{{nonEsiste}}{{clienteName}}</p>{{#items}}{{/items}}{{total}}')
    ).not.toContain('{{');
  });

  it('fixes misspelt placeholders, drops unknown ones and flags amounts left from the original', async () => {
    createMock.mockResolvedValueOnce(
      aiAnswer(
        '<p>{{cliente}} {{ totale }} {{codiceSegreto}}</p><table><tbody>{{#items}}<tr><td>{{item.prezzo}}</td></tr>{{/items}}</tbody></table><p>Vecchio totale 2.579,50</p>'
      )
    );
    const result = await convertToTemplate({
      source: { kind: 'html', content: '<p>Totale 2.579,50</p>', images: [] },
    });
    expect(result.template).toContain('<p>{{clienteName}} {{total}} </p>');
    expect(result.template).toContain('<td>{{item.price}}</td>');
    expect(result.warnings.join(' ')).toMatch(/codiceSegreto/);
    expect(result.warnings.join(' ')).toMatch(/2\.579,50/);
  });

  it('retries once when the AI answer is cut off, then gives a clear message', async () => {
    createMock
      .mockResolvedValueOnce(aiAnswer('<p>', 'length'))
      .mockResolvedValueOnce(
        aiAnswer(
          '<p>{{clienteName}}</p><table><tbody>{{#items}}<tr><td>{{item.total}}</td></tr>{{/items}}</tbody></table>{{total}}'
        )
      );
    const ok = await convertToTemplate({
      source: { kind: 'html', content: '<p>x</p>', images: [] },
    });
    expect(ok.missing).toEqual([]);
    expect(createMock).toHaveBeenCalledTimes(2);

    createMock.mockReset();
    createMock.mockResolvedValue(aiAnswer('<p>', 'length'));
    await expect(
      convertToTemplate({ source: { kind: 'html', content: '<p>x</p>', images: [] } })
    ).rejects.toThrow(/troppo lungo o complesso/);
  });

  it('reads the letterhead from the Word page header and footer', async () => {
    const source = await readTemplateSource({
      buffer: fs.readFileSync(
        path.join(__dirname, '../fixtures/preventivo-edile-intestazione.docx')
      ),
      fileName: 'preventivo.docx',
    });
    expect(source.content).toContain('<header data-word="intestazione di pagina">');
    expect(source.content).toContain('EDILCASA MORETTI SRL');
    expect(source.content).toContain('IT60X0542811101000000123456');
    expect(source.content).toMatch(/Colori usati nel documento: #7C2D12/);
    expect(source.images.length).toBeGreaterThan(0);
    expect(source.content).not.toContain('base64');
  });
});
