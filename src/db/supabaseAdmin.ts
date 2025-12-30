import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY not found. Admin features (like public unsubscribe) may fail.');
}

// Admin client with Service Role Key (Bypasses RLS)
// We trim() the key to remove any accidental newlines copying from dashboard/env
export const supabaseAdmin = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    (supabaseServiceKey || 'placeholder').trim(),
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);
