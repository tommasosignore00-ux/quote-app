import { Ionicons } from '@expo/vector-icons';
import { countUnmatchedItems, firstTime, scheduleEveningReminder } from '../lib/nudges';
import { holdClientDecisions } from '../lib/notifications';
import { loadEntitlement } from '../lib/entitlement';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Modal, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform, DeviceEventEmitter } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { DEFAULT_COUNTRY_CODE, DEFAULT_CURRENCY, DEFAULT_LANGUAGE, DEFAULT_LOCALE, resolveVatPercent } from '../lib/market';
import VoiceButton from '../components/VoiceButton';
import QuoteAcceptedPopup from '../components/QuoteAcceptedPopup';
import VoiceConfirmSheet, { draftItemOwnPrice, type DraftItem } from '../components/VoiceConfirmSheet';
import {
  extractVoiceItems,
  stripLeadingQuantity,
  isSessionActive,
  matchByName,
  resolveSpokenTarget,
  type JobRecord,
  type VoiceItem,
  type VoiceResult,
  type VoiceSession,
} from '../lib/voiceDraft';
import { buildListinoFilters, parseListinoQuery, rankListinoMatches } from '../lib/listinoSearch';
import { useFocusEffect } from '@react-navigation/native';
import { trackTimeSaving, getTimeSavingsStats } from '../lib/timeSavings';
import { findCrossSellInListino } from '../lib/crossSelling';
import { startNetworkListener, stopNetworkListener } from '../lib/offline';
import { useTheme } from '../lib/darkMode';
import { triggerHaptic } from '../lib/haptics';

