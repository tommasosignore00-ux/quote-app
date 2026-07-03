import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, SafeAreaView, ActivityIndicator, ScrollView, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { downloadFatturaPA, DatiFattura } from '../lib/fatturaPA';

type Cliente = { id: string; name: string };
type FatturaRiga = { id?: string; descrizione: string; quantita: string; prezzo_unitario: string; aliquota_iva: string };
type Fattura = {
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
  clienti: { name: string };
  fatture_righe?: any[];
};

export default function FattureScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileVatPercent, setProfileVatPercent] = useState<number>(22);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [righeFattura, setRigheFattura] = useState<FatturaRiga[]>([]);
  const [formData, setFormData] = useState({
    cliente_id: '',
    cliente_name: '',
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
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('id, vat_percent').eq('id', user.id).single();
      if (profile) {
        setProfileId(profile.id);
        setProfileVatPercent(Number(profile.vat_percent) || 22);
      } else {
        setProfileId(user.id);
      }

      const { data: c } = await supabase.from('clienti').select('id, name').eq('profile_id', profile?.id || user.id);
      setClienti(c || []);

      const { data, error } = await supabase
        .from('fatture')
        .select('*, clienti(name), fatture_righe(*)')
        .eq('profile_id', profile?.id || user.id)
        .order('data_emissione', { ascending: false });

      if (error) throw error;
      setFatture(data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!formData.cliente_id) {
      Alert.alert('Errore', 'Seleziona un cliente');
      return;
    }
    if (righeFattura.length === 0) {
      Alert.alert('Errore', 'Aggiungi almeno una riga alla fattura');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !profileId) return;

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

      let numeroFattura;
      try {
        numeroFattura = await supabase.rpc('genera_numero_fattura', { p_profile_id: profileId });
      } catch (e) {
        numeroFattura = null;
      }

      const { data: nuovaFattura, error: errFattura } = await supabase
        .from('fatture')
        .insert({
          profile_id: profileId,
          cliente_id: formData.cliente_id,
          lavoro_id: formData.lavoro_id || null,
          numero_fattura: numeroFattura || `FATT-${new Date().getFullYear()}-${(fatture.length + 1).toString().padStart(3, '0')}`,
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

      if (righeConValori.length > 0) {
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
      }

      Alert.alert('Successo', 'Fattura salvata con successo!');
      fetchData();
      setShowModal(false);
      setRigheFattura([]);
      setFormData({
        cliente_id: '',
        cliente_name: '',
        lavoro_id: '',
        tipo_fattura: 'fattura',
        data_emissione: new Date().toISOString().split('T')[0],
        data_scadenza: '',
        stato: 'bozza',
        note: '',
      });
    } catch (error) {
      Alert.alert('Errore', (error as Error).message);
    }
  };

  const handleShareFatturaPA = async (fattura: Fattura) => {
    try {
      const dati: DatiFattura = {
        numeroFattura: fattura.numero_fattura,
        dataEmissione: new Date(fattura.data_emissione),
        tipoFattura: fattura.tipo_fattura === 'nota_di_credito' ? 'TD04' : 'TD01',
        cedentePrestatore: {
          partitaIva: '00000000000',
          indirizzo: 'Via Esempio 1',
          cap: '00100',
          comune: 'Roma',
          nazione: 'IT',
        },
        committenteCessionario: {
          denominazione: fattura.clienti?.name,
          partitaIva: '',
          codiceFiscale: '',
          indirizzo: 'Via Esempio 1',
          cap: '00100',
          comune: 'Roma',
          nazione: 'IT',
        },
        righe: (fattura.fatture_righe || []).map((r, i) => ({
          numeroLinea: i + 1,
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

      const xml = downloadFatturaPA(dati, true);
      const uri = FileSystem.documentDirectory + `${fattura.numero_fattura.replace('/', '_')}.xml`;
      await FileSystem.writeAsStringAsync(uri, xml);
      
      await Sharing.shareAsync(uri, {
        mimeType: 'application/xml',
        dialogTitle: 'Condividi FatturaPA',
      });
    } catch (error) {
      Alert.alert('Errore', 'Impossibile condividere la fatturaPA');
    }
  };

  const getStatoBadge = (stato: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      bozza: { bg: '#F3F4F6', text: '#374151', label: 'Bozza' },
      inviata: { bg: '#DBEAFE', text: '#1E40AF', label: 'Inviata' },
      pagata: { bg: '#D1FAE5', text: '#065F46', label: 'Pagata' },
      'parzialmente pagata': { bg: '#FEF3C7', text: '#92400E', label: 'Parzialmente Pagata' },
      scaduta: { bg: '#FEE2E2', text: '#991B1B', label: 'Scaduta' },
      annullata: { bg: '#EDE9FE', text: '#5B21B6', label: 'Annullata' },
    };
    return config[stato] || config.bozza;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
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

  const updateRiga = (index: number, field: keyof FatturaRiga, value: string) => {
    const nuoveRighe = [...righeFattura];
    nuoveRighe[index] = { ...nuoveRighe[index], [field]: value };
    setRigheFattura(nuoveRighe);
  };

  const selectCliente = (cliente: Cliente) => {
    setFormData({ ...formData, cliente_id: cliente.id, cliente_name: cliente.name });
    setShowClientPicker(false);
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

  const renderFatturaItem = ({ item }: { item: Fattura }) => {
    const statoBadge = getStatoBadge(item.stato);
    return (
      <View style={[styles.fatturaCard, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.fatturaHeader}>
          <Text style={[styles.fatturaNumero, { color: colors.text }]}>{item.numero_fattura}</Text>
          <View style={[styles.statoBadge, { backgroundColor: statoBadge.bg }]}>
            <Text style={[styles.statoText, { color: statoBadge.text }]}>{statoBadge.label}</Text>
          </View>
        </View>
        <Text style={[styles.fatturaCliente, { color: colors.text }]}>{item.clienti?.name}</Text>
        <Text style={[styles.fatturaData, { color: colors.textSecondary }]}>{new Date(item.data_emissione).toLocaleDateString()}</Text>
        <Text style={[styles.fatturaTotale, { color: colors.text }]}>{formatCurrency(item.totale)}</Text>
        <View style={styles.fatturaActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleShareFatturaPA(item)}>
            <Text style={styles.actionBtnText}>📄 FatturaPA</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderClientePickerItem = ({ item }: { item: Cliente }) => {
    return (
      <TouchableOpacity
        style={[
          styles.clienteOption,
          {
            backgroundColor: formData.cliente_id === item.id ? colors.primary : colors.surface,
            borderColor: colors.border,
          },
        ]}
        onPress={() => selectCliente(item)}
      >
        <Text style={[
          styles.clienteOptionText,
          { color: formData.cliente_id === item.id ? '#fff' : colors.text }
        ]}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Fatture</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowModal(true)}>
          <Text style={styles.addBtnText}>+ Nuova</Text>
        </TouchableOpacity>
      </View>

      {fatture.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Nessuna fattura</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Crea la tua prima fattura premendo il pulsante + Nuova
          </Text>
        </View>
      ) : (
        <FlatList
          data={fatture}
          renderItem={renderFatturaItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={[styles.cancelBtn, { color: colors.text }]}>Annulla</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Nuova Fattura</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={[styles.saveBtn, { color: colors.primary }]}>Salva</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentInner}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Cliente</Text>
              <TouchableOpacity
                style={[styles.clientePickerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setShowClientPicker(true)}
              >
                <Text style={formData.cliente_name ? { color: colors.text } : { color: colors.textSecondary }}>
                  {formData.cliente_name || 'Seleziona cliente'}
                </Text>
                <Text style={{ color: colors.textSecondary }}>▾</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Data Emissione</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.data_emissione}
                onChangeText={(text) => setFormData({ ...formData, data_emissione: text })}
                placeholder="YYYY-MM-DD"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Data Scadenza</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.data_scadenza}
                onChangeText={(text) => setFormData({ ...formData, data_scadenza: text })}
                placeholder="YYYY-MM-DD"
              />
            </View>

            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <Text style={[styles.label, { color: colors.text }]}>Righe Fattura</Text>
                <TouchableOpacity onPress={addRiga}>
                  <Text style={[styles.addRigaBtn, { color: colors.primary }]}>+ Aggiungi</Text>
                </TouchableOpacity>
              </View>

              {righeFattura.map((riga, index) => (
                <View key={index} style={[styles.rigaContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.rigaTop}>
                    <TextInput
                      style={[styles.rigaInput, { flex: 2, color: colors.text }]}
                      value={riga.descrizione}
                      onChangeText={(text) => updateRiga(index, 'descrizione', text)}
                      placeholder="Descrizione"
                    />
                    <TouchableOpacity onPress={() => removeRiga(index)} style={styles.removeBtn}>
                      <Text style={styles.removeBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.rigaBottom}>
                    <TextInput
                      style={[styles.rigaInputSmall, { color: colors.text, borderColor: colors.border }]}
                      value={riga.quantita}
                      onChangeText={(text) => updateRiga(index, 'quantita', text)}
                      placeholder="Qtà"
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      style={[styles.rigaInputSmall, { color: colors.text, borderColor: colors.border }]}
                      value={riga.prezzo_unitario}
                      onChangeText={(text) => updateRiga(index, 'prezzo_unitario', text)}
                      placeholder="Prezzo"
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      style={[styles.rigaInputSmall, { color: colors.text, borderColor: colors.border }]}
                      value={riga.aliquota_iva}
                      onChangeText={(text) => updateRiga(index, 'aliquota_iva', text)}
                      placeholder="IVA %"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              ))}

              {righeFattura.length > 0 && (
                <View style={[styles.totaleProvvisorio, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.totaleLabel, { color: colors.text }]}>Totale</Text>
                  <Text style={[styles.totaleValue, { color: colors.text }]}>{formatCurrency(calcolaTotaleProvvisorio())}</Text>
                </View>
              )}
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Note</Text>
              <TextInput
                style={[styles.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.note}
                onChangeText={(text) => setFormData({ ...formData, note: text })}
                placeholder="Note aggiuntive..."
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showClientPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowClientPicker(false)}>
              <Text style={[styles.cancelBtn, { color: colors.text }]}>Annulla</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Seleziona Cliente</Text>
            <View style={{ width: 60 }} />
          </View>

          {clienti.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Nessun cliente</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Crea un cliente nella dashboard prima di creare una fattura
              </Text>
            </View>
          ) : (
            <FlatList
              data={clienti}
              renderItem={renderClientePickerItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.clientPickerList}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  fatturaCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
  },
  fatturaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fatturaNumero: {
    fontSize: 16,
    fontWeight: '600',
  },
  statoBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statoText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fatturaCliente: {
    fontSize: 14,
    marginBottom: 4,
  },
  fatturaData: {
    fontSize: 12,
    marginBottom: 8,
  },
  fatturaTotale: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  fatturaActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  cancelBtn: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveBtn: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
  },
  modalContentInner: {
    padding: 20,
  },
  field: {
    marginBottom: 20,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  clientePickerBtn: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clientPickerList: {
    padding: 16,
  },
  clienteOption: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  clienteOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  addRigaBtn: {
    fontSize: 14,
    fontWeight: '500',
  },
  rigaContainer: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  rigaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rigaInput: {
    padding: 8,
    fontSize: 14,
  },
  rigaBottom: {
    flexDirection: 'row',
    gap: 8,
  },
  rigaInputSmall: {
    flex: 1,
    padding: 8,
    fontSize: 14,
    borderWidth: 1,
    borderRadius: 6,
  },
  removeBtn: {
    marginLeft: 8,
    padding: 4,
  },
  removeBtnText: {
    fontSize: 18,
  },
  totaleProvvisorio: {
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totaleLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  totaleValue: {
    fontSize: 18,
    fontWeight: '700',
  },
});
