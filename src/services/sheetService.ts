import { supabase, getSupabaseCredentials } from './supabaseClient';

export interface Transaction {
  timestamp: string;
  transactionId: string;
  date: string;
  lot: string;
  bags: number;
  rate: number;
  subUserRate?: number;
  totalValue: number;
  agent: string;
  mark: string;
  weight: string;
  rateReason?: string;
  lockedBy?: string;
  subUrl?: string;
  subUserName?: string;
  subUserTimestamp?: string;
  grossWeight?: number;
  bagsWeight?: number;
  netWeight?: number;
  calculatedAmount?: number;
}

export interface TenantConfig {
  subUrl: string; // e.g. "/BRT/" or "/BRT/Test1/"
  companyName?: string; // Company / Business name (e.g. "BRT Spices", "AgroSync Logistics")
  sheetUrl: string; // Left for backwards compatibility
  ownerId: string; // Owner username
  ownerPassword: string; // Owner password
  subUsers: string[]; // Sub-user names
  subUserPasswords?: { [username: string]: any }; // Sub-user passwords and master data
  marks: string[]; // Allowed marks
  agents?: string[]; // Commission agents
  fullLink?: string; // Full sub URL link
  bagCost?: number;
  taram?: number;
}

const SCRIPT_URL_KEY = 'agrosync_script_url';
const TENANTS_STORAGE_KEY = 'agrosync_tenants_config';

const DEFAULT_TENANTS: TenantConfig[] = [
  {
    subUrl: '/BRT/',
    companyName: 'BRT Spices',
    sheetUrl: '',
    ownerId: 'BRT',
    ownerPassword: '1234',
    subUsers: ['Ramesh', 'Suresh', 'Patel', 'BVB'],
    subUserPasswords: { Ramesh: '1234', Suresh: '1234', Patel: '1234', BVB: '1234' },
    marks: ['BRT', 'RS', 'TS', 'DV', 'BVB'],
    agents: ['Ramesh Kumar', 'Suresh & Sons', 'Patel Agro', 'BVB Agencies'],
    fullLink: ''
  },
  {
    subUrl: '/Spicelink/',
    companyName: 'Spice Link',
    sheetUrl: '',
    ownerId: 'Spicelink',
    ownerPassword: '1234',
    subUsers: ['BRT', 'Ramesh', 'Suresh', 'Patel', 'BVB'],
    subUserPasswords: { BRT: '1234', Ramesh: '1234', Suresh: '1234', Patel: '1234', BVB: '1234' },
    marks: ['AGRO', 'BRT', 'RS', 'TS', 'DV', 'BVB'],
    agents: ['Ramesh Kumar', 'Suresh & Sons', 'Patel Agro', 'BVB Agencies'],
    fullLink: ''
  },
  {
    subUrl: '/Agro/',
    companyName: 'Agro Logistics',
    sheetUrl: '',
    ownerId: 'Agro',
    ownerPassword: '1234',
    subUsers: ['BRT', 'Ramesh', 'Suresh', 'Patel', 'BVB'],
    subUserPasswords: { BRT: '1234', Ramesh: '1234', Suresh: '1234', Patel: '1234', BVB: '1234' },
    marks: ['AGRO', 'BRT', 'RS', 'TS', 'DV', 'BVB'],
    agents: ['Ramesh Kumar', 'Suresh & Sons', 'Patel Agro', 'BVB Agencies'],
    fullLink: ''
  }
];

export function isSupabaseEnabled(): boolean {
  const { url, anonKey } = getSupabaseCredentials();
  return !!(url && anonKey);
}

export function isGoogleSheetsEnabled(): boolean {
  return isSupabaseEnabled();
}

export function getQueryParam(name: string): string | null {
  const searchParams = new URLSearchParams(window.location.search);
  let val = searchParams.get(name);
  if (val) return val;

  const hash = window.location.hash;
  if (hash.includes('?')) {
    const hashSearch = hash.split('?')[1];
    const hashParams = new URLSearchParams(hashSearch);
    val = hashParams.get(name);
    if (val) return val;
  }
  return null;
}

export function getCurrentSubUrl(): string {
  const siteParam = getQueryParam('site');
  if (siteParam) {
    return normalizeSubUrl(siteParam);
  }

  const hash = window.location.hash;
  if (hash && hash.startsWith('#/')) {
    const cleanHash = hash.substring(1).split('?')[0];
    return normalizeSubUrl(cleanHash);
  }

  const path = window.location.pathname;
  return normalizeSubUrl(path);
}

export function normalizeSubUrl(path: string): string {
  let clean = path.trim().split('?')[0];
  if (!clean.startsWith('/')) {
    clean = '/' + clean;
  }
  if (!clean.endsWith('/')) {
    clean = clean + '/';
  }
  return clean;
}

