import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import { useTheme } from '../lib/darkMode';
import {
  BrandMark,
  PrimaryButton,
  SecondaryButton,
  TertiaryButton,
  TextField,
  cantiere,
  formatMoney,
  formatUnitPrice,
  radius,
  space,
  ufficio,
} from '../components/ui';

const STEPS = ['company', 'voice', 'listino'] as const;

/** Example price list rows (shown with the "Esempio" ribbon, never saved). */
const SAMPLE_LIST = [
  { description: 'Trave IPE 120 S275JR', price: 23.4, unit: 'm' },
  { description: 'Lamiera striata 3 mm', price: 41.9, unit: 'm²' },
  { description: 'Tubolare 40×40×3', price: 9.8, unit: 'm' },
  { description: 'Piastra di base 200×200×10', price: 14.5, unit: 'pz' },
  { description: 'Tassello chimico M12', price: 3.2, unit: 'pz' },
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('');

  const finishOnboarding = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));
      const updates: Record<string, any> = { onboarding_completed: true };
      if (companyName.trim()) updates.company_name = companyName.trim();
      await supabase.from('profiles').update(updates).eq('id', user.id);
      (navigation as any).reset({ index: 0, routes: [{ name: 'Dashboard' }] });
    } catch (err: unknown) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const ribbon = (
    <View style={[styles.ribbon, { backgroundColor: colors.primary }]}>
      <Text style={[styles.ribbonText, { color: colors.onPrimary }]}>Esempio</Text>
    </View>
  );

  const current = STEPS[step];
  const titles = { company: 'La tua azienda', voice: 'Parli, e la voce va nel lavoro', listino: 'I prezzi sono i tuoi' };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.top}>
        <TertiaryButton label="Salta" onPress={finishOnboarding} disabled={loading} accessibilityHint="Entra subito nell'app" />
      </View>
      <View style={styles.progressWrap}>
        <Text style={[ufficio.label, { color: colors.textSecondary }]}>Passo {step + 1} di {STEPS.length}</Text>
        <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {STEPS.map((key, i) => (
            <View
              key={key}
              style={[styles.segment, { backgroundColor: i < step ? colors.text : i === step ? colors.primary : colors.border }]}
            />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[ufficio.display, { color: colors.text, marginBottom: space.s4 }]} accessibilityRole="header">{titles[current]}</Text>

        {current === 'company' ? (
          <>
            <TextField
              label="Nome dell'azienda"
              placeholder="Es. Carpenteria Rossi s.r.l."
              value={companyName}
              onChangeText={setCompanyName}
              help="Il resto lo completi dal Profilo, quando vuoi."
            />
            <View style={{ alignItems: 'center', marginTop: space.s5 }}>
              <BrandMark size={64} />
            </View>
          </>
        ) : null}

        {current === 'voice' ? (
          <>
            <Text style={[ufficio.body, styles.quote, { color: colors.text }]}>«Sei metri di trave IPE 120»</Text>
            <View style={[styles.sample, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel="Esempio del foglio di conferma: Trave IPE 120 S275JR, 6 metri, 23,40 euro al metro">
              {ribbon}
              <Text style={[cantiere.meta, { color: colors.textSecondary }]}>Hai detto: «sei metri di trave IPE 120»</Text>
              <View style={[styles.sampleRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[cantiere.titleSm, { color: colors.text }]}>Trave IPE 120 S275JR</Text>
                  <Text style={[cantiere.priceUnit, { color: colors.primaryStrong }]}>6 m × {formatUnitPrice(23.4, 'm')}</Text>
                </View>
                <Text style={[cantiere.price, { color: colors.text }]}>{formatMoney(140.4)}</Text>
              </View>
              <View style={[styles.sampleButton, { backgroundColor: colors.primary }]}>
                <Ionicons name="checkmark" size={24} color={colors.onPrimary} />
                <Text style={[cantiere.titleSm, { color: colors.onPrimary }]}>Aggiungi 1 voce</Text>
              </View>
            </View>
            <Text style={[ufficio.body, { color: colors.text, marginTop: space.s4 }]}>
              Tocca il microfono e di' cosa aggiungere. Prima di salvare controlli sempre le voci. Senza rete la registrazione resta salvata e parte da sola.
            </Text>
          </>
        ) : null}

        {current === 'listino' ? (
          <>
            <View style={[styles.sample, { backgroundColor: colors.surface, borderColor: colors.border, paddingHorizontal: 0, paddingVertical: 0 }]}>
              {ribbon}
              <View style={{ height: 32 }} />
              {SAMPLE_LIST.map((row, i) => (
                <View key={row.description} style={[styles.listRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Text style={[ufficio.label, { color: colors.text, flex: 1 }]} numberOfLines={1}>{row.description}</Text>
                  <Text style={[ufficio.label, { color: colors.text, fontVariant: ['tabular-nums'] }]}>{formatUnitPrice(row.price, row.unit)}</Text>
                </View>
              ))}
            </View>
            <Text style={[ufficio.body, { color: colors.text, marginTop: space.s4 }]}>
              Carica una volta il listino del grossista: PDF, Excel o METEL. Dal computer è più comodo, nella sezione Listini.
            </Text>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: space.s4 + insets.bottom, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        {step > 0 ? <SecondaryButton label="Indietro" icon="chevron-back" scale="ufficio" style={{ flex: 1 }} onPress={() => setStep(step - 1)} /> : null}
        {step < STEPS.length - 1 ? (
          <PrimaryButton
            label={t('onboarding.next') || 'Avanti'}
            scale="ufficio"
            style={{ flex: 1 }}
            disabled={current === 'company' && !companyName.trim()}
            onPress={() => setStep(step + 1)}
          />
        ) : (
          <PrimaryButton label={t('onboarding.start') || 'Inizia'} scale="ufficio" style={{ flex: 1 }} onPress={finishOnboarding} loading={loading} loadingLabel="Un attimo…" />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.s4 },
  progressWrap: { paddingHorizontal: space.s4, gap: space.s2 },
  progress: { flexDirection: 'row', gap: space.s2 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  scroll: { padding: space.s4, paddingTop: space.s5 },
  quote: { fontStyle: 'italic', marginBottom: space.s3 },
  sample: { borderWidth: 1, borderRadius: radius.control, padding: space.s4, gap: space.s3, overflow: 'hidden' },
  sampleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3, borderTopWidth: 1, paddingTop: space.s3 },
  sampleButton: { minHeight: 64, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3, minHeight: 48, paddingHorizontal: space.s4 },
  ribbon: { position: 'absolute', top: 0, right: 0, paddingVertical: 4, paddingHorizontal: 10, borderBottomLeftRadius: 6, zIndex: 1 },
  ribbonText: { fontSize: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: space.s3, paddingHorizontal: space.s4, paddingTop: space.s3, borderTopWidth: 1 },
});
