/**
 * Punto 20: Quote validation API endpoint
 * POST /api/quote/validate
 * Validates quote items before sending
 */

import { NextRequest, NextResponse } from 'next/server';

interface QuoteItem {
  descrizione: string;
  quantita: number;
  prezzo_unitario: number;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  field: string;
  message: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, vatPercent = 22 } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ valid: false, errors: [{ type: 'error', field: 'items', message: 'No items in quote' }] }, { status: 400 });
    }

    const issues: ValidationIssue[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i] as QuoteItem;
      const label = `Riga ${i + 1}`;

      if (!item.descrizione || item.descrizione.trim().length === 0) {
        issues.push({ type: 'error', field: label, message: 'Descrizione mancante' });
      }
      if (item.prezzo_unitario === 0) {
        issues.push({ type: 'warning', field: label, message: `Prezzo zero per "${item.descrizione}"` });
      }
      if (item.prezzo_unitario < 0) {
        issues.push({ type: 'error', field: label, message: 'Prezzo negativo' });
      }
      if (item.quantita <= 0) {
        issues.push({ type: 'error', field: label, message: 'Quantità non valida' });
      }
      if (item.quantita > 10000) {
        issues.push({ type: 'warning', field: label, message: `Quantità molto alta: ${item.quantita}` });
      }
    }

    // Check for duplicates
    const descriptions = items.map((i: QuoteItem) => i.descrizione?.toLowerCase().trim());
    const seen = new Set<string>();
    for (const desc of descriptions) {
      if (desc && seen.has(desc)) {
        issues.push({ type: 'warning', field: 'Duplicati', message: `"${desc}" appare più volte` });
      }
      if (desc) seen.add(desc);
    }

    // Total sanity check
    const subtotal = items.reduce((s: number, i: QuoteItem) => s + i.quantita * i.prezzo_unitario, 0);
    const total = subtotal * (1 + vatPercent / 100);
    if (total > 500000) {
      issues.push({ type: 'warning', field: 'Totale', message: `Totale molto alto: €${total.toFixed(2)}` });
    }
    if (total < 1 && total > 0) {
      issues.push({ type: 'warning', field: 'Totale', message: `Totale molto basso: €${total.toFixed(2)}` });
    }

    const errors = issues.filter(i => i.type === 'error');
    const warnings = issues.filter(i => i.type === 'warning');

    return NextResponse.json({
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        items: items.length,
        subtotal: Number(subtotal.toFixed(2)),
        vat: Number((subtotal * vatPercent / 100).toFixed(2)),
        total: Number(total.toFixed(2)),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
