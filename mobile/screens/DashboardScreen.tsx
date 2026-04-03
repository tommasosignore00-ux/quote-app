import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Modal, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform, DeviceEventEmitter } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import VoiceButton from '../components/VoiceButton';
import { useFocusEffect } from '@react-navigation/native';
import { trackTimeSaving, getTimeSavingsStats } from '../lib/timeSavings';
import { findCrossSellInListino } from '../lib/crossSelling';
import { startNetworkListener, stopNetworkListener } from '../lib/offline';
import { useTheme } from '../lib/darkMode';

type Cliente = { id: string; name: string };
type Lavoro = { id: string; title: string; cliente_id: string; clienti?: any };
type Costo = { id: string; description: string; quantity: number; unit_price: number; tax_rate: number };

export default function DashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { colors } = useTheme();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [selectedLavoro, setSelectedLavoro] = useState<Lavoro | null>(null);
  const [costi, setCosti] = useState<Costo[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  // Helper: gating
  const isProOrTeam = subscriptionStatus === 'active' || subscriptionStatus === 'team';
  const isTeam = subscriptionStatus === 'team';
  const [profileVatPercent, setProfileVatPercent] = useState<number>(22);
  const [profileMaterialMarkup, setProfileMaterialMarkup] = useState<number>(0);
  const [showClientModal, setShowClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  const [showJobModal, setShowJobModal] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [jobClienteId, setJobClienteId] = useState<string | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);

  // Punto 22/23: Client country + language for new client modal
  const [newClientCountry, setNewClientCountry] = useState('IT');
  const [newClientLanguage, setNewClientLanguage] = useState('it');

  // Punto 24: Currency selector for new job modal
  const CURRENCY_OPTIONS = [
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  ];
  const [selectedCurrency, setSelectedCurrency] = useState('EUR');
  const [exchangeRate, setExchangeRate] = useState(1.0);

  const [showCostoModal, setShowCostoModal] = useState(false);
  const [newCostoDesc, setNewCostoDesc] = useState('');
  const [newCostoQty, setNewCostoQty] = useState('1');
  const [newCostoPrice, setNewCostoPrice] = useState('0');
  const [creatingCosto, setCreatingCosto] = useState(false);
  const [matchedItem, setMatchedItem] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showListinoSelector, setShowListinoSelector] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [crossSellItems, setCrossSellItems] = useState<any[]>([]);
  const [showCrossSell, setShowCrossSell] = useState(false);
  const [timeSaved, setTimeSaved] = useState<string>('');

  // Punto 4: Carousel Fallback state
  const [showFallbackCarousel, setShowFallbackCarousel] = useState(false);
  const [carouselItems, setCarouselItems] = useState<any[]>([]);

  // Punto 1/43: Start offline network listener for auto-sync
  useEffect(() => {
    startNetworkListener((result) => {
      if (result.synced > 0) {
        Alert.alert('✅ Sincronizzazione', `${result.synced} operazioni sincronizzate`);
        fetchData();
      }
    });
    return () => stopNetworkListener();
  }, []);

  // Punto 44: Load time savings
  useEffect(() => {
    getTimeSavingsStats().then((stats) => {
      if (stats.totalHoursSaved > 0) {
        setTimeSaved(`⏱ ${stats.totalHoursSaved}h risparmiate`);
      }
    });
  }, []);

  useEffect(() => {
    const shouldStartVoice = Boolean((route.params as any)?.startVoice);
    if (!shouldStartVoice) return;

    const timer = setTimeout(() => {
      DeviceEventEmitter.emit('startVoiceRecording');
      if (typeof (navigation as any).setParams === 'function') {
        (navigation as any).setParams({ startVoice: false });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [route.params, navigation]);

  const filteredClienti = clientSearch.trim()
    ? clienti.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clienti;

  const filteredLavori = selectedClienteId
    ? lavori.filter((job) => job.cliente_id === selectedClienteId)
    : [];

  const fetchData = useCallback(async () => {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      console.warn('auth.getUser error', userErr);
      return;
    }
    if (!user) return;
    let pid = user.id;
    const { data: profile, error: profileErr } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profile) {
      pid = profile.id;
      setProfileVatPercent(Number((profile as any).vat_percent) || 22);
      setProfileMaterialMarkup(Number((profile as any).material_markup) || 0);
      setSubscriptionStatus(profile.subscription_status || null);
    } else if (profileErr) {
      console.warn('profiles select error', profileErr);
    }
    setProfileId(pid);

    const { data: c, error: cErr } = await supabase.from('clienti').select('id, name').eq('profile_id', pid);
    if (cErr) console.warn('clienti error', cErr);
    setClienti(c || []);

    const { data: l, error: lErr } = await supabase.from('lavori').select('id, title, cliente_id, clienti(name)').eq('profile_id', pid);
    if (lErr) console.warn('lavori error', lErr);
    setLavori(l || []);

    if (selectedLavoro) {
      const { data: costiData, error: costiErr } = await supabase.from('preventivi_dettaglio').select('id, description, quantity, unit_price, tax_rate').eq('lavoro_id', selectedLavoro.id);
      if (costiErr) console.warn('preventivi_dettaglio error', costiErr);
      setCosti(costiData || []);
    }
  }, [selectedLavoro?.id]);

  useFocusEffect(
    React.useCallback(() => {
      fetchData();
      return undefined;
    }, [fetchData])
  );
  useEffect(() => { if (selectedLavoro) fetchData(); }, [selectedLavoro?.id, fetchData]);

  // Punto 4: Fetch listino items for carousel fallback
  const fetchCarouselItems = useCallback(async () => {
    if (!profileId) return;
    const { data: items } = await supabase
      .from('listini_vettoriali')
      .select('id, description, unit_price, markup_percent')
      .eq('profile_id', profileId)
      .limit(30);
    setCarouselItems(items || []);
  }, [profileId]);

  // Punto 4: Handle mic permission denied → show carousel
  const handleMicDenied = useCallback(() => {
    setShowFallbackCarousel(true);
    fetchCarouselItems();
  }, [fetchCarouselItems]);

  // Gating: AI/cross-selling solo Pro/Team
  const canUseAI = isProOrTeam;
  const canUseCrossSelling = isProOrTeam;
  const canUseBranding = isProOrTeam;
  const canUseAdvancedNotifications = isProOrTeam;
  const canUseTeamFeatures = isTeam;

  // Gating: mostra messaggio se utente Free tenta funzioni Pro/Team
  const showUpgradeAlert = (feature: string) => {
    Alert.alert('Funzione riservata', `${feature} è disponibile solo per abbonati Pro o Team.`, [
      { text: 'Scopri i piani', onPress: () => navigation.navigate('Subscription') },
      { text: 'Annulla', style: 'cancel' },
    ]);
  };

  // Punto 4: Add cost item from carousel
  const handleAddCostoFromListino = async (item: any) => {
    if (!selectedLavoro) {
      Alert.alert(t('messages.error'), t('sections.selectClientToViewJobs') || 'Seleziona prima un lavoro');
      return;
    }
    const { data: created, error } = await supabase.from('preventivi_dettaglio').insert({
      lavoro_id: selectedLavoro.id,
      description: item.description,
      quantity: 1,
      unit_price: Number(item.unit_price),
      tax_rate: Number(item.markup_percent) || profileMaterialMarkup,
      listino_item_id: item.id,
    }).select('*');
    if (error) {
      console.warn('carousel insert error', error);
      return;
    }
    if (created && created[0]) setCosti((prev) => [created[0], ...prev]);
    setShowFallbackCarousel(false);
    fetchData();
  };

  // Punto 14: Save user corrections for command mapping
  const handleSaveCorrection = async (originalText: string, correctedDescription: string, itemId?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_command_mappings').upsert({
      profile_id: user.id,
      raw_text: originalText.toLowerCase(),
      mapped_description: correctedDescription,
      listino_item_id: itemId || null,
    }, { onConflict: 'profile_id,raw_text' });
  };

  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel(`dashboard-sync-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clienti', filter: `profile_id=eq.${profileId}` }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lavori', filter: `profile_id=eq.${profileId}` }, fetchData)
      .subscribe();

    const dettagliChannel = selectedLavoro?.id
      ? supabase
          .channel(`dashboard-dettaglio-${selectedLavoro.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'preventivi_dettaglio', filter: `lavoro_id=eq.${selectedLavoro.id}` }, fetchData)
          .subscribe()
      : null;

    return () => {
      supabase.removeChannel(channel);
      if (dettagliChannel) supabase.removeChannel(dettagliChannel);
    };
  }, [profileId, selectedLavoro?.id, fetchData]);

  const handleVoiceResult = async (result: { action: string; data?: Record<string, unknown> }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single();
    if (!profile) return;

    if (result.action === 'create_cliente' && result.data?.name) {
      const payload = { profile_id: profile.id, name: String(result.data.name) };
      const { data: created, error } = await supabase.from('clienti').insert(payload).select('*');
      if (error) console.warn('clienti insert error', error);
      if (created && created[0]) setClienti((p) => [...p, created[0]]);
    } else if (result.action === 'create_lavoro' && result.data?.title && (result.data?.cliente_id || result.data?.cliente_name)) {
      let clienteId = result.data.cliente_id as string | undefined;
      if (!clienteId && result.data.cliente_name) {
        const match = clienti.find((client) => client.name.toLowerCase().includes(String(result.data?.cliente_name).toLowerCase()));
        clienteId = match?.id;
      }
      if (clienteId) {
        await supabase.from('lavori').insert({
          profile_id: profile.id,
          cliente_id: String(clienteId),
          title: String(result.data.title),
        });
      }
    } else if (result.action === 'add_costo' && result.data?.description && selectedLavoro) {
      // Cerca nel listino prima di aggiungere
      const { data: items } = await supabase
        .from('listini_vettoriali')
        .select('*')
        .eq('profile_id', profile.id)
        .ilike('description', `%${result.data.description}%`)
        .limit(1);
      
      if (items && items.length > 0) {
        const item = items[0];
        const { data: created, error } = await supabase.from('preventivi_dettaglio').insert({
          lavoro_id: selectedLavoro.id,
          description: item.description,
          quantity: 1,
          unit_price: Number(item.unit_price),
          tax_rate: Number(item.markup_percent) || profileMaterialMarkup,
          listino_item_id: item.id,
        }).select('*');
        if (error) console.warn('preventivi_dettaglio insert error', error);
        if (created && created[0]) setCosti((prev) => [created[0], ...prev]);
      } else {
        const { data: created, error } = await supabase.from('preventivi_dettaglio').insert({
          lavoro_id: selectedLavoro.id,
          description: String(result.data.description),
          quantity: 1,
          unit_price: 0,
          tax_rate: profileMaterialMarkup,
        }).select('*');
        if (error) console.warn('preventivi_dettaglio insert error', error);
        if (created && created[0]) setCosti((prev) => [created[0], ...prev]);
      }
    }
    fetchData();
    // Punto 44: Track time savings for voice actions
    if (result.action === 'create_cliente') await trackTimeSaving('create_cliente');
    else if (result.action === 'create_lavoro') await trackTimeSaving('create_lavoro');
    else if (result.action === 'add_costo') {
      await trackTimeSaving('add_costo');
          // Punto 13: Cross-selling suggestions
          if (result.data?.description && profileId) {
            if (canUseCrossSelling) {
              const crossItems = await findCrossSellInListino(supabase, profileId, String(result.data.description));
              if (crossItems.length > 0) {
                setCrossSellItems(crossItems);
                setShowCrossSell(true);
              }
            } else {
              showUpgradeAlert('Suggerimenti AI e cross-selling');
            }
          }
    }
    // Refresh time savings display
    getTimeSavingsStats().then((stats) => {
      if (stats.totalHoursSaved > 0) setTimeSaved(`⏱ ${stats.totalHoursSaved}h risparmiate`);
    });
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      Alert.alert(t('messages.error'), 'Inserisci il nome del cliente');
      return;
    }
    setCreatingClient(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single();
      if (!profile) throw new Error('Profile not found');
      const { data: created, error } = await supabase.from('clienti').insert({ profile_id: profile.id, name: newClientName, country_code: newClientCountry, preferred_language: newClientLanguage }).select('*');
      if (error) throw error;
      if (created && created[0]) setClienti((p) => [...p, created[0]]);
      setNewClientName('');
      setNewClientCountry('IT');
      setNewClientLanguage('it');
      setShowClientModal(false);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setCreatingClient(false);
    }
  };

  // Punto 24: Fetch exchange rate for selected currency
  const fetchExchangeRate = async (currency: string) => {
    if (currency === 'EUR') { setExchangeRate(1.0); return; }
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
      const data = await res.json();
      setExchangeRate(data.rates?.[currency] || 1.0);
    } catch {
      setExchangeRate(1.0);
    }
  };

  const handleCreateJob = async () => {
    if (!newJobTitle.trim() || !jobClienteId) {
      Alert.alert(t('messages.error'), 'Inserisci titolo e cliente');
      return;
    }
    setCreatingJob(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single();
      if (!profile) throw new Error('Profile not found');
      const { data: created, error } = await supabase.from('lavori').insert({ profile_id: profile.id, title: newJobTitle, cliente_id: jobClienteId, original_currency: selectedCurrency, exchange_rate: exchangeRate }).select('*');
      if (error) throw error;
      if (created && created[0]) setLavori((p) => [created[0], ...p]);
      setNewJobTitle('');
      setJobClienteId(null);
      setSelectedCurrency('EUR');
      setExchangeRate(1.0);
      setShowJobModal(false);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setCreatingJob(false);
    }
  };

  const handleCreateCosto = async () => {
    if (!newCostoDesc.trim() || !selectedLavoro) {
      Alert.alert(t('messages.error'), 'Inserisci descrizione costo');
      return;
    }
    setCreatingCosto(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single();
      if (!profile) throw new Error('Profile not found');

      const quantity = parseFloat(newCostoQty) || 1;
      let unitPrice = parseFloat(newCostoPrice) || 0;
      let description = newCostoDesc;
      let taxRate = profileMaterialMarkup;
      let listinoItemId = null;

      if (matchedItem) {
        description = matchedItem.description;
        unitPrice = Number(matchedItem.unit_price);
        taxRate = Number(matchedItem.markup_percent) || profileMaterialMarkup;
        listinoItemId = matchedItem.id;
      } else if (unitPrice === 0) {
        const items = await findListinoMatches(newCostoDesc);
        if (items.length === 1) {
          const item = items[0];
          description = item.description;
          unitPrice = Number(item.unit_price);
          taxRate = Number(item.markup_percent) || profileMaterialMarkup;
          listinoItemId = item.id;
        } else if (items.length > 1) {
          setSearchResults(items);
          setShowListinoSelector(true);
          setCreatingCosto(false);
          Alert.alert(t('dashboard.selectionRequiredTitle'), t('dashboard.selectionRequiredMessage'));
          return;
        }
      }

      const { data: created, error } = await supabase.from('preventivi_dettaglio').insert({
        lavoro_id: selectedLavoro.id,
        description,
        quantity,
        unit_price: unitPrice,
        tax_rate: taxRate,
        listino_item_id: listinoItemId,
      }).select('*');
      if (error) throw error;
      if (created && created[0]) setCosti((prev) => [created[0], ...prev]);
      setNewCostoDesc('');
      setNewCostoQty('1');
      setNewCostoPrice('0');
      setMatchedItem(null);
      setShowCostoModal(false);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setCreatingCosto(false);
    }
  };

  const findListinoMatches = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || !profileId) return [] as any[];

    const { data: items, error } = await supabase
      .from('listini_vettoriali')
      .select('id, description, unit_price, markup_percent, sku, category, listino_id')
      .eq('profile_id', profileId)
      .ilike('description', `%${trimmed}%`)
      .limit(5);

    if (error) throw error;

    let resultItems = items || [];

    // Word-token fallback: if no results for full query, try matching individual words
    if (resultItems.length === 0) {
      const words = trimmed.split(/\s+/).filter((w) => w.length >= 2);
      if (words.length > 1) {
        const orFilter = words.map((w) => `description.ilike.%${w}%`).join(',');
        const { data: wordItems, error: wordError } = await supabase
          .from('listini_vettoriali')
          .select('id, description, unit_price, markup_percent, sku, category, listino_id')
          .eq('profile_id', profileId)
          .or(orFilter)
          .limit(5);
        if (!wordError && wordItems) resultItems = wordItems;
      }
    }

    if (resultItems.length === 0) return [];

    const listinoIds = Array.from(new Set(resultItems.map((item) => item.listino_id).filter(Boolean)));
    let listiniById = new Map<string, string>();
    if (listinoIds.length > 0) {
      const { data: listini, error: listiniError } = await supabase
        .from('listini')
        .select('id, name')
        .in('id', listinoIds as string[]);
      if (listiniError) throw listiniError;
      listiniById = new Map((listini || []).map((listino) => [listino.id, listino.name]));
    }

    return resultItems.map((item) => ({
      ...item,
      listino_name: item.listino_id ? (listiniById.get(item.listino_id) || t('dashboard.unknownListino')) : t('dashboard.unknownListino'),
    }));
  };

  const applyListinoItem = (item: any) => {
    const markup = Number(item.markup_percent) || profileMaterialMarkup;
    const priceWithMarkup = Number(item.unit_price) * (1 + markup / 100);
    setNewCostoDesc(item.description || '');
    setNewCostoPrice(priceWithMarkup.toFixed(2));
    setMatchedItem(item);
  };

  const searchInListino = async (showNoResultAlert = true) => {
    if (!newCostoDesc.trim()) return;
    try {
      const items = await findListinoMatches(newCostoDesc);

      if (items.length === 1) {
        applyListinoItem(items[0]);
        return;
      }

      if (items.length > 1) {
        setSearchResults(items);
        setShowListinoSelector(true);
        return;
      }

      setMatchedItem(null);
      if (showNoResultAlert) {
        Alert.alert(t('dashboard.notFoundTitle'), t('dashboard.noMaterialFound'));
      }
    } catch (err) {
      console.error('Search error:', err);
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  useEffect(() => {
    if (!showCostoModal || !newCostoDesc.trim() || !profileId) {
      if (!newCostoDesc.trim()) setMatchedItem(null);
      return;
    }

    if (matchedItem && matchedItem.description === newCostoDesc) {
      return;
    }

    const timer = setTimeout(() => {
      searchInListino(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [newCostoDesc, showCostoModal, profileId, matchedItem]);

  const selectListinoItem = (item: any) => {
    applyListinoItem(item);
    setShowListinoSelector(false);
    setSearchResults([]);
  };

  const handleDeleteClient = async (clientId: string) => {
    Alert.alert(
      t('actions.deleteConfirm'),
      '',
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('actions.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('clienti').delete().eq('id', clientId);
              if (error) throw error;
              if (selectedClienteId === clientId) {
                setSelectedClienteId(null);
                setSelectedLavoro(null);
              }
              Alert.alert(t('messages.success'), t('actions.deleted'));
              fetchData();
            } catch (err) {
              Alert.alert(t('messages.error'), (err as Error).message);
            }
          }
        }
      ]
    );
  };

  const handleDeleteJob = async (jobId: string) => {
    Alert.alert(
      t('actions.deleteConfirm'),
      '',
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('actions.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('lavori').delete().eq('id', jobId);
              if (error) throw error;
              if (selectedLavoro?.id === jobId) setSelectedLavoro(null);
              Alert.alert(t('messages.success'), t('actions.deleted'));
              fetchData();
            } catch (err) {
              Alert.alert(t('messages.error'), (err as Error).message);
            }
          }
        }
      ]
    );
  };

  const handleSelectCliente = (clientId: string) => {
    if (selectedClienteId === clientId) {
      setSelectedClienteId(null);
      setSelectedLavoro(null);
      return;
    }

    setSelectedClienteId(clientId);
    if (selectedLavoro && selectedLavoro.cliente_id !== clientId) {
      setSelectedLavoro(null);
    }
  };

  const handleDeleteCosto = async (costoId: string) => {
    Alert.alert(
      t('actions.deleteConfirm'),
      '',
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('actions.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('preventivi_dettaglio').delete().eq('id', costoId);
              if (error) throw error;
              Alert.alert(t('messages.success'), t('actions.deleted'));
              fetchData();
            } catch (err) {
              Alert.alert(t('messages.error'), (err as Error).message);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{t('main.jobs')}</Text>
        {timeSaved ? <Text style={styles.timeSavedBadge}>{timeSaved}</Text> : null}
      </View>

      <View style={styles.grid}>
        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('sections.clients')}</Text>
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={() => setShowClientModal(true)}>
              <Text style={[styles.smallBtnText, { color: colors.primary }]}>+ {t('actions.add')}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
            placeholder={t('dashboard.searchClient') || 'Cerca cliente...'}
            value={clientSearch}
            onChangeText={setClientSearch}
            clearButtonMode="while-editing"
            placeholderTextColor={colors.textTertiary}
          />
          <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {filteredClienti.map((item) => (
              <View key={item.id} style={styles.listItemRow}>
                <TouchableOpacity
                  onPress={() => handleSelectCliente(item.id)}
                  style={[styles.clienteSelectBtn, selectedClienteId === item.id && styles.clienteSelected]}
                >
                  <Text style={[styles.item, selectedClienteId === item.id && styles.clienteSelectedText]}>{item.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteClient(item.id)}>
                  <Text style={styles.deleteBtn}>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('sections.jobs')}</Text>
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={() => { setJobClienteId(selectedClienteId ?? clienti[0]?.id ?? null); setShowJobModal(true); }}>
              <Text style={[styles.smallBtnText, { color: colors.primary }]}>+ {t('actions.add')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {filteredLavori.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('sections.selectClientToViewJobs') || 'Seleziona un cliente per vedere i lavori'}</Text>
            ) : filteredLavori.map((item) => (
              <View key={item.id} style={styles.lavoroItemContainer}>
                <TouchableOpacity
                  onPress={() => setSelectedLavoro(item)}
                  style={[styles.lavoroItem, selectedLavoro?.id === item.id && styles.lavoroSelected]}
                >
                  <Text style={selectedLavoro?.id === item.id ? styles.lavoroSelectedText : undefined}>
                    {(item.clienti as { name?: string })?.name} - {item.title}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteJob(item.id)} style={styles.deleteBtnContainer}>
                  <Text style={styles.deleteBtn}>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      {!selectedClienteId && (
        <View style={styles.voiceCenterWrap}>
          {subscriptionStatus === 'active' && (
            <VoiceButton onResult={handleVoiceResult} clienti={clienti} size={260} onMicDenied={handleMicDenied} />
          )}
        </View>
      )}

      {/* Punto 4: Carousel Fallback when mic is not available */}
      {showFallbackCarousel && carouselItems.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('dashboard.selectMaterial') || 'Seleziona materiale:'}</Text>
            <TouchableOpacity onPress={() => setShowFallbackCarousel(false)}>
              <Text style={{ fontSize: 18, color: '#64748b' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={carouselItems}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.carouselCard}
                onPress={() => handleAddCostoFromListino(item)}
              >
                <Text style={styles.carouselDesc} numberOfLines={2}>{item.description}</Text>
                <Text style={styles.carouselPrice}>€{Number(item.unit_price).toFixed(2)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Punto 13: Cross-Selling AI Suggestions */}
      {showCrossSell && (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.cardTitle}>💡 Prodotti correlati</Text>
            <TouchableOpacity onPress={() => setShowCrossSell(false)}>
              <Text style={{ fontSize: 18, color: '#64748b' }}>✕</Text>
            </TouchableOpacity>
          </View>
          {canUseCrossSelling && crossSellItems.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {crossSellItems.map((item, idx) => (
                <TouchableOpacity
                  key={`cross-${item.id}-${idx}`}
                  style={styles.crossSellCard}
                  onPress={async () => {
                    if (selectedLavoro) {
                      const { data: created } = await supabase.from('preventivi_dettaglio').insert({
                        lavoro_id: selectedLavoro.id,
                        description: item.description,
                        quantity: 1,
                        unit_price: Number(item.unit_price),
                        tax_rate: Number(item.markup_percent) || profileMaterialMarkup,
                        listino_item_id: item.id,
                      }).select('*');
                      if (created && created[0]) setCosti((prev) => [created[0], ...prev]);
                      await trackTimeSaving('add_costo');
                      fetchData();
                    }
                  }}
                >
                  <Text style={styles.crossSellDesc} numberOfLines={2}>{item.description}</Text>
                  <Text style={styles.crossSellPrice}>€{Number(item.unit_price).toFixed(2)}</Text>
                  <Text style={styles.crossSellAdd}>+ Aggiungi</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <Text style={{ color: '#dc2626', fontWeight: '600', padding: 12 }}>Funzione riservata agli abbonati Pro/Team</Text>
          )}
        </View>
      )}

      {selectedLavoro && (
        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('sections.detailsLabel')} {selectedLavoro.title}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.smallBtn} onPress={() => setShowCostoModal(true)}>
                <Text style={styles.smallBtnText}>+ {t('actions.add')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnQuote} onPress={() => (navigation as any).navigate('Quote', { lavoro: selectedLavoro })}>
                <Text style={styles.btnQuoteText}>{t('main.generateQuote')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {costi.map((item) => (
            <View key={item.id} style={styles.costoRowContainer}>
              <View style={[styles.costoRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.costoDesc, { color: colors.text }]}>{item.description}</Text>
                <Text style={[styles.costoPrice, { color: colors.primary }]}>€{(item.quantity * item.unit_price * (1 + (Number(item.tax_rate) || 0) / 100)).toFixed(2)}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDeleteCosto(item.id)} style={styles.deleteBtnContainer}>
                <Text style={styles.deleteBtn}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <Modal visible={showClientModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('actions.addClient') || 'Aggiungi cliente'}</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('profile.company') || 'Nome cliente'} value={newClientName} onChangeText={setNewClientName} placeholderTextColor={colors.textTertiary} />
            {/* Punto 22: Country code picker */}
            <Text style={{ marginBottom: 4, color: colors.textSecondary, fontSize: 13 }}>Paese / Country</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, maxHeight: 40 }}>
              {['IT','DE','FR','ES','GB','US','AT','CH','NL','BE','PT','PL','RO','CZ','HR','HU','SK','SI','BG','EL','RU','UA','JA','KO','ZH'].map(cc => (
                <TouchableOpacity key={cc} onPress={() => setNewClientCountry(cc)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 6, backgroundColor: newClientCountry === cc ? '#dc2626' : '#f1f5f9' }}>
                  <Text style={{ color: newClientCountry === cc ? '#fff' : '#374151', fontWeight: newClientCountry === cc ? '700' : '400', fontSize: 13 }}>{cc}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Punto 23: Language picker */}
            <Text style={{ marginBottom: 4, color: colors.textSecondary, fontSize: 13 }}>Lingua preventivi / Quote language</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, maxHeight: 40 }}>
              {[{c:'it',l:'Italiano'},{c:'en',l:'English'},{c:'de',l:'Deutsch'},{c:'fr',l:'Français'},{c:'es',l:'Español'},{c:'nl',l:'Nederlands'},{c:'pt',l:'Português'},{c:'pl',l:'Polski'},{c:'ro',l:'Română'},{c:'cs',l:'Čeština'},{c:'hu',l:'Magyar'},{c:'sk',l:'Slovenčina'},{c:'sl',l:'Slovenščina'},{c:'hr',l:'Hrvatski'},{c:'bg',l:'Български'},{c:'el',l:'Ελληνικά'},{c:'ru',l:'Русский'},{c:'uk',l:'Українська'},{c:'ja',l:'日本語'},{c:'ko',l:'한국어'},{c:'zh',l:'中文'}].map(lang => (
                <TouchableOpacity key={lang.c} onPress={() => setNewClientLanguage(lang.c)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 6, backgroundColor: newClientLanguage === lang.c ? '#dc2626' : '#f1f5f9' }}>
                  <Text style={{ color: newClientLanguage === lang.c ? '#fff' : '#374151', fontWeight: newClientLanguage === lang.c ? '700' : '400', fontSize: 13 }}>{lang.l}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={styles.btn} onPress={() => setShowClientModal(false)}>
                <Text style={styles.btnText}>{t('buttons.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btn} onPress={handleCreateClient} disabled={creatingClient}>
                <Text style={styles.btnText}>{creatingClient ? t('buttons.loading') : t('buttons.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showJobModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('actions.addJob') || 'Aggiungi lavoro'}</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('sections.jobs') || 'Titolo lavoro'} value={newJobTitle} onChangeText={setNewJobTitle} placeholderTextColor={colors.textTertiary} />
            <Text style={{ marginBottom: 8, color: colors.text }}>{t('sections.clients') || 'Cliente'}</Text>
            <FlatList data={clienti} keyExtractor={(i) => i.id} style={{ maxHeight: 120 }} renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setJobClienteId(item.id)} style={[styles.listinoItem, jobClienteId === item.id && styles.listinoSelected]}>
                <Text style={jobClienteId === item.id ? styles.listinoSelectedText : undefined}>{item.name}</Text>
              </TouchableOpacity>
            )} />
            {/* Punto 24: Currency selector */}
            <Text style={{ marginTop: 12, marginBottom: 6, color: colors.textSecondary, fontSize: 13 }}>Valuta / Currency</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {CURRENCY_OPTIONS.map(cur => (
                <TouchableOpacity key={cur.code} onPress={() => { setSelectedCurrency(cur.code); fetchExchangeRate(cur.code); }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: selectedCurrency === cur.code ? '#dc2626' : '#f1f5f9' }}>
                  <Text style={{ color: selectedCurrency === cur.code ? '#fff' : '#374151', fontWeight: selectedCurrency === cur.code ? '700' : '400', fontSize: 14 }}>{cur.symbol} {cur.code}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedCurrency !== 'EUR' && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12 }}>Tasso di cambio: 1 EUR = {exchangeRate.toFixed(4)} {selectedCurrency}</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={styles.btn} onPress={() => setShowJobModal(false)}>
                <Text style={styles.btnText}>{t('buttons.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btn} onPress={handleCreateJob} disabled={creatingJob}>
                <Text style={styles.btnText}>{creatingJob ? t('buttons.loading') : t('buttons.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCostoModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '85%', backgroundColor: colors.modalBg }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('actions.addCost') || 'Aggiungi voce'}</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('sections.description') || 'Descrizione'} value={newCostoDesc} onChangeText={setNewCostoDesc} placeholderTextColor={colors.textTertiary} />

              {/* Inline search results (replaces separate modal to avoid iOS modal-on-modal crash) */}
              {showListinoSelector && searchResults.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ marginBottom: 8, color: '#64748b', fontSize: 14 }}>
                    {t('dashboard.selectMaterial')} ({searchResults.length} {t('dashboard.resultsFound', { count: searchResults.length })})
                  </Text>
                  {searchResults.map((item, idx) => (
                    <TouchableOpacity
                      key={`${item.id}-${idx}`}
                      style={styles.listinoSelectorItem}
                      onPress={() => selectListinoItem(item)}
                    >
                      <Text style={styles.listinoSelectorDesc}>{item.description}</Text>
                      <Text style={styles.listinoSelectorListino}>📋 {item.listino_name || t('dashboard.unknownListino')}</Text>
                      <Text style={styles.listinoSelectorPrice}>€{(Number(item.unit_price) * (1 + (Number(item.markup_percent) || 0) / 100)).toFixed(2)} {item.markup_percent ? `(base €${Number(item.unit_price).toFixed(2)} +${item.markup_percent}%)` : ''}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Matched item indicator */}
              {matchedItem && (
                <View style={{ backgroundColor: '#f0fdf4', padding: 10, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#86efac' }}>
                  <Text style={{ fontSize: 14, color: '#166534', fontWeight: '600' }}>✓ {matchedItem.description} — €{(Number(matchedItem.unit_price) * (1 + (Number(matchedItem.markup_percent) || 0) / 100)).toFixed(2)}</Text>
                </View>
              )}

              <TextInput style={styles.input} placeholder={t('dashboard.quantity')} value={newCostoQty} onChangeText={setNewCostoQty} keyboardType="decimal-pad" />
              <TextInput style={styles.input} placeholder={t('dashboard.unitPrice')} value={newCostoPrice} onChangeText={setNewCostoPrice} keyboardType="decimal-pad" />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity style={styles.btn} onPress={() => { setShowCostoModal(false); setShowListinoSelector(false); setSearchResults([]); setMatchedItem(null); }}>
                  <Text style={styles.btnText}>{t('buttons.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={handleCreateCosto} disabled={creatingCosto}>
                  <Text style={styles.btnText}>{creatingCosto ? t('buttons.loading') : t('buttons.save')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      </ScrollView>

      <View style={[styles.nav, { borderTopColor: colors.border, backgroundColor: colors.navBg }]}>
        <TouchableOpacity style={styles.navBtn} onPress={() => (navigation as any).navigate('Dashboard')}>
          <Text style={[styles.navText, { color: colors.textSecondary }]}>🏠 {t('main.jobs')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => (navigation as any).navigate('Listini')}>
          <Text style={[styles.navText, { color: colors.textSecondary }]}>📋 {t('main.listini')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => (navigation as any).navigate('Profile')}>
          <Text style={[styles.navText, { color: colors.textSecondary }]}>👤 {t('main.profile')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 18 },
  title: { fontSize: 28, fontWeight: 'bold' },
  grid: { flexDirection: 'column', gap: 16, marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontWeight: '700', fontSize: 19, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  item: { fontSize: 17, marginBottom: 4, flex: 1 },
  listItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  deleteBtn: { fontSize: 22, paddingHorizontal: 8 },
  deleteBtnContainer: { paddingHorizontal: 8 },
  lavoroItemContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  lavoroItem: { padding: 12, borderRadius: 10, flex: 1, backgroundColor: '#f8fafc' },
  lavoroSelected: { backgroundColor: '#dc2626' },
  lavoroSelectedText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  costoRowContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  costoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flex: 1 },
  costoDesc: { fontSize: 16, flex: 1 },
  costoPrice: { fontSize: 16, fontWeight: '700' },
  btnQuote: { backgroundColor: '#dc2626', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  btnQuoteText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  smallBtn: { backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  smallBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, marginBottom: 12 },
  btn: { backgroundColor: '#dc2626', paddingVertical: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  listinoItem: { padding: 10, borderRadius: 10, marginBottom: 6 },
  listinoSelected: { backgroundColor: '#dc2626' },
  listinoSelectedText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  nav: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 18, borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 'auto' },
  navBtn: { padding: 10 },
  navText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  voiceCenterWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  clienteSelectBtn: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#f8fafc' },
  clienteSelected: { backgroundColor: '#dc2626' },
  clienteSelectedText: { color: '#fff', fontWeight: '700' },
  emptyText: { fontSize: 15, color: '#64748b', paddingVertical: 12 },
  searchInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 8, marginBottom: 8, fontSize: 14 },
  listinoSelectorItem: { backgroundColor: '#f8fafc', padding: 14, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  listinoSelectorDesc: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  listinoSelectorListino: { fontSize: 14, color: '#64748b', marginBottom: 2 },
  listinoSelectorPrice: { fontSize: 15, fontWeight: '700', color: '#dc2626' },
  timeSavedBadge: { fontSize: 13, color: '#10b981', fontWeight: '600', backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  crossSellCard: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, marginRight: 10, width: 160, borderWidth: 1, borderColor: '#86efac' },
  crossSellDesc: { fontSize: 14, fontWeight: '600', color: '#166534', marginBottom: 6 },
  crossSellPrice: { fontSize: 15, fontWeight: '700', color: '#dc2626', marginBottom: 4 },
  crossSellAdd: { fontSize: 13, color: '#10b981', fontWeight: '600' },
  carouselCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginRight: 8, minWidth: 120, borderWidth: 1, borderColor: '#e2e8f0' },
  carouselDesc: { fontWeight: '600', fontSize: 14, marginBottom: 4 },
  carouselPrice: { color: '#64748b', fontSize: 14 },
});
