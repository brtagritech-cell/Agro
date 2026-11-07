import React, { useState } from 'react';
import { 
  Zap, 
  X, 
  Check, 
  Copy, 
  ExternalLink, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import { 
  getSupabaseCredentials, 
  saveSupabaseCredentials, 
  clearSupabaseCredentials, 
  testSupabaseConnection 
} from '../services/supabaseClient';
import { syncAllToSupabase } from '../services/sheetService';

interface SupabaseConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

const SUPABASE_SETUP_SQL = `-- 1. Create 'tenants' table for branch configurations
CREATE TABLE IF NOT EXISTS public.tenants (
  sub_url TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_password TEXT NOT NULL,
  sub_users JSONB DEFAULT '[]'::jsonb,
  sub_user_passwords JSONB DEFAULT '{}'::jsonb,
  marks JSONB DEFAULT '[]'::jsonb,
  agents JSONB DEFAULT '[]'::jsonb,
  full_link TEXT DEFAULT ''
);

-- 2. Create 'transactions' table for ledger entries
CREATE TABLE IF NOT EXISTS public.transactions (
  transaction_id TEXT PRIMARY KEY,
  timestamp TEXT,
  date TEXT,
  lot TEXT,
  bags NUMERIC,
  rate NUMERIC,
  sub_user_rate NUMERIC,
  total_value NUMERIC,
  agent TEXT,
  mark TEXT,
  weight TEXT,
  rate_reason TEXT,
  locked_by TEXT,
  sub_url TEXT,
  sub_user_name TEXT,
  sub_user_timestamp TEXT,
  gross_weight NUMERIC,
  bags_weight NUMERIC,
  net_weight NUMERIC,
  calculated_amount NUMERIC
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 4. Create policies to allow public read & write through the Anon Key (re-runnable)
DROP POLICY IF EXISTS "Allow public read/write on tenants" ON public.tenants;
CREATE POLICY "Allow public read/write on tenants" 
  ON public.tenants FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on transactions" ON public.transactions;
CREATE POLICY "Allow public read/write on transactions" 
  ON public.transactions FOR ALL USING (true) WITH CHECK (true);

-- 5. Seed default tenants for AgroSync (/Spicelink/, /Agro/, /BRT/)
INSERT INTO public.tenants (
  sub_url, owner_id, owner_password, sub_users, sub_user_passwords, marks, agents, full_link
) VALUES 
(
  '/Spicelink/',
  'Spicelink',
  '1234',
  '["Ramesh", "Suresh", "Patel", "BVB"]'::jsonb,
  '{"Ramesh": "1234", "Suresh": "1234", "Patel": "1234", "BVB": "1234"}'::jsonb,
  '["Spicelink", "Agro", "BRT", "RS", "TS", "DV", "BVB"]'::jsonb,
  '["Ramesh Kumar", "Suresh & Sons", "Patel Agro", "BVB Agencies"]'::jsonb,
  ''
),
(
  '/Agro/',
  'Agro',
  '1234',
  '["Ramesh", "Suresh", "Patel", "BVB"]'::jsonb,
  '{"Ramesh": "1234", "Suresh": "1234", "Patel": "1234", "BVB": "1234"}'::jsonb,
  '["Spicelink", "Agro", "BRT", "RS", "TS", "DV", "BVB"]'::jsonb,
  '["Ramesh Kumar", "Suresh & Sons", "Patel Agro", "BVB Agencies"]'::jsonb,
  ''
),
(
  '/BRT/',
  'BRT',
  '1234',
  '["Ramesh", "Suresh", "Patel", "BVB"]'::jsonb,
  '{"Ramesh": "1234", "Suresh": "1234", "Patel": "1234", "BVB": "1234"}'::jsonb,
  '["Spicelink", "Agro", "BRT", "RS", "TS", "DV", "BVB"]'::jsonb,
  '["Ramesh Kumar", "Suresh & Sons", "Patel Agro", "BVB Agencies"]'::jsonb,
  ''
)
ON CONFLICT (sub_url) DO UPDATE SET
  owner_id = EXCLUDED.owner_id,
  owner_password = EXCLUDED.owner_password;

`;

export const SupabaseConnectModal: React.FC<SupabaseConnectModalProps> = ({ isOpen, onClose, onConnected }) => {
  const currentCreds = getSupabaseCredentials();
  const [url, setUrl] = useState(currentCreds.url);
  const [anonKey, setAnonKey] = useState(currentCreds.anonKey);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSQL, setCopiedSQL] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleCopySQL = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
      setCopiedSQL(true);
      setTimeout(() => setCopiedSQL(false), 2500);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = SUPABASE_SETUP_SQL;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedSQL(true);
      setTimeout(() => setCopiedSQL(false), 2500);
    }
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    setSavedSuccess(false);
    setIsTesting(true);

    const res = await testSupabaseConnection(url, anonKey);
    setIsTesting(false);
    setTestResult(res);
  };

  const handleSyncNow = async () => {
    setTestResult(null);
    setSavedSuccess(false);
    setIsSyncing(true);

    // Save credentials first to make sure client is using current inputs
    saveSupabaseCredentials(url, anonKey);
    const res = await syncAllToSupabase();
    setIsSyncing(false);
    setTestResult({
      success: res.success,
      message: res.message
    });

    if (res.success) {
      onConnected?.();
    }
  };

  const handleSave = () => {
    saveSupabaseCredentials(url, anonKey);
    setSavedSuccess(true);
    setTestResult(null);

    setTimeout(() => {
      onConnected?.();
      onClose();
    }, 800);
  };

  const handleReset = () => {
    if (window.confirm('Reset database connection to defaults?')) {
      clearSupabaseCredentials();
      const resetCreds = getSupabaseCredentials();
      setUrl(resetCreds.url);
      setAnonKey(resetCreds.anonKey);
      setTestResult({ success: true, message: 'Reset to default environment configuration.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in overflow-y-auto">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="w-full max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 p-5 sm:p-7 space-y-5 z-10 animate-slide-up max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain relative">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 leading-tight flex items-center gap-2">
                Cloud Database Connection
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Sync live data directly with Supabase Database
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab selection like in user's screenshot */}
        <div className="flex items-center gap-2 border-b border-slate-100 pb-1">
          <button 
            type="button" 
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200/60"
          >
            <Zap className="h-3.5 w-3.5 text-emerald-600" />
            <span>Supabase (Recommended)</span>
          </button>
          <a 
            href="https://supabase.com/dashboard" 
            target="_blank" 
            rel="noreferrer"
            className="ml-auto text-[11px] font-semibold text-slate-500 hover:text-emerald-700 flex items-center gap-1 transition-all"
          >
            <span>Supabase Dashboard</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Inputs */}
        <div className="space-y-4">
          {/* Project URL */}
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Supabase Project URL <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value.trim())}
              placeholder="https://xxxxxxxxxxxx.supabase.co"
              className="w-full px-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 text-xs sm:text-sm font-mono text-slate-800 transition-all"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Found in Supabase Dashboard → Project Settings → API → Project URL
            </p>
          </div>

          {/* Anon Public Key */}
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Supabase Anon Public API Key <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value.trim())}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... or sb_publishable_..."
                className="w-full pl-3.5 pr-10 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 text-xs sm:text-sm font-mono text-slate-800 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-all"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Found in Supabase Dashboard → Project Settings → API → anon / public
            </p>
          </div>
        </div>

        {/* Quick Setup Card (Matching user screenshot) */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-50/60 border border-emerald-150 text-slate-700 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs sm:text-[13px]">
              📋 Supabase Quick Setup (2 Minutes):
            </span>
            <button
              type="button"
              onClick={handleCopySQL}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                copiedSQL 
                  ? 'bg-emerald-600 text-white border-emerald-600' 
                  : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-100/50'
              }`}
            >
              {copiedSQL ? (
                <>
                  <Check className="h-3 w-3" />
                  <span>Copied SQL!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy SQL</span>
                </>
              )}
            </button>
          </div>
          <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-600 leading-relaxed">
            <li>Create a free project on <strong>supabase.com</strong>.</li>
            <li>Go to <strong>SQL Editor</strong>, paste the copied SQL script, and click <strong>Run</strong>.</li>
            <li>Copy your <strong>Project URL</strong> and <strong>anon key</strong> into the fields above and click <strong>Test Connection</strong>.</li>
          </ol>
        </div>

        {/* Feedback Alert */}
        {testResult && (
          <div className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs font-semibold animate-fade-in ${
            testResult.success 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {testResult.success ? (
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span className="leading-snug">{testResult.message}</span>
          </div>
        )}

        {savedSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Credentials saved! Connecting to live Supabase database...</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || isSyncing || !url || !anonKey}
              className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-xl border border-emerald-200/80 transition-all text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Test Connection</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing || isTesting || !url || !anonKey}
              className="px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold rounded-xl border border-blue-200/80 transition-all text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              title="Upload existing local transactions directly to Supabase"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 text-blue-600" />
                  <span>Sync Now</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleReset}
              title="Reset to defaults"
              className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all text-xs text-center"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!url || !anonKey}
              className="w-1/2 sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 text-xs text-center disabled:opacity-50"
            >
              Save & Connect
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
