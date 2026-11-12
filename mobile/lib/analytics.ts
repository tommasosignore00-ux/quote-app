import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = '@mastrovoce:analytics-consent';
const ANON_ID_KEY = '@mastrovoce:analytics-id';
const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || '';
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

export async function getAnalyticsConsent(): Promise<boolean> {
  return (await AsyncStorage.getItem(CONSENT_KEY)) === 'accepted';
}

export async function setAnalyticsConsent(accepted: boolean): Promise<void> {
  await AsyncStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'rejected');
  if (!accepted) await AsyncStorage.removeItem(ANON_ID_KEY);
}

async function anonymousId(): Promise<string> {
  const stored = await AsyncStorage.getItem(ANON_ID_KEY);
  if (stored) return stored;
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(ANON_ID_KEY, created);
  return created;
}

/** Event names only: no text, client, amount or account data leaves the device. */
export type AnalyticsEvent = 'first_mic_tap' | 'voice_item_confirmed' | 'quote_sent';

export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  if (!API_KEY || !(await getAnalyticsConsent())) return;
  fetch(`${HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: API_KEY,
      event,
      distinct_id: await anonymousId(),
      properties: { $process_person_profile: false, platform: 'mobile' },
    }),
  }).catch(() => {});
}
