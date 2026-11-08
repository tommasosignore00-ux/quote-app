import React, { useEffect, useState } from 'react';
import { Alert, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

  const button = { minHeight: 64, justifyContent: 'center' as const, alignItems: 'center' as const, borderRadius: 12, backgroundColor: colors.primary, marginTop: 10 };

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Verifica in due passaggi</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 4 }}>Facoltativa: all'accesso ti chiederemo anche un codice dell'app di autenticazione.</Text>
      {enrollment ? (
        <View>
          <TouchableOpacity style={button} onPress={() => Linking.openURL(enrollment.uri).catch(() => {})} accessibilityRole="button">
            <Text style={{ color: '#fff', fontWeight: '700' }}>Apri l'app di autenticazione</Text>
          </TouchableOpacity>
          <Text selectable style={{ color: colors.text, marginTop: 10 }}>Oppure inserisci: {enrollment.secret}</Text>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={6}
            accessibilityLabel="Codice a 6 cifre"
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginTop: 10, color: colors.text, fontSize: 20, textAlign: 'center' }}
          />
          <TouchableOpacity style={[button, code.length !== 6 && { opacity: 0.5 }]} onPress={confirm} disabled={code.length !== 6} accessibilityRole="button">
            <Text style={{ color: '#fff', fontWeight: '700' }}>Conferma</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={factorId ? [button, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }] : button} onPress={factorId ? remove : start} accessibilityRole="button">
          <Text style={{ color: factorId ? colors.text : '#fff', fontWeight: '700' }}>{factorId ? 'Disattiva' : 'Attiva'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
