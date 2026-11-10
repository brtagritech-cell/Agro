import { useState, useEffect } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { OwnerDashboard } from './components/OwnerDashboard';
import { MasterDataGrid } from './components/MasterDataGrid';
import { SubUserDashboard } from './components/SubUserDashboard';
import { 
  fetchTransactions, 
  addTransaction, 
  updateWeight, 
  deleteTransaction, 
  editTransaction, 
  setScriptUrl, 
  getCurrentSubUrl, 
  getCurrentTenant, 
  type Transaction 
} from './services/sheetService';
import { LogOut, LayoutDashboard, FileSpreadsheet, CheckCircle, AlertTriangle, X, Zap } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { SupabaseConnectModal } from './components/SupabaseConnectModal';

const getSubRouteStorageKey = (prefix: string) => {
  const subUrl = getCurrentSubUrl();
  const slug = subUrl.replace(/\//g, '').toLowerCase() || 'root';
  return `${prefix}_${slug}`;
};

function App() {
  const currentTenant = getCurrentTenant();
  const [userRole, setUserRole] = useState<'Owner' | 'Sub-User' | null>(() => {
    const key = getSubRouteStorageKey('agrosync_user_role');
    return (sessionStorage.getItem(key) as 'Owner' | 'Sub-User') || null;
  });
  const [subUserName, setSubUserName] = useState<string>(() => {
    const key = getSubRouteStorageKey('agrosync_sub_user_name');
    return sessionStorage.getItem(key) || '';
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ledger'>('dashboard');
  const [isAdminView, setIsAdminView] = useState<boolean>(false);
  const [isDbModalOpen, setIsDbModalOpen] = useState<boolean>(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Fetch transactions and check query params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scriptUrlParam = params.get('script_url');
    
    if (scriptUrlParam) {
      setScriptUrl(scriptUrlParam);
      setToast({
        message: 'Successfully connected to Google Sheet database from shared link!',
        type: 'success'
      });
      // Clear query params to clean address bar
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
      
      // Auto-hide toast after 4 seconds
      setTimeout(() => {
        setToast(null);
      }, 4000);
    }

    // Check if current path/sub-url is /admin/
    const currentSubUrl = getCurrentSubUrl();
    if (currentSubUrl === '/admin/') {
      setIsAdminView(true);
    }
    
    loadData();

    // Listen to hash changes (switching between branch sub routes)
    const handleLocationChange = () => {
      const activeSubUrl = getCurrentSubUrl();
      if (activeSubUrl === '/admin/') {
        setIsAdminView(true);
      } else {
        setIsAdminView(false);
      }

      // Re-read role and subUserName strictly for this specific sub route
      const roleKey = getSubRouteStorageKey('agrosync_user_role');
      const userKey = getSubRouteStorageKey('agrosync_sub_user_name');
      const savedRole = sessionStorage.getItem(roleKey) as 'Owner' | 'Sub-User' | null;
      const savedUser = sessionStorage.getItem(userKey) || '';

      setUserRole(savedRole);
      setSubUserName(savedUser);
      loadData();
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchTransactions();
      // Sort transactions by date descending, then timestamp descending
      const sorted = [...data].sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      setTransactions(sorted);
    } catch (e) {
      console.error("Failed loading data", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (role: 'Owner' | 'Sub-User', name?: string) => {
    setUserRole(role);
    const roleKey = getSubRouteStorageKey('agrosync_user_role');
    const userKey = getSubRouteStorageKey('agrosync_sub_user_name');
    sessionStorage.setItem(roleKey, role);
    if (name) {
      setSubUserName(name);
      sessionStorage.setItem(userKey, name);
    } else {
      setSubUserName('');
      sessionStorage.removeItem(userKey);
    }
    loadData(); // Reload data on login to fetch latest sheet content
  };

  const handleLogout = () => {
    setUserRole(null);
    setSubUserName('');
    const roleKey = getSubRouteStorageKey('agrosync_user_role');
    const userKey = getSubRouteStorageKey('agrosync_sub_user_name');
    sessionStorage.removeItem(roleKey);
    sessionStorage.removeItem(userKey);
    setActiveTab('dashboard');
  };

  const handleEnterAdmin = () => {
    setIsAdminView(true);
    const params = new URLSearchParams(window.location.search);
    params.set('site', '/admin/');
    const newUrl = window.location.pathname + '?' + params.toString() + window.location.hash;
    window.history.replaceState({}, document.title, newUrl);
  };

  const handleExitAdmin = () => {
    setIsAdminView(false);
    const params = new URLSearchParams(window.location.search);
    if (params.get('site') === '/admin/') {
      params.delete('site');
    }
    let hash = window.location.hash;
    if (hash === '#/admin/' || hash === '#/admin') {
      hash = '';
    }
    const cleanUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + hash;
    window.history.replaceState({}, document.title, cleanUrl);
    loadData();
  };


  const handleAddTransaction = async (tx: Omit<Transaction, 'totalValue'>) => {
    setIsLoading(true);
    const result = await addTransaction(tx);
    await loadData(); // Reload fresh state
    setIsLoading(false);
    return result;
  };

  const handleUpdateWeight = async (
    txId: string, 
    weightVal?: string, 
    rate?: number, 
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
  ) => {
    setIsLoading(true);
    const result = await updateWeight(
      txId, 
      weightVal, 
      rate, 
      rateReason, 
      bags, 
      mark, 
      totalValue, 
      lockedBy,
      subUserName,
      subUserTimestamp,
      grossWeight,
      bagsWeight,
      netWeight,
      calculatedAmount
    );
    await loadData(); // Reload fresh state
    setIsLoading(false);
    return result;
  };

  const handleDeleteTransaction = async (txId: string) => {
    setIsLoading(true);
    const result = await deleteTransaction(txId);
    await loadData();
    setIsLoading(false);
    setToast({
      message: result.message,
      type: result.success ? 'success' : 'error'
    });
    return result;
  };

  const handleEditTransaction = async (originalTxId: string, updatedData: Partial<Transaction>) => {
    setIsLoading(true);
    const result = await editTransaction(originalTxId, updatedData);
    await loadData();
    setIsLoading(false);
    setToast({
      message: result.message,
      type: result.success ? 'success' : 'error'
    });
    return result;
  };

  const renderToast = () => {
    if (!toast) return null;
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:max-w-sm z-50 animate-slide-up">
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-semibold shadow-lg ${
          toast.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
            : toast.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-100'
              : 'bg-indigo-50 text-indigo-800 border-indigo-100'
        }`}>
          {toast.type === 'success' && <CheckCircle className="h-4.5 w-4.5 text-emerald-600 shrink-0" />}
          {toast.type === 'error' && <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0" />}
          <span className="flex-grow break-words">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-600 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  // Admin View check
  if (isAdminView) {
    return (
      <>
        <AdminDashboard onExitAdmin={handleExitAdmin} />
        {renderToast()}
      </>
    );
  }

  // Not Logged In -> Login Screen
  if (userRole === null) {
    return (
      <>
        <LoginScreen onLoginSuccess={handleLogin} onEnterAdmin={handleEnterAdmin} />
        {renderToast()}
      </>
    );
  }

  // Sub-User Layout (Targeted Utility Screen)
  if (userRole === 'Sub-User') {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#F8F9FA] py-3 sm:py-6 lg:py-8 px-2 sm:px-6 lg:px-8 w-full max-w-full flex flex-col justify-start items-center">
        <div className="w-full max-w-5xl">
          <SubUserDashboard
            transactions={transactions}
            onUpdateWeight={handleUpdateWeight}
            onRefresh={loadData}
            isLoading={isLoading}
            onLogout={handleLogout}
            subUserName={subUserName}
          />
        </div>
        {renderToast()}
      </div>
    );
  }

  // Owner Layout (Calendar & Master Grid Tabs)
  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#F8F9FA] flex flex-col w-full max-w-full">
      
      {/* Premium Header Nav Bar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/50 w-full">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          {/* Logo Brand */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-md shadow-red-600/20">
              <span className="relative inline-block w-5 h-5 sm:w-5.5 sm:h-5.5 shrink-0">
                <style dangerouslySetInnerHTML={{__html: `
                  @keyframes header-chilli-wiggle {
                    0%, 100% { transform: rotate(0deg); }
                    25% { transform: rotate(-8deg); }
                    75% { transform: rotate(8deg); }
                  }
                  .header-chilli {
                    animation: header-chilli-wiggle 1.8s ease-in-out infinite;
                    transform-origin: center bottom;
                  }
                `}} />
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 32 32" 
                  className="w-5 h-5 sm:w-5.5 sm:h-5.5 header-chilli"
                  fill="none"
                >
                  <path d="M15 4 C14 2, 18 1, 17 4 C17 5, 18 6, 16 7 C14.5 7.5, 13.5 6, 13.5 5 C13.5 4, 14.5 4.5, 15 4 Z" fill="#22c55e" />
                  <path d="M16 7 C21 11, 23 17, 21 22 C19 26, 15 29, 11 30 C10 30.2, 9.5 29.5, 10 29 C13 26, 16 22, 16.5 17 C17 12, 15.5 8.5, 16 7 Z" fill="#ef4444" />
                  <path d="M17.2 8.5 C20.2 12, 21.2 16.5, 19.8 20.5 C19 22.8, 17.5 24.8, 15.8 26.2 C15.5 26.4, 15.2 26.1, 15.3 25.8 C16.8 23.5, 18.2 20, 18.2 16.5 C18.2 13, 17.2 10, 17.2 8.5 Z" fill="#f87171" opacity="0.6" />
                </svg>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">AgroSync</span>
                <span className="text-slate-300 leading-none">•</span>
                <span className="text-[9px] sm:text-[10px] font-bold text-red-600 uppercase tracking-wider leading-none">Owner Portal</span>
              </div>
              {currentTenant?.companyName ? (
                <h1 className="text-sm sm:text-base lg:text-lg font-black text-emerald-800 tracking-tight leading-tight mt-0.5">
                  {currentTenant.companyName}
                </h1>
              ) : (
                <h1 className="text-xs sm:text-sm lg:text-base font-bold text-slate-800 leading-none mt-0.5">AgroSync</h1>
              )}
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <div className="hidden sm:flex bg-slate-100 p-0.5 sm:p-1 rounded-xl border border-slate-200/40">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600" />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'ledger'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600" />
              <span>Ledger</span>
            </button>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setIsDbModalOpen(true)}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-700 bg-slate-100/80 hover:bg-emerald-50 rounded-xl transition-all border border-slate-200/50"
              title="Cloud Database Connection"
            >
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span className="hidden md:inline">Database</span>
            </button>

            {/* Log Out */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100 shrink-0"
              title="Log Out"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace with extra bottom padding on mobile for the bottom navigation bar */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-2.5 sm:px-6 lg:px-8 py-3 sm:py-6 lg:py-8 pb-32 sm:pb-8">
        {activeTab === 'dashboard' ? (
          <OwnerDashboard
            transactions={transactions}
            onAddTransaction={handleAddTransaction}
            onUpdateWeight={handleUpdateWeight}
            onDeleteTransaction={handleDeleteTransaction}
            onEditTransaction={handleEditTransaction}
            onTabChange={setActiveTab}
            onRefresh={loadData}
          />
        ) : (
          <MasterDataGrid
            transactions={transactions}
            onRefresh={loadData}
            isLoading={isLoading}
            onDeleteTransaction={handleDeleteTransaction}
            onEditTransaction={handleEditTransaction}
          />
        )}
      </main>

      {/* Mobile App Bottom Navigation Bar (iOS / Android Style) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 px-2 py-1 flex justify-around items-center sm:hidden safe-bottom shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all app-tap min-w-[64px] ${
            activeTab === 'dashboard'
              ? 'text-red-600 font-bold'
              : 'text-slate-400 hover:text-slate-600 font-medium'
          }`}
        >
          <LayoutDashboard className={`h-5 w-5 ${activeTab === 'dashboard' ? 'text-red-600' : 'text-slate-400'}`} />
          <span className="text-[10px] mt-0.5 leading-none">Calendar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all app-tap min-w-[64px] ${
            activeTab === 'ledger'
              ? 'text-red-600 font-bold'
              : 'text-slate-400 hover:text-slate-600 font-medium'
          }`}
        >
          <FileSpreadsheet className={`h-5 w-5 ${activeTab === 'ledger' ? 'text-red-600' : 'text-slate-400'}`} />
          <span className="text-[10px] mt-0.5 leading-none">Ledger</span>
        </button>

        <button
          type="button"
          onClick={() => setIsDbModalOpen(true)}
          className="flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-slate-400 hover:text-emerald-600 font-medium transition-all app-tap min-w-[64px]"
        >
          <Zap className="h-5 w-5 text-amber-500" />
          <span className="text-[10px] mt-0.5 leading-none">Database</span>
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-slate-400 hover:text-rose-600 font-medium transition-all app-tap min-w-[64px]"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[10px] mt-0.5 leading-none">Logout</span>
        </button>
      </nav>

      {/* Cloud Database Connection Modal */}
      <SupabaseConnectModal
        isOpen={isDbModalOpen}
        onClose={() => setIsDbModalOpen(false)}
        onConnected={loadData}
      />

      {/* Footer (Desktop / Tablet) */}
      <footer className="hidden sm:block bg-white border-t border-slate-100 py-3 sm:py-4 px-4 text-center text-[10px] sm:text-xs text-slate-400 break-words">
        <div className="max-w-7xl mx-auto">
          <p>&copy; {new Date().getFullYear()} AgroSync agricultural logistics. Active route: <code className="bg-slate-50 px-1.5 py-0.5 rounded font-mono font-semibold">{getCurrentSubUrl()}</code></p>
        </div>
      </footer>

      {renderToast()}
    </div>
  );
}

export default App;
