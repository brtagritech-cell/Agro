import React, { useState, useEffect, useRef } from 'react';
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
  IndianRupee 
} from 'lucide-react';
import type { Transaction } from '../services/sheetService';
import { getShortAgentName } from '../services/sheetService';

interface EditTransactionModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (originalTxId: string, updatedData: Partial<Transaction>) => Promise<{ success: boolean; message: string }>;
  availableMarks?: string[];
  availableAgents?: string[];
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  isOpen,
  transaction,
  onClose,
  onSave,
  availableMarks = ['Agro', 'BRT', 'RS', 'TS', 'DV', 'BVB'],
  availableAgents = []
}) => {
  const [date, setDate] = useState('');
  const [lot, setLot] = useState('');
  const [bags, setBags] = useState('');
  const [rate, setRate] = useState('');
  const [agent, setAgent] = useState('');
  const [mark, setMark] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Agent dropdown autocomplete
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const agentDropdownRef = useRef<HTMLDivElement>(null);

  // Initialize values when modal opens with a transaction
  useEffect(() => {
    if (transaction && isOpen) {
      setDate(transaction.date || '');
      setLot(String(transaction.lot || ''));
      setBags(String(transaction.bags || ''));
      setRate(String(transaction.rate || ''));
      setAgent(transaction.agent || '');
      setMark(transaction.mark || availableMarks[0] || 'BRT');
      setError('');
    }
  }, [transaction, isOpen]);

  // Click outside listener for agent dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setIsAgentDropdownOpen(false);
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
      const [yyyy, mm, dd] = date.split('-');
      const datePrefix = `${yyyy || ''}${mm || ''}${dd || ''}`;
      const lotVal = lot.trim();
      const paddedLot = /^\d+$/.test(lotVal) ? lotVal.padStart(2, '0') : (lotVal || '00');
      const parsedBags = parseInt(bags, 10) || 0;
      const shortAgent = agent.trim() ? getShortAgentName(agent) : 'AGT';
      const markVal = mark.trim() || 'BRT';
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

    setIsSaving(true);
    try {
      const result = await onSave(transaction.transactionId, {
        date,
        lot: lot.trim(),
        bags: parsedBags,
        rate: parsedRate,
        agent: agent.trim(),
        mark: mark.trim()
      });

      if (!result.success) {
        setError(result.message);
      } else {
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
        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg flex flex-col max-h-[92vh] overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent">
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
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notice Banner */}
        <div className="px-5 py-2.5 sm:px-6 bg-amber-50/60 border-b border-amber-100/80 flex items-center gap-2 text-xs text-amber-800">
          <span className="font-semibold px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded text-[10px] uppercase tracking-wide">
            Weight Status: Pending
          </span>
          <span className="text-[11px] text-amber-700 truncate">
            Modifications will update the owner record and lot details.
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
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

          {/* Mark Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Tag className="h-3.5 w-3.5 text-slate-400" />
              <span>Mark</span>
            </label>
            <select
              value={mark}
              onChange={(e) => setMark(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden transition-all"
            >
              {availableMarks.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Modal Actions Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-md shadow-amber-500/20 hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
