import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildListinoFilters,
  parseListinoQuery,
  rankListinoMatches,
} from '../../lib/listinoSearch';

const catalog = [
  'Travi IPE 100 - S275',
  'Travi IPE 120 - S275',
  'Travi HEA 200',
  'Travi HEB 200',
  'Tondi laminati 10 mm',
  'Tondi laminati 100 mm',
  'Tubi quadri 40x40x2',
  'Tubi rettangolari 40x20x2',
  'Tubo scatolato 40x20',
  'Ferri a T 40x40',
  'Lastra T 40x40',
  'Angolari a L 30x30',
  'Canali UPN 80',
  'Lamiera 1,5 mm',
  'Lamiera 15 mm',
].map((description) => ({ description }));

const full = (query: string) =>
  rankListinoMatches(catalog, query)
    .filter((item) => item.fullMatch)
    .map((item) => item.description);

describe('price list search', () => {
  it('is identical on mobile and web', () => {
    const web = readFileSync(join(__dirname, '../../lib/listinoSearch.ts'), 'utf8');
    const mobile = readFileSync(
      join(__dirname, '../../../mobile/lib/listinoSearch.ts'),
      'utf8'
    );
    expect(web).toBe(mobile);
  });

  it.each([
    ['ipe100', ['Travi IPE 100 - S275']],
    ['ip e 120', ['Travi IPE 120 - S275']],
    ['acca e a 200', ['Travi HEA 200']],
    ['acca e bi 200', ['Travi HEB 200']],
    ['tondino 10mm', ['Tondi laminati 10 mm']],
    ['tondo da 10', ['Tondi laminati 10 mm']],
    ['40x20 scatolato', ['Tubo scatolato 40x20', 'Tubi rettangolari 40x20x2']],
    ['tubo 40 x 40', ['Tubi quadri 40x40x2']],
    ['upn 80', ['Canali UPN 80']],
    ['putrella 120', ['Travi IPE 120 - S275']],
    ['ferro a T 40x40', ['Ferri a T 40x40']],
    ['lamiera 1,5', ['Lamiera 1,5 mm']],
    ['acciaio ipe 100', ['Travi IPE 100 - S275']],
  ])('%s', (query, expected) => {
    expect(full(query as string)).toEqual(expected);
  });

  it('needs the size twice when it is said twice', () => {
    expect(full('tubi 40 x 40')).not.toContain('Tubi rettangolari 40x20x2');
  });

  it('requires the shape as an exact phrase', () => {
    expect(full('a T 40x40')).toEqual(['Ferri a T 40x40']);
    expect(full('a L 40x40')).toEqual([]);
  });

  it('dedupes sizes in the filters and quotes commas and spaces', () => {
    const filters = buildListinoFilters(parseListinoQuery('lamiera a T 40 x 40 1,5'));
    expect(filters.all.filter((f) => f.includes('%40%'))).toHaveLength(1);
    expect(filters.all).toContain('description.ilike."%1,5%",description.ilike.%1.5%');
    expect(filters.all).toContain('description.ilike."%a t%"');
  });
});
