/**
 * Finding what was said or typed in the price list. Identical copy in
 * web/lib/listinoSearch.ts (mobile and web share no package): change both.
 * A test in the web project fails when the two differ.
 */

export function normalizeName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Speech recognition spells the steel profiles out: "acca e a 200", "ip e 120", "u p n 80".
 * The same rules run on the server before the AI (voice-process).
 */
export function normalizeSpokenTrade(text: string): string {
  return String(text ?? '')
    .replace(
      /\b(?:acca\s*e|h\s*e)\s*(a|b)(?:i)?\b/gi,
      (_, letter: string) => `HE${letter.toUpperCase()}`
    )
    .replace(/\bh\s+e\s*(a|b)\b/gi, (_, letter: string) => `HE${letter.toUpperCase()}`)
    .replace(/\bi\s*p\s*e\b(?=\s*\d|\s*$)/gi, 'IPE')
    .replace(/\bu\s*p\s*n\b/gi, 'UPN');
}

// Words that say nothing about which article it is.
const SEARCH_STOPWORDS = new Set([
  'aggiungi',
  'aggiungere',
  'metti',
  'mettere',
  'inserisci',
  'anche',
  'poi',
  'di',
  'da',
  'del',
  'dello',
  'della',
  'dei',
  'degli',
  'delle',
  'con',
  'per',
  'tra',
  'fra',
  'al',
  'allo',
  'alla',
  'ai',
  'agli',
  'alle',
  'il',
  'lo',
  'la',
  'le',
  'gli',
  'un',
  'una',
  'uno',
  'ed',
  'mm',
  'cm',
  'mt',
  'ml',
  'metri',
  'metro',
  'pezzi',
  'pezzo',
  'pz',
  'kg',
  'chili',
  'litri',
  'nr',
  'numero',
]);

// Often said, rarely written on the article: they can only break a tie.
const OPTIONAL_WORDS = new Set(['ferr', 'acciai', 'diametr', 'spessor']);

// How tradespeople call what price lists name differently (keys and values are stems).
const SEARCH_ALIASES: Record<string, string[]> = {
  tondin: ['tond'],
  putrell: ['putrel', 'ipe', 'hea', 'heb', 'trav'],
  upn: ['upn', 'canal'],
  scatolat: ['scatolat', 'tubolar', 'tub'],
};

/** Letters and digits apart: "40x20" -> "40 20", "10mm" -> "10 mm", "ipe100" -> "ipe 100". */
function splitGluedTokens(text: string): string {
  return text
    .replace(/(\d)\s*[x×*]\s*(?=\d)/gi, '$1 ')
    .replace(/([a-z])(\d)/gi, '$1 $2')
    .replace(/(\d)([a-z])/gi, '$1 $2');
}

/**
 * Speech recognition splits abbreviations into letters: "ip e 120" -> "ipe 120",
 * "u p n" -> "upn". Runs of 1-2 letter pieces are joined back together.
 */
export function joinSplitAbbreviations(tokens: string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 1) out.push(run.join(''));
    else out.push(...run);
    run = [];
  };
  for (const token of tokens) {
    if (/^[a-z]{1,2}$/.test(token) && !SEARCH_STOPWORDS.has(token)) run.push(token);
    else {
      flush();
      out.push(token);
    }
  }
  flush();
  return out.filter(Boolean);
}

export type ListinoQuery = {
  /** Every word must be found; each entry lists the spellings that count. */
  required: string[][];
  /** Only used to order equally good articles. */
  optional: string[];
  /** Sizes, repeated when said twice ("40 x 40"). */
  numbers: string[];
  /** Shapes, as an exact phrase: "a t" must not match "lastra t". */
  phrases: string[];
  /** The words as they were said, for the typing-error search. */
  plainWords: string[];
};

