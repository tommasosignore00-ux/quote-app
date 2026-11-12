import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import { useTheme } from '../lib/darkMode';

const STEPS = [
  { key: 'welcome', icon: '👋' },
  { key: 'voice', icon: '🎤' },
  { key: 'csv', icon: '📁' },
  { key: 'listini', icon: '📋' },
  { key: 'preventivo', icon: '📄' },
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  // Interactive state for demo steps
  const [companyName, setCompanyName] = useState('');
  const [triedVoiceDemo, setTriedVoiceDemo] = useState(false);
  const [triedCsvDemo, setTriedCsvDemo] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (step + 1) / STEPS.length,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [step]);

  const content: Record<string, { title: string; desc: string; tips?: string[] }> = {
    welcome: {
      title: '🚀 Benvenuto in Mastrovoce!',
      desc: 'Imposta il nome della tua azienda per iniziare. Potrai completare il profilo in seguito.',
      tips: ['Ci vogliono meno di 2 minuti', 'Il resto lo completi dal Profilo'],
    },
    voice: {
      title: t('onboarding.voice'),
      desc: t('onboarding.voiceDesc'),
      tips: [
        'Prova: "Aggiungi tubo rame 22mm, 3 metri a 15 euro"',
        'Prima di salvare controlli sempre le voci',
        'Senza rete la registrazione resta salvata e parte appena torna la connessione',
      ],
    },
    csv: {
      title: 'Il tuo listino',
      desc: 'Carica i tuoi prezzi una volta: PDF del grossista, Excel o file METEL. Quando detti una voce, il prezzo arriva dal tuo listino.',
      tips: [
        'Più comodo da caricare dal computer, nella sezione Listini',
        'Trovi i materiali dettandoli a voce',
      ],
    },
    listini: { title: t('onboarding.listini'), desc: t('onboarding.listiniDesc') },
    preventivo: {
      title: t('onboarding.preventivo'),
      desc: t('onboarding.preventivoDesc'),
      tips: [
        'Controllo delle voci prima dell\'invio',
        'Il preventivo esce con il tuo modello e il tuo nome',
        'Il cliente lo accetta online dal link che riceve',
      ],
    },
  };

  const current = STEPS[step];
  const info = content[current.key];

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

  const renderInteractiveContent = () => {
    switch (current.key) {
      case 'welcome':
        return (
          <View style={styles.interactiveArea}>
            <TextInput
              style={styles.onboardingInput}
              placeholder="Es: Idraulica Rossi S.r.l."
              value={companyName}
              onChangeText={setCompanyName}
              placeholderTextColor="#64748b"
            />
            {companyName.trim().length > 0 && (
              <Text style={styles.checkmark}>✅ Perfetto!</Text>
            )}
          </View>
        );
      case 'voice':
        return (
          <View style={styles.interactiveArea}>
            <Animated.View style={{ transform: [{ scale: triedVoiceDemo ? 1 : pulseAnim }] }}>
              <TouchableOpacity
                style={[styles.demoBtn, triedVoiceDemo && styles.demoBtnDone]}
                onPress={() => {
                  setTriedVoiceDemo(true);
                  Alert.alert(
                    '🎤 Demo Comando Vocale',
                    '"Aggiungi tubo rame 22mm, 3 metri a 15 euro al metro"\n\n→ Materiale: Tubo rame 22mm\n→ Quantità: 3 m\n→ Prezzo: €15.00/m\n→ Totale: €45.00\n\nLa vera registrazione vocale funzionerà dalla Dashboard!'
                  );
                }}
              >
                <Text style={styles.demoBtnIcon}>🎤</Text>
                <Text style={styles.demoBtnText}>{triedVoiceDemo ? 'Provato! ✓' : 'Prova il demo'}</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        );
      case 'csv':
        return (
          <View style={styles.interactiveArea}>
            <Animated.View style={{ transform: [{ scale: triedCsvDemo ? 1 : pulseAnim }] }}>
              <TouchableOpacity
                style={[styles.demoBtn, triedCsvDemo && styles.demoBtnDone]}
                onPress={() => {
                  setTriedCsvDemo(true);
                  Alert.alert(
                    'Esempio di listino',
                    'Esempio file listino.csv:\n\n' +
                    'TRC22;Tubo rame 22mm;12.50\n' +
                    'RUB34;Rubinetto 3/4";28.90\n' +
                    'FLX16;Flessibile 16mm;8.75\n\n' +
                    '→ 3 articoli importati\n→ Pronti per la dettatura\n\nIl tuo listino vero lo carichi dalla sezione Listini.'
                  );
                }}
              >
                <Text style={styles.demoBtnIcon}>📊</Text>
                <Text style={styles.demoBtnText}>{triedCsvDemo ? 'Visto ✓' : 'Guarda un esempio'}</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        );
      default:
        return (
          <View style={styles.illustration}>
            <Text style={styles.illustrationIcon}>{current.icon}</Text>
          </View>
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.onboardingBg }]}>
      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <Animated.View style={[styles.progressBar, { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
      <Text style={[styles.progressText, { color: colors.textTertiary }]}>{step + 1} / {STEPS.length}</Text>

      <View style={[styles.card, { backgroundColor: colors.onboardingCard }]}>
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <TouchableOpacity key={s.key} onPress={() => setStep(i)} style={[styles.step, i === step && styles.stepActive, i < step && styles.stepDone]}>
              <Text style={styles.stepIcon}>{i < step ? '✓' : s.icon}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.title, { color: colors.onboardingText }]}>{info.title}</Text>
        <Text style={[styles.desc, { color: colors.onboardingTextSecondary }]}>{info.desc}</Text>

        {/* Tips */}
        {info.tips && (
          <View style={styles.tipsContainer}>
            {info.tips.map((tip, i) => (
              <Text key={i} style={[styles.tip, { color: colors.onboardingTextSecondary }]}>{tip}</Text>
            ))}
          </View>
        )}

        {/* Interactive content per step */}
        {renderInteractiveContent()}

        <View style={styles.buttons}>
          {step > 0 && (
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(step - 1)}>
              <Text style={styles.btnSecondaryText}>← Indietro</Text>
            </TouchableOpacity>
          )}
          {step < STEPS.length - 1 ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setStep(step + 1)}>
              <Text style={styles.btnText}>{t('onboarding.next')} →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btnPrimary, loading && styles.disabled]} onPress={finishOnboarding} disabled={loading}>
              <Text style={styles.btnText}>{loading ? t('buttons.loading') : t('onboarding.start')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24 },
  progressBarContainer: { width: '100%', maxWidth: 400, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 8 },
  progressBar: { height: '100%', backgroundColor: '#c2410c', borderRadius: 2 },
  progressText: { color: '#94a3b8', fontSize: 14, marginBottom: 16, alignSelf: 'center' },
  card: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 24 },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  stepActive: { backgroundColor: '#c2410c' },
  stepDone: { backgroundColor: '#059669' },
  stepIcon: { fontSize: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  desc: { fontSize: 16, color: '#cbd5e1', marginBottom: 16 },
  tipsContainer: { marginBottom: 16 },
  tip: { fontSize: 16, color: '#cbd5e1', marginBottom: 8, lineHeight: 22 },
  interactiveArea: { marginBottom: 24, alignItems: 'center' },
  onboardingInput: { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, width: '100%' },
  checkmark: { marginTop: 8, fontSize: 16, color: '#4ade80' },
  demoBtn: { backgroundColor: 'rgba(194,65,12,0.3)', borderWidth: 2, borderColor: '#c2410c', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center' },
  demoBtnDone: { backgroundColor: 'rgba(5,150,105,0.3)', borderColor: '#059669' },
  demoBtnIcon: { fontSize: 32, marginBottom: 8 },
  demoBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  illustration: { height: 120, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  illustrationIcon: { fontSize: 48 },
  buttons: { flexDirection: 'row', gap: 12 },
  btnPrimary: { flex: 1, backgroundColor: '#c2410c', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnSecondary: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnSecondaryText: { color: '#fff', fontSize: 16 },
  disabled: { opacity: 0.6 },
});
