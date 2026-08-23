import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim()]));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
// Try signing in - capture the exact error
const { data, error } = await supabase.auth.signInWithPassword({ email: process.argv[2], password: process.argv[3] });
console.log('error:', error?.status, error?.code ?? '', error?.message);
if (data.user) console.log('signed in as', data.user.id, 'confirmed:', data.user.email_confirmed_at != null);