export function parseListinoQuery(query: string): ListinoQuery {
  const spoken = splitGluedTokens(normalizeSpokenTrade(query));
  const phrases: string[] = [];
  const withoutShapes = normalizeName(spoken).replace(/\ba ([tul])\b/g, (phrase) => {
    phrases.push(phrase);
    return ' ';
  });

  const plainWords = joinSplitAbbreviations(
    withoutShapes.split(' ').filter(Boolean)
  ).filter(
    (word) => word.length >= 3 && !/^\d+$/.test(word) && !SEARCH_STOPWORDS.has(word)
  );
  const stems = Array.from(
    new Set(
      plainWords.map((word) =>
        word.length >= 4 && /[aeiou]$/.test(word) ? word.slice(0, -1) : word
      )
    )
  );
  const optional = stems.filter((stem) => OPTIONAL_WORDS.has(stem));
  const main = stems.filter((stem) => !OPTIONAL_WORDS.has(stem));
  // Only "ferro" was said: then it is what is being looked for.
  const requiredStems = main.length ? main : optional;

  return {
    required: requiredStems.map((stem) => SEARCH_ALIASES[stem] || [stem]),
    optional: main.length ? optional : [],
    numbers: (spoken.match(/\d+(?:[.,]\d+)?/g) || []).map((number) =>
      number.replace('.', ',')
    ),
    phrases: Array.from(new Set(phrases)),
    plainWords,
  };
}

/** Value for a PostgREST filter: a comma or a space would end it, unless quoted. */
function ilike(value: string): string {
  return `description.ilike.${/[, ]/.test(value) ? `"%${value}%"` : `%${value}%`}`;
}

function numberSpellings(number: string): string[] {
  return number.includes(',') ? [number, number.replace(',', '.')] : [number];
}

/**
 * Filters for the database. `all`: one `.or()` per entry, chained, so an article must
 * satisfy each of them. `any`: a single `.or()`, the wider search used when `all` finds nothing.
 */
export function buildListinoFilters(parsed: ListinoQuery): {
  all: string[];
  any: string | null;
} {
  const numbers = Array.from(new Set(parsed.numbers));
  const all = [
    ...parsed.required.map((variants) => variants.map(ilike).join(',')),
    ...numbers.map((number) => numberSpellings(number).map(ilike).join(',')),
    ...parsed.phrases.map(ilike),
  ];
  const wide = parsed.required.length
    ? parsed.required.flat().map(ilike)
    : numbers.flatMap(numberSpellings).map(ilike);
  return { all, any: wide.length ? Array.from(new Set(wide)).join(',') : null };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** How many times the exact number appears: "10" is in "10 mm", not in "100" or "0,10". */
function countNumber(description: string, number: string): number {
  const variants = numberSpellings(number).map(escapeRegExp).join('|');
  const pattern = new RegExp(`(^|[^\\d,.])(${variants})(?![\\d]|[,.]\\d)`, 'g');
  return (String(description ?? '').match(pattern) || []).length;
}

/**
 * Price list candidates, best first. fullMatch: the article has every word, shape and
 * size that was said, so it can be preselected when it is the only one.
 */
export function rankListinoMatches<T extends { description: string }>(
  items: T[],
  query: string
): Array<T & { fullMatch: boolean }> {
  const { required, optional, numbers, phrases } = parseListinoQuery(query);
  const needed = new Map<string, number>();
  numbers.forEach((number) => needed.set(number, (needed.get(number) || 0) + 1));

  return items
    .map((item) => {
      const text = normalizeName(item.description);
      // The size is in the name ("Travi IPE 100"), not in the details after "(" or " - ".
      const name = String(item.description ?? '').split(/\s+-\s+|\(/)[0];
      const sizeText = /\d/.test(name) ? name : item.description;
      return {
        item,
        hits: required.filter((variants) =>
          variants.some((variant) => text.includes(variant))
        ).length,
        optionalHits: optional.filter((word) => text.includes(word)).length,
        phraseHits: phrases.filter((phrase) => new RegExp(`\\b${phrase}\\b`).test(text))
          .length,
        numberHits: Array.from(needed).reduce(
          (sum, [number, count]) => sum + Math.min(count, countNumber(sizeText, number)),
          0
        ),
      };
    })
    .filter(({ hits, numberHits, phraseHits }) =>
      required.length ? hits > 0 : numbers.length ? numberHits > 0 : phraseHits > 0
    )
    .sort(
      (a, b) =>
        b.hits - a.hits ||
        b.phraseHits - a.phraseHits ||
        b.numberHits - a.numberHits ||
        b.optionalHits - a.optionalHits ||
        a.item.description.length - b.item.description.length ||
        a.item.description.localeCompare(b.item.description)
    )
    .map(({ item, hits, numberHits, phraseHits }) => ({
      ...item,
      fullMatch:
        hits === required.length &&
        numberHits === numbers.length &&
        phraseHits === phrases.length,
    }));
}
