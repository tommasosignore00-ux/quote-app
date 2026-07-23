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
    'descrizione', 'voce', 'articolo', 'materiale', 'prodotto', 'nome',
    // EN
    'description', 'desc', 'item',
    // DE
    'beschreibung', 'artikel',
    // NL
    'beschrijving', 'omschrijving',
    // ES
    'descripción', 'descripcion',
    // PT
    'descrição', 'descricao',
    // FR
    'désignation', 'designation', 'libellé', 'libelle',
    // HR / PL / SL
    'opis',
    // CS / SK
    'popis',
    // HU
    'leírás', 'leiras',
    // RO
    'descriere',
    // Cyrillic – BG / RU
    'описание',
    // Cyrillic – UK
    'опис',
    // Greek – EL
    'περιγραφή', 'περιγραφη',
    // CJK – JA
    '説明',
    // CJK – KO
    '설명',
    // CJK – ZH
    '描述',
  ],

  price: [
    // IT
    'prezzo', 'prezzo unitario', 'prezzo netto', 'prezzo listino', 'costo', 'costo unitario', 'importo', 'importo unitario', 'tariffa', 'valore', 'euro', 'eur', '€', 'listino',
    // EN
    'price', 'unit price', 'unit_price', 'net price', 'list price', 'amount',
    // DE
    'preis', 'einzelpreis',
    // NL
    'prijs',
    // ES
    'precio',
    // PT
    'preço', 'preco',
    // FR
    'prix',
    // HR
    'cijena',
    // PL / CS / SK / SL
    'cena',
    // RO
    'preț', 'pret',
    // Cyrillic – BG / RU
    'цена',
    // Cyrillic – UK
    'ціна',
    // Greek – EL
    'τιμή', 'τιμη',
    // CJK – JA
    '価格',
    // CJK – KO
    '가격',
    // CJK – ZH
    '价格',
  ],

  markup: [
    // IT
    'markup', 'markup_percent', 'ricarico', 'margine', 'sconto_negativo',
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
    'marža', 'marza',
    // PL
    'marża',
    // HU
    'haszonkulcs',
    // RO
    'adaos',
    // CS
    'přirážka', 'prirazka',
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
    'προσαύξηση', 'προσαυξηση',
    // CJK – JA
    'マークアップ',
    // CJK – KO
    '마크업',
    // CJK – ZH
    '加价',
  ],

  unit: [
    // IT
    'unità', 'unita', 'um', 'misura', 'uom', 'unit_measure', 'unita_misura',
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
    'unité', 'unite',
    // HR
    'jedinica',
    // PL
    'jednostka',
    // HU
    'egység', 'egyseg',
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
    'μονάδα', 'μοναδα',
    // CJK – JA
    '単位',
    // CJK – KO
    '단위',
    // CJK – ZH
    '单位',
  ],

  priceUnit: [
    // IT
    'prezzo unità', 'prezzo_unita', 'prezzo unitario', 'prezzo_x',
    // EN
    'price unit', 'price_unit', 'pricing unit', 'price uom', 'uom price',
    // DE
    'stückpreis', 'stuckpreis', 'einzelpreis',
    // NL
    'eenheidsprijs',
    // ES
    'precio unitario',
    // PT
    'preço unitário', 'preco unitario',
    // FR
    'prix unitaire',
    // HR
    'jedinična cijena', 'jedinicna cijena',
    // PL
    'cena jednostkowa',
    // HU
    'egységár', 'egysegar',
    // RO
    'preț unitar', 'pret unitar',
    // CS / SK
    'jednotková cena', 'jednotkova cena',
    // SL
    'cena na enoto',
    // Cyrillic – BG
    'единична цена',
    // Cyrillic – RU
    'цена за единицу',
    // Cyrillic – UK
    'ціна за одиницю',
    // Greek – EL
    'τιμή μονάδας', 'τιμη μοναδας',
    // CJK – JA
    '単価',
    // CJK – KO
    '단가',
    // CJK – ZH
    '单价',
  ],

  packQty: [
    // IT
    'confezione', 'pezzi_confezione', 'qta_confezione', 'lunghezza',
    // EN
    'pack qty', 'pack_qty', 'pcs pack', 'qty pack', 'length', 'coil length', 'reel length',
    // DE
    'länge', 'lange', 'packung', 'gebindegröße', 'gebindegrosse',
    // NL
    'lengte', 'verpakking',
    // ES
    'longitud', 'embalaje',
    // PT
    'comprimento', 'embalagem',
    // FR
    'longueur', 'emballage',
    // HR
    'duljina', 'pakiranje',
    // PL
    'długość', 'dlugosc', 'opakowanie',
    // HU
    'hossz', 'csomagolás', 'csomagolas',
    // RO
    'lungime', 'ambalaj',
    // CS
    'délka', 'delka', 'balení', 'baleni',
    // SK
    'dĺžka', 'dlzka', 'balenie',
    // SL
    'dolžina', 'dolzina',
  ],

  quantity: [
    // IT
    'quantità', 'quantita', 'qta', 'q.t.a',
    // EN
    'quantity', 'qty',
    // DE
    'menge', 'anzahl',
    // NL
    'aantal',
    // ES
    'cantidad',
    // PT
    'quantidade',
    // FR
    'quantité', 'quantite',
    // HR / SL
    'količina', 'kolicina',
    // PL
    'ilość', 'ilosc',
    // HU
    'mennyiség', 'mennyiseg',
    // RO
    'cantitate',
    // CS
    'množství', 'mnozstvi',
    // SK
    'množstvo', 'mnozstvo',
    // Cyrillic – BG / RU
    'количество',
    // Cyrillic – UK
    'кількість',
    // Greek – EL
    'ποσότητα', 'ποσοτητα',
    // CJK – JA / ZH
    '数量',
    // CJK – KO
    '수량',
  ],

  weight: [
    'peso', 'peso unitario', 'peso kg', 'peso netto',
    'weight', 'unit weight', 'net weight',
    'gewicht', 'poids', 'peso neto', 'peso liquido',
    'massa', 'mass', 'kg', 'peso articulo',
  ],

  area: [
    'area', 'superficie', 'surface', 'sqm', 'mq', 'm2',
  ],

  volume: [
    'volume', 'vol', 'capacita', 'capacity', 'm3', 'mc', 'litri', 'liters', 'litres',
  ],

  code: [
    // IT
    'codice', 'cod', 'item_code',
    // EN
    'code', 'sku', 'ref', 'part no', 'part_no', 'item no', 'item_no',
    // DE
    'artikelnummer', 'artikelnr', 'artnr',
    // NL
    'referentie',
    // ES
    'código', 'codigo', 'referencia',
    // PT
    'artigo', 'referência',
    // FR
    'référence', 'reference', 'code article',
    // HR
    'šifra', 'sifra',
    // PL
    'kod',
    // HU
    'cikkszám', 'cikkszam',
    // RO
    'cod',
    // CS / SK
    'kód',
    // Cyrillic – BG / RU
    'код',
    // Greek – EL
    'κωδικός', 'κωδικος',
    // CJK – JA
    '品番', '商品コード',
    // CJK – KO
    '코드',
    // CJK – ZH
    '编号',
  ],
};

