/**
 * Time savings tracking.
 * Punto 44: Dashboard Risparmio Tempo - show hours saved by using the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const TIME_SAVINGS_KEY = '@quoteapp:time_savings';

// Average time estimates (in minutes) for manual tasks
const MANUAL_TIME_ESTIMATES = {
  create_cliente: 2, // Typing client info manually
  create_lavoro: 3, // Setting up a new job/quote
  add_costo: 5, // Looking up price, typing, calculating
  voice_command: 1, // Time the voice command actually took
  generate_quote: 15, // Creating a quote manually on paper/excel
  send_email: 5, // Copying, pasting, formatting, sending
  csv_import: 30, // Manually entering all items from a price list
};

interface TimeSavingsEntry {
  action: string;
  minutesSaved: number;
  timestamp: number;
}

interface TimeSavingsStats {
  totalMinutesSaved: number;
  totalHoursSaved: number;
  totalActions: number;
  byAction: Record<string, { count: number; minutesSaved: number }>;
  thisWeek: number;
  thisMonth: number;
}

async function getEntries(): Promise<TimeSavingsEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(TIME_SAVINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveEntries(entries: TimeSavingsEntry[]): Promise<void> {
  // Keep only last 6 months
  const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const recent = entries.filter((e) => e.timestamp > sixMonthsAgo);
  await AsyncStorage.setItem(TIME_SAVINGS_KEY, JSON.stringify(recent));
}

/**
 * Record a time-saving action.
 */
export async function trackTimeSaving(
  action: keyof typeof MANUAL_TIME_ESTIMATES
): Promise<void> {
  const minutesSaved =
    MANUAL_TIME_ESTIMATES[action] - (MANUAL_TIME_ESTIMATES.voice_command || 1);
  if (minutesSaved <= 0) return;

  const entries = await getEntries();
  entries.push({
    action,
    minutesSaved,
    timestamp: Date.now(),
  });
  await saveEntries(entries);
}

/**
 * Get comprehensive time savings statistics.
 */
export async function getTimeSavingsStats(): Promise<TimeSavingsStats> {
  const entries = await getEntries();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  let totalMinutesSaved = 0;
  const byAction: Record<string, { count: number; minutesSaved: number }> = {};
  let thisWeek = 0;
  let thisMonth = 0;

  for (const entry of entries) {
    totalMinutesSaved += entry.minutesSaved;

    if (!byAction[entry.action]) {
      byAction[entry.action] = { count: 0, minutesSaved: 0 };
    }
    byAction[entry.action].count++;
    byAction[entry.action].minutesSaved += entry.minutesSaved;

    if (entry.timestamp > weekAgo) thisWeek += entry.minutesSaved;
    if (entry.timestamp > monthAgo) thisMonth += entry.minutesSaved;
  }

  return {
    totalMinutesSaved,
    totalHoursSaved: Math.round((totalMinutesSaved / 60) * 10) / 10,
    totalActions: entries.length,
    byAction,
    thisWeek,
    thisMonth,
  };
}

/**
 * Reset time savings data.
 */
export async function resetTimeSavings(): Promise<void> {
  await AsyncStorage.removeItem(TIME_SAVINGS_KEY);
}
