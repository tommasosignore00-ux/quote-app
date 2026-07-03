import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';
import { shareFatturaPA, DatiFattura } from '../lib/fatturaPA';

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

export default function FattureScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    cliente_id: '',
    lavoro_id: '',
    tipo_fattura: 'TD01',
    data_emissione: new Date().toISOString().split('T')[0],
    data_scadenza: '',
    stato: 'bozza',
    note: '',
  });

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

  const handleUpdateStato = async (id: string, nuovoStato: string) => {
    try {
      await supabase.from('fatture').update({ stato: nuovoStato }).eq('id', id);
      fetchFatture();
      Alert.alert('Successo', 'Stato aggiornato!');
    } catch (error) {
      Alert.alert('Errore', (error as Error).message);
    }
  };

  const handleShareFatturaPA = async (fattura: Fattura) => {
    try {
      // TODO: Recupera anche i dati del profilo per il cedente prestatore
      const datiFattura: DatiFattura = {
        numeroFattura: fattura.numero_fattura,
        dataEmissione: new Date(fattura.data_emissione),
        tipoFattura: fattura.tipo_fattura === 'fattura' ? 'TD01' : 'TD04',
        cedentePrestatore: {
          partitaIva: '00000000000', // TODO: Recupera da profilo
          indirizzo: 'Via Esempio, 1', // TODO: Recupera da profilo
          cap: '00100', // TODO: Recupera da profilo
          comune: 'Roma', // TODO: Recupera da profilo
          nazione: 'IT', // TODO: Recupera da profilo
        },
        committenteCessionario: {
          nome: fattura.clienti?.nome,
          cognome: fattura.clienti?.cognome,
          partitaIva: fattura.clienti?.partita_iva,
          codiceFiscale: fattura.clienti?.codice_fiscale,
          indirizzo: fattura.clienti?.indirizzo || 'Via Esempio, 1',
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
      await shareFatturaPA(datiFattura);
    } catch (error) {
      Alert.alert('Errore', (error as Error).message);
    }
  };

  const formatCurrency = (amount: number, valuta: string) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: valuta,
    }).format(amount);
  };

  const getStatoColor = (stato: string) => {
    switch (stato) {
      case 'pagata': return '#16a34a';
      case 'inviata': return '#2563eb';
      case 'scaduta': return '#dc2626';
      case 'parzialmente pagata': return '#ca8a04';
      default: return '#6b7280';
    }
  };

  const renderItem = ({ item }: { item: Fattura }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.numeroFattura, { color: colors.text }]}>{item.numero_fattura}</Text>
        <View style={[styles.statoBadge, { backgroundColor: getStatoColor(item.stato) }]}>
          <Text style={styles.statoText}>{item.stato}</Text>
        </View>
      </View>
      <Text style={[styles.cliente, { color: colors.secondaryText }]}>
        {item.clienti?.nome} {item.clienti?.cognome}
      </Text>
      <Text style={[styles.totale, { color: colors.text }]}>
        {formatCurrency(item.totale, item.valuta)}
      </Text>
      <Text style={[styles.data, { color: colors.secondaryText }]}>
        {new Date(item.data_emissione).toLocaleDateString()}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => handleShareFatturaPA(item)}
        >
          <Text style={styles.actionBtnText}>📄 FatturaPA</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
          onPress={() => {
            // TODO: Mostra selezione stato
            Alert.alert(
              'Aggiorna Stato',
              'Seleziona il nuovo stato',
              [
                { text: 'Bozza', onPress: () => handleUpdateStato(item.id, 'bozza') },
                { text: 'Inviata', onPress: () => handleUpdateStato(item.id, 'inviata') },
                { text: 'Pagata', onPress: () => handleUpdateStato(item.id, 'pagata') },
                { text: 'Parzialmente Pagata', onPress: () => handleUpdateStato(item.id, 'parzialmente pagata') },
                { text: 'Scaduta', onPress: () => handleUpdateStato(item.id, 'scaduta') },
                { text: 'Annullata', onPress: () => handleUpdateStato(item.id, 'annullata') },
                { text: 'Annulla', style: 'cancel' },
              ]
            );
          }}
        >
          <Text style={styles.actionBtnText}>⚙️ Stato</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Fatture</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowModal(true)}
        >
          <Text style={styles.addBtnText}>+ Nuova</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={fatture}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
              Nessuna fattura ancora
            </Text>
          </View>
        }
      />

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: colors.primary, fontSize: 16 }}>Annulla</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Nuova Fattura</Text>
            <TouchableOpacity onPress={() => { /* TODO: Salva fattura */ setShowModal(false); }}>
              <Text style={{ color: colors.primary, fontSize: 16, fontWeight: 'bold' }}>Salva</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            {/* TODO: Aggiungi campi form completi */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Cliente</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                placeholder="Seleziona cliente..."
                placeholderTextColor={colors.secondaryText}
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Data Emissione</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                value={formData.data_emissione}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 24, fontWeight: 'bold' },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: 'white', fontWeight: 'bold' },
  list: { padding: 16 },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  numeroFattura: { fontSize: 18, fontWeight: 'bold' },
  statoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statoText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  cliente: { fontSize: 14, marginBottom: 4 },
  totale: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  data: { fontSize: 12 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalContent: { padding: 16 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
});
