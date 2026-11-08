/**
 * @jest-environment node
 */
const uploads: string[] = [];
let uploadError: { message: string } | null = null;
jest.mock('../../lib/supabase-server', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { template_assets_folder: 'folder-1' },
            error: null,
          }),
        }),
      }),
    }),
    storage: {
      getBucket: async () => ({ data: { name: 'template-assets' } }),
      createBucket: async () => ({ error: null }),
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { error: uploadError };
        },
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://x.supabase.co/storage/v1/object/public/template-assets/${path}`,
          },
        }),
      }),
    },
  },
}));

import { hostTemplateImages } from '../../lib/templateAssets';

const LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

describe('hostTemplateImages', () => {
  beforeEach(() => {
    uploads.length = 0;
    uploadError = null;
  });

  it('replaces inline logos with hosted files, once per picture', async () => {
    const html = await hostTemplateImages(
      'user-1',
      `<img src="${LOGO}"><img src="${LOGO}">{{#items}}{{/items}}`
    );
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatch(/^folder-1\/[0-9a-f]{32}\.png$/);
    expect(html).not.toContain('base64');
    expect(
      html.match(
        /https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/template-assets\/folder-1\//g
      )
    ).toHaveLength(2);
  });

  it('never makes a picture in the body of the quote public', async () => {
    const html = `{{#items}}<img src="${LOGO}">{{/items}}{{total}}`;
    expect(await hostTemplateImages('user-1', html)).toBe(html);
    expect(uploads).toHaveLength(0);
  });

  it('keeps the inline image if hosting fails', async () => {
    uploadError = { message: 'quota exceeded' };
    const html = await hostTemplateImages(
      'user-1',
      `<img src="${LOGO}">{{#items}}{{/items}}`
    );
    expect(html).toContain(LOGO);
  });
});
