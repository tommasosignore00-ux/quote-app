type RecordLike = Record<string, unknown>;

export type UniversalParsedItem = {
  description: string;
  unit_price: number;
  markup_percent: number;
  category?: string | null;
  pricing_source?: 'file' | 'derived_reference' | 'reference_rule' | 'needs_reference';
  pricing_status?: 'resolved' | 'needs_reference';
  pricing_basis_unit?: string | null;
  pricing_basis_quantity?: number | null;
  inferred_rule_key?: string | null;
  extracted_measurements?: Record<string, number>;
  /** Shape/family from a catalogue without prices ("Travi HEA"): priced per group. */
  pricing_group?: string | null;
  /** Description as first written, to find rows saved before a rename. */
  source_description?: string | null;
  /** Unit of measure shown on quotes ("pz", "m", "kg", "m²", "h"). */
  unit?: string | null;
};

export type UniversalImportSummary = {
  totalRows: number;
  parsedRows: number;
  skippedRows: number;
  normalizedPriceRows: number;
  unitDetectedRows: number;
  pendingReferenceRows: number;
};

export type UniversalImportResult = {
  items: UniversalParsedItem[];
  summary: UniversalImportSummary;
};

// ─── Header aliases ───────────────────────────────────────────────────────────
// Covers all 21 app languages: IT EN DE FR ES PT NL PL HR SK CS SL HU RO BG RU
// UK EL JA KO ZH.  Aliases are compared AFTER normalizeText(), so accented and
// underscored forms are all normalised before matching (see buildHeaderMap).
const HEADER_ALIASES: Record<string, string[]> = {
  description: [
    // IT
    'descrizione',
    'descrizioni',
    'voce',
    'articolo',
    'materiale',
    'prodotto',
    'nome',
    // EN
    'description',
    'desc',
    'item',
    // DE
    'beschreibung',
    'artikel',
    // NL
    'beschrijving',
    'omschrijving',
    // ES
    'descripción',
    'descripcion',
    // PT
    'descrição',
    'descricao',
    // FR
    'désignation',
    'designation',
    'libellé',
    'libelle',
    // HR / PL / SL
    'opis',
    // CS / SK
    'popis',
    // HU
    'leírás',
    'leiras',
    // RO
    'descriere',
    // Cyrillic – BG / RU
    'описание',
    // Cyrillic – UK
    'опис',
    // Greek – EL
    'περιγραφή',
    'περιγραφη',
    // CJK – JA
    '説明',
    // CJK – KO
    '설명',
    // CJK – ZH
    '描述',
  ],

  price: [
    // IT
    'prezzo',
    'prezzi',
    'prezzo unitario',
    'prezzo netto',
    'netto',
    'prezzo listino',
    'costo',
    'costo unitario',
    'importo',
    'importo unitario',
    'tariffa',
    'valore',
    'euro',
    'eur',
    '€',
    'listino',
    // EN
    'price',
    'unit price',
    'unit_price',
    'net price',
    'list price',
    'amount',
    // DE
    'preis',
    'einzelpreis',
    // NL
    'prijs',
    // ES
    'precio',
    // PT
    'preço',
    'preco',
    // FR
    'prix',
    // HR
    'cijena',
    // PL / CS / SK / SL
    'cena',
    // RO
    'preț',
    'pret',
    // Cyrillic – BG / RU
    'цена',
    // Cyrillic – UK
    'ціна',
    // Greek – EL
    'τιμή',
    'τιμη',
    // CJK – JA
    '価格',
    // CJK – KO
    '가격',
    // CJK – ZH
    '价格',
  ],

  markup: [
    // IT
    'markup',
    'markup_percent',
    'ricarico',
    'margine',
    'sconto_negativo',
    // DE
    'aufschlag',
    // NL
    'opslag',
    // ES
    'margen',
    // PT
    'margem',
    // FR
    'marge',
    // HR
    'marža',
    'marza',
    // PL
    'marża',
    // HU
    'haszonkulcs',
    // RO
    'adaos',
    // CS
    'přirážka',
    'prirazka',
    // SK
    'prirážka',
    // SL
    'pribitek',
    // Cyrillic – BG
    'надценка',
    // Cyrillic – RU
    'наценка',
    // Cyrillic – UK
    'націнка',
    // Greek – EL
    'προσαύξηση',
    'προσαυξηση',
    // CJK – JA
    'マークアップ',
    // CJK – KO
    '마크업',
    // CJK – ZH
    '加价',
  ],

  unit: [
    // IT
    'unità',
    'unita',
    'um',
    'misura',
    'uom',
    'unit_measure',
    'unita_misura',
    // EN
    'unit',
    // DE
    'einheit',
    // NL
    'eenheid',
    // ES
    'unidad',
    // PT
    'unidade',
    // FR
    'unité',
    'unite',
    // HR
    'jedinica',
    // PL
    'jednostka',
    // HU
    'egység',
    'egyseg',
    // RO
    'unitate',
    // CS / SK
    'jednotka',
    // SL
    'enota',
    // Cyrillic – BG / RU
    'единица',
    // Cyrillic – UK
    'одиниця',
    // Greek – EL
    'μονάδα',
    'μοναδα',
    // CJK – JA
    '単位',
    // CJK – KO
    '단위',
    // CJK – ZH
    '单位',
  ],

  priceUnit: [
    // IT
    'prezzo unità',
    'prezzo_unita',
    'prezzo unitario',
    'prezzo_x',
    // EN
    'price unit',
    'price_unit',
    'pricing unit',
    'price uom',
    'uom price',
    // DE
    'stückpreis',
    'stuckpreis',
    'einzelpreis',
    // NL
    'eenheidsprijs',
    // ES
    'precio unitario',
    // PT
    'preço unitário',
    'preco unitario',
    // FR
    'prix unitaire',
    // HR
    'jedinična cijena',
    'jedinicna cijena',
    // PL
    'cena jednostkowa',
    // HU
    'egységár',
    'egysegar',
    // RO
    'preț unitar',
    'pret unitar',
    // CS / SK
    'jednotková cena',
    'jednotkova cena',
    // SL
    'cena na enoto',
    // Cyrillic – BG
    'единична цена',
    // Cyrillic – RU
    'цена за единицу',
    // Cyrillic – UK
    'ціна за одиницю',
    // Greek – EL
    'τιμή μονάδας',
    'τιμη μοναδας',
    // CJK – JA
    '単価',
    // CJK – KO
    '단가',
    // CJK – ZH
    '单价',
  ],

  // Packaging size: the price in the file refers to the whole pack, so it is
  // divided by this quantity to get a per-unit price.
  packQty: [
    // IT
    'confezione',
    'pezzi confezione',
    'qta confezione',
    'pz conf',
    'pezzi per confezione',
    'imballo',
    // EN
    'pack qty',
    'pcs pack',
    'qty pack',
    'pack size',
    'packaging',
    // DE
    'packung',
    'gebindegröße',
    'gebindegrosse',
    // NL
    'verpakking',
    // ES
    'embalaje',
    // PT
    'embalagem',
    // FR
    'emballage',
    // HR / SL
    'pakiranje',
    // PL
    'opakowanie',
    // HU
    'csomagolás',
    'csomagolas',
    // RO
    'ambalaj',
    // CS / SK
    'balení',
    'baleni',
    'balenie',
  ],

  // Physical length of the item: a pricing basis measurement, NOT a divisor
  // for the file price (a 6 m bar priced per bar stays priced per bar).
  length: [
    'lunghezza',
    'length',
    'coil length',
    'reel length',
    'länge',
    'lange',
    'lengte',
    'longitud',
    'comprimento',
    'longueur',
    'duljina',
    'długość',
    'dlugosc',
    'hossz',
    'lungime',
    'délka',
    'delka',
    'dĺžka',
    'dlzka',
    'dolžina',
    'dolzina',
  ],

  quantity: [
    // IT
    'quantità',
    'quantita',
    'qta',
    'q.t.a',
    // EN
    'quantity',
    'qty',
    // DE
    'menge',
    'anzahl',
    // NL
    'aantal',
    // ES
    'cantidad',
    // PT
    'quantidade',
    // FR
    'quantité',
    'quantite',
    // HR / SL
    'količina',
    'kolicina',
    // PL
    'ilość',
    'ilosc',
    // HU
    'mennyiség',
    'mennyiseg',
    // RO
    'cantitate',
    // CS
    'množství',
    'mnozstvi',
    // SK
    'množstvo',
    'mnozstvo',
    // Cyrillic – BG / RU
    'количество',
    // Cyrillic – UK
    'кількість',
    // Greek – EL
    'ποσότητα',
    'ποσοτητα',
    // CJK – JA / ZH
    '数量',
    // CJK – KO
    '수량',
  ],

  weight: [
    'peso',
    'peso unitario',
    'peso kg',
    'peso netto',
    'weight',
    'unit weight',
    'net weight',
    'gewicht',
    'poids',
    'peso neto',
    'peso liquido',
    'massa',
    'mass',
    'kg',
    'peso articulo',
  ],

  area: ['area', 'superficie', 'surface', 'sqm', 'mq', 'm2'],

  volume: [
    'volume',
    'vol',
    'capacita',
    'capacity',
    'm3',
    'mc',
    'litri',
    'liters',
    'litres',
  ],

  code: [
    // IT
    'codice',
    'cod',
    'item_code',
    // EN
    'code',
    'sku',
    'ref',
    'part no',
    'part_no',
    'item no',
    'item_no',
    // DE
    'artikelnummer',
    'artikelnr',
    'artnr',
    // NL
    'referentie',
    // ES
    'código',
    'codigo',
    'referencia',
    // PT
    'artigo',
    'referência',
    // FR
    'référence',
    'reference',
    'code article',
    // HR
    'šifra',
    'sifra',
    // PL
    'kod',
    // HU
    'cikkszám',
    'cikkszam',
    // RO
    'cod',
    // CS / SK
    'kód',
    // Cyrillic – BG / RU
    'код',
    // Greek – EL
    'κωδικός',
    'κωδικος',
    // CJK – JA
    '品番',
    '商品コード',
    // CJK – KO
    '코드',
    // CJK – ZH
    '编号',
  ],
};

