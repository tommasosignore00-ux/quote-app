import React, { useState, useRef, useEffect } from 'react';
import { getFunctionHeaders } from '../lib/supabaseFunctions';
import { TouchableOpacity, Text, StyleSheet, Alert, View, Animated, DeviceEventEmitter, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { triggerHaptic } from '../lib/haptics';
import { saveOfflineRecording, syncOfflineRecordings, getPendingRecordingsCount } from '../lib/offlineRecording';
import NetInfo from '@react-native-community/netinfo';

type VoiceButtonProps = {
  onResult: (result: { action: string; data?: Record<string, unknown>; text?: string; agent?: any }) => void;
  clienti?: { id: string; name: string }[];
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

export default function VoiceButton({ onResult, clienti = [], context, size = 64, floating = false, onMicDenied, listenToWatchEvents = false, showLabel = false }: VoiceButtonProps) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  // Waiting for the transcription: further taps are ignored.
  const [processing, setProcessing] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(0);
  // expo-audio recorder (expo-av is deprecated and removed in the next Expo SDKs).
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isRecordingRef = useRef(false);
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

  // Check pending offline recordings
  useEffect(() => {
    getPendingRecordingsCount().then(setPendingOffline);
  }, []);

  // Auto-sync offline recordings when online
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (state.isConnected) {
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
        const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
        if (supabaseUrl && supabaseAnonKey) {
          const { results } = await syncOfflineRecordings(supabaseUrl, supabaseAnonKey);
          for (const result of results) {
            if (result.action) onResult(result);
          }
          setPendingOffline(await getPendingRecordingsCount());
        }
      }
    });
    return () => unsubscribe();
  }, [onResult]);

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
      setRecording(true);
      // Punto 10: Feedback Aptico
      triggerHaptic('recordingStart');
    } catch (err) {
      triggerHaptic('aiError');
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const stopRecording = async () => {
    if (!isRecordingRef.current) return;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      isRecordingRef.current = false;
      setRecording(false);
      // Back to playback mode, so other audio is not routed as a recording session.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      triggerHaptic('recordingStop');

      if (!uri) return;
      setProcessing(true);

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

      // Punto 1: Check network - if offline, save for later
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await saveOfflineRecording(uri, clienti, context);
        const count = await getPendingRecordingsCount();
        setPendingOffline(count);
        Alert.alert(
          '📡 Offline',
          t('messages.offlineRecordingSaved') || 'Registrazione salvata. Verrà elaborata quando tornerà la connessione.'
        );
        return;
      }

      const formData = new FormData();
      formData.append('audio', { uri, name: 'recording.m4a', type: 'audio/m4a' } as any);
      formData.append('clienti', JSON.stringify(clienti.map((client) => ({ id: client.id, name: client.name }))));
      if (context) {
        formData.append('context', JSON.stringify(context));
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/voice-process`, {
        method: 'POST',
        headers: await getFunctionHeaders(),
        body: formData,
      });
      const result = await res.json();
      if (!res.ok || result?.error) {
        throw new Error(result?.error || 'Elaborazione non riuscita, riprova');
      }
      if (result.action) {
        triggerHaptic('aiSuccess');
        onResult(result);
      } else {
        triggerHaptic('aiError');
        Alert.alert('Non ho capito', result.text ? `Ho sentito: "${result.text}". Riprova parlando più vicino al telefono.` : 'Non ho sentito niente. Riprova parlando più vicino al telefono.');
      }
    } catch (err) {
      triggerHaptic('aiError');
      // Punto 1: On error, try saving offline
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

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
