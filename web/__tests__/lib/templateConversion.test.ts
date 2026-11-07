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

import {
  convertToTemplate,
  missingTemplatePlaceholders,
  previewTemplate,
  readTemplateSource,
} from '../../lib/templateConversion';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

describe('quote template conversion', () => {
  beforeEach(() => createMock.mockReset());

  it('lists what a template cannot do without', () => {
    expect(missingTemplatePlaceholders('<p>{{clienteName}}</p>')).toEqual([
      'voci del preventivo ({{#items}}…{{/items}}, {{items}} o {{itemsTable}})',
      'totale ({{total}})',
    ]);
    expect(
      missingTemplatePlaceholders(
        '{{clienteName}} <tbody>{{#items}}<tr><td>{{item.description}}</td></tr>{{/items}}</tbody> {{total}}'
      )
    ).toEqual([]);
    expect(
      missingTemplatePlaceholders('{{clienteName}} <tbody>{{items}}</tbody> {{total}}')
    ).toEqual([]);
  });

  it('keeps the logo out of the AI request and puts it back, cleaning the answer', async () => {
    const source = await readTemplateSource({
      buffer: Buffer.from(
        `<html><body><img src="${LOGO}"><script>alert(1)</script><p>Rossi Impianti</p></body></html>`
      ),
      fileName: 'preventivo.html',
    });
    expect(source.content).not.toContain('base64');
    expect(source.content).not.toContain('<script');

    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              html:
                '<html><head><title>x</title></head><body><img src="__TEMPLATE_IMAGE_0__"><img src="logo.png" alt="Logo">' +
                '<p onclick="steal()">{{clienteName}}</p><table><tbody>{{items}}</tbody></table>' +
                '<p>Totale € {{total}}</p><script>bad()</script></body></html>',
              notes: 'Riconosciuti intestazione e tabella.',
            }),
          },
        },
      ],
    });

    const result = await convertToTemplate({ source });
    expect(result.template).toContain(`<img src="${LOGO}">`);
    expect(result.template).not.toContain('logo.png');
    expect(result.template).not.toMatch(/<script|onclick/);
    expect(result.template).toContain('Totale {{total}}');
    expect(result.template).toContain('<meta name="color-scheme" content="light">');
    expect(result.missing).toEqual([]);

    const preview = previewTemplate(result.template, 'Rossi Impianti');
    expect(preview).toContain('Mario Rossi');
    expect(preview).toMatch(/Totale € 2\.061,40/);
  });

  it('refuses formats it cannot read', async () => {
    await expect(
      readTemplateSource({ buffer: Buffer.from('x'), fileName: 'preventivo.doc' })
    ).rejects.toThrow(/Word \(\.docx\) o HTML/);
  });
});
