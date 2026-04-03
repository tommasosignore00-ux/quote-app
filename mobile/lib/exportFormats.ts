/**
 * Multi-format export (Excel, JSON, XML).
 * Punto 46: Export Multi-formato - download data for accountants.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

interface ExportItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total: number;
}

interface ExportData {
  quoteTitle: string;
  clientName: string;
  companyName: string;
  vatNumber: string;
  date: string;
  revision: number;
  items: ExportItem[];
  subtotal: number;
  vatPercent: number;
  vatAmount: number;
  total: number;
  currency: string;
}

/**
 * Export quote data as JSON file.
 */
export async function exportAsJSON(data: ExportData): Promise<string> {
  const json = JSON.stringify(data, null, 2);
  const path = `${FileSystem.cacheDirectory}preventivo_${sanitize(data.quoteTitle)}_rev${data.revision}.json`;
  await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/json' });
  }

  return path;
}

/**
 * Export quote data as XML file.
 */
export async function exportAsXML(data: ExportData): Promise<string> {
  const xml = generateXML(data);
  const path = `${FileSystem.cacheDirectory}preventivo_${sanitize(data.quoteTitle)}_rev${data.revision}.xml`;
  await FileSystem.writeAsStringAsync(path, xml, { encoding: FileSystem.EncodingType.UTF8 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/xml' });
  }

  return path;
}

/**
 * Export quote data as CSV (Excel-compatible).
 */
export async function exportAsCSV(data: ExportData): Promise<string> {
  const csv = generateCSV(data);
  const path = `${FileSystem.cacheDirectory}preventivo_${sanitize(data.quoteTitle)}_rev${data.revision}.csv`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'text/csv' });
  }

  return path;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}

function generateXML(data: ExportData): string {
  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<preventivo>\n';
  xml += `  <intestazione>\n`;
  xml += `    <titolo>${escapeXml(data.quoteTitle)}</titolo>\n`;
  xml += `    <cliente>${escapeXml(data.clientName)}</cliente>\n`;
  xml += `    <azienda>${escapeXml(data.companyName)}</azienda>\n`;
  xml += `    <partitaIva>${escapeXml(data.vatNumber)}</partitaIva>\n`;
  xml += `    <data>${data.date}</data>\n`;
  xml += `    <revisione>${data.revision}</revisione>\n`;
  xml += `    <valuta>${data.currency}</valuta>\n`;
  xml += `  </intestazione>\n`;
  xml += `  <voci>\n`;

  for (const item of data.items) {
    xml += `    <voce>\n`;
    xml += `      <descrizione>${escapeXml(item.description)}</descrizione>\n`;
    xml += `      <quantita>${item.quantity}</quantita>\n`;
    xml += `      <prezzoUnitario>${item.unit_price.toFixed(2)}</prezzoUnitario>\n`;
    xml += `      <ricarico>${item.tax_rate.toFixed(2)}</ricarico>\n`;
    xml += `      <totaleRiga>${item.total.toFixed(2)}</totaleRiga>\n`;
    xml += `    </voce>\n`;
  }

  xml += `  </voci>\n`;
  xml += `  <totali>\n`;
  xml += `    <subtotale>${data.subtotal.toFixed(2)}</subtotale>\n`;
  xml += `    <ivaPercentuale>${data.vatPercent}</ivaPercentuale>\n`;
  xml += `    <ivaImporto>${data.vatAmount.toFixed(2)}</ivaImporto>\n`;
  xml += `    <totale>${data.total.toFixed(2)}</totale>\n`;
  xml += `  </totali>\n`;
  xml += '</preventivo>\n';

  return xml;
}

function generateCSV(data: ExportData): string {
  const sep = ';'; // Semicolon for European Excel compatibility
  let csv = '';

  // Header info
  csv += `Preventivo${sep}${data.quoteTitle}\n`;
  csv += `Cliente${sep}${data.clientName}\n`;
  csv += `Azienda${sep}${data.companyName}\n`;
  csv += `P.IVA${sep}${data.vatNumber}\n`;
  csv += `Data${sep}${data.date}\n`;
  csv += `Revisione${sep}${data.revision}\n`;
  csv += `Valuta${sep}${data.currency}\n`;
  csv += '\n';

  // Column headers
  csv += `Descrizione${sep}Quantità${sep}Prezzo Unitario${sep}Ricarico %${sep}Totale Riga\n`;

  // Items
  for (const item of data.items) {
    csv += `"${item.description.replace(/"/g, '""')}"${sep}${item.quantity}${sep}${item.unit_price.toFixed(2)}${sep}${item.tax_rate.toFixed(2)}${sep}${item.total.toFixed(2)}\n`;
  }

  // Totals
  csv += '\n';
  csv += `Subtotale${sep}${sep}${sep}${sep}${data.subtotal.toFixed(2)}\n`;
  csv += `IVA (${data.vatPercent}%)${sep}${sep}${sep}${sep}${data.vatAmount.toFixed(2)}\n`;
  csv += `TOTALE${sep}${sep}${sep}${sep}${data.total.toFixed(2)}\n`;

  return csv;
}