type Cliente = { id: string; name: string };
type Lavoro = { id: string; title: string; cliente_id: string; status?: string | null; clienti?: any };
type Costo = { id: string; description: string; quantity: number; unit_price: number; tax_rate: number };

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { colors } = useTheme();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [selectedLavoro, setSelectedLavoro] = useState<Lavoro | null>(null);
  const [costi, setCosti] = useState<Costo[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileCountryCode, setProfileCountryCode] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  // Helper: gating
  const [isProOrTeam, setIsProOrTeam] = useState(false);
  const [isTeam, setIsTeam] = useState(false);
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
  const newClientCountry = DEFAULT_COUNTRY_CODE;
  const newClientLanguage = DEFAULT_LANGUAGE;

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
  const [newCostoUnit, setNewCostoUnit] = useState('');
  const [newCostoPrice, setNewCostoPrice] = useState('0');
  const [creatingCosto, setCreatingCosto] = useState(false);
  const [matchedItem, setMatchedItem] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showListinoSelector, setShowListinoSelector] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [crossSellItems, setCrossSellItems] = useState<any[]>([]);
  const [showCrossSell, setShowCrossSell] = useState(false);
  const [timeSaved, setTimeSaved] = useState<string>('');

  // Voice: draft waiting for confirmation, and the job dictations go to for a while.
  const [voiceDraft, setVoiceDraft] = useState<{
    transcript: string;
    items: DraftItem[];
    clienteId: string | null;
    lavoroId: string | null;
    jobTitle: string | null;
  } | null>(null);
  const [savingVoiceDraft, setSavingVoiceDraft] = useState(false);
  // Results wait here so a replayed recording never replaces a draft being edited.
  const voiceQueueRef = useRef<VoiceResult[]>([]);
  const voiceBusyRef = useRef(false);
  const voiceDraftOpenRef = useRef(false);
  const [voiceSession, setVoiceSession] = useState<VoiceSession | null>(null);
  const [lastVoiceAdd, setLastVoiceAdd] = useState<string | null>(null);

  // Punto 4: Carousel Fallback state
  const [showFallbackCarousel, setShowFallbackCarousel] = useState(false);
  const [carouselItems, setCarouselItems] = useState<any[]>([]);

  useEffect(() => {
    holdClientDecisions('confirming', Boolean(voiceDraft));
    return () => holdClientDecisions('confirming', false);
  }, [voiceDraft]);

  // Punto 1/43: Start offline network listener for auto-sync
  useEffect(() => {
    startNetworkListener((result) => {
      if (result.synced > 0) {
        fetchData();
      }
    });
    return () => stopNetworkListener();
  }, []);

  // Punto 44: Load time savings
  useEffect(() => {
    getTimeSavingsStats().then((stats) => {
      if (stats.totalHoursSaved > 0) {
        setTimeSaved(`${stats.totalActions} operazioni registrate`);
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
      setProfileCountryCode((profile as any).country_code || null);
      setProfileVatPercent(resolveVatPercent((profile as any).vat_percent));
      setProfileMaterialMarkup(Number((profile as any).material_markup) || 0);
      setSubscriptionStatus(profile.subscription_status || null);
      setIsTeam(profile.team_plan === true);
      setIsProOrTeam(await loadEntitlement(profile.subscription_status));
    } else if (profileErr) {
      console.warn('profiles select error', profileErr);
    }
    setProfileId(pid);

    const { data: c, error: cErr } = await supabase.from('clienti').select('id, name').eq('profile_id', pid);
    if (cErr) console.warn('clienti error', cErr);
    setClienti(c || []);

    const { data: l, error: lErr } = await supabase.from('lavori').select('id, title, cliente_id, status, clienti(name)').eq('profile_id', pid).order('updated_at', { ascending: false });
    if (lErr) console.warn('lavori error', lErr);
    // Accepted quotes are final: they live only in the Preventivi section.
    setLavori((l || []).filter((job: Lavoro) => job.status !== 'approved'));

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
  const canUseVoice = isProOrTeam;
  const canUseCrossSelling = isProOrTeam;
  const canUseBranding = isProOrTeam;
  const canUseAdvancedNotifications = isProOrTeam;
  const canUseTeamFeatures = isTeam;

  // Gating: mostra messaggio se utente Free tenta funzioni Pro/Team
  const showUpgradeAlert = (feature: string) => {
    Alert.alert('Funzione riservata', `${feature} è disponibile solo per abbonati Pro o Team.`, [
      { text: 'Scopri i piani', onPress: () => (navigation as any).navigate('Subscription') },
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

  // The open job was accepted meanwhile: it has left this page.
  useEffect(() => {
    if (selectedLavoro && !lavori.some((job) => job.id === selectedLavoro.id)) {
      setSelectedLavoro(null);
    }
  }, [lavori, selectedLavoro]);

  const selectedCliente = clienti.find((cliente) => cliente.id === selectedClienteId) || null;
  const voiceContext = {
    // App disponibile solo in Italia
    appLanguage: DEFAULT_LANGUAGE,
    selectedInputLanguage: DEFAULT_LANGUAGE,
    userIntentMode: 'voice',
    company: {
      country: DEFAULT_COUNTRY_CODE,
      locale: DEFAULT_LOCALE,
      currency: DEFAULT_CURRENCY,
      defaultVatRate: profileVatPercent,
      vatMode: 'standard',
    },
    currentCustomer: selectedCliente
      ? {
          id: selectedCliente.id,
          name: selectedCliente.name,
          companyName: selectedCliente.name,
        }
      : null,
    currentJob: selectedLavoro
      ? {
          id: selectedLavoro.id,
          customerId: selectedLavoro.cliente_id,
          title: selectedLavoro.title,
        }
      : null,
    currentQuote: selectedLavoro
      ? {
          jobId: selectedLavoro.id,
          customerId: selectedLavoro.cliente_id,
          language: DEFAULT_LANGUAGE,
          items: costi.map((costo) => ({
            id: costo.id,
            description: costo.description,
            quantity: costo.quantity,
            unitPrice: costo.unit_price,
            vatRate: costo.tax_rate,
          })),
        }
      : null,
    existingCustomers: clienti.map((cliente) => ({
      id: cliente.id,
      name: cliente.name,
      companyName: cliente.name,
    })),
    existingJobs: lavori.map((lavoro) => ({
      id: lavoro.id,
      customerId: lavoro.cliente_id,
      title: lavoro.title,
    })),
  };

  const refreshTimeSaved = () => {
    getTimeSavingsStats().then((stats) => {
      if (stats.totalActions > 0) setTimeSaved(`${stats.totalActions} operazioni registrate`);
    });
  };

  // The session ends after a while without dictations, or when another job is opened.
  useEffect(() => {
    if (!voiceSession) return;
    const timer = setInterval(() => {
      if (!isSessionActive(voiceSession)) {
        setVoiceSession(null);
        setLastVoiceAdd(null);
      }
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [voiceSession]);

  useEffect(() => {
    if (selectedLavoro && voiceSession && voiceSession.lavoroId !== selectedLavoro.id) {
      setVoiceSession(null);
      setLastVoiceAdd(null);
    }
  }, [selectedLavoro?.id]);

  const activeSession = isSessionActive(voiceSession) ? voiceSession : null;
  const sessionLavoro = activeSession ? lavori.find((lavoro) => lavoro.id === activeSession.lavoroId) || null : null;
  const sessionCliente = activeSession ? clienti.find((cliente) => cliente.id === activeSession.clienteId) || null : null;

  const closeVoiceSession = () => {
    setVoiceSession(null);
    setLastVoiceAdd(null);
  };

  /** Price list candidates for every spoken item; the first one is preselected. */
  const buildDraftItems = async (spoken: VoiceItem[], mappedItemId?: string | null): Promise<DraftItem[]> => {
    const stamp = Date.now();
    return Promise.all(
      spoken.map(async (item, index) => {
        let matches: DraftItem['matches'] = [];
        try {
          matches = await findListinoMatches(stripLeadingQuantity(item.description, item.quantity));
        } catch (err) {
          console.warn('listino search error', err);
        }
        // A correction the user saved earlier for this sentence wins.
        if (mappedItemId && index === 0) {
          const { data: mapped } = await supabase
            .from('listini_vettoriali')
            .select('id, description, unit_price, markup_percent, unit')
            .eq('id', mappedItemId)
            .maybeSingle();
          if (mapped) matches = [{ ...mapped, fullMatch: true }, ...matches.filter((match) => match.id !== mapped.id)];
        }
        return {
          key: `${stamp}-${index}`,
          spoken: item.description,
          quantity: item.quantity,
          unit: item.unit,
          priceText: item.unitPrice === null ? '' : String(item.unitPrice).replace('.', ','),
          matches,
          // A partial match is only offered: the user picks it if it is right.
          // Preselected only when it is the one article matching everything said.
          choice: matches[0]?.fullMatch !== false && matches.length > 0 && matches[1]?.fullMatch !== true ? 0 : -1,
        };
      })
    );
  };

  const askVoiceConfirm = (title: string, message: string, confirmLabel: string) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(
        title,
        message,
        [
          { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
          { text: confirmLabel, onPress: () => resolve(true) },
        ],
        { cancelable: false }
      );
    });

  const voiceNotice = (title: string, message: string) =>
    new Promise<void>((resolve) => {
      Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], { cancelable: false });
    });

  const drainVoiceQueue = async () => {
    if (voiceBusyRef.current) return;
    voiceBusyRef.current = true;
    try {
      while (!voiceDraftOpenRef.current && voiceQueueRef.current.length) {
        const next = voiceQueueRef.current.shift() as VoiceResult;
        try {
          await processVoiceResultRef.current(next);
        } catch (err) {
          await voiceNotice(t('messages.error'), (err as Error).message);
        }
      }
    } finally {
      voiceBusyRef.current = false;
    }
  };

  const handleVoiceResult = (result: VoiceResult) => {
    voiceQueueRef.current.push(result);
    drainVoiceQueue();
  };

  const closeVoiceDraft = () => {
    voiceDraftOpenRef.current = false;
    setVoiceDraft(null);
    // After the sheet has slid away: two modals cannot animate together.
    setTimeout(drainVoiceQueue, 400);
  };

  const processVoiceResult = async (result: VoiceResult) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const ownerId = profileId || user.id;

    const intent = String(result.agent?.intent || '');
    if (intent === 'remove_quote_items' || intent === 'edit_quote_items') {
      await voiceNotice('Non si può fare a voce', 'A voce puoi solo aggiungere voci. Per togliere o modificare una voce, toccala nella lista del lavoro.');
      return;
    }

    const spokenItems = extractVoiceItems(result);

    // New customer: always asked before creating it.
    if (result.action === 'create_cliente' && result.data?.name && !spokenItems.length) {
      const name = String(result.data.name).trim();
      if (!(await askVoiceConfirm('Nuovo cliente', `Creo il cliente «${name}»?`, 'Crea'))) return;
      const { data: created, error } = await supabase
        .from('clienti')
        .insert({ profile_id: ownerId, name, country_code: newClientCountry, preferred_language: newClientLanguage })
        .select('*');
      if (error) {
        await voiceNotice(t('messages.error'), error.message);
        return;
      }
      if (created?.[0]) setClienti((prev) => [...prev, created[0]]);
      await trackTimeSaving('create_cliente');
      refreshTimeSaved();
      fetchData();
      return;
    }

    // New job: the customer must be one that exists, and the user confirms.
    if (result.action === 'create_lavoro' && result.data?.title && !spokenItems.length) {
      const title = String(result.data.title).trim();
      let cliente = clienti.find((record) => record.id === result.data?.cliente_id) || null;
      if (!cliente && result.data?.cliente_name) {
        const matches = matchByName(clienti, result.data.cliente_name, (record) => record.name);
        if (matches.length === 1) cliente = matches[0];
      }
      if (!cliente && selectedCliente) cliente = selectedCliente;
      if (!cliente) {
        await voiceNotice('Cliente non trovato', `Per creare il lavoro «${title}» scegli prima il cliente nell'elenco, poi riprova.`);
        return;
      }
      const target = cliente;
      if (!(await askVoiceConfirm('Nuovo lavoro', `Creo il lavoro «${title}» per ${target.name}?`, 'Crea'))) return;
      const { error } = await supabase.from('lavori').insert({ profile_id: ownerId, cliente_id: target.id, title });
      if (error) {
        await voiceNotice(t('messages.error'), error.message);
        return;
      }
      await trackTimeSaving('create_lavoro');
      refreshTimeSaved();
      fetchData();
      return;
    }

    // Items to add: they go to a draft the user confirms.
    if (!spokenItems.length) {
      const question = result.agent?.clarification?.questions?.[0];
      if (typeof question === 'string' && question.trim()) {
        await voiceNotice('Mi serve un chiarimento', question.trim());
        return;
      }
      await voiceNotice('Non ho capito cosa aggiungere', result.text ? `Ho sentito: "${result.text}". Riprova.` : 'Riprova.');
      return;
    }

    // Who gets the items: what was said, else the open job, else the session, else ask.
    const spoken = resolveSpokenTarget(result, clienti, lavori);
    let clienteId = spoken.clienteId;
    let lavoroId = spoken.lavoroId;
    const fallbackJob = selectedLavoro
      ? { clienteId: selectedLavoro.cliente_id, lavoroId: selectedLavoro.id }
      : activeSession && lavori.some((lavoro) => lavoro.id === activeSession.lavoroId)
        ? { clienteId: activeSession.clienteId, lavoroId: activeSession.lavoroId }
        : null;
    if (!clienteId && !lavoroId) {
      if (fallbackJob) {
        clienteId = fallbackJob.clienteId;
        lavoroId = fallbackJob.lavoroId;
      } else if (selectedClienteId) {
        clienteId = selectedClienteId;
      }
    } else if (clienteId && !lavoroId && fallbackJob?.clienteId === clienteId) {
      lavoroId = fallbackJob.lavoroId;
    }

    const items = await buildDraftItems(spokenItems, (result.data?.listino_item_id as string) || null);
    voiceDraftOpenRef.current = true;
    setVoiceDraft({
      transcript: result.text || '',
      items,
      clienteId,
      lavoroId,
      jobTitle: spoken.jobTitle,
    });
  };

  // The queue runs across renders: it must use the customers and jobs of the latest one.
  const processVoiceResultRef = useRef(processVoiceResult);
  processVoiceResultRef.current = processVoiceResult;

  const handleCreateClienteFromVoice = async (name: string) => {
    if (!profileId) return null;
    const { data, error } = await supabase
      .from('clienti')
      .insert({ profile_id: profileId, name, country_code: 'IT', preferred_language: 'it' })
      .select('*')
      .single();
    if (error || !data) {
      Alert.alert(t('messages.error'), 'Cliente non creato');
      return null;
    }
    setClienti((prev) => [data, ...prev]);
    return data;
  };

  const handleCreateLavoroFromVoice = async (clienteId: string, title: string): Promise<JobRecord | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: created, error } = await supabase
      .from('lavori')
      .insert({ profile_id: profileId || user.id, cliente_id: clienteId, title, original_currency: 'EUR', exchange_rate: 1 })
      .select('id, title, cliente_id, clienti(name)')
      .single();
    if (error || !created) {
      Alert.alert(t('messages.error'), error?.message || 'Lavoro non creato');
      return null;
    }
    setLavori((prev) => [created as Lavoro, ...prev]);
    await trackTimeSaving('create_lavoro');
    return created as JobRecord;
  };

  const handleConfirmVoiceDraft = async (lavoro: JobRecord) => {
    if (!voiceDraft) return;
    setSavingVoiceDraft(true);
    try {
      const rows = voiceDraft.items.map((item) => {
        const match = item.matches[item.choice];
        // A price said or typed is the final one: no markup on top of it.
        const ownPrice = draftItemOwnPrice(item);
        return {
          lavoro_id: lavoro.id,
          description: match?.description || item.spoken,
          quantity: item.quantity as number,
          unit_price: ownPrice ?? (match ? Number(match.unit_price) : 0),
          tax_rate: ownPrice !== null ? 0 : match ? Number(match.markup_percent) || profileMaterialMarkup : profileMaterialMarkup,
          listino_item_id: match?.id || null,
          // Empty: the database copies the unit of the price list item.
          unit: item.unit || null,
        };
      });
      const { data: created, error } = await supabase.from('preventivi_dettaglio').insert(rows).select('*');
      if (error) throw error;

      // Jobs used last come first in the pop-up.
      supabase.from('lavori').update({ updated_at: new Date().toISOString() }).eq('id', lavoro.id).then(() => {});
      if (selectedLavoro?.id === lavoro.id && created) setCosti((prev) => [...created, ...prev]);

      setVoiceSession({ clienteId: lavoro.cliente_id, lavoroId: lavoro.id, lastUsedAt: Date.now() });
      setLastVoiceAdd(rows.length === 1 ? `Aggiunta: ${rows[0].description}` : `Aggiunte ${rows.length} voci`);
      closeVoiceDraft();
      triggerHaptic('aiSuccess');

      for (let i = 0; i < rows.length; i++) await trackTimeSaving('add_costo');
      refreshTimeSaved();

      if (await firstTime('first-voice-item')) {
        Alert.alert('Prima voce salvata', 'Cosa vuoi fare adesso?', [
          { text: 'Prepara il preventivo', onPress: () => (navigation as any).navigate('Quote', { lavoro }) },
          { text: 'Ricordamelo stasera', onPress: () => { scheduleEveningReminder(lavoro.title, lavoro.id).catch(() => {}); } },
          { text: 'Detta ancora', style: 'cancel' },
        ]);
      } else {
        const unmatched = voiceDraft.items.filter((item) => !item.matches[item.choice]).length;
        if (unmatched > 0 && (await countUnmatchedItems(unmatched)) >= 3 && (await firstTime('listino-prompt'))) {
          Alert.alert('Vuoi caricare il tuo listino?', 'Alcune voci non hanno un prezzo: con il listino li trovi mentre detti.', [
            { text: 'Carica listino', onPress: () => (navigation as any).navigate('Listini') },
            { text: 'Non ora', style: 'cancel' },
          ]);
        }
      }

      // Punto 13: Cross-selling suggestions
      if (profileId && rows[0]) {
        if (canUseCrossSelling) {
          const crossItems = await findCrossSellInListino(supabase, profileId, rows[0].description);
          if (crossItems.length > 0) {
            setCrossSellItems(crossItems);
            setShowCrossSell(true);
          }
        }
      }
      fetchData();
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setSavingVoiceDraft(false);
    }
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
        if (items.length === 1 && items[0].fullMatch) {
          const item = items[0];
          description = item.description;
          unitPrice = Number(item.unit_price);
          taxRate = Number(item.markup_percent) || profileMaterialMarkup;
          listinoItemId = item.id;
        } else if (items.length > 0) {
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
        // Empty: the database copies the unit of the price list item.
        unit: newCostoUnit.trim() || null,
      }).select('*');
      if (error) throw error;
      if (created && created[0]) setCosti((prev) => [created[0], ...prev]);
      setNewCostoDesc('');
      setNewCostoQty('1');
      setNewCostoUnit('');
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
    const columns = 'id, description, unit_price, markup_percent, unit, sku, category, listino_id';
    const parsed = parseListinoQuery(trimmed);
    const filters = buildListinoFilters(parsed);

    // No profile filter: RLS returns the user's price lists plus their team owner's.
    // Articles with everything that was said come first; ordered so results are repeatable.
    let resultItems: any[] = [];
    if (filters.all.length > 0) {
      let search = supabase.from('listini_vettoriali').select(columns);
      for (const filter of filters.all) search = search.or(filter);
      const { data, error } = await search.order('description').limit(400);
      if (error) throw error;
      resultItems = rankListinoMatches((data || []) as any[], trimmed).slice(0, 5);
    }

    // Then anything sharing a word or size; never preselected unless it has them all.
    if (resultItems.length === 0 && filters.any) {
      const { data, error } = await supabase
        .from('listini_vettoriali')
        .select(columns)
        .or(filters.any)
        .order('description')
        .limit(400);
      if (error) throw error;
      resultItems = rankListinoMatches((data || []) as any[], trimmed).slice(0, 5);
    }

    // Last resort, for typing errors: offered as similar articles, never preselected.
    if (resultItems.length === 0 && parsed.plainWords.length > 0) {
      const { data, error } = await supabase.rpc('search_listino_typo', { p_query: parsed.plainWords.join(' '), p_limit: 5 });
      if (error) console.warn('listino typo search unavailable', error.message);
      resultItems = ((data || []) as any[]).map((item) => ({ ...item, fullMatch: false }));
    }

    if (resultItems.length === 0) return [];

    const listinoIds = Array.from(new Set(resultItems.map((item: any) => item.listino_id).filter(Boolean)));
    let listiniById = new Map<string, string>();
    if (listinoIds.length > 0) {
      const { data: listini, error: listiniError } = await supabase
        .from('listini')
        .select('id, name')
        .in('id', listinoIds as string[]);
      if (listiniError) throw listiniError;
      listiniById = new Map((listini || []).map((listino: { id: string; name: string }) => [listino.id, listino.name] as [string, string]));
    }

    return resultItems.map((item: any) => ({
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

      if (items.length === 1 && items[0].fullMatch) {
        applyListinoItem(items[0]);
        return;
      }

      if (items.length > 0) {
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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: selectedClienteId ? 140 : 16 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
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
                  <Text style={styles.deleteBtn}>Elimina</Text>
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
                  <Text style={styles.deleteBtn}>Elimina</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      {canUseVoice && activeSession && sessionLavoro ? (
        <View style={[styles.sessionBar, { backgroundColor: colors.card, borderColor: '#16a34a' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sessionLabel, { color: colors.textSecondary }]}>Stai aggiungendo a</Text>
            <Text style={[styles.sessionTarget, { color: colors.text }]} numberOfLines={2}>
              {sessionCliente?.name || '—'} · {sessionLavoro.title}
            </Text>
            {lastVoiceAdd ? (
              <Text style={styles.sessionLast} numberOfLines={1}>✓ {lastVoiceAdd}</Text>
            ) : null}
          </View>
          <TouchableOpacity style={styles.sessionClose} onPress={closeVoiceSession} accessibilityLabel="Chiudi: le prossime voci chiederanno cliente e lavoro">
            <Text style={styles.sessionCloseText}>✕ Chiudi</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!selectedClienteId && (
        <View style={styles.voiceCenterWrap}>
          {canUseVoice && lavori.length === 0 && (
            <Text style={{ color: colors.text, fontSize: 18, textAlign: 'center', marginBottom: 20, paddingHorizontal: 24 }}>
              Premi il microfono e detta la prima voce, per esempio: «due metri di tubo multistrato».
            </Text>
          )}
          {canUseVoice && (
            <VoiceButton onResult={handleVoiceResult} context={voiceContext} size={220} onMicDenied={handleMicDenied} showLabel />
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
            <Text style={{ color: '#c2410c', fontWeight: '600', padding: 12 }}>Funzione riservata agli abbonati Pro/Team</Text>
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
                <Text style={styles.deleteBtn}>Elimina</Text>
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
            {/* Paese e lingua cliente fissi: app disponibile solo in Italia */}
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
                <TouchableOpacity key={cur.code} onPress={() => { setSelectedCurrency(cur.code); fetchExchangeRate(cur.code); }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: selectedCurrency === cur.code ? '#c2410c' : '#f1f5f9' }}>
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
              <TextInput style={styles.input} placeholder="Unità di misura (pz, m, kg, h...)" value={newCostoUnit} onChangeText={setNewCostoUnit} maxLength={20} autoCapitalize="none" />
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

      {/* Inside a customer or job the big microphone stays reachable, bottom right. */}
      {canUseVoice && selectedClienteId ? (
        <VoiceButton onResult={handleVoiceResult} context={voiceContext} size={84} floating onMicDenied={handleMicDenied} />
      ) : null}

      <QuoteAcceptedPopup />

      <VoiceConfirmSheet
        visible={Boolean(voiceDraft)}
        transcript={voiceDraft?.transcript || ''}
        items={voiceDraft?.items || []}
        clienti={clienti}
        lavori={lavori}
        initialClienteId={voiceDraft?.clienteId || null}
        initialLavoroId={voiceDraft?.lavoroId || null}
        suggestedJobTitle={voiceDraft?.jobTitle || null}
        saving={savingVoiceDraft}
        defaultMarkup={profileMaterialMarkup}
        onChangeItems={(items) => setVoiceDraft((draft) => (draft ? { ...draft, items } : draft))}
        onCreateCliente={handleCreateClienteFromVoice}
        onCreateLavoro={handleCreateLavoroFromVoice}
        onConfirm={handleConfirmVoiceDraft}
        onCancel={closeVoiceDraft}
      />

      {/* Scrolls sideways: the items no longer fit on a phone. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.navScroll, { borderTopColor: colors.border, backgroundColor: colors.navBg }]} contentContainerStyle={styles.navContent}>
        <TouchableOpacity style={styles.navBtn} onPress={() => (navigation as any).navigate('Dashboard')}>
          <Ionicons name="home-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.navText, { color: colors.textSecondary }]}>{t('main.jobs')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => (navigation as any).navigate('Preventivi')}>
          <Ionicons name="document-text-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.navText, { color: colors.textSecondary }]}>Preventivi</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => (navigation as any).navigate('Listini')}>
          <Ionicons name="list-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.navText, { color: colors.textSecondary }]}>{t('main.listini')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => (navigation as any).navigate('Fatture')}>
          <Ionicons name="receipt-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.navText, { color: colors.textSecondary }]}>Fatture</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => (navigation as any).navigate('Integrazioni')}>
          <Ionicons name="link-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.navText, { color: colors.textSecondary }]}>Integrazioni</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => (navigation as any).navigate('Profile')}>
          <Ionicons name="person-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.navText, { color: colors.textSecondary }]}>{t('main.profile')}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  deleteBtn: { fontSize: 14, fontWeight: '600', color: '#b91c1c', paddingHorizontal: 12, paddingVertical: 22 },
  deleteBtnContainer: { paddingHorizontal: 8 },
  lavoroItemContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  lavoroItem: { padding: 12, borderRadius: 10, flex: 1, backgroundColor: '#f8fafc' },
  lavoroSelected: { backgroundColor: '#c2410c' },
  lavoroSelectedText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  costoRowContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  costoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flex: 1 },
  costoDesc: { fontSize: 16, flex: 1 },
  costoPrice: { fontSize: 16, fontWeight: '700' },
  btnQuote: { backgroundColor: '#c2410c', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  btnQuoteText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  smallBtn: { backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  smallBtnText: { color: '#c2410c', fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, marginBottom: 12 },
  btn: { backgroundColor: '#c2410c', paddingVertical: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  listinoItem: { padding: 10, borderRadius: 10, marginBottom: 6 },
  listinoSelected: { backgroundColor: '#c2410c' },
  listinoSelectedText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  nav: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 18, borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 'auto' },
  navScroll: { flexGrow: 0, borderTopWidth: 1, marginTop: 'auto' },
  navContent: { paddingVertical: 18, gap: 4 },
  navBtn: { minHeight: 64, minWidth: 72, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  voiceCenterWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  sessionBar: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 3, borderRadius: 18, padding: 14, marginBottom: 16 },
  sessionLabel: { fontSize: 16, fontWeight: '600' },
  sessionTarget: { fontSize: 22, fontWeight: '800' },
  sessionLast: { fontSize: 16, fontWeight: '700', color: '#16a34a', marginTop: 2 },
  sessionClose: { minHeight: 64, minWidth: 110, borderRadius: 16, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  sessionCloseText: { fontSize: 19, fontWeight: '800', color: '#b91c1c' },
  clienteSelectBtn: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#f8fafc' },
  clienteSelected: { backgroundColor: '#c2410c' },
  clienteSelectedText: { color: '#fff', fontWeight: '700' },
  emptyText: { fontSize: 15, color: '#64748b', paddingVertical: 12 },
  searchInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 8, marginBottom: 8, fontSize: 14 },
  listinoSelectorItem: { backgroundColor: '#f8fafc', padding: 14, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  listinoSelectorDesc: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  listinoSelectorListino: { fontSize: 14, color: '#64748b', marginBottom: 2 },
  listinoSelectorPrice: { fontSize: 15, fontWeight: '700', color: '#c2410c' },
  timeSavedBadge: { fontSize: 13, color: '#10b981', fontWeight: '600', backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  crossSellCard: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, marginRight: 10, width: 160, borderWidth: 1, borderColor: '#86efac' },
  crossSellDesc: { fontSize: 14, fontWeight: '600', color: '#166534', marginBottom: 6 },
  crossSellPrice: { fontSize: 15, fontWeight: '700', color: '#c2410c', marginBottom: 4 },
  crossSellAdd: { fontSize: 13, color: '#10b981', fontWeight: '600' },
  carouselCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginRight: 8, minWidth: 120, borderWidth: 1, borderColor: '#e2e8f0' },
  carouselDesc: { fontWeight: '600', fontSize: 14, marginBottom: 4 },
  carouselPrice: { color: '#64748b', fontSize: 14 },
});
