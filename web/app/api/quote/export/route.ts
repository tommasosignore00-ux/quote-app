/**
 * Punto 46: Export quote in multiple formats (JSON, XML, CSV) for accountants
 * API Route: POST /api/quote/export
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '@/lib/apiAuth';
import { resolveVatPercent } from '@/lib/constants';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface ExportItem {
  descrizione: string;
  quantita: number;
  prezzo_unitario: number;
  totale: number;
}

/** Quotes a cell and stops spreadsheets from running it as a formula. */
function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvLine(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ');
}

function safeFileId(value: unknown): string {
  return (
    String(value ?? 'export')
      .replace(/[^\w-]/g, '_')
      .slice(0, 60) || 'export'
  );
}

function toCSV(items: ExportItem[], meta: Record<string, any>): string {
  const sep = ';';
  let csv = `# Preventivo ${meta.quote_id || ''}\n`;
  csv += `# Data: ${csvLine(meta.date || new Date().toISOString())}\n`;
  csv += `# Cliente: ${csvLine(meta.client_name)}\n`;
  csv += `# Lavoro: ${csvLine(meta.job_title)}\n\n`;
  csv += `Descrizione${sep}Quantità${sep}Prezzo Unitario${sep}Totale\n`;
  for (const item of items) {
    csv += `${csvCell(item.descrizione)}${sep}${item.quantita}${sep}${item.prezzo_unitario.toFixed(2)}${sep}${item.totale.toFixed(2)}\n`;
  }
  const subtotal = items.reduce((s, i) => s + i.totale, 0);
  const vatRate = resolveVatPercent(meta.vat_percent);
  const vat = (subtotal * vatRate) / 100;
  csv += `\n${sep}${sep}Subtotale${sep}${subtotal.toFixed(2)}\n`;
  csv += `${sep}${sep}IVA ${vatRate}%${sep}${vat.toFixed(2)}\n`;
  csv += `${sep}${sep}TOTALE${sep}${(subtotal + vat).toFixed(2)}\n`;
  return csv;
}

function toXML(items: ExportItem[], meta: Record<string, any>): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<preventivo>\n`;
  xml += `  <meta>\n    <id>${escapeXml(String(meta.quote_id || ''))}</id>\n    <data>${escapeXml(String(meta.date || new Date().toISOString()))}</data>\n    <cliente>${escapeXml(String(meta.client_name || ''))}</cliente>\n    <lavoro>${escapeXml(String(meta.job_title || ''))}</lavoro>\n  </meta>\n`;
  xml += `  <voci>\n`;
  for (const item of items) {
    xml += `    <voce>\n      <descrizione>${escapeXml(String(item.descrizione))}</descrizione>\n      <quantita>${item.quantita}</quantita>\n      <prezzo_unitario>${item.prezzo_unitario.toFixed(2)}</prezzo_unitario>\n      <totale>${item.totale.toFixed(2)}</totale>\n    </voce>\n`;
  }
  xml += `  </voci>\n`;
  const subtotal = items.reduce((s, i) => s + i.totale, 0);
  const vatRate = resolveVatPercent(meta.vat_percent);
  const vat = (subtotal * vatRate) / 100;
  xml += `  <totali>\n    <subtotale>${subtotal.toFixed(2)}</subtotale>\n    <iva_percentuale>${vatRate}</iva_percentuale>\n    <iva>${vat.toFixed(2)}</iva>\n    <totale>${(subtotal + vat).toFixed(2)}</totale>\n  </totali>\n`;
  xml += `</preventivo>`;
  return xml;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) return unauthorizedResponse();
    const body = await request.json();
    const { items, meta, format } = body;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Items array required' }, { status: 400 });
    }

    const validFormats = ['csv', 'json', 'xml'];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format. Use: ${validFormats.join(', ')}` },
        { status: 400 }
      );
    }

    switch (format) {
      case 'csv': {
        const csv = toCSV(items, meta || {});
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="preventivo_${safeFileId(meta?.quote_id)}.csv"`,
          },
        });
      }
      case 'xml': {
        const xml = toXML(items, meta || {});
        return new NextResponse(xml, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Content-Disposition': `attachment; filename="preventivo_${safeFileId(meta?.quote_id)}.xml"`,
          },
        });
      }
      case 'json':
      default: {
        const subtotal = items.reduce((s: number, i: ExportItem) => s + i.totale, 0);
        const vatRate = resolveVatPercent(meta?.vat_percent);
        const vat = (subtotal * vatRate) / 100;
        const jsonExport = {
          preventivo: {
            id: meta?.quote_id,
            data: meta?.date || new Date().toISOString(),
            cliente: meta?.client_name,
            lavoro: meta?.job_title,
            voci: items,
            subtotale: Number(subtotal.toFixed(2)),
            iva_percentuale: vatRate,
            iva: Number(vat.toFixed(2)),
            totale: Number((subtotal + vat).toFixed(2)),
          },
        };
        return NextResponse.json(jsonExport, {
          headers: {
            'Content-Disposition': `attachment; filename="preventivo_${safeFileId(meta?.quote_id)}.json"`,
          },
        });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
