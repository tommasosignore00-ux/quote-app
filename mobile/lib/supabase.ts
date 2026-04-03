import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// In some local setups, Node (Expo CLI) may need an explicit CA bundle.
if (typeof global !== 'undefined' && (global as any).process && (global as any).process.env && (global as any).process.env.SUPABASE_CA_BUNDLE) {
	try {
		// Only attempt to set NODE_EXTRA_CA_CERTS when fs is available (development CLI)
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs');
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const https = require('https');
		const ca = fs.readFileSync((global as any).process.env.SUPABASE_CA_BUNDLE, 'utf-8');
		https.globalAgent.options = https.globalAgent.options || {};
		https.globalAgent.options.ca = ca;
		(global as any).process.env.NODE_EXTRA_CA_CERTS = (global as any).process.env.SUPABASE_CA_BUNDLE;
		// eslint-disable-next-line no-console
		console.info('Loaded SUPABASE_CA_BUNDLE for Expo CLI');
	} catch (e) {
		// eslint-disable-next-line no-console
		console.warn('Unable to apply SUPABASE_CA_BUNDLE for Expo CLI:', e);
	}
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
	console.warn('Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase: any = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;
