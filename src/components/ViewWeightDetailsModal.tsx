import React, { useState } from 'react';
import { X, Scale, Info } from 'lucide-react';
import type { Transaction } from '../services/sheetService';
import { getCurrentTenant, updateWeight } from '../services/sheetService';

interface ViewWeightDetailsModalProps {
  transaction: Transaction;
  onClose: () => void;
  onUpdate?: () => void;
}

export const ViewWeightDetailsModal: React.FC<ViewWeightDetailsModalProps> = ({
  transaction,
  onClose,
  onUpdate
}) => {
  const currentTenant = getCurrentTenant();
  const bagCost = currentTenant?.bagCost ?? 25;
  const taram = currentTenant?.taram ?? 1.100;

  const [selectedMark, setSelectedMark] = useState(transaction.mark);
  const [isUpdatingMark, setIsUpdatingMark] = useState(false);

  const handleUpdateMark = async () => {
    setIsUpdatingMark(true);
    const res = await updateWeight(
      transaction.transactionId,
      undefined, // weight
      undefined, // subUserRate
      undefined, // rateReason
      undefined, // bags
      selectedMark // mark
    );
    setIsUpdatingMark(false);
    if (res.success) {
      alert('Brand/Mark Name updated successfully!');
      if (onUpdate) {
        onUpdate();
      }
    } else {
      alert('Failed to update Brand/Mark: ' + res.message);
    }
  };

  // Helper to parse weights: "150.600 kg [50.200, 50.100, 50.300]" -> ["50.200", "50.100", "50.300"]
  const parseBagWeights = (weightStr: string): string[] => {
    if (!weightStr) return [];
    const match = weightStr.match(/\[(.*?)\]/);
    if (match && match[1]) {
      return match[1].split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  const bagWeights = parseBagWeights(transaction.weight);
  const rate = transaction.subUserRate !== undefined && transaction.subUserRate !== null && transaction.subUserRate > 0
    ? transaction.subUserRate
    : transaction.rate;

  const formatINR = (val: number | undefined | null) => {
    const num = (val === undefined || val === null || isNaN(val)) ? 0 : val;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(num);
  };

  // Operational metrics
  const totalBags = bagWeights.length || transaction.bags;
  const grossWeight = bagWeights.reduce((sum, w) => sum + (parseFloat(w) || 0), 0);
  const tareWeight = transaction.bagsWeight !== undefined && transaction.bagsWeight !== null ? transaction.bagsWeight : (totalBags * taram);
  const netWeight = transaction.netWeight !== undefined && transaction.netWeight !== null ? transaction.netWeight : Math.max(0, grossWeight - tareWeight);
  const grossAmount = transaction.totalValue !== undefined && transaction.totalValue !== null && transaction.totalValue > 0 ? transaction.totalValue : ((netWeight * rate) + (bagCost * totalBags));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="w-full sm:max-w-xl md:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-premium border-t sm:border border-slate-100 p-4 sm:p-6 lg:p-7 flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-slide-up">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-3 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Scale className="h-4.5 w-4.5 text-emerald-600" />
              <span>Weight Optimization Ledger Details</span>
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium uppercase tracking-wider">
              Read-Only Transaction Record
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Target Lot Meta Box */}
        <div className="bg-slate-50/50 border border-slate-200/50 p-3 sm:p-3.5 rounded-xl text-xs space-y-1 mt-2.5 sm:mt-3 shrink-0">
          <div className="flex justify-between font-mono gap-2">
            <span className="text-slate-400 shrink-0">LOT {transaction.lot}</span>
            <span className="font-bold text-slate-800 break-all text-right">{transaction.transactionId}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 text-slate-600 font-medium pt-1 border-t border-slate-200/40">
            <div>Agent Name: <span className="text-slate-800 font-bold break-words">{transaction.agent}</span></div>
            <div>Mark: <span className="text-slate-800 font-bold uppercase">{transaction.mark}</span></div>
            <div>Original Bags: <span className="text-slate-800 font-bold font-mono">{transaction.bags} Bags</span></div>
            <div>Owner Rate: <span className="text-slate-800 font-bold font-mono">{formatINR(transaction.rate)}</span></div>
            <div className="sm:col-span-2 border-t border-slate-200/20 pt-1 mt-1 grid grid-cols-1 sm:grid-cols-2 gap-y-1">
              <div>Sub-User Rate: <span className="text-slate-800 font-bold font-mono">{transaction.subUserRate !== undefined && transaction.subUserRate !== null && transaction.subUserRate > 0 ? formatINR(transaction.subUserRate) : <span className="text-slate-400 font-sans font-medium italic">Pending</span>}</span></div>
            </div>
            {transaction.rateReason && (
              <div className="sm:col-span-2 text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-100/30 mt-1 break-words">
                Rate Mod Reason: <span className="font-bold">{transaction.rateReason}</span>
              </div>
            )}
            <div className="sm:col-span-2 border-t border-slate-200/20 pt-2 mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Change Brand/Mark:</span>
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedMark}
                  onChange={(e) => setSelectedMark(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 focus:border-emerald-500 rounded text-xs font-bold uppercase cursor-pointer"
                >
                  {(currentTenant?.marks || []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleUpdateMark}
                  disabled={selectedMark === transaction.mark || isUpdatingMark}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg transition-all disabled:opacity-50 shrink-0"
                >
                  {isUpdatingMark ? '...' : 'Update'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-grow overflow-y-auto min-h-0 mt-3 sm:mt-4 space-y-3 sm:space-y-4">
          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
            Bag Weights Breakdown
          </span>

          {bagWeights.length === 0 ? (
            <div className="text-center py-8 sm:py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <Info className="h-7 w-7 sm:h-8 sm:w-8 text-amber-500/80 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">Pending Weight Recording</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                The sub-user has not added weight details against this lot yet.
              </p>
            </div>
          ) : (
            <div className="border border-slate-100 rounded-xl p-2 bg-slate-50/20 space-y-1.5 max-h-[220px] overflow-y-auto">
              {bagWeights.map((w, idx) => (
                <div key={`bag-view-${idx}`} className="flex items-center justify-between px-3 py-1.5 bg-white border border-slate-100 rounded-lg text-xs">
                  <span className="text-slate-400 font-mono font-bold">Bag #{idx + 1}</span>
                  <span className="font-bold font-mono text-slate-800">{w} kg</span>
                </div>
              ))}
            </div>
          )}

          {bagWeights.length > 0 && (
            /* Formulas & Calculations Metrics footer */
            <div className="bg-slate-50 border border-slate-200 p-3 sm:p-3.5 rounded-xl space-y-2 text-xs w-full">
              <div className="flex justify-between font-semibold border-b border-slate-200/50 pb-1.5 mb-1 text-slate-500">
                <span>Calculations Summary</span>
                <span className="font-mono text-[9px] sm:text-[10px]">TARE: {taram.toFixed(3)} KG/BAG</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-x-6 sm:gap-y-1.5 font-medium text-slate-600">
                <div className="flex justify-between">
                  <span>Total Bags:</span>
                  <span className="font-bold text-slate-800 font-mono">{totalBags} Bags</span>
                </div>
                <div className="flex justify-between">
                  <span>Gross Weight:</span>
                  <span className="font-bold text-slate-800 font-mono">{grossWeight.toFixed(3)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span>Bags Weight (Tare):</span>
                  <span className="font-bold text-slate-800 font-mono">{tareWeight.toFixed(3)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span>Net Weight:</span>
                  <span className="font-bold text-slate-700 font-mono">{netWeight.toFixed(3)} kg</span>
                </div>
              </div>
              
              <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-xs sm:text-sm font-bold text-slate-800">
                <span className="text-[11px] sm:text-xs text-slate-500">Net Gross Amount:</span>
                <span className="text-sm sm:text-base font-extrabold font-mono text-emerald-700">
                  {formatINR(grossAmount)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="pt-3 border-t border-slate-100 shrink-0 mt-3">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-all"
          >
            Close Details
          </button>
        </div>

      </div>
    </div>
  );
};
