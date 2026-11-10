import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import type { Transaction } from '../services/sheetService';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onConfirm: (transactionId: string) => Promise<{ success: boolean; message: string }>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  transaction,
  onClose,
  onConfirm
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setIsDeleting(false);
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  if (!isOpen || !transaction) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError('');
    try {
      const result = await onConfirm(transaction.transactionId);
      if (!result.success) {
        setError(result.message);
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to delete transaction.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div 
        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md flex flex-col overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-rose-100 flex items-center justify-between bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/20">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800">Delete Pending Entry</h2>
              <p className="text-xs text-slate-500">Irreversible action</p>
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

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-semibold">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs sm:text-sm text-slate-600">
            Are you sure you want to permanently delete this transaction? Since weight status is <strong className="text-amber-700">Pending</strong>, this record can safely be removed from the ledger.
          </p>

          {/* Details Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Transaction ID:</span>
              <span className="font-mono font-bold text-slate-800">{transaction.transactionId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Date & Lot:</span>
              <span className="font-semibold text-slate-700">{transaction.date} &bull; Lot {transaction.lot}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Bags & Rate:</span>
              <span className="font-semibold text-slate-700">{transaction.bags} bags @ ₹{transaction.rate}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Agent & Mark:</span>
              <span className="font-semibold text-slate-700">{transaction.agent} ({transaction.mark})</span>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-200/60">
              <span className="text-slate-500 font-medium">Weight Status:</span>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/80 rounded text-[11px] font-bold">
                Pending
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 sm:px-6 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-600/20 hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                <span>Delete Permanently</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
