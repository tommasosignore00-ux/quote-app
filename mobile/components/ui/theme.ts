/**
 * Caratteri, spazi, raggi e ombre (spec 1.4-1.7). I colori stanno in lib/darkMode.ts.
 *
 * Caratteri: la spec chiede Archivo e Source Sans 3, ma i pacchetti
 * @expo-google-fonts non sono installati. Finché non lo sono, si usa il carattere
 * di sistema con il peso indicato (fontWeight). Quando i pacchetti ci saranno,
 * basta riempire FONT_FAMILY e togliere fontWeight dagli stili (il peso sta nel nome).
 */
import type { TextStyle } from 'react-native';

export const FONT_FAMILY = {
  display: undefined as string | undefined, // 'Archivo_800ExtraBold'
  heading: undefined as string | undefined, // 'Archivo_700Bold'
  body: undefined as string | undefined, // 'SourceSans3_400Regular'
  bodySemi: undefined as string | undefined, // 'SourceSans3_600SemiBold'
  bodyBold: undefined as string | undefined, // 'SourceSans3_700Bold'
};

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/** Scala "Cantiere": Lavori, dettaglio lavoro, foglio voce, popup, Preventivi, microfono. */
export const cantiere = {
  display: { fontFamily: FONT_FAMILY.display, fontWeight: '800', fontSize: 28, lineHeight: 34 },
  title: { fontFamily: FONT_FAMILY.heading, fontWeight: '700', fontSize: 22, lineHeight: 28 },
  titleSm: { fontFamily: FONT_FAMILY.heading, fontWeight: '700', fontSize: 20, lineHeight: 26 },
  timer: { fontFamily: FONT_FAMILY.display, fontWeight: '800', fontSize: 22, lineHeight: 28, fontVariant: tabular },
  bodyLg: { fontFamily: FONT_FAMILY.bodySemi, fontWeight: '600', fontSize: 20, lineHeight: 26 },
  body: { fontFamily: FONT_FAMILY.body, fontWeight: '400', fontSize: 18, lineHeight: 24 },
  meta: { fontFamily: FONT_FAMILY.bodySemi, fontWeight: '600', fontSize: 16, lineHeight: 22 },
  price: { fontFamily: FONT_FAMILY.heading, fontWeight: '700', fontSize: 20, lineHeight: 26, fontVariant: tabular },
  priceUnit: { fontFamily: FONT_FAMILY.bodySemi, fontWeight: '600', fontSize: 16, lineHeight: 22, fontVariant: tabular },
} satisfies Record<string, TextStyle>;

/** Scala "Ufficio": Listini, Profilo, Abbonamento, Accesso, Primo avvio. */
export const ufficio = {
  display: { fontFamily: FONT_FAMILY.display, fontWeight: '800', fontSize: 24, lineHeight: 30 },
  title: { fontFamily: FONT_FAMILY.heading, fontWeight: '700', fontSize: 20, lineHeight: 26 },
  row: { fontFamily: FONT_FAMILY.bodySemi, fontWeight: '600', fontSize: 18, lineHeight: 24 },
  body: { fontFamily: FONT_FAMILY.body, fontWeight: '400', fontSize: 18, lineHeight: 24 },
  label: { fontFamily: FONT_FAMILY.bodySemi, fontWeight: '600', fontSize: 16, lineHeight: 22 },
  price: { fontFamily: FONT_FAMILY.heading, fontWeight: '700', fontSize: 18, lineHeight: 24, fontVariant: tabular },
} satisfies Record<string, TextStyle>;

/** Base 4. Margine laterale di ogni schermata: s4 (16). */
export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32, s7: 48 } as const;

export const radius = { control: 12, sheet: 20, pill: 999 } as const;

/** Misure minime dei tocchi (guanti). */
export const touch = { primary: 64, primaryOffice: 56, secondary: 48 } as const;

/** Ombre minime; in tema scuro niente ombre (usare colors.shadow = 'transparent'). */
export const shadows = {
  mic: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 },
  sheet: { shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
} as const;
