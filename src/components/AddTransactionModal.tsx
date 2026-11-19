import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Plus, 
  Clock, 
  Lock, 
  AlertTriangle, 
  Check, 
  CheckCircle, 
  ChevronDown, 
  FileText, 
  Calendar, 
  Tag, 
  Users, 
  Hash, 
  IndianRupee,
  Snowflake,
  Warehouse,
  Wind
} from 'lucide-react';
import type { Transaction } from '../services/sheetService';
import { 
  getCurrentTenant, 
  getShortAgentName, 
  updateBranchConfiguration,
  addTransaction as defaultAddTx 
} from '../services/sheetService';

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

const formatINR = (val: number | undefined | null) => {
  if (val === undefined || val === null || isNaN(val)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(val);
};

const formatLiveClock = (dateObj: Date) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTransaction?: (tx: Omit<Transaction, 'totalValue'>) => Promise<{ success: boolean; message: string; data?: Transaction }>;
  transactions: Transaction[];
  initialDate?: string;
  availableMarks?: string[];
  availableAgents?: string[];
  availableColdStorages?: string[];
  onSuccess?: () => void;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onAddTransaction,
  transactions,
  initialDate,
  availableMarks = [],
  availableAgents = [],
  availableColdStorages = [],
  onSuccess
}) => {
  const currentTenant = getCurrentTenant();

  // Form Fields State
  const [date, setDate] = useState<string>(() => initialDate || getTodayISTString());
  const [lot, setLot] = useState('');
  const [bags, setBags] = useState('');
  const [rate, setRate] = useState('');
  const [agent, setAgent] = useState('');
  const [mark, setMark] = useState<string>(() => {
    const marks = currentTenant?.marks || availableMarks || [];
    return marks.length > 0 ? marks[0] : 'BRT';
  });
  const [storageType, setStorageType] = useState<'NON AC' | 'AC'>('NON AC');
  const [coldStorageName, setColdStorageName] = useState('');

  // Autocomplete Dropdowns
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [isMarkDropdownOpen, setIsMarkDropdownOpen] = useState(false);
  const [isColdStorageDropdownOpen, setIsColdStorageDropdownOpen] = useState(false);
  const agentDropdownRef = useRef<HTMLDivElement>(null);
  const markDropdownRef = useRef<HTMLDivElement>(null);
  const coldStorageDropdownRef = useRef<HTMLDivElement>(null);

  // Live timestamp
  const [liveTimestamp, setLiveTimestamp] = useState<Date>(new Date());
  const [formError, setFormError] = useState('');

  // Conflict state
  const [conflictTransaction, setConflictTransaction] = useState<Transaction | null>(null);
  const [isConflictOpen, setIsConflictOpen] = useState(false);

  // Review state
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
    storageType: 'NON AC' | 'AC';
    coldStorageName: string;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialDate) {
        setDate(initialDate);
      } else {
        setDate(getTodayISTString());
      }
      setLot('');
      setBags('');
      setRate('');
      setAgent('');
      const marks = currentTenant?.marks || availableMarks || [];
      setMark(marks.length > 0 ? marks[0] : 'BRT');
      setStorageType('NON AC');
      setColdStorageName('');
      setFormError('');
      setConflictTransaction(null);
      setIsAgentDropdownOpen(false);
      setIsMarkDropdownOpen(false);
      setIsColdStorageDropdownOpen(false);
    }
  }, [isOpen, initialDate, currentTenant?.subUrl]);

  // Update live clock every second while modal is open
  useEffect(() => {
    if (!isOpen) return;
    setLiveTimestamp(new Date());
    const timer = setInterval(() => {
      setLiveTimestamp(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Lock background scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Close combobox dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setIsAgentDropdownOpen(false);
      }
      if (markDropdownRef.current && !markDropdownRef.current.contains(e.target as Node)) {
        setIsMarkDropdownOpen(false);
      }
      if (coldStorageDropdownRef.current && !coldStorageDropdownRef.current.contains(e.target as Node)) {
        setIsColdStorageDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute available commission agents
  const allAgents = useMemo(() => {
    const fromTenant = currentTenant?.agents || [];
    const fromProps = availableAgents || [];
    const fromTxs = transactions.map(t => t.agent).filter(Boolean);
    const set = new Set<string>();
    [...fromTenant, ...fromProps, ...fromTxs].forEach(a => {
      const clean = (a || '').trim();
      if (clean) set.add(clean);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [currentTenant, availableAgents, transactions]);

  const filteredAgents = useMemo(() => {
    if (!agent.trim()) return allAgents;
    const q = agent.trim().toLowerCase();
    return allAgents.filter(a => a.toLowerCase().includes(q));
  }, [allAgents, agent]);

  // Compute available brand marks
  const allMarks = useMemo(() => {
    const configured = currentTenant?.marks || availableMarks || [];
    if (configured.length > 0) {
      return Array.from(new Set(configured.map(m => (m || '').trim().toUpperCase()).filter(Boolean))).sort();
    }
    const fromTxs = transactions.map(t => (t.mark || '').trim().toUpperCase()).filter(Boolean);
    return Array.from(new Set(fromTxs)).sort();
  }, [currentTenant, availableMarks, transactions]);

  const filteredMarks = useMemo(() => {
    if (!mark.trim()) return allMarks;
    const q = mark.trim().toLowerCase();
    return allMarks.filter(m => m.toLowerCase().includes(q));
  }, [allMarks, mark]);

  // Compute available cold storages
  const allColdStorages = useMemo(() => {
    const fromTenant = currentTenant?.coldStorages || [];
    const fromProps = availableColdStorages || [];
    const fromTxs = transactions.map(t => t.coldStorageName).filter(Boolean) as string[];
    const set = new Set<string>();
    [...fromTenant, ...fromProps, ...fromTxs].forEach(cs => {
      const clean = (cs || '').trim();
      if (clean) set.add(clean);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [currentTenant, availableColdStorages, transactions]);

  const filteredColdStorages = useMemo(() => {
    if (!coldStorageName.trim()) return allColdStorages;
    const q = coldStorageName.trim().toLowerCase();
    return allColdStorages.filter(cs => cs.toLowerCase().includes(q));
  }, [allColdStorages, coldStorageName]);

  // Check lot conflict for current date and lot
  const checkLotConflict = (lotVal: string, dateVal: string) => {
    const trimmedLot = lotVal.trim();
    if (!trimmedLot || !dateVal) {
      setConflictTransaction(null);
      return;
    }
    const conflict = transactions.find(t => t.date === dateVal && t.lot.toLowerCase() === trimmedLot.toLowerCase());
    if (conflict) {
      setConflictTransaction(conflict);
    } else {
      setConflictTransaction(null);
    }
  };

  // Calculate live preview of Transaction ID
  const calculatePreviewId = () => {
    try {
      const [yyyy, mm, dd] = (date || getTodayISTString()).split('-');
      const datePrefix = `${yyyy || ''}${mm || ''}${dd || ''}`;
      const lotVal = lot.trim();
      const paddedLot = /^\d+$/.test(lotVal) ? lotVal.padStart(2, '0') : (lotVal || '00');
      const parsedBags = parseInt(bags, 10) || 0;
      const shortAgent = agent.trim() ? getShortAgentName(agent) : 'AGT';
      const markVal = (mark.trim() || 'BRT').toUpperCase();
      return `${datePrefix}-${paddedLot}-${parsedBags}-${shortAgent}-${markVal}`;
    } catch {
      return 'Pending Compilation';
    }
  };

  const previewId = calculatePreviewId();

  // Form Submission
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!date) {
      setFormError('Date is required.');
      return;
    }

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

    const lotVal = lot.trim();
    if (!lotVal || !/^[a-zA-Z0-9]+$/.test(lotVal)) {
      setFormError('Lot Number must be alphanumeric (letters and numbers only, e.g. 1, 12A, 22B).');
      return;
    }

    if (storageType === 'AC' && !coldStorageName.trim()) {
      setFormError('Cold storage name is required when AC is selected.');
      return;
    }

    // Double check conflict on submit
    const conflict = transactions.find(t => t.date === date && t.lot.toLowerCase() === lotVal.toLowerCase());
    if (conflict) {
      setConflictTransaction(conflict);
      setIsConflictOpen(true);
      setFormError(`Lot Number "${lotVal}" already exists on ${date}.`);
      return;
    }

    const [yyyy, mm, dd] = date.split('-');
    const datePrefix = `${yyyy}${mm}${dd}`;
    const paddedLot = /^\d+$/.test(lotVal) ? lotVal.padStart(2, '0') : lotVal;
    const shortAgent = getShortAgentName(agent);
    const markVal = (mark.trim() || 'BRT').toUpperCase();
    const transactionId = `${datePrefix}-${paddedLot}-${parsedBags}-${shortAgent}-${markVal}`;

    setReviewData({
      timestamp: new Date().toISOString(),
      transactionId,
      date,
      lot: lotVal,
      bags: parsedBags,
      rate: parsedRate,
      agent: agent.trim(),
      mark: markVal,
      storageType,
      coldStorageName: storageType === 'AC' ? coldStorageName.trim() : ''
    });

    setIsReviewOpen(true);
  };

  // Final Confirmation Save
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
      storageType: reviewData.storageType,
      coldStorageName: reviewData.coldStorageName,
      weight: "" // Omitted from owner view, sub-user fills this later
    };

    const addFn = onAddTransaction || defaultAddTx;
    const response = await addFn(payload);
    setIsSubmitting(false);

    if (response.success) {
      // 1. Auto-save new agent if novel
      const trimmedAgent = reviewData.agent.trim();
      const currentAgents = currentTenant?.agents || [];
      const isAgentKnown = currentAgents.some(a => a.trim().toLowerCase() === trimmedAgent.toLowerCase());
      if (!isAgentKnown && trimmedAgent && currentTenant?.subUrl) {
        const updatedAgents = [...currentAgents, trimmedAgent];
        try {
          await updateBranchConfiguration(currentTenant.subUrl, { agents: updatedAgents });
        } catch (err) {
          console.warn('Failed to auto-save new agent to database:', err);
        }
      }

      // 2. Auto-save new mark if novel
      const trimmedMark = reviewData.mark.trim().toUpperCase();
      const currentMarks = currentTenant?.marks || [];
      const isMarkKnown = currentMarks.some(m => m.trim().toUpperCase() === trimmedMark);
      if (!isMarkKnown && trimmedMark && currentTenant?.subUrl) {
        const updatedMarks = [...currentMarks, trimmedMark];
        try {
          await updateBranchConfiguration(currentTenant.subUrl, { marks: updatedMarks });
        } catch (err) {
          console.warn('Failed to auto-save new mark to database:', err);
        }
      }

      // 3. Auto-save new cold storage name to branch configuration if novel
      if (reviewData.storageType === 'AC' && reviewData.coldStorageName) {
        const trimmedStorage = reviewData.coldStorageName.trim();
        const currentStorages = currentTenant?.coldStorages || [];
        const isStorageKnown = currentStorages.some(s => s.trim().toLowerCase() === trimmedStorage.toLowerCase());
        if (!isStorageKnown && trimmedStorage && currentTenant?.subUrl) {
          const updatedStorages = [...currentStorages, trimmedStorage];
          try {
            await updateBranchConfiguration(currentTenant.subUrl, { coldStorages: updatedStorages });
          } catch (err) {
            console.warn('Failed to auto-save new cold storage to database:', err);
          }
        }
      }

      setSubmitResult({ success: true, message: response.message });
      setTimeout(() => {
        setIsReviewOpen(false);
        onClose();
        if (onSuccess) onSuccess();
      }, 700);
    } else {
      setSubmitResult({ success: false, message: response.message || 'Failed to save transaction.' });
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Main Entry Bottom Sheet / Modal */}
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
        {/* Backdrop tap to close */}
        <div className="absolute inset-0" onClick={onClose} />

        {/* Modal Container */}
        <div className="w-full max-w-lg md:max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-premium border-t sm:border border-slate-100 flex flex-col max-h-[92dvh] sm:max-h-[90vh] z-10 animate-slide-up overflow-hidden">
          {/* Mobile Sheet Drag Handle */}
          <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 sm:hidden shrink-0" />

          {/* Header */}
          <div className="flex justify-between items-center border-b border-slate-100 px-4 py-3 sm:px-6 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center font-bold">
                <Plus className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800">Add New Entry</h3>
                <p className="text-xs text-slate-500">Record agricultural lot transaction</p>
              </div>
            </div>
            <button 
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
              title="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Error Alert */}
          {formError && (
            <div className="mx-4 sm:mx-6 mt-3 p-3 sm:p-3.5 bg-rose-50 text-rose-800 border border-rose-100 rounded-xl flex gap-2 text-xs font-medium shrink-0 animate-fade-in">
              <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4 touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
              
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

              {/* Live Preview of Transaction ID */}
              <div className="bg-emerald-50/60 border border-emerald-100/80 p-2.5 sm:p-3 rounded-xl flex items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Compiled ID Preview</span>
                  <span className="font-mono font-bold text-emerald-900 mt-0.5 block text-xs break-all">{previewId}</span>
                </div>
              </div>

              {/* Date & Lot Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Date Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>Transaction Date</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setDate(newDate);
                      checkLotConflict(lot, newDate);
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 text-sm font-medium font-mono cursor-pointer"
                  />
                </div>

                {/* Lot Number */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                      <span>Lot Number</span>
                    </label>
                    {conflictTransaction && (
                      <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                        Lot Exists!
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1, 12A, 22B"
                    value={lot}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLot(val);
                      checkLotConflict(val, date);
                    }}
                    className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl focus:bg-white text-sm font-medium ${
                      conflictTransaction ? 'border-rose-400 focus:border-rose-500 ring-1 ring-rose-200' : 'border-slate-200 focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>

              {/* Number of Bags & Rate per Bag */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Number of Bags */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Number of Bags (Integer)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="1"
                    required
                    placeholder="e.g. 450"
                    value={bags}
                    onChange={(e) => setBags(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 text-sm font-medium font-mono"
                  />
                </div>

                {/* Rate per Bag */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <IndianRupee className="h-3.5 w-3.5 text-slate-400" />
                    <span>Rate per Bag (₹ INR)</span>
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 1450.00"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 text-sm font-medium font-mono"
                  />
                </div>
              </div>

              {/* Commission Agent Name with Combobox */}
              <div className="relative" ref={agentDropdownRef}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    <span>Commission Agent Name</span>
                  </label>
                  {agent.trim() && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${
                      allAgents.some(a => a.toLowerCase() === agent.trim().toLowerCase())
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                    }`}>
                      {allAgents.some(a => a.toLowerCase() === agent.trim().toLowerCase()) 
                        ? 'Existing Agent' 
                        : '+ New Agent'}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Search or enter agent name (e.g. Ramesh Kumar)"
                    value={agent}
                    onChange={(e) => {
                      setAgent(e.target.value);
                      setIsAgentDropdownOpen(true);
                    }}
                    onFocus={() => setIsAgentDropdownOpen(true)}
                    className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setIsAgentDropdownOpen(prev => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                    title="Toggle Agent Suggestions"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isAgentDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Dropdown Suggestions Menu */}
                {isAgentDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-52 overflow-y-auto overscroll-contain animate-fade-in p-1.5 space-y-0.5">
                    {filteredAgents.length > 0 ? (
                      filteredAgents.map((item) => {
                        const isSelected = item.toLowerCase() === agent.trim().toLowerCase();
                        return (
                          <div
                            key={item}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setAgent(item);
                              setIsAgentDropdownOpen(false);
                            }}
                            className={`px-3 py-2 text-xs font-semibold rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                              isSelected 
                                ? 'bg-emerald-50 text-emerald-800 font-bold' 
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <span className="break-words">{item}</span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-2.5 text-center text-xs text-slate-400 font-medium">
                        No existing agents matching "{agent}"
                      </div>
                    )}

                    {agent.trim() && !allAgents.some(a => a.toLowerCase() === agent.trim().toLowerCase()) && (
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setIsAgentDropdownOpen(false);
                        }}
                        className="mt-1 pt-1 border-t border-slate-100 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl cursor-pointer text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">Add new agent: <strong>"{agent.trim()}"</strong></span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Brand Name / Mark with Combobox */}
              <div className="relative" ref={markDropdownRef}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5 text-slate-400" />
                    <span>Brand Name / Mark</span>
                  </label>
                  {mark.trim() && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${
                      allMarks.some(m => m.toUpperCase() === mark.trim().toUpperCase())
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                    }`}>
                      {allMarks.some(m => m.toUpperCase() === mark.trim().toUpperCase()) ? 'Existing Mark' : '+ New Mark'}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Search or enter Brand Mark (e.g. BRT, AGRO)"
                    value={mark}
                    onChange={(e) => {
                      setMark(e.target.value.toUpperCase());
                      setIsMarkDropdownOpen(true);
                    }}
                    onFocus={() => setIsMarkDropdownOpen(true)}
                    className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-bold uppercase font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setIsMarkDropdownOpen(prev => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                    title="Toggle Mark Suggestions"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isMarkDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Mark Dropdown Menu */}
                {isMarkDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-52 overflow-y-auto overscroll-contain animate-fade-in p-1.5 space-y-0.5">
                    {filteredMarks.length > 0 ? (
                      filteredMarks.map((item) => {
                        const isSelected = item.toUpperCase() === mark.trim().toUpperCase();
                        return (
                          <div
                            key={item}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setMark(item);
                              setIsMarkDropdownOpen(false);
                            }}
                            className={`px-3 py-2 text-xs font-bold uppercase font-mono rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                              isSelected 
                                ? 'bg-emerald-50 text-emerald-800' 
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <span>{item}</span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-2.5 text-center text-xs text-slate-400 font-medium">
                        No existing marks matching "{mark}"
                      </div>
                    )}

                    {mark.trim() && !allMarks.some(m => m.toUpperCase() === mark.trim().toUpperCase()) && (
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setIsMarkDropdownOpen(false);
                        }}
                        className="mt-1 pt-1 border-t border-slate-100 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl cursor-pointer text-xs font-bold flex items-center gap-1.5 transition-colors uppercase font-mono"
                      >
                        <Plus className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">Add new mark: "{mark.trim().toUpperCase()}"</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Storage Type (AC vs NON AC) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Snowflake className="h-3.5 w-3.5 text-slate-400" />
                    <span>Storage Type</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">Default: NON AC</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setStorageType('NON AC');
                      setColdStorageName('');
                      setIsColdStorageDropdownOpen(false);
                    }}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      storageType === 'NON AC'
                        ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    <Wind className={`h-4 w-4 ${storageType === 'NON AC' ? 'text-slate-300' : 'text-slate-400'}`} />
                    <span>NON AC</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStorageType('AC');
                      setIsColdStorageDropdownOpen(true);
                    }}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      storageType === 'AC'
                        ? 'bg-sky-600 border-sky-600 text-white shadow-md shadow-sky-600/25 ring-2 ring-sky-300'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    <Snowflake className={`h-4 w-4 ${storageType === 'AC' ? 'text-white' : 'text-sky-500'}`} />
                    <span>AC (Cold Storage)</span>
                  </button>
                </div>
              </div>

              {/* Conditionally rendered Cold Storage Name when AC is selected */}
              {storageType === 'AC' && (
                <div className="relative animate-fade-in" ref={coldStorageDropdownRef}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-sky-800 uppercase tracking-wider flex items-center gap-1">
                      <Warehouse className="h-3.5 w-3.5 text-sky-600" />
                      <span>Cold Storage Name</span>
                    </label>
                    {coldStorageName.trim() && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${
                        allColdStorages.some(s => s.toLowerCase() === coldStorageName.trim().toLowerCase())
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                      }`}>
                        {allColdStorages.some(s => s.toLowerCase() === coldStorageName.trim().toLowerCase())
                          ? 'Existing Cold Storage'
                          : '+ New Cold Storage'}
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      required={storageType === 'AC'}
                      placeholder="Search or enter cold storage name (e.g. Royal Cold Storage)"
                      value={coldStorageName}
                      onChange={(e) => {
                        setColdStorageName(e.target.value);
                        setIsColdStorageDropdownOpen(true);
                      }}
                      onFocus={() => setIsColdStorageDropdownOpen(true)}
                      className="w-full px-4 py-2.5 pr-10 bg-sky-50/50 border border-sky-300 rounded-xl focus:bg-white text-sm font-semibold text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setIsColdStorageDropdownOpen(prev => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                      title="Toggle Cold Storage Suggestions"
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isColdStorageDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Cold Storage Dropdown Menu */}
                  {isColdStorageDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-52 overflow-y-auto overscroll-contain animate-fade-in p-1.5 space-y-0.5">
                      {filteredColdStorages.length > 0 ? (
                        filteredColdStorages.map((item) => {
                          const isSelected = item.toLowerCase() === coldStorageName.trim().toLowerCase();
                          return (
                            <div
                              key={item}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setColdStorageName(item);
                                setIsColdStorageDropdownOpen(false);
                              }}
                              className={`px-3 py-2 text-xs font-semibold rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                                isSelected 
                                  ? 'bg-sky-50 text-sky-800 font-bold' 
                                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Snowflake className="h-3 w-3 text-sky-500 shrink-0" />
                                <span className="break-words">{item}</span>
                              </div>
                              {isSelected && <Check className="h-3.5 w-3.5 text-sky-600 shrink-0" />}
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-2.5 text-center text-xs text-slate-400 font-medium">
                          {allColdStorages.length === 0 ? 'No cold storages configured in branch setting yet' : `No cold storages matching "${coldStorageName}"`}
                        </div>
                      )}

                      {coldStorageName.trim() && !allColdStorages.some(s => s.toLowerCase() === coldStorageName.trim().toLowerCase()) && (
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setIsColdStorageDropdownOpen(false);
                          }}
                          className="mt-1 pt-1 border-t border-slate-100 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl cursor-pointer text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                          <span className="truncate">Add new cold storage: <strong>"{coldStorageName.trim()}"</strong></span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Weight Restriction Notice */}
              <div className="bg-amber-50/60 border border-amber-100 p-3 rounded-xl flex gap-2 text-[10px] text-amber-800 leading-normal">
                <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Weight Restriction</strong>: Sub-user is responsible for updating physical weight specifications upon dispatch. Weight entry is disabled under Owner scope.
                </span>
              </div>
            </div>

            {/* Prominent Action Footer */}
            <div className="p-3.5 sm:p-5 bg-white border-t border-slate-100 shrink-0 shadow-xs">
              <button
                type="submit"
                className="w-full py-3 sm:py-3.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl active:scale-[0.98] transition-all text-sm shadow-md shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>Compile & Review Transaction</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Mandatory Transaction Review Modal */}
      {isReviewOpen && reviewData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="w-full max-w-md md:max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-premium border border-slate-100 p-4 sm:p-6 lg:p-7 space-y-4 sm:space-y-5 animate-slide-up max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain">
            
            {/* Header */}
            <div className="text-center pb-2 border-b border-slate-100">
              <div className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-2">
                <FileText className="h-5.5 w-5.5" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Mandatory Ledger Review</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Please review lot specifications before committing to ledger.</p>
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
              <div className="sm:border-r border-slate-100 sm:pr-2 pt-1 border-t border-slate-50">
                <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Storage Type</span>
                <span className="mt-0.5 inline-flex items-center gap-1 font-bold">
                  {reviewData.storageType === 'AC' ? (
                    <span className="text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 inline-flex items-center gap-1 text-[11px]">
                      <Snowflake className="h-3 w-3 text-sky-500" />
                      AC (Cold Storage)
                    </span>
                  ) : (
                    <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1 text-[11px]">
                      <Wind className="h-3 w-3 text-slate-400" />
                      NON AC
                    </span>
                  )}
                </span>
              </div>
              <div className="sm:pl-2 pt-1 border-t border-slate-50">
                <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Cold Storage</span>
                <span className="text-slate-800 font-bold mt-0.5 block truncate">
                  {reviewData.storageType === 'AC' ? (reviewData.coldStorageName || 'Not specified') : 'N/A (NON AC)'}
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
                className="flex-1 py-2.5 sm:py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={isSubmitting}
                className="flex-1 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center cursor-pointer"
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
          <div className="w-full max-w-md md:max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-premium border border-slate-100 p-4 sm:p-6 lg:p-7 space-y-4 animate-slide-up max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain">
            <div className="text-center pb-1 border-b border-slate-100">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Duplicate Lot Alert</h3>
              <p className="text-xs text-rose-600 mt-1 font-semibold">Lot Number "{conflictTransaction.lot}" already exists on {conflictTransaction.date}.</p>
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
                <div>Storage:</div>
                <div className="text-slate-800 font-bold">
                  {conflictTransaction.storageType === 'AC' 
                    ? `AC (${conflictTransaction.coldStorageName || 'Cold Storage'})` 
                    : 'NON AC'}
                </div>
                <div>Weight Status:</div>
                <div className="text-slate-800 font-bold font-mono">{conflictTransaction.weight || 'Pending'}</div>
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => setIsConflictOpen(false)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              Close & Change Lot Number
            </button>
          </div>
        </div>
      )}
    </>
  );
};
