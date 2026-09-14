import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY — check mobile/.env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * The signed-in user's id, for stamping `user_id` on inserts.
 *
 * `getSession()` and deliberately not `getUser()`. `getUser()` makes a network
 * round trip to `/auth/v1/user` on every call, and every write in this app used
 * to call it before touching the database — which made it a silent failure
 * point rather than just a slow one. When that request hangs, the write is
 * never attempted, *nothing throws*, and the optimistic UI keeps showing water
 * or food that was never saved, until a reload quietly takes it away.
 *
 * That is not theoretical: it was reproduced on 2026-09-13 by stalling exactly
 * that request. Two taps of "+ 8 oz" moved the widget to 24 oz, sent no insert,
 * raised no error, and were gone on reload. It also explains a goal edit that
 * showed the new number and reverted.
 *
 * `getSession()` reads the stored session and only reaches the network when the
 * token genuinely needs refreshing, so the common path is local and a failure
 * is a thrown error the caller can roll back on.
 */
export async function requireUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Not signed in.');
  return userId;
}
