import React, { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from './ui/PrimaryButton';
import SecondaryButton from './ui/SecondaryButton';
import TextField from './ui/TextField';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';

type Enrollment = { id: string; secret: string; uri: string };

/** Optional second factor with an authenticator app. */
export default function TwoFactorSettings() {
  const { colors } = useTheme();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');

  const load = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp?.[0]?.id ?? null);
  };

  useEffect(() => {
    load();
  }, []);

  const start = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Mastrovoce ${Date.now()}` });
    if (error || !data) {
      Alert.alert('Errore', 'Attivazione non riuscita');
      return;
    }
    setEnrollment({ id: data.id, secret: data.totp.secret, uri: data.totp.uri });
  };

  const confirm = async () => {
    if (!enrollment) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code });
    if (error) {
      Alert.alert('Errore', 'Codice non corretto');
      return;
    }
    setEnrollment(null);
    setCode('');
    load();
  };

  const remove = async () => {
    if (!factorId) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      Alert.alert('Errore', 'Operazione non riuscita');
      return;
    }
    setFactorId(null);
    await supabase.auth.refreshSession();
  };

  return (
    <View style={{ marginBottom: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="shield-checkmark-outline" size={24} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', flex: 1 }}>Accesso in due passaggi</Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 22 }}>Facoltativo: all'accesso ti chiederemo anche un codice dell'app di autenticazione.</Text>
      {enrollment ? (
        <View style={{ gap: 10 }}>
          <SecondaryButton label="Apri l'app di autenticazione" icon="open-outline" scale="ufficio" onPress={() => Linking.openURL(enrollment.uri).catch(() => {})} />
          <Text selectable style={{ color: colors.text, fontSize: 16 }}>Oppure inserisci: {enrollment.secret}</Text>
          <TextField
            label="Codice a 6 cifre"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={6}
            style={{ textAlign: 'center', fontSize: 22 }}
          />
          <PrimaryButton label="Conferma" scale="ufficio" onPress={confirm} disabled={code.length !== 6} />
        </View>
      ) : factorId ? (
        <SecondaryButton label="Disattiva" scale="ufficio" onPress={remove} accessibilityLabel="Disattiva l'accesso in due passaggi" />
      ) : (
        <SecondaryButton label="Attiva" scale="ufficio" onPress={start} accessibilityLabel="Attiva l'accesso in due passaggi" />
      )}
    </View>
  );
}
