import { supabase } from './supabaseClient';

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

// Seed transactions matching the current date (June 2026) for immediate rich analytics
const SEED_TRANSACTIONS: Transaction[] = [
  {
    timestamp: "2026-06-10T11:30:00.000Z",
    transactionId: "20260610-01-450-RAM-BRT",
    date: "2026-06-10",
    lot: "1",
    bags: 450,
    rate: 45.50,
    totalValue: 20475.00,
    agent: "Ramesh Kumar",
    mark: "BRT",
    weight: "22,500 kg [15.000, 15.000]",
    rateReason: ""
  },
  {
    timestamp: "2026-06-15T09:15:00.000Z",
    transactionId: "20260615-01-350-SURE-TS",
    date: "2026-06-15",
    lot: "1",
    bags: 350,
    rate: 52.00,
    totalValue: 18200.00,
    agent: "Suresh & Sons",
    mark: "TS",
    weight: "17,250 kg [17.250]",
    rateReason: ""
  },
  {
    timestamp: "2026-06-19T14:45:00.000Z",
    transactionId: "20260619-01-500-PAT-RS",
    date: "2026-06-19",
    lot: "1",
    bags: 500,
    rate: 48.00,
    totalValue: 24000.00,
    agent: "Patel Agro",
    mark: "RS",
    weight: "",
    rateReason: ""
  },
  {
    timestamp: "2026-06-20T10:00:00.000Z",
    transactionId: "20260620-01-120-BVB-BVB",
    date: "2026-06-20",
    lot: "1",
    bags: 120,
    rate: 62.50,
    totalValue: 7500.00,
    agent: "BVB Agencies",
    mark: "BVB",
    weight: "",
    rateReason: ""
  }
];

const SCRIPT_URL_KEY = 'agrosync_script_url';
const TENANTS_STORAGE_KEY = 'agrosync_tenants_config';

const DEFAULT_TENANTS: TenantConfig[] = [
  {
    subUrl: '/BRT/',
    sheetUrl: '',
    ownerId: 'BRT',
    ownerPassword: '1234',
    subUsers: ['Ramesh', 'Suresh', 'Patel', 'BVB'],
    subUserPasswords: { Ramesh: '1234', Suresh: '1234', Patel: '1234', BVB: '1234' },
    marks: ['BRT', 'RS', 'TS', 'DV', 'BVB'],
    agents: ['Ramesh Kumar', 'Suresh & Sons', 'Patel Agro', 'BVB Agencies'],
    fullLink: ''
  }
];

export function isSupabaseEnabled(): boolean {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  return !!(supabaseUrl && supabaseAnonKey);
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
    return {
      ...t,
      bagCost,
      taram
    };
  });
}

export function getCurrentTenant(): TenantConfig {
  const currentSubUrl = getCurrentSubUrl();
  
  if (currentSubUrl === '/admin/') {
    const list = getTenants();
    return list[0] || DEFAULT_TENANTS[0];
  }
  
  const tenants = getTenants();
  const match = tenants.find(t => t.subUrl === currentSubUrl);
  if (match) {
    return match;
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
        taram: t.taram ?? 1.100
      };
      return {
        sub_url: t.subUrl,
        owner_id: t.ownerId,
        owner_password: t.ownerPassword,
        sub_users: t.subUsers || [],
        sub_user_passwords: passwords,
        marks: t.marks || [],
        agents: t.agents || [],
        full_link: t.fullLink || ''
      };
    });

    const { error } = await supabase
      .from('tenants')
      .upsert(rows);

    if (error) {
      throw new Error(error.message);
    }
    return { success: true, message: 'Branches synced to Supabase successfully' };
  } catch (error) {
    console.error('Failed to sync branches with Supabase:', error);
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function saveTenants(tenants: TenantConfig[]): void {
  tenants.forEach(t => {
    t.fullLink = `${window.location.origin}${window.location.pathname}#${t.subUrl}`;
  });
  localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(tenants));
  
  syncBranchesToSheet(tenants).then(res => {
    if (!res.success) {
      console.warn('Background tenant sync warned:', res.message);
    } else {
      console.log('Background tenant sync success:', res.message);
    }
  }).catch(err => {
    console.error('Background tenant sync error:', err);
  });
}

function getTransactionsStorageKey(): string {
  const tenant = getCurrentTenant();
  return `agrosync_transactions_${tenant.subUrl.replace(/\//g, '_')}`;
}

