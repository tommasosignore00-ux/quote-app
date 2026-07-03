'use client'

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Plus, FileText, Eye, Download, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadFatturaPA, DatiFattura } from '@/lib/fatturaPA';

interface Fattura {
  id: string;
  numero_fattura: string;
  data_emissione: string;
  data_scadenza?: string;
  tipo_fattura: string;
  imponibile: number;
  imposta: number;
  totale: number;
  valuta: string;
  stato: string;
  cliente_id: string;
  lavoro_id?: string;
  note?: string;
  clienti: { nome: string; cognome: string; email?: string; partita_iva?: string; codice_fiscale?: string; indirizzo?: string; citta?: string; cap?: string; paese?: string };
  lavori?: { title: string };
  fatture_righe?: Array<{
    id: string;
    descrizione: string;
    quantita: number;
    prezzo_unitario: number;
    aliquota_iva: number;
    imponibile_riga: number;
    imposta_riga: number;
    totale_riga: number;
    sort_order: number;
  }>;
}

interface Cliente {
  id: string;
  nome: string;
  cognome: string;
  email?: string;
}

export default function FatturePage() {
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    cliente_id: '',
    lavoro_id: '',
    tipo_fattura: 'fattura',
    data_emissione: new Date().toISOString().split('T')[0],
    data_scadenza: '',
    stato: 'bozza',
    note: '',
  });
  const supabase = createClient();

  useEffect(() => {
    fetchFatture();
    fetchClienti();
  }, []);

  const fetchFatture = async () => {
    try {
      const { data, error } = await supabase
        .from('fatture')
        .select(`
          *,
          clienti(nome, cognome, email, partita_iva, codice_fiscale, indirizzo, citta, cap, paese),
          lavori(title),
          fatture_righe(*)
        `)
        .order('data_emissione', { ascending: false });

      if (error) throw error;
      setFatture(data || []);
    } catch (error) {
      console.error('Error fetching fatture:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClienti = async () => {
    const { data } = await supabase.from('clienti').select('id, nome, cognome, email');
    if (data) setClienti(data);
  };

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const numero_fattura = await supabase.rpc('genera_numero_fattura', { p_profile_id: user.id });

      toast.success('Fattura salvata con successo');
      fetchFatture();
      setShowModal(false);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleUpdateStato = async (id: string, nuovoStato: string) => {
    try {
      await supabase.from('fatture').update({ stato: nuovoStato }).eq('id', id);
      toast.success('Stato aggiornato');
      fetchFatture();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleShareFatturaPA = (fattura: Fattura) => {
    const dati: DatiFattura = {
      numeroFattura: fattura.numero_fattura,
      dataEmissione: new Date(fattura.data_emissione),
      tipoFattura: fattura.tipo_fattura === 'nota_di_credito' ? 'TD04' : 'TD01',
      cedentePrestatore: {
        partitaIva: '00000000000', // TODO: Ottieni da profilo
        indirizzo: 'Via Esempio 1', // TODO: Ottieni da profilo
        cap: '00100', // TODO: Ottieni da profilo
        comune: 'Roma', // TODO: Ottieni da profilo
        nazione: 'IT', // TODO: Ottieni da profilo
      },
      committenteCessionario: {
        nome: fattura.clienti?.nome,
        cognome: fattura.clienti?.cognome,
        partitaIva: fattura.clienti?.partita_iva,
        codiceFiscale: fattura.clienti?.codice_fiscale,
        indirizzo: fattura.clienti?.indirizzo || 'Via Esempio 1',
        cap: fattura.clienti?.cap || '00100',
        comune: fattura.clienti?.citta || 'Roma',
        nazione: fattura.clienti?.paese || 'IT',
      },
      righe: (fattura.fatture_righe || []).map(r => ({
        numeroLinea: r.sort_order + 1,
        descrizione: r.descrizione,
        quantita: r.quantita,
        prezzoUnitario: r.prezzo_unitario,
        aliquotaIVA: r.aliquota_iva,
      })),
      datiPagamento: {
        modalitaPagamento: 'MP01',
        dataScadenzaPagamento: fattura.data_scadenza ? new Date(fattura.data_scadenza) : undefined,
        importoPagamento: fattura.totale,
      },
    };
    downloadFatturaPA(dati);
  };

  const getStatoBadge = (stato: string) => {
    const config: Record<string, { class: string, label: string }> = {
      bozza: { class: 'bg-gray-100 text-gray-800', label: 'Bozza' },
      inviata: { class: 'bg-blue-100 text-blue-800', label: 'Inviata' },
      pagata: { class: 'bg-green-100 text-green-800', label: 'Pagata' },
      'parzialmente pagata': { class: 'bg-yellow-100 text-yellow-800', label: 'Parzialmente pagata' },
      scaduta: { class: 'bg-red-100 text-red-800', label: 'Scaduta' },
      annullata: { class: 'bg-purple-100 text-purple-800', label: 'Annullata' },
    };
    const cfg = config[stato] || config.bozza;
    return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${cfg.class}`}>{cfg.label}</span>;
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Fatture</h1>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>Nuova Fattura</span>
        </button>
      </div>

      {fatture.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Nessuna fattura</h3>
          <p className="mt-1 text-sm text-gray-500">Inizia creando la tua prima fattura</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-6">Numero</th>
                <th className="text-left py-3 px-6">Cliente</th>
                <th className="text-left py-3 px-6">Data</th>
                <th className="text-left py-3 px-6">Totale</th>
                <th className="text-left py-3 px-6">Stato</th>
                <th className="text-right py-3 px-6">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {fatture.map((fattura) => (
                <tr key={fattura.id} className="border-b group">
                  <td className="py-3 px-6 font-medium">{fattura.numero_fattura}</td>
                  <td className="py-3 px-6 text-gray-600">{fattura.clienti?.nome} {fattura.clienti?.cognome}</td>
                  <td className="py-3 px-6 text-gray-600">{new Date(fattura.data_emissione).toLocaleDateString()}</td>
                  <td className="py-3 px-6 font-medium">{formatCurrency(fattura.totale, fattura.valuta)}</td>
                  <td className="py-3 px-6">{getStatoBadge(fattura.stato)}</td>
                  <td className="py-3 px-6 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button className="text-slate-600 hover:text-slate-800 text-xs" title="Visualizza">
                        <Eye size={16} />
                      </button>
                      <button className="text-slate-600 hover:text-slate-800 text-xs" onClick={() => handleShareFatturaPA(fattura)} title="Scarica FatturaPA">
                        <Download size={16} />
                      </button>
                      <button className="text-slate-600 hover:text-slate-800 text-xs" title="Invia Email">
                        <Mail size={16} />
                      </button>
                      <select
                        value={fattura.stato}
                        onChange={(e) => handleUpdateStato(fattura.id, e.target.value)}
                        className="text-xs border rounded px-1"
                      >
                        <option value="bozza">Bozza</option>
                        <option value="inviata">Inviata</option>
                        <option value="pagata">Pagata</option>
                        <option value="parzialmente pagata">Parz. Pagata</option>
                        <option value="scaduta">Scaduta</option>
                        <option value="annullata">Annullata</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nuova Fattura */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Nuova Fattura</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-black text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Cliente</label>
                <select
                  value={formData.cliente_id}
                  onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Seleziona cliente</option>
                  {clienti.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome} {c.cognome}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo Fattura</label>
                  <select
                    value={formData.tipo_fattura}
                    onChange={(e) => setFormData({ ...formData, tipo_fattura: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="fattura">Fattura</option>
                    <option value="nota_di_credito">Nota di Credito</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Stato</label>
                  <select
                    value={formData.stato}
                    onChange={(e) => setFormData({ ...formData, stato: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="bozza">Bozza</option>
                    <option value="inviata">Inviata</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Data Emissione</label>
                  <input
                    type="date"
                    value={formData.data_emissione}
                    onChange={(e) => setFormData({ ...formData, data_emissione: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data Scadenza</label>
                  <input
                    type="date"
                    value={formData.data_scadenza}
                    onChange={(e) => setFormData({ ...formData, data_scadenza: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Note</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Annulla</button>
              <button onClick={handleSave} className="btn-primary flex-1">Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
