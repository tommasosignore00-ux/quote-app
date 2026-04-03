/**
 * Cross-selling AI suggestions.
 * Punto 13: Cross-Selling AI - suggest related products.
 * e.g., "Caldaia" → suggests "Cronotermostato", "Valvola di sicurezza", etc.
 */

// Static cross-selling rules by product category keywords
const CROSS_SELL_RULES: Record<string, string[]> = {
  // Idraulica
  caldaia: ['cronotermostato', 'valvola di sicurezza', 'tubo rame', 'termostato ambiente', 'kit fumi'],
  radiatore: ['valvola termostatica', 'detentore', 'staffa murale', 'raccordo'],
  termosifone: ['valvola termostatica', 'detentore', 'staffa murale', 'raccordo'],
  scaldabagno: ['gruppo sicurezza', 'tubo flessibile', 'vaso espansione', 'valvola'],
  boiler: ['gruppo sicurezza', 'tubo flessibile', 'vaso espansione', 'anodo magnesio'],
  rubinetto: ['flessibile', 'sifone', 'guarnizione', 'rosone', 'aeratore'],
  miscelatore: ['flessibile', 'sifone', 'guarnizione', 'piletta', 'rosone'],
  wc: ['cassetta', 'sedile', 'tubo scarico', 'guarnizione', 'braga'],
  bidet: ['rubinetto bidet', 'sifone', 'piletta', 'flessibile'],
  lavabo: ['sifone', 'piletta', 'rubinetto', 'flessibile', 'mensola'],
  doccia: ['piatto doccia', 'colonna doccia', 'sifone', 'box doccia', 'saliscendi'],
  vasca: ['rubinetto vasca', 'sifone', 'pannello', 'tappo'],
  tubo: ['raccordo', 'curva', 'manicotto', 'tee', 'riduzione'],

  // Edilizia
  cemento: ['sabbia', 'ghiaia', 'rete elettrosaldata', 'distanziatore', 'additivo'],
  mattone: ['malta', 'cemento', 'ferro armatura', 'distanziatore'],
  intonaco: ['rete portaintonaco', 'paraspigolo', 'primer', 'fissativo'],
  piastrella: ['colla', 'fugante', 'distanziatore', 'battiscopa', 'profilo'],
  pavimento: ['massetto', 'colla', 'battiscopa', 'profilo', 'soglia'],
  cartongesso: ['profilo metallico', 'vite', 'stucco', 'nastro carta', 'rasante'],
  isolamento: ['pannello isolante', 'tassello', 'rete', 'rasante', 'colla'],
  impermeabilizzazione: ['guaina', 'primer', 'membrana', 'bocchettone', 'raccordo scarico'],

  // Elettrico
  interruttore: ['placca', 'scatola incasso', 'cavo', 'morsetto'],
  presa: ['placca', 'scatola incasso', 'cavo', 'frutto'],
  quadro: ['interruttore magnetotermico', 'differenziale', 'guida din', 'morsettiera'],
  lampada: ['portalampada', 'cavo', 'interruttore', 'trasformatore'],
  cavo: ['guaina', 'morsetto', 'fascetta', 'canalina', 'tubo corrugato'],

  // Climatizzazione
  condizionatore: ['staffa', 'tubo rame', 'gas refrigerante', 'scarico condensa', 'canalina'],
  climatizzatore: ['staffa', 'tubo rame', 'gas refrigerante', 'telecomando', 'canalina'],
  pompa_calore: ['accumulo', 'vaso espansione', 'circolatore', 'valvola', 'antigelo'],
  ventilconvettore: ['valvola', 'termostato', 'filtro', 'raccordo'],
};

export interface CrossSellSuggestion {
  keyword: string;
  suggestions: string[];
  matchedRule: string;
}

/**
 * Find cross-sell suggestions based on product description.
 * Returns up to `maxSuggestions` related products.
 */
export function getCrossSellSuggestions(
  productDescription: string,
  maxSuggestions = 3
): CrossSellSuggestion[] {
  const desc = productDescription.toLowerCase().trim();
  const results: CrossSellSuggestion[] = [];

  for (const [keyword, suggestions] of Object.entries(CROSS_SELL_RULES)) {
    // Check if the keyword appears in the product description
    const keywordVariants = keyword.split('_');
    const matches = keywordVariants.some((variant) => desc.includes(variant));

    if (matches) {
      results.push({
        keyword,
        suggestions: suggestions.slice(0, maxSuggestions),
        matchedRule: keyword,
      });
    }
  }

  return results;
}

/**
 * Search for cross-sell items in the user's listino.
 * Queries Supabase for matching listino items based on cross-sell suggestions.
 */
export async function findCrossSellInListino(
  supabase: any,
  profileId: string,
  productDescription: string,
  maxResults = 5
): Promise<any[]> {
  const suggestions = getCrossSellSuggestions(productDescription);
  if (suggestions.length === 0) return [];

  // Flatten all suggestion keywords
  const allKeywords = suggestions.flatMap((s) => s.suggestions);
  const uniqueKeywords = [...new Set(allKeywords)];

  // Build OR filter for ilike search
  const orFilter = uniqueKeywords
    .slice(0, 10) // Limit to 10 keywords
    .map((kw) => `description.ilike.%${kw}%`)
    .join(',');

  const { data: items, error } = await supabase
    .from('listini_vettoriali')
    .select('id, description, unit_price, markup_percent, sku, category, listino_id')
    .eq('profile_id', profileId)
    .or(orFilter)
    .limit(maxResults);

  if (error) {
    console.warn('Cross-sell search error:', error);
    return [];
  }

  return items || [];
}
