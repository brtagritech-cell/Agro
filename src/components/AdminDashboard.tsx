import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  User, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Save, 
  LogOut, 
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Globe,
  Upload,
  Zap,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { 
  getTenants, 
  saveTenants, 
  deleteBranch, 
  fetchTenantsFromSupabase, 
  type TenantConfig, 
  normalizeSubUrl 
} from '../services/sheetService';
import { SupabaseConnectModal } from './SupabaseConnectModal';
import { getSupabaseCredentials } from '../services/supabaseClient';

interface AdminDashboardProps {
  onExitAdmin: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onExitAdmin }) => {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('agrosync_admin_auth') === 'true';
  });
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [authError, setAuthError] = useState('');

  // Config states
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [editingTenant, setEditingTenant] = useState<TenantConfig | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formType, setFormType] = useState<'create' | 'edit'>('create');
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [supabaseCreds, setSupabaseCreds] = useState(getSupabaseCredentials());

  // Branch Deletion States
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<TenantConfig | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  
  // Dynamic form fields
  const [subUsersList, setSubUsersList] = useState<{ name: string; password: string }[]>([]);
  const [newSubUserName, setNewSubUserName] = useState('');
  const [newSubUserPassword, setNewSubUserPassword] = useState('');

  const [marksList, setMarksList] = useState<string[]>([]);
  const [newMarkInput, setNewMarkInput] = useState('');

  const [agentsList, setAgentsList] = useState<string[]>([]);
  const [newAgentInput, setNewAgentInput] = useState('');

  const [formError, setFormError] = useState('');
  const [subUserError, setSubUserError] = useState('');
  const [markError, setMarkError] = useState('');
  const [agentError, setAgentError] = useState('');

  // Load configuration on mount or auth success
  useEffect(() => {
    if (isAuthenticated) {
      setTenants(getTenants());
      fetchTenantsFromSupabase().then(res => {
        if (res.success && res.tenants && res.tenants.length > 0) {
          setTenants(res.tenants);
        }
      });
    }
  }, [isAuthenticated]);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (adminUser.trim() === 'RAVI' && adminPass === 'TEJA') {
      setIsAuthenticated(true);
      sessionStorage.setItem('agrosync_admin_auth', 'true');
    } else {
      setAuthError('Invalid Admin credentials. Access Denied.');
    }
  };

  const handleAdminLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('agrosync_admin_auth');
    setAdminUser('');
    setAdminPass('');
  };

  const openCreateModal = () => {
    setFormType('create');
    setEditingTenant(null);
    setCompanyName('');
    setSubUrl('');
    setOwnerId('');
    setOwnerPassword('1234');
    setSubUsersList([
      { name: 'Ramesh', password: '1234' },
      { name: 'Suresh', password: '1234' },
      { name: 'Patel', password: '1234' },
      { name: 'BVB', password: '1234' }
    ]);
    setNewSubUserName('');
    setNewSubUserPassword('');
    setMarksList(['AGRO', 'BRT', 'RS', 'TS', 'DV', 'BVB']);
    setNewMarkInput('');
    setAgentsList(['Ramesh Kumar', 'Suresh & Sons', 'Patel Agro', 'BVB Agencies']);
    setNewAgentInput('');
    setFormError('');
    setSubUserError('');
    setMarkError('');
    setAgentError('');
    setIsFormOpen(true);
  };

  const openEditModal = (tenant: TenantConfig) => {
    setFormType('edit');
    setEditingTenant(tenant);
    setCompanyName(tenant.companyName || '');
    setSubUrl(tenant.subUrl);
    setOwnerId(tenant.ownerId);
    setOwnerPassword(tenant.ownerPassword);
    
    // Format sub-users
    const formattedSubUsers = (tenant.subUsers || []).map(name => ({
      name,
      password: (tenant.subUserPasswords && tenant.subUserPasswords[name]) ? String(tenant.subUserPasswords[name]) : tenant.ownerPassword || '1234'
    }));
    setSubUsersList(formattedSubUsers);
    setNewSubUserName('');
    setNewSubUserPassword('');
    
    setMarksList([...(tenant.marks || [])]);
    setNewMarkInput('');
    
    setAgentsList([...(tenant.agents || [])]);
    setNewAgentInput('');
    
    setFormError('');
    setSubUserError('');
    setMarkError('');
    setAgentError('');
    setIsFormOpen(true);
  };

  const handleAddSubUser = () => {
    const trimmedName = newSubUserName.trim();
    const trimmedPass = newSubUserPassword.trim();

    if (!trimmedName && !trimmedPass) {
      setSubUserError('Please enter sub-user name and password before adding.');
      return;
    }

    if (!trimmedName) {
      setSubUserError('Please enter a sub-user name before adding.');
      return;
    }

    if (!trimmedPass) {
      setSubUserError('Please enter a sub-user password before adding.');
      return;
    }

    if (subUsersList.some(su => su.name.toLowerCase() === trimmedName.toLowerCase())) {
      setSubUserError(`Sub-user "${trimmedName}" is already added.`);
      return;
    }

    setSubUsersList(prev => [
      ...prev,
      {
        name: trimmedName,
        password: trimmedPass
      }
    ]);
    setNewSubUserName('');
    setNewSubUserPassword('');
    setSubUserError('');
  };

  const handleUpdateSubUser = (index: number, field: 'name' | 'password', value: string) => {
    setSubUsersList(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveSubUser = (index: number) => {
    setSubUsersList(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddMark = () => {
    const trimmed = newMarkInput.trim().toUpperCase();
    if (!trimmed) {
      setMarkError('Please enter a brand mark before adding.');
      return;
    }
    if (marksList.includes(trimmed)) {
      setMarkError(`Brand Mark "${trimmed}" is already added.`);
      return;
    }
    setMarksList(prev => [...prev, trimmed]);
    setNewMarkInput('');
    setMarkError('');
  };

  const handleRemoveMark = (index: number) => {
    setMarksList(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddAgent = () => {
    const trimmed = newAgentInput.trim();
    if (!trimmed) {
      setAgentError('Please enter a commission agent name before adding.');
      return;
    }
    if (agentsList.some(a => a.toLowerCase() === trimmed.toLowerCase())) {
      setAgentError(`Commission Agent "${trimmed}" is already added.`);
      return;
    }
    setAgentsList(prev => [...prev, trimmed]);
    setNewAgentInput('');
    setAgentError('');
  };

  const handleRemoveAgent = (index: number) => {
    setAgentsList(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveTenant = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const normalizedPath = normalizeSubUrl(subUrl);
    if (!normalizedPath || normalizedPath === '/' || normalizedPath === '/admin/') {
      setFormError('Invalid Sub-URL path code. Cannot use "/" or "/admin/".');
      return;
    }

    if (!ownerId.trim() || !ownerPassword.trim()) {
      setFormError('Owner credentials are required.');
      return;
    }

    // Auto-commit any pending mark in newMarkInput
    let finalMarks = [...marksList];
    if (newMarkInput.trim()) {
      const pendingMark = newMarkInput.trim().toUpperCase();
      if (!finalMarks.includes(pendingMark)) {
        finalMarks.push(pendingMark);
      }
    }

    if (finalMarks.length === 0) {
      setFormError('At least one Brand Mark must be configured.');
      return;
    }

    // Auto-commit any pending agent in newAgentInput
    let finalAgents = [...agentsList];
    if (newAgentInput.trim()) {
      const pendingAgent = newAgentInput.trim();
      if (!finalAgents.includes(pendingAgent)) {
        finalAgents.push(pendingAgent);
      }
    }

    // Auto-commit any pending sub-user in newSubUserName
    let finalSubUsersList = [...subUsersList];
    if (newSubUserName.trim()) {
      finalSubUsersList.push({
        name: newSubUserName.trim(),
        password: newSubUserPassword.trim() || ownerPassword.trim() || '1234'
      });
    }

    const subUsers: string[] = [];
    const subUserPasswords: { [username: string]: string } = {};

    finalSubUsersList.forEach(item => {
      const name = item.name.trim();
      if (name) {
        if (!subUsers.includes(name)) {
          subUsers.push(name);
        }
        subUserPasswords[name] = item.password.trim() || ownerPassword.trim() || '1234';
      }
    });

    const newTenant: TenantConfig = {
      subUrl: normalizedPath,
      companyName: companyName.trim(),
      sheetUrl: '', // No longer used under Supabase
      ownerId: ownerId.trim(),
      ownerPassword: ownerPassword.trim(),
      subUsers,
      subUserPasswords,
      marks: finalMarks,
      agents: finalAgents
    };

    let updatedTenants = [...tenants];
    if (formType === 'create') {
      // Check duplicate subUrl
      if (tenants.some(t => t.subUrl.toLowerCase() === normalizedPath.toLowerCase())) {
        setFormError(`Sub-URL path ${normalizedPath} already exists.`);
        return;
      }
      updatedTenants.push(newTenant);
    } else {
      // Edit mode
      const index = tenants.findIndex(t => t.subUrl === editingTenant?.subUrl);
      if (index !== -1) {
        updatedTenants[index] = newTenant;
      }
    }

    saveTenants(updatedTenants);
    setTenants(updatedTenants);
    setIsFormOpen(false);
  };

  const handleBulkUploadCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const rows = text.split('\n');
        const newTenants: TenantConfig[] = [];
        
        for (let i = 1; i < rows.length; i++) {
          const rowText = rows[i].trim();
          if (!rowText) continue;

          // Simple CSV parser supporting quotes
          const columns: string[] = [];
          let insideQuote = false;
          let currentCell = '';
          for (let j = 0; j < rowText.length; j++) {
            const char = rowText[j];
            if (char === '"') {
              insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
              columns.push(currentCell.trim());
              currentCell = '';
            } else {
              currentCell += char;
            }
          }
          columns.push(currentCell.trim());

          if (columns.length < 5) continue;

          const hasCompanyCol = columns.length >= 7;
          const compName = hasCompanyCol ? columns[0].replace(/"/g, '').trim() : '';
          const rawSubUrl = (hasCompanyCol ? columns[1] : columns[0]).replace(/"/g, '');
          const ownerId = (hasCompanyCol ? columns[2] : columns[1]).replace(/"/g, '');
          const ownerPassword = (hasCompanyCol ? columns[3] : columns[2]).replace(/"/g, '');
          const rawSubUsers = hasCompanyCol ? columns[4] : columns[3];
          const rawMarks = hasCompanyCol ? columns[5] : columns[4];
          const rawAgents = (hasCompanyCol ? columns[6] : columns[5]) || "";

          const normalizedPath = normalizeSubUrl(rawSubUrl);
          if (!normalizedPath || normalizedPath === '/' || normalizedPath === '/admin/') continue;

          const subUsersList: string[] = [];
          const subUserPasswords: { [key: string]: string } = {};

          rawSubUsers.split(',').forEach(item => {
            const cleanItem = item.replace(/"/g, '').trim();
            if (!cleanItem) return;
            const parts = cleanItem.split(':');
            const name = parts[0]?.trim();
            const pwd = parts[1]?.trim();
            if (name) {
              subUsersList.push(name);
              if (pwd) {
                subUserPasswords[name] = pwd;
              }
            }
          });

          const marksList = rawMarks
            .split(',')
            .map(m => m.replace(/"/g, '').trim().toUpperCase())
            .filter(Boolean);

          const agentsList = rawAgents
            .split(',')
            .map(a => a.replace(/"/g, '').trim())
            .filter(Boolean);

          if (marksList.length === 0) continue;

          newTenants.push({
            subUrl: normalizedPath,
            companyName: compName,
            sheetUrl: '', // No longer used under Supabase
            ownerId: ownerId,
            ownerPassword: ownerPassword,
            subUsers: subUsersList,
            subUserPasswords,
            marks: marksList,
            agents: agentsList
          });
        }

        if (newTenants.length === 0) {
          alert('No valid rows found in CSV. Please verify formatting.');
          return;
        }

        const merged = [...tenants];
        newTenants.forEach(newT => {
          const idx = merged.findIndex(t => t.subUrl === newT.subUrl);
          if (idx !== -1) {
            merged[idx] = newT;
          } else {
            merged.push(newT);
          }
        });

        saveTenants(merged);
        setTenants(merged);
        alert(`Successfully imported ${newTenants.length} branch profiles!`);
      } catch (err) {
        console.error(err);
        alert('Error parsing CSV file. Please make sure it matches the template.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadCSVTemplate = () => {
    const headers = 'Company Name,Sub-URL Path,Owner ID,Owner Password,Sub-Users,Brand Marks,Agent Names\n';
    const sample = '"Agro Logistics","/Agro/TestBranch/","owner_id","owner_pass","Ramesh:1234, Suresh:1234","Agro, BRT, RS","Agent A, Agent B"\n';
    const blob = new Blob([headers + sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'agrosync_branches_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const promptDeleteTenant = (tenant: TenantConfig) => {
    if (tenants.length <= 1) {
      alert('Cannot delete this branch profile. At least one branch must remain active in the system.');
      return;
    }
    setDeleteFeedback(null);
    setDeleteConfirmTarget(tenant);
  };

  const confirmDeleteTenant = async () => {
    if (!deleteConfirmTarget) return;
    const targetUrl = deleteConfirmTarget.subUrl;
    setDeletingPath(targetUrl);
    setDeleteFeedback(null);

    try {
      const res = await deleteBranch(targetUrl);
      if (res.success) {
        setTenants(prev => prev.filter(t => normalizeSubUrl(t.subUrl).toLowerCase() !== normalizeSubUrl(targetUrl).toLowerCase()));
        setDeleteFeedback({ type: 'success', message: res.message });
        setDeleteConfirmTarget(null);
        setTimeout(() => setDeleteFeedback(null), 6000);
      } else {
        setDeleteFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setDeleteFeedback({ type: 'error', message: err?.message || 'Failed to delete branch' });
    } finally {
      setDeletingPath(null);
    }
  };

  // Render Login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center p-3 sm:p-4 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 w-full max-w-full overflow-x-hidden">
        <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-premium border border-white/20 p-5 sm:p-8 space-y-5 sm:space-y-6">
          <div className="flex flex-col items-center">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 mb-2.5 sm:mb-3">
              <ShieldAlert className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800 text-center">AgroSync Admin Portal</h1>
            <p className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase tracking-wider mt-0.5 sm:mt-1">System Master Panel</p>
          </div>

          {authError && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-start gap-3 text-rose-800 text-xs sm:text-sm">
              <AlertCircle className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold font-mono">Authentication Denied</p>
                <p className="text-xs text-rose-600/90 mt-0.5">{authError}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="adminUser">
                Admin Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <User className="h-5 w-5" />
                </span>
                <input
                  id="adminUser"
                  type="text"
                  required
                  value={adminUser}
                  onChange={(e) => setAdminUser(e.target.value)}
                  placeholder="Enter admin username"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-600 text-slate-800 font-medium text-sm transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="adminPass">
                Admin Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <Lock className="h-5 w-5" />
                </span>
                <input
                  id="adminPass"
                  type="password"
                  required
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  placeholder="Enter password"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-600 text-slate-800 font-medium text-sm transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-6 py-3 px-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 text-sm"
            >
              Unlock Configuration Panel
              <ArrowRight className="h-4.5 w-4.5" />
            </button>

            <button
              type="button"
              onClick={onExitAdmin}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl transition-all text-xs text-center"
            >
              Exit to Customer Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Dashboard if authenticated
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col w-full max-w-full overflow-x-hidden">
      <header className="sticky top-0 z-30 bg-indigo-900 text-white shadow-md w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-white/10 flex items-center justify-center text-white border border-white/10">
              <ShieldAlert className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-bold leading-none">AgroSync Master Admin</h1>
              <span className="text-[8px] sm:text-[9px] font-bold text-indigo-300 uppercase tracking-wider mt-0.5 block">Multitenant Control panel</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={onExitAdmin}
              className="px-2.5 sm:px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all border border-white/10"
            >
              View Client App
            </button>
            <button
              onClick={handleAdminLogout}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-indigo-200 hover:text-white rounded-xl transition-all"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
        
        {/* Supabase Connection Status Card */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-soft space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-emerald-600 animate-pulse shrink-0" />
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wider">
                Supabase Database Connection
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsSupabaseModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5 text-emerald-600" />
              <span>Configure / Paste Credentials</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            The application communicates directly with the Supabase PostgreSQL database. You can paste a new Project URL and API Key at any time without rebuilding.
          </p>
          <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200/50 flex flex-col gap-2 font-mono text-xs text-slate-700">
            <div>
              <span className="text-slate-400 font-semibold uppercase text-[9px] block">Database URL</span>
              <span className="font-semibold break-all text-[11px] sm:text-xs">{supabaseCreds.url || '🔴 Not Configured (Local Mock Mode)'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold uppercase text-[9px] block">Connection Status</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border mt-1 uppercase ${
                supabaseCreds.url && supabaseCreds.anonKey
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {supabaseCreds.url && supabaseCreds.anonKey ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Connected</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>Mock Mode Fallback</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Delete / Action Feedback Banner */}
        {deleteFeedback && (
          <div className={`p-4 rounded-2xl flex items-center justify-between text-xs font-semibold animate-fade-in ${
            deleteFeedback.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            <div className="flex items-center gap-2.5">
              {deleteFeedback.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
              )}
              <span>{deleteFeedback.message}</span>
            </div>
            <button 
              type="button"
              onClick={() => setDeleteFeedback(null)} 
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-soft">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-800">Branch Profiles & Site Routing</h2>
            <p className="text-xs text-slate-500 mt-0.5">Define custom sub URLs, owners, marks, and sub-users</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <label className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer text-xs transition-all border border-slate-200/50 text-center">
              <Upload className="h-4 w-4 shrink-0" />
              <span>Bulk Upload CSV</span>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleBulkUploadCSV} 
                className="hidden" 
              />
            </label>
            <button
              onClick={downloadCSVTemplate}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-indigo-600 rounded-xl font-semibold text-xs transition-all text-center"
            >
              Get Template
            </button>
            <button
              onClick={openCreateModal}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/25 active:scale-[0.98] transition-all text-xs"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>Create New Branch Profile</span>
            </button>
          </div>
        </div>

        {/* Profiles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {tenants.map((t) => (
            <div key={t.subUrl} className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-soft p-4 sm:p-6 flex flex-col justify-between space-y-4 sm:space-y-5 hover:border-indigo-150 transition-all relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
              
              <div className="space-y-3 pl-1 sm:pl-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded">
                        SUB ROUTE
                      </span>
                      {t.companyName && (
                        <span className="text-[10px] font-bold font-sans px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md">
                          {t.companyName}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold font-mono text-slate-800 mt-1 break-all">{t.subUrl}</h3>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEditModal(t)}
                      className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 rounded-lg transition-all border border-transparent hover:border-slate-200/50"
                      title="Edit Branch Profile"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => promptDeleteTenant(t)}
                      disabled={tenants.length <= 1 || deletingPath === t.subUrl}
                      className="p-1.5 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg transition-all border border-transparent hover:border-rose-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title={tenants.length <= 1 ? "At least one branch profile must remain active" : `Delete ${t.subUrl} Branch`}
                    >
                      {deletingPath === t.subUrl ? (
                        <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs pt-1 border-t border-slate-50">
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Owner Credentials</span>
                    <span className="text-slate-700 font-semibold font-mono font-bold block mt-0.5 break-all">
                      ID: {t.ownerId} | PW: {t.ownerPassword}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Allowed Marks</span>
                    <span className="text-slate-700 font-bold uppercase truncate block mt-0.5">{(t.marks || []).join(', ')}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Sub-Users List</span>
                    <span className="text-slate-700 font-medium break-words block mt-0.5">{(t.subUsers || []).join(', ')}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Database Status</span>
                    <span className="text-emerald-800 font-semibold truncate block mt-0.5">
                      {import.meta.env.VITE_SUPABASE_URL ? '🟢 SUPABASE ACTIVE' : '🔴 LOCAL MOCK MODE'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Shareable Setup Links for this branch */}
              <div className="pl-1 sm:pl-2 border-t border-slate-100 pt-3 sm:pt-4 space-y-2 sm:space-y-3">
                <div className="flex justify-between items-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Entry Links</span>
                  {t.companyName && (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded truncate max-w-[180px]">
                      {t.companyName}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {/* Shareable Link */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[10px]">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-bold text-slate-500 uppercase tracking-wider block text-[9px]">Shareable Link (Clean & Simple)</span>
                      {t.companyName && (
                        <span className="text-[10px] font-extrabold text-emerald-800">{t.companyName}</span>
                      )}
                    </div>
                    <a 
                      href={`${window.location.origin}${window.location.pathname}#${t.subUrl}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="font-mono text-indigo-600 hover:underline break-all mt-0.5 block"
                    >
                      {window.location.origin}{window.location.pathname}#{t.subUrl}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Slide-Up Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0" onClick={() => setIsFormOpen(false)} />
          <div className="w-full max-w-lg md:max-w-xl lg:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-premium border-t sm:border border-slate-100 p-4 sm:p-6 lg:p-7 space-y-4 z-10 max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain">
            {/* Mobile Sheet Drag Handle */}
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-2 sm:hidden shrink-0" />
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {formType === 'create' ? 'Create Branch Profile' : 'Edit Branch Profile'}
                </h3>
                <p className="text-xs text-slate-500">Configure parameters for dynamic sub URL routing</p>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3.5 bg-rose-50 text-rose-800 border border-rose-100 rounded-xl flex gap-2 text-xs font-medium">
                <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveTenant} className="space-y-4">
              {/* Company Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Company Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BRT Spices, AgroSync Logistics"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-bold text-slate-800"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Company name displayed on Client Entry Links page and reports.
                </p>
              </div>

              {/* Sub-URL Code */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Sub-URL Routing Path (e.g. /Agro/Test1/)
                </label>
                <input
                  type="text"
                  required
                  disabled={formType === 'edit'}
                  placeholder="e.g. /Agro/Test1/"
                  value={subUrl}
                  onChange={(e) => setSubUrl(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  The routing path code mapping. Example: entering <code className="bg-slate-100 px-1 rounded">/Agro/Test1/</code> creates a site resolved at that link.
                </p>
              </div>

              {/* Branch Sheet URL defaulted to global */}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Owner Login ID */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Owner Login ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Agro or BRT"
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-bold font-mono"
                  />
                </div>

                {/* Owner Login Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Owner Passcode / Password
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1234"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-bold font-mono"
                  />
                </div>
              </div>

              {/* Authorized Sub-Users Section */}
              <div className="space-y-2.5 border border-slate-200 rounded-2xl p-3.5 bg-slate-50/70">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Authorized Sub-Users ({subUsersList.length})
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Name & Passcode mapping
                  </span>
                </div>

                {/* Sub-users list */}
                {subUsersList.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                      <div className="col-span-6 sm:col-span-7">Sub-User Name</div>
                      <div className="col-span-5 sm:col-span-4">Password / Passcode</div>
                      <div className="col-span-1 text-center"></div>
                    </div>
                    {subUsersList.map((su, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-6 sm:col-span-7">
                          <input
                            type="text"
                            placeholder="e.g. Ramesh"
                            value={su.name}
                            onChange={(e) => handleUpdateSubUser(idx, 'name', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white text-xs font-semibold text-slate-800 transition-all shadow-2xs"
                          />
                        </div>
                        <div className="col-span-5 sm:col-span-4">
                          <input
                            type="text"
                            placeholder="Passcode"
                            value={su.password}
                            onChange={(e) => handleUpdateSubUser(idx, 'password', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white text-xs font-mono font-bold text-slate-800 transition-all shadow-2xs"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveSubUser(idx)}
                            title="Remove sub-user"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Sub-User Input Row */}
                <div className="pt-2 border-t border-slate-200/80">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="New sub-user name (e.g. Ramesh)"
                        value={newSubUserName}
                        onChange={(e) => {
                          setNewSubUserName(e.target.value);
                          if (subUserError) setSubUserError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubUser();
                          }
                        }}
                        className={`w-full px-3 py-2 bg-white border rounded-xl focus:border-indigo-600 text-xs font-semibold text-slate-800 transition-all shadow-2xs ${
                          subUserError && !newSubUserName.trim() ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                        }`}
                      />
                    </div>
                    <div className="w-full sm:w-44">
                      <input
                        type="text"
                        placeholder="Password (e.g. 1234)"
                        value={newSubUserPassword}
                        onChange={(e) => {
                          setNewSubUserPassword(e.target.value);
                          if (subUserError) setSubUserError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubUser();
                          }
                        }}
                        className={`w-full px-3 py-2 bg-white border rounded-xl focus:border-indigo-600 text-xs font-mono font-bold text-slate-800 transition-all shadow-2xs ${
                          subUserError && !newSubUserPassword.trim() ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                        }`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddSubUser}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/20 transition-all shrink-0 active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      Add Sub-User
                    </button>
                  </div>
                  
                  {subUserError ? (
                    <div className="flex items-center gap-1.5 p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold mt-2 animate-fadeIn">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{subUserError}</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      Both sub-user name and passcode are required when adding a new sub-user.
                    </p>
                  )}
                </div>
              </div>

              {/* Brand Marks Section */}
              <div className="space-y-2.5 border border-slate-200 rounded-2xl p-3.5 bg-slate-50/70">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Allowed Marks / Brands ({marksList.length})
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    At least one brand mark required
                  </span>
                </div>

                {/* Add Mark Input Row */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter mark name (e.g. BRT, RS, TS)"
                    value={newMarkInput}
                    onChange={(e) => {
                      setNewMarkInput(e.target.value);
                      if (markError) setMarkError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMark();
                      }
                    }}
                    className={`flex-1 px-3 py-2 bg-white border rounded-xl focus:border-indigo-600 text-xs font-bold font-mono uppercase text-slate-800 transition-all shadow-2xs ${
                      markError ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleAddMark}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 transition-all shrink-0 active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    Add Mark
                  </button>
                </div>

                {markError && (
                  <div className="flex items-center gap-1.5 p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold animate-fadeIn">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{markError}</span>
                  </div>
                )}

                {/* Added Marks Display List */}
                <div className="flex flex-wrap gap-1.5 p-2.5 bg-white border border-slate-200 rounded-xl min-h-[44px] items-center">
                  {marksList.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">No marks added yet. Enter a mark name above and click Add Mark.</span>
                  ) : (
                    marksList.map((m, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-150 text-indigo-800 font-bold font-mono text-xs rounded-lg shadow-2xs group"
                      >
                        <span>{m}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMark(idx)}
                          className="text-indigo-400 hover:text-rose-600 hover:bg-rose-50 p-0.5 rounded transition-colors"
                          title={`Remove ${m}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Commission Agents Section */}
              <div className="space-y-2.5 border border-slate-200 rounded-2xl p-3.5 bg-slate-50/70">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Allowed Commission Agent Names ({agentsList.length})
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Commission agents for transactions
                  </span>
                </div>

                {/* Add Agent Input Row */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter commission agent name (e.g. Patel Agro)"
                    value={newAgentInput}
                    onChange={(e) => {
                      setNewAgentInput(e.target.value);
                      if (agentError) setAgentError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddAgent();
                      }
                    }}
                    className={`flex-1 px-3 py-2 bg-white border rounded-xl focus:border-indigo-600 text-xs font-medium text-slate-800 transition-all shadow-2xs ${
                      agentError ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleAddAgent}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 transition-all shrink-0 active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    Add Agent
                  </button>
                </div>

                {agentError && (
                  <div className="flex items-center gap-1.5 p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold animate-fadeIn">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{agentError}</span>
                  </div>
                )}

                {/* Added Agents Display List */}
                <div className="flex flex-wrap gap-1.5 p-2.5 bg-white border border-slate-200 rounded-xl min-h-[44px] items-center">
                  {agentsList.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">No agent names added yet. Enter an agent name above and click Add Agent.</span>
                  ) : (
                    agentsList.map((a, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-xs rounded-lg shadow-2xs group"
                      >
                        <span>{a}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAgent(idx)}
                          className="text-emerald-500 hover:text-rose-600 hover:bg-rose-50 p-0.5 rounded transition-colors"
                          title={`Remove ${a}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-semibold transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1.5"
                >
                  <Save className="h-4.5 w-4.5" />
                  Save Profile Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Branch Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-premium border-t sm:border border-slate-100 p-5 sm:p-6 space-y-4 animate-slide-up max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain">
            {/* Mobile Sheet Drag Handle */}
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-2 sm:hidden shrink-0" />

            <div className="text-center pb-2 border-b border-slate-100">
              <div className="h-12 w-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-2.5 shadow-sm">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-800">Delete Branch Profile</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Are you sure you want to delete this branch?
              </p>
            </div>

            <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-rose-700 font-bold uppercase tracking-wider text-[10px]">Branch Sub-URL</span>
                <span className="font-mono font-bold text-rose-950 bg-white px-2.5 py-1 rounded-lg border border-rose-200 shadow-2xs">
                  {deleteConfirmTarget.subUrl}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium">Owner ID:</span>
                <span className="font-semibold text-slate-800 font-mono">{deleteConfirmTarget.ownerId}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium">Sub-Users Assigned:</span>
                <span className="font-semibold text-slate-800">{deleteConfirmTarget.subUsers?.length || 0} users</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium">Allowed Brands / Marks:</span>
                <span className="font-semibold text-slate-800">{deleteConfirmTarget.marks?.length || 0} marks</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200/70 rounded-xl flex gap-2.5 text-xs text-amber-900 leading-normal font-medium">
              <AlertCircle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                This will remove the branch routing configuration, credentials, and synchronize this deletion to the cloud database.
              </span>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                disabled={!!deletingPath}
                className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteTenant}
                disabled={!!deletingPath}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5"
              >
                {deletingPath ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>Delete Branch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Connect Modal */}
      <SupabaseConnectModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        onConnected={() => setSupabaseCreds(getSupabaseCredentials())}
      />
    </div>
  );
};
