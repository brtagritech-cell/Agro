import React, { useState, useRef, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Weight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  LogOut, 
  Inbox,
  RefreshCw,
  Scale,
  X,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowRight,
  Check
} from 'lucide-react';
import { type Transaction, isGoogleSheetsEnabled, getCurrentTenant } from '../services/sheetService';

const getFirstThreeDigits = (num: number): number => {
  const intPartStr = Math.floor(num).toString();
  if (intPartStr.length >= 3) {
    return parseInt(intPartStr.slice(0, 3), 10);
  }
  return num;
};

interface SubUserDashboardProps {
  transactions: Transaction[];
  onUpdateWeight: (
    transactionId: string, 
    weight?: string, 
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
  ) => Promise<{ success: boolean; message: string }>;
  onRefresh: () => void;
  isLoading: boolean;
  onLogout: () => void;
  subUserName?: string;
}

export const SubUserDashboard: React.FC<SubUserDashboardProps> = ({
  transactions,
  onUpdateWeight,
  onRefresh,
  isLoading,
  onLogout,
  subUserName = ''
}) => {
  // Modal states
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [step, setStep] = useState<'entry' | 'confirm'>('entry');
  
  // Weights array state
  const [bagWeights, setBagWeights] = useState<string[]>([]);
  
  const currentTenant = getCurrentTenant();
  const bagCost = currentTenant?.bagCost ?? 25;
  const taram = currentTenant?.taram ?? 1.100;

  // Re-confirmation states
  const [confirmedRate, setConfirmedRate] = useState('');
  const [confirmedMark, setConfirmedMark] = useState<string>((currentTenant?.marks || [])[0] || 'BRT');
  const [rateReason, setRateReason] = useState('');

  useEffect(() => {
    if (currentTenant?.marks && currentTenant.marks.length > 0) {
      setConfirmedMark(currentTenant.marks[0]);
    }
  }, [currentTenant.subUrl]);
  
  // Submit states
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  
  // Ref for scrollable bag weights list container
  const listRef = useRef<HTMLDivElement>(null);

  // Get today's local date string in YYYY-MM-DD format
  const getTodayDateString = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = getTodayDateString();

  // Filter transactions for that particular date only
  const todayTransactions = transactions.filter(tx => tx.date === todayStr);

  // Sort today's transactions: open (no weight) on top, completed (has weight) on bottom.
  const sortedTodayTransactions = [...todayTransactions].sort((a, b) => {
    const aHasWeight = !!(a.weight && a.weight.trim() !== '');
    const bHasWeight = !!(b.weight && b.weight.trim() !== '');
    if (aHasWeight && !bHasWeight) return 1;  // a (completed) goes down
    if (!aHasWeight && bHasWeight) return -1; // a (open) goes up
    return 0;
  });

  // Count pending transactions for today (no weight recorded yet)
  const pendingTodayCount = todayTransactions.filter(tx => !tx.weight || tx.weight.trim() === '').length;

  const normalizeMark = (markStr: string): string => {
    const clean = (markStr || '').toUpperCase().trim();
    if (currentTenant?.marks && currentTenant.marks.includes(clean)) {
      return clean;
    }
    return (currentTenant?.marks || [])[0] || 'BRT';
  };

  const openWeightModal = async (tx: Transaction) => {
    // Safety check if already locked by someone else
    if (tx.lockedBy && tx.lockedBy !== subUserName) {
      alert(`${tx.lockedBy} is already working on this lot.`);
      return;
    }

    // Call API to set lock status
    const res = await onUpdateWeight(
      tx.transactionId,
      undefined, // weight
      undefined, // rate
      undefined, // rateReason
      undefined, // bags
      undefined, // mark
      undefined, // totalValue
      subUserName // lockedBy
    );

    if (res.success) {
      setSelectedTx(tx);
      // Initialize bag list starting with just 1 bag
      setBagWeights(['']);
      setConfirmedRate(tx.rate.toString());
      setConfirmedMark(normalizeMark(tx.mark));
      setRateReason('');
      setFeedback(null);
      setIsSaving(false);
      setStep('entry');
      onRefresh(); // Refresh parent queue to immediately sync and reflect lock
    } else {
      alert('Could not lock the transaction: ' + res.message);
    }
  };

  const closeWeightModal = async () => {
    if (selectedTx) {
      // Clear lock status
      await onUpdateWeight(
        selectedTx.transactionId,
        undefined, // weight
        undefined, // rate
        undefined, // rateReason
        undefined, // bags
        undefined, // mark
        undefined, // totalValue
        "" // clear lockedBy
      );
    }
    setSelectedTx(null);
    setStep('entry');
    onRefresh(); // Refresh queue on release
  };

  const handleAddBagRow = () => {
    // Check if any existing weights are invalid (.123, .234, .185, etc)
    const hasInvalidWeights = bagWeights.some(isWeightInvalid);
    if (hasInvalidWeights) {
      const firstInvalidIdx = bagWeights.findIndex(isWeightInvalid);
      setFeedback({ 
        success: false, 
        message: `Cannot add a new bag. Please correct invalid weight in Bag #${firstInvalidIdx + 1} (must be <= 60.000 kg and like .100, .200, .300).` 
      });
      
      // Auto-scroll to the first invalid row
      if (firstInvalidIdx !== -1 && listRef.current) {
        const children = listRef.current.children;
        if (children && children[firstInvalidIdx]) {
          children[firstInvalidIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
          const input = children[firstInvalidIdx].querySelector('input');
          if (input) input.focus();
        }
      }
      return;
    }
    setFeedback(null);

    setBagWeights(prev => [...prev, '']);
    setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollTo({
          top: listRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 60);
  };

  const handleRemoveBagRow = (idxToRemove: number) => {
    setBagWeights(prev => prev.filter((_, idx) => idx !== idxToRemove));
  };

  const handleWeightChange = (idx: number, value: string) => {
    setBagWeights(prev => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const handleWeightBlur = (idx: number) => {
    const value = bagWeights[idx];
    if (!value.trim()) return;
    
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0 && num <= 60 && /^\d+(\.[0-9]0*)?$/.test(value.trim())) {
      setBagWeights(prev => {
        const next = [...prev];
        next[idx] = num.toFixed(3);
        return next;
      });
      setFeedback(null);
    } else {
      // It has decimal format issues or is out of range!
      setFeedback({
        success: false,
        message: `Bag #${idx + 1} has an invalid weight. Weights must be <= 60.000 kg and only allow decimals like .100, .200.`
      });
      // Auto-scroll directly to center this specific row
      setTimeout(() => {
        if (listRef.current) {
          const children = listRef.current.children;
          if (children && children[idx]) {
            children[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
            const input = children[idx].querySelector('input');
            if (input) input.focus();
          }
        }
      }, 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddBagRow();
    }
  };

  const isWeightInvalid = (w: string): boolean => {
    if (!w.trim()) return false;
    const num = parseFloat(w);
    // Reject weights above 60.000 kg as invalid
    if (isNaN(num) || num <= 0 || num > 60) return true;
    return !/^\d+(\.[0-9]0*)?$/.test(w.trim());
  };

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    
    // Validate that all bag weight fields are populated
    const hasEmptyWeights = bagWeights.some(w => !w.trim());
    if (hasEmptyWeights) {
      const firstEmptyIdx = bagWeights.findIndex(w => !w.trim());
      setFeedback({ success: false, message: `All added bag rows must have weight entries. Check Bag #${firstEmptyIdx + 1}.` });
      
      // Auto-scroll to the first empty row
      if (firstEmptyIdx !== -1 && listRef.current) {
        const children = listRef.current.children;
        if (children && children[firstEmptyIdx]) {
          children[firstEmptyIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
          const input = children[firstEmptyIdx].querySelector('input');
          if (input) input.focus();
        }
      }
      return;
    }

    // Validate weights format (multiples of 0.1, max 60kg)
    const hasInvalidWeights = bagWeights.some(isWeightInvalid);
    if (hasInvalidWeights) {
      const firstInvalidIdx = bagWeights.findIndex(isWeightInvalid);
      setFeedback({ 
        success: false, 
        message: `Please correct invalid weight in Bag #${firstInvalidIdx + 1} (must be <= 60.000 kg and only allow decimals like .100, .200).` 
      });

      // Auto-scroll to the first invalid row
      if (firstInvalidIdx !== -1 && listRef.current) {
        const children = listRef.current.children;
        if (children && children[firstInvalidIdx]) {
          children[firstInvalidIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
          const input = children[firstInvalidIdx].querySelector('input');
          if (input) input.focus();
        }
      }
      return;
    }

    // Format all weights to 3 decimal places
    const formatted = bagWeights.map(w => {
      const num = parseFloat(w);
      return num.toFixed(3);
    });
    setBagWeights(formatted);
    
    setStep('confirm');
  };

  const handleConfirmSave = async () => {
    if (!selectedTx) return;
    setFeedback(null);

    const parsedRate = parseFloat(confirmedRate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setFeedback({ success: false, message: 'Rate must be a decimal value greater than 0.' });
      return;
    }

    // Rate validation checks
    const isRateChanged = Math.abs(parsedRate - selectedTx.rate) > 0.001;
    if (isRateChanged && !rateReason) {
      setFeedback({ success: false, message: 'Please select a reason for the rate modification.' });
      return;
    }

    setIsSaving(true);
    
    // Format each bag weight to 1 decimal place, then pad to 3 decimal places (e.g. 23.100)
    const formattedWeights = bagWeights.map(w => {
      const val = parseFloat(w) || 0;
      const rounded = Math.round(val * 10) / 10;
      return rounded.toFixed(3);
    });

    // Calculate total weight sum of formatted values (Gross Weight)
    const grossWeight = formattedWeights.reduce((sum, w) => sum + parseFloat(w), 0);
    const bagsCount = bagWeights.length;
    const bagsWeight = bagsCount * taram; // Bags Weight = bagsCount * taram
    const netWeight = Math.max(0, grossWeight - bagsWeight); // Net weight = Gross weight - Bags Weight
    const grossAmount = (netWeight * getFirstThreeDigits(parsedRate)) + (bagCost * bagsCount); // Net Gross Amount = (Net weight * Rate) + (Bag Cost * bagsCount)

    // Serialize weight breakdown: "150.600 kg [50.200, 50.100, 50.300]"
    const serializedWeights = `${grossWeight.toFixed(3)} kg [${formattedWeights.join(', ')}]`;

    // Bags / Mark comparison states
    const finalBags = bagWeights.length;
    const finalMark = confirmedMark;

    const res = await onUpdateWeight(
      selectedTx.transactionId, 
      serializedWeights, 
      parsedRate, 
      rateReason || undefined,
      finalBags,
      finalMark,
      grossAmount, // Pass Gross Amount as totalValue override
      "", // Clear lock status on save!
      subUserName,
      new Date().toISOString(),
      grossWeight,
      bagsWeight,
      netWeight,
      grossAmount
    );

    setIsSaving(false);
    setFeedback({ success: res.success, message: res.message });

    if (res.success) {
      setTimeout(() => {
        setSelectedTx(null); // Clear selectedTx directly without triggering closeWeightModal double-unlock call
        setStep('entry');
        onRefresh();
      }, 1200);
    }
  };

  const formatINR = (val: number | undefined | null) => {
    const num = (val === undefined || val === null || isNaN(val)) ? 0 : val;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(num);
  };

  // Mismatches validations
  const isBagsMismatch = selectedTx ? bagWeights.length !== selectedTx.bags : false;
  const isRateMismatch = selectedTx ? Math.abs(parseFloat(confirmedRate || '0') - selectedTx.rate) > 0.001 : false;
  const isMarkMismatch = selectedTx ? confirmedMark !== selectedTx.mark : false;
  const hasAnyMismatch = isBagsMismatch || isRateMismatch || isMarkMismatch;

  // Sum of bags logged by this subuser today
  const totalBagsLoggedToday = todayTransactions
    .filter(tx => tx.subUserName === subUserName && tx.weight && tx.weight.trim() !== '')
    .reduce((sum, tx) => sum + tx.bags, 0);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 sm:space-y-6 p-1 sm:p-2 pb-12 overflow-x-hidden">
      
      {/* Sub-User Terminal Header */}
      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-100 shadow-soft flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="h-9 w-9 sm:h-10 sm:w-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100 shrink-0">
            <FileSpreadsheet className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-sm sm:text-base font-bold text-slate-800">Sub-User Terminal</h2>
              {subUserName && (
                <span className="text-[9px] sm:text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-lg border border-slate-200/60 font-mono">
                  {subUserName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Weight Optimization Window</span>
              <span className={`inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.2 rounded-full border uppercase tracking-wider font-mono ${
                isGoogleSheetsEnabled() 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {isGoogleSheetsEnabled() ? (
                  <>
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Connected</span>
                  </>
                ) : (
                  <>
                    <span className="w-1 h-1 rounded-full bg-amber-500" />
                    <span>Mock Mode</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 text-slate-500 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 rounded-xl transition-all border border-slate-200/50"
            title="Refresh Queue"
          >
            <RefreshCw className={`h-4 w-4 sm:h-4.5 sm:w-4.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          
          <button
            onClick={onLogout}
            className="p-2 text-slate-500 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 rounded-xl transition-all border border-slate-200/50"
            title="Log Out"
          >
            <LogOut className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
          </button>
        </div>
      </div>

      {/* Supabase Sync Warning Banner */}
      {!isGoogleSheetsEnabled() && (
        <div className="p-3.5 sm:p-4 bg-amber-50/60 border border-amber-100/80 text-amber-800 rounded-2xl flex items-start gap-2.5 sm:gap-3 text-xs leading-relaxed shadow-soft">
          <AlertTriangle className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-amber-900">Local Mock Mode (Offline)</p>
            <p className="text-amber-700 font-medium">
              You are currently offline or in local mock database mode. Weight updates will not be shared with the owner. 
              Please ask the owner to configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sync your device.
            </p>
          </div>
        </div>
      )}

      {/* Queue Progress Summary Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
        {/* Pending Operations Card */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl shadow-lg shadow-emerald-700/15 flex items-center justify-between">
          <div className="space-y-0.5 sm:space-y-1">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-emerald-100">Pending Operations</span>
            <span className="block text-lg sm:text-xl font-bold font-mono">{pendingTodayCount} Lots</span>
          </div>
          <div className="bg-emerald-500/30 p-1.5 sm:p-2 rounded-xl border border-emerald-400/20 backdrop-blur-xs shrink-0">
            <Weight className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-emerald-100" />
          </div>
        </div>

        {/* Total Bags Logged Today Card */}
        <div className="bg-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl shadow-soft border border-slate-100 flex items-center justify-between">
          <div className="space-y-0.5 sm:space-y-1">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Bags Logged Today</span>
            <span className="block text-lg sm:text-xl font-bold font-mono text-slate-800">{totalBagsLoggedToday} Bags</span>
          </div>
          <div className="bg-slate-50 p-1.5 sm:p-2 rounded-xl border border-slate-200/50 shrink-0">
            <Inbox className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Rows list queue */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Tasks Queue</h3>

        {isLoading && sortedTodayTransactions.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-soft">
            <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-500">Loading ledger rows...</p>
          </div>
        ) : sortedTodayTransactions.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-soft">
            <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-700 text-sm">No Lots For Today</p>
            <p className="text-xs text-slate-400 mt-1">No transaction rows have been recorded for today's date yet.</p>
            <button
              onClick={onRefresh}
              className="mt-4 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
            >
              Refresh Check
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTodayTransactions.map((tx) => {
              const hasWeight = !!(tx.weight && tx.weight.trim() !== '');
              const isLockedByOther = !!(tx.lockedBy && tx.lockedBy !== subUserName);
              return (
                <div 
                  key={tx.transactionId}
                  className={`bg-white p-3.5 sm:p-4 rounded-xl border shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 transition-all duration-200 animate-fade-in ${
                    isLockedByOther
                      ? 'border-amber-200 bg-amber-50/10 opacity-80'
                      : hasWeight 
                        ? 'border-slate-200/40 opacity-75 bg-slate-50/20' 
                        : 'border-slate-200/60 hover:border-emerald-200'
                  }`}
                >
                  <div className="flex-grow space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="text-[9px] font-bold font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase">
                        Lot {tx.lot}
                      </span>
                      <h4 className="font-mono text-xs font-bold text-slate-800 break-all select-all">
                        {tx.transactionId}
                      </h4>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 bg-emerald-50 text-emerald-800 rounded border border-emerald-100/50">
                        {tx.mark}
                      </span>
                      {hasWeight && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded border border-slate-200/50 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Done
                        </span>
                      )}
                      {isLockedByOther && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded border border-amber-200 flex items-center gap-1">
                          🔒 {tx.lockedBy} is working
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-[11px] text-slate-500 font-medium">
                      <div>Agent: <span className="text-slate-700 font-bold break-words">{tx.agent}</span></div>
                      <div className="hidden sm:inline text-slate-300">•</div>
                      <div>Bags: <span className="text-slate-700 font-bold font-mono">{tx.bags} Bags</span></div>
                      <div className="hidden sm:inline text-slate-300">•</div>
                      <div>Rate: <span className="text-slate-700 font-semibold font-mono">{formatINR(tx.rate)}</span></div>
                      <div className="hidden sm:inline text-slate-300">•</div>
                      <div>Date: <span className="text-slate-700 font-mono">{tx.date}</span></div>
                      {hasWeight && (
                        <>
                          <div className="hidden sm:inline text-slate-300">•</div>
                          <div>Weight: <span className="text-emerald-700 font-bold font-mono break-all">{tx.weight}</span></div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center justify-end w-full sm:w-auto">
                    <button
                      onClick={() => openWeightModal(tx)}
                      disabled={hasWeight || isLockedByOther}
                      className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 font-semibold text-xs rounded-xl shadow-md transition-all ${
                        hasWeight
                          ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                          : isLockedByOther
                            ? 'bg-amber-100 border border-amber-200 text-amber-600 cursor-not-allowed shadow-none font-bold'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10 active:scale-[0.98]'
                      }`}
                    >
                      <Scale className="h-3.5 w-3.5" />
                      <span>
                        {hasWeight 
                          ? 'Weight Added' 
                          : isLockedByOther 
                            ? `${tx.lockedBy} is working` 
                            : 'Add Weight'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Weight Optimization Dynamic Entry Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="w-full sm:max-w-xl md:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-premium border-t sm:border border-slate-100 p-4 sm:p-6 lg:p-7 flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-slide-up">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Scale className="h-4.5 w-4.5 text-emerald-600" />
                  <span>{step === 'entry' ? 'Weight Optimization Entry' : 'Verify & Recheck Ledger'}</span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5 font-medium uppercase tracking-wider">
                  {step === 'entry' ? 'Enter Bag Weight Metrics' : 'Confirm Ledger Overrides'}
                </p>
              </div>
              <button 
                onClick={closeWeightModal}
                disabled={isSaving}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Target Lot Meta Box */}
            <div className="bg-slate-50/50 border border-slate-200/50 p-3 sm:p-3.5 rounded-xl text-xs space-y-1 mt-2.5 sm:mt-3 shrink-0">
              <div className="flex justify-between font-mono gap-2">
                <span className="text-slate-400 shrink-0">LOT {selectedTx.lot}</span>
                <span className="font-bold text-slate-800 break-all text-right">{selectedTx.transactionId}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 text-slate-600 font-medium pt-1 border-t border-slate-200/40">
                <div>Agent Name: <span className="text-slate-800 font-bold break-words">{selectedTx.agent}</span></div>
                <div>Original Mark: <span className="text-slate-800 font-bold uppercase">{selectedTx.mark}</span></div>
                <div>Owner Bags: <span className="text-slate-800 font-bold font-mono">{selectedTx.bags} Bags</span></div>
                <div>Owner Rate: <span className="text-slate-800 font-bold font-mono">{formatINR(selectedTx.rate)}</span></div>
              </div>
            </div>

            {/* Feedback alert messages */}
            {feedback && (
              <div className={`p-3 rounded-xl flex items-start gap-2.5 text-xs font-semibold mt-3 shrink-0 ${
                feedback.success 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                  : 'bg-rose-50 text-rose-800 border border-rose-100'
              }`}>
                {feedback.success ? (
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{feedback.message}</span>
              </div>
            )}

            {/* Step 1: Bag Weights List Entry */}
            {step === 'entry' && (
              <form onSubmit={handleProceedToConfirm} className="flex-grow flex flex-col overflow-hidden min-h-0 mt-4 space-y-4">
                <div className="flex justify-between items-center shrink-0">
                  <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Bag Weights List (kg)
                  </span>
                </div>

                {/* Weights input rows */}
                <div ref={listRef} className="flex-grow overflow-y-auto space-y-2 pr-1 border border-slate-100 rounded-xl p-2 bg-slate-50/20">
                  {bagWeights.map((weight, idx) => (
                    <div key={`bag-${idx}`} className="flex items-center gap-2 animate-fade-in">
                      <span className="w-14 text-[11px] text-slate-400 font-mono font-bold">
                        Bag #{idx + 1}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        placeholder="Weight in kg (e.g. 12.100)"
                        value={weight}
                        onChange={(e) => handleWeightChange(idx, e.target.value)}
                        onBlur={() => handleWeightBlur(idx)}
                        onKeyDown={handleKeyDown}
                        autoFocus={idx === bagWeights.length - 1 && idx > 0}
                        className={`flex-grow px-3 py-1.5 bg-white border rounded-lg text-xs font-semibold font-mono focus:ring-1 transition-all ${
                          isWeightInvalid(weight)
                            ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500 text-rose-900 bg-rose-50/30'
                            : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 text-slate-800'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveBagRow(idx)}
                        disabled={bagWeights.length <= 1}
                        className="p-1.5 text-slate-400 hover:text-rose-600 disabled:text-slate-200 hover:bg-rose-50 disabled:bg-transparent rounded-lg transition-all shrink-0"
                        title="Remove Bag"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Bag Button below the fields */}
                <button
                  type="button"
                  onClick={handleAddBagRow}
                  className="w-full py-2 border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/30 hover:bg-emerald-50/60 text-emerald-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Bag</span>
                </button>

                {/* Formulas & Calculations Metrics footer */}
                {(() => {
                  const gross = bagWeights.reduce((sum, w) => sum + (Math.round((parseFloat(w) || 0) * 10) / 10), 0);
                  const tare = bagWeights.length * taram;
                  const net = Math.max(0, gross - tare);
                  const currentRateInput = parseFloat(confirmedRate || (selectedTx ? selectedTx.rate.toString() : '0')) || 0;
                  const truncatedRateInput = getFirstThreeDigits(currentRateInput);
                  const calcGrossAmount = (net * truncatedRateInput) + (bagCost * bagWeights.length);
                  
                  return (
                    <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2 text-xs shrink-0 w-full">
                      <div className="flex justify-between font-semibold border-b border-slate-200/50 pb-1.5 mb-1 text-slate-500">
                        <span>Operational Calculations</span>
                        <span className="font-mono text-[10px]">TARE DEDUCTION: {taram.toFixed(3)} KG/BAG</span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-x-6 font-medium text-slate-600">
                        {/* Left Column */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between">
                            <span>Total Bags:</span>
                            <span className="font-bold text-slate-800 font-mono">{bagWeights.length} Bags</span>
                          </div>
                        </div>
                        {/* Right Column */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between">
                            <span>Gross Weight:</span>
                            <span className="font-bold text-slate-800 font-mono">{gross.toFixed(3)} kg</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Bags Weight (Tare):</span>
                            <span className="font-bold text-slate-800 font-mono">{tare.toFixed(3)} kg</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Net Weight:</span>
                            <span className="font-bold text-slate-700 font-mono">{net.toFixed(3)} kg</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-xs sm:text-sm font-bold text-slate-800">
                        <span className="text-[11px] sm:text-xs text-slate-500">Calculated Gross Amount:</span>
                        <span className="text-sm sm:text-base font-extrabold font-mono text-emerald-700">
                          {formatINR(calcGrossAmount)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-2 pt-2 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={closeWeightModal}
                    className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-1.5"
                  >
                    <span>Proceed to Confirm</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Comparative Recheck Dashboard */}
            {step === 'confirm' && (
              <div className="flex-grow flex flex-col justify-between overflow-y-auto mt-4 space-y-4">
                
                <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Ledger Re-confirmation Grid
                </span>

                {/* Comparison Grid Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="grid grid-cols-3 bg-slate-50 p-2 sm:p-2.5 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-[10px] sm:text-xs">
                    <div>Metric</div>
                    <div>Owner Value</div>
                    <div>Sub-User Value / Edit</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    
                    {/* Bags Comparison */}
                    <div className={`grid grid-cols-3 p-2 sm:p-3 items-center text-[11px] sm:text-xs ${isBagsMismatch ? 'bg-amber-50/50' : ''}`}>
                      <div className="font-semibold text-slate-500">Bags Count</div>
                      <div className="font-mono text-slate-700 font-bold">{selectedTx.bags} Bags</div>
                      <div className="font-mono text-slate-800 font-bold flex flex-wrap items-center gap-1">
                        <span>{bagWeights.length} Bags</span>
                        {isBagsMismatch && (
                          <span className="text-[9px] sm:text-[10px] text-amber-700 bg-amber-100 px-1 py-0.2 rounded font-sans font-bold">
                            Edited ({bagWeights.length - selectedTx.bags > 0 ? '+' : ''}{bagWeights.length - selectedTx.bags})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Rate / Amount Confirmation */}
                    <div className={`grid grid-cols-3 p-2 sm:p-3 items-center text-[11px] sm:text-xs ${isRateMismatch ? 'bg-amber-50/50' : ''}`}>
                      <div className="font-semibold text-slate-500">Rate / Bag</div>
                      <div className="font-mono text-slate-700 font-bold">{formatINR(selectedTx.rate)}</div>
                      <div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={confirmedRate}
                          onChange={(e) => setConfirmedRate(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 focus:border-emerald-500 rounded text-xs font-mono font-bold"
                        />
                      </div>
                    </div>

                    {/* Mark Confirmation - Always editable */}
                    <div className={`grid grid-cols-3 p-2 sm:p-3 items-center text-[11px] sm:text-xs ${isMarkMismatch ? 'bg-amber-50/50' : ''}`}>
                      <div className="font-semibold text-slate-500">Brand / Mark</div>
                      <div className="font-bold text-slate-700 uppercase">{selectedTx.mark}</div>
                      <div>
                        <select
                          value={confirmedMark}
                          onChange={(e) => setConfirmedMark(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 focus:border-emerald-500 rounded text-xs font-bold uppercase cursor-pointer"
                        >
                          {(currentTenant?.marks || []).map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Rate reason block if changed */}
                {isRateMismatch && (
                  <div className="space-y-1.5 animate-fade-in bg-amber-50/40 p-3 rounded-xl border border-amber-200/50">
                    <label className="block text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      <span>Select Rate Modification Reason</span>
                    </label>
                    <select
                      value={rateReason}
                      onChange={(e) => setRateReason(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-medium cursor-pointer"
                    >
                      <option value="">-- Choose Reason --</option>
                      <option value="Low Quality">Low Quality</option>
                      <option value="Small Size">Small Size</option>
                      <option value="Bag Weights low">Bag Weights low</option>
                      <option value="Dark color">Dark color</option>
                      <option value="More white chillies">More white chillies</option>
                    </select>
                  </div>
                )}

                {/* Discrepancy warning banner */}
                {hasAnyMismatch ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2.5 text-xs text-amber-900 leading-normal font-medium">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Ledger Discrepancy Detected</p>
                      <p className="text-[10px] text-amber-700 mt-0.5">
                        You have modified parameters originally submitted by the Owner. A re-confirmation overrides click is strictly required to save updates to the master grid.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex gap-2.5 text-xs text-emerald-800 leading-normal font-semibold">
                    <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span>All verified metrics match the Owner's original ledger entry perfectly.</span>
                  </div>
                )}

                {/* Buttons block */}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setStep('entry')}
                    disabled={isSaving}
                    className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all"
                  >
                    Back to Entry
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSave}
                    disabled={isSaving || (isRateMismatch && !rateReason)}
                    className={`flex-1 py-2.5 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md ${
                      hasAnyMismatch
                        ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/10'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10'
                    }`}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : hasAnyMismatch ? (
                      'Confirm & Save Ledger'
                    ) : (
                      'Save Ledger'
                    )}
                  </button>
                </div>

              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