export function getTenants(): TenantConfig[] {
  const data = localStorage.getItem(TENANTS_STORAGE_KEY);
  let parsed: TenantConfig[];
  if (!data) {
    parsed = DEFAULT_TENANTS;
  } else {
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      parsed = DEFAULT_TENANTS;
    }
  }
  return parsed.map(t => {
    const subUserPasswords = t.subUserPasswords || {};
    const masterData = subUserPasswords._master_data || {};
    const bagCost = t.bagCost !== undefined ? t.bagCost : (masterData.bagCost !== undefined ? parseFloat(masterData.bagCost) : 25);
    const taram = t.taram !== undefined ? t.taram : (masterData.taram !== undefined ? parseFloat(masterData.taram) : 1.100);
    const companyName = t.companyName || masterData.companyName || '';
    return {
      ...t,
      companyName,
      bagCost,
      taram
    };
  });
}

export function getCurrentTenant(): TenantConfig {
  const currentSubUrl = getCurrentSubUrl();
  const normalizedCurrent = normalizeSubUrl(currentSubUrl).toLowerCase();
  
  if (normalizedCurrent === '/admin/') {
    const list = getTenants();
    return list[0] || DEFAULT_TENANTS[0];
  }
  
  const tenants = getTenants();

  // 1. Strict exact match on normalized subUrl
  const match = tenants.find(t => normalizeSubUrl(t.subUrl).toLowerCase() === normalizedCurrent);
  if (match) {
    return {
      ...match,
      subUrl: normalizeSubUrl(match.subUrl)
    };
  }

  // 2. Slug match (in case of /BRT/ vs BRT)
  const currentSlug = normalizedCurrent.replace(/\//g, '');
  const slugMatch = tenants.find(t => normalizeSubUrl(t.subUrl).replace(/\//g, '').toLowerCase() === currentSlug);
  if (slugMatch) {
    return {
      ...slugMatch,
      subUrl: normalizeSubUrl(slugMatch.subUrl)
    };
  }
  
  // 3. Fallback for custom unconfigured dynamic path: create an isolated dedicated tenant
  if (normalizedCurrent !== '/' && normalizedCurrent !== '/admin/') {
    const branchName = currentSlug.toUpperCase() || 'BRANCH';
    return {
      subUrl: normalizeSubUrl(currentSubUrl),
      sheetUrl: '',
      ownerId: branchName,
      ownerPassword: '1234',
      subUsers: [],
      subUserPasswords: {},
      marks: [branchName],
      agents: [],
      fullLink: `${window.location.origin}${window.location.pathname}#${normalizeSubUrl(currentSubUrl)}`,
      bagCost: 25,
      taram: 1.100
    };
  }

  return tenants[0] || DEFAULT_TENANTS[0];
}

export function getScriptUrl(): string {
  const localUrl = localStorage.getItem(SCRIPT_URL_KEY);
  if (localUrl) return localUrl;
  
  const tenant = getCurrentTenant();
  if (tenant && tenant.sheetUrl) {
    return tenant.sheetUrl;
  }
  
  return (import.meta.env.VITE_SCRIPT_URL as string) || '';
}

export function setScriptUrl(url: string): void {
  localStorage.setItem(SCRIPT_URL_KEY, url);
  const tenants = getTenants();
  tenants.forEach(t => {
    t.sheetUrl = url;
  });
  saveTenants(tenants);
}

export async function syncBranchesToSheet(tenants: TenantConfig[]): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseEnabled()) {
    return { success: false, message: 'Supabase credentials not configured' };
  }

  try {
    const rows = tenants.map(t => {
      const passwords = { ...(t.subUserPasswords || {}) };
      passwords._master_data = {
        bagCost: t.bagCost ?? 25,
        taram: t.taram ?? 1.100,
        companyName: t.companyName || ''
      };
      return {
        sub_url: t.subUrl,
        company_name: t.companyName || '',
        owner_id: t.ownerId,
        owner_password: t.ownerPassword,
        sub_users: t.subUsers || [],
        sub_user_passwords: passwords,
        marks: t.marks || [],
        agents: t.agents || [],
        full_link: t.fullLink || '',
        bag_cost: t.bagCost ?? 25,
        taram: t.taram ?? 1.100
      };
    });

    let { error } = await supabase
      .from('tenants')
      .upsert(rows);

    if (error && error.message && (
      error.message.includes('company_name') || 
      error.message.includes('bag_cost') || 
      error.message.includes('taram')
    )) {
      const fallbackRows = rows.map(({ company_name, bag_cost, taram, ...rest }: any) => rest);
      const res = await supabase.from('tenants').upsert(fallbackRows);
      error = res.error;
    }

    if (error) {
      throw new Error(error.message);
    }
    return { success: true, message: 'Branches synced to Supabase successfully' };
  } catch (error) {
    console.error('Failed to sync branches with Supabase:', error);
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function saveTenants(tenants: TenantConfig[]): Promise<{ success: boolean; message: string }> {
  tenants.forEach(t => {
    t.fullLink = `${window.location.origin}${window.location.pathname}#${t.subUrl}`;
  });
  localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(tenants));
  
  try {
    const res = await syncBranchesToSheet(tenants);
    if (!res.success) {
      console.warn('Background tenant sync warned:', res.message);
    } else {
      console.log('Background tenant sync success:', res.message);
    }
    return res;
  } catch (err: any) {
    console.error('Background tenant sync error:', err);
    return { success: false, message: err?.message || String(err) };
  }
}

export async function deleteBranch(subUrl: string): Promise<{ success: boolean; message: string }> {
  const normalized = normalizeSubUrl(subUrl);
  const normalizedLower = normalized.toLowerCase();
  
  const currentTenants = getTenants();
  const updatedTenants = currentTenants.filter(t => normalizeSubUrl(t.subUrl).toLowerCase() !== normalizedLower);
  
  if (currentTenants.length <= 1) {
    return { 
      success: false, 
      message: 'Cannot delete this branch profile. At least one branch must remain active in the system.' 
    };
  }
  
  // 1. Update localStorage immediately
  localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(updatedTenants));
  
  // 2. Clean up local cached transactions for this branch
  try {
    const txKey = `agrosync_transactions_${normalized.replace(/\//g, '_')}`;
    localStorage.removeItem(txKey);
  } catch (e) {
    console.warn('Failed to clear branch local tx cache:', e);
  }
  
  // 3. Delete from Supabase Database if enabled
  if (isSupabaseEnabled()) {
    try {
      // Delete from tenants table in Supabase (matching case-insensitively)
      const { error: dbError } = await supabase
        .from('tenants')
        .delete()
        .ilike('sub_url', normalized);

      if (dbError) {
        console.error('Failed to delete branch from Supabase:', dbError);
        return { 
          success: false, 
          message: `Branch removed locally, but Supabase error: ${dbError.message}` 
        };
      }

      // Also clean up any associated transactions in Supabase for this branch
      try {
        await supabase
          .from('transactions')
          .delete()
          .ilike('sub_url', normalized);
      } catch (txErr) {
        console.warn('Branch transactions cleanup in Supabase note:', txErr);
      }

      console.log(`Branch ${normalized} deleted successfully from Supabase.`);
      return { 
        success: true, 
        message: `Branch "${normalized}" permanently deleted from system and Supabase database.` 
      };
    } catch (err: any) {
      console.error('Error deleting branch from Supabase:', err);
      return { success: false, message: err?.message || 'Error deleting branch from Supabase' };
    }
  }

  return { success: true, message: `Branch "${normalized}" deleted successfully.` };
}

export async function fetchTenantsFromSupabase(): Promise<{ success: boolean; tenants: TenantConfig[]; message?: string }> {
  if (!isSupabaseEnabled()) {
    return { success: false, tenants: getTenants(), message: 'Supabase credentials not configured' };
  }

  try {
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('*');

    if (tenantError) {
      throw new Error(tenantError.message);
    }

    if (tenantData && tenantData.length > 0) {
      const mappedTenants: TenantConfig[] = tenantData.map(t => {
        const subUserPasswords = t.sub_user_passwords || {};
        const masterData = subUserPasswords._master_data || {};
        const bagCost = t.bag_cost !== undefined && t.bag_cost !== null
          ? Number(t.bag_cost)
          : (masterData.bagCost !== undefined ? parseFloat(masterData.bagCost) : 25);
        const taram = t.taram !== undefined && t.taram !== null
          ? Number(t.taram)
          : (masterData.taram !== undefined ? parseFloat(masterData.taram) : 1.100);
        const companyName = t.company_name || masterData.companyName || '';
        return {
          subUrl: t.sub_url,
          companyName,
          sheetUrl: '',
          ownerId: t.owner_id,
          ownerPassword: t.owner_password,
          subUsers: t.sub_users || [],
          subUserPasswords: t.sub_user_passwords || {},
          marks: t.marks || [],
          agents: t.agents || [],
          fullLink: t.full_link || '',
          bagCost,
          taram
        };
      });
      localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(mappedTenants));
      return { success: true, tenants: mappedTenants };
    }

    // If Supabase table is completely empty, sync local tenants to Supabase
    const local = getTenants();
    await syncBranchesToSheet(local);
    return { success: true, tenants: local };
  } catch (err: any) {
    console.error('Failed to fetch tenants from Supabase:', err);
    return { success: false, tenants: getTenants(), message: err?.message || String(err) };
  }
}

