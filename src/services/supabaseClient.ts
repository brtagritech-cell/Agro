import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_STORAGE_URL_KEY = 'agrosync_supabase_url';
export const SUPABASE_STORAGE_KEY_KEY = 'agrosync_supabase_anon_key';

// Default Supabase project credentials for AgroSync
export const DEFAULT_SUPABASE_URL = 'https://msbhppvwxdxfbassfsry.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_f6628KvU2-5eA8M5J_JC5A_4c1wcCuk';

export function getSupabaseCredentials(): { url: string; anonKey: string; isCustom: boolean } {
  const storedUrl = (localStorage.getItem(SUPABASE_STORAGE_URL_KEY) || '').trim();
  const storedKey = (localStorage.getItem(SUPABASE_STORAGE_KEY_KEY) || '').trim();
  
  if (storedUrl && storedKey) {
    return { url: storedUrl, anonKey: storedKey, isCustom: true };
  }

  const envUrl = ((import.meta.env.VITE_SUPABASE_URL as string) || '').trim();
  const envKey = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '').trim();

  const finalUrl = storedUrl || envUrl || DEFAULT_SUPABASE_URL;
  const finalKey = storedKey || envKey || DEFAULT_SUPABASE_ANON_KEY;

  return {
    url: finalUrl,
    anonKey: finalKey,
    isCustom: !!(storedUrl || storedKey)
  };
}

export function saveSupabaseCredentials(url: string, anonKey: string): void {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();
  
  if (cleanUrl) {
    localStorage.setItem(SUPABASE_STORAGE_URL_KEY, cleanUrl);
  } else {
    localStorage.removeItem(SUPABASE_STORAGE_URL_KEY);
  }

  if (cleanKey) {
    localStorage.setItem(SUPABASE_STORAGE_KEY_KEY, cleanKey);
  } else {
    localStorage.removeItem(SUPABASE_STORAGE_KEY_KEY);
  }

  recreateClient();
}

export function clearSupabaseCredentials(): void {
  localStorage.removeItem(SUPABASE_STORAGE_URL_KEY);
  localStorage.removeItem(SUPABASE_STORAGE_KEY_KEY);
  recreateClient();
}

let activeClient: SupabaseClient | null = null;

function recreateClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseCredentials();
  if (url && anonKey) {
    activeClient = createClient(url, anonKey);
  } else {
    activeClient = createClient('https://placeholder-url.supabase.co', 'placeholder-key');
  }
  return activeClient;
}

export function getActiveSupabaseClient(): SupabaseClient {
  if (!activeClient) {
    activeClient = recreateClient();
  }
  return activeClient;
}

// Transparent Proxy so all existing calls to supabase.from(...) work seamlessly
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getActiveSupabaseClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

// Test connection function
export async function testSupabaseConnection(testUrl: string, testKey: string): Promise<{ success: boolean; message: string }> {
  const cleanUrl = testUrl.trim();
  const cleanKey = testKey.trim();

  if (!cleanUrl || !cleanKey) {
    return { success: false, message: 'Please enter both the Supabase Project URL and Anon API Key.' };
  }

  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    return { success: false, message: 'Invalid URL. Project URL must start with https:// or http://' };
  }

  try {
    const client = createClient(cleanUrl, cleanKey);
    
    // 1. Check tenants table
    const { error: tenantsError } = await client.from('tenants').select('sub_url', { count: 'exact', head: true }).limit(1);
    
    // 2. Check transactions table
    const { error: txError } = await client.from('transactions').select('transaction_id', { count: 'exact', head: true }).limit(1);

    if (tenantsError?.code === '42P01' || txError?.code === '42P01') {
      return { 
        success: false, 
        message: 'Connected to Supabase, but the "tenants" or "transactions" table is missing! Please click "Copy SQL" below and run it in Supabase SQL Editor.' 
      };
    }

    if (tenantsError?.code === '42501' || txError?.code === '42501') {
      return {
        success: false,
        message: 'Connected to Supabase, but Row Level Security (RLS) blocked access! Please run the RLS policies in SQL Editor.'
      };
    }

    if (tenantsError) {
      return { success: false, message: `Supabase Error (${tenantsError.code || 'API'}): ${tenantsError.message}` };
    }

    if (txError) {
      return { success: false, message: `Supabase Error (${txError.code || 'API'}): ${txError.message}` };
    }

    return { success: true, message: 'Connected successfully! Database tables and permissions are verified.' };
  } catch (err: any) {
    return { success: false, message: `Connection failed: ${err?.message || 'Could not connect to Supabase.'}` };
  }
}
