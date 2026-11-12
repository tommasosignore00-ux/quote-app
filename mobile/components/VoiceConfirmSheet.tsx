import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/darkMode';
import { formatQuantity, normalizeName, parseItalianNumber, type JobRecord, type NamedRecord } from '../lib/voiceDraft';

/** An item of the draft, with the price list article it was matched to. */
export type DraftItem = {
  key: string;
  spoken: string;
  /** null until the user gives one: no quantity was said. */
  quantity: number | null;
  unit: string | null;
  /** Price said aloud or typed here, as text; when set it wins over the price list. */
  priceText: string;
  /** Price list candidates, best first; the chosen one is matches[choice]. */
  matches: Array<{ id: string; description: string; unit_price: number; markup_percent?: number | null; unit?: string | null; fullMatch?: boolean }>;
  choice: number;
};

type Step = 'cliente' | 'lavoro' | 'conferma';

type Props = {
  visible: boolean;
  transcript: string;
  items: DraftItem[];
  clienti: NamedRecord[];
  /** Most recent first. */
  lavori: JobRecord[];
  initialClienteId: string | null;
  initialLavoroId: string | null;
  suggestedJobTitle: string | null;
  saving: boolean;
  /** Markup applied when the article has none of its own. */
  defaultMarkup: number;
  onChangeItems: (items: DraftItem[]) => void;
  onCreateCliente: (name: string) => Promise<NamedRecord | null>;
  onCreateLavoro: (clienteId: string, title: string) => Promise<JobRecord | null>;
  onConfirm: (lavoro: JobRecord) => void;
  onCancel: () => void;
};

const QUANTITY_STEP_UNITS = new Set(['m', 'ml', 'mt', 'kg', 'l', 'm2', 'm²', 'mq', 'm3', 'm³', 'mc']);

