import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Database,
  Zap,
  Users,
  Tag,
  Trash2,
  AlertCircle,
  Save,
  ChevronDown,
  Check,
  Scale,
  Pencil
} from 'lucide-react';
import { 
  type Transaction, 
  getShortAgentName, 
  isGoogleSheetsEnabled, 
  getCurrentTenant, 
  updateBranchConfiguration,
  type TenantConfig,
  isWeightPending,
  deleteTransaction as defaultDeleteTx,
  editTransaction as defaultEditTx
} from '../services/sheetService';
import { ViewWeightDetailsModal } from './ViewWeightDetailsModal';
import { EditTransactionModal } from './EditTransactionModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { SupabaseConnectModal } from './SupabaseConnectModal';

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
  onDeleteTransaction?: (txId: string) => Promise<{ success: boolean; message: string }>;
  onEditTransaction?: (originalTxId: string, updatedData: Partial<Transaction>) => Promise<{ success: boolean; message: string }>;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  transactions,
  onAddTransaction,
  onUpdateWeight: _onUpdateWeight,
  onTabChange,
  onRefresh,
  onDeleteTransaction,
  onEditTransaction
}) => {
  const [tenant, setTenant] = useState<TenantConfig>(() => getCurrentTenant());
  const currentTenant = tenant;

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
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  // Searchable combobox dropdown states for Add Transaction Form
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [isMarkDropdownOpen, setIsMarkDropdownOpen] = useState(false);
  const agentDropdownRef = useRef<HTMLDivElement>(null);
  const markDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tenant?.marks && tenant.marks.length > 0) {
      if (!mark || !tenant.marks.includes(mark)) {
        setMark(tenant.marks[0]);
      }
    }
  }, [tenant.subUrl, tenant.marks]);

  useEffect(() => {
    const handleSubRouteChange = () => {
      setTenant(getCurrentTenant());
    };
    window.addEventListener('hashchange', handleSubRouteChange);
    return () => window.removeEventListener('hashchange', handleSubRouteChange);
  }, []);

  // Branch Settings & Master Data Modal states
  const [isMasterDataOpen, setIsMasterDataOpen] = useState(false);
  const [masterTab, setModalTab] = useState<'subusers' | 'marks' | 'agents' | 'pricing'>('subusers');

  // Sub-Users state
  const [branchSubUsers, setBranchSubUsers] = useState<{ name: string; password: string }[]>([]);
  const [newBranchSubUserName, setNewBranchSubUserName] = useState('');
  const [newBranchSubUserPassword, setNewBranchSubUserPassword] = useState('');
  const [branchSubUserError, setBranchSubUserError] = useState('');

  // Marks state
  const [branchMarks, setBranchMarks] = useState<string[]>([]);
  const [newBranchMark, setNewBranchMark] = useState('');
  const [branchMarkError, setBranchMarkError] = useState('');

  // Agents state
  const [branchAgents, setBranchAgents] = useState<string[]>([]);
  const [newBranchAgent, setNewBranchAgent] = useState('');
  const [branchAgentError, setBranchAgentError] = useState('');

  // Available commission agents: from tenant configuration + all already entered transactions
  const availableAgents = useMemo(() => {
    const fromTenant = tenant?.agents || currentTenant?.agents || branchAgents || [];
    const fromTxs = transactions.map(t => t.agent).filter(Boolean);
    const set = new Set<string>();
    [...fromTenant, ...fromTxs].forEach(a => {
      const clean = (a || '').trim();
      if (clean) set.add(clean);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tenant, currentTenant, branchAgents, transactions]);

  // Filtered agents matching typed input
  const filteredAgents = useMemo(() => {
    if (!agent.trim()) return availableAgents;
    const q = agent.trim().toLowerCase();
    return availableAgents.filter(a => a.toLowerCase().includes(q));
  }, [availableAgents, agent]);

  // Available brand marks: from tenant configuration + all already entered transactions
  const availableMarks = useMemo(() => {
    const fromTenant = tenant?.marks || currentTenant?.marks || branchMarks || [];
    const fromTxs = transactions.map(t => t.mark).filter(Boolean);
    const defaults = ['AD', 'Agro', 'BRT', 'RS', 'TS', 'DV', 'BVB'];
    const set = new Set<string>();
    [...fromTenant, ...fromTxs, ...defaults].forEach(m => {
      const clean = (m || '').trim().toUpperCase();
      if (clean) set.add(clean);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tenant, currentTenant, branchMarks, transactions]);

  // Filtered marks matching typed input
  const filteredMarks = useMemo(() => {
    if (!mark.trim()) return availableMarks;
    const q = mark.trim().toLowerCase();
    return availableMarks.filter(m => m.toLowerCase().includes(q));
  }, [availableMarks, mark]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setIsAgentDropdownOpen(false);
      }
      if (markDropdownRef.current && !markDropdownRef.current.contains(e.target as Node)) {
        setIsMarkDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Pricing state
  const [masterBagCost, setMasterBagCost] = useState<string>(String(tenant.bagCost ?? 25));
  const [masterTaram, setMasterTaram] = useState<string>(String(tenant.taram ?? 1.100));
  const [masterError, setMasterError] = useState('');
  const [isSavingMaster, setIsSavingMaster] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  useEffect(() => {
    setMasterBagCost(String(tenant.bagCost ?? 25));
    setMasterTaram(String(tenant.taram ?? 1.100));
  }, [tenant.subUrl, tenant.bagCost, tenant.taram]);

  const openBranchSettingsModal = (initialTab: 'subusers' | 'marks' | 'agents' | 'pricing' = 'subusers') => {
    const t = getCurrentTenant();
    setTenant(t);
    setModalTab(initialTab);

    // Format sub-users
    const formattedSubUsers = (t.subUsers || []).map(name => ({
      name,
      password: (t.subUserPasswords && t.subUserPasswords[name]) ? String(t.subUserPasswords[name]) : t.ownerPassword || '1234'
    }));
    setBranchSubUsers(formattedSubUsers);
    setNewBranchSubUserName('');
    setNewBranchSubUserPassword('');
    setBranchSubUserError('');

    setBranchMarks([...(t.marks || [])]);
    setNewBranchMark('');
    setBranchMarkError('');

    setBranchAgents([...(t.agents || [])]);
    setNewBranchAgent('');
    setBranchAgentError('');

    setMasterBagCost(String(t.bagCost ?? 25));
    setMasterTaram(String(t.taram ?? 1.100));
    setMasterError('');
    setSaveSuccessMsg('');
    setIsMasterDataOpen(true);
  };

  const handleAddBranchSubUser = () => {
    const trimmedName = newBranchSubUserName.trim();
    const trimmedPass = newBranchSubUserPassword.trim();

    if (!trimmedName && !trimmedPass) {
      setBranchSubUserError('Please enter sub-user name and password before adding.');
      return;
    }

    if (!trimmedName) {
      setBranchSubUserError('Please enter a sub-user name before adding.');
      return;
    }

    if (!trimmedPass) {
      setBranchSubUserError('Please enter a sub-user password before adding.');
      return;
    }

    if (branchSubUsers.some(su => su.name.toLowerCase() === trimmedName.toLowerCase())) {
      setBranchSubUserError(`Sub-user "${trimmedName}" is already added for this branch.`);
      return;
    }

    setBranchSubUsers(prev => [
      ...prev,
      {
        name: trimmedName,
        password: trimmedPass
      }
    ]);
    setNewBranchSubUserName('');
    setNewBranchSubUserPassword('');
    setBranchSubUserError('');
  };

  const handleUpdateBranchSubUser = (index: number, field: 'name' | 'password', value: string) => {
    setBranchSubUsers(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveBranchSubUser = (index: number) => {
    setBranchSubUsers(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddBranchMark = () => {
    const trimmed = newBranchMark.trim().toUpperCase();
    if (!trimmed) {
      setBranchMarkError('Please enter a brand mark before adding.');
      return;
    }
    if (branchMarks.includes(trimmed)) {
      setBranchMarkError(`Brand Mark "${trimmed}" is already added for this branch.`);
      return;
    }
    setBranchMarks(prev => [...prev, trimmed]);
    setNewBranchMark('');
    setBranchMarkError('');
  };

  const handleRemoveBranchMark = (index: number) => {
    if (branchMarks.length <= 1) {
      setBranchMarkError('At least one brand mark must remain configured.');
      return;
    }
    setBranchMarks(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddBranchAgent = () => {
    const trimmed = newBranchAgent.trim();
    if (!trimmed) {
      setBranchAgentError('Please enter a commission agent name before adding.');
      return;
    }
    if (branchAgents.some(a => a.toLowerCase() === trimmed.toLowerCase())) {
      setBranchAgentError(`Commission Agent "${trimmed}" is already added for this branch.`);
      return;
    }
    setBranchAgents(prev => [...prev, trimmed]);
    setNewBranchAgent('');
    setBranchAgentError('');
  };

  const handleRemoveBranchAgent = (index: number) => {
    setBranchAgents(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveBranchSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setMasterError('');
    setSaveSuccessMsg('');

    const parsedCost = parseFloat(masterBagCost);
    const parsedTaram = parseFloat(masterTaram);

    if (isNaN(parsedCost) || parsedCost < 0) {
      setMasterError('Bag Cost must be a valid non-negative number.');
      setModalTab('pricing');
      return;
    }
    if (isNaN(parsedTaram) || parsedTaram <= 0) {
      setMasterError('Taram (Tare weight per bag) must be a positive number.');
      setModalTab('pricing');
      return;
    }

    // Auto-commit any pending inputs
    let finalMarks = [...branchMarks];
    if (newBranchMark.trim()) {
      const pm = newBranchMark.trim().toUpperCase();
      if (!finalMarks.includes(pm)) finalMarks.push(pm);
    }
    if (finalMarks.length === 0) {
      setMasterError('At least one Brand Mark must be configured.');
      setModalTab('marks');
      return;
    }

    let finalAgents = [...branchAgents];
    if (newBranchAgent.trim()) {
      const pa = newBranchAgent.trim();
      if (!finalAgents.includes(pa)) finalAgents.push(pa);
    }

    let finalSubUsersList = [...branchSubUsers];
    if (newBranchSubUserName.trim()) {
      finalSubUsersList.push({
        name: newBranchSubUserName.trim(),
        password: newBranchSubUserPassword.trim() || tenant.ownerPassword || '1234'
      });
    }

    const subUsers: string[] = [];
    const subUserPasswords: { [username: string]: string } = {};

    finalSubUsersList.forEach(item => {
      const name = item.name.trim();
      if (name) {
        if (!subUsers.includes(name)) {
          subUsers.push(name);
        }
        subUserPasswords[name] = item.password.trim() || tenant.ownerPassword || '1234';
      }
    });

    setIsSavingMaster(true);
    try {
      const result = await updateBranchConfiguration(tenant.subUrl, {
        subUsers,
        subUserPasswords,
        marks: finalMarks,
        agents: finalAgents,
        bagCost: parsedCost,
        taram: parsedTaram
      });

      const updatedTenant = getCurrentTenant();
      setTenant(updatedTenant);
      if (finalMarks.length > 0 && !finalMarks.includes(mark)) {
        setMark(finalMarks[0]);
      }
      
      setSaveSuccessMsg(result.message || 'Branch settings and master data synced to database successfully!');
      setTimeout(() => {
        setIsMasterDataOpen(false);
      }, 900);
      onRefresh?.();
    } catch (err: any) {
      setMasterError(err?.message || 'Failed to save and sync with database.');
    } finally {
      setIsSavingMaster(false);
    }
  };
  
  // Reusable weight details view state
  const [viewingTx, setViewingTx] = useState<Transaction | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  const handleDeleteConfirm = async (txId: string) => {
    if (onDeleteTransaction) {
      const res = await onDeleteTransaction(txId);
      if (res.success && onRefresh) onRefresh();
      return res;
    }
    const res = await defaultDeleteTx(txId);
    if (res.success && onRefresh) onRefresh();
    return res;
  };

  const handleEditSave = async (originalTxId: string, updatedData: Partial<Transaction>) => {
    if (onEditTransaction) {
      const res = await onEditTransaction(originalTxId, updatedData);
      if (res.success && onRefresh) onRefresh();
      return res;
    }
    const res = await defaultEditTx(originalTxId, updatedData);
    if (res.success && onRefresh) onRefresh();
    return res;
  };
  
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

  // Lock background scroll when any modal sheet is open on mobile
  useEffect(() => {
    if (isFormOpen || isReviewOpen || isMasterDataOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isFormOpen, isReviewOpen, isMasterDataOpen]);

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
      // 1. Check if Commission Agent is new, and if so, save it to the database!
      const trimmedAgent = reviewData.agent.trim();
      const currentAgents = tenant?.agents || branchAgents || [];
      const isAgentKnown = currentAgents.some(a => a.trim().toLowerCase() === trimmedAgent.toLowerCase());
      if (!isAgentKnown && trimmedAgent) {
        const updatedAgents = [...currentAgents, trimmedAgent];
        setBranchAgents(updatedAgents);
        try {
          await updateBranchConfiguration(tenant.subUrl, { agents: updatedAgents });
          console.log(`New Commission Agent "${trimmedAgent}" saved to database successfully.`);
        } catch (err) {
          console.warn('Failed to auto-save new agent to database:', err);
        }
      }

      // 2. Check if Brand / Mark is new, and if so, save it to the database!
      const trimmedMark = reviewData.mark.trim().toUpperCase();
      const currentMarks = tenant?.marks || branchMarks || [];
      const isMarkKnown = currentMarks.some(m => m.trim().toUpperCase() === trimmedMark);
      if (!isMarkKnown && trimmedMark) {
        const updatedMarks = [...currentMarks, trimmedMark];
        setBranchMarks(updatedMarks);
        try {
          await updateBranchConfiguration(tenant.subUrl, { marks: updatedMarks });
          console.log(`New Brand Mark "${trimmedMark}" saved to database successfully.`);
        } catch (err) {
          console.warn('Failed to auto-save new mark to database:', err);
        }
      }

      setSubmitResult({ success: true, message: response.message });
      // Reset form states
      setLot('');
      setBags('');
      setRate('');
      setAgent('');
      setMark(tenant?.marks?.[0] || 'BRT');
      setIsAgentDropdownOpen(false);
      setIsMarkDropdownOpen(false);
      
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
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800">Owner Terminal</h2>
            {tenant.companyName && (
              <span className="text-base sm:text-lg font-black text-emerald-800 bg-emerald-50 border border-emerald-200/90 px-3 py-0.5 rounded-xl shadow-2xs">
                {tenant.companyName}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-0.5">
            <span className="text-xs text-slate-500">Control hub and transaction scheduler</span>
            <button
              type="button"
              onClick={() => setIsSupabaseModalOpen(true)}
              title="Click to configure Supabase Database connection"
              className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full select-none leading-none border uppercase tracking-wider font-mono transition-all hover:scale-105 cursor-pointer ${
                isGoogleSheetsEnabled() 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              {isGoogleSheetsEnabled() ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Supabase Connected ⚙️</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Local Mock Mode (Connect ⚡)</span>
                </>
              )}
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={() => openBranchSettingsModal('subusers')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl font-semibold active:scale-[0.98] transition-all text-xs sm:text-sm cursor-pointer shadow-2xs"
            title="Manage Sub-Users, Marks, Agents & Master Data for this branch"
          >
            <Users className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-indigo-600" />
            <span>Branch Settings</span>
          </button>
          <button
            onClick={() => {
              setFormError('');
              setIsFormOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/25 active:scale-[0.98] transition-all text-xs sm:text-sm"
          >
            <Plus className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            <span>Add New Transaction</span>
          </button>
        </div>
      </div>

      {/* Supabase Sync Info Banner */}
      {!isGoogleSheetsEnabled() && (
        <div className="p-3.5 sm:p-4 bg-amber-50/60 border border-amber-100/80 text-amber-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs leading-relaxed shadow-soft">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">Supabase Database Sync is not configured</p>
              <p className="text-amber-700/90 font-medium">
                You are currently running in <strong>Local Mock Mode</strong>. Paste your Supabase Project URL and Anon Key to sync live across devices.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSupabaseModalOpen(true)}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 shrink-0 text-xs cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Connect Supabase Now</span>
          </button>
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
            <div className="space-y-2 overflow-y-auto max-h-[380px] sm:max-h-[440px] pr-1 overscroll-contain">
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
                      <div>Value: <span className="font-semibold text-emerald-700 font-mono">{(!tx.subUserName || !tx.subUserName.trim() || tx.subUserName.toLowerCase() === 'pending' || !tx.weight || !tx.weight.trim()) ? '' : formatINR(tx.totalValue)}</span></div>
                      <div>Weight: <span className="font-semibold text-slate-800 font-mono">{tx.weight ? 'Added' : 'Pending'}</span></div>
                    </div>
                    <div className="flex justify-between items-center mt-1 border-t border-slate-200/30 pt-1.5">
                      <span className="text-[10px] text-slate-400">LOT {tx.lot}</span>
                      <div className="flex items-center gap-1.5">
                        {isWeightPending(tx) ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingTx(tx)}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/90 font-bold text-[10px] rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                              title="Edit Pending Transaction"
                            >
                              <Pencil className="h-3 w-3 text-amber-700" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingTx(tx)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/90 font-bold text-[10px] rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                              title="Delete Pending Transaction"
                            >
                              <Trash2 className="h-3 w-3 text-rose-600" />
                              <span>Delete</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setViewingTx(tx)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Scale className="h-3 w-3" />
                            <span>View Details</span>
                          </button>
                        )}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          {/* Close tap overlay */}
          <div className="absolute inset-0" onClick={() => setIsFormOpen(false)} />
          
          {/* Bottom Sheet Container */}
          <div className="w-full max-w-lg md:max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-premium border-t sm:border border-slate-100 flex flex-col max-h-[92dvh] sm:max-h-[90vh] z-10 animate-slide-up overflow-hidden">
            {/* Mobile Sheet Drag Handle */}
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 sm:hidden shrink-0" />
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 px-4 py-3 sm:px-6 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800">Add New Entry</h3>
                <p className="text-xs text-slate-500">Ledger transaction recording panel</p>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error alerts */}
            {formError && (
              <div className="mx-4 sm:mx-6 mt-3 p-3 sm:p-3.5 bg-rose-50 text-rose-800 border border-rose-100 rounded-xl flex gap-2 text-xs font-medium shrink-0">
                <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Form Body with Smooth Touch Pan */}
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
                  inputMode="numeric"
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
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="e.g. 52.00"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium font-mono"
                />
              </div>

              {/* Commission Agent Name with Dropdown Search */}
              <div className="relative" ref={agentDropdownRef}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Commission Agent Name
                  </label>
                  {agent.trim() && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border font-mono ${
                      availableAgents.some(a => a.toLowerCase() === agent.trim().toLowerCase())
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                    }`}>
                      {availableAgents.some(a => a.toLowerCase() === agent.trim().toLowerCase()) 
                        ? 'Existing Agent' 
                        : '+ New (Will Save to DB)'}
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
                    className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all"
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
                                ? 'bg-indigo-50 text-indigo-800 font-bold' 
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <span className="break-words">{item}</span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-2.5 text-center text-xs text-slate-400 font-medium">
                        No existing agents matching "{agent}"
                      </div>
                    )}

                    {agent.trim() && !availableAgents.some(a => a.toLowerCase() === agent.trim().toLowerCase()) && (
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setIsAgentDropdownOpen(false);
                        }}
                        className="mt-1 pt-1 border-t border-slate-100 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-xl cursor-pointer text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate">Add & save new agent: <strong>"{agent.trim()}"</strong></span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Brand Name / Mark with Dropdown Search */}
              <div className="relative" ref={markDropdownRef}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Brand Name / Mark
                  </label>
                  <button
                    type="button"
                    onClick={() => openBranchSettingsModal('marks')}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Manage Marks</span>
                  </button>
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
                    className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-bold uppercase font-mono focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-all"
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
                                ? 'bg-indigo-50 text-indigo-800' 
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <span>{item}</span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-2.5 text-center text-xs text-slate-400 font-medium">
                        No existing marks matching "{mark}"
                      </div>
                    )}

                    {mark.trim() && !availableMarks.some(m => m.toUpperCase() === mark.trim().toUpperCase()) && (
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setIsMarkDropdownOpen(false);
                        }}
                        className="mt-1 pt-1 border-t border-slate-100 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-xl cursor-pointer text-xs font-bold flex items-center gap-1.5 transition-colors uppercase font-mono"
                      >
                        <Plus className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate">Add new mark & save: "{mark.trim().toUpperCase()}"</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Weight Restriction Note */}
              <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-lg flex gap-2 text-[10px] text-amber-800 leading-normal">
                <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  **Weight Restriction**: Sub-user is responsible for updating weight specifications. Entering physical weights is disabled under the Owner role scope.
                </span>
              </div>
            </div>

            {/* Fixed / Prominent Action Footer - Always visible above mobile nav */}
            <div className="p-3.5 sm:p-5 bg-white border-t border-slate-100 shrink-0 shadow-xs">
              <button
                type="submit"
                className="w-full py-3 sm:py-3.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl active:scale-[0.98] transition-all text-sm shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>Compile & Review Transaction</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

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
          <div className="w-full max-w-md md:max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-premium border border-slate-100 p-4 sm:p-6 lg:p-7 space-y-4 animate-slide-up max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain">
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
          allowPrint={true}
        />
      )}

      {/* Edit Pending Transaction Modal */}
      {editingTx && (
        <EditTransactionModal
          isOpen={!!editingTx}
          transaction={editingTx}
          onClose={() => setEditingTx(null)}
          onSave={handleEditSave}
          availableMarks={tenant?.marks || currentTenant?.marks || ['Agro', 'BRT', 'RS', 'TS', 'DV', 'BVB']}
          availableAgents={availableAgents}
        />
      )}

      {/* Delete Pending Transaction Confirmation Modal */}
      {deletingTx && (
        <DeleteConfirmModal
          isOpen={!!deletingTx}
          transaction={deletingTx}
          onClose={() => setDeletingTx(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {/* Branch Settings & Master Data Modal */}
      {isMasterDataOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="w-full max-w-lg md:max-w-xl lg:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-premium border-t sm:border border-slate-100 flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden animate-slide-up">
            {/* Mobile Sheet Drag Handle */}
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 sm:hidden shrink-0" />
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 px-4 py-3 sm:px-6 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                    <Database className="h-4.5 w-4.5" />
                  </div>
                  <span>Branch Settings & Master Data</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Manage sub-users, marks, agents, and parameters for branch <code className="bg-slate-100 font-mono font-bold px-1.5 py-0.5 rounded text-indigo-700">{tenant.subUrl}</code>
                </p>
              </div>
              <button 
                onClick={() => setIsMasterDataOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-slate-100 gap-1.5 overflow-x-auto px-4 py-2 sm:px-6 text-xs scrollbar-none shrink-0 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setModalTab('subusers')}
                className={`flex items-center gap-1.5 px-3 py-2 font-bold rounded-xl transition-all shrink-0 cursor-pointer ${
                  masterTab === 'subusers'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Sub-Users ({branchSubUsers.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('marks')}
                className={`flex items-center gap-1.5 px-3 py-2 font-bold rounded-xl transition-all shrink-0 cursor-pointer ${
                  masterTab === 'marks'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Allowed Marks ({branchMarks.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('agents')}
                className={`flex items-center gap-1.5 px-3 py-2 font-bold rounded-xl transition-all shrink-0 cursor-pointer ${
                  masterTab === 'agents'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Agents ({branchAgents.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('pricing')}
                className={`flex items-center gap-1.5 px-3 py-2 font-bold rounded-xl transition-all shrink-0 cursor-pointer ${
                  masterTab === 'pricing'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Change Master Data</span>
              </button>
            </div>

            {/* Scrollable Tab Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4 touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
              {/* Error & Success Alerts */}
            {masterError && (
              <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{masterError}</span>
              </div>
            )}
            {saveSuccessMsg && (
              <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* TAB 1: AUTHORIZED SUB-USERS */}
            {masterTab === 'subusers' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Authorized Sub-Users ({branchSubUsers.length})
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Sub-users can log in to this branch portal and record physical weights
                    </p>
                  </div>
                </div>

                {/* Sub-users list */}
                {branchSubUsers.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                      <div className="col-span-6 sm:col-span-7">Sub-User Name</div>
                      <div className="col-span-5 sm:col-span-4">Password / Passcode</div>
                      <div className="col-span-1 text-center"></div>
                    </div>
                    {branchSubUsers.map((su, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-6 sm:col-span-7">
                          <input
                            type="text"
                            placeholder="e.g. Ramesh"
                            value={su.name}
                            onChange={(e) => handleUpdateBranchSubUser(idx, 'name', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white text-xs font-semibold text-slate-800 transition-all shadow-2xs"
                          />
                        </div>
                        <div className="col-span-5 sm:col-span-4">
                          <input
                            type="text"
                            placeholder="Passcode"
                            value={su.password}
                            onChange={(e) => handleUpdateBranchSubUser(idx, 'password', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white text-xs font-mono font-bold text-slate-800 transition-all shadow-2xs"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveBranchSubUser(idx)}
                            title="Remove sub-user"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Sub-User Input Row */}
                <div className="pt-2 border-t border-slate-200/80">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="New sub-user name (e.g. Rajesh)"
                        value={newBranchSubUserName}
                        onChange={(e) => {
                          setNewBranchSubUserName(e.target.value);
                          if (branchSubUserError) setBranchSubUserError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddBranchSubUser();
                          }
                        }}
                        className={`w-full px-3 py-2 bg-white border rounded-xl focus:border-indigo-600 text-xs font-semibold text-slate-800 transition-all shadow-2xs ${
                          branchSubUserError && !newBranchSubUserName.trim() ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                        }`}
                      />
                    </div>
                    <div className="w-full sm:w-44">
                      <input
                        type="text"
                        placeholder="Password (e.g. 1234)"
                        value={newBranchSubUserPassword}
                        onChange={(e) => {
                          setNewBranchSubUserPassword(e.target.value);
                          if (branchSubUserError) setBranchSubUserError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddBranchSubUser();
                          }
                        }}
                        className={`w-full px-3 py-2 bg-white border rounded-xl focus:border-indigo-600 text-xs font-mono font-bold text-slate-800 transition-all shadow-2xs ${
                          branchSubUserError && !newBranchSubUserPassword.trim() ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                        }`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddBranchSubUser}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/20 transition-all shrink-0 active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Add Sub-User
                    </button>
                  </div>

                  {branchSubUserError ? (
                    <div className="flex items-center gap-1.5 p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold mt-2 animate-fadeIn">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{branchSubUserError}</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      Both sub-user name and passcode are required when adding a new sub-user.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: ALLOWED MARKS */}
            {masterTab === 'marks' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Allowed Marks / Brands ({branchMarks.length})
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      These brand marks will appear in transaction dropdowns for this branch
                    </p>
                  </div>
                </div>

                {/* Add Mark Input Row */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter mark name (e.g. BRT, RS, TS)"
                    value={newBranchMark}
                    onChange={(e) => {
                      setNewBranchMark(e.target.value);
                      if (branchMarkError) setBranchMarkError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddBranchMark();
                      }
                    }}
                    className={`flex-1 px-3 py-2 bg-white border rounded-xl focus:border-indigo-600 text-xs font-bold font-mono uppercase text-slate-800 transition-all shadow-2xs ${
                      branchMarkError ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleAddBranchMark}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 transition-all shrink-0 active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add Mark
                  </button>
                </div>

                {branchMarkError && (
                  <div className="flex items-center gap-1.5 p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold animate-fadeIn">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{branchMarkError}</span>
                  </div>
                )}

                {/* Added Marks Display List */}
                <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[46px] items-center">
                  {branchMarks.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">No marks added yet. Enter a mark name above and click Add Mark.</span>
                  ) : (
                    branchMarks.map((m, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-indigo-150 text-indigo-800 font-bold font-mono text-xs rounded-lg shadow-2xs group"
                      >
                        <span>{m}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveBranchMark(idx)}
                          className="text-indigo-400 hover:text-rose-600 hover:bg-rose-50 p-0.5 rounded transition-colors cursor-pointer"
                          title={`Remove ${m}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: COMMISSION AGENTS */}
            {masterTab === 'agents' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Allowed Commission Agents ({branchAgents.length})
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Commission agents available for transaction entries for this branch
                    </p>
                  </div>
                </div>

                {/* Add Agent Input Row */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter commission agent name (e.g. Patel Agro)"
                    value={newBranchAgent}
                    onChange={(e) => {
                      setNewBranchAgent(e.target.value);
                      if (branchAgentError) setBranchAgentError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddBranchAgent();
                      }
                    }}
                    className={`flex-1 px-3 py-2 bg-white border rounded-xl focus:border-indigo-600 text-xs font-medium text-slate-800 transition-all shadow-2xs ${
                      branchAgentError ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleAddBranchAgent}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 transition-all shrink-0 active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add Agent
                  </button>
                </div>

                {branchAgentError && (
                  <div className="flex items-center gap-1.5 p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold animate-fadeIn">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{branchAgentError}</span>
                  </div>
                )}

                {/* Added Agents Display List - Individual Rows */}
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto p-1 pr-1.5 bg-slate-50/50 rounded-xl border border-slate-100">
                  {branchAgents.length === 0 ? (
                    <div className="p-4 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-400 italic">
                      No agent names added yet. Enter an agent name above and click Add Agent.
                    </div>
                  ) : (
                    branchAgents.map((a, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3.5 py-2.5 bg-white border border-slate-200 hover:border-emerald-300 rounded-xl shadow-2xs group transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                            #{idx + 1}
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                            {a}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveBranchAgent(idx)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                          title={`Remove ${a}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: CHANGE MASTER DATA (PRICING & TARAM) */}
            {masterTab === 'pricing' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Master Calculation Rates
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Default parameters for calculating net values and weights for this branch
                  </p>
                </div>

                {/* Bag Cost Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Bag Cost (₹ per Bag)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    required
                    placeholder="e.g. 25.00"
                    value={masterBagCost}
                    onChange={(e) => setMasterBagCost(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Cost deducted per bag during gross weight calculation.</p>
                </div>

                {/* Taram (Tare Weight per Bag) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Taram (Tare weight per bag - kg)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min="0.001"
                    required
                    placeholder="e.g. 1.100"
                    value={masterTaram}
                    onChange={(e) => setMasterTaram(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Standard bag deduction in kilograms (e.g. 1.100 kg per bag).</p>
                </div>
              </div>
            )}
            </div>

            {/* Modal Footer with Live Sync and Action Buttons - Pinned at bottom */}
            <div className="p-4 sm:p-6 pt-3 pb-safe border-t border-slate-100 space-y-2.5 bg-white shrink-0 shadow-xs">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Supabase Live Sync Connected</span>
                </div>
                <span className="text-slate-400">All edits sync directly to database</span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsMasterDataOpen(false)}
                  disabled={isSavingMaster}
                  className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveBranchSettings()}
                  disabled={isSavingMaster}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSavingMaster ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Syncing to Database...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save & Sync to Database</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Supabase Connect Modal */}
      <SupabaseConnectModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        onConnected={onRefresh}
      />

    </div>
  );
};
