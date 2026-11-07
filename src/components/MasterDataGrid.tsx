import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Calendar as CalendarIcon, 
  IndianRupee, 
  Layers, 
  Hash, 
  Loader2,
  User,
  Users,
  Scale
} from 'lucide-react';
import { type Transaction } from '../services/sheetService';
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

interface MasterDataGridProps {
  transactions: Transaction[];
  onRefresh: () => void;
  isLoading: boolean;
}

export const MasterDataGrid: React.FC<MasterDataGridProps> = ({ 
  transactions, 
  onRefresh,
  isLoading 
}) => {
  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMark, setSelectedMark] = useState('');
  const [selectedSubUser, setSelectedSubUser] = useState<string>('all');
  const [mobileView, setMobileView] = useState<'cards' | 'table'>('cards');
  
  // Date Range state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => getISTDate());
  
  // Reusable weight details view state
  const [viewingTx, setViewingTx] = useState<Transaction | null>(null);

  // Dynamic available marks from current transactions
  const availableMarks = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(tx => {
      if (tx.mark && tx.mark.trim()) set.add(tx.mark.trim());
    });
    if (set.size === 0) {
      ['Agro', 'BRT', 'RS', 'TS', 'DV', 'BVB'].forEach(m => set.add(m));
    }
    return Array.from(set).sort();
  }, [transactions]);

  // Dynamic Sub-Users list and lot count statistics
  const subUserStats = useMemo(() => {
    const map = new Map<string, number>();
    let pendingCount = 0;

    transactions.forEach(tx => {
      const name = tx.subUserName?.trim();
      if (name) {
        map.set(name, (map.get(name) || 0) + 1);
      } else {
        pendingCount++;
      }
    });

    const list = Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { list, pendingCount };
  }, [transactions]);

  // Currency Formatter for INR
  const formatINR = (value: number | undefined | null) => {
    const num = (value === undefined || value === null || isNaN(value)) ? 0 : value;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(num);
  };

  // Filtered Transactions
  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = 
      tx.agent.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.transactionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.lot.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.subUserName && tx.subUserName.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesMark = selectedMark === '' || tx.mark === selectedMark;
    const matchesDate = 
      (!startDate || tx.date >= startDate) && 
      (!endDate || tx.date <= endDate);
    
    const matchesSubUser = 
      selectedSubUser === 'all'
        ? true
        : selectedSubUser === '__pending__'
          ? (!tx.subUserName || !tx.subUserName.trim())
          : (tx.subUserName && tx.subUserName.toLowerCase() === selectedSubUser.toLowerCase());
    
    return matchesSearch && matchesMark && matchesDate && matchesSubUser;
  });

  // Calculate Metrics
  const totalTransactions = filteredTransactions.length;
  const totalBags = filteredTransactions.reduce((sum, tx) => sum + tx.bags, 0);
  const consolidatedValue = filteredTransactions.reduce((sum, tx) => sum + tx.totalValue, 0);



  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* Dashboard Toolbar */}
      <div className="flex justify-between items-center bg-white p-3.5 sm:p-4 rounded-2xl shadow-soft border border-slate-100">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800">Master Ledger</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Real-time agricultural entries overview</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile Card / Table Segmented Toggle */}
          <div className="flex lg:hidden bg-slate-100 p-0.5 rounded-xl border border-slate-200/50 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setMobileView('cards')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                mobileView === 'cards'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => setMobileView('table')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                mobileView === 'table'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Table
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 sm:p-2.5 text-slate-600 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 rounded-xl transition-all border border-slate-200/50"
            title="Refresh Ledger"
          >
            {isLoading ? (
              <Loader2 className="h-4.5 w-4.5 sm:h-5 sm:w-5 animate-spin text-emerald-600" />
            ) : (
              <svg className="h-4.5 w-4.5 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Total Transactions Card */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-soft border border-slate-100 flex items-center gap-3.5 sm:gap-4">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Layers className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Transactions</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-slate-800 mt-0.5 sm:mt-1">{totalTransactions}</p>
          </div>
        </div>

        {/* Total Bags Handled Card */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-soft border border-slate-100 flex items-center gap-3.5 sm:gap-4">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Hash className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Bags Handled</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-slate-800 mt-0.5 sm:mt-1">{totalBags.toLocaleString()}</p>
          </div>
        </div>

        {/* Consolidated Value Card */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-soft border border-slate-100 flex items-center gap-3.5 sm:gap-4">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <IndianRupee className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Consolidated Value</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-emerald-700 mt-0.5 sm:mt-1">{formatINR(consolidatedValue)}</p>
          </div>
        </div>
      </div>

      {/* Sticky Filter Panel */}
      <div className="sticky top-14 sm:top-16 z-20 bg-white p-3 sm:p-4 rounded-2xl shadow-soft border border-slate-100/80 backdrop-blur-md space-y-3">
        <div className="flex flex-col md:flex-row gap-2.5 sm:gap-3">
          {/* Search Input */}
          <div className="relative flex-grow">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Agent Name, Lot, Sub-User, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 text-sm font-medium"
            />
          </div>
          
          {/* Mark Select Dropdown */}
          <div className="relative w-full md:w-48">
            <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={selectedMark}
              onChange={(e) => setSelectedMark(e.target.value)}
              className="w-full pl-10 pr-8 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 text-sm font-medium appearance-none cursor-pointer"
            >
              <option value="">All Marks</option>
              {availableMarks.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
              <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>

        {/* Date Range Picker Dropdown */}
        <div className="relative w-full md:w-60">
          <button
            type="button"
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            className="w-full flex items-center justify-between pl-10 pr-3 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 text-sm font-medium cursor-pointer text-left text-slate-700 select-none relative"
          >
            <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <span className="truncate pr-4 text-xs sm:text-sm">
              {startDate && endDate
                ? `${startDate} to ${endDate}`
                : startDate
                  ? `From ${startDate}`
                  : endDate
                    ? `Until ${endDate}`
                    : 'Select Date Range'}
            </span>
            <span className="text-[9px] bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded font-bold uppercase shrink-0 border border-indigo-100/50">Range</span>
          </button>

          {isCalendarOpen && (
            <>
              {/* Click outside tap overlay */}
              <div className="fixed inset-0 z-10 cursor-default" onClick={() => setIsCalendarOpen(false)} />
              
              <div className="absolute left-0 right-0 sm:right-auto sm:left-0 mt-2 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 sm:p-4 w-full sm:w-72 space-y-3 animate-fade-in select-none">
                {/* Calendar Month Header */}
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all font-mono"
                  >
                    &larr;
                  </button>
                  <span>
                    {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all font-mono"
                  >
                    &rarr;
                  </button>
                </div>

                {/* Day Labels */}
                <div className="grid grid-cols-7 gap-1 text-[10px] text-center font-bold text-slate-400 uppercase tracking-wider">
                  <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
                </div>

                {/* Day Cells Grid */}
                <div className="grid grid-cols-7 gap-1 text-xs">
                  {(() => {
                    const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
                    const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

                    const year = calendarMonth.getFullYear();
                    const month = calendarMonth.getMonth();
                    const totalDays = getDaysInMonth(year, month);
                    const startOffset = getFirstDayOfMonth(year, month);
                    const cells = [];

                    // Empty pads for week start offset
                    for (let i = 0; i < startOffset; i++) {
                      cells.push(<div key={`pad-${i}`} className="w-8 h-8" />);
                    }

                    // Day cells
                    for (let day = 1; day <= totalDays; day++) {
                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const hasTx = transactions.some(t => t.date === dateStr);
                      const isSelectedStart = startDate === dateStr;
                      const isSelectedEnd = endDate === dateStr;
                      const isWithinRange = !!(startDate && endDate && dateStr > startDate && dateStr < endDate);

                      // Select Date Action
                      const handleSelectDate = () => {
                        if (!startDate || (startDate && endDate)) {
                          setStartDate(dateStr);
                          setEndDate('');
                        } else if (dateStr < startDate) {
                          setStartDate(dateStr);
                          setEndDate('');
                        } else {
                          setEndDate(dateStr);
                          setIsCalendarOpen(false); // Close calendar on selecting end date
                        }
                      };

                      let cellStyle = 'hover:bg-slate-100 text-slate-700';
                      if (isSelectedStart || isSelectedEnd) {
                        cellStyle = 'bg-emerald-600 text-white font-bold rounded-lg shadow-sm shadow-emerald-600/10';
                      } else if (isWithinRange) {
                        cellStyle = 'bg-emerald-50 text-emerald-800 font-semibold rounded-none';
                      } else if (hasTx) {
                        // Highlight dates with transactions in distinct light-indigo background with border
                        cellStyle = 'bg-indigo-50/80 text-indigo-900 border border-indigo-100/50 hover:bg-indigo-100 rounded-lg';
                      }

                      cells.push(
                        <button
                          key={dateStr}
                          type="button"
                          onClick={handleSelectDate}
                          className={`w-8 h-8 flex flex-col items-center justify-center relative transition-all duration-150 rounded-lg font-mono text-[11px] ${cellStyle}`}
                          title={hasTx ? 'Contains transactions' : undefined}
                        >
                          <span>{day}</span>
                          {/* Transaction small dot indicator */}
                          {hasTx && !isSelectedStart && !isSelectedEnd && !isWithinRange && (
                            <span className="w-1 h-1 bg-indigo-500 rounded-full absolute bottom-1" />
                          )}
                        </button>
                      );
                    }
                    return cells;
                  })()}
                </div>

                {/* Preset quick buttons */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setIsCalendarOpen(false);
                    }}
                    className="px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-all cursor-pointer"
                  >
                    Clear Filter
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const dateStr = today.toISOString().split('T')[0];
                      setStartDate(dateStr);
                      setEndDate(dateStr);
                      setIsCalendarOpen(false);
                    }}
                    className="px-2 py-1 bg-emerald-50 text-emerald-800 rounded hover:bg-emerald-100 transition-all cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                      setStartDate(firstDay);
                      setEndDate(lastDay);
                      setIsCalendarOpen(false);
                    }}
                    className="px-2 py-1 bg-indigo-50 text-indigo-800 rounded hover:bg-indigo-100 transition-all cursor-pointer"
                  >
                    This Month
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

          {/* Clear Filters Button */}
          {(searchTerm || selectedMark || selectedSubUser !== 'all' || startDate || endDate) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedMark('');
                setSelectedSubUser('all');
                setStartDate('');
                setEndDate('');
              }}
              className="px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer whitespace-nowrap self-center"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Sub-User Fast Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-0.5 no-scrollbar border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1.5 pl-0.5">
            <Users className="h-3.5 w-3.5 text-indigo-600" />
            Sub-User:
          </span>
          <button
            type="button"
            onClick={() => setSelectedSubUser('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedSubUser === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80 shadow-2xs'
            }`}
          >
            <span>All Sub-Users</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              selectedSubUser === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {transactions.length}
            </span>
          </button>

          {subUserStats.list.map(u => (
            <button
              key={u.name}
              type="button"
              onClick={() => setSelectedSubUser(u.name)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                selectedSubUser.toLowerCase() === u.name.toLowerCase()
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-50/60 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/80 shadow-2xs'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>{u.name}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                selectedSubUser.toLowerCase() === u.name.toLowerCase() ? 'bg-indigo-800 text-white' : 'bg-indigo-200 text-indigo-900'
              }`}>
                {u.count} {u.count === 1 ? 'lot' : 'lots'}
              </span>
            </button>
          ))}

          {subUserStats.pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setSelectedSubUser('__pending__')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                selectedSubUser === '__pending__'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/80 shadow-2xs'
              }`}
            >
              <span>Pending Assignment</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                selectedSubUser === '__pending__' ? 'bg-amber-800 text-white' : 'bg-amber-200 text-amber-900'
              }`}>
                {subUserStats.pendingCount}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Grid Display (Mobile Cards / Desktop Table) */}
      {filteredTransactions.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-soft">
          <Layers className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No Transactions Found</p>
          <p className="text-xs text-slate-500 mt-1">Try modifying your filter settings or search query.</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className={`${mobileView === 'cards' ? 'block' : 'hidden'} lg:hidden space-y-3 sm:space-y-4`}>
            {filteredTransactions.map((tx) => (
              <div 
                key={tx.transactionId} 
                className="bg-white p-4 sm:p-5 rounded-2xl shadow-soft border border-slate-100 space-y-3 relative overflow-hidden"
              >
                {/* Visual Accent for Marks */}
                <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
                
                <div className="flex justify-between items-start gap-2 pl-1 sm:pl-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                      LOT #{tx.lot}
                    </span>
                    <h3 className="font-mono text-xs sm:text-sm font-bold text-slate-800 mt-1 select-all break-all">
                      {tx.transactionId}
                    </h3>
                  </div>
                  <span className="text-xs font-bold uppercase px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100 shrink-0">
                    {tx.mark}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 pl-1 sm:pl-2">
                  <div>
                    <span className="text-slate-400 block uppercase tracking-wider font-semibold text-[10px]">Date</span>
                    <span className="text-slate-800 font-medium font-mono">{tx.date}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase tracking-wider font-semibold text-[10px]">Bags & Owner Rate</span>
                    <span className="text-slate-800 font-semibold font-mono">
                      {tx.bags} Bags @ {formatINR(tx.rate)}
                    </span>
                  </div>
                </div>

                {/* Sub-User Details Separately Card Section */}
                <div className="bg-gradient-to-br from-indigo-50/70 to-slate-50 border border-indigo-100/90 rounded-xl p-3 space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900 border-b border-indigo-100 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-indigo-600" />
                      Sub-User Operations
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                      tx.subUserName ? 'bg-indigo-600 text-white' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {tx.subUserName ? `Logged by: ${tx.subUserName}` : 'Pending Sub-User'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Lot</span>
                      <span className="font-mono font-bold text-slate-800">Lot {tx.lot}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Agent</span>
                      <span className="font-semibold text-slate-800 truncate block">{tx.agent}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Mark</span>
                      <span className="font-bold text-emerald-800 bg-white px-1.5 py-0.5 rounded border border-emerald-200 inline-block text-[10px]">{tx.mark}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1.5 border-t border-indigo-100/60">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Sub-User Rate</span>
                      <span className="font-mono font-bold text-slate-800">
                        {tx.subUserRate !== undefined && tx.subUserRate !== null && tx.subUserRate > 0 
                          ? formatINR(tx.subUserRate) 
                          : <span className="text-slate-400 italic font-sans text-xs">Pending</span>
                        }
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Logged Weight</span>
                      <span className="font-mono font-bold text-slate-800">
                        {tx.weight 
                          ? tx.weight.split('[')[0].trim() 
                          : <span className="text-amber-600 font-sans italic text-xs">Pending</span>
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Total Value Footer */}
                <div className="border-t border-slate-100 pt-3 flex justify-between items-center pl-1 sm:pl-2">
                  <button
                    type="button"
                    onClick={() => setViewingTx(tx)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Scale className="h-3.5 w-3.5" />
                    <span>View Details</span>
                  </button>
                  <div className="text-right">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Total Value</span>
                    <span className="text-sm sm:text-base font-bold font-mono text-emerald-700">{formatINR(tx.totalValue)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Table View (shown always on desktop, and on mobile when Table mode selected) */}
          <div className={`${mobileView === 'table' ? 'block' : 'hidden'} lg:block bg-white rounded-2xl shadow-soft border border-slate-100 overflow-hidden`}>
            <div className="overflow-x-auto max-h-[calc(100dvh-280px)] min-h-[350px] overscroll-contain">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50 text-[11px] xl:text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0 z-1 whitespace-nowrap">
                  <tr>
                    <th className="py-3.5 px-3 border-b border-slate-100">Transaction ID</th>
                    <th className="py-3.5 px-3 border-b border-slate-100">Date</th>
                    <th className="py-3.5 px-3 border-b border-slate-100 text-right">Bags</th>
                    <th className="py-3.5 px-3 border-b border-slate-100 text-right">Owner Rate</th>
                    <th className="py-3.5 px-3 border-b border-slate-100 text-right">Total Value</th>
                    
                    {/* Dedicated Sub-User Details Separately Columns */}
                    <th className="py-3.5 px-3.5 border-b border-indigo-200 bg-indigo-50/80 text-indigo-950 font-bold">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-indigo-600" />
                        Sub-User (Logged By)
                      </span>
                    </th>
                    <th className="py-3.5 px-3 border-b border-indigo-200 bg-indigo-50/80 text-indigo-950 text-center font-bold">Sub-User Lot</th>
                    <th className="py-3.5 px-3 border-b border-indigo-200 bg-indigo-50/80 text-indigo-950 font-bold">Sub-User Agent</th>
                    <th className="py-3.5 px-3 border-b border-indigo-200 bg-indigo-50/80 text-indigo-950 text-center font-bold">Sub-User Mark</th>
                    <th className="py-3.5 px-3 border-b border-indigo-200 bg-indigo-50/80 text-indigo-950 text-right font-bold">Sub-User Rate</th>
                    <th className="py-3.5 px-3 border-b border-indigo-200 bg-indigo-50/80 text-indigo-950 text-center font-bold">Weight Status</th>

                    <th className="py-3.5 px-4 border-b border-slate-100 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs xl:text-sm font-medium text-slate-700">
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.transactionId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-3 font-mono text-slate-800 select-all whitespace-nowrap">{tx.transactionId}</td>
                      <td className="py-3.5 px-3 font-mono text-slate-500 whitespace-nowrap">{tx.date}</td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-900 whitespace-nowrap">{tx.bags.toLocaleString()}</td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">{formatINR(tx.rate)}</td>
                      <td className="py-3.5 px-3 text-right font-mono text-emerald-700 font-bold whitespace-nowrap">{formatINR(tx.totalValue)}</td>

                      {/* Sub-User Details Columns */}
                      <td className="py-3.5 px-3.5 bg-indigo-50/20 whitespace-nowrap">
                        {tx.subUserName ? (
                          <span className="inline-flex items-center gap-1.5 font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs">
                            <User className="h-3 w-3 text-indigo-600" />
                            {tx.subUserName}
                          </span>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded text-[11px] font-semibold">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 bg-indigo-50/20 text-center font-mono font-bold text-slate-800 whitespace-nowrap">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">Lot {tx.lot}</span>
                      </td>
                      <td className="py-3.5 px-3 bg-indigo-50/20 text-slate-900 font-semibold whitespace-nowrap">
                        {tx.agent}
                      </td>
                      <td className="py-3.5 px-3 bg-indigo-50/20 text-center whitespace-nowrap">
                        <span className="inline-block text-[11px] font-bold uppercase px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded border border-emerald-200">
                          {tx.mark}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 bg-indigo-50/20 text-right font-mono whitespace-nowrap">
                        {tx.subUserRate !== undefined && tx.subUserRate !== null && tx.subUserRate > 0 ? (
                          <span className="font-bold text-slate-800">{formatINR(tx.subUserRate)}</span>
                        ) : (
                          <span className="text-slate-400 font-sans italic text-xs">Pending</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 bg-indigo-50/20 text-center whitespace-nowrap">
                        {tx.weight ? (
                          <span className="font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs font-bold">
                            {tx.weight.split('[')[0].trim()}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                            Pending
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setViewingTx(tx)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1 mx-auto"
                        >
                          <Scale className="h-3.5 w-3.5" />
                          <span>View Details</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Read-Only weight optimization detailed view modal */}
      {viewingTx && (
        <ViewWeightDetailsModal
          transaction={viewingTx}
          onClose={() => setViewingTx(null)}
          onUpdate={onRefresh}
          allowPrint={true}
          dateRange={
            startDate && endDate
              ? `${startDate} to ${endDate}`
              : startDate
                ? `From ${startDate}`
                : endDate
                  ? `Until ${endDate}`
                  : undefined
          }
        />
      )}

    </div>
  );
};
