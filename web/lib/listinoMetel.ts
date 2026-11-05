import type {
  UniversalImportResult,
  UniversalParsedItem,
} from './listinoUniversalImport';

/**
 * METEL price list (tracciato 020/021), the Italian standard for electrical and
 * plumbing wholesalers: fixed-width records, no separators.
 * Detail record (1-based columns): brand 1-3, product code 4-19, EAN 20-32,
 * description 33-75, pack qty 76-80, ..., wholesaler price 98-108, public price
 * 109-119 (9 integer + 2 decimal digits, no separator), price multiplier 120-125
 * (price refers to N units), currency 126-128, unit 129-131, product status 133
 * (9 = obsolete), discount family 142-159, statistical family 160-177.
 */

const METEL_HEADER_RE = /^LISTINO METEL/i;
const MIN_DETAIL_LENGTH = 131;

function field(line: string, start: number, length: number): string {
  return line.slice(start - 1, start - 1 + length).trim();
}

function metelPrice(raw: string): number | null {
  if (!/^\d{1,11}$/.test(raw)) return null;
  return Number(raw) / 100;
}

const METEL_UNITS: Record<string, string> = {
  PZ: 'pcs',
  NR: 'pcs',
  N: 'pcs',
  CF: 'pcs',
  CT: 'pcs',
  SC: 'pcs',
  KT: 'pcs',
  PA: 'pcs',
  CP: 'pcs',
  MT: 'm',
  M: 'm',
  ML: 'm',
  KG: 'kg',
  GR: 'kg',
  LT: 'l',
  L: 'l',
  MQ: 'm2',
  M2: 'm2',
  MC: 'm3',
  M3: 'm3',
};

function looksLikeDetailRecord(line: string): boolean {
  if (line.length < MIN_DETAIL_LENGTH) return false;
  return (
    /^[A-Z0-9 ]{3}$/i.test(line.slice(0, 3)) &&
    /^\d{11}$/.test(line.slice(97, 108)) &&
    /^\d{11}$/.test(line.slice(108, 119)) &&
    /^\d{6}$/.test(line.slice(119, 125))
  );
}

/** True for METEL files: the header record, or mostly well-formed detail records. */
export function isMetelText(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return false;
  if (METEL_HEADER_RE.test(lines[0])) return true;
  const sample = lines.slice(0, 50);
  return (
    sample.filter(looksLikeDetailRecord).length >=
    Math.max(3, Math.ceil(sample.length * 0.8))
  );
}

export function parseMetelText(text: string): UniversalImportResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const items: UniversalParsedItem[] = [];
  let skippedRows = 0;
  let unitDetectedRows = 0;

  for (const line of lines) {
    if (METEL_HEADER_RE.test(line)) continue;
    if (!looksLikeDetailRecord(line)) {
      skippedRows++;
      continue;
    }

    const brand = field(line, 1, 3);
    const code = field(line, 4, 16);
    const description = field(line, 33, 43);
    const status = field(line, 133, 1);
    const wholesalePrice = metelPrice(field(line, 98, 11));
    const publicPrice = metelPrice(field(line, 109, 11));
    const multiplier = Math.max(1, Number(field(line, 120, 6)) || 1);
    const unitCode = field(line, 129, 3).toUpperCase();

    // Obsolete products and rows without a price are not quotable.
    const listPrice = publicPrice && publicPrice > 0 ? publicPrice : wholesalePrice;
    if (status === '9' || !description || !listPrice || listPrice <= 0) {
      skippedRows++;
      continue;
    }

    const unit = METEL_UNITS[unitCode] || null;
    if (unit) unitDetectedRows++;
    items.push({
      description: `${description} (cod. ${brand} ${code})`,
      unit_price: Number((listPrice / multiplier).toFixed(6)),
      markup_percent: 0,
      category: null,
      pricing_source: 'file',
      pricing_status: 'resolved',
      pricing_basis_unit: unit,
      pricing_basis_quantity: unit ? 1 : null,
      inferred_rule_key: null,
    });
  }

  return {
    items,
    summary: {
      totalRows: lines.length,
      parsedRows: items.length,
      skippedRows,
      normalizedPriceRows: items.length,
      unitDetectedRows,
      pendingReferenceRows: 0,
    },
  };
}
