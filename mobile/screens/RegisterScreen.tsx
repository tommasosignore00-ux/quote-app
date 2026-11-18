import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getWebApiBaseUrl } from '../lib/webApi';
import { PrimaryButton, TertiaryButton, TextField, space, ufficio } from '../components/ui';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import { useTheme } from '../lib/darkMode';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Punto 27: GDPR consent
  const [gdprConsent, setGdprConsent] = useState(false);

  // Punto 35: Referral code from deep link
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    const parseReferral = async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          const match = url.match(/[?&]ref=([A-Za-z0-9-]+)/);
          if (match) setReferralCode(match[1]);
        }
      } catch {}
    };
    parseReferral();
    const sub = Linking.addEventListener('url', ({ url }) => {
      const match = url.match(/[?&]ref=([A-Za-z0-9-]+)/);
      if (match) setReferralCode(match[1]);
    });
    return () => sub.remove();
  }, []);

  const handleRegister = async () => {
    // Punto 27: Block registration without GDPR consent
    if (!gdprConsent) {
      Alert.alert('Consenso necessario', 'Devi accettare la privacy policy per registrarti.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('messages.error'), t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Read by the database signup trigger, which sets consent and referral.
          data: {
            gdpr_consent_version: '1.0',
            ...(referralCode ? { referral_code: referralCode } : {}),
          },
        },
      });
      if (authError) throw authError;
      if (authData.user) {
        Alert.alert(t('messages.success'), t('auth.registrationComplete'));
        (navigation as any).navigate('Login');
      }
    } catch (err: unknown) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // The privacy notice lives on the Mastrovoce website (same address the app uses for its web API).
  const privacyUrl = (() => {
    try {
      const base = getWebApiBaseUrl();
      return base ? `${base}/privacy` : null;
    } catch {
      return null;
    }
  })();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TextField label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="Es. mario.rossi@email.it" />
        <TextField label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
        <TextField label={t('auth.confirmPassword')} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry textContentType="newPassword" />

        {/* Punto 35: referral code captured from the link */}
        {referralCode ? (
          <Text style={[ufficio.label, { color: colors.textSecondary, marginBottom: space.s3 }]}>Codice invito: {referralCode}</Text>
        ) : null}

        {/* Punto 27: GDPR consent, a real checkbox */}
        <Pressable
          onPress={() => setGdprConsent(!gdprConsent)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: gdprConsent }}
          style={styles.checkRow}
        >
          <View style={[styles.checkBox, { borderColor: gdprConsent ? colors.primary : colors.inputBorder, backgroundColor: gdprConsent ? colors.primary : colors.inputBg }]}>
            {gdprConsent ? <Ionicons name="checkmark" size={20} color={colors.onPrimary} /> : null}
          </View>
          <Text style={[ufficio.label, { flex: 1, color: colors.text, fontWeight: '400' }]}>
            Accetto il trattamento dei dati personali (GDPR, Reg. UE 2016/679).
          </Text>
        </Pressable>
        {privacyUrl ? (
          <TertiaryButton label="Leggi l'informativa" icon="open-outline" accessibilityRole="link" onPress={() => Linking.openURL(privacyUrl)} style={{ alignSelf: 'flex-start', marginBottom: space.s3 }} />
        ) : (
          <Text style={[ufficio.label, { color: colors.textSecondary, fontWeight: '400', marginBottom: space.s3 }]}>L'informativa è sul sito Mastrovoce, nella pagina Privacy.</Text>
        )}

        <PrimaryButton label={t('auth.register')} onPress={handleRegister} loading={loading} loadingLabel="Registro…" />
        <TertiaryButton label="Hai già un account? Accedi" onPress={() => (navigation as any).navigate('Login')} style={{ alignSelf: 'center', marginTop: space.s3 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: space.s5, flexGrow: 1, justifyContent: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3, minHeight: 56, marginBottom: space.s1 },
  checkBox: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
