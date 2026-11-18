import { trackEvent } from '../lib/analytics';
import { Ionicons } from '@expo/vector-icons';
import { firstTime } from '../lib/nudges';
import { holdClientDecisions } from '../lib/notifications';
import { loadEntitlement } from '../lib/entitlement';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Modal, Alert, ScrollView, KeyboardAvoidingView, Platform, DeviceEventEmitter, BackHandler } from 'react-native';
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
import { trackTimeSaving } from '../lib/timeSavings';
import { startNetworkListener, stopNetworkListener } from '../lib/offline';
import { useTheme } from '../lib/darkMode';
import { triggerHaptic } from '../lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActionSheet,
  BottomActionBar,
  BottomTabBar,
  Chip,
  EmptyState,
  HeaderBack,
  BrandMark,
  ListGroup,
  ListRow,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  SectionHeader,
  TertiaryButton,
  TextField,
  cantiere,
  formatMoney,
  formatQtyTimesPrice,
  moneyForScreenReader,
  radius,
  space,
  useReduceMotion,
  type SheetAction,
  type SheetDestructive,
} from '../components/ui';

type Cliente = { id: string; name: string };
type Lavoro = { id: string; title: string; cliente_id: string; status?: string | null; updated_at?: string | null; clienti?: any };
/** Common Italian VAT rates for a single line. */
const LINE_VAT_PRESETS = ['22', '10', '5', '4', '0'];

type Costo = { id: string; description: string; quantity: number; unit_price: number; tax_rate: number; unit?: string | null; vat_percent?: number | null };

/** Price the client sees for one unit: purchase price plus markup. */
const clientUnitPrice = (line: { unit_price: number; tax_rate: number }) =>
  Number(line.unit_price) * (1 + (Number(line.tax_rate) || 0) / 100);
/** Same formula as before the redesign: quantity × unit_price × (1 + tax_rate/100). */
const lineTotal = (line: { quantity: number; unit_price: number; tax_rate: number }) =>
  Number(line.quantity) * clientUnitPrice(line);

