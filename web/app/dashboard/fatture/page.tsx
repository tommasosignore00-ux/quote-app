'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, FileText, Eye, Download, Mail, Trash2 } from 'lucide-react';
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
  profile_id: string;
  clienti: { name: string; email?: string; vat_number?: string; fiscal_code?: string; address?: string; city?: string; postal_code?: string; country_code?: string };
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
  name: string;
  email?: string;
}

interface FatturaRigaForm {
  id?: string;
  descrizione: string;
  quantita: string;
  prezzo_unitario: string;
  aliquota_iva: string;
}

export default function FatturePage() {
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileVatPercent, setProfileVatPercent] = useState<number>(22);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [righeFattura, setRigheFattura] = useState<FatturaRigaForm[]>([]);
  const [formData, setFormData] = useState({
    cliente_id: '',
    lavoro_id: '',
    tipo_fattura: 'fattura',
    data_emissione: new Date().toISOString().split('T')[0],
    data_scadenza: '',
    stato: 'bozza',
    note: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Ottieni profilo per l'aliquota IVA
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, vat_percent')
        .eq('id', user.id)
        .single();

      if (profile) {
        setProfileId(profile.id);
        setProfileVatPercent(Number(profile.vat_percent) || 22);
      } else {
        setProfileId(user.id);
      }

      // Carica clienti
      const { data: c } = await supabase
        .from('clienti')
        .select('id, name, email')
        .eq('profile_id', profile?.id || user.id);
      setClienti(c || []);

      // Carica fatture
      const { data, error } = await supabase
        .from('fatture')
        .select(`
          *,
          clienti(name, email, vat_number, fiscal_code, address, city, postal_code, country_code),
          lavori!fatture_lavoro_id_fkey(title),
          fatture_righe(*)
        `)
        .eq('profile_id', profile?.id || user.id)
        .order('data_emissione', { ascending: false });

      if (error) {
        console.error('Errore caricamento fatture:', error);
        toast.error('Errore caricamento fatture');
      } else {
        setFatture(data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!formData.cliente_id) {
      toast.error('Seleziona un cliente');
      return;
    }
    if (righeFattura.length === 0) {
      toast.error('Aggiungi almeno una riga alla fattura');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !profileId) return;

      // Calcola totali
      const righeConValori = righeFattura.map((r, i) => {
        const qta = parseFloat(r.quantita) || 0;
        const prezzo = parseFloat(r.prezzo_unitario) || 0;
        const imponibile = qta * prezzo;
        const iva = (imponibile * (parseFloat(r.aliquota_iva) || 0)) / 100;
        const totale = imponibile + iva;
        return {
          ...r,
          quantita: qta,
          prezzo_unitario: prezzo,
          aliquota_iva: parseFloat(r.aliquota_iva) || 0,
          imponibile_riga: imponibile,
          imposta_riga: iva,
          totale_riga: totale,
          sort_order: i,
        };
      });

      const imponibileTotale = righeConValori.reduce((sum, r) => sum + r.imponibile_riga, 0);
      const impostaTotale = righeConValori.reduce((sum, r) => sum + r.imposta_riga, 0);
      const totale = imponibileTotale + impostaTotale;

      // Ottieni numero fattura
      const numeroFattura = await supabase.rpc('genera_numero_fattura', { p_profile_id: profileId });

      // Crea fattura
      const { data: nuovaFattura, error: errFattura } = await supabase
        .from('fatture')
        .insert({
          profile_id: profileId,
          cliente_id: formData.cliente_id,
          lavoro_id: formData.lavoro_id || null,
          numero_fattura: numeroFattura || `FATT-001/${new Date().getFullYear()}`,
          data_emissione: formData.data_emissione,
          data_scadenza: formData.data_scadenza || null,
          tipo_fattura: formData.tipo_fattura,
          stato: formData.stato,
          note: formData.note,
          valuta: 'EUR',
          imponibile: imponibileTotale,
          imposta: impostaTotale,
          totale: totale,
        })
        .select('*')
        .single();

      if (errFattura) throw errFattura;

      // Crea righe
      const { error: errRighe } = await supabase.from('fatture_righe').insert(
        righeConValori.map(r => ({
          fattura_id: nuovaFattura.id,
          descrizione: r.descrizione,
          quantita: r.quantita,
          prezzo_unitario: r.prezzo_unitario,
          aliquota_iva: r.aliquota_iva,
          imponibile_riga: r.imponibile_riga,
          imposta_riga: r.imposta_riga,
          totale_riga: r.totale_riga,
          sort_order: r.sort_order,
        }))
      );

      if (errRighe) throw errRighe;

      toast.success('Fattura salvata con successo');
      fetchData();
      setShowModal(false);
      setRigheFattura([]);
      setFormData({
        cliente_id: '',
        lavoro_id: '',
        tipo_fattura: 'fattura',
        data_emissione: new Date().toISOString().split('T')[0],
        data_scadenza: '',
        stato: 'bozza',
        note: '',
      });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleUpdateStato = async (id: string, nuovoStato: string) => {
    try {
      await supabase.from('fatture').update({ stato: nuovoStato }).eq('id', id);
      toast.success('Stato aggiornato');
      fetchData();
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
        denominazione: fattura.clienti?.name,
        partitaIva: fattura.clienti?.vat_number,
        codiceFiscale: fattura.clienti?.fiscal_code,
        indirizzo: fattura.clienti?.address || 'Via Esempio 1',
        cap: fattura.clienti?.postal_code || '00100',
        comune: fattura.clienti?.city || 'Roma',
        nazione: fattura.clienti?.country_code || 'IT',
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

  const addRiga = () => {
    setRigheFattura([
      ...righeFattura,
      {
        descrizione: '',
        quantita: '1',
        prezzo_unitario: '0',
        aliquota_iva: String(profileVatPercent),
      },
    ]);
  };

  const removeRiga = (index: number) => {
    setRigheFattura(righeFattura.filter((_, i) => i !== index));
  };

  const updateRiga = (index: number, field: keyof FatturaRigaForm, value: string) => {
    const nuoveRighe = [...righeFattura];
    nuoveRighe[index] = { ...nuoveRighe[index], [field]: value };
    setRigheFattura(nuoveRighe);
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

  const formatCurrency = (amount: number, valuta: string) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: valuta,
    }).format(amount);
  };

  const calcolaTotaleProvvisorio = () => {
    return righeFattura.reduce((sum, r) => {
      const qta = parseFloat(r.quantita) || 0;
      const prezzo = parseFloat(r.prezzo_unitario) || 0;
      const iva = parseFloat(r.aliquota_iva) || 0;
      const imponibile = qta * prezzo;
      const totale = imponibile + (imponibile * iva / 100);
      return sum + totale;
    }, 0);
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
                  <td className="py-3 px-6 text-gray-600">{fattura.clienti?.name}</td>
                  <td className="py-3 px-6 text-gray-600">{new Date(fattura.data_emissione).toLocaleDateString()}</td>
                  <td className="py-3 px-6 font-medium">{formatCurrency(fattura.totale, fattura.valuta)}</td>
                  <td className="py-3 px-6">{getStatoBadge(fattura.stato)}</td>
                  <td className="py-3 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="text-slate-600 hover:text-slate-800 text-xs p-1" title="Visualizza">
                        <Eye size={16} />
                      </button>
                      <button className="text-slate-600 hover:text-slate-800 text-xs p-1" onClick={() => handleShareFatturaPA(fattura)} title="Scarica FatturaPA">
                        <Download size={16} />
                      </button>
                      <button className="text-slate-600 hover:text-slate-800 text-xs p-1" title="Invia Email">
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
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
                    <option key={c.id} value={c.id}>{c.name}</option>
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

              <div className="pt-2 border-t">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium">Righe Fattura</h4>
                  <button onClick={addRiga} className="text-xs btn-primary">+ Aggiungi Riga</button>
                </div>

                {righeFattura.map((riga, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 mb-3 items-start">
                    <div className="col-span-4">
                      <label className="text-xs text-gray-500">Descrizione</label>
                      <input
                        type="text"
                        value={riga.descrizione}
                        onChange={(e) => updateRiga(index, 'descrizione', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        placeholder="Descrizione"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">Qtà</label>
                      <input
                        type="number"
                        step="1"
                        value={riga.quantita}
                        onChange={(e) => updateRiga(index, 'quantita', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        placeholder="1"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">Prezzo Unitario</label>
                      <input
                        type="number"
                        step="0.01"
                        value={riga.prezzo_unitario}
                        onChange={(e) => updateRiga(index, 'prezzo_unitario', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">IVA %</label>
                      <input
                        type="number"
                        step="0.01"
                        value={riga.aliquota_iva}
                        onChange={(e) => updateRiga(index, 'aliquota_iva', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        placeholder={String(profileVatPercent)}
                      />
                    </div>
                    <div className="col-span-2 pt-5">
                      <button onClick={() => removeRiga(index)} className="text-red-600 hover:text-red-800">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {righeFattura.length > 0 && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Totale Provvisorio</span>
                      <span className="font-bold">{formatCurrency(calcolaTotaleProvvisorio(), 'EUR')}</span>
                    </div>
                  </div>
                )}
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

            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Annulla</button>
              <button onClick={handleSave} className="btn-primary flex-1">Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
