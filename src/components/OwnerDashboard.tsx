import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Lock, 
  AlertTriangle,
  X,
  FileText,
  CheckCircle,
  HelpCircle,
  Clock,
  Database
} from 'lucide-react';
import { type Transaction, getShortAgentName, isGoogleSheetsEnabled, getCurrentTenant, getTenants, saveTenants } from '../services/sheetService';
import { ViewWeightDetailsModal } from './ViewWeightDetailsModal';

const getTodayISTString = (): string => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(new Date());
  } catch (e) {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const nd = new Date(utc + (3600000 * 5.5));
    const y = nd.getFullYear();
    const m = String(nd.getMonth() + 1).padStart(2, '0');
    const day = String(nd.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
};

const getISTDate = (): Date => {
  const [y, m, d] = getTodayISTString().split('-').map(Number);
  return new Date(y, m - 1, d);
};

interface OwnerDashboardProps {
  transactions: Transaction[];
  onAddTransaction: (tx: Omit<Transaction, 'totalValue'>) => Promise<{ success: boolean; message: string; data?: Transaction }>;
  onUpdateWeight: (
    transactionId: string, 
    weight?: string, 
    rate?: number, 
    rateReason?: string,
    bags?: number,
    mark?: string,
    totalValue?: number,
    lockedBy?: string
  ) => Promise<{ success: boolean; message: string }>;
  onTabChange: (tab: 'dashboard' | 'ledger') => void;
  onRefresh?: () => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  transactions,
  onAddTransaction,
  onUpdateWeight,
  onTabChange,
  onRefresh
}) => {
  const currentTenant = getCurrentTenant();

  // Calendar States
  const [currentDate, setCurrentDate] = useState<Date>(() => getISTDate());
  const [selectedDayEntries, setSelectedDayEntries] = useState<Transaction[]>([]);
  const [selectedDayString, setSelectedDayString] = useState<string>(() => getTodayISTString());

  // Form Bottom Sheet State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [lot, setLot] = useState('');
  const [bags, setBags] = useState('');
  const [rate, setRate] = useState('');
  const [agent, setAgent] = useState('');
  const [mark, setMark] = useState<string>((currentTenant?.marks || [])[0] || 'BRT');

  useEffect(() => {
    if (currentTenant?.marks && currentTenant.marks.length > 0) {
      setMark(currentTenant.marks[0]);
    }
  }, [currentTenant.subUrl]);

  // Master Data Modal states
  const [isMasterDataOpen, setIsMasterDataOpen] = useState(false);
  const [masterBagCost, setMasterBagCost] = useState<string>(String(currentTenant.bagCost ?? 25));
  const [masterTaram, setMasterTaram] = useState<string>(String(currentTenant.taram ?? 1.100));
  const [masterError, setMasterError] = useState('');
  const [isSavingMaster, setIsSavingMaster] = useState(false);

  useEffect(() => {
    setMasterBagCost(String(currentTenant.bagCost ?? 25));
    setMasterTaram(String(currentTenant.taram ?? 1.100));
  }, [currentTenant.subUrl, currentTenant.bagCost, currentTenant.taram]);

  const handleSaveMasterData = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterError('');
    const parsedCost = parseFloat(masterBagCost);
    const parsedTaram = parseFloat(masterTaram);

    if (isNaN(parsedCost) || parsedCost < 0) {
      setMasterError('Bag Cost must be a valid non-negative number.');
      return;
    }
    if (isNaN(parsedTaram) || parsedTaram <= 0) {
      setMasterError('Taram (Tare weight per bag) must be a positive number.');
      return;
    }

    setIsSavingMaster(true);
    try {
      const tenants = getTenants();
      const updated = tenants.map(t => {
        if (t.subUrl === currentTenant.subUrl) {
          return {
            ...t,
            bagCost: parsedCost,
            taram: parsedTaram
          };
        }
        return t;
      });
      saveTenants(updated);
      setIsMasterDataOpen(false);
      alert('Master Data updated successfully and sync scheduled!');
      window.location.reload();
    } catch (err) {
      setMasterError('Failed to save Master Data.');
    } finally {
      setIsSavingMaster(false);
    }
  };
  
  // Reusable weight details view state
  const [viewingTx, setViewingTx] = useState<Transaction | null>(null);
  
  // Lot conflict states
  const [conflictTransaction, setConflictTransaction] = useState<Transaction | null>(null);
  const [isConflictOpen, setIsConflictOpen] = useState(false);
  
  // Strict live system timestamp state
  const [liveTimestamp, setLiveTimestamp] = useState<Date>(new Date());

  const checkLotConflict = (lotVal: string) => {
    const trimmedLot = lotVal.trim();
    if (!trimmedLot) return;
    
    // Find conflict for current system date
    const yyyy = new Date().getFullYear();
    const mm = String(new Date().getMonth() + 1).padStart(2, '0');
    const dd = String(new Date().getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    
    const conflict = transactions.find(t => t.date === todayStr && t.lot.toLowerCase() === trimmedLot.toLowerCase());
    if (conflict) {
      setConflictTransaction(conflict);
      setIsConflictOpen(true);
    } else {
      setConflictTransaction(null);
    }
  };

  // Review Modal State
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewData, setReviewData] = useState<{
    timestamp: string;
    transactionId: string;
    date: string;
    lot: string;
    bags: number;
    rate: number;
    agent: string;
    mark: string;
  } | null>(null);
  
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  // Update live clock every second while form is open
  useEffect(() => {
    let timer: any;
    if (isFormOpen) {
      setLiveTimestamp(new Date());
      timer = setInterval(() => {
        setLiveTimestamp(new Date());
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isFormOpen]);

  // Update transaction view for the selected calendar day
  useEffect(() => {
    const daily = transactions.filter(t => t.date === selectedDayString);
    setSelectedDayEntries(daily);
  }, [selectedDayString, transactions]);

  // Helpers for Calendar grid construction
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  // Starting day index (0 = Sunday, 1 = Monday, etc.)
  // We align start of week: Sun = 0
  const firstDayIndex = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  const monthNames = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Select a calendar cell
  const handleSelectDay = (day: number) => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    setSelectedDayString(dateStr);
  };

  // Compile inputs and trigger Review step
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const parsedBags = parseInt(bags, 10);
    const parsedRate = parseFloat(rate);

    if (isNaN(parsedBags) || parsedBags <= 0) {
      setFormError('Number of bags must be an integer greater than 0.');
      return;
    }
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setFormError('Rate must be a decimal value greater than 0.');
      return;
    }
    if (!agent.trim()) {
      setFormError('Commission agent name is required.');
      return;
    }

    // Capture LOCKED timestamp at this exact submission moment
    const currentSystemTime = new Date();
    const isoString = currentSystemTime.toISOString();
    
    // Format YYYY-MM-DD
    const yyyy = currentSystemTime.getFullYear();
    const mm = String(currentSystemTime.getMonth() + 1).padStart(2, '0');
    const dd = String(currentSystemTime.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}-${mm}-${dd}`;
    
    // Format YYYYMMDD for transaction ID prefix
    const datePrefix = `${yyyy}${mm}${dd}`;

    const lotVal = lot.trim();
    if (!lotVal || !/^[a-zA-Z0-9]+$/.test(lotVal)) {
      setFormError('Lot Number must be alphanumeric (letters and numbers only, e.g. 12A, 22B).');
      return;
    }

    // Double check conflict on submit
    const conflict = transactions.find(t => t.date === formattedDate && t.lot.toLowerCase() === lotVal.toLowerCase());
    if (conflict) {
      setConflictTransaction(conflict);
      setIsConflictOpen(true);
      setFormError(`Lot Number ${lotVal} already exists on this date.`);
      return;
    }

    const paddedLot = /^\d+$/.test(lotVal) ? lotVal.padStart(2, '0') : lotVal;

    // Get short agent code
    const shortAgent = getShortAgentName(agent);

    // Compile unique Transaction ID
    // Format: [Date]-[Lot]-[Bags]-[ShortAgentName]-[Mark]
    // Example: 20260620-01-450-RAM-BRT
    const transactionId = `${datePrefix}-${paddedLot}-${parsedBags}-${shortAgent}-${mark}`;

    setReviewData({
      timestamp: isoString,
      transactionId,
      date: formattedDate,
      lot: lotVal,
      bags: parsedBags,
      rate: parsedRate,
      agent: agent.trim(),
      mark
    });

    setIsReviewOpen(true);
  };

  // Save the reviewed record to sheet/localDB
  const handleConfirmSave = async () => {
    if (!reviewData) return;
    setIsSubmitting(true);
    setSubmitResult(null);

    const payload = {
      timestamp: reviewData.timestamp,
      transactionId: reviewData.transactionId,
      date: reviewData.date,
      lot: reviewData.lot,
      bags: reviewData.bags,
      rate: reviewData.rate,
      agent: reviewData.agent,
      mark: reviewData.mark,
      weight: "" // Omitted from owner view, sub-user fills this later
    };

    const response = await onAddTransaction(payload);
    setIsSubmitting(false);
    
    if (response.success) {
      setSubmitResult({ success: true, message: response.message });
      // Reset form states
      setLot('');
      setBags('');
      setRate('');
      setAgent('');
      setMark('BRT');
      
      // Navigate to Ledger tab
      setTimeout(() => {
        setIsReviewOpen(false);
        setIsFormOpen(false);
        setSubmitResult(null);
        onTabChange('ledger');
      }, 1000);
    } else {
      setSubmitResult({ success: false, message: response.message || 'Error occurred.' });
    }
  };

  // Indian Rupee helper
  const formatINR = (val: number | undefined | null) => {
    const num = (val === undefined || val === null || isNaN(val)) ? 0 : val;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(num);
  };

  // Format system time for input display
  const formatLiveClock = (dateObj: Date) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  return (
    <div className="space-y-6">
      
      {/* Overview stats header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-soft">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800">Owner Terminal</h2>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-0.5">
            <span className="text-xs text-slate-500">Control hub and transaction scheduler</span>
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full select-none leading-none border uppercase tracking-wider font-mono ${
              isGoogleSheetsEnabled() 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {isGoogleSheetsEnabled() ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Supabase Connected</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Local Mock Mode</span>
                </>
              )}
            </span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={() => {
              setMasterError('');
              setIsMasterDataOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-semibold active:scale-[0.98] transition-all text-xs sm:text-sm cursor-pointer"
          >
            <Database className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-indigo-600" />
            Change Master Data
          </button>
          <button
            onClick={() => {
              setFormError('');
              setIsFormOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/25 active:scale-[0.98] transition-all text-xs sm:text-sm"
          >
            <Plus className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            Add New Transaction
          </button>
        </div>
      </div>

      {/* Supabase Sync Info Banner */}
      {!isGoogleSheetsEnabled() && (
        <div className="p-3.5 sm:p-4 bg-amber-50/60 border border-amber-100/80 text-amber-800 rounded-2xl flex items-start gap-3 text-xs leading-relaxed shadow-soft">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Supabase Database Sync is not configured</p>
            <p className="text-amber-700/90 font-medium">
              You are currently running in <strong>Local Mock Mode</strong>. Data changes are only saved locally on this browser. 
              To configure multi-device sync, please set the <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> in your <strong>.env</strong> file.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Calendar & Selected Date Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        
        {/* Calendar Card (takes 2 columns on large viewports) */}
        <div className="lg:col-span-2 bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-100 shadow-soft space-y-3 sm:space-y-4">
          
          {/* Calendar Navigation header */}
          <div className="flex justify-between items-center pb-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
              <CalendarIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-emerald-600" />
              <span>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
            </h3>
            <div className="flex gap-1.5">
              <button 
                onClick={handlePrevMonth}
                className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200/50 transition-all"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200/50 transition-all"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Grid Layout (7 cols for days of week) */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider py-1.5 border-y border-slate-50">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* Blank placeholders for alignment */}
            {Array.from({ length: firstDayIndex }).map((_, idx) => (
              <div key={`empty-${idx}`} className="aspect-square bg-slate-50/50 rounded-xl" />
            ))}

            {/* Calendar Day Grid */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const y = currentDate.getFullYear();
              const m = String(currentDate.getMonth() + 1).padStart(2, '0');
              const d = String(dayNum).padStart(2, '0');
              const cellDateStr = `${y}-${m}-${d}`;
              
              // Find transactions on this cell date
              const dayTxs = transactions.filter(t => t.date === cellDateStr);
              const dayBagsSum = dayTxs.reduce((sum, t) => sum + t.bags, 0);
              const hasTransactions = dayTxs.length > 0;
              const isSelected = selectedDayString === cellDateStr;

              return (
                <button
                  key={`day-${dayNum}`}
                  onClick={() => handleSelectDay(dayNum)}
                  className={`aspect-square p-0.5 sm:p-1 rounded-xl flex flex-col justify-between items-center transition-all border relative ${
                    isSelected 
                      ? 'ring-2 ring-emerald-500/80 border-emerald-600 z-1 bg-emerald-50/20' 
                      : hasTransactions
                      ? 'bg-emerald-50/60 hover:bg-emerald-100/60 border-emerald-100 text-emerald-800'
                      : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-700'
                  }`}
                >
                  {/* Day Number */}
                  <span className={`text-[10px] sm:text-xs font-semibold self-start ml-0.5 mt-0.5 ${
                    isSelected ? 'text-emerald-700 font-bold' : ''
                  }`}>
                    {dayNum}
                  </span>

                  {/* Micro-Metrics (sum of bags) */}
                  {hasTransactions && (
                    <span className="text-[8px] sm:text-[11px] font-bold font-mono tracking-tight bg-emerald-600 text-white rounded px-1 sm:px-1.5 py-0.2 sm:py-0.5 select-none leading-none max-w-full truncate mt-0.5 sm:mt-1 shadow-sm">
                      {dayBagsSum} B
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Overview */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-soft flex flex-col h-full justify-between">
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Selected Day Entries</span>
              <span className="text-sm font-bold text-slate-700 font-mono mt-0.5 block">{selectedDayString}</span>
            </div>

            {/* List of entries for the selected day */}
            <div className="space-y-2 overflow-y-auto max-h-[300px] scrollbar-none pr-1">
              {selectedDayEntries.length === 0 ? (
                <div className="text-center py-8 sm:py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <HelpCircle className="h-7 w-7 sm:h-8 sm:w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-500">No transactions recorded</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Click "Add New" to create one.</p>
                </div>
              ) : (
                selectedDayEntries.map((tx) => (
                  <div 
                    key={tx.transactionId}
                    className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/50 flex flex-col gap-1.5 transition-all text-xs"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-mono font-bold text-slate-800 tracking-tight select-all break-all text-xs">{tx.transactionId}</span>
                      <span className="font-bold text-[9px] uppercase px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded shrink-0">
                        {tx.mark}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-500">
                      <div>Agent: <span className="font-semibold text-slate-800 break-words">{tx.agent}</span></div>
                      <div>Bags: <span className="font-semibold text-slate-800 font-mono">{tx.bags}</span></div>
                      <div>Value: <span className="font-semibold text-emerald-700 font-mono">{formatINR(tx.totalValue)}</span></div>
                      <div>Weight: <span className="font-semibold text-slate-800 font-mono">{tx.weight ? 'Added' : 'Pending'}</span></div>
                    </div>
                    <div className="flex justify-between items-center mt-1 border-t border-slate-200/30 pt-1.5">
                      <span className="text-[10px] text-slate-400">LOT {tx.lot}</span>
                      <div className="flex items-center gap-1.5">
                        {(!tx.weight || tx.weight.trim() === '') && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (window.confirm(`Are you sure you want to archive transaction ${tx.transactionId}?`)) {
                                await onUpdateWeight(tx.transactionId, "Archived");
                              }
                            }}
                            className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-[10px] rounded-lg transition-all"
                          >
                            Archive
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setViewingTx(tx)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg transition-all shadow-sm"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <button
            onClick={() => onTabChange('ledger')}
            className="w-full mt-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 rounded-xl transition-all"
          >
            Open Master Ledger
          </button>
        </div>
      </div>

      {/* Slide-Up Bottom Sheet Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          {/* Close tap overlay */}
          <div className="absolute inset-0" onClick={() => setIsFormOpen(false)} />
          
          {/* Bottom Sheet Container */}
          <div className="w-full max-w-lg md:max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-premium border-t sm:border border-slate-100 p-4 sm:p-6 lg:p-7 space-y-4 animate-slide-up z-10 max-h-[92vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800">Add New Entry</h3>
                <p className="text-xs text-slate-500">Ledger transaction recording panel</p>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error alerts */}
            {formError && (
              <div className="p-3 sm:p-3.5 bg-rose-50 text-rose-800 border border-rose-100 rounded-xl flex gap-2 text-xs font-medium">
                <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              
              {/* Strict locked timestamp display */}
              <div className="bg-slate-50 border border-slate-200/50 p-3 sm:p-3.5 rounded-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Locked Entry Timestamp</span>
                    <span className="text-xs font-mono text-slate-700 font-bold mt-0.5 block break-all">
                      {formatLiveClock(liveTimestamp)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-100/50 uppercase select-none shrink-0">
                  <Lock className="h-3 w-3" />
                  <span>SECURE LOCK</span>
                </div>
              </div>

              {/* Lot Number (Alphanumeric) */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Lot Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1, 12A, 22B"
                  value={lot}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLot(val);
                    checkLotConflict(val);
                  }}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium"
                />
              </div>

              {/* Number of Bags (Integer) */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Number of Bags (Integer)
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  placeholder="e.g. 450"
                  value={bags}
                  onChange={(e) => setBags(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium"
                />
              </div>

              {/* Rate per Bag (Decimal) */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Amount / Rate per Bag (₹ INR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="e.g. 52.00"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium font-mono"
                />
              </div>

              {/* Commission Agent Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Commission Agent Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter full name (e.g. Ramesh Kumar)"
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium"
                />
              </div>

              {/* Mark Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Brand Name / Mark
                </label>
                <select
                  value={mark}
                  onChange={(e) => setMark(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium appearance-none cursor-pointer"
                >
                  {(currentTenant?.marks || []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Weight Restriction Note */}
              <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-lg flex gap-2 text-[10px] text-amber-800 leading-normal">
                <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  **Weight Restriction**: Sub-user is responsible for updating weight specifications. Entering physical weights is disabled under the Owner role scope.
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl active:scale-[0.98] transition-all text-sm shadow-md"
              >
                Compile & Review Transaction
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Mandatory Transaction Review Modal */}
      {isReviewOpen && reviewData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="w-full max-w-md md:max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-premium border border-slate-100 p-4 sm:p-6 lg:p-7 space-y-4 sm:space-y-5 animate-slide-up max-h-[92vh] overflow-y-auto">
            
            {/* Header */}
            <div className="text-center pb-2 border-b border-slate-100">
              <div className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-2">
                <FileText className="h-5.5 w-5.5" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Mandatory Ledger Review</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Please review code structures before compiling to ledger.</p>
            </div>

            {/* Generated Unique Transaction ID Banner */}
            <div className="bg-slate-50 p-3 sm:p-3.5 rounded-xl border border-slate-200/50 text-center font-mono">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Auto-Generated Transaction ID</span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 select-all break-all block mt-1">{reviewData.transactionId}</span>
            </div>

            {/* Review breakdown data grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
              <div className="sm:border-r border-slate-100 sm:pr-2">
                <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Agent</span>
                <span className="text-slate-800 font-bold mt-0.5 block break-words">{reviewData.agent}</span>
              </div>
              <div className="sm:pl-2">
                <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Brand / Mark</span>
                <span className="text-slate-800 font-bold uppercase mt-0.5 block">{reviewData.mark}</span>
              </div>
              <div className="sm:border-r border-slate-100 sm:pr-2 pt-1 border-t sm:border-t-0 border-slate-50">
                <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Date & Lot</span>
                <span className="text-slate-800 font-semibold font-mono mt-0.5 block">
                  {reviewData.date} (LOT {reviewData.lot})
                </span>
              </div>
              <div className="sm:pl-2 pt-1 border-t sm:border-t-0 border-slate-50">
                <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Bags & Rate</span>
                <span className="text-slate-800 font-semibold font-mono mt-0.5 block">
                  {reviewData.bags} Bags @ {formatINR(reviewData.rate)}
                </span>
              </div>
            </div>

            {/* Submit responses alert */}
            {submitResult && (
              <div className={`p-3 rounded-xl flex items-center gap-2.5 text-xs font-semibold ${
                submitResult.success 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                  : 'bg-rose-50 text-rose-800 border border-rose-100'
              }`}>
                {submitResult.success ? (
                  <CheckCircle className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                )}
                <span className="break-words">{submitResult.message}</span>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 sm:py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={isSubmitting}
                className="flex-1 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center"
              >
                {isSubmitting ? (
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  'Confirm & Ledger'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lot Conflict Warning Modal */}
      {isConflictOpen && conflictTransaction && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="w-full max-w-md md:max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-premium border border-slate-100 p-4 sm:p-6 lg:p-7 space-y-4 animate-slide-up max-h-[92vh] overflow-y-auto">
            <div className="text-center pb-1 border-b border-slate-100">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Duplicate Lot Alert</h3>
              <p className="text-xs text-rose-600 mt-1 font-semibold">Lot Number {conflictTransaction.lot} already exists for today ({conflictTransaction.date}).</p>
            </div>
            
            <div className="bg-slate-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/50 space-y-2 text-xs">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Existing Lot Details</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 sm:gap-y-2 text-slate-600 font-medium">
                <div>Transaction ID:</div>
                <div className="font-mono text-slate-800 font-bold break-all">{conflictTransaction.transactionId}</div>
                <div>Agent Name:</div>
                <div className="text-slate-800 font-bold break-words">{conflictTransaction.agent}</div>
                <div>Bags Count:</div>
                <div className="text-slate-800 font-bold font-mono">{conflictTransaction.bags} Bags</div>
                <div>Original Rate:</div>
                <div className="text-slate-800 font-bold font-mono">{formatINR(conflictTransaction.rate)}</div>
                <div>Mark:</div>
                <div className="text-slate-800 font-bold uppercase">{conflictTransaction.mark}</div>
                <div>Weight Status:</div>
                <div className="text-slate-800 font-bold font-mono">{conflictTransaction.weight || 'Pending'}</div>
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => setIsConflictOpen(false)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-all"
            >
              Close & Change Lot Number
            </button>
          </div>
        </div>
      )}

      {/* Read-Only weight optimization detailed view modal */}
      {viewingTx && (
        <ViewWeightDetailsModal
          transaction={viewingTx}
          onClose={() => setViewingTx(null)}
          onUpdate={onRefresh}
        />
      )}

      {/* Change Master Data Modal */}
      {isMasterDataOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="w-full max-w-md md:max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-premium border border-slate-100 p-4 sm:p-6 lg:p-7 space-y-4 sm:space-y-5 animate-slide-up max-h-[92vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Database className="h-5 w-5 text-indigo-600" />
                  <span>Change Master Data</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Edit pricing and operational parameters for this branch</p>
              </div>
              <button 
                onClick={() => setIsMasterDataOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error message */}
            {masterError && (
              <div className="p-3 bg-rose-50 text-rose-800 border border-rose-100 rounded-xl text-xs font-medium">
                {masterError}
              </div>
            )}

            <form onSubmit={handleSaveMasterData} className="space-y-4">
              {/* Bag Cost Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Bag Cost (₹ per Bag)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="e.g. 10.00"
                  value={masterBagCost}
                  onChange={(e) => setMasterBagCost(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold font-mono"
                />
              </div>

              {/* Taram (Tare Weight per Bag) */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Taram (Tare weight per bag - kg)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  placeholder="e.g. 1.100"
                  value={masterTaram}
                  onChange={(e) => setMasterTaram(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMasterDataOpen(false)}
                  disabled={isSavingMaster}
                  className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMaster}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center font-bold"
                >
                  {isSavingMaster ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Save Master Data'
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
