import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Modal, TextInput, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { useTheme } from '../lib/darkMode';

type Listino = { id: string; name: string };
type ListinoItem = { id: string; description: string; unit_price: number; markup_percent?: number };

export default function ListiniScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [listini, setListini] = useState<Listino[]>([]);
  const [items, setItems] = useState<ListinoItem[]>([]);
  const [selectedListino, setSelectedListino] = useState<Listino | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileMarkupPercent, setProfileMarkupPercent] = useState<number>(0);

  const [showListinoModal, setShowListinoModal] = useState(false);
  const [newListinoName, setNewListinoName] = useState('');
  const [editingListino, setEditingListino] = useState<Listino | null>(null);

  const [showItemModal, setShowItemModal] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('0');
  const [newMarkupPercent, setNewMarkupPercent] = useState('0');
  const [editingItem, setEditingItem] = useState<ListinoItem | null>(null);

  const fetchListini = useCallback(async () => {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      console.warn('auth.getUser error', userErr);
      return;
    }
    if (!user) return;
    const { data: profile, error: profileErr } = await supabase.from('profiles').select('id, material_markup_vat_percent').eq('id', user.id).single();
    if (profileErr) {
      console.warn('profiles select error', profileErr);
      return;
    }
    if (!profile) return;
    setProfileId(profile.id);
    setProfileMarkupPercent(profile.material_markup_vat_percent ?? 0);
    const { data, error } = await supabase.from('listini').select('id, name').eq('profile_id', profile.id);
    if (error) console.warn('listini error', error);
    setListini(data || []);
  }, []);

  const fetchItems = useCallback(async (listinoId: string) => {
    const { data, error } = await supabase.from('listini_vettoriali').select('id, description, unit_price, markup_percent').eq('listino_id', listinoId);
    if (error) console.warn('listini_vettoriali error', error);
    setItems(data || []);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchListini();
      if (selectedListino) fetchItems(selectedListino.id);
      const interval = setInterval(() => {
        fetchListini();
        if (selectedListino) fetchItems(selectedListino.id);
      }, 5000);
      return () => clearInterval(interval);
    }, [selectedListino?.id, fetchListini, fetchItems])
  );

  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel(`listini-sync-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listini', filter: `profile_id=eq.${profileId}` }, fetchListini)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listini_vettoriali' }, () => {
        if (selectedListino) fetchItems(selectedListino.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId, selectedListino?.id, fetchListini, fetchItems]);

  const parseImportedFile = async (uri: string, filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(base64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number)[][];
      if (!rows.length) return [];
      const header = rows[0].map((h) => String(h).toLowerCase());
      const descIdx = header.findIndex((h) => h.includes('desc') || h.includes('voce'));
      const priceIdx = header.findIndex((h) => h.includes('prezzo') || h.includes('price'));
      const markupIdx = header.findIndex((h) => h.includes('markup') || h.includes('ricarico'));
      return rows.slice(1).map((row) => ({
        description: String(row[descIdx >= 0 ? descIdx : 0] ?? '').trim(),
        unit_price: parseFloat(String(row[priceIdx >= 0 ? priceIdx : 1] ?? '0')) || 0,
        markup_percent: parseFloat(String(row[markupIdx >= 0 ? markupIdx : 2] ?? '0')) || 0,
      })).filter((row) => row.description);
    }

    const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return [];
    const linesNoHeader = lines.slice(1);
    return linesNoHeader.map((line) => {
      const [description, unitPrice, markupPercent] = line.split(/[;,]\s*/);
      return {
        description: (description || '').trim(),
        unit_price: parseFloat(unitPrice || '0') || 0,
        markup_percent: parseFloat(markupPercent || '0') || 0,
      };
    }).filter((row) => row.description);
  };

  const handleCreateOrUpdateListino = async () => {
    const name = newListinoName.trim();
    if (!name || !profileId) {
      Alert.alert(t('messages.error'), t('listini.promptNewListino') || 'Inserisci il nome del listino');
      return;
    }
    try {
      if (editingListino) {
        const { error } = await supabase.from('listini').update({ name }).eq('id', editingListino.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('listini').insert({ profile_id: profileId, name });
        if (error) throw error;
      }
      setShowListinoModal(false);
      setNewListinoName('');
      setEditingListino(null);
      fetchListini();
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const handleDeleteListino = async (listinoId: string) => {
    Alert.alert(t('actions.deleteConfirm'), '', [
      { text: t('buttons.cancel'), style: 'cancel' },
      {
        text: t('actions.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('listini').delete().eq('id', listinoId);
            if (error) throw error;
            if (selectedListino?.id === listinoId) {
              setSelectedListino(null);
              setItems([]);
            }
            fetchListini();
          } catch (err) {
            Alert.alert(t('messages.error'), (err as Error).message);
          }
        },
      },
    ]);
  };

  const handleCreateOrUpdateItem = async () => {
    if (!selectedListino || !profileId || !newDescription.trim()) {
      Alert.alert(t('messages.error'), t('listini.description') || 'Inserisci la descrizione');
      return;
    }
    const payload = {
      listino_id: selectedListino.id,
      profile_id: profileId,
      description: newDescription.trim(),
      unit_price: parseFloat(newUnitPrice) || 0,
      markup_percent: parseFloat(newMarkupPercent) || 0,
    };
    try {
      if (editingItem) {
        const { error } = await supabase.from('listini_vettoriali').update(payload).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('listini_vettoriali').insert(payload);
        if (error) throw error;
      }
      setShowItemModal(false);
      setEditingItem(null);
      setNewDescription('');
      setNewUnitPrice('0');
      setNewMarkupPercent(String(profileMarkupPercent || 0));
      fetchItems(selectedListino.id);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    Alert.alert(t('actions.deleteConfirm'), '', [
      { text: t('buttons.cancel'), style: 'cancel' },
      {
        text: t('actions.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('listini_vettoriali').delete().eq('id', itemId);
            if (error) throw error;
            if (selectedListino) fetchItems(selectedListino.id);
          } catch (err) {
            Alert.alert(t('messages.error'), (err as Error).message);
          }
        },
      },
    ]);
  };

  const handleImportFile = async () => {
    if (!selectedListino || !profileId) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/plain',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const rows = await parseImportedFile(asset.uri, asset.name);
      if (!rows.length) {
        Alert.alert(t('messages.error'), t('listini.emptyFile') || 'File vuoto o non valido');
        return;
      }
      const payload = rows.map((row) => ({
        listino_id: selectedListino.id,
        profile_id: profileId,
        description: row.description,
        unit_price: row.unit_price,
        markup_percent: row.markup_percent,
      }));
      const { error } = await supabase.from('listini_vettoriali').insert(payload);
      if (error) throw error;
      fetchItems(selectedListino.id);
      Alert.alert(t('messages.success'), `${rows.length} ${t('listini.itemsAdded') || 'voci aggiunte'}`);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('main.listini')}</Text>
      <View style={styles.topActions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            setEditingListino(null);
            setNewListinoName('');
            setShowListinoModal(true);
          }}
        >
          <Text style={styles.actionBtnText}>{t('listini.newListino') || 'Nuovo listino'}</Text>
        </TouchableOpacity>
        {selectedListino && (
          <>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={handleImportFile}>
              <Text style={styles.actionBtnText}>{t('listini.uploadCsv') || 'Importa CSV/Excel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtnSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {
                setEditingItem(null);
                setNewDescription('');
                setNewUnitPrice('0');
                setNewMarkupPercent(String(profileMarkupPercent || 0));
                setShowItemModal(true);
              }}
            >
              <Text style={[styles.actionBtnSecondaryText, { color: colors.text }]}>{t('listini.addManual') || 'Aggiungi manualmente'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      <View style={styles.grid}>
        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('main.listini')}</Text>
          <FlatList
            data={listini}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <View style={[styles.listinoItemRow, selectedListino?.id === item.id && styles.listinoSelected]}>
                <TouchableOpacity style={styles.listinoNameWrap} onPress={() => setSelectedListino(item)}>
                  <Text style={selectedListino?.id === item.id ? styles.listinoSelectedText : { color: colors.text }}>{item.name}</Text>
                </TouchableOpacity>
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingListino(item);
                      setNewListinoName(item.name);
                      setShowListinoModal(true);
                    }}
                  >
                    <Text style={selectedListino?.id === item.id ? styles.listinoSelectedText : styles.rowActionText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteListino(item.id)}>
                    <Text style={selectedListino?.id === item.id ? styles.listinoSelectedText : styles.rowActionText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
          {selectedListino ? (
            <>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{selectedListino.name}</Text>
              <FlatList
                data={items}
                keyExtractor={(i) => i.id}
                renderItem={({ item }) => (
                  <View style={[styles.itemRow, { borderBottomColor: colors.borderLight }]}>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemDesc, { color: colors.text }]}>{item.description}</Text>
                      <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>€{Number(item.unit_price).toFixed(2)} · {Number(item.markup_percent || 0).toFixed(0)}%</Text>
                    </View>
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingItem(item);
                          setNewDescription(item.description);
                          setNewUnitPrice(String(item.unit_price));
                          setNewMarkupPercent(String(item.markup_percent || 0));
                          setShowItemModal(true);
                        }}
                      >
                        <Text style={styles.rowActionText}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteItem(item.id)}>
                        <Text style={styles.rowActionText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            </>
          ) : (
            <Text style={[styles.placeholder, { color: colors.textTertiary }]}>{t('sections.selectListino')}</Text>
          )}
        </View>
      </View>

      <Modal visible={showListinoModal} transparent animationType="fade" onRequestClose={() => setShowListinoModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editingListino ? (t('actions.edit') || 'Modifica') : (t('listini.newListino') || 'Nuovo listino')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={newListinoName}
              onChangeText={setNewListinoName}
              placeholder={t('listini.promptNewListino') || 'Nome listino'}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setShowListinoModal(false)}>
                <Text style={styles.modalBtnSecondaryText}>{t('buttons.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleCreateOrUpdateListino}>
                <Text style={styles.modalBtnPrimaryText}>{t('buttons.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showItemModal} transparent animationType="fade" onRequestClose={() => setShowItemModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editingItem ? (t('actions.edit') || 'Modifica voce') : (t('listini.newItem') || 'Nuova voce')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder={t('listini.description') || 'Descrizione'}
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={newUnitPrice}
              onChangeText={setNewUnitPrice}
              keyboardType="decimal-pad"
              placeholder={t('listini.price') || 'Prezzo'}
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={newMarkupPercent}
              onChangeText={setNewMarkupPercent}
              keyboardType="decimal-pad"
              placeholder={t('listini.markup') || 'Markup %'}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setShowItemModal(false)}>
                <Text style={styles.modalBtnSecondaryText}>{t('buttons.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleCreateOrUpdateItem}>
                <Text style={styles.modalBtnPrimaryText}>{t('buttons.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  topActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  actionBtn: { backgroundColor: '#dc2626', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontWeight: '600' },
  actionBtnSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  actionBtnSecondaryText: { color: '#334155', fontWeight: '600' },
  grid: { flexDirection: 'row', gap: 16, flex: 1 },
  card: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontWeight: '600', marginBottom: 12 },
  listinoItemRow: { padding: 8, borderRadius: 8, marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
  listinoNameWrap: { flex: 1 },
  listinoSelected: { backgroundColor: '#dc2626' },
  listinoSelectedText: { color: '#fff' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemDesc: { fontSize: 14 },
  itemMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  rowActionText: { fontSize: 16 },
  placeholder: { color: '#94a3b8', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: '#fff' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtnPrimary: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '600' },
  modalBtnSecondary: { flex: 1, backgroundColor: '#e2e8f0', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnSecondaryText: { color: '#334155', fontWeight: '600' },
});
