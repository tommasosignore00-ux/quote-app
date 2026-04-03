import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
	console.error(
		'[supabase.ts] Missing Supabase config: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
		'All Supabase calls will fail until these are configured.'
	);
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