export async function updateBranchConfiguration(
  subUrl: string,
  updatedData: Partial<TenantConfig>
): Promise<{ success: boolean; message: string }> {
  const tenants = getTenants();
  const normalized = normalizeSubUrl(subUrl).toLowerCase();
  const index = tenants.findIndex(t => normalizeSubUrl(t.subUrl).toLowerCase() === normalized);
  
  if (index === -1) {
    const newT: TenantConfig = {
      subUrl: normalizeSubUrl(subUrl),
      companyName: updatedData.companyName || '',
      sheetUrl: '',
      ownerId: updatedData.ownerId || 'Owner',
      ownerPassword: updatedData.ownerPassword || '1234',
      subUsers: updatedData.subUsers || [],
      subUserPasswords: updatedData.subUserPasswords || {},
      marks: updatedData.marks || [],
      agents: updatedData.agents || [],
      bagCost: updatedData.bagCost ?? 25,
      taram: updatedData.taram ?? 1.100
    };
    tenants.push(newT);
  } else {
    tenants[index] = {
      ...tenants[index],
      ...updatedData
    };
  }

  return await saveTenants(tenants);
}

function getTransactionsStorageKey(): string {
  const tenant = getCurrentTenant();
  const slug = tenant.subUrl.replace(/\//g, '').toLowerCase() || 'default';
  return `agrosync_transactions_${slug}`;
}

export function getMockTransactions(): Transaction[] {
  const key = getTransactionsStorageKey();
  const data = localStorage.getItem(key);
  if (!data) {
    return [];
  }
  try {
    const list: Transaction[] = JSON.parse(data);
    const tenant = getCurrentTenant();
    const currentSlug = tenant.subUrl.replace(/\//g, '').toLowerCase();
    return list.filter(tx => {
      if (!tx.subUrl) return false;
      return tx.subUrl.replace(/\//g, '').toLowerCase() === currentSlug;
    });
  } catch (e) {
    return [];
  }
}

function saveMockTransactions(txs: Transaction[]): void {
  const key = getTransactionsStorageKey();
  const tenant = getCurrentTenant();
  const currentSlug = tenant.subUrl.replace(/\//g, '').toLowerCase();
  const filtered = txs.filter(tx => {
    if (!tx.subUrl) return true;
    return tx.subUrl.replace(/\//g, '').toLowerCase() === currentSlug;
  });
  localStorage.setItem(key, JSON.stringify(filtered));
}

export function getShortAgentName(name: string): string {
  const clean = name.trim().replace(/[^a-zA-Z\s]/g, '').toUpperCase();
  const words = clean.split(/\s+/);
  if (words.length >= 2 && words[0].length > 0 && words[1].length > 0) {
    return (words[0].substring(0, 2) + words[1].substring(0, 2)).substring(0, 4);
  }
  return clean.substring(0, 3);
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const currentTenant = getCurrentTenant();

  if (!isSupabaseEnabled()) {
    return getMockTransactions();
  }

  try {
    // 1. Asynchronously sync all tenants configuration from Supabase to keep local storage updated
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('*');

    if (!tenantError && tenantData) {
      const mappedTenants: TenantConfig[] = tenantData.map(t => {
        const subUserPasswords = t.sub_user_passwords || {};
        const masterData = subUserPasswords._master_data || {};
        const bagCost = t.bag_cost !== undefined && t.bag_cost !== null
          ? Number(t.bag_cost)
          : (masterData.bagCost !== undefined ? parseFloat(masterData.bagCost) : 25);
        const taram = t.taram !== undefined && t.taram !== null
          ? Number(t.taram)
          : (masterData.taram !== undefined ? parseFloat(masterData.taram) : 1.100);
        const companyName = t.company_name || masterData.companyName || '';
        return {
          subUrl: t.sub_url,
          companyName,
          sheetUrl: '',
          ownerId: t.owner_id,
          ownerPassword: t.owner_password,
          subUsers: t.sub_users || [],
          subUserPasswords: t.sub_user_passwords || {},
          marks: t.marks || [],
          agents: t.agents || [],
          fullLink: t.full_link || '',
          bagCost,
          taram
        };
      });
      localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(mappedTenants));
    }

    // 2. Fetch Transactions from Supabase STRICTLY for this sub route
    const currentSubUrl = normalizeSubUrl(currentTenant.subUrl);
    const subUrlWithoutSlash = currentSubUrl.endsWith('/') ? currentSubUrl.slice(0, -1) : currentSubUrl;
    const rawSubSlug = currentSubUrl.replace(/\//g, '');

    // Strictly match only this sub route's transactions (e.g. "/BRT/" or "/BRT" or "BRT")
    let query = supabase
      .from('transactions')
      .select('*')
      .or(`sub_url.ilike.${currentSubUrl},sub_url.ilike.${subUrlWithoutSlash},sub_url.eq.${rawSubSlug}`);

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return getMockTransactions();
    }

    const currentSlug = rawSubSlug.toLowerCase();

    const formatted: Transaction[] = (data || [])
      .map((item: any) => {
        const bags = parseInt(item.bags || '0', 10);
        const rate = parseFloat(item.rate || '0');
        const subUserRate = item.sub_user_rate !== undefined && item.sub_user_rate !== null && item.sub_user_rate !== "" ? parseFloat(item.sub_user_rate) : undefined;
        const isTxPending = !item.sub_user_name || !String(item.sub_user_name).trim() || String(item.sub_user_name).toLowerCase() === 'pending' || !item.weight || !String(item.weight).trim();
        const rawTotal = parseFloat(String(item.total_value || '0'));
        const totalValue = isTxPending ? 0 : (rawTotal > 0 ? rawTotal : (bags * (subUserRate || rate)));
        return {
          timestamp: item.timestamp || new Date().toISOString(),
          transactionId: item.transaction_id || '',
          date: String(item.date || ''),
          lot: (item.lot !== undefined && item.lot !== null) ? item.lot.toString() : '0',
          bags: bags,
          rate: rate,
          subUserRate: subUserRate,
          totalValue: totalValue,
          agent: item.agent || '',
          mark: item.mark || currentTenant.marks[0] || 'BRT',
          weight: item.weight || '',
          rateReason: item.rate_reason || '',
          lockedBy: item.locked_by || '',
          subUrl: item.sub_url || currentSubUrl,
          subUserName: item.sub_user_name || '',
          subUserTimestamp: item.sub_user_timestamp || '',
          grossWeight: item.gross_weight ? parseFloat(String(item.gross_weight)) : undefined,
          bagsWeight: item.bags_weight ? parseFloat(String(item.bags_weight)) : undefined,
          netWeight: item.net_weight ? parseFloat(String(item.net_weight)) : undefined,
          calculatedAmount: item.calculated_amount ? parseFloat(String(item.calculated_amount)) : undefined
        };
      })
      // Absolute guarantee: filter strictly by current sub route slug in memory
      .filter((tx: Transaction) => {
        if (!tx.subUrl) return false;
        const txSlug = tx.subUrl.replace(/\//g, '').toLowerCase();
        return txSlug === currentSlug;
      });

    saveMockTransactions(formatted);
    return formatted;
  } catch (error) {
    console.error('Failed fetching from Supabase, falling back to local DB cache:', error);
    return getMockTransactions();
  }
}

export async function syncAllToSupabase(): Promise<{ success: boolean; message: string; count?: number }> {
  if (!isSupabaseEnabled()) {
    return { success: false, message: 'Supabase credentials not configured. Please paste your Supabase URL & Key.' };
  }

  try {
    const tenants = getTenants();
    await syncBranchesToSheet(tenants);

    const localTxs = getMockTransactions();
    if (localTxs.length === 0) {
      return { success: true, message: 'Connected to Supabase. No local transactions to sync.', count: 0 };
    }

    const currentTenant = getCurrentTenant();
    const rows = localTxs.map(tx => ({
      transaction_id: tx.transactionId,
      timestamp: tx.timestamp || new Date().toISOString(),
      date: tx.date,
      lot: String(tx.lot || '0'),
      bags: Number(tx.bags) || 0,
      rate: Number(tx.rate) || 0,
      sub_user_rate: tx.subUserRate !== undefined && tx.subUserRate !== null && !isNaN(Number(tx.subUserRate)) ? Number(tx.subUserRate) : null,
      total_value: (!tx.subUserName || !String(tx.subUserName).trim() || String(tx.subUserName).toLowerCase() === 'pending' || !tx.weight || !String(tx.weight).trim())
        ? 0 
        : (Number(tx.totalValue) || (Number(tx.bags) * (Number(tx.subUserRate) || Number(tx.rate)))),
      agent: tx.agent || '',
      mark: tx.mark || currentTenant.marks[0] || 'BRT',
      weight: tx.weight || '',
      rate_reason: tx.rateReason || '',
      locked_by: tx.lockedBy || '',
      sub_url: normalizeSubUrl(tx.subUrl || currentTenant.subUrl),
      sub_user_name: tx.subUserName || null,
      sub_user_timestamp: tx.subUserTimestamp || null,
      gross_weight: tx.grossWeight !== undefined && tx.grossWeight !== null ? Number(tx.grossWeight) : null,
      bags_weight: tx.bagsWeight !== undefined && tx.bagsWeight !== null ? Number(tx.bagsWeight) : null,
      net_weight: tx.netWeight !== undefined && tx.netWeight !== null ? Number(tx.netWeight) : null,
      calculated_amount: tx.calculatedAmount !== undefined && tx.calculatedAmount !== null ? Number(tx.calculatedAmount) : null
    }));

    const { error } = await supabase
      .from('transactions')
      .upsert(rows, { onConflict: 'transaction_id' });

    if (error) {
      throw new Error(error.message);
    }

    return { 
      success: true, 
      message: `Successfully synced ${rows.length} transactions to Supabase!`, 
      count: rows.length 
    };
  } catch (error: any) {
    console.error('Failed to sync all data to Supabase:', error);
    return { 
      success: false, 
      message: error?.message || 'Failed to sync data to Supabase. Check SQL tables and RLS policies.' 
    };
  }
}

export async function addTransaction(
  tx: Omit<Transaction, 'totalValue'>
): Promise<{ success: boolean; message: string; data?: Transaction }> {
  const tenant = getCurrentTenant();
  const normalizedSubUrl = normalizeSubUrl(tenant.subUrl);
  const isPending = !tx.weight || !String(tx.weight).trim() || !tx.subUserName || !String(tx.subUserName).trim();
  const totalValue = isPending ? 0 : (tx.bags * tx.rate);
  const newTx: Transaction = {
    ...tx,
    subUrl: normalizedSubUrl,
    totalValue
  };

  if (!isSupabaseEnabled()) {
    const txs = getMockTransactions();
    if (txs.some(t => t.transactionId === newTx.transactionId)) {
      return { success: false, message: 'Transaction ID already exists locally' };
    }
    txs.push(newTx);
    saveMockTransactions(txs);
    return { success: true, message: 'Added to local database (Mock Mode)', data: newTx };
  }

  try {
    const supabaseRow = {
      transaction_id: newTx.transactionId,
      timestamp: newTx.timestamp || new Date().toISOString(),
      date: newTx.date,
      lot: String(newTx.lot || '0'),
      bags: Number(newTx.bags) || 0,
      rate: Number(newTx.rate) || 0,
      sub_user_rate: newTx.subUserRate !== undefined && newTx.subUserRate !== null && !isNaN(Number(newTx.subUserRate)) ? Number(newTx.subUserRate) : null,
      total_value: isPending ? 0 : (Number(newTx.totalValue) || (Number(newTx.bags) * (Number(newTx.subUserRate) || Number(newTx.rate)))),
      agent: newTx.agent,
      mark: newTx.mark,
      weight: newTx.weight || '',
      rate_reason: newTx.rateReason || '',
      locked_by: newTx.lockedBy || '',
      sub_url: newTx.subUrl,
      sub_user_name: newTx.subUserName || null,
      sub_user_timestamp: newTx.subUserTimestamp || null,
      gross_weight: newTx.grossWeight !== undefined && newTx.grossWeight !== null ? Number(newTx.grossWeight) : null,
      bags_weight: newTx.bagsWeight !== undefined && newTx.bagsWeight !== null ? Number(newTx.bagsWeight) : null,
      net_weight: newTx.netWeight !== undefined && newTx.netWeight !== null ? Number(newTx.netWeight) : null,
      calculated_amount: newTx.calculatedAmount !== undefined && newTx.calculatedAmount !== null ? Number(newTx.calculatedAmount) : null
    };

    const { error } = await supabase
      .from('transactions')
      .upsert(supabaseRow, { onConflict: 'transaction_id' });

    if (error) {
      throw new Error(error.message);
    }

    const txs = getMockTransactions();
    const existingIndex = txs.findIndex(t => t.transactionId === newTx.transactionId);
    if (existingIndex >= 0) {
      txs[existingIndex] = newTx;
    } else {
      txs.push(newTx);
    }
    saveMockTransactions(txs);
    return { success: true, message: 'Saved and synced to Supabase Ledger', data: newTx };
  } catch (error: any) {
    console.error('Failed to sync with Supabase:', error);
    const txs = getMockTransactions();
    const existingIndex = txs.findIndex(t => t.transactionId === newTx.transactionId);
    if (existingIndex >= 0) {
      txs[existingIndex] = newTx;
    } else {
      txs.push(newTx);
    }
    saveMockTransactions(txs);
    return { 
      success: false, 
      message: `Supabase Error: ${error?.message || 'Sync failed'}. (Saved in browser cache).`, 
      data: newTx 
    };
  }
}

export async function updateWeight(
  transactionId: string,
  weight?: string,
  subUserRate?: number,
  rateReason?: string,
  bags?: number,
  mark?: string,
  totalValue?: number,
  lockedBy?: string,
  subUserName?: string,
  subUserTimestamp?: string,
  grossWeight?: number,
  bagsWeight?: number,
  netWeight?: number,
  calculatedAmount?: number
): Promise<{ success: boolean; message: string }> {
  
  if (!isSupabaseEnabled()) {
    const txs = getMockTransactions();
    const index = txs.findIndex(t => t.transactionId === transactionId);
    if (index !== -1) {
      if (weight !== undefined && weight !== null) txs[index].weight = weight;
      if (bags !== undefined && bags !== null) txs[index].bags = bags;
      if (subUserRate !== undefined && subUserRate !== null) txs[index].subUserRate = subUserRate;
      if (mark !== undefined && mark !== null) txs[index].mark = mark;
      txs[index].totalValue = totalValue !== undefined ? totalValue : (txs[index].bags * (txs[index].subUserRate || txs[index].rate));
      txs[index].rateReason = rateReason || "";
      if (lockedBy !== undefined && lockedBy !== null) txs[index].lockedBy = lockedBy;
      if (subUserName !== undefined && subUserName !== null) txs[index].subUserName = subUserName;
      if (subUserTimestamp !== undefined && subUserTimestamp !== null) txs[index].subUserTimestamp = subUserTimestamp;
      if (grossWeight !== undefined && grossWeight !== null) txs[index].grossWeight = grossWeight;
      if (bagsWeight !== undefined && bagsWeight !== null) txs[index].bagsWeight = bagsWeight;
      if (netWeight !== undefined && netWeight !== null) txs[index].netWeight = netWeight;
      if (calculatedAmount !== undefined && calculatedAmount !== null) txs[index].calculatedAmount = calculatedAmount;
      
      saveMockTransactions(txs);
      return { success: true, message: 'Ledger details updated in local database (Mock Mode)' };
    }
    return { success: false, message: 'Transaction ID not found in local database' };
  }

  try {
    const updates: any = {};
    if (weight !== undefined && weight !== null) updates.weight = weight;
    if (bags !== undefined && bags !== null) updates.bags = bags;
    if (subUserRate !== undefined && subUserRate !== null) updates.sub_user_rate = subUserRate;
    if (mark !== undefined && mark !== null) updates.mark = mark;
    if (totalValue !== undefined && totalValue !== null) updates.total_value = totalValue;
    if (rateReason !== undefined && rateReason !== null) updates.rate_reason = rateReason;
    if (lockedBy !== undefined && lockedBy !== null) updates.locked_by = lockedBy;
    if (subUserName !== undefined && subUserName !== null) updates.sub_user_name = subUserName;
    if (subUserTimestamp !== undefined && subUserTimestamp !== null) updates.sub_user_timestamp = subUserTimestamp;
    if (grossWeight !== undefined && grossWeight !== null) updates.gross_weight = grossWeight;
    if (bagsWeight !== undefined && bagsWeight !== null) updates.bags_weight = bagsWeight;
    if (netWeight !== undefined && netWeight !== null) updates.net_weight = netWeight;
    if (calculatedAmount !== undefined && calculatedAmount !== null) updates.calculated_amount = calculatedAmount;

    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('transaction_id', transactionId);

    if (error) {
      throw new Error(error.message);
    }

    // Sync state locally too
    const txs = getMockTransactions();
    const index = txs.findIndex(t => t.transactionId === transactionId);
    if (index !== -1) {
      if (weight !== undefined && weight !== null) txs[index].weight = weight;
      if (bags !== undefined && bags !== null) txs[index].bags = bags;
      if (subUserRate !== undefined && subUserRate !== null) txs[index].subUserRate = subUserRate;
      if (mark !== undefined && mark !== null) txs[index].mark = mark;
      txs[index].totalValue = totalValue !== undefined ? totalValue : (txs[index].bags * (txs[index].subUserRate || txs[index].rate));
      txs[index].rateReason = rateReason || "";
      if (lockedBy !== undefined && lockedBy !== null) txs[index].lockedBy = lockedBy;
      if (subUserName !== undefined && subUserName !== null) txs[index].subUserName = subUserName;
      if (subUserTimestamp !== undefined && subUserTimestamp !== null) txs[index].subUserTimestamp = subUserTimestamp;
      if (grossWeight !== undefined && grossWeight !== null) txs[index].grossWeight = grossWeight;
      if (bagsWeight !== undefined && bagsWeight !== null) txs[index].bagsWeight = bagsWeight;
      if (netWeight !== undefined && netWeight !== null) txs[index].netWeight = netWeight;
      if (calculatedAmount !== undefined && calculatedAmount !== null) txs[index].calculatedAmount = calculatedAmount;
      saveMockTransactions(txs);
    }

    return { success: true, message: 'Ledger details saved to Supabase' };
  } catch (error) {
    console.error('Failed to update ledger in Supabase. Saving locally:', error);
    
    // Sync state locally as fallback
    const txs = getMockTransactions();
    const index = txs.findIndex(t => t.transactionId === transactionId);
    if (index !== -1) {
      if (weight !== undefined && weight !== null) txs[index].weight = weight;
      if (bags !== undefined && bags !== null) txs[index].bags = bags;
      if (subUserRate !== undefined && subUserRate !== null) txs[index].subUserRate = subUserRate;
      if (mark !== undefined && mark !== null) txs[index].mark = mark;
      txs[index].totalValue = totalValue !== undefined ? totalValue : (txs[index].bags * (txs[index].subUserRate || txs[index].rate));
      txs[index].rateReason = rateReason || "";
      if (lockedBy !== undefined && lockedBy !== null) txs[index].lockedBy = lockedBy;
      if (subUserName !== undefined && subUserName !== null) txs[index].subUserName = subUserName;
      if (subUserTimestamp !== undefined && subUserTimestamp !== null) txs[index].subUserTimestamp = subUserTimestamp;
      if (grossWeight !== undefined && grossWeight !== null) txs[index].grossWeight = grossWeight;
      if (bagsWeight !== undefined && bagsWeight !== null) txs[index].bagsWeight = bagsWeight;
      if (netWeight !== undefined && netWeight !== null) txs[index].netWeight = netWeight;
      if (calculatedAmount !== undefined && calculatedAmount !== null) txs[index].calculatedAmount = calculatedAmount;
      saveMockTransactions(txs);
      return { success: true, message: 'Offline update: ledger details saved to local database' };
    }
    return { success: false, message: 'Failed to update ledger (network error + local ID missing)' };
  }
}

/**
 * Check if a transaction has pending weight status
 */
export function isWeightPending(tx: Transaction | null | undefined): boolean {
  if (!tx) return false;
  return !tx.weight || !tx.weight.trim() || tx.weight.toLowerCase() === 'pending';
}

/**
 * Permanently delete a pending transaction
 */
export async function deleteTransaction(
  transactionId: string
): Promise<{ success: boolean; message: string }> {
  // Check if transaction exists and verify weight is pending
  const txs = getMockTransactions();
  const existing = txs.find(t => t.transactionId === transactionId);
  if (existing && !isWeightPending(existing)) {
    return {
      success: false,
      message: 'Only transactions with pending weight status can be deleted.'
    };
  }

  // 1. Delete from local storage
  const updatedTxs = txs.filter(t => t.transactionId !== transactionId);
  saveMockTransactions(updatedTxs);

  // 2. Delete from Supabase if enabled
  if (isSupabaseEnabled()) {
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('transaction_id', transactionId);

      if (error) {
        console.error('Failed to delete transaction from Supabase:', error);
        return {
          success: false,
          message: `Deleted from local cache, but Supabase error: ${error.message}`
        };
      }
      return { success: true, message: `Transaction ${transactionId} deleted successfully.` };
    } catch (err: any) {
      console.error('Supabase delete exception:', err);
      return {
        success: false,
        message: `Deleted locally, but database sync error: ${err?.message || 'Delete failed'}`
      };
    }
  }

  return { success: true, message: `Transaction ${transactionId} deleted successfully.` };
}

/**
 * Edit a pending transaction
 */
export async function editTransaction(
  originalTransactionId: string,
  updatedData: Partial<Transaction>
): Promise<{ success: boolean; message: string; data?: Transaction }> {
  const txs = getMockTransactions();
  const existingIndex = txs.findIndex(t => t.transactionId === originalTransactionId);
  const existing = existingIndex >= 0 ? txs[existingIndex] : null;

  if (existing && !isWeightPending(existing)) {
    return {
      success: false,
      message: 'Only transactions with pending weight status can be edited.'
    };
  }

  // Calculate new transaction ID if date, lot, bags, agent, or mark changed
  const date = updatedData.date || existing?.date || '';
  const lotVal = String(updatedData.lot !== undefined ? updatedData.lot : (existing?.lot || '')).trim();
  const bagsVal = updatedData.bags !== undefined ? Number(updatedData.bags) : (existing?.bags || 0);
  const rateVal = updatedData.rate !== undefined ? Number(updatedData.rate) : (existing?.rate || 0);
  const agentVal = (updatedData.agent !== undefined ? updatedData.agent : (existing?.agent || '')).trim();
  const markVal = (updatedData.mark !== undefined ? updatedData.mark : (existing?.mark || '')).trim();

  const [yyyy, mm, dd] = date.split('-');
  const datePrefix = `${yyyy || ''}${mm || ''}${dd || ''}`;
  const paddedLot = /^\d+$/.test(lotVal) ? lotVal.padStart(2, '0') : lotVal;
  const shortAgent = getShortAgentName(agentVal);
  const newTransactionId = `${datePrefix}-${paddedLot}-${bagsVal}-${shortAgent}-${markVal}`;

  // Check for conflict if transaction ID changed
  if (newTransactionId !== originalTransactionId) {
    const conflict = txs.find(t => t.transactionId === newTransactionId && t.transactionId !== originalTransactionId);
    if (conflict) {
      return {
        success: false,
        message: `A transaction with ID "${newTransactionId}" already exists.`
      };
    }
  }

  const updatedTx: Transaction = {
    ...(existing || {} as Transaction),
    ...updatedData,
    transactionId: newTransactionId,
    date,
    lot: lotVal,
    bags: bagsVal,
    rate: rateVal,
    agent: agentVal,
    mark: markVal,
    totalValue: isWeightPending(existing) ? 0 : (bagsVal * (existing?.subUserRate || rateVal))
  };

  // 1. Update in local storage
  if (existingIndex >= 0) {
    txs[existingIndex] = updatedTx;
  } else {
    txs.push(updatedTx);
  }
  saveMockTransactions(txs);

  // 2. Update in Supabase
  if (isSupabaseEnabled()) {
    try {
      const supabaseRow: any = {
        transaction_id: newTransactionId,
        date,
        lot: lotVal,
        bags: bagsVal,
        rate: rateVal,
        agent: agentVal,
        mark: markVal
      };

      if (updatedData.rateReason !== undefined) {
        supabaseRow.rate_reason = updatedData.rateReason;
      }

      if (newTransactionId !== originalTransactionId) {
        const { data: oldRow } = await supabase
          .from('transactions')
          .select('*')
          .eq('transaction_id', originalTransactionId)
          .single();

        const fullNewRow = {
          ...(oldRow || {}),
          ...supabaseRow,
          transaction_id: newTransactionId
        };

        const { error: insertErr } = await supabase
          .from('transactions')
          .upsert(fullNewRow, { onConflict: 'transaction_id' });

        if (insertErr) throw insertErr;

        await supabase
          .from('transactions')
          .delete()
          .eq('transaction_id', originalTransactionId);
      } else {
        const { error: updateErr } = await supabase
          .from('transactions')
          .update(supabaseRow)
          .eq('transaction_id', originalTransactionId);

        if (updateErr) throw updateErr;
      }

      return {
        success: true,
        message: `Transaction updated successfully.`,
        data: updatedTx
      };
    } catch (err: any) {
      console.error('Failed to update transaction in Supabase:', err);
      return {
        success: true,
        message: `Updated locally, but Supabase sync error: ${err?.message || 'Sync failed'}`,
        data: updatedTx
      };
    }
  }

  return {
    success: true,
    message: `Transaction updated successfully.`,
    data: updatedTx
  };
}
