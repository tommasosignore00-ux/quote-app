import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, View, Animated, DeviceEventEmitter } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Audio } from 'expo-av';
import { triggerHaptic } from '../lib/haptics';
import { saveOfflineRecording, syncOfflineRecordings, getPendingRecordingsCount } from '../lib/offlineRecording';
import NetInfo from '@react-native-community/netinfo';

type VoiceButtonProps = {
  onResult: (result: { action: string; data?: Record<string, unknown> }) => void;
  clienti?: { id: string; name: string }[];
  size?: number;
  /** Punto 2: FAB mode - position fixed bottom-right */
  floating?: boolean;
  /** Punto 4: Callback when microphone permission is denied */
  onMicDenied?: () => void;
  /** Enable start/stop control from watch bridge events */
  listenToWatchEvents?: boolean;
};

export default function VoiceButton({ onResult, clienti = [], size = 64, floating = false, onMicDenied, listenToWatchEvents = false }: VoiceButtonProps) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
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
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        if (onMicDenied) {
          onMicDenied();
        } else {
          Alert.alert(t('messages.permission'), t('messages.permissionDescription'));
        }
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setRecording(true);
      // Punto 10: Feedback Aptico
      triggerHaptic('recordingStart');
    } catch (err) {
      triggerHaptic('aiError');
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setRecording(false);
      triggerHaptic('recordingStop');

      if (!uri) return;

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

      // Punto 1: Check network - if offline, save for later
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await saveOfflineRecording(uri, clienti);
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

      const res = await fetch(`${supabaseUrl}/functions/v1/voice-process`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: formData,
      });
      const result = await res.json();
      if (result.action) {
        triggerHaptic('aiSuccess');
        onResult(result);
      }
    } catch (err) {
      triggerHaptic('aiError');
      // Punto 1: On error, try saving offline
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const handlePress = () => {
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
        ]}
        activeOpacity={0.8}
      >
        <Text style={[styles.icon, { fontSize: Math.max(28, Math.round(size * 0.42)) }]}>
          {recording ? '⏹' : '🎤'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );

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
