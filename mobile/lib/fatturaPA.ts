export interface DatiFattura {
  numeroFattura: string;
  dataEmissione: Date;
  tipoFattura: 'TD01' | 'TD04';
  cedentePrestatore: {
    denominazione?: string;
    nome?: string;
    cognome?: string;
    partitaIva: string;
    codiceFiscale?: string;
    indirizzo: string;
    numeroCivico?: string;
    cap: string;
    comune: string;
    provincia?: string;
    nazione: string;
  };
  committenteCessionario: {
    denominazione?: string;
    nome?: string;
    cognome?: string;
    partitaIva?: string;
    codiceFiscale?: string;
    indirizzo: string;
    numeroCivico?: string;
    cap: string;
    comune: string;
    provincia?: string;
    nazione: string;
  };
  righe: Array<{
    numeroLinea: number;
    descrizione: string;
    quantita: number;
    unitaMisura?: string;
    prezzoUnitario: number;
    aliquotaIVA: number;
  }>;
  datiPagamento?: {
    modalitaPagamento: string;
    dataScadenzaPagamento?: Date;
    importoPagamento?: number;
  };
}

export function generaFatturaPA(dati: DatiFattura): string {
  const escapeXML = (s?: string): string => {
    if (!s) return '';
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const formatDate = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const importiRighe = dati.righe.map(r => {
    const imponibile = r.quantita * r.prezzoUnitario;
    const imposta = imponibile * (r.aliquotaIVA / 100);
    const totale = imponibile + imposta;
    return { ...r, imponibile, imposta, totale };
  });

  const imponibileTotale = importiRighe.reduce((sum, r) => sum + r.imponibile, 0);
  const impostaTotale = importiRighe.reduce((sum, r) => sum + r.imposta, 0);

  const riepilogoIVA = importiRighe.reduce((acc, r) => {
    const key = r.aliquotaIVA.toString();
    if (!acc[key]) {
      acc[key] = { aliquota: r.aliquotaIVA, imponibile: 0, imposta: 0 };
    }
    acc[key].imponibile += r.imponibile;
    acc[key].imposta += r.imposta;
    return acc;
  }, {} as Record<string, { aliquota: number; imponibile: number; imposta: number }>);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>${dati.cedentePrestatore.nazione}</IdPaese>
        <IdCodice>${dati.cedentePrestatore.partitaIva}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>1</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>0000000</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>${dati.cedentePrestatore.nazione}</IdPaese>
          <IdCodice>${dati.cedentePrestatore.partitaIva}</IdCodice>
        </IdFiscaleIVA>
        ${dati.cedentePrestatore.codiceFiscale ? `<CodiceFiscale>${dati.cedentePrestatore.codiceFiscale}</CodiceFiscale>` : ''}
        <Anagrafica>
          ${dati.cedentePrestatore.denominazione ? `<Denominazione>${escapeXML(dati.cedentePrestatore.denominazione)}</Denominazione>` : ''}
          ${dati.cedentePrestatore.nome ? `<Nome>${escapeXML(dati.cedentePrestatore.nome)}</Nome>` : ''}
          ${dati.cedentePrestatore.cognome ? `<Cognome>${escapeXML(dati.cedentePrestatore.cognome)}</Cognome>` : ''}
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${escapeXML(dati.cedentePrestatore.indirizzo)}</Indirizzo>
        ${dati.cedentePrestatore.numeroCivico ? `<NumeroCivico>${dati.cedentePrestatore.numeroCivico}</NumeroCivico>` : ''}
        <CAP>${dati.cedentePrestatore.cap}</CAP>
        <Comune>${escapeXML(dati.cedentePrestatore.comune)}</Comune>
        ${dati.cedentePrestatore.provincia ? `<Provincia>${dati.cedentePrestatore.provincia}</Provincia>` : ''}
        <Nazione>${dati.cedentePrestatore.nazione}</Nazione>
      </Sede>
    </CedentePrestatore>
    <CommittenteCessionario>
      <DatiAnagrafici>
        ${dati.committenteCessionario.partitaIva ? `
        <IdFiscaleIVA>
          <IdPaese>${dati.committenteCessionario.nazione}</IdPaese>
          <IdCodice>${dati.committenteCessionario.partitaIva}</IdCodice>
        </IdFiscaleIVA>` : ''}
        ${dati.committenteCessionario.codiceFiscale ? `<CodiceFiscale>${dati.committenteCessionario.codiceFiscale}</CodiceFiscale>` : ''}
        <Anagrafica>
          ${dati.committenteCessionario.denominazione ? `<Denominazione>${escapeXML(dati.committenteCessionario.denominazione)}</Denominazione>` : ''}
          ${dati.committenteCessionario.nome ? `<Nome>${escapeXML(dati.committenteCessionario.nome)}</Nome>` : ''}
          ${dati.committenteCessionario.cognome ? `<Cognome>${escapeXML(dati.committenteCessionario.cognome)}</Cognome>` : ''}
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${escapeXML(dati.committenteCessionario.indirizzo)}</Indirizzo>
        ${dati.committenteCessionario.numeroCivico ? `<NumeroCivico>${dati.committenteCessionario.numeroCivico}</NumeroCivico>` : ''}
        <CAP>${dati.committenteCessionario.cap}</CAP>
        <Comune>${escapeXML(dati.committenteCessionario.comune)}</Comune>
        ${dati.committenteCessionario.provincia ? `<Provincia>${dati.committenteCessionario.provincia}</Provincia>` : ''}
        <Nazione>${dati.committenteCessionario.nazione}</Nazione>
      </Sede>
    </CommittenteCessionario>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${dati.tipoFattura}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${formatDate(dati.dataEmissione)}</Data>
        <Numero>${dati.numeroFattura}</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      ${importiRighe.map(r => `
      <DettaglioLinee>
        <NumeroLinea>${r.numeroLinea}</NumeroLinea>
        <Descrizione>${escapeXML(r.descrizione)}</Descrizione>
        <Quantita>${r.quantita.toFixed(2)}</Quantita>
        <PrezzoUnitario>${r.prezzoUnitario.toFixed(2)}</PrezzoUnitario>
        <PrezzoTotale>${r.imponibile.toFixed(2)}</PrezzoTotale>
        <AliquotaIVA>${r.aliquotaIVA.toFixed(2)}</AliquotaIVA>
      </DettaglioLinee>`).join('')}
      ${Object.values(riepilogoIVA).map(iva => `
      <DatiRiepilogo>
        <AliquotaIVA>${iva.aliquota.toFixed(2)}</AliquotaIVA>
        <ImponibileImporto>${iva.imponibile.toFixed(2)}</ImponibileImporto>
        <Imposta>${iva.imposta.toFixed(2)}</Imposta>
      </DatiRiepilogo>`).join('')}
    </DatiBeniServizi>
    ${dati.datiPagamento ? `
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${dati.datiPagamento.modalitaPagamento}</ModalitaPagamento>
        ${dati.datiPagamento.dataScadenzaPagamento ? `<DataScadenzaPagamento>${formatDate(dati.datiPagamento.dataScadenzaPagamento)}</DataScadenzaPagamento>` : ''}
        ${dati.datiPagamento.importoPagamento ? `<ImportoPagamento>${dati.datiPagamento.importoPagamento.toFixed(2)}</ImportoPagamento>` : ''}
      </DettaglioPagamento>
    </DatiPagamento>` : ''}
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
  return xml;
}

export function downloadFatturaPA(dati: DatiFattura, returnXmlOnly: boolean = false): any {
  const xml = generaFatturaPA(dati);
  if (returnXmlOnly) {
    return xml;
  }
  return xml;
}