const UNIT_ALIASES: Record<string, string> = {
  cad: 'pcs',
  'cad.': 'pcs',
  cadauno: 'pcs',
  cadauna: 'pcs',
  h: 'h',
  ora: 'h',
  ore: 'h',
  corpo: 'corpo',
  'a corpo': 'corpo',
  mt: 'm',
  metro: 'm',
  metri: 'm',
  ml: 'm',
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  mq: 'm2',
  m2: 'm2',
  sqm: 'm2',
  m3: 'm3',
  mc: 'm3',
  kg: 'kg',
  g: 'g',
  ton: 't',
  t: 't',
  lt: 'l',
  l: 'l',
  pz: 'pcs',
  pezzo: 'pcs',
  pezzi: 'pcs',
  pc: 'pcs',
  pcs: 'pcs',
  nr: 'pcs',
  n: 'pcs',
  bobina: 'coil',
  matassa: 'coil',
  rotolo: 'roll',
  conf: 'pack',
  confezione: 'pack',
  scatola: 'box',
  pallet: 'pallet',
};

const BASE_UNIT_FACTORS: Record<string, { base: string; factor: number }> = {
  mm: { base: 'm', factor: 0.001 },
  cm: { base: 'm', factor: 0.01 },
  m: { base: 'm', factor: 1 },
  g: { base: 'kg', factor: 0.001 },
  kg: { base: 'kg', factor: 1 },
  t: { base: 'kg', factor: 1000 },
  l: { base: 'l', factor: 1 },
  m2: { base: 'm2', factor: 1 },
  m3: { base: 'm3', factor: 1 },
  pcs: { base: 'pcs', factor: 1 },
  coil: { base: 'pcs', factor: 1 },
  roll: { base: 'pcs', factor: 1 },
  pack: { base: 'pcs', factor: 1 },
  box: { base: 'pcs', factor: 1 },
  pallet: { base: 'pcs', factor: 1 },
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function parseLocalizedNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = String(value).replace(/[  ]/g, ' ').trim();
  if (!text) return null;

  // Strip currency, VAT/percent markers and a trailing "per unit" suffix
  // ("3,50 €/kg", "12,00 al pz", "8,40 + IVA") so only the number is left.
  text = text
    .replace(/\+?\s*iva\b.*$/i, '')
    .replace(/(?:\/|\bal\b|\bper\b)\s*[a-z0-9²³.]+$/i, '')
    .replace(/€|\beur(?:o)?\b|\$|%/gi, '')
    .replace(/['\s]/g, '');

  if (!/^[-+]?[\d.,]*\d[\d.,]*$/.test(text)) return null;

  const commaCount = (text.match(/,/g) || []).length;
  const dotCount = (text.match(/\./g) || []).length;

  let normalized = text;
  if (commaCount && dotCount) {
    // The last separator is the decimal one, the other is the thousands one.
    normalized =
      text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replace(/\./g, '').replace(',', '.')
        : text.replace(/,/g, '');
  } else if (commaCount > 1) {
    normalized = text.replace(/,/g, '');
  } else if (commaCount === 1) {
    normalized = text.replace(',', '.');
  } else if (dotCount > 1) {
    normalized = text.replace(/\./g, '');
  } else if (dotCount === 1 && /^[-+]?[1-9]\d{0,2}\.\d{3}$/.test(text)) {
    // Italian thousands separator: "1.250" is 1250, while "0.250" or "12.50" stay decimals.
    normalized = text.replace('.', '');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const NORMALIZED_HEADER_ALIASES: Record<string, string[]> = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([canonical, aliases]) => [
    canonical,
    Array.from(new Set(aliases.map((alias) => normalizeText(alias)).filter(Boolean))),
  ])
);

const CJK_RE = /[぀-ヿ㐀-鿿가-힯]/;
const aliasRegexCache = new Map<string, RegExp>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// An alias matches only as a whole word/phrase: "um" must not match "alluminio",
// "unita" must not match "prezzo unitario", "kg" must not steal "prezzo €/kg".
function aliasMatchScore(header: string, alias: string): number {
  if (!header || !alias) return 0;
  if (header === alias) return 100 + alias.length;
  if (CJK_RE.test(alias)) return header.includes(alias) ? 50 + alias.length : 0;

  let re = aliasRegexCache.get(alias);
  if (!re) {
    re = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(alias)}(?:$|[^\\p{L}\\p{N}])`,
      'u'
    );
    aliasRegexCache.set(alias, re);
  }
  return re.test(header) ? 50 + alias.length : 0;
}

function scoreHeaderForCanonical(canonical: string, header: string): number {
  const aliases = NORMALIZED_HEADER_ALIASES[canonical] || [];
  let best = 0;
  for (const alias of aliases) {
    const score = aliasMatchScore(header, alias);
    if (score > best) best = score;
  }
  if (!best) return 0;

  if (canonical === 'price' || canonical === 'priceUnit') {
    // Net price beats list/gross price when the file has both.
    if (/(?:^|[^a-z])(nett[oi]?|net|netpreis|neto|liquido)(?:$|[^a-z])/.test(header)) {
      best += 60;
    }
    if (
      /(?:^|[^a-z])(sconto|discount|rabatt|remise|descuento)(?:$|[^a-z])/.test(header)
    ) {
      best -= 60;
    }
    if (/(?:^|[^a-z])(totale|total|subtotale|imponibile)(?:$|[^a-z])/.test(header)) {
      best -= 30;
    }
  }

  if (canonical === 'description' && scoreHeaderForCanonical('code', header) > 0) {
    // "Codice articolo" is a code column, not the description.
    best -= 30;
  }

  return Math.max(best, 0);
}

// price and priceUnit legitimately point at the same column ("Prezzo unitario").
const SHAREABLE_HEADER_PAIRS = new Set(['price|priceUnit', 'priceUnit|price']);

function buildHeaderMap(headers: string[]): Record<string, number> {
  const candidates: Array<{ canonical: string; index: number; score: number }> = [];
  for (const canonical of Object.keys(NORMALIZED_HEADER_ALIASES)) {
    headers.forEach((header, index) => {
      const score = scoreHeaderForCanonical(canonical, header);
      if (score > 0) candidates.push({ canonical, index, score });
    });
  }

  // Greedy best-score-first assignment: each column goes to the field it matches
  // best, and a field that loses its best column falls back to its next match.
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);

  const map: Record<string, number> = {};
  const owners = new Map<number, string[]>();
  for (const candidate of candidates) {
    if (map[candidate.canonical] !== undefined) continue;
    const taken = owners.get(candidate.index) || [];
    if (
      taken.some(
        (owner) => !SHAREABLE_HEADER_PAIRS.has(`${owner}|${candidate.canonical}`)
      )
    ) {
      continue;
    }
    map[candidate.canonical] = candidate.index;
    owners.set(candidate.index, [...taken, candidate.canonical]);
  }
  return map;
}

const HEADER_PROBE_ROWS = 40;

function detectLikelyHeaderIndex(rows: unknown[][]): number {
  const maxProbe = Math.min(rows.length, HEADER_PROBE_ROWS);
  let bestIndex = 0;
  let bestScore = 0;

  for (let i = 0; i < maxProbe; i++) {
    const normalized = (rows[i] ?? []).map((cell) => normalizeText(cell)).filter(Boolean);
    if (!normalized.length) continue;
    const score = Object.keys(NORMALIZED_HEADER_ALIASES).reduce(
      (acc, canonical) =>
        acc +
        (normalized.some((value) => scoreHeaderForCanonical(canonical, value) > 0)
          ? 1
          : 0),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function isLikelyCodeCell(value: string): boolean {
  return (
    /^[a-z0-9._/-]{2,}$/i.test(value) &&
    !/\s/.test(value) &&
    parseLocalizedNumber(value) === null
  );
}

function inferColumnIndex(
  sampleRows: unknown[][],
  preferredIndex: number | undefined,
  kind: 'description' | 'price',
  exclude: number[] = []
): number | undefined {
  if (preferredIndex !== undefined) return preferredIndex;
  if (!sampleRows.length) return undefined;

  const maxCols = sampleRows.reduce((max, row) => Math.max(max, row.length), 0);
  if (!maxCols) return undefined;

  const stats = Array.from({ length: maxCols }, () => ({
    nonEmpty: 0,
    numeric: 0,
    text: 0,
    longText: 0,
    codeLike: 0,
  }));

  for (const row of sampleRows) {
    for (let i = 0; i < maxCols; i++) {
      const raw = row[i];
      const text = String(raw ?? '').trim();
      if (!text) continue;
      const stat = stats[i];
      stat.nonEmpty++;

      const parsedNumber = parseLocalizedNumber(text);
      if (parsedNumber !== null) {
        stat.numeric++;
      } else {
        stat.text++;
        stat.longText += text.length;
        if (isLikelyCodeCell(text)) stat.codeLike++;
      }
    }
  }

  if (kind === 'description') {
    const ranked = stats
      .map((stat, index) => ({ index, stat }))
      .filter(
        ({ index, stat }) =>
          !exclude.includes(index) &&
          stat.nonEmpty > 0 &&
          stat.text > 0 &&
          stat.codeLike < stat.text
      )
      .sort((a, b) => {
        if (b.stat.longText !== a.stat.longText) return b.stat.longText - a.stat.longText;
        if (b.stat.text !== a.stat.text) return b.stat.text - a.stat.text;
        return a.index - b.index;
      });

    return ranked[0]?.index;
  }

  const referenceDescription = inferColumnIndex(
    sampleRows,
    undefined,
    'description',
    exclude
  );
  const ranked = stats
    .map((stat, index) => ({ index, stat }))
    .filter(
      ({ index, stat }) =>
        !exclude.includes(index) &&
        index !== referenceDescription &&
        stat.nonEmpty > 0 &&
        stat.numeric > 0 &&
        stat.numeric >= stat.text
    )
    .sort((a, b) => {
      const aRightOfDesc =
        referenceDescription !== undefined && a.index > referenceDescription ? 1 : 0;
      const bRightOfDesc =
        referenceDescription !== undefined && b.index > referenceDescription ? 1 : 0;
      if (bRightOfDesc !== aRightOfDesc) return bRightOfDesc - aRightOfDesc;
      if (b.stat.numeric !== a.stat.numeric) return b.stat.numeric - a.stat.numeric;
      return a.index - b.index;
    });

  return ranked[0]?.index;
}

function mergeSummaries(results: UniversalImportResult[]): UniversalImportResult {
  return results.reduce<UniversalImportResult>(
    (acc, current) => ({
      items: acc.items.concat(current.items),
      summary: {
        totalRows: acc.summary.totalRows + current.summary.totalRows,
        parsedRows: acc.summary.parsedRows + current.summary.parsedRows,
        skippedRows: acc.summary.skippedRows + current.summary.skippedRows,
        normalizedPriceRows:
          acc.summary.normalizedPriceRows + current.summary.normalizedPriceRows,
        unitDetectedRows: acc.summary.unitDetectedRows + current.summary.unitDetectedRows,
        pendingReferenceRows:
          acc.summary.pendingReferenceRows + current.summary.pendingReferenceRows,
      },
    }),
    {
      items: [],
      summary: {
        totalRows: 0,
        parsedRows: 0,
        skippedRows: 0,
        normalizedPriceRows: 0,
        unitDetectedRows: 0,
        pendingReferenceRows: 0,
      },
    }
  );
}

function getNonEmptyCellTexts(row: unknown[]): string[] {
  return row.map((cell) => String(cell ?? '').trim()).filter((cell) => cell.length > 0);
}

function isLikelyHeaderText(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return Object.keys(NORMALIZED_HEADER_ALIASES).some(
    (canonical) => scoreHeaderForCanonical(canonical, normalized) > 0
  );
}

function isLikelyContextLabel(value: string): boolean {
  const raw = String(value ?? '').trim();
  const normalized = normalizeText(raw);
  if (!normalized) return false;
  if (normalized.length < 3) return false;
  if (parseLocalizedNumber(raw) !== null) return false;
  if (isLikelyHeaderText(raw)) return false;
  if (
    /^(totale|subtotal|subtotale|pagina|page|pag\.?|codice|cod\.?)$/i.test(normalized)
  ) {
    return false;
  }
  return /[a-z]/i.test(raw) || /[A-ZÀ-ÖØ-Ý]/.test(raw);
}

function isMostlyUppercase(value: string): boolean {
  const letters = value.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || [];
  if (!letters.length) return false;
  const uppercase = value.match(/[A-ZÀ-ÖØ-Ý]/g) || [];
  return uppercase.length / letters.length >= 0.65;
}

function extractDocumentTitle(rowsBeforeHeader: unknown[][]): string | null {
  const candidates = rowsBeforeHeader
    .map((row) => getNonEmptyCellTexts(row))
    .filter((cells) => cells.length > 0 && cells.length <= 2)
    .map((cells) => cells.join(' ').trim())
    .filter((label) => isLikelyContextLabel(label))
    .filter((label) => !isMostlyUppercase(label) || label.length >= 8)
    .filter((label) => !isLikelyHeaderText(label));

  const best = candidates.sort((a, b) => b.length - a.length)[0];

  return best || null;
}

function extractContextLabelFromRow(
  row: unknown[],
  description: string,
  directPrice: number | null
): string | null {
  const cells = getNonEmptyCellTexts(row);
  if (!cells.length) return null;
  if (directPrice !== null) return null;

  const combined = cells.join(' ').trim();
  const singleLabel = cells.length === 1 ? cells[0] : combined;
  if (!isLikelyContextLabel(singleLabel)) return null;

  if (cells.length === 1) return singleLabel;
  if (description && description === cells[0] && isMostlyUppercase(description)) {
    return description;
  }
  if (combined.length <= 80 && isMostlyUppercase(combined)) return combined;

  return null;
}

const DISPLAY_UNITS: Record<string, string> = {
  pcs: 'pz',
  m: 'm',
  mm: 'mm',
  cm: 'cm',
  m2: 'm²',
  m3: 'm³',
  kg: 'kg',
  g: 'g',
  t: 't',
  l: 'l',
  coil: 'bobina',
  roll: 'rotolo',
  pack: 'conf',
  box: 'scatola',
  pallet: 'pallet',
  h: 'h',
  corpo: 'a corpo',
};

/** Unit as written on a quote, from the normalized one ("pcs" -> "pz", "m2" -> "m²"). */
export function displayUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  return DISPLAY_UNITS[unit] || null;
}

function normalizeUnit(value: unknown): string | null {
  const t = normalizeText(value);
  if (!t) return null;
  if (UNIT_ALIASES[t]) return UNIT_ALIASES[t];
  if (UNIT_ALIASES[t.replace(/\./g, '')]) return UNIT_ALIASES[t.replace(/\./g, '')];
  return null;
}

function unitFromDescription(description: string): string | null {
  const text = normalizeText(description);
  const match = text.match(
    /\b(mm|cm|mt|m|m2|mq|m3|mc|kg|g|ton|t|lt|l|pz|pezzo|pezzi|pcs|pc|nr|bobina|rotolo|matassa|conf|confezione|scatola|pallet)\b/
  );
  if (!match) return null;
  return normalizeUnit(match[1]);
}

function parseQuantityWithUnit(
  value: unknown
): { qty: number; unit: string | null } | null {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const match = text.match(/(-?[0-9]+(?:[.,][0-9]+)?)\s*([a-zA-Z0-9]+)/);
  if (!match) {
    const asNum = parseLocalizedNumber(text);
    if (asNum === null) return null;
    return { qty: asNum, unit: null };
  }

  const qty = parseLocalizedNumber(match[1]);
  if (qty === null) return null;
  return { qty, unit: normalizeUnit(match[2]) };
}

const PRICE_PER_UNIT_RE =
  /(?:\/|\bal\s+|\bper\s+|\ba\s+)(mm|cm|mt|m|ml|m2|mq|m3|mc|kg|g|t|l|lt|pz|pcs|pc|nr|metro|pezzo)\b/i;

// Only explicit packaging phrases count ("rotolo da 100 m", "conf. 50 pz"):
// a bare size such as "16 mm" or "25 kg" describes the item, not a pack.
function inferPackFromDescription(
  description: string,
  preferredUnit: string | null
): { qty: number; unit: string | null } | null {
  const text = normalizeText(description);

  const explicitPer = text.match(
    /\b(?:bobina|bobine|rotolo|rotoli|matassa|conf(?:ezione)?|scatola|pallet|cartone|busta|sacchetto)\.?\s*(?:da|di)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(mm|cm|mt|m|m2|mq|m3|mc|kg|g|t|l|pz|pcs|pc|nr)?\b/
  );
  if (explicitPer) {
    const qty = parseLocalizedNumber(explicitPer[1]);
    if (qty !== null && qty > 0) {
      return { qty, unit: normalizeUnit(explicitPer[2] || preferredUnit) };
    }
  }

  return null;
}

function toBaseQuantity(
  qty: number,
  unit: string | null
): { qty: number; baseUnit: string | null } {
  if (!unit) return { qty, baseUnit: null };
  const conv = BASE_UNIT_FACTORS[unit];
  if (!conv) return { qty, baseUnit: unit };
  return { qty: qty * conv.factor, baseUnit: conv.base };
}

function extractMeasurementFromColumn(
  value: unknown,
  fallbackUnit: string | null
): { qty: number; unit: string | null } | null {
  const parsed = parseQuantityWithUnit(value);
  if (parsed) return parsed;

  const qty = parseLocalizedNumber(value);
  if (qty === null) return null;
  return { qty, unit: fallbackUnit };
}

function extractWeightFromDescription(
  description: string
): { qty: number; unit: string | null } | null {
  const text = normalizeText(description);
  const match = text.match(/\b([0-9]+(?:[.,][0-9]+)?)\s*(kg|g|ton|t)\b/);
  if (!match) return null;
  const qty = parseLocalizedNumber(match[1]);
  if (qty === null) return null;
  return { qty, unit: normalizeUnit(match[2]) };
}

function extractAreaFromDescription(
  description: string
): { qty: number; unit: string | null } | null {
  const text = normalizeText(description);
  const match = text.match(/\b([0-9]+(?:[.,][0-9]+)?)\s*(mq|m2|sqm)\b/);
  if (!match) return null;
  const qty = parseLocalizedNumber(match[1]);
  if (qty === null) return null;
  return { qty, unit: normalizeUnit(match[2]) };
}

function extractVolumeFromDescription(
  description: string
): { qty: number; unit: string | null } | null {
  const text = normalizeText(description);
  const match = text.match(/\b([0-9]+(?:[.,][0-9]+)?)\s*(m3|mc|lt|l)\b/);
  if (!match) return null;
  const qty = parseLocalizedNumber(match[1]);
  if (qty === null) return null;
  return { qty, unit: normalizeUnit(match[2]) };
}

function inferRuleKey(params: {
  description: string;
  category?: string | null;
  documentTitle?: string | null;
}): string | null {
  const haystack = normalizeText(
    [params.description, params.category, params.documentTitle].filter(Boolean).join(' ')
  );
  if (!haystack) return null;

  if (
    /(acciaio|acciai|ferro|ferri|lamiera|lamiere|trave|travi|putrella|tondino|tondi|profilat|laminat|trafilat)/.test(
      haystack
    )
  ) {
    return 'metal_ferrous';
  }
  if (/(rame|copper|ottone|brass|bronzo|bronze|alluminio|aluminum)/.test(haystack)) {
    return 'metal_nonferrous';
  }
  if (/(cavo|cavi|cable|corrugato|guaina|filo elettric)/.test(haystack)) {
    return 'electric_cable';
  }
  if (/(tubo|tubi|pipe|piping|raccord)/.test(haystack)) return 'piping';
  if (/(vernice|paint|smalto|primer|resina)/.test(haystack)) return 'paint_chemical';
  if (/(legno|wood|trave legno|multistrato|pannello)/.test(haystack)) return 'wood_panel';
  return null;
}

function pickPricingBasis(params: {
  description: string;
  weightValue: unknown;
  lengthValue: unknown;
  areaValue: unknown;
  volumeValue: unknown;
  quantityValue: unknown;
  normalizedUnit: string | null;
}): { qty: number; unit: string | null; measurements: Record<string, number> } | null {
  const measurementCandidates = [
    extractMeasurementFromColumn(params.weightValue, 'kg') ||
      extractWeightFromDescription(params.description),
    extractMeasurementFromColumn(params.lengthValue, 'm'),
    extractMeasurementFromColumn(params.areaValue, 'm2') ||
      extractAreaFromDescription(params.description),
    extractMeasurementFromColumn(params.volumeValue, 'm3') ||
      extractVolumeFromDescription(params.description),
    extractMeasurementFromColumn(params.quantityValue, params.normalizedUnit || 'pcs'),
  ].filter(Boolean) as Array<{ qty: number; unit: string | null }>;

  for (const candidate of measurementCandidates) {
    const base = toBaseQuantity(candidate.qty, candidate.unit);
    if (base.qty > 0 && base.baseUnit) {
      return {
        qty: Number(base.qty.toFixed(6)),
        unit: base.baseUnit,
        measurements: { [base.baseUnit]: Number(base.qty.toFixed(6)) },
      };
    }
  }

  return null;
}

function parseRows(rows: unknown[][]): UniversalImportResult {
  if (!rows.length) {
    return {
      items: [],
      summary: {
        totalRows: 0,
        parsedRows: 0,
        skippedRows: 0,
        normalizedPriceRows: 0,
        unitDetectedRows: 0,
        pendingReferenceRows: 0,
      },
    };
  }

  const headerRowIdx = detectLikelyHeaderIndex(rows);
  const header = (rows[headerRowIdx] ?? []).map((cell) => normalizeText(cell));
  const headerMap = buildHeaderMap(header);
  const sampleRows = rows
    .slice(headerRowIdx + 1)
    .filter((row) => row?.some((cell) => String(cell ?? '').trim() !== ''))
    .slice(0, 30);
  const inferredDescriptionIndex = inferColumnIndex(
    sampleRows,
    headerMap.description,
    'description'
  );
  const inferredPriceIndex = inferColumnIndex(
    sampleRows,
    headerMap.price ?? headerMap.priceUnit,
    'price',
    inferredDescriptionIndex !== undefined ? [inferredDescriptionIndex] : []
  );
  const priceColumnIndex = headerMap.price ?? headerMap.priceUnit ?? inferredPriceIndex;
  const priceHeader =
    priceColumnIndex !== undefined ? header[priceColumnIndex] || '' : '';
  const documentTitle = extractDocumentTitle(rows.slice(0, headerRowIdx));
  let currentContextLabel = documentTitle;

  const items: UniversalParsedItem[] = [];
  let skippedRows = 0;
  let normalizedPriceRows = 0;
  let unitDetectedRows = 0;
  let pendingReferenceRows = 0;

  for (const row of rows.slice(headerRowIdx + 1)) {
    if (!row || !row.length) {
      skippedRows++;
      continue;
    }

    const rowMap: RecordLike = {};
    header.forEach((h, i) => {
      if (h) rowMap[h] = row[i];
    });

    const descriptionRaw =
      (headerMap.description !== undefined ? row[headerMap.description] : null) ??
      (inferredDescriptionIndex !== undefined ? row[inferredDescriptionIndex] : null) ??
      (headerMap.code !== undefined ? row[headerMap.code] : null) ??
      row[0] ??
      '';
    const description = String(descriptionRaw ?? '').trim();

    if (
      !description ||
      /^(totale|subtotal|subtotale|pagina|page|pag\.?)$/i.test(normalizeText(description))
    ) {
      skippedRows++;
      continue;
    }

    // A description needs real words: "4,45" or "100" are values that landed in the
    // description column (typical of PDF tables extracted column by column).
    if (countLetters(description) < 3) {
      skippedRows++;
      continue;
    }

    const directPriceRaw =
      (headerMap.price !== undefined ? row[headerMap.price] : null) ??
      (headerMap.priceUnit !== undefined ? row[headerMap.priceUnit] : null) ??
      (inferredPriceIndex !== undefined ? row[inferredPriceIndex] : null) ??
      row[1] ??
      null;

    const directPrice = parseLocalizedNumber(directPriceRaw);
    const contextLabel = extractContextLabelFromRow(row, description, directPrice);
    if (contextLabel) {
      currentContextLabel = contextLabel;
      skippedRows++;
      continue;
    }

    const markupRaw = headerMap.markup !== undefined ? row[headerMap.markup] : null;
    const unitRaw = headerMap.unit !== undefined ? row[headerMap.unit] : null;
    const priceUnitRaw =
      headerMap.priceUnit !== undefined ? row[headerMap.priceUnit] : null;
    const packRaw = headerMap.packQty !== undefined ? row[headerMap.packQty] : null;
    const quantityRaw = headerMap.quantity !== undefined ? row[headerMap.quantity] : null;
    const weightRaw = headerMap.weight !== undefined ? row[headerMap.weight] : null;
    const lengthRaw = headerMap.length !== undefined ? row[headerMap.length] : null;
    const areaRaw = headerMap.area !== undefined ? row[headerMap.area] : null;
    const volumeRaw = headerMap.volume !== undefined ? row[headerMap.volume] : null;

    const markup = parseLocalizedNumber(markupRaw) ?? 0;
    const normalizedUnit =
      normalizeUnit(unitRaw) ||
      normalizeUnit(priceUnitRaw) ||
      unitFromDescription(description);
    if (normalizedUnit) unitDetectedRows++;
    const pricingBasis = pickPricingBasis({
      description,
      weightValue: weightRaw,
      lengthValue: lengthRaw,
      areaValue: areaRaw,
      volumeValue: volumeRaw,
      quantityValue: quantityRaw,
      normalizedUnit,
    });
    const inferredRuleKey = inferRuleKey({
      description,
      category: currentContextLabel || null,
      documentTitle,
    });

    // Only an explicit packaging column/phrase divides the price. Order quantities
    // and sizes in the description ("Tubo 16 mm", "Sacco 25 kg") must not.
    const packFromColumn = parseQuantityWithUnit(packRaw);
    const packFromDesc = inferPackFromDescription(description, normalizedUnit);
    const pack = packFromColumn || packFromDesc;

    let unitPrice = directPrice;

    const isPricePerUnit =
      PRICE_PER_UNIT_RE.test(String(priceUnitRaw ?? '')) ||
      PRICE_PER_UNIT_RE.test(String(directPriceRaw ?? '')) ||
      PRICE_PER_UNIT_RE.test(priceHeader);
    if (
      unitPrice !== null &&
      unitPrice >= 0 &&
      directPrice !== null &&
      !isPricePerUnit &&
      pack &&
      pack.qty > 0
    ) {
      const packUnit = pack.unit || normalizedUnit;
      const basePack = toBaseQuantity(pack.qty, packUnit);
      if (basePack.qty > 0) {
        unitPrice = directPrice / basePack.qty;
        normalizedPriceRows++;
      }
    }

    if ((unitPrice === null || unitPrice < 0) && !pricingBasis) {
      skippedRows++;
      continue;
    }

    if (unitPrice === null || unitPrice < 0) {
      pendingReferenceRows++;
    }

    items.push({
      description,
      unit_price: Number((unitPrice ?? 0).toFixed(6)),
      markup_percent: Number(markup.toFixed(2)),
      category: currentContextLabel || null,
      pricing_source: unitPrice !== null && unitPrice >= 0 ? 'file' : 'needs_reference',
      pricing_status:
        unitPrice !== null && unitPrice >= 0 ? 'resolved' : 'needs_reference',
      pricing_basis_unit: pricingBasis?.unit || null,
      pricing_basis_quantity: pricingBasis?.qty ?? null,
      unit: displayUnit(normalizedUnit),
      inferred_rule_key: inferredRuleKey,
      extracted_measurements: pricingBasis?.measurements || undefined,
    });
  }

  return {
    items,
    summary: {
      totalRows: Math.max(rows.length - (headerRowIdx + 1), 0),
      parsedRows: items.length,
      skippedRows,
      normalizedPriceRows,
      unitDetectedRows,
      pendingReferenceRows,
    },
  };
}

export function parseUniversalSpreadsheetRows(rows: unknown[][]): UniversalImportResult {
  return parseRows(rows);
}

export function mergeUniversalImportResults(
  results: UniversalImportResult[]
): UniversalImportResult {
  return mergeSummaries(results);
}

export function parseUniversalCsvText(text: string): UniversalImportResult {
  const lines = text.split(/\r?\n/);
  const rows: string[][] = [];

  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;
  let detectedDelimiter: string | null = null;

  const detectDelimiter = (line: string): string => {
    const candidates = [',', ';', '\t'];
    let best = ',';
    let bestCount = -1;
    for (const d of candidates) {
      const count = (line.match(new RegExp(`\\${d}`, 'g')) || []).length;
      if (count > bestCount) {
        bestCount = count;
        best = d;
      }
    }
    return best;
  };

  for (const line of lines) {
    if (!detectedDelimiter && line.trim()) {
      detectedDelimiter = detectDelimiter(line);
    }

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === detectedDelimiter && !inQuotes) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else {
        currentField += ch;
      }
    }

    if (!inQuotes) {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => String(cell).trim() !== '')) rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += '\n';
    }
  }

  if (currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => String(cell).trim() !== '')) rows.push(currentRow);
  }

  return parseRows(rows);
}

function tokenizePdfLine(line: string): string[] {
  const cleanLine = line.replace(/\u00a0/g, ' ').trim();
  if (!cleanLine) return [];

  const tabCells = cleanLine
    .split(/\t+/)
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (tabCells.length > 1) return tabCells;

  const spacedCells = cleanLine
    .split(/\s{2,}/)
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (spacedCells.length > 1) return spacedCells;

  const trailingPriceMatch = cleanLine.match(
    /^(.*?)(-?[0-9]+(?:[.\s][0-9]{3})*(?:[.,][0-9]+)?)\s*(€|eur)?$/i
  );
  if (trailingPriceMatch) {
    const description = trailingPriceMatch[1]?.trim();
    const price = trailingPriceMatch[2]?.trim();
    if (description && price) {
      return [description, price];
    }
  }

  return [cleanLine];
}

export function parseUniversalPdfText(text: string): UniversalImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/ /g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !/^(pagina|page|pag\.?)\s+\d+(\s+di\s+\d+)?$/i.test(line));

  const rows = lines
    .map(tokenizePdfLine)
    .filter(
      (row) => row.length > 0 && row.some((cell) => String(cell ?? '').trim() !== '')
    );

  const boilerplate = findRepeatedBoilerplateLines(lines);
  const contentLines = lines.filter((line) => !boilerplate.has(normalizeText(line)));

  const columnBased = filterJunkItems(parseRows(rows));
  const lineBased = filterJunkItems(
    mergeImportResults(
      parseLineBasedPdfText(contentLines),
      parseTechnicalTablesPdfText(lines, text, boilerplate)
    )
  );

  // PDF text has no reliable columns: keep the reading that found more usable items
  // (priced first, then items with a measurement that a pricing rule can price);
  // on a tie the line reading wins: it is built for PDF layouts.
  return pdfResultScore(lineBased) >= pdfResultScore(columnBased)
    ? lineBased
    : columnBased;
}

function pdfResultScore(result: UniversalImportResult): number {
  const priced = countPriced(result.items);
  const priceable = result.items.filter(
    (item) =>
      item.unit_price <= 0 &&
      item.pricing_basis_unit &&
      (item.pricing_basis_quantity || 0) > 0
  ).length;
  return priced * 2 + priceable;
}

function mergeImportResults(
  a: UniversalImportResult,
  b: UniversalImportResult
): UniversalImportResult {
  const items = [...a.items, ...b.items];
  return {
    items,
    summary: {
      totalRows: Math.max(a.summary.totalRows, b.summary.totalRows),
      parsedRows: items.length,
      skippedRows: a.summary.skippedRows + b.summary.skippedRows,
      normalizedPriceRows: a.summary.normalizedPriceRows + b.summary.normalizedPriceRows,
      unitDetectedRows: a.summary.unitDetectedRows + b.summary.unitDetectedRows,
      pendingReferenceRows: items.filter(
        (item) => item.pricing_status === 'needs_reference'
      ).length,
    },
  };
}

// Contact details and addresses are never price list items ("Tel. 0444 696230").
const JUNK_DESCRIPTION_RE =
  /^(tel|telefono|fax|cell|mob|e-?mail|www\.|https?:|p\.?\s?iva|c\.?f\.?|cap|via|viale|piazza|pec|peso|prezzo|dimensioni|spessore|lunghezza|larghezza|altezza|diametro|misura|codice|totale)\b/i;

function filterJunkItems(result: UniversalImportResult): UniversalImportResult {
  const items = result.items.filter(
    (item) => !JUNK_DESCRIPTION_RE.test(item.description.trim())
  );
  const removed = result.items.length - items.length;
  if (!removed) return result;
  return {
    items,
    summary: {
      ...result.summary,
      parsedRows: items.length,
      skippedRows: result.summary.skippedRows + removed,
      pendingReferenceRows: items.filter(
        (item) => item.pricing_status === 'needs_reference'
      ).length,
    },
  };
}

// Lines printed on most pages (company address, side menu, "Qualità: S275JR") are
// layout, not content: they would otherwise become headings or fake items.
function findRepeatedBoilerplateLines(lines: string[]): Set<string> {
  const pages = Math.max(
    1,
    lines.filter((line) => /^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)).length
  );
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = normalizeText(line);
    if (key.length < 2) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const threshold = Math.max(5, Math.ceil(pages * 0.25));
  const repeated = new Set<string>();
  for (const [key, count] of counts) {
    // Pure numbers/dimensions repeat legitimately in tables: keep them.
    if (count >= threshold && /\p{L}{2,}/u.test(key)) repeated.add(key);
  }
  return repeated;
}

const DIMENSION_CELL_RE = /^\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)*$/i;
// Inch sizes used for tubes: 3/8, 1,1/4, 2.1/2
const INCH_CELL_RE = /^(?:\d+[.,])?\d+\/(?:2|4|8|16|32)$/;
// Sheet tables: thickness in tenths of mm ("30/10" = 3 mm) by sheet format ("1000 x 2000").
const SHEET_THICKNESS_RE = /^(\d+(?:[.,]\d+)?)\/10$/;
const SHEET_FORMAT_RE = /^\d{3,4}\s*[x×]\s*\d{3,4}$/i;
const MAX_TECHNICAL_CELLS = 8;
const MAX_WEIGHT_KG_PER_M = 1000;
const HEADING_LOWERCASE_WORDS = new Set([
  'a',
  'e',
  'i',
  'o',
  'di',
  'da',
  'in',
  'con',
  'per',
  'su',
  'la',
  'il',
  'le',
  'lo',
  'gli',
  'del',
  'dei',
  'al',
  'ai',
  'ed',
]);

function isMostlyUppercaseHeading(line: string): boolean {
  const letters = line.match(/\p{L}/gu) || [];
  if (letters.length < 4 || /\d/.test(line)) return false;
  const upper = line.match(/\p{Lu}/gu) || [];
  return upper.length / letters.length >= 0.8 && line.length <= 60;
}

// "TRAVI HEA" -> "Travi HEA", "FERRI A ELLE" -> "Ferri a elle": short non-stopword
// tokens are profile acronyms (HEA, IPE, NP, UPN) and stay uppercase.
function toSentenceCase(value: string): string {
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      if (
        word.length <= 3 &&
        /^\p{Lu}+$/u.test(word) &&
        !HEADING_LOWERCASE_WORDS.has(lower)
      ) {
        return word;
      }
      return lower;
    })
    .join(' ');
}

function formatDimensionCell(cell: string): string {
  return INCH_CELL_RE.test(cell) ? `${cell}"` : cell.replace(/\s*[x×]\s*/gi, ' x ');
}

/**
 * Technical catalogues (steel profiles, tubes, sheets) list sizes and weight per metre
 * without prices: "30 x 20 x 4 <tab> 1,45" under "FERRI A ELLE ... peso (kg/m)".
 * Each row becomes an item priced later by a €/kg pricing rule (weight x rule price).
 */
function parseTechnicalTablesPdfText(
  lines: string[],
  fullText: string,
  boilerplate: Set<string>
): UniversalImportResult {
  const items: UniversalParsedItem[] = [];
  const documentIsFerrous = /(siderurg|acciai|ferro|ferri|s275|s355|laminat)/i.test(
    fullText
  );
  let mainHeading = '';
  let headingParts: string[] = [];
  let headingClosed = true;
  let weightContextLine = -1000;
  let sheetFormats: string[] = [];
  let sheetFormatsLine = -1000;

  const isSubheading = (text: string) => {
    const firstWord = normalizeText(text).split(' ')[0];
    // "A SPIGOLI VIVI", "PER SERRAMENTI ...", "(COLLABORANTE)" refine the main title above.
    return (
      HEADING_LOWERCASE_WORDS.has(firstWord) ||
      /^[(\-]/.test(text) ||
      firstWord.length === 1
    );
  };

  // "TUBOLARI PER SERRAMENTI" + "PER SERRAMENTI ZINCATI" -> "TUBOLARI PER SERRAMENTI ZINCATI"
  const joinHeadings = (main: string, sub: string) => {
    const mainWords = main.split(/\s+/);
    const subWords = sub.split(/\s+/);
    for (
      let overlap = Math.min(mainWords.length, subWords.length);
      overlap > 0;
      overlap--
    ) {
      const tail = mainWords.slice(-overlap).join(' ').toLowerCase();
      const head = subWords.slice(0, overlap).join(' ').toLowerCase();
      if (tail === head) return [...mainWords, ...subWords.slice(overlap)].join(' ');
    }
    return `${main} ${sub}`;
  };

  const currentHeading = () => {
    const group = headingParts.join(' ');
    if (!group) return '';
    return isSubheading(group) && mainHeading ? joinHeadings(mainHeading, group) : group;
  };

  lines.forEach((line, index) => {
    const normalized = normalizeText(line);
    // Table headers repeat on every page, so they are read here even if boilerplate.
    if (/\bpeso\b/.test(normalized) || /kg\s*\.?\s*\/\s*m/.test(normalized)) {
      weightContextLine = index;
    }

    if (isMostlyUppercaseHeading(line) && !boilerplate.has(normalized)) {
      const text = line.trim();
      // A subheading always starts its own group, so siblings ("A SPIGOLI TONDI",
      // "A SPIGOLI VIVI") replace each other instead of piling up.
      if (headingClosed || isSubheading(text)) headingParts = [];
      headingParts.push(text);
      headingParts = headingParts.slice(-2);
      headingClosed = false;
      if (!isSubheading(headingParts[0])) mainHeading = headingParts.join(' ');
      return;
    }
    headingClosed = true;

    const cells = line
      .split(/\t+/)
      .map((cell) => cell.trim())
      .filter(Boolean);

    if (cells.length >= 2 && cells.every((cell) => SHEET_FORMAT_RE.test(cell))) {
      sheetFormats = cells.map((cell) => cell.replace(/\s*[x×]\s*/gi, ' x '));
      sheetFormatsLine = index;
      return;
    }

    const sheetThickness = SHEET_THICKNESS_RE.exec(cells[0] || '');
    if (sheetThickness) {
      if (index - sheetFormatsLine > 30 || !sheetFormats.length || !headingParts.length) {
        return;
      }
      const thicknessMm = (parseLocalizedNumber(sheetThickness[1]) || 0) / 10;
      const heading = toSentenceCase(currentHeading());
      cells.slice(1, sheetFormats.length + 1).forEach((cell, formatIndex) => {
        const sheetWeight = parseLocalizedNumber(cell);
        if (sheetWeight === null || sheetWeight <= 0 || sheetWeight > 5000) return;
        items.push({
          description: `${heading} sp. ${String(thicknessMm).replace('.', ',')} mm ${sheetFormats[formatIndex]} - ${String(sheetWeight).replace('.', ',')} kg (prezzo a foglio)`,
          unit_price: 0,
          markup_percent: 0,
          category: heading.slice(0, 100),
          pricing_source: 'needs_reference',
          pricing_status: 'needs_reference',
          pricing_basis_unit: 'kg',
          unit: 'pz',
          pricing_basis_quantity: sheetWeight,
          inferred_rule_key: documentIsFerrous
            ? 'metal_ferrous'
            : inferRuleKey({ description: heading }),
          extracted_measurements: { kg: sheetWeight },
          pricing_group: heading,
        });
      });
      return;
    }

    if (cells.length < 2 || cells.length > MAX_TECHNICAL_CELLS) return;
    if (!cells.every((cell) => DIMENSION_CELL_RE.test(cell) || INCH_CELL_RE.test(cell))) {
      return;
    }
    if (INCH_CELL_RE.test(cells[cells.length - 1])) return;
    // Only rows inside a "peso (kg/m)" table: elsewhere numbers could mean anything.
    if (index - weightContextLine > 40 || !headingParts.length) return;

    const weight = parseLocalizedNumber(cells[cells.length - 1]);
    if (weight === null || weight <= 0 || weight > MAX_WEIGHT_KG_PER_M) return;
    const dimensionCells = cells.slice(0, -1).map(formatDimensionCell);
    // Wide tables (beams, tubes) start with the designation ("HEA 100", "DN 15"):
    // name the item by it and keep the other sizes in brackets.
    const dimensions =
      dimensionCells.length >= 4
        ? `${dimensionCells[0]} (${dimensionCells.slice(1).join(' x ')})`
        : `${dimensionCells.join(' x ')} mm`;

    const heading = toSentenceCase(currentHeading());
    const ruleFromHeading = inferRuleKey({ description: heading });
    const inferredRuleKey =
      ruleFromHeading === 'metal_ferrous' || ruleFromHeading === 'metal_nonferrous'
        ? ruleFromHeading
        : documentIsFerrous
          ? 'metal_ferrous'
          : ruleFromHeading;

    items.push({
      description: `${heading} ${dimensions} - ${String(weight).replace('.', ',')} kg/m (prezzo al metro)`,
      unit_price: 0,
      markup_percent: 0,
      category: heading.slice(0, 100),
      pricing_source: 'needs_reference',
      pricing_status: 'needs_reference',
      pricing_basis_unit: 'kg',
      pricing_basis_quantity: weight,
      unit: 'm',
      inferred_rule_key: inferredRuleKey,
      extracted_measurements: { kg: weight },
      pricing_group: heading,
    });
  });

  return {
    items,
    summary: {
      totalRows: lines.length,
      parsedRows: items.length,
      skippedRows: 0,
      normalizedPriceRows: 0,
      unitDetectedRows: items.length,
      pendingReferenceRows: items.length,
    },
  };
}

function countLetters(value: string): number {
  return (String(value || '').match(/\p{L}/gu) || []).length;
}

function countPriced(items: UniversalParsedItem[]): number {
  return items.filter((item) => item.unit_price > 0).length;
}

// Italian money amount with exactly two decimals: "4,45", "29,40", "1.150,92".
const PDF_MONEY_TOKEN_RE = /^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/;
// A number followed by one of these is a measurement ("3,50 m"), not a price.
const PDF_MEASURE_UNIT_RE =
  /^(mm|cm|m|mt|ml|m2|mq|m3|mc|mmq|mm2|kg|g|t|l|lt|v|kv|a|ma|w|kw|va|kva|hz|bar|°c|%|"|'|x)[.,;)]*$/i;
// Unit-of-measure column values found on prezzario price rows ("Cad 0,75 58,027 % 29,40").
const PDF_UM_ONLY_RE =
  /^(cad\.?|cadauno|cadauna|cad\/anno|nr\.?|n\.?|pz\.?|pezzi|m|ml|mt|m2|mq|m3|mc|kg|t|q|l|lt|h|ora|ore|corpo|a corpo|mese|giorno|€\/pz\.?)$/i;
// Item code at the start of a line: letters and digits, no spaces ("BLG93200", "ABR25_EL.10.10.10.a").
const PDF_CODE_TOKEN_RE = /^(?=[^\s]*\d)(?=[^\s]*[a-z])[a-z0-9][a-z0-9._\/-]{3,}$/i;
const PDF_PAGE_MARKER_RE = /^(?:-+\s*)?\d+(?:\s+of\s+\d+)?(?:\s*-+)?$/i;

type PdfCodeLine = { code: string | null; text: string; consumed: boolean };

function shortTitle(text: string): string {
  const firstSentence = text.split(/[.;:](?:\s|$)/)[0] || text;
  if (firstSentence.length <= 80) return firstSentence.trim();
  return `${firstSentence
    .slice(0, 80)
    .replace(/\s+\S*$/, '')
    .trim()}…`;
}

function isPdfMoneyToken(tokens: string[], index: number): boolean {
  if (!PDF_MONEY_TOKEN_RE.test(tokens[index])) return false;
  if (PDF_MEASURE_UNIT_RE.test(tokens[index + 1] || '')) return false;
  if (/[=x×]$/i.test(tokens[index - 1] || '')) return false;
  return true;
}

/**
 * Line-oriented reading of a PDF listino, for layouts without usable columns:
 * - inline rows: "BLG93200 17,20 20 5 Serie BL a stringere 32x32"
 * - prezzario rows: "ABR25_EL.10.10.10.a - Punto luce ..." followed by "Cad 0,75 58,027 % 29,40"
 *   where the price is the largest amount (the others are safety costs or percentages).
 */
function parseLineBasedPdfText(rawLines: string[]): UniversalImportResult {
  const items: UniversalParsedItem[] = [];
  let skippedRows = 0;
  let unitDetectedRows = 0;
  let parent: PdfCodeLine | null = null;
  let lastCodeLine: PdfCodeLine | null = null;
  let pending: PdfCodeLine | null = null;

  const lines = rawLines.filter((line) => !PDF_PAGE_MARKER_RE.test(line));

  const pushItem = (params: {
    code: string | null;
    text: string;
    price: number;
    unit: string | null;
  }) => {
    const text = params.text
      .replace(/^[-–:]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    if (countLetters(text) < 3) {
      skippedRows++;
      return;
    }
    const parentTitle =
      parent &&
      parent.code &&
      params.code &&
      params.code.startsWith(parent.code) &&
      parent.code !== params.code
        ? shortTitle(parent.text)
        : null;
    const description =
      [parentTitle, text].filter(Boolean).join(' - ') +
      (params.code ? ` (cod. ${params.code})` : '');
    const unit = normalizeUnit(params.unit) || unitFromDescription(text);
    if (unit) unitDetectedRows++;

    items.push({
      description,
      unit_price: Number(params.price.toFixed(6)),
      markup_percent: 0,
      category: parentTitle ? parentTitle.slice(0, 100) : null,
      pricing_source: 'file',
      pricing_status: 'resolved',
      pricing_basis_unit: unit ? toBaseQuantity(1, unit).baseUnit : null,
      pricing_basis_quantity: unit ? 1 : null,
      unit: displayUnit(unit),
      inferred_rule_key: inferRuleKey({ description, category: parentTitle }),
    });
  };

  for (const line of lines) {
    const tokens = line.replace(/€/g, ' ').split(/\s+/).filter(Boolean);
    const moneyValues = tokens
      .map((_, index) =>
        isPdfMoneyToken(tokens, index) ? parseLocalizedNumber(tokens[index]) : null
      )
      .filter((value): value is number => value !== null && value > 0);

    if (moneyValues.length) {
      const price = Math.max(...moneyValues);
      const textTokens = tokens.filter(
        (token) => token !== '%' && parseLocalizedNumber(token) === null
      );
      const code =
        textTokens.length > 1 && PDF_CODE_TOKEN_RE.test(textTokens[0])
          ? textTokens.shift()!
          : null;
      const rest = textTokens
        .join(' ')
        .replace(/^[-–:]\s*/, '')
        .trim();

      const realWords = rest
        .split(/\s+/)
        .filter((word) => countLetters(word) >= 2).length;
      if (realWords >= 2 && !PDF_UM_ONLY_RE.test(rest)) {
        pushItem({ code, text: rest, price, unit: null });
      } else if (pending && (PDF_UM_ONLY_RE.test(rest) || (!rest && pending.code))) {
        // Price row of the item above: it must carry a unit ("Cad", "m") or belong to a coded item,
        // otherwise a lone amount from a column-dumped table would glue onto unrelated text.
        pushItem({ code: pending.code, text: pending.text, price, unit: rest || null });
        pending.consumed = true;
      } else {
        skippedRows++;
      }
      pending = null;
      continue;
    }

    if (tokens.length > 1 && PDF_CODE_TOKEN_RE.test(tokens[0])) {
      // A code line that never got a price is a heading for the sub-items below it.
      if (lastCodeLine && !lastCodeLine.consumed) parent = lastCodeLine;
      lastCodeLine = {
        code: tokens[0],
        text: tokens.slice(1).join(' '),
        consumed: false,
      };
      pending = lastCodeLine;
      continue;
    }

    if (pending) {
      if (pending.text.length < 300) pending.text = `${pending.text} ${line}`;
      continue;
    }

    pending =
      countLetters(line) >= 3 && line.split(/\s+/).length >= 2
        ? { code: null, text: line, consumed: false }
        : null;
  }

  return {
    items,
    summary: {
      totalRows: lines.length,
      parsedRows: items.length,
      skippedRows,
      normalizedPriceRows: 0,
      unitDetectedRows,
      pendingReferenceRows: 0,
    },
  };
}
