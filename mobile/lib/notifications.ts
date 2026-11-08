import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from './supabase';

// Configure notification handler
// While the user is recording or confirming, a client's answer waits.
const holdReasons = new Set<string>();
const heldNotifications: Notifications.NotificationContent[] = [];

export function holdClientDecisions(reason: string, active: boolean): void {
  if (active) {
    holdReasons.add(reason);
    return;
  }
  holdReasons.delete(reason);
  if (holdReasons.size > 0) return;
  for (const content of heldNotifications.splice(0)) {
    Notifications.scheduleNotificationAsync({
      content: { title: content.title, body: content.body, data: { ...content.data, released: true } },
      trigger: null,
    }).catch(() => {});
  }
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const { content } = notification.request;
    const hold = holdReasons.size > 0 && content.data?.type === 'client_decision' && !content.data?.released;
    if (hold) heldNotifications.push(content);
    return {
      shouldShowAlert: !hold,
      shouldShowBanner: !hold,
      shouldShowList: !hold,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});
/**
 * Register for push notifications and store the token in the user's profile.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications only work on physical devices');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return null;
  }

  // Get Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  });
  const token = tokenData.data;

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Store token in user profile
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ push_token: token, push_platform: Platform.OS })
        .eq('id', user.id);
    }
  } catch (e) {
    console.warn('Failed to store push token:', e);
  }

  return token;
}

/**
 * Hook for managing push notifications in React components.
 */
export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  useEffect(() => {
    // Permission is requested only when the user accepts an offer in the app.

    // Listen for incoming notifications while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener((n: Notifications.Notification) => {
      setNotification(n);
    });

    // Listen for user interaction with notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      // Handle navigation based on notification data
      if (data?.screen) {
        // Navigation will be handled by the component using this hook
        console.log('Navigate to:', data.screen);
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return { expoPushToken, notification };
}

/**
 * Schedule a local notification (e.g., reminder to complete a quote).
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  delaySeconds = 0
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger: delaySeconds > 0
      ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds }
      : null,
  });
}
