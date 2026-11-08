import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, View, Animated, DeviceEventEmitter, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { triggerHaptic } from '../lib/haptics';
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

  // Pulse animation while recording
  useEffect(() => {
    if (recording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
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

  // Auto-sync offline recordings when online
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (!state.isConnected) return;
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
      askAboutStuckRecordings();
    });
    return () => unsubscribe();
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
    } catch (err) {
      triggerHaptic('aiError');
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const saveForLater = async (uri: string, message: string) => {
    await saveOfflineRecording(uri, context);
    setPendingOffline(await getPendingRecordingsCount());
    Alert.alert('📡 Registrazione salvata', message);
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
      const savedMessage = t('messages.offlineRecordingSaved') || 'Registrazione salvata. Verrà elaborata quando tornerà la connessione.';

      // Punto 1: Check network - if offline, save for later
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await saveForLater(uri, savedMessage);
        return;
      }

      const outcome = await uploadVoiceRecording(supabaseUrl, uri, context);
      if (outcome.kind === 'transient') {
        triggerHaptic('aiError');
        await saveForLater(uri, 'Il servizio non ha risposto: riprovo da solo appena possibile, non devi ridettare.');
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

  const buttonContent = (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <TouchableOpacity
        onPress={handlePress}
        style={[
          styles.button,
          { width: size, height: size, borderRadius: size / 2 },
          recording && styles.recording,
          processing && styles.processing,
        ]}
        activeOpacity={0.8}
        disabled={processing}
        accessibilityRole="button"
        accessibilityLabel={processing ? 'Sto capendo' : recording ? 'Ferma la registrazione' : 'Parla'}
      >
        {processing ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Text style={[styles.icon, { fontSize: Math.max(28, Math.round(size * 0.42)) }]}>
            {recording ? '⏹' : '🎤'}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );

  const label = processing ? 'Sto capendo…' : recording ? 'Sto ascoltando: tocca per finire' : 'Tocca e di\' cosa aggiungere';

  // Punto 2: Pulsante Rosso "Sticky" (FAB)
  if (floating) {
    return (
      <View style={styles.fabContainer} pointerEvents="box-none">
        {pendingOffline > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingOffline}</Text>
          </View>
        )}
        {buttonContent}
      </View>
    );
  }

  return (
    <View>
      {pendingOffline > 0 && (
        <Text style={styles.pendingText}>
          📡 {pendingOffline} {pendingOffline === 1 ? 'registrazione' : 'registrazioni'} in attesa
        </Text>
      )}
      {buttonContent}
      {showLabel ? <Text style={[styles.label, recording && styles.labelRecording]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  recording: { backgroundColor: '#b91c1c' },
  processing: { backgroundColor: '#64748b' },
  label: { marginTop: 14, fontSize: 20, fontWeight: '700', textAlign: 'center', color: '#475569' },
  labelRecording: { color: '#b91c1c' },
  icon: { fontSize: 28 },
  // FAB positioning
  fabContainer: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    zIndex: 1000,
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1001,
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pendingText: { textAlign: 'center', color: '#f59e0b', fontSize: 12, marginBottom: 4, fontWeight: '600' },
});
