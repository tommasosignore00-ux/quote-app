import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { registerForPushNotifications } from './notifications';

const ONCE_PREFIX = '@mastrovoce:once:';
const UNMATCHED_KEY = '@mastrovoce:unmatched-items';
const EVENING_HOUR = 19;

/** True the first time it is called for this key on this device. */
export async function firstTime(key: string): Promise<boolean> {
  const stored = await AsyncStorage.getItem(ONCE_PREFIX + key);
  if (stored) return false;
  await AsyncStorage.setItem(ONCE_PREFIX + key, '1');
  return true;
}

/** Adds to the unmatched count and returns the new total. */
export async function countUnmatchedItems(added: number): Promise<number> {
  const total = (Number(await AsyncStorage.getItem(UNMATCHED_KEY)) || 0) + added;
  await AsyncStorage.setItem(UNMATCHED_KEY, String(total));
  return total;
}

/** Only ever called after the user asked for it. Returns false without permission. */
export async function scheduleEveningReminder(jobTitle: string, lavoroId: string): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;
  const date = new Date();
  if (date.getHours() >= EVENING_HOUR) date.setDate(date.getDate() + 1);
  date.setHours(EVENING_HOUR, 0, 0, 0);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Preventivo da preparare',
      body: jobTitle,
      data: { screen: 'Quote', lavoroId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return true;
}

/** Saves the opt-in and the device token together. */
export async function enableDecisionPush(userId: string): Promise<boolean> {
  const token = await registerForPushNotifications();
  if (!token) return false;
  await supabase.from('profiles').update({ notify_client_decision: true }).eq('id', userId);
  return true;
}
