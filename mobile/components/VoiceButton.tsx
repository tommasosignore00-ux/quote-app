import { holdClientDecisions } from '../lib/notifications';
import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, View, Animated, AppState, DeviceEventEmitter, ActivityIndicator, AccessibilityInfo, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/darkMode';
import { useTranslation } from 'react-i18next';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { triggerHaptic } from '../lib/haptics';
import { trackEvent } from '../lib/analytics';
import { firstTime } from '../lib/nudges';
import {
  deleteRecordings,
  getPendingRecordingsCount,
  getRecordingsNeedingAttention,
  retryRecordings,
  saveOfflineRecording,
  syncOfflineRecordings,
  uploadVoiceRecording,
} from '../lib/offlineRecording';
import NetInfo from '@react-native-community/netinfo';

// Speech only: mono 16 kHz is what the transcription uses, and a 2 minute clip stays
// around 500 KB, so it uploads on a weak site connection.
const VOICE_RECORDING_PRESET: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};
const MAX_RECORDING_MS = 120000;
const MIN_RECORDING_MS = 700;
// Preavviso a parole 10 s prima dello stop automatico (solo vista).
const NEAR_LIMIT_SEC = 110;

// Several buttons can be mounted: the question about stuck recordings is asked once.
let attentionPromptOpen = false;

type VoiceButtonProps = {
  onResult: (result: { action: string; data?: Record<string, unknown>; text?: string; agent?: any }) => void;
  context?: Record<string, unknown>;
  size?: number;
  /** Punto 2: FAB mode - position fixed bottom-right */
  floating?: boolean;
  /** Punto 4: Callback when microphone permission is denied */
  onMicDenied?: () => void;
  /** Enable start/stop control from watch bridge events */
  listenToWatchEvents?: boolean;
  /** Text under the button ("Tocca e parla"); hidden in floating mode. */
  showLabel?: boolean;
};