function money(value: number): string {
  return `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The price typed or said for this item; null when it should come from the price list. */
export function draftItemOwnPrice(item: DraftItem): number | null {
  const parsed = parseItalianNumber(item.priceText);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

export function draftItemPrice(item: DraftItem, defaultMarkup: number): number | null {
  const own = draftItemOwnPrice(item);
  if (own !== null) return own;
  const match = item.matches[item.choice];
  if (!match) return null;
  const markup = Number(match.markup_percent) || defaultMarkup;
  return Number(match.unit_price) * (1 + markup / 100);
}

export default function VoiceConfirmSheet({
  visible,
  transcript,
  items,
  clienti,
  lavori,
  initialClienteId,
  initialLavoroId,
  suggestedJobTitle,
  saving,
  defaultMarkup,
  onChangeItems,
  onCreateCliente,
  onCreateLavoro,
  onConfirm,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('cliente');
  const [creatingCliente, setCreatingCliente] = useState(false);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [lavoroId, setLavoroId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newJobTitle, setNewJobTitle] = useState<string | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);
  const [choosingItem, setChoosingItem] = useState<string | null>(null);

  // Every new dictation starts from what the audio (or the open job) already says.
  useEffect(() => {
    if (!visible) return;
    setClienteId(initialClienteId);
    setLavoroId(initialLavoroId);
    setSearch('');
    setNewJobTitle(null);
    setChoosingItem(null);
    setStep(initialLavoroId ? 'conferma' : initialClienteId ? 'lavoro' : 'cliente');
  }, [visible, initialClienteId, initialLavoroId]);

  const cliente = clienti.find((record) => record.id === clienteId) || null;
  const lavoro = lavori.find((record) => record.id === lavoroId) || null;
  const jobsOfCliente = useMemo(
    () => lavori.filter((record) => record.cliente_id === clienteId),
    [lavori, clienteId]
  );

  // Customers with recent jobs first, then alphabetical.
  const orderedClienti = useMemo(() => {
    const rank = new Map<string, number>();
    lavori.forEach((record, index) => {
      if (!rank.has(record.cliente_id)) rank.set(record.cliente_id, index);
    });
    const query = normalizeName(search);
    return clienti
      .filter((record) => !query || normalizeName(record.name).includes(query))
      .sort((a, b) => {
        const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb || a.name.localeCompare(b.name, 'it');
      });
  }, [clienti, lavori, search]);

  const createCliente = async () => {
    setCreatingCliente(true);
    const created = await onCreateCliente(search.trim());
    setCreatingCliente(false);
    if (created) {
      setSearch('');
      pickCliente(created.id);
    }
  };

  const pickCliente = (id: string) => {
    setClienteId(id);
    setLavoroId(null);
    setNewJobTitle(null);
    setStep('lavoro');
  };

  const pickLavoro = (id: string) => {
    setLavoroId(id);
    setStep('conferma');
  };

  const createJob = async () => {
    if (!clienteId || !newJobTitle?.trim()) return;
    setCreatingJob(true);
    try {
      const created = await onCreateLavoro(clienteId, newJobTitle.trim());
      if (created) {
        setNewJobTitle(null);
        pickLavoro(created.id);
      }
    } finally {
      setCreatingJob(false);
    }
  };

  const changeQuantity = (key: string, delta: number) => {
    onChangeItems(
      items.map((item) =>
        item.key === key
          ? { ...item, quantity: item.quantity === null ? 1 : Math.max(0.5, Math.round((item.quantity + delta) * 100) / 100) }
          : item
      )
    );
  };

  const changePrice = (key: string, priceText: string) => {
    onChangeItems(items.map((item) => (item.key === key ? { ...item, priceText } : item)));
  };

  const removeItem = (key: string) => onChangeItems(items.filter((item) => item.key !== key));

  const chooseMatch = (key: string, choice: number) => {
    onChangeItems(items.map((item) => (item.key === key ? { ...item, choice } : item)));
    setChoosingItem(null);
  };

  const missingQuantity = items.some((item) => item.quantity === null);
  const canConfirm = Boolean(lavoro) && items.length > 0 && !missingQuantity && !saving;

  const itemBeingChosen = items.find((item) => item.key === choosingItem) || null;
  const text = { color: colors.text };
  const muted = { color: colors.textSecondary };

  const renderHeader = (title: string, subtitle?: string) => (
    <View style={styles.header}>
      <Text style={[styles.stepTitle, text]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, muted]}>{subtitle}</Text> : null}
    </View>
  );

  const renderCliente = () => (
    <>
      {renderHeader('A quale cliente?', 'Tocca il cliente')}
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Cerca cliente"
        placeholderTextColor={colors.textTertiary}
        style={[styles.search, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
      />
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {search.trim() && !orderedClienti.some((record) => normalizeName(record.name) === normalizeName(search)) ? (
          <TouchableOpacity
            style={[styles.choice, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            onPress={createCliente}
            disabled={creatingCliente}
            accessibilityRole="button"
          >
            <View style={[styles.iconRow, styles.iconRowStart]}>
              {creatingCliente ? null : <Ionicons name="add-outline" size={24} color={colors.primaryStrong} />}
              <Text style={[styles.choiceText, text, styles.flexText]} numberOfLines={2}>
                {creatingCliente ? 'Creazione…' : `Nuovo cliente: ${search.trim()}`}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}
        {orderedClienti.length === 0 ? (
          search.trim() ? null : <Text style={[styles.empty, muted]}>Nessun cliente ancora</Text>
        ) : (
          orderedClienti.map((record) => (
            <TouchableOpacity
              key={record.id}
              style={[styles.choice, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              onPress={() => pickCliente(record.id)}
              accessibilityRole="button"
            >
              <Text style={[styles.choiceText, text]} numberOfLines={2}>{record.name}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </>
  );

  const renderLavoro = () => (
    <>
      {renderHeader('Quale lavoro?', cliente ? `Cliente: ${cliente.name}` : undefined)}
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {jobsOfCliente.map((record) => (
          <TouchableOpacity
            key={record.id}
            style={[styles.choice, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            onPress={() => pickLavoro(record.id)}
            accessibilityRole="button"
          >
            <Text style={[styles.choiceText, text]} numberOfLines={2}>{record.title}</Text>
          </TouchableOpacity>
        ))}
        {newJobTitle === null ? (
          <TouchableOpacity
            style={[styles.choice, styles.newChoice, { borderColor: colors.primary }]}
            onPress={() => setNewJobTitle(suggestedJobTitle || '')}
            accessibilityRole="button"
          >
            <View style={[styles.iconRow, styles.iconRowStart]}>
              <Ionicons name="add-outline" size={24} color={colors.primaryText} />
              <Text style={[styles.choiceText, { color: colors.primaryText }]}>Nuovo lavoro</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.newJobBox}>
            <TextInput
              value={newJobTitle}
              onChangeText={setNewJobTitle}
              placeholder="Nome del lavoro (es. Bagno)"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              style={[styles.search, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            />
            <TouchableOpacity
              style={[styles.bigButton, { backgroundColor: colors.primary }, (!newJobTitle.trim() || creatingJob) && styles.disabled]}
              onPress={createJob}
              disabled={!newJobTitle.trim() || creatingJob}
            >
              {creatingJob ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.bigButtonText, { color: colors.onPrimary }]}>Crea lavoro</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <TouchableOpacity
        style={[styles.bigButton, styles.secondary, { borderColor: colors.border }]}
        onPress={() => setStep('cliente')}
      >
        <View style={styles.iconRow}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
          <Text style={[styles.secondaryText, text]}>Cambia cliente</Text>
        </View>
      </TouchableOpacity>
    </>
  );

  const renderChooseMatch = (item: DraftItem) => (
    <>
      {renderHeader('Quale articolo?', `Hai detto: "${item.spoken}"`)}
      <ScrollView style={styles.list}>
        {item.matches.map((match, index) => (
          <TouchableOpacity
            key={match.id}
            style={[
              styles.choice,
              { backgroundColor: colors.surfaceSecondary, borderColor: index === item.choice ? colors.primary : colors.border },
              index === item.choice && styles.choiceSelected,
            ]}
            onPress={() => chooseMatch(item.key, index)}
          >
            <Text style={[styles.choiceText, text]} numberOfLines={3}>{match.description}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.choice, { backgroundColor: colors.surfaceSecondary, borderColor: item.choice === -1 ? colors.primary : colors.border }]}
          onPress={() => chooseMatch(item.key, -1)}
        >
          <Text style={[styles.choiceText, text]}>Nessuno: usa "{item.spoken}" senza prezzo</Text>
        </TouchableOpacity>
      </ScrollView>
      <TouchableOpacity style={[styles.bigButton, styles.secondary, { borderColor: colors.border }]} onPress={() => setChoosingItem(null)}>
        <View style={styles.iconRow}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
          <Text style={[styles.secondaryText, text]}>Indietro</Text>
        </View>
      </TouchableOpacity>
    </>
  );

  const renderConferma = () => (
    <>
      <View style={[styles.targetBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.targetLabel, muted]}>Aggiungo a</Text>
          <Text style={[styles.targetText, text]} numberOfLines={2}>
            {cliente?.name || '—'} · {lavoro?.title || '—'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.changeButton, { borderColor: colors.primary }]}
          onPress={() => setStep(cliente ? 'lavoro' : 'cliente')}
          accessibilityLabel="Cambia cliente o lavoro"
        >
          <Text style={[styles.changeText, { color: colors.primaryStrong }]}>Cambia</Text>
        </TouchableOpacity>
      </View>

      {transcript ? <Text style={[styles.transcript, muted]} numberOfLines={3}>"{transcript}"</Text> : null}

      <ScrollView style={styles.list}>
        {items.length === 0 ? (
          <Text style={[styles.empty, muted]}>Nessuna voce da aggiungere</Text>
        ) : (
          items.map((item) => {
            const match = item.matches[item.choice];
            const unit = item.unit || match?.unit || null;
            return (
              <View key={item.key} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  disabled={item.matches.length === 0}
                  onPress={() => setChoosingItem(item.key)}
                  accessibilityHint="Scegli un altro articolo del listino"
                >
                  <Text style={[styles.itemTitle, text]} numberOfLines={3}>{match?.description || item.spoken}</Text>
                  {match || draftItemOwnPrice(item) !== null ? (
                    <Text style={[styles.itemPrice, { color: colors.primaryStrong }]}>
                      {money(draftItemPrice(item, defaultMarkup) ?? 0)}
                      {unit ? ` / ${unit}` : ''}
                    </Text>
                  ) : (
                    <View style={styles.warningRow}>
                      <Ionicons name="alert-circle-outline" size={20} color={colors.warningText} style={styles.warningIcon} />
                      <Text style={[styles.warning, styles.flexText, { color: colors.warningText }]}>
                      {item.matches.some((candidate) => candidate.fullMatch)
                        ? 'Più articoli possibili: scegli quello giusto'
                        : item.matches.length
                          ? 'Non trovato uguale nel listino'
                          : 'Non trovato nel listino: prezzo da inserire'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                {/* Big enough for gloves: choosing another article is a real button. */}
                {item.matches.length > 1 || (!match && item.matches.length > 0) ? (
                  <TouchableOpacity
                    style={[styles.otherMatchesButton, { borderColor: colors.primary }]}
                    onPress={() => setChoosingItem(item.key)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.otherMatches, { color: colors.primaryText }]}>
                      {match
                        ? `Scegli un altro articolo (${item.matches.length})`
                        : item.matches.some((candidate) => candidate.fullMatch)
                          ? `Scegli l'articolo (${item.matches.length})`
                          : `Vedi ${item.matches.length === 1 ? '1 articolo simile' : `${item.matches.length} articoli simili`}`}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {!match || item.priceText ? (
                  <TextInput
                    value={item.priceText}
                    onChangeText={(value) => changePrice(item.key, value)}
                    keyboardType="decimal-pad"
                    placeholder="Prezzo in € per unità"
                    placeholderTextColor={colors.textTertiary}
                    accessibilityLabel="Prezzo per unità"
                    style={[styles.search, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                  />
                ) : null}
                {item.quantity === null ? (
                  <View style={styles.warningRow}>
                    <Ionicons name="alert-circle-outline" size={20} color={colors.warningText} style={styles.warningIcon} />
                    <Text style={[styles.warning, styles.flexText, { color: colors.warningText }]}>Quantità da confermare: usa i tasti − e ＋</Text>
                  </View>
                ) : null}
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={[styles.qtyButton, { backgroundColor: colors.surfaceSecondary }]}
                    onPress={() => changeQuantity(item.key, unit && QUANTITY_STEP_UNITS.has(unit.toLowerCase()) && (item.quantity ?? 0) <= 1 ? -0.5 : -1)}
                    accessibilityLabel="Diminuisci quantità"
                  >
                    <Ionicons name="remove" size={32} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyText, text]}>{item.quantity === null ? 'quantità da confermare' : formatQuantity(item.quantity, unit)}</Text>
                  <TouchableOpacity
                    style={[styles.qtyButton, { backgroundColor: colors.surfaceSecondary }]}
                    onPress={() => changeQuantity(item.key, 1)}
                    accessibilityLabel="Aumenta quantità"
                  >
                    <Ionicons name="add" size={32} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.removeButton, { backgroundColor: colors.dangerBg }]}
                    onPress={() => removeItem(item.key)}
                    accessibilityLabel="Togli questa voce"
                  >
                    <Text style={[styles.removeText, { color: colors.dangerBgText }]}>Togli</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.bigButton, styles.confirm, { backgroundColor: colors.primary }, !canConfirm && styles.disabled]}
        onPress={() => lavoro && canConfirm && onConfirm(lavoro)}
        disabled={!canConfirm}
      >
        {saving ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <View style={styles.iconRow}>
            {missingQuantity ? null : <Ionicons name="checkmark" size={28} color={colors.onPrimary} />}
            <Text style={[styles.bigButtonText, { color: colors.onPrimary }]}>
              {missingQuantity
                ? 'Conferma le quantità'
                : `Aggiungi ${items.length === 1 ? '1 voce' : `${items.length} voci`}`}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.modalBg }]}>
          {itemBeingChosen
            ? renderChooseMatch(itemBeingChosen)
            : step === 'cliente'
              ? renderCliente()
              : step === 'lavoro'
                ? renderLavoro()
                : renderConferma()}
          <TouchableOpacity style={[styles.bigButton, styles.secondary, { borderColor: colors.border }]} onPress={onCancel} disabled={saving}>
            <Text style={[styles.secondaryText, text]}>Annulla</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Sized for gloves and dirty hands: every touch target is at least 64 points tall.
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, gap: 12 },
  header: { gap: 4 },
  stepTitle: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 18 },
  search: { minHeight: 64, borderWidth: 2, borderRadius: 16, paddingHorizontal: 18, fontSize: 20 },
  list: { flexGrow: 0, maxHeight: 420 },
  empty: { fontSize: 18, paddingVertical: 24, textAlign: 'center' },
  choice: { minHeight: 72, borderWidth: 2, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, justifyContent: 'center', marginBottom: 10 },
  choiceSelected: { borderWidth: 3 },
  newChoice: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  choiceText: { fontSize: 22, fontWeight: '700' },
  newJobBox: { gap: 10 },
  bigButton: { minHeight: 68, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  // Colori dal tema (lotto 4): "Aggiungi" è arancio come ogni azione principale, mai verde.
  confirm: { minHeight: 76 },
  secondary: { borderWidth: 2, backgroundColor: 'transparent', minHeight: 64 },
  disabled: { opacity: 0.45 },
  bigButtonText: { fontSize: 22, fontWeight: '800' },
  iconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconRowStart: { justifyContent: 'flex-start' },
  flexText: { flexShrink: 1 },
  secondaryText: { fontSize: 20, fontWeight: '700' },
  targetBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: 16, padding: 14 },
  targetLabel: { fontSize: 16, fontWeight: '600' },
  targetText: { fontSize: 22, fontWeight: '800' },
  changeButton: { minHeight: 64, minWidth: 100, borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  changeText: { fontSize: 19, fontWeight: '800' },
  transcript: { fontSize: 16, fontStyle: 'italic' },
  itemCard: { borderWidth: 2, borderRadius: 16, padding: 14, marginBottom: 10, gap: 10 },
  itemTitle: { fontSize: 20, fontWeight: '700' },
  itemPrice: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  warning: { fontSize: 17, fontWeight: '700' },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  warningIcon: { marginTop: 2 },
  otherMatchesButton: { minHeight: 60, borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  otherMatches: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyButton: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  qtyText: { flex: 1, textAlign: 'center', fontSize: 22, fontWeight: '800' },
  removeButton: { height: 64, minWidth: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  removeText: { fontSize: 18, fontWeight: '800' },
});