export function getMockTransactions(): Transaction[] {
  const key = getTransactionsStorageKey();
  const data = localStorage.getItem(key);
  if (!data) {
    localStorage.setItem(key, JSON.stringify(SEED_TRANSACTIONS));
    return SEED_TRANSACTIONS;
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return SEED_TRANSACTIONS;
  }
}

function saveMockTransactions(txs: Transaction[]): void {
  const key = getTransactionsStorageKey();
  localStorage.setItem(key, JSON.stringify(txs));
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
        const bagCost = masterData.bagCost !== undefined ? parseFloat(masterData.bagCost) : 25;
        const taram = masterData.taram !== undefined ? parseFloat(masterData.taram) : 1.100;
        return {
          subUrl: t.sub_url,
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

    // 2. Fetch Transactions from Supabase
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('sub_url', currentTenant.subUrl);

    if (error) {
      throw new Error(error.message);
    }

    const formatted: Transaction[] = (data || []).map((item: any) => {
      const bags = parseInt(item.bags || '0', 10);
      const rate = parseFloat(item.rate || '0');
      const subUserRate = item.sub_user_rate !== undefined && item.sub_user_rate !== null && item.sub_user_rate !== "" ? parseFloat(item.sub_user_rate) : undefined;
      return {
        timestamp: item.timestamp || new Date().toISOString(),
        transactionId: item.transaction_id || '',
        date: String(item.date || ''),
        lot: (item.lot !== undefined && item.lot !== null) ? item.lot.toString() : '0',
        bags: bags,
        rate: rate,
        subUserRate: subUserRate,
        totalValue: parseFloat(String(item.total_value || '0')) || (bags * (subUserRate || rate)),
        agent: item.agent || '',
        mark: item.mark || 'BRT',
        weight: item.weight || '',
        rateReason: item.rate_reason || '',
        lockedBy: item.locked_by || '',
        subUrl: item.sub_url || '',
        subUserName: item.sub_user_name || '',
        subUserTimestamp: item.sub_user_timestamp || '',
        grossWeight: item.gross_weight ? parseFloat(String(item.gross_weight)) : undefined,
        bagsWeight: item.bags_weight ? parseFloat(String(item.bags_weight)) : undefined,
        netWeight: item.net_weight ? parseFloat(String(item.net_weight)) : undefined,
        calculatedAmount: item.calculated_amount ? parseFloat(String(item.calculated_amount)) : undefined
      };
    });

    saveMockTransactions(formatted);
    return formatted;
  } catch (error) {
    console.error('Failed fetching from Supabase, falling back to local DB cache:', error);
    return getMockTransactions();
  }
}

export async function addTransaction(
  tx: Omit<Transaction, 'totalValue'>
): Promise<{ success: boolean; message: string; data?: Transaction }> {
  const tenant = getCurrentTenant();
  const totalValue = tx.bags * tx.rate;
  const newTx: Transaction = {
    ...tx,
    subUrl: tenant.subUrl,
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
      lot: newTx.lot,
      bags: newTx.bags,
      rate: newTx.rate,
      sub_user_rate: newTx.subUserRate || null,
      total_value: newTx.totalValue,
      agent: newTx.agent,
      mark: newTx.mark,
      weight: newTx.weight || '',
      rate_reason: newTx.rateReason || '',
      locked_by: newTx.lockedBy || '',
      sub_url: newTx.subUrl,
      sub_user_name: newTx.subUserName || null,
      sub_user_timestamp: newTx.subUserTimestamp || null,
      gross_weight: newTx.grossWeight || null,
      bags_weight: newTx.bagsWeight || null,
      net_weight: newTx.netWeight || null,
      calculated_amount: newTx.calculatedAmount || null
    };

    const { error } = await supabase
      .from('transactions')
      .insert(supabaseRow);

    if (error) {
      throw new Error(error.message);
    }

    const txs = getMockTransactions();
    txs.push(newTx);
    saveMockTransactions(txs);
    return { success: true, message: 'Saved to Supabase Ledger', data: newTx };
  } catch (error) {
    console.error('Failed to sync with Supabase. Saving to local storage:', error);
    const txs = getMockTransactions();
    txs.push(newTx);
    saveMockTransactions(txs);
    return { 
      success: true, 
      message: 'Saved to local database (Supabase Sync failed).', 
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
