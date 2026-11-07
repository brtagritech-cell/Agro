import React from 'react';
import { X, Scale, Info, Printer, User } from 'lucide-react';
import type { Transaction } from '../services/sheetService';
import { getCurrentTenant } from '../services/sheetService';

interface ViewWeightDetailsModalProps {
  transaction: Transaction;
  onClose: () => void;
  onUpdate?: () => void;
  dateRange?: string;
  allowPrint?: boolean;
}

export const ViewWeightDetailsModal: React.FC<ViewWeightDetailsModalProps> = ({
  transaction,
  onClose,
  dateRange,
  allowPrint = false
}) => {
  const currentTenant = getCurrentTenant();
  const bagCost = currentTenant?.bagCost ?? 25;
  const taram = currentTenant?.taram ?? 1.100;

  const handlePrint = () => {
    window.print();
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
    <>
      {/* Print Specific CSS to isolate the slip cleanly (Only enabled when allowPrint is true) */}
      {allowPrint && (
        <>
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #printable-weight-slip, #printable-weight-slip * {
                visibility: visible !important;
              }
              #printable-weight-slip {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                display: block !important;
                padding: 24px !important;
                background: white !important;
                color: black !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>

          {/* Printable Slip (DOM for printer) */}
          <div id="printable-weight-slip" className="hidden">
            <div style={{ borderBottom: '2px solid black', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1 style={{ fontSize: '22px', fontWeight: '900', margin: 0, letterSpacing: '-0.5px' }}>AgroSync</h1>
                  <p style={{ fontSize: '12px', margin: '4px 0 0', color: '#555' }}>Branch: {currentTenant?.subUrl || 'Head Branch'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h2 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>WEIGHT LEDGER SLIP</h2>
                  <p style={{ fontSize: '12px', margin: '4px 0 0', fontFamily: 'monospace' }}>Date: {transaction.date}</p>
                  {dateRange && <p style={{ fontSize: '10px', margin: '2px 0 0', color: '#666' }}>Date Range: {dateRange}</p>}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', padding: '12px', border: '1px solid #ccc', borderRadius: '8px', marginBottom: '16px' }}>
              <div><strong>LOT NUMBER:</strong> Lot {transaction.lot}</div>
              <div><strong>TRANSACTION ID:</strong> {transaction.transactionId}</div>
              <div><strong>DATE:</strong> {transaction.date}</div>
              <div><strong>AGENT NAME:</strong> {transaction.agent}</div>
              <div><strong>BRAND / MARK:</strong> {transaction.mark}</div>
              <div><strong>TOTAL BAGS:</strong> {totalBags} Bags</div>
              <div><strong>OWNER RATE:</strong> {formatINR(transaction.rate)}</div>
              <div><strong>SUB-USER RATE:</strong> {transaction.subUserRate ? formatINR(transaction.subUserRate) : 'Pending'}</div>
              <div><strong>LOGGED BY (SUB-USER):</strong> {transaction.subUserName || 'Pending'}</div>
              {transaction.rateReason && (
                <div style={{ gridColumn: 'span 2', color: '#b91c1c' }}><strong>RATE MODIFICATION REASON:</strong> {transaction.rateReason}</div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Bag Weights Breakdown ({bagWeights.length} Bags)</span>
                <span style={{ fontFamily: 'monospace' }}>Total Gross: {grossWeight.toFixed(3)} kg</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', fontSize: '11px' }}>
                {bagWeights.map((w, idx) => (
                  <div key={`print-bag-${idx}`} style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace' }}>
                    <span style={{ color: '#666' }}>#{idx + 1}:</span>
                    <span style={{ fontWeight: 'bold' }}>{w} kg</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: '2px solid black', padding: '12px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '6px', marginBottom: '6px' }}>
                <span>CALCULATIONS SUMMARY</span>
                <span style={{ fontFamily: 'monospace' }}>TARE: {taram.toFixed(3)} KG/BAG</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div>Total Bags Count: <strong>{totalBags} Bags</strong></div>
                <div>Gross Weight: <strong style={{ fontFamily: 'monospace' }}>{grossWeight.toFixed(3)} kg</strong></div>
                <div>Bags Tare Deduction: <strong style={{ fontFamily: 'monospace' }}>-{tareWeight.toFixed(3)} kg</strong></div>
                <div>Net Weight: <strong style={{ fontFamily: 'monospace' }}>{netWeight.toFixed(3)} kg</strong></div>
              </div>
              <div style={{ borderTop: '1px solid black', paddingTop: '8px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '900' }}>
                <span>CALCULATED NET AMOUNT:</span>
                <span style={{ color: '#047857' }}>{formatINR(grossAmount)}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #ccc', paddingTop: '8px', fontSize: '10px', color: '#666', display: 'flex', justifyContent: 'space-between' }}>
              <span>AgroSync Verified Ledger Record</span>
              <span>Printed on: {new Date().toLocaleString()}</span>
            </div>
          </div>
        </>
      )}

      {/* Screen Interactive Modal */}
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in no-print">
        <div className="w-full sm:max-w-xl md:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-premium border-t sm:border border-slate-100 p-4 sm:p-6 lg:p-7 flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-slide-up">
          {/* Mobile Sheet Drag Handle */}
          <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-2 sm:hidden shrink-0" />
          
          {/* Header */}
          <div className="flex justify-between items-center border-b border-slate-100 pb-3 shrink-0">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
                <Scale className="h-4.5 w-4.5 text-emerald-600" />
                <span>Weight Optimization Ledger Details</span>
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5 font-medium uppercase tracking-wider">
                Recorded Bag Weights & Calculations
              </p>
            </div>
            <div className="flex items-center gap-2">
              {allowPrint && (
                <button 
                  type="button"
                  onClick={handlePrint}
                  className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Print Weight Ledger Details"
                >
                  <Printer className="h-4 w-4 text-indigo-600" />
                  <span className="hidden sm:inline">Print Slip</span>
                </button>
              )}
              <button 
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Target Lot Meta Box with Clear Lot & Date Range Display */}
          <div className="bg-slate-50/80 border border-slate-200/70 p-3 sm:p-3.5 rounded-2xl text-xs space-y-2 mt-2.5 sm:mt-3 shrink-0">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-black font-mono bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-lg shadow-2xs">
                  LOT #{transaction.lot}
                </span>
                <span className="text-xs font-bold text-slate-700 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                  Date: {transaction.date}
                </span>
                {dateRange && (
                  <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    Range: {dateRange}
                  </span>
                )}
              </div>
              <span className="font-bold text-slate-800 font-mono text-xs select-all bg-white px-2 py-0.5 rounded border border-slate-200">
                {transaction.transactionId}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 text-slate-600 font-medium pt-2 border-t border-slate-200/50">
              <div>Lot Number: <span className="text-slate-900 font-bold font-mono">Lot {transaction.lot}</span></div>
              <div>Transaction Date: <span className="text-slate-900 font-bold font-mono">{transaction.date}</span></div>
              <div>Commission Agent: <span className="text-slate-900 font-bold break-words">{transaction.agent}</span></div>
              <div>Brand / Mark: <span className="inline-block px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded font-bold uppercase text-xs font-mono">{transaction.mark}</span></div>
              <div>Total Bags: <span className="text-slate-900 font-bold font-mono">{totalBags} Bags</span></div>
              <div>Owner Rate: <span className="text-slate-900 font-bold font-mono">{formatINR(transaction.rate)}</span></div>
              
              <div className="sm:col-span-2 border-t border-slate-200/40 pt-1.5 mt-0.5 grid grid-cols-1 sm:grid-cols-2 gap-y-1 bg-white p-2 rounded-xl border border-slate-200/60">
                <div>Sub-User Rate: <span className="text-slate-900 font-bold font-mono">{transaction.subUserRate !== undefined && transaction.subUserRate !== null && transaction.subUserRate > 0 ? formatINR(transaction.subUserRate) : <span className="text-slate-400 font-sans font-medium italic">Pending</span>}</span></div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>Logged By (Sub-User):</span>
                  <span className="text-indigo-800 font-bold font-mono bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 inline-flex items-center gap-1">
                    <User className="h-3 w-3 text-indigo-600" />
                    {transaction.subUserName || <span className="text-slate-400 font-sans italic font-normal">Pending</span>}
                  </span>
                </div>
              </div>

              {transaction.rateReason && (
                <div className="sm:col-span-2 text-rose-700 font-semibold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100/50 text-[11px] break-words">
                  Rate Mod Reason: <span className="font-bold">{transaction.rateReason}</span>
                </div>
              )}
            </div>
          </div>

          {/* Main Body - Smooth touch scroll */}
          <div className="flex-grow overflow-y-auto overscroll-contain min-h-0 mt-3 sm:mt-4 space-y-3 sm:space-y-4 pr-1">
            <div className="flex items-center justify-between">
              <span className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Bag Weights Breakdown ({bagWeights.length} Bags)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Total Gross: {grossWeight.toFixed(3)} kg
              </span>
            </div>

            {bagWeights.length === 0 ? (
              <div className="text-center py-8 sm:py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <Info className="h-7 w-7 sm:h-8 sm:w-8 text-amber-500/80 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600">Pending Weight Recording</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  The sub-user has not added weight details against this lot yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {bagWeights.map((w, idx) => (
                  <div key={`bag-view-${idx}`} className="flex items-center justify-between px-2.5 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs hover:border-emerald-300 transition-all shadow-2xs">
                    <span className="text-slate-400 font-mono font-bold text-[10px] sm:text-[11px]">#{idx + 1}</span>
                    <span className="font-bold font-mono text-slate-800 text-xs sm:text-sm">{w} kg</span>
                  </div>
                ))}
              </div>
            )}

            {bagWeights.length > 0 && (
              /* Formulas & Calculations Metrics footer */
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2.5 text-xs w-full shadow-2xs">
                <div className="flex justify-between font-semibold border-b border-slate-200/60 pb-1.5 text-slate-500">
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Calculations Summary</span>
                  <span className="font-mono text-[10px] bg-slate-200/70 px-1.5 py-0.5 rounded text-slate-600">TARE: {taram.toFixed(3)} KG/BAG</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-x-6 sm:gap-y-1.5 font-medium text-slate-600">
                  <div className="flex justify-between">
                    <span>Total Bags Count:</span>
                    <span className="font-bold text-slate-800 font-mono">{totalBags} Bags</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gross Weight:</span>
                    <span className="font-bold text-slate-800 font-mono">{grossWeight.toFixed(3)} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bags Tare Deduction:</span>
                    <span className="font-bold text-slate-800 font-mono">-{tareWeight.toFixed(3)} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Net Weight:</span>
                    <span className="font-bold text-slate-800 font-mono">{netWeight.toFixed(3)} kg</span>
                  </div>
                </div>
                
                <div className="border-t border-slate-200/60 pt-2 flex justify-between items-center text-xs sm:text-sm font-bold text-slate-800">
                  <span className="text-[11px] sm:text-xs text-slate-500">Calculated Net Amount:</span>
                  <span className="text-sm sm:text-base font-extrabold font-mono text-emerald-700">
                    {formatINR(grossAmount)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-100 shrink-0 mt-3 flex gap-2">
            {allowPrint && (
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <Printer className="h-4 w-4" />
                <span>Print Details</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
            >
              Close Details
            </button>
          </div>

        </div>
      </div>
    </>
  );
};