const UNIT_ALIASES: Record<string, string> = {
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

function parseLocalizedNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^0-9,.-]/g, '');
  if (!cleaned) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized = cleaned;
  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    // Normalize aliases the same way headers are normalized so accents, case and
    // underscores all match consistently across every language.
    const normalizedAliases = aliases.map((a) => normalizeText(a));
    const idx = headers.findIndex((h) => normalizedAliases.some((a) => h.includes(a)));
    if (idx >= 0) map[canonical] = idx;
  }
  return map;
}

function detectLikelyHeaderIndex(rows: unknown[][]): number {
  const maxProbe = Math.min(rows.length, 10);
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < maxProbe; i++) {
    const row = rows[i] ?? [];
    const normalized = row.map((cell) => normalizeText(cell));
    const score = Object.values(HEADER_ALIASES).reduce((acc, aliases) => {
      const normalizedAliases = aliases.map((alias) => normalizeText(alias));
      const found = normalized.some((value) => normalizedAliases.some((alias) => value.includes(alias)));
      return acc + (found ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function isLikelyCodeCell(value: string): boolean {
  return /^[a-z0-9._/-]{2,}$/i.test(value) && !/\s/.test(value) && parseLocalizedNumber(value) === null;
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
      .filter(({ index, stat }) =>
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

  const referenceDescription = inferColumnIndex(sampleRows, undefined, 'description', exclude);
  const ranked = stats
    .map((stat, index) => ({ index, stat }))
    .filter(({ index, stat }) =>
      !exclude.includes(index) &&
      index !== referenceDescription &&
      stat.nonEmpty > 0 &&
      stat.numeric > 0 &&
      stat.numeric >= stat.text
    )
    .sort((a, b) => {
      const aRightOfDesc = referenceDescription !== undefined && a.index > referenceDescription ? 1 : 0;
      const bRightOfDesc = referenceDescription !== undefined && b.index > referenceDescription ? 1 : 0;
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
        normalizedPriceRows: acc.summary.normalizedPriceRows + current.summary.normalizedPriceRows,
        unitDetectedRows: acc.summary.unitDetectedRows + current.summary.unitDetectedRows,
        pendingReferenceRows: acc.summary.pendingReferenceRows + current.summary.pendingReferenceRows,
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
  return row
    .map((cell) => String(cell ?? '').trim())
    .filter((cell) => cell.length > 0);
}

function isLikelyHeaderText(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return Object.values(HEADER_ALIASES)
    .flat()
    .map((alias) => normalizeText(alias))
    .some((alias) => normalized.includes(alias));
}

function isLikelyContextLabel(value: string): boolean {
  const raw = String(value ?? '').trim();
  const normalized = normalizeText(raw);
  if (!normalized) return false;
  if (normalized.length < 3) return false;
  if (parseLocalizedNumber(raw) !== null) return false;
  if (isLikelyHeaderText(raw)) return false;
  if (/^(totale|subtotal|subtotale|pagina|page|pag\.?|codice|cod\.?)$/i.test(normalized)) return false;
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

  const best = candidates
    .sort((a, b) => b.length - a.length)[0];

  return best || null;
}

function extractContextLabelFromRow(row: unknown[], description: string, directPrice: number | null): string | null {
  const cells = getNonEmptyCellTexts(row);
  if (!cells.length) return null;
  if (directPrice !== null) return null;

  const combined = cells.join(' ').trim();
  const singleLabel = cells.length === 1 ? cells[0] : combined;
  if (!isLikelyContextLabel(singleLabel)) return null;

  if (cells.length === 1) return singleLabel;
  if (description && description === cells[0] && isMostlyUppercase(description)) return description;
  if (combined.length <= 80 && isMostlyUppercase(combined)) return combined;

  return null;
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
  const match = text.match(/\b(mm|cm|mt|m|m2|mq|m3|mc|kg|g|ton|t|lt|l|pz|pezzo|pezzi|pcs|pc|nr|bobina|rotolo|matassa|conf|confezione|scatola|pallet)\b/);
  if (!match) return null;
  return normalizeUnit(match[1]);
}

function parseQuantityWithUnit(value: unknown): { qty: number; unit: string | null } | null {
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

function inferPackFromDescription(description: string, preferredUnit: string | null): { qty: number; unit: string | null } | null {
  const text = normalizeText(description);

  const explicitPer = text.match(/(?:bobina|rotolo|matassa|conf(?:ezione)?|scatola|pallet)\s*(?:da)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(mm|cm|mt|m|m2|mq|m3|mc|kg|g|t|l|pz|pcs|pc|nr)?/);
  if (explicitPer) {
    const qty = parseLocalizedNumber(explicitPer[1]);
    if (qty !== null) return { qty, unit: normalizeUnit(explicitPer[2] || preferredUnit) };
  }

  const genericQtyUnit = text.match(/\b([0-9]+(?:[.,][0-9]+)?)\s*(mm|cm|mt|m|m2|mq|m3|mc|kg|g|t|l|pz|pcs|pc|nr)\b/);
  if (genericQtyUnit) {
    const qty = parseLocalizedNumber(genericQtyUnit[1]);
    if (qty !== null) return { qty, unit: normalizeUnit(genericQtyUnit[2]) };
  }

  const onlyQty = text.match(/\b(?:x|da|conf(?:ezione)?|pack)\s*([0-9]+(?:[.,][0-9]+)?)\b/);
  if (onlyQty) {
    const qty = parseLocalizedNumber(onlyQty[1]);
    if (qty !== null) return { qty, unit: preferredUnit };
  }

  return null;
}

function toBaseQuantity(qty: number, unit: string | null): { qty: number; baseUnit: string | null } {
  if (!unit) return { qty, baseUnit: null };
  const conv = BASE_UNIT_FACTORS[unit];
  if (!conv) return { qty, baseUnit: unit };
  return { qty: qty * conv.factor, baseUnit: conv.base };
}

function extractMeasurementFromColumn(value: unknown, fallbackUnit: string | null): { qty: number; unit: string | null } | null {
  const parsed = parseQuantityWithUnit(value);
  if (parsed) return parsed;

  const qty = parseLocalizedNumber(value);
  if (qty === null) return null;
  return { qty, unit: fallbackUnit };
}

function extractWeightFromDescription(description: string): { qty: number; unit: string | null } | null {
  const text = normalizeText(description);
  const match = text.match(/\b([0-9]+(?:[.,][0-9]+)?)\s*(kg|g|ton|t)\b/);
  if (!match) return null;
  const qty = parseLocalizedNumber(match[1]);
  if (qty === null) return null;
  return { qty, unit: normalizeUnit(match[2]) };
}

function extractAreaFromDescription(description: string): { qty: number; unit: string | null } | null {
  const text = normalizeText(description);
  const match = text.match(/\b([0-9]+(?:[.,][0-9]+)?)\s*(mq|m2|sqm)\b/);
  if (!match) return null;
  const qty = parseLocalizedNumber(match[1]);
  if (qty === null) return null;
  return { qty, unit: normalizeUnit(match[2]) };
}

function extractVolumeFromDescription(description: string): { qty: number; unit: string | null } | null {
  const text = normalizeText(description);
  const match = text.match(/\b([0-9]+(?:[.,][0-9]+)?)\s*(m3|mc|lt|l)\b/);
  if (!match) return null;
  const qty = parseLocalizedNumber(match[1]);
  if (qty === null) return null;
  return { qty, unit: normalizeUnit(match[2]) };
}

function inferRuleKey(params: { description: string; category?: string | null; documentTitle?: string | null }): string | null {
  const haystack = normalizeText([params.description, params.category, params.documentTitle].filter(Boolean).join(' '));
  if (!haystack) return null;

  if (/(acciaio|ferro|lamiera|trave|putrella|tondino|profilat)/.test(haystack)) return 'metal_ferrous';
  if (/(rame|copper|ottone|brass|bronzo|bronze|alluminio|aluminum)/.test(haystack)) return 'metal_nonferrous';
  if (/(cavo|cavi|cable|corrugato|guaina|filo elettric)/.test(haystack)) return 'electric_cable';
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
    extractMeasurementFromColumn(params.weightValue, 'kg') || extractWeightFromDescription(params.description),
    extractMeasurementFromColumn(params.lengthValue, 'm'),
    extractMeasurementFromColumn(params.areaValue, 'm2') || extractAreaFromDescription(params.description),
    extractMeasurementFromColumn(params.volumeValue, 'm3') || extractVolumeFromDescription(params.description),
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
  const inferredDescriptionIndex = inferColumnIndex(sampleRows, headerMap.description, 'description');
  const inferredPriceIndex = inferColumnIndex(sampleRows, headerMap.price ?? headerMap.priceUnit, 'price', inferredDescriptionIndex !== undefined ? [inferredDescriptionIndex] : []);
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

    if (!description || /^(totale|subtotal|subtotale|pagina|page|pag\.?)$/i.test(normalizeText(description))) {
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
    const priceUnitRaw = headerMap.priceUnit !== undefined ? row[headerMap.priceUnit] : null;
    const packRaw = headerMap.packQty !== undefined ? row[headerMap.packQty] : null;
    const quantityRaw = headerMap.quantity !== undefined ? row[headerMap.quantity] : null;
    const weightRaw = headerMap.weight !== undefined ? row[headerMap.weight] : null;
    const lengthRaw = headerMap.packQty !== undefined ? row[headerMap.packQty] : null;
    const areaRaw = headerMap.area !== undefined ? row[headerMap.area] : null;
    const volumeRaw = headerMap.volume !== undefined ? row[headerMap.volume] : null;

    const markup = parseLocalizedNumber(markupRaw) ?? 0;
    const normalizedUnit = normalizeUnit(unitRaw) || normalizeUnit(priceUnitRaw) || unitFromDescription(description);
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

    const packFromColumn = parseQuantityWithUnit(packRaw) || parseQuantityWithUnit(quantityRaw);
    const packFromDesc = inferPackFromDescription(description, normalizedUnit);
    const pack = packFromColumn || packFromDesc;

    let unitPrice = directPrice;

    const isPricePerUnit = /\/(mm|cm|mt|m|m2|mq|m3|mc|kg|g|t|l|pz|pcs|pc|nr)\b/i.test(String(priceUnitRaw ?? ''));
    if (unitPrice !== null && unitPrice >= 0 && directPrice !== null && !isPricePerUnit && pack && pack.qty > 0) {
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
      pricing_status: unitPrice !== null && unitPrice >= 0 ? 'resolved' : 'needs_reference',
      pricing_basis_unit: pricingBasis?.unit || null,
      pricing_basis_quantity: pricingBasis?.qty ?? null,
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

export function mergeUniversalImportResults(results: UniversalImportResult[]): UniversalImportResult {
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

  const tabCells = cleanLine.split(/\t+/).map((cell) => cell.trim()).filter(Boolean);
  if (tabCells.length > 1) return tabCells;

  const spacedCells = cleanLine.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
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
    .map((line) => line.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !/^(pagina|page|pag\.?)\s+\d+(\s+di\s+\d+)?$/i.test(line));

  const rows = lines
    .map(tokenizePdfLine)
    .filter((row) => row.length > 0 && row.some((cell) => String(cell ?? '').trim() !== ''));

  return parseRows(rows);
}
