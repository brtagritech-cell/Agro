import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Pencil, 
  Calendar, 
  Tag, 
  Users, 
  ChevronDown, 
  Check, 
  AlertTriangle, 
  Save, 
  Hash, 
  IndianRupee,
  Snowflake,
  Warehouse,
  Wind,
  Plus
} from 'lucide-react';
import type { Transaction } from '../services/sheetService';
import { 
  getShortAgentName, 
  getCurrentTenant, 
  updateBranchConfiguration,
  normalizeDateParts 
} from '../services/sheetService';

interface EditTransactionModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (originalTxId: string, updatedData: Partial<Transaction>) => Promise<{ success: boolean; message: string }>;
  availableMarks?: string[];
  availableAgents?: string[];
  availableColdStorages?: string[];
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  isOpen,
  transaction,
  onClose,
  onSave,
  availableMarks,
  availableAgents = [],
  availableColdStorages = []
}) => {
  const currentTenant = getCurrentTenant();
  const [date, setDate] = useState('');
  const [lot, setLot] = useState('');
  const [bags, setBags] = useState('');
  const [rate, setRate] = useState('');
  const [agent, setAgent] = useState('');
  const [mark, setMark] = useState('');
  const [storageType, setStorageType] = useState<'NON AC' | 'AC'>('NON AC');
  const [coldStorageName, setColdStorageName] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Agent dropdown autocomplete
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const agentDropdownRef = useRef<HTMLDivElement>(null);

  // Cold Storage dropdown autocomplete
  const [isColdStorageDropdownOpen, setIsColdStorageDropdownOpen] = useState(false);
  const coldStorageDropdownRef = useRef<HTMLDivElement>(null);

  // Only the active Client Entry Link portal marks
  const combinedMarks = useMemo(() => {
    const set = new Set<string>();
    // Strictly load marks configured for this specific Client Entry Link portal
    const portalMarks = (availableMarks && availableMarks.length > 0)
      ? availableMarks
      : (currentTenant?.marks || []);

    portalMarks.forEach(m => {
      if (m && m.trim()) set.add(m.trim().toUpperCase());
    });

    // Also include the current transaction's mark if already set
    if (transaction?.mark && transaction.mark.trim()) {
      set.add(transaction.mark.trim().toUpperCase());
    }

    return Array.from(set).sort();
  }, [availableMarks, transaction, currentTenant]);

  // Available cold storages
  const allColdStorages = useMemo(() => {
    const fromTenant = currentTenant?.coldStorages || [];
    const fromProps = availableColdStorages || [];
    const set = new Set<string>();
    [...fromTenant, ...fromProps].forEach(cs => {
      const clean = (cs || '').trim();
      if (clean) set.add(clean);
    });
    if (transaction?.coldStorageName && transaction.coldStorageName.trim()) {
      set.add(transaction.coldStorageName.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [currentTenant, availableColdStorages, transaction]);

  const filteredColdStorages = useMemo(() => {
    if (!coldStorageName.trim()) return allColdStorages;
    const q = coldStorageName.trim().toLowerCase();
    return allColdStorages.filter(cs => cs.toLowerCase().includes(q));
  }, [allColdStorages, coldStorageName]);

  // Initialize values when modal opens with a transaction
  useEffect(() => {
    if (transaction && isOpen) {
      const dateInfo = normalizeDateParts(transaction.date || '');
      setDate(dateInfo.formatted || transaction.date || '');
      setLot(String(transaction.lot || ''));
      setBags(String(transaction.bags || ''));
      setRate(String(transaction.rate || ''));
      setAgent(transaction.agent || '');
      setMark(transaction.mark ? transaction.mark.toUpperCase() : (combinedMarks[0] || 'BRT'));
      setStorageType(transaction.storageType === 'AC' ? 'AC' : 'NON AC');
      setColdStorageName(transaction.coldStorageName || '');
      setIsAgentDropdownOpen(false);
      setIsColdStorageDropdownOpen(false);
      setError('');
    }
  }, [transaction, isOpen, combinedMarks]);

  // Click outside listener for agent and cold storage dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setIsAgentDropdownOpen(false);
      }
      if (coldStorageDropdownRef.current && !coldStorageDropdownRef.current.contains(e.target as Node)) {
        setIsColdStorageDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Prevent background scroll
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  if (!isOpen || !transaction) return null;

  // Filter agents matching current input
  const filteredAgents = availableAgents.filter(a => 
    a.toLowerCase().includes(agent.trim().toLowerCase())
  );

  // Calculate live preview of updated Transaction ID
  const calculatePreviewId = () => {
    try {
      const dateInfo = normalizeDateParts(date);
      const datePrefix = (dateInfo.yyyy && dateInfo.mm && dateInfo.dd)
        ? `${dateInfo.yyyy}${dateInfo.mm}${dateInfo.dd}`
        : date.replace(/[^0-9]/g, '').slice(0, 8);
      const lotVal = lot.trim();
      const paddedLot = /^\d+$/.test(lotVal) ? lotVal.padStart(2, '0') : (lotVal || '00');
      const parsedBags = parseInt(bags, 10) || 0;
      const shortAgent = agent.trim() ? getShortAgentName(agent) : 'AGT';
      const markVal = (mark.trim() || combinedMarks[0] || 'BRT').toUpperCase();
      return `${datePrefix}-${paddedLot}-${parsedBags}-${shortAgent}-${markVal}`;
    } catch {
      return transaction.transactionId;
    }
  };

  const previewId = calculatePreviewId();
  const isIdChanged = previewId !== transaction.transactionId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedBags = parseInt(bags, 10);
    const parsedRate = parseFloat(rate);

    if (!date) {
      setError('Date is required.');
      return;
    }
    if (!lot.trim() || !/^[a-zA-Z0-9]+$/.test(lot.trim())) {
      setError('Lot Number must be alphanumeric (e.g. 5, 12A).');
      return;
    }
    if (isNaN(parsedBags) || parsedBags <= 0) {
      setError('Number of bags must be a valid integer greater than 0.');
      return;
    }
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setError('Owner rate must be a valid number greater than 0.');
      return;
    }
    if (!agent.trim()) {
      setError('Commission agent name is required.');
      return;
    }
    if (!mark.trim()) {
      setError('Mark is required.');
      return;
    }
    if (storageType === 'AC' && !coldStorageName.trim()) {
      setError('Cold storage name is required when AC is selected.');
      return;
    }

    const dateInfo = normalizeDateParts(date);
    const validDate = dateInfo.formatted || date;

    setIsSaving(true);
    try {
      const trimmedColdStorage = storageType === 'AC' ? coldStorageName.trim() : '';
      const result = await onSave(transaction.transactionId, {
        date: validDate,
        lot: lot.trim(),
        bags: parsedBags,
        rate: parsedRate,
        agent: agent.trim(),
        mark: mark.trim().toUpperCase(),
        storageType,
        coldStorageName: trimmedColdStorage
      });

      if (!result.success) {
        setError(result.message);
      } else {
        // Auto-save new cold storage name to branch configuration if novel
        if (storageType === 'AC' && trimmedColdStorage && currentTenant?.subUrl) {
          const currentStorages = currentTenant.coldStorages || [];
          const isKnown = currentStorages.some(s => s.toLowerCase() === trimmedColdStorage.toLowerCase());
          if (!isKnown) {
            try {
              await updateBranchConfiguration(currentTenant.subUrl, {
                coldStorages: [...currentStorages, trimmedColdStorage]
              });
            } catch (err) {
              console.warn('Failed to auto-save new cold storage to branch in edit modal:', err);
            }
          }
        }
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save transaction changes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div 
        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed top */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Pencil className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800">Edit Pending Transaction</h2>
              <p className="text-xs text-slate-500">Allowed only while weight status is pending</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notice Banner - Fixed top */}
        <div className="px-5 py-2.5 sm:px-6 bg-amber-50/60 border-b border-amber-100/80 flex items-center gap-2 text-xs text-amber-800 shrink-0">
          <span className="font-semibold px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded text-[10px] uppercase tracking-wide">
            Weight Status: Pending
          </span>
          <span className="text-[11px] text-amber-700 truncate">
            Modifications will update the owner record and lot details.
          </span>
        </div>

        {/* Form Container with Separated Scrollable Body and Fixed Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          
          {/* Scrollable Form Body with generous bottom breathing room */}
          <div 
            className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4.5 pb-16 touch-pan-y"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {error && (
              <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-semibold">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Current vs Updated ID Preview */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between items-center text-slate-500">
                <span className="font-medium">Original ID:</span>
                <span className="font-mono font-bold text-slate-700">{transaction.transactionId}</span>
              </div>
              {isIdChanged && (
                <div className="flex justify-between items-center text-amber-800 pt-1 border-t border-slate-200/60">
                  <span className="font-semibold flex items-center gap-1">
                    <span>Updated ID:</span>
                  </span>
                  <span className="font-mono font-bold text-amber-900">{previewId}</span>
                </div>
              )}
            </div>

            {/* Date & Lot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Date</span>
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5 text-slate-400" />
                  <span>Lot Number</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 5, 12A"
                  value={lot}
                  onChange={(e) => setLot(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden transition-all"
                />
              </div>
            </div>

            {/* Bags & Owner Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <span>Number of Bags</span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  placeholder="e.g. 5"
                  value={bags}
                  onChange={(e) => setBags(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <IndianRupee className="h-3.5 w-3.5 text-slate-400" />
                  <span>Owner Rate (₹)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="e.g. 23000.00"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden transition-all font-mono"
                />
              </div>
            </div>

            {/* Commission Agent Autocomplete */}
            <div className="relative" ref={agentDropdownRef}>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <span>Commission Agent</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Search or enter agent name"
                  value={agent}
                  onChange={(e) => {
                    setAgent(e.target.value);
                    setIsAgentDropdownOpen(true);
                  }}
                  onFocus={() => setIsAgentDropdownOpen(true)}
                  className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden transition-all"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setIsAgentDropdownOpen(prev => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${isAgentDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {isAgentDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto p-1.5 space-y-0.5">
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
                          className={`px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                            isSelected ? 'bg-amber-50 text-amber-900 font-bold' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>{item}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-amber-600" />}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-2 text-center text-xs text-slate-400">
                      No matching agent. Type to use a new name.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mark Selection with Interactive Badges and Dropdown Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5 text-slate-400" />
                  <span>Mark</span>
                </label>
                <span className="text-[11px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  Active: {mark || 'None'}
                </span>
              </div>

              {/* Fast 1-Click Interactive Mark Chips */}
              <div className="flex flex-wrap gap-1.5 sm:gap-2 p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                {combinedMarks.map((m) => {
                  const isSelected = mark.trim().toUpperCase() === m.toUpperCase();
                  return (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setMark(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 border cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs scale-105'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span>{m}</span>
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>

              {/* Custom Mark Selector / Dropdown */}
              <select
                value={mark}
                onChange={(e) => setMark(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden transition-all cursor-pointer font-mono"
              >
                {combinedMarks.map((m) => (
                  <option key={m} value={m}>
                    {m} Mark
                  </option>
                ))}
              </select>
            </div>

            {/* Storage Type (NON AC vs AC) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Snowflake className="h-3.5 w-3.5 text-slate-400" />
                  <span>Storage Type</span>
                </label>
                <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                  {storageType}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStorageType('NON AC');
                    setColdStorageName('');
                    setIsColdStorageDropdownOpen(false);
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    storageType === 'NON AC'
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  <Wind className={`h-3.5 w-3.5 ${storageType === 'NON AC' ? 'text-slate-300' : 'text-slate-400'}`} />
                  <span>NON AC</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStorageType('AC');
                    setIsColdStorageDropdownOpen(true);
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    storageType === 'AC'
                      ? 'bg-sky-600 border-sky-600 text-white shadow-md shadow-sky-600/25 ring-2 ring-sky-300'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  <Snowflake className={`h-3.5 w-3.5 ${storageType === 'AC' ? 'text-white' : 'text-sky-500'}`} />
                  <span>AC (Cold Storage)</span>
                </button>
              </div>
            </div>

            {/* Cold Storage Name Field when AC is selected */}
            {storageType === 'AC' && (
              <div className="space-y-1.5 animate-fade-in relative" ref={coldStorageDropdownRef}>
                <div className="flex items-center justify-between">
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
                    placeholder="Search or enter cold storage name"
                    value={coldStorageName}
                    onChange={(e) => {
                      setColdStorageName(e.target.value);
                      setIsColdStorageDropdownOpen(true);
                    }}
                    onFocus={() => setIsColdStorageDropdownOpen(true)}
                    className="w-full px-3.5 py-2.5 pr-10 bg-sky-50/50 border border-sky-300 rounded-xl focus:bg-white text-sm font-semibold text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:text-slate-400"
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
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-48 overflow-y-auto overscroll-contain animate-fade-in p-1.5 space-y-0.5">
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
                        {allColdStorages.length === 0 ? 'No cold storages configured yet' : `No cold storages matching "${coldStorageName}"`}
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

          </div>

          {/* Sticky Modal Actions Footer - Always visible outside the scroll area */}
          <div className="shrink-0 px-5 py-3.5 sm:px-6 bg-slate-50/95 border-t border-slate-200/80 flex items-center justify-end gap-2.5 z-20">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/70 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-md shadow-amber-500/20 hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
