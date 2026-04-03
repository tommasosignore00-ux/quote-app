/**
 * Follow-up reminder system.
 * Punto 45: Promemoria Follow-up - notify if client doesn't open quote email after 48h.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleLocalNotification } from './notifications';

const FOLLOW_UP_KEY = '@quoteapp:follow_ups';

export interface FollowUpReminder {
  id: string;
  lavoroId: string;
  lavoroTitle: string;
  clientName: string;
  recipientEmail: string;
  sentAt: number;
  reminderScheduledAt: number;
  reminded: boolean;
}

async function getReminders(): Promise<FollowUpReminder[]> {
  try {
    const raw = await AsyncStorage.getItem(FOLLOW_UP_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveReminders(reminders: FollowUpReminder[]): Promise<void> {
  // Keep only last 90 days
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recent = reminders.filter((r) => r.sentAt > cutoff);
  await AsyncStorage.setItem(FOLLOW_UP_KEY, JSON.stringify(recent));
}

/**
 * Schedule a follow-up reminder for a sent quote.
 * Will trigger a local notification after 48 hours.
 */
export async function scheduleFollowUp(params: {
  lavoroId: string;
  lavoroTitle: string;
  clientName: string;
  recipientEmail: string;
}): Promise<void> {
  const id = `followup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = Date.now();
  const reminderDelay = 48 * 60 * 60; // 48 hours in seconds

  const reminders = await getReminders();
  reminders.push({
    id,
    lavoroId: params.lavoroId,
    lavoroTitle: params.lavoroTitle,
    clientName: params.clientName,
    recipientEmail: params.recipientEmail,
    sentAt: now,
    reminderScheduledAt: now + reminderDelay * 1000,
    reminded: false,
  });
  await saveReminders(reminders);

  // Schedule local notification
  await scheduleLocalNotification(
    `📧 Follow-up: ${params.clientName}`,
    `Il preventivo "${params.lavoroTitle}" inviato a ${params.recipientEmail} non ha ancora ricevuto risposta. Vuoi inviare un promemoria?`,
    reminderDelay,
    { screen: 'Quote', lavoroId: params.lavoroId }
  );
}

/**
 * Mark a follow-up as completed (client responded or manually dismissed).
 */
export async function dismissFollowUp(lavoroId: string): Promise<void> {
  const reminders = await getReminders();
  const updated = reminders.map((r) =>
    r.lavoroId === lavoroId ? { ...r, reminded: true } : r
  );
  await saveReminders(updated);
}

/**
 * Get pending follow-up reminders (not yet reminded, older than 48h).
 */
export async function getPendingFollowUps(): Promise<FollowUpReminder[]> {
  const reminders = await getReminders();
  const now = Date.now();
  return reminders.filter((r) => !r.reminded && now > r.reminderScheduledAt);
}

/**
 * Get all follow-up reminders.
 */
export async function getAllFollowUps(): Promise<FollowUpReminder[]> {
  return getReminders();
}
