/**
 * Quote validation - AI-powered sanity checks before sending.
 * Punto 20: Validazione AI - check totals are logical before allowing send.
 */

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  errors: ValidationError[];
}

export interface ValidationWarning {
  type: 'high_total' | 'low_total' | 'missing_tax' | 'duplicate_items' | 'zero_price' | 'high_quantity' | 'negative_value' | 'unusual_markup';
  message: string;
  itemIndex?: number;
}

export interface ValidationError {
  type: 'no_items' | 'invalid_data';
  message: string;
}

interface QuoteItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

/**
 * Validate quote items for logical consistency.
 * Returns warnings (non-blocking) and errors (blocking).
 */
export function validateQuote(
  items: QuoteItem[],
  vatPercent: number = 22,
  options?: {
    maxReasonableTotal?: number;
    minReasonableTotal?: number;
    maxReasonableQuantity?: number;
  }
): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationError[] = [];
  const maxTotal = options?.maxReasonableTotal ?? 500000; // €500k
  const minTotal = options?.minReasonableTotal ?? 1; // €1
  const maxQty = options?.maxReasonableQuantity ?? 10000;

  // Error: no items
  if (!items || items.length === 0) {
    errors.push({ type: 'no_items', message: 'Il preventivo non contiene voci di costo' });
    return { valid: false, warnings, errors };
  }

  let subtotal = 0;

  // Per-item checks
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Zero price
    if (item.unit_price === 0) {
      warnings.push({
        type: 'zero_price',
        message: `"${item.description}" ha prezzo €0.00`,
        itemIndex: i,
      });
    }

    // Negative values
    if (item.unit_price < 0) {
      warnings.push({
        type: 'negative_value',
        message: `"${item.description}" ha prezzo negativo: €${item.unit_price.toFixed(2)}`,
        itemIndex: i,
      });
    }

    if (item.quantity <= 0) {
      warnings.push({
        type: 'negative_value',
        message: `"${item.description}" ha quantità ≤ 0: ${item.quantity}`,
        itemIndex: i,
      });
    }

    // Unusually high quantity
    if (item.quantity > maxQty) {
      warnings.push({
        type: 'high_quantity',
        message: `"${item.description}" ha quantità molto alta: ${item.quantity}`,
        itemIndex: i,
      });
    }

    // Unusual markup (>200%)
    if (item.tax_rate && item.tax_rate > 200) {
      warnings.push({
        type: 'unusual_markup',
        message: `"${item.description}" ha ricarico molto alto: ${item.tax_rate}%`,
        itemIndex: i,
      });
    }

    const lineTotal = item.quantity * item.unit_price * (1 + (item.tax_rate || 0) / 100);
    subtotal += lineTotal;
  }

  // Check for duplicate items
  const descCounts = new Map<string, number>();
  for (const item of items) {
    const key = item.description.toLowerCase().trim();
    descCounts.set(key, (descCounts.get(key) || 0) + 1);
  }
  for (const [desc, count] of descCounts) {
    if (count > 1) {
      warnings.push({
        type: 'duplicate_items',
        message: `"${desc}" appare ${count} volte nel preventivo`,
      });
    }
  }

  // Total sanity checks
  const totalWithVat = subtotal * (1 + vatPercent / 100);

  if (totalWithVat > maxTotal) {
    warnings.push({
      type: 'high_total',
      message: `Totale molto alto: €${totalWithVat.toFixed(2)} (oltre €${maxTotal.toLocaleString()})`,
    });
  }

  if (totalWithVat > 0 && totalWithVat < minTotal) {
    warnings.push({
      type: 'low_total',
      message: `Totale molto basso: €${totalWithVat.toFixed(2)}`,
    });
  }

  // No tax when expected
  if (vatPercent === 0 && items.some((i) => !i.tax_rate || i.tax_rate === 0)) {
    warnings.push({
      type: 'missing_tax',
      message: 'IVA al 0% — verificare se corretto per la nazione',
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Format validation results into a human-readable message.
 */
export function formatValidationMessage(result: ValidationResult): string {
  const parts: string[] = [];

  if (result.errors.length > 0) {
    parts.push('❌ ERRORI:');
    for (const err of result.errors) {
      parts.push(`  • ${err.message}`);
    }
  }

  if (result.warnings.length > 0) {
    parts.push('⚠️ AVVISI:');
    for (const warn of result.warnings) {
      parts.push(`  • ${warn.message}`);
    }
  }

  if (parts.length === 0) {
    return '✅ Preventivo valido — nessun problema rilevato';
  }

  return parts.join('\n');
}
