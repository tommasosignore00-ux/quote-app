/**
 * Punto 46: Export quote in multiple formats (JSON, XML, CSV) for accountants
 * API Route: POST /api/quote/export
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface ExportItem {
  descrizione: string;
  quantita: number;
  prezzo_unitario: number;
  totale: number;
}

function toCSV(items: ExportItem[], meta: Record<string, any>): string {
  const sep = ';';
  let csv = `# Preventivo ${meta.quote_id || ''}\n`;
  csv += `# Data: ${meta.date || new Date().toISOString()}\n`;
  csv += `# Cliente: ${meta.client_name || ''}\n`;
  csv += `# Lavoro: ${meta.job_title || ''}\n\n`;
  csv += `Descrizione${sep}Quantità${sep}Prezzo Unitario${sep}Totale\n`;
  for (const item of items) {
    csv += `"${item.descrizione}"${sep}${item.quantita}${sep}${item.prezzo_unitario.toFixed(2)}${sep}${item.totale.toFixed(2)}\n`;
  }
  const subtotal = items.reduce((s, i) => s + i.totale, 0);
  const vatRate = meta.vat_percent || 22;
  const vat = subtotal * vatRate / 100;
  csv += `\n${sep}${sep}Subtotale${sep}${subtotal.toFixed(2)}\n`;
  csv += `${sep}${sep}IVA ${vatRate}%${sep}${vat.toFixed(2)}\n`;
  csv += `${sep}${sep}TOTALE${sep}${(subtotal + vat).toFixed(2)}\n`;
  return csv;
}

function toXML(items: ExportItem[], meta: Record<string, any>): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<preventivo>\n`;
  xml += `  <meta>\n    <id>${meta.quote_id || ''}</id>\n    <data>${meta.date || new Date().toISOString()}</data>\n    <cliente>${meta.client_name || ''}</cliente>\n    <lavoro>${meta.job_title || ''}</lavoro>\n  </meta>\n`;
  xml += `  <voci>\n`;
  for (const item of items) {
    xml += `    <voce>\n      <descrizione>${escapeXml(item.descrizione)}</descrizione>\n      <quantita>${item.quantita}</quantita>\n      <prezzo_unitario>${item.prezzo_unitario.toFixed(2)}</prezzo_unitario>\n      <totale>${item.totale.toFixed(2)}</totale>\n    </voce>\n`;
  }
  xml += `  </voci>\n`;
  const subtotal = items.reduce((s, i) => s + i.totale, 0);
  const vatRate = meta.vat_percent || 22;
  const vat = subtotal * vatRate / 100;
  xml += `  <totali>\n    <subtotale>${subtotal.toFixed(2)}</subtotale>\n    <iva_percentuale>${vatRate}</iva_percentuale>\n    <iva>${vat.toFixed(2)}</iva>\n    <totale>${(subtotal + vat).toFixed(2)}</totale>\n  </totali>\n`;
  xml += `</preventivo>`;
  return xml;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, meta, format } = body;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Items array required' }, { status: 400 });
    }

    const validFormats = ['csv', 'json', 'xml'];
    if (!validFormats.includes(format)) {
      return NextResponse.json({ error: `Invalid format. Use: ${validFormats.join(', ')}` }, { status: 400 });
    }

    switch (format) {
      case 'csv': {
        const csv = toCSV(items, meta || {});
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="preventivo_${meta?.quote_id || 'export'}.csv"`,
          },
        });
      }
      case 'xml': {
        const xml = toXML(items, meta || {});
        return new NextResponse(xml, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Content-Disposition': `attachment; filename="preventivo_${meta?.quote_id || 'export'}.xml"`,
          },
        });
      }
      case 'json':
      default: {
        const subtotal = items.reduce((s: number, i: ExportItem) => s + i.totale, 0);
        const vatRate = meta?.vat_percent || 22;
        const vat = subtotal * vatRate / 100;
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
            'Content-Disposition': `attachment; filename="preventivo_${meta?.quote_id || 'export'}.json"`,
          },
        });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