export default function VoiceButton({ onResult, context, size = 64, floating = false, onMicDenied, listenToWatchEvents = false, showLabel = false }: VoiceButtonProps) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  // Waiting for the transcription: further taps are ignored.
  const [processing, setProcessing] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(0);
  // expo-audio recorder (expo-av is deprecated and removed in the next Expo SDKs).
  const recorder = useAudioRecorder(VOICE_RECORDING_PRESET);
  const isRecordingRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always the latest callback, so the connection listener is registered only once.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { colors } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const nearLimitNotifiedRef = useRef(false);

  useEffect(() => {
    holdClientDecisions('recording', Boolean(recording));
    return () => holdClientDecisions('recording', false);
  }, [recording]);

  const askAboutStuckRecordings = async () => {
    if (attentionPromptOpen) return;
    const stuck = await getRecordingsNeedingAttention();
    if (!stuck.length) return;
    attentionPromptOpen = true;
    const ids = stuck.map((rec) => rec.id);
    const refresh = async () => {
      attentionPromptOpen = false;
      setPendingOffline(await getPendingRecordingsCount());
    };
    Alert.alert(
      'Registrazioni non elaborate',
      stuck.length === 1
        ? 'Una registrazione salvata non è stata capita. Cosa vuoi fare?'
        : `${stuck.length} registrazioni salvate non sono state capite. Cosa vuoi fare?`,
      [
        { text: 'Tienile', style: 'cancel', onPress: refresh },
        { text: 'Riprova', onPress: () => retryRecordings(ids).then(refresh) },
        { text: 'Eliminale', style: 'destructive', onPress: () => deleteRecordings(ids).then(refresh) },
      ],
      { cancelable: false }
    );
  };

  // Check pending offline recordings
  useEffect(() => {
    getPendingRecordingsCount().then(setPendingOffline);
    askAboutStuckRecordings();
  }, []);

  // NetInfo only tells when to try: it can report "no connection" on a working network,
  // so its answer never decides whether a recording is sent.
  useEffect(() => {
    const syncSavedRecordings = async (askAboutStuck: boolean) => {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
      if (!supabaseUrl || !supabaseAnonKey) return;
      const { results, missing, expired } = await syncOfflineRecordings(supabaseUrl, supabaseAnonKey);
      for (const result of results) onResultRef.current(result);
      setPendingOffline(await getPendingRecordingsCount());
      if (missing > 0) {
        Alert.alert('Registrazioni perse', missing === 1 ? 'Una registrazione salvata non è più sul telefono.' : `${missing} registrazioni salvate non sono più sul telefono.`);
      }
      if (expired > 0) {
        Alert.alert('Registrazioni eliminate', expired === 1 ? 'Una registrazione non inviata aveva più di 14 giorni ed è stata eliminata.' : `${expired} registrazioni non inviate avevano più di 14 giorni e sono state eliminate.`);
      }
      if (askAboutStuck) askAboutStuckRecordings();
    };
    const unsubscribe = NetInfo.addEventListener(() => {
      syncSavedRecordings(true);
    });
    // Not asking here: "Tienile" must not bring the question back at every reopening.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncSavedRecordings(false);
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, []);

  useEffect(() => () => {
    if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
  }, []);

  const startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        if (onMicDenied) {
          onMicDenied();
        } else {
          Alert.alert(t('messages.permission'), t('messages.permissionDescription'));
        }
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      isRecordingRef.current = true;
      recordingStartedAtRef.current = Date.now();
      setRecording(true);
      autoStopTimerRef.current = setTimeout(() => stopRecordingRef.current(), MAX_RECORDING_MS);
      // Punto 10: Feedback Aptico
      triggerHaptic('recordingStart');
      // The first dictation ever on this phone: event name only, with consent.
      firstTime('first-mic-tap').then((first) => { if (first) trackEvent('first_mic_tap'); }).catch(() => {});
    } catch (err) {
      triggerHaptic('aiError');
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const saveForLater = async (uri: string, message: string) => {
    await saveOfflineRecording(uri, context);
    setPendingOffline(await getPendingRecordingsCount());
    Alert.alert('Registrazione salvata', message);
  };

  const stopRecording = async () => {
    if (!isRecordingRef.current) return;
    // Cleared first: the auto-stop and a tap can arrive together.
    isRecordingRef.current = false;
    if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
    autoStopTimerRef.current = null;
    let uri: string | null = null;
    try {
      const durationMs = Date.now() - recordingStartedAtRef.current;
      await recorder.stop();
      uri = recorder.uri;
      setRecording(false);
      // Back to playback mode, so other audio is not routed as a recording session.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      triggerHaptic('recordingStop');

      if (!uri) return;
      if (durationMs < MIN_RECORDING_MS) {
        Alert.alert('Registrazione troppo breve', 'Tocca il microfono, parla, poi tocca di nuovo per finire.');
        return;
      }
      setProcessing(true);

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

      // Always try: a recording is kept for later only when sending it really failed.
      const outcome = await uploadVoiceRecording(supabaseUrl, uri, context);
      if (outcome.kind === 'transient') {
        triggerHaptic('aiError');
        await saveForLater(uri, 'Invio non riuscito: riprovo da solo appena possibile, non devi ridettare.');
        return;
      }
      if (outcome.kind !== 'ok') {
        triggerHaptic('aiError');
        Alert.alert(t('messages.error'), outcome.message);
        return;
      }
      const result = outcome.result;
      if (result.action) {
        triggerHaptic('aiSuccess');
        onResultRef.current(result);
      } else {
        triggerHaptic('aiError');
        Alert.alert('Non ho capito', result.text ? `Ho sentito: "${result.text}". Riprova parlando più vicino al telefono.` : 'Non ho sentito niente. Riprova parlando più vicino al telefono.');
      }
    } catch (err) {
      triggerHaptic('aiError');
      setRecording(false);
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setProcessing(false);
    }
  };
  // The auto-stop timer must see the customers and context of the latest render.
  const stopRecordingRef = useRef(stopRecording);
  stopRecordingRef.current = stopRecording;

  const handlePress = () => {
    if (processing) return;
    triggerHaptic('buttonTap');
    if (recording) stopRecording();
    else startRecording();
  };

  useEffect(() => {
    if (!listenToWatchEvents) return;

    const startSubscription = DeviceEventEmitter.addListener('startVoiceRecording', () => {
      if (!recording) startRecording();
    });
    const stopSubscription = DeviceEventEmitter.addListener('stopVoiceRecording', () => {
      if (recording) stopRecording();
    });

    return () => {
      startSubscription.remove();
      stopSubscription.remove();
    };
  }, [listenToWatchEvents, recording]);

  // ---- Vista (lotto 3): forma, timer, pulsazione. La logica qui sopra non cambia. ----

  // "Riduci movimento": letto all'avvio e aggiornato quando cambia.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduceMotion(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub.remove(); };
  }, []);

  // Timer "Registro m:ss": conta in avanti da 0, mai il tempo che manca.
  useEffect(() => {
    if (!recording) {
      setElapsedSec(0);
      return;
    }
    nearLimitNotifiedRef.current = false;
    setElapsedSec(0);
    AccessibilityInfo.announceForAccessibility('Registrazione avviata');
    const id = setInterval(() => {
      const sec = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
      setElapsedSec(sec);
      if (sec >= NEAR_LIMIT_SEC && !nearLimitNotifiedRef.current) {
        nearLimitNotifiedRef.current = true;
        triggerHaptic('buttonTap');
        AccessibilityInfo.announceForAccessibility('Sto per fermarmi');
      }
    }, 250);
    return () => clearInterval(id);
  }, [recording]);

  // Cambio di forma: cerchio -> quadrato arrotondato in 150 ms (immediato con "Riduci movimento").
  const restRadius = size / 2;
  const recRadius = size >= 150 ? 56 : 24;
  const shapeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = recording ? 1 : 0;
    if (reduceMotion) {
      shapeAnim.setValue(to);
      return;
    }
    Animated.timing(shapeAnim, { toValue: to, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
  }, [recording, reduceMotion]);
  const borderRadius = shapeAnim.interpolate({ inputRange: [0, 1], outputRange: [restRadius, recRadius] });

  // Pulsazione dell'anello esterno, solo in registrazione e solo senza "Riduci movimento".
  useEffect(() => {
    if (!recording || reduceMotion) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [recording, reduceMotion]);

  const timerText = `Registro ${formatElapsed(elapsedSec)}`;
  const nearLimit = recording && elapsedSec >= NEAR_LIMIT_SEC;
  const iconSize = Math.max(28, Math.round(size * 0.42));
  const ringWidth = floating ? 4 : 8;
  const bg = processing ? colors.processing : recording ? colors.recording : colors.primary;
  const showDarkRing = recording && colors.recordingRing !== 'transparent';
  const pendingLabel = `${pendingOffline} ${pendingOffline === 1 ? 'registrazione' : 'registrazioni'} in attesa`;
  const a11yLabel = processing
    ? 'Sto capendo'
    : recording
      ? 'Ferma la registrazione'
      : pendingOffline > 0
        ? `Parla. ${pendingLabel} di invio`
        : 'Parla';

  const buttonContent = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {recording ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -ringWidth,
            left: -ringWidth,
            width: size + ringWidth * 2,
            height: size + ringWidth * 2,
            borderRadius: recRadius + ringWidth,
            borderWidth: ringWidth,
            borderColor: colors.recording,
            opacity: reduceMotion ? 0.5 : 0.3,
            transform: [{ scale: pulseAnim }],
          }}
        />
      ) : null}
      <Animated.View
        style={[
          styles.button,
          {
            width: size,
            height: size,
            borderRadius,
            backgroundColor: bg,
            shadowColor: colors.shadow,
            borderWidth: showDarkRing ? 3 : 0,
            borderColor: showDarkRing ? colors.recordingRing : 'transparent',
          },
        ]}
      >
        <TouchableOpacity
          onPress={handlePress}
          style={styles.touch}
          activeOpacity={0.8}
          disabled={processing}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          accessibilityState={{ disabled: processing, busy: processing }}
        >
          {processing ? (
            <ActivityIndicator color={colors.onPrimary} size="large" />
          ) : (
            <Ionicons name={recording ? 'stop' : 'mic'} size={iconSize} color={colors.onPrimary} />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );

  // Punto 2: microfono flottante (84). Il chip sopra dice lo stato a parole.
  if (floating) {
    let chip: React.ReactNode = null;
    if (processing) {
      chip = (
        <View style={[styles.chip, { backgroundColor: colors.processing }]}>
          <Text style={[styles.chipText, { color: colors.onPrimary }]}>Sto capendo…</Text>
        </View>
      );
    } else if (recording) {
      chip = (
        <View style={[styles.chip, { backgroundColor: colors.recording }]} accessibilityLiveRegion="polite">
          <Text style={[styles.chipText, styles.tabular, { color: colors.onPrimary }]}>{timerText}</Text>
        </View>
      );
    } else if (pendingOffline > 0) {
      chip = (
        <View style={[styles.chip, { backgroundColor: colors.warningBg, gap: 6 }]}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.warningText} />
          <Text style={[styles.chipText, { color: colors.warningText }]}>{pendingOffline} in attesa</Text>
        </View>
      );
    }
    return (
      <View style={styles.fabContainer} pointerEvents="box-none">
        {chip}
        {buttonContent}
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center' }}>
      {pendingOffline > 0 && !recording && !processing ? (
        <View style={[styles.pill, { backgroundColor: colors.warningBg }]}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.warningText} />
          <Text style={[styles.pillText, { color: colors.warningText }]}>{pendingLabel}</Text>
        </View>
      ) : null}
      {buttonContent}
      {showLabel ? (
        recording ? (
          <View style={styles.labelBlock}>
            <View style={styles.timerRow}>
              <View style={[styles.dot, { backgroundColor: colors.recording }]} />
              <Text style={[styles.timer, styles.tabular, { color: colors.dangerText }]}>{timerText}</Text>
            </View>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {nearLimit ? 'Sto per fermarmi: tocca per finire' : 'Tocca per finire'}
            </Text>
          </View>
        ) : (
          <View style={styles.labelBlock}>
            <Text style={[styles.label, { color: colors.text }]}>
              {processing ? 'Sto capendo…' : 'Tocca e di\' cosa aggiungere'}
            </Text>
            {pendingOffline > 0 && !processing ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Partono da sole appena torna la rete.</Text>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  touch: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  labelBlock: { marginTop: 14, alignItems: 'center', gap: 4 },
  label: { fontSize: 20, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  timer: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  meta: { fontSize: 16, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
  // "In coda": stato a parole, alto 36, non si tocca.
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, marginBottom: 12 },
  pillText: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  // Microfono flottante: posizione invariata.
  fabContainer: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    zIndex: 1000,
    alignItems: 'flex-end',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginBottom: 8,
  },
  chipText: { fontSize: 18, fontWeight: '800' },
});
