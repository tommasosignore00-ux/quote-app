import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load web/.env.local
const envPath = path.resolve(new URL('.', import.meta.url).pathname, '../.env.local');
const envRaw = fs.readFileSync(envPath, 'utf8');
const vars = {};
for (const line of envRaw.split(/\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) vars[m[1]] = m[2];
}

const supabaseUrl = vars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = vars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing env in web/.env.local');
  process.exit(2);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const email = `test${Date.now()}@mailinator.com`;
const password = 'Password123!';

(async () => {
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    console.log('signup result:', { data, error });
  } catch (e) {
    console.error('signup failed', e);
    process.exitCode = 1;
  }
})();
