/**
 * Haptic feedback utilities for voice recording and AI events.
 * Punto 10: Feedback Aptico - different vibrations for start/stop/error
 */
import { Platform } from 'react-native';

// Use expo-haptics if available, fallback to Vibration API
let Haptics: any = null;
try {
  Haptics = require('expo-haptics');
} catch {
  // expo-haptics not installed, will use Vibration fallback
}

import { Vibration } from 'react-native';

export type HapticEvent = 'recordingStart' | 'recordingStop' | 'aiError' | 'aiSuccess' | 'buttonTap';

export function triggerHaptic(event: HapticEvent): void {
  if (Platform.OS === 'web') return;

  if (Haptics) {
    switch (event) {
      case 'recordingStart':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'recordingStop':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'aiError':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'aiSuccess':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'buttonTap':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
    }
  } else {
    // Fallback to Vibration API
    switch (event) {
      case 'recordingStart':
        Vibration.vibrate(100);
        break;
      case 'recordingStop':
        Vibration.vibrate([0, 50, 50, 50]);
        break;
      case 'aiError':
        Vibration.vibrate([0, 100, 100, 100, 100, 100]);
        break;
      case 'aiSuccess':
        Vibration.vibrate([0, 30, 50, 30]);
        break;
      case 'buttonTap':
        Vibration.vibrate(30);
        break;
    }
  }
}