const relativeDay = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(date)) / 86400000);
  if (days <= 0) return 'oggi';
  if (days === 1) return 'ieri';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${String(date.getFullYear()).slice(2)}`;
};

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
  const [jobTotals, setJobTotals] = useState<Record<string, number>>({});
  /** Inner level of this screen: home, all clients, or one client (a job opens on top of these). */
  const [level, setLevel] = useState<'home' | 'clients'>('home');
  /** Where "back" from a job goes. */
  const jobOriginRef = useRef<'home' | 'client'>('home');
  /** Lines just added by voice: tinted for a moment. */
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
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
    showListinoIntroOnce();

    const { data: c, error: cErr } = await supabase.from('clienti').select('id, name').eq('profile_id', pid);
    if (cErr) console.warn('clienti error', cErr);
    setClienti(c || []);

    const { data: l, error: lErr } = await supabase.from('lavori').select('id, title, cliente_id, status, updated_at, clienti(name)').eq('profile_id', pid).order('updated_at', { ascending: false });
    if (lErr) console.warn('lavori error', lErr);
    // Accepted quotes are final: they live only in the Preventivi section.
    const openJobs = (l || []).filter((job: Lavoro) => job.status !== 'approved');
    setLavori(openJobs);

    // Totals for the job rows (view only, same formula as the quote lines).
    const totalIds = openJobs.slice(0, 50).map((job: Lavoro) => job.id);
    if (totalIds.length > 0) {
      const { data: lines, error: linesErr } = await supabase
        .from('preventivi_dettaglio')
        .select('lavoro_id, quantity, unit_price, tax_rate')
        .in('lavoro_id', totalIds);
      if (linesErr) console.warn('job totals error', linesErr);
      const totals: Record<string, number> = {};
      for (const line of (lines || []) as any[]) {
        totals[line.lavoro_id] = (totals[line.lavoro_id] || 0) + lineTotal(line);
      }
      setJobTotals(totals);
    } else {
      setJobTotals({});
    }

    if (selectedLavoro) {
      const { data: costiData, error: costiErr } = await supabase.from('preventivi_dettaglio').select('id, description, quantity, unit_price, tax_rate, unit, vat_percent').eq('lavoro_id', selectedLavoro.id);
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
  const canUseBranding = isProOrTeam;
  const canUseAdvancedNotifications = isProOrTeam;
  const canUseTeamFeatures = isTeam;

  /** Once, on entry, to whoever has no price list yet: what it is for and what it gives. */
  const showListinoIntroOnce = async () => {
    // RLS returns the price lists this user can read, team ones included.
    const { count, error } = await supabase.from('listini').select('id', { count: 'exact', head: true });
    if (error || (count ?? 0) > 0 || !(await firstTime('listino-intro'))) return;
    Alert.alert(
      'Carica il tuo listino',
      'Il listino è l\'elenco dei tuoi prezzi: il PDF del grossista, il tuo Excel o un file METEL.\n\n' +
        'Come funziona: lo carichi una volta dalla sezione Listini, più comodo dal computer. Quando detti una voce, Mastrovoce trova da solo il prezzo nel tuo listino.\n\n' +
        'Cosa ci guadagni: niente prezzi ricopiati a mano, preventivi con i tuoi prezzi e il tuo ricarico, meno errori.',
      [
        { text: 'Più tardi', style: 'cancel' },
        { text: 'Carica il listino', onPress: () => (navigation as any).navigate('Listini') },
      ]
    );
  };

  // Gating: mostra messaggio se utente Free tenta funzioni Pro/Team
  const showUpgradeAlert = (feature: string) => {
    // No link to plans: the app sells nothing (App Store and Play Store rules).
    Alert.alert('Funzione riservata', `${feature} è disponibile con un abbonamento attivo.`);
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

  // The "N operazioni registrate" pill is gone (no counters); time savings are still tracked.
  const refreshTimeSaved = () => {};

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
      if (created) setRecentIds(created.map((row: any) => row.id));

      setVoiceSession({ clienteId: lavoro.cliente_id, lavoroId: lavoro.id, lastUsedAt: Date.now() });
      setLastVoiceAdd(rows.length === 1 ? `Aggiunta: ${rows[0].description}` : `Aggiunte ${rows.length} voci`);
      closeVoiceDraft();
      triggerHaptic('aiSuccess');

      trackEvent('voice_item_confirmed');
      for (let i = 0; i < rows.length; i++) await trackTimeSaving('add_costo');
      refreshTimeSaved();

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
      const { data: created, error } = await supabase.from('lavori').insert({ profile_id: profile.id, title: newJobTitle, cliente_id: jobClienteId, original_currency: 'EUR', exchange_rate: 1 }).select('*');
      if (error) throw error;
      if (created && created[0]) setLavori((p) => [created[0], ...p]);
      setNewJobTitle('');
      setJobClienteId(null);
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

      const quantity = parseFloat(newCostoQty.replace(',', '.')) || 1;
      let unitPrice = parseFloat(newCostoPrice.replace(',', '.')) || 0;
      let description = newCostoDesc;
      // A typed price is already the final one: no markup on top.
      let taxRate = 0;
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

  /* Deleting: always from an action sheet with a confirmation step (no "Elimina" on rows). */
  const [sheet, setSheet] = useState<{
    title: string;
    subtitle?: string;
    actions: SheetAction[];
    destructive: SheetDestructive | null;
    startOnConfirm?: boolean;
  } | null>(null);

  const deleteClient = async (clientId: string) => {
    const { error } = await supabase.from('clienti').delete().eq('id', clientId);
    if (error) {
      Alert.alert(t('messages.error'), 'Cliente non eliminato. Controlla la connessione e riprova.');
      return false;
    }
    if (selectedClienteId === clientId) {
      setSelectedClienteId(null);
      setSelectedLavoro(null);
    }
    fetchData();
    return true;
  };

  const deleteJob = async (jobId: string) => {
    const { error } = await supabase.from('lavori').delete().eq('id', jobId);
    if (error) {
      Alert.alert(t('messages.error'), 'Lavoro non eliminato. Controlla la connessione e riprova.');
      return false;
    }
    if (selectedLavoro?.id === jobId) setSelectedLavoro(null);
    fetchData();
    return true;
  };

  const deleteCosto = async (costoId: string) => {
    const { error } = await supabase.from('preventivi_dettaglio').delete().eq('id', costoId);
    if (error) {
      Alert.alert(t('messages.error'), 'Voce non eliminata. Controlla la connessione e riprova.');
      return false;
    }
    setCosti((prev) => prev.filter((c) => c.id !== costoId));
    fetchData();
    return true;
  };

  const jobsOf = (clientId: string) => lavori.filter((job) => job.cliente_id === clientId);

  const openClientSheet = (cliente: Cliente) => {
    const count = jobsOf(cliente.id).length;
    setSheet({
      title: cliente.name,
      subtitle: `Cliente · ${count === 1 ? '1 lavoro' : `${count} lavori`}`,
      actions: [
        {
          label: 'Nuovo lavoro per questo cliente',
          icon: 'add-outline',
          onPress: () => {
            setJobClienteId(cliente.id);
            setShowJobModal(true);
          },
        },
      ],
      destructive: {
        label: 'Elimina il cliente',
        confirmTitle: `Eliminare il cliente ${cliente.name}?`,
        confirmMessage:
          count > 0
            ? `Si cancellano anche i suoi lavori (${count}) e tutte le voci. Non si può annullare.`
            : 'Non si può annullare.',
        onConfirm: () => deleteClient(cliente.id),
      },
    });
  };

  const openJobSheet = (job: Lavoro) => {
    const clientName = clienti.find((c) => c.id === job.cliente_id)?.name || (job.clienti as { name?: string })?.name || '';
    setSheet({
      title: job.title,
      subtitle: clientName ? `Lavoro di ${clientName}` : 'Lavoro',
      actions: [],
      destructive: {
        label: 'Elimina il lavoro',
        confirmTitle: `Eliminare il lavoro ${job.title}?`,
        confirmMessage: 'Si cancellano anche tutte le sue voci. Non si può annullare.',
        onConfirm: () => deleteJob(job.id),
      },
    });
  };

  const askDeleteCosto = (item: Costo) => {
    setSheet({
      title: item.description,
      actions: [],
      startOnConfirm: true,
      destructive: {
        label: 'Elimina la voce',
        confirmTitle: 'Eliminare questa voce?',
        confirmMessage: `«${item.description}» esce dal lavoro. Non si può annullare.`,
        onConfirm: () => deleteCosto(item.id),
      },
    });
  };

  const openCostoSheet = (item: Costo) => {
    setSheet({
      title: item.description,
      actions: [{ label: 'Modifica la voce', icon: 'create-outline', onPress: () => openEditCosto(item) }],
      destructive: {
        label: 'Elimina la voce',
        confirmTitle: 'Eliminare questa voce?',
        confirmMessage: `«${item.description}» esce dal lavoro. Non si può annullare.`,
        onConfirm: () => deleteCosto(item.id),
      },
    });
  };

  /* Moving between the inner levels of this screen. */
  const openJob = (job: Lavoro, origin: 'home' | 'client') => {
    jobOriginRef.current = origin;
    setSelectedClienteId(job.cliente_id);
    setSelectedLavoro(job);
  };

  const openClient = (clientId: string) => {
    setSelectedClienteId(clientId);
    setSelectedLavoro(null);
  };

  const goBack = useCallback(() => {
    if (selectedLavoro) {
      setSelectedLavoro(null);
      setCosti([]);
      if (jobOriginRef.current === 'home') setSelectedClienteId(null);
      return true;
    }
    if (selectedClienteId) {
      setSelectedClienteId(null);
      return true;
    }
    if (level === 'clients') {
      setLevel('home');
      return true;
    }
    return false;
  }, [selectedLavoro, selectedClienteId, level]);

  const goHome = () => {
    setSelectedLavoro(null);
    setSelectedClienteId(null);
    setCosti([]);
    setLevel('home');
  };

  // Android back button walks up the inner levels before leaving the screen.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
      return () => sub.remove();
    }, [goBack])
  );

  const backLabel = selectedLavoro
    ? jobOriginRef.current === 'home'
      ? 'Lavori'
      : selectedCliente?.name || 'Cliente'
    : selectedClienteId
      ? 'Clienti'
      : level === 'clients'
        ? 'Lavori'
        : null;
  const headerTitle = selectedLavoro
    ? selectedLavoro.title
    : selectedClienteId
      ? selectedCliente?.name || 'Cliente'
      : level === 'clients'
        ? 'Tutti i clienti'
        : 'Lavori';

  useEffect(() => {
    (navigation as any).setOptions({
      title: headerTitle,
      headerLeft: backLabel
        ? () => <HeaderBack label={backLabel} onPress={goBack} />
        : () => (
            <View style={{ marginRight: space.s2 }}>
              <BrandMark size={28} />
            </View>
          ),
    });
  }, [navigation, headerTitle, backLabel, goBack]);

  // A line added by voice stays tinted for a moment, then goes back to white.
  useEffect(() => {
    if (recentIds.length === 0) return;
    const timer = setTimeout(() => setRecentIds([]), reduceMotion ? 4000 : 2600);
    return () => clearTimeout(timer);
  }, [recentIds, reduceMotion]);

  /* Editing a line: purchase price and markup stay private, the client sees the final price. */
  const [editCosto, setEditCosto] = useState<Costo | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editMarkup, setEditMarkup] = useState('');
  const [editFinal, setEditFinal] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  /** '' = the quote's VAT; otherwise this line's own rate. */
  const [editVat, setEditVat] = useState('');
  const [editVatCustom, setEditVatCustom] = useState('');
  const num = (value: string) => {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const r2 = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');
  const openEditCosto = (item: Costo) => {
    setEditCosto(item);
    setEditDesc(item.description);
    setEditQty(r2(Number(item.quantity)));
    setEditUnit(item.unit || '');
    setEditCost(r2(Number(item.unit_price)));
    setEditMarkup(r2(Number(item.tax_rate) || 0));
    setEditFinal(r2(Number(item.unit_price) * (1 + (Number(item.tax_rate) || 0) / 100)));
    const ownVat = item.vat_percent === null || item.vat_percent === undefined ? '' : String(Number(item.vat_percent));
    if (!ownVat || LINE_VAT_PRESETS.includes(ownVat)) {
      setEditVat(ownVat);
      setEditVatCustom('');
    } else {
      setEditVat('custom');
      setEditVatCustom(ownVat.replace('.', ','));
    }
  };
  const changeEditCost = (value: string) => {
    setEditCost(value);
    setEditFinal(r2(num(value) * (1 + num(editMarkup) / 100)));
  };
  const changeEditMarkup = (value: string) => {
    setEditMarkup(value);
    setEditFinal(r2(num(editCost) * (1 + num(value) / 100)));
  };
  const changeEditFinal = (value: string) => {
    setEditFinal(value);
    if (num(editCost) > 0) setEditMarkup(r2((num(value) / num(editCost) - 1) * 100));
    else setEditCost(value);
  };
  const saveEditCosto = async () => {
    if (!editCosto) return;
    if (!editDesc.trim()) {
      Alert.alert(t('messages.error'), 'Scrivi la descrizione della voce');
      return;
    }
    setSavingEdit(true);
    const purchase = num(editCost);
    const changes = {
      description: editDesc.trim(),
      quantity: num(editQty),
      unit: editUnit.trim() || null,
      unit_price: purchase > 0 ? purchase : num(editFinal),
      tax_rate: purchase > 0 ? num(editMarkup) : 0,
      vat_percent: editVat === '' ? null : editVat === 'custom' ? num(editVatCustom) : num(editVat),
    };
    if (changes.vat_percent !== null && (changes.vat_percent < 0 || changes.vat_percent > 100)) {
      setSavingEdit(false);
      Alert.alert(t('messages.error'), "L'IVA deve essere tra 0 e 100");
      return;
    }
    const { error } = await supabase.from('preventivi_dettaglio').update(changes).eq('id', editCosto.id);
    setSavingEdit(false);
    if (error) {
      Alert.alert(t('messages.error'), 'Modifica non salvata');
      return;
    }
    setCosti((prev) => prev.map((c) => (c.id === editCosto.id ? { ...c, ...changes } : c)));
    triggerHaptic('aiSuccess');
    setEditCosto(null);
  };

  const recentJobs = lavori.slice(0, 5);
  const jobsTotal = costi.reduce((sum, item) => sum + lineTotal(item), 0);
  const showFloatingMic = canUseVoice && Boolean(selectedClienteId);
  // Mic above the fixed action bar (one 64pt button, or help line + button when empty).
  const actionBarHeight = 88 + (selectedLavoro && costi.length === 0 ? 30 : 0) + insets.bottom;

  const closeCostoModal = () => {
    setShowCostoModal(false);
    setShowListinoSelector(false);
    setSearchResults([]);
    setMatchedItem(null);
  };

  const jobRow = (item: Lavoro, index: number, origin: 'home' | 'client') => {
    const clientName = (item.clienti as { name?: string })?.name || clienti.find((c) => c.id === item.cliente_id)?.name || '';
    const day = relativeDay(item.updated_at);
    const total = jobTotals[item.id] || 0;
    const subtitle = origin === 'home' ? [clientName, day].filter(Boolean).join(' · ') : day;
    return (
      <ListRow
        key={item.id}
        first={index === 0}
        title={item.title}
        subtitle={subtitle}
        value={formatMoney(total)}
        onPress={() => openJob(item, origin)}
        onLongPress={() => openJobSheet(item)}
        accessibilityLabel={[clientName, item.title, moneyForScreenReader(total)].filter(Boolean).join(', ')}
        accessibilityHint="Apre il lavoro"
      />
    );
  };

  const renderHome = () => (
    <>
      {canUseVoice && activeSession && sessionLavoro ? (
        <View style={[styles.sessionBar, { backgroundColor: colors.surface, borderColor: colors.text }]}>
          <View style={{ flex: 1 }}>
            <Text style={[cantiere.meta, { color: colors.textSecondary }]}>Stai aggiungendo a</Text>
            <Text style={[styles.sessionTarget, { color: colors.text }]} numberOfLines={2}>
              {sessionCliente?.name || '—'} · {sessionLavoro.title}
            </Text>
            {lastVoiceAdd ? (
              <View style={styles.sessionLastRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={[cantiere.meta, { color: colors.text, flex: 1 }]} numberOfLines={1}>{lastVoiceAdd}</Text>
              </View>
            ) : null}
          </View>
          <SecondaryButton
            label="Chiudi"
            icon="close-outline"
            onPress={closeVoiceSession}
            minHeight={64}
            style={styles.sessionClose}
            accessibilityLabel="Chiudi: le prossime voci chiederanno cliente e lavoro"
          />
        </View>
      ) : canUseVoice ? (
        <Text style={[cantiere.meta, styles.sessionHint, { color: colors.textSecondary }]}>
          Detta: ti chiedo dopo per quale cliente e lavoro.
        </Text>
      ) : null}

      <View style={styles.voiceCenterWrap}>
        {canUseVoice ? (
          <VoiceButton onResult={handleVoiceResult} context={voiceContext} size={220} onMicDenied={handleMicDenied} showLabel />
        ) : null}
        {/* No price, link or purchase button here: the app sells nothing (store rules). */}
        {profileId && !canUseVoice ? (
          <View style={[styles.voiceOffBox, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="text">
            <Text style={[styles.voiceOffTitle, { color: colors.text }]}>Dettatura non attiva</Text>
            <Text style={[styles.voiceOffText, { color: colors.textSecondary }]}>
              La dettatura è attiva con l&apos;abbonamento o la prova gratuita. Lo stato del tuo account è nella pagina Abbonamento del Profilo.
            </Text>
          </View>
        ) : null}
      </View>

      {renderCarousel()}

      <SectionHeader
        title="Lavori recenti"
        action={<TertiaryButton label="Tutti i clienti" onPress={() => setLevel('clients')} accessibilityHint="Apre l'elenco dei clienti con la ricerca" />}
      />
      {recentJobs.length === 0 ? (
        <EmptyState
          icon="mic-outline"
          text={canUseVoice ? 'Tocca il microfono e detta la prima voce, per esempio: «sei metri di trave IPE 120».' : 'Ancora nessun lavoro. Crealo qui sotto.'}
        />
      ) : (
        <ListGroup>{recentJobs.map((job, index) => jobRow(job, index, 'home'))}</ListGroup>
      )}
      <TertiaryButton
        label="Nuovo lavoro"
        icon="add-outline"
        style={styles.afterGroup}
        onPress={() => {
          setJobClienteId(selectedClienteId ?? clienti[0]?.id ?? null);
          setShowJobModal(true);
        }}
        accessibilityLabel="Nuovo lavoro, a mano"
      />
    </>
  );

  const renderClients = () => (
    <>
      <TextField
        label="Cerca cliente"
        icon="search-outline"
        scale="cantiere"
        value={clientSearch}
        onChangeText={setClientSearch}
        placeholder="Es. Rossi"
        clearButtonMode="while-editing"
        autoCorrect={false}
      />
      {filteredClienti.length === 0 ? (
        <EmptyState
          text={
            clientSearch.trim()
              ? `Nessun cliente con «${clientSearch.trim()}». Lo crei quando detti la prossima voce, oppure qui.`
              : 'Ancora nessun cliente. Lo crei quando detti la prima voce, oppure qui.'
          }
        />
      ) : (
        <ListGroup>
          {filteredClienti.map((item, index) => {
            const count = jobsOf(item.id).length;
            return (
              <ListRow
                key={item.id}
                first={index === 0}
                title={item.name}
                subtitle={count === 1 ? '1 lavoro' : `${count} lavori`}
                onPress={() => openClient(item.id)}
                onLongPress={() => openClientSheet(item)}
                accessibilityHint="Apre i lavori del cliente"
              />
            );
          })}
        </ListGroup>
      )}
    </>
  );

  const renderClient = () => {
    const jobs = selectedClienteId ? jobsOf(selectedClienteId) : [];
    return (
      <>
        <View style={styles.contextRow}>
          <View style={{ flex: 1 }}>
            <Text style={[cantiere.titleSm, { color: colors.text }]} numberOfLines={2}>{selectedCliente?.name}</Text>
            <Text style={[cantiere.meta, { color: colors.textSecondary }]}>
              {jobs.length === 1 ? '1 lavoro aperto' : `${jobs.length} lavori aperti`}
            </Text>
          </View>
          {selectedCliente ? (
            <SecondaryButton
              label="Modifica"
              icon="create-outline"
              minHeight={48}
              onPress={() => openClientSheet(selectedCliente)}
              accessibilityLabel={`Modifica il cliente ${selectedCliente.name}`}
            />
          ) : null}
        </View>
        {jobs.length === 0 ? (
          <EmptyState text="Nessun lavoro aperto per questo cliente. Detta una voce col microfono, oppure creane uno qui sotto." />
        ) : (
          <ListGroup>{jobs.map((job, index) => jobRow(job, index, 'client'))}</ListGroup>
        )}
      </>
    );
  };

  const renderJob = () => {
    if (!selectedLavoro) return null;
    const anyVat = costi.some((item) => item.vat_percent !== null && item.vat_percent !== undefined);
    return (
      <>
        <View style={styles.contextRow}>
          <View style={{ flex: 1 }}>
            <Text style={[cantiere.titleSm, { color: colors.text }]} numberOfLines={2}>{selectedCliente?.name}</Text>
            <Text style={[cantiere.meta, { color: colors.textSecondary }]}>Le voci dettate qui vanno in questo lavoro</Text>
          </View>
          <SecondaryButton
            label="Modifica"
            icon="create-outline"
            minHeight={48}
            onPress={() => openJobSheet(selectedLavoro)}
            accessibilityLabel={`Modifica il lavoro ${selectedLavoro.title}`}
          />
        </View>

        {costi.length === 0 ? (
          <EmptyState text="Ancora nessuna voce. Detta col microfono qui sotto." />
        ) : (
          <View style={[styles.sheetGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {costi.map((item, index) => {
              const fresh = recentIds.includes(item.id);
              const total = lineTotal(item);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => openEditCosto(item)}
                  onLongPress={() => openCostoSheet(item)}
                  delayLongPress={400}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.description}, ${formatQtyTimesPrice(Number(item.quantity), item.unit, clientUnitPrice(item))}, ${moneyForScreenReader(total)}`}
                  accessibilityHint="Apre la modifica della voce"
                  accessibilityActions={[{ name: 'longpress', label: 'Modifica o elimina' }]}
                  onAccessibilityAction={(event) => {
                    if (event.nativeEvent.actionName === 'longpress') openCostoSheet(item);
                  }}
                  style={({ pressed }) => [
                    styles.lineRow,
                    { backgroundColor: pressed ? colors.surfaceSecondary : fresh ? colors.mark : colors.surface },
                    index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineDesc, { color: colors.text }]} numberOfLines={2}>{item.description}</Text>
                    <Text style={[cantiere.priceUnit, { color: colors.textSecondary }]}>
                      {formatQtyTimesPrice(Number(item.quantity), item.unit, clientUnitPrice(item))}
                    </Text>
                  </View>
                  {fresh ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null}
                  <Text style={[cantiere.price, { color: colors.text }]}>{formatMoney(total)}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={[styles.totalRule, { backgroundColor: colors.text }]} />
        <View style={styles.totalRow}>
          <Text style={[cantiere.title, { color: colors.text }]}>Totale</Text>
          <Text style={[cantiere.display, { color: colors.text }]} accessibilityLabel={`Totale ${moneyForScreenReader(jobsTotal)}`}>
            {formatMoney(jobsTotal)}
          </Text>
        </View>
        <Text style={[cantiere.meta, { color: colors.textSecondary }]}>
          {anyVat ? 'IVA esclusa: si aggiunge nel preventivo, voce per voce' : 'IVA esclusa: si aggiunge nel preventivo'}
        </Text>

        <SecondaryButton
          label="Aggiungi una voce a mano"
          icon="add-outline"
          minHeight={56}
          style={{ marginTop: space.s4 }}
          onPress={() => setShowCostoModal(true)}
        />
      </>
    );
  };

  const renderCarousel = () =>
    showFallbackCarousel && carouselItems.length > 0 ? (
      <View style={[styles.carouselBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.carouselHead}>
          <Text style={[cantiere.titleSm, { color: colors.text, flex: 1 }]}>{t('dashboard.selectMaterial') || 'Seleziona materiale:'}</Text>
          <Pressable
            onPress={() => setShowFallbackCarousel(false)}
            accessibilityRole="button"
            accessibilityLabel="Chiudi l'elenco dei materiali"
            style={styles.iconBtn}
          >
            <Ionicons name="close-outline" size={28} color={colors.text} />
          </Pressable>
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={carouselItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.carouselCard, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
              onPress={() => handleAddCostoFromListino(item)}
              accessibilityRole="button"
              accessibilityLabel={`Aggiungi ${item.description}`}
            >
              <Text style={[styles.carouselDesc, { color: colors.text }]} numberOfLines={2}>{item.description}</Text>
              <Text style={[cantiere.priceUnit, { color: colors.textSecondary }]}>{formatMoney(Number(item.unit_price))}</Text>
            </Pressable>
          )}
        />
      </View>
    ) : null;

  const vatOptions: [string, string][] = [['', 'Del preventivo'], ...LINE_VAT_PRESETS.map((rate) => [rate, `${rate}%`] as [string, string]), ['custom', 'Altra']];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: showFloatingMic ? 140 : space.s5 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {selectedLavoro ? renderJob() : selectedClienteId ? (
          <>
            {renderCarousel()}
            {renderClient()}
          </>
        ) : level === 'clients' ? renderClients() : renderHome()}
      </ScrollView>

      {/* Fixed action at the bottom of the inner levels. */}
      {selectedLavoro ? (
        <BottomActionBar>
          {costi.length === 0 ? (
            <Text style={[cantiere.meta, { color: colors.textSecondary, textAlign: 'center' }]}>Aggiungi almeno una voce</Text>
          ) : null}
          <PrimaryButton
            label="Prepara il preventivo"
            icon="document-text-outline"
            disabled={costi.length === 0}
            onPress={() => (navigation as any).navigate('Quote', { lavoro: selectedLavoro })}
          />
        </BottomActionBar>
      ) : selectedClienteId ? (
        <BottomActionBar>
          <PrimaryButton
            label="Nuovo lavoro"
            icon="add-outline"
            onPress={() => {
              setJobClienteId(selectedClienteId);
              setShowJobModal(true);
            }}
            accessibilityLabel={`Nuovo lavoro per ${selectedCliente?.name || 'il cliente'}`}
          />
        </BottomActionBar>
      ) : level === 'clients' ? (
        <BottomActionBar>
          <PrimaryButton label="Nuovo cliente" icon="add-outline" onPress={() => setShowClientModal(true)} />
        </BottomActionBar>
      ) : (
        <BottomTabBar active="Dashboard" onReselect={goHome} />
      )}

      {/* Inside a customer or job the microphone stays reachable, bottom right, above the bar. */}
      {showFloatingMic ? (
        <VoiceButton
          onResult={handleVoiceResult}
          context={voiceContext}
          size={84}
          floating
          floatingBottom={actionBarHeight + space.s4}
          onMicDenied={handleMicDenied}
        />
      ) : null}

      <Modal visible={showClientModal} transparent animationType="fade" onRequestClose={() => setShowClientModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[cantiere.title, styles.modalTitle, { color: colors.text }]}>Nuovo cliente</Text>
            <TextField
              label="Nome del cliente"
              scale="cantiere"
              placeholder="Es. Mario Rossi"
              value={newClientName}
              onChangeText={setNewClientName}
              autoFocus
            />
            {/* Paese e lingua cliente fissi: app disponibile solo in Italia */}
            <View style={styles.modalButtons}>
              <SecondaryButton label={t('buttons.cancel')} onPress={() => setShowClientModal(false)} style={{ flex: 1 }} />
              <PrimaryButton label={t('buttons.save')} onPress={handleCreateClient} loading={creatingClient} loadingLabel="Salvo…" style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showJobModal} transparent animationType="fade" onRequestClose={() => setShowJobModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg, maxHeight: '85%' }]}>
            <Text style={[cantiere.title, styles.modalTitle, { color: colors.text }]}>Nuovo lavoro</Text>
            <TextField
              label="Nome del lavoro"
              scale="cantiere"
              placeholder="Es. Pensilina ingresso"
              value={newJobTitle}
              onChangeText={setNewJobTitle}
            />
            <Text style={[cantiere.meta, { color: colors.text, marginBottom: 6 }]}>Cliente</Text>
            {clienti.length === 0 ? (
              <Text style={[cantiere.meta, { color: colors.textSecondary, marginBottom: space.s4 }]}>
                Prima crea un cliente da «Tutti i clienti», oppure detta una voce.
              </Text>
            ) : (
              <ScrollView style={[styles.pickList, { borderColor: colors.border }]} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {clienti.map((item, index) => (
                  <ListRow
                    key={item.id}
                    first={index === 0}
                    title={item.name}
                    scale="ufficio"
                    selected={jobClienteId === item.id}
                    hideChevron
                    onPress={() => setJobClienteId(item.id)}
                    style={{ minHeight: 56 }}
                  />
                ))}
              </ScrollView>
            )}
            <View style={styles.modalButtons}>
              <SecondaryButton label={t('buttons.cancel')} onPress={() => setShowJobModal(false)} style={{ flex: 1 }} />
              <PrimaryButton label={t('buttons.save')} onPress={handleCreateJob} loading={creatingJob} loadingLabel="Salvo…" style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showCostoModal} transparent animationType="fade" onRequestClose={closeCostoModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modal, { maxHeight: '88%', backgroundColor: colors.modalBg }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[cantiere.title, styles.modalTitle, { color: colors.text }]}>Aggiungi una voce</Text>
              <TextField
                label="Descrizione"
                placeholder="Es. Trave IPE 120"
                value={newCostoDesc}
                onChangeText={setNewCostoDesc}
                help="Se è nel tuo listino, il prezzo arriva da solo."
              />

              {/* Inline search results (replaces separate modal to avoid iOS modal-on-modal crash) */}
              {showListinoSelector && searchResults.length > 0 && (
                <View style={{ marginBottom: space.s4 }}>
                  <Text style={[cantiere.meta, { color: colors.textSecondary, marginBottom: space.s2 }]}>
                    {t('dashboard.selectMaterial')} ({searchResults.length} {t('dashboard.resultsFound', { count: searchResults.length })})
                  </Text>
                  <ListGroup>
                    {searchResults.map((item, idx) => {
                      const markup = Number(item.markup_percent) || 0;
                      return (
                        <ListRow
                          key={`${item.id}-${idx}`}
                          first={idx === 0}
                          scale="ufficio"
                          title={item.description}
                          subtitle={`${item.listino_name || t('dashboard.unknownListino')} · ${formatMoney(Number(item.unit_price) * (1 + markup / 100))}${markup ? ` (ricarico ${markup}%)` : ''}`}
                          onPress={() => selectListinoItem(item)}
                          hideChevron
                        />
                      );
                    })}
                  </ListGroup>
                </View>
              )}

              {/* Matched item indicator */}
              {matchedItem && (
                <View style={[styles.matched, { backgroundColor: colors.successBg }]}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.successText} />
                  <Text style={[cantiere.meta, { color: colors.successText, flex: 1 }]}>
                    Dal listino: {matchedItem.description} · {formatMoney(Number(matchedItem.unit_price) * (1 + (Number(matchedItem.markup_percent) || 0) / 100))}
                  </Text>
                </View>
              )}

              <View style={styles.pairRow}>
                <TextField label={t('dashboard.quantity') || 'Quantità'} value={newCostoQty} onChangeText={setNewCostoQty} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
                <TextField label="Unità" placeholder="pz, m, kg, h…" value={newCostoUnit} onChangeText={setNewCostoUnit} maxLength={20} autoCapitalize="none" containerStyle={{ flex: 1 }} />
              </View>
              <TextField
                label="Prezzo al cliente (€)"
                help="Solo se la voce non è nel listino: è il prezzo finale, senza ricarico."
                value={newCostoPrice}
                onChangeText={setNewCostoPrice}
                keyboardType="decimal-pad"
              />
              <View style={styles.modalButtons}>
                <SecondaryButton label={t('buttons.cancel')} onPress={closeCostoModal} style={{ flex: 1 }} />
                <PrimaryButton label={t('buttons.save')} onPress={handleCreateCosto} loading={creatingCosto} loadingLabel="Salvo…" style={{ flex: 1 }} />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={Boolean(editCosto)} transparent animationType="fade" onRequestClose={() => setEditCosto(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modal, { maxHeight: '90%', backgroundColor: colors.modalBg }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[cantiere.title, styles.modalTitle, { color: colors.text }]}>Modifica voce</Text>
              <TextField label="Descrizione" value={editDesc} onChangeText={setEditDesc} multiline />
              <View style={styles.pairRow}>
                <TextField label="Quantità" value={editQty} onChangeText={setEditQty} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
                <TextField label="Unità" value={editUnit} onChangeText={setEditUnit} placeholder="pz, m, h…" autoCapitalize="none" maxLength={20} accessibilityLabel="Unità di misura" containerStyle={{ flex: 1 }} />
              </View>
              <View style={styles.pairRow}>
                <TextField label="Lo paghi (€)" value={editCost} onChangeText={changeEditCost} keyboardType="decimal-pad" accessibilityLabel="Prezzo d'acquisto" containerStyle={{ flex: 1 }} />
                <TextField label="Ricarico (%)" value={editMarkup} onChangeText={changeEditMarkup} keyboardType="decimal-pad" accessibilityLabel="Ricarico percentuale" containerStyle={{ flex: 1 }} />
              </View>
              <TextField
                label="Prezzo al cliente (€)"
                value={editFinal}
                onChangeText={changeEditFinal}
                keyboardType="decimal-pad"
                accessibilityLabel="Prezzo al cliente"
                style={styles.editFinal}
              />
              <Text style={[cantiere.meta, { color: colors.text, marginBottom: 6 }]}>IVA di questa voce</Text>
              <View style={styles.vatRow}>
                {vatOptions.map(([value, label]) => (
                  <Chip
                    key={value || 'quote'}
                    label={label}
                    selected={editVat === value}
                    onPress={() => setEditVat(value)}
                    accessibilityLabel={value === '' ? 'IVA del preventivo' : value === 'custom' ? 'Altra aliquota IVA' : `IVA ${label}`}
                  />
                ))}
              </View>
              {editVat === 'custom' ? (
                <TextField label="Aliquota IVA della voce (%)" value={editVatCustom} onChangeText={setEditVatCustom} keyboardType="decimal-pad" placeholder="Es. 8" />
              ) : null}
              <Text style={[cantiere.meta, { color: colors.textSecondary, fontWeight: '400', marginBottom: space.s3 }]}>
                Il cliente vede solo il prezzo al cliente. Totale riga: {formatMoney(num(editQty) * num(editFinal))}
              </Text>
              <View style={styles.modalButtons}>
                <SecondaryButton label={t('buttons.cancel')} onPress={() => setEditCosto(null)} style={{ flex: 1 }} />
                <PrimaryButton label={t('buttons.save')} onPress={saveEditCosto} loading={savingEdit} loadingLabel="Salvo…" style={{ flex: 1 }} />
              </View>
              {editCosto ? (
                <DangerButton
                  label="Elimina la voce"
                  style={{ marginTop: space.s5 }}
                  onPress={() => {
                    const item = editCosto;
                    setEditCosto(null);
                    // After the edit window has closed: two modals cannot animate together.
                    setTimeout(() => askDeleteCosto(item), 350);
                  }}
                />
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ActionSheet
        visible={Boolean(sheet)}
        title={sheet?.title || ''}
        subtitle={sheet?.subtitle}
        actions={sheet?.actions}
        destructive={sheet?.destructive}
        startOnConfirm={sheet?.startOnConfirm}
        onClose={() => setSheet(null)}
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: space.s4, paddingTop: space.s4 },
  sessionBar: { flexDirection: 'row', alignItems: 'center', gap: space.s3, borderWidth: 2, borderRadius: radius.control, padding: space.s4, marginBottom: space.s5 },
  sessionTarget: { ...cantiere.title },
  sessionLastRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sessionClose: { minWidth: 100, paddingHorizontal: space.s3 },
  sessionHint: { textAlign: 'center', marginBottom: space.s5 },
  voiceCenterWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: space.s2 },
  voiceOffBox: { padding: 20, borderRadius: radius.control, borderWidth: 1, gap: 8, alignSelf: 'stretch' },
  voiceOffTitle: { fontSize: 20, fontWeight: '800' },
  voiceOffText: { fontSize: 17, lineHeight: 24 },
  afterGroup: { marginTop: space.s2, alignSelf: 'flex-start' },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginBottom: space.s4 },
  sheetGroup: { borderRadius: radius.control, borderWidth: 1, overflow: 'hidden' },
  lineRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingHorizontal: space.s4, paddingVertical: space.s3 },
  lineDesc: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  totalRule: { height: 2, marginTop: space.s3 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.s3, gap: space.s3 },
  carouselBox: { borderRadius: radius.control, borderWidth: 1, padding: space.s4, marginBottom: space.s4 },
  carouselHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.s2 },
  carouselCard: { borderRadius: radius.control, padding: space.s3, marginRight: space.s2, minWidth: 140, minHeight: 72, borderWidth: 1 },
  carouselDesc: { fontWeight: '600', fontSize: 16, marginBottom: 4 },
  iconBtn: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: space.s4 },
  modal: { borderRadius: radius.sheet, padding: space.s5 },
  modalTitle: { marginBottom: space.s4 },
  modalButtons: { flexDirection: 'row', gap: space.s3, marginTop: space.s2 },
  pairRow: { flexDirection: 'row', gap: space.s3 },
  pickList: { maxHeight: 200, borderWidth: 1, borderRadius: radius.control, marginBottom: space.s4 },
  matched: { flexDirection: 'row', alignItems: 'center', gap: space.s2, padding: space.s3, borderRadius: radius.control, marginBottom: space.s4 },
  editFinal: { fontSize: 22, fontWeight: '700' },
  vatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, marginBottom: space.s4 },
});
