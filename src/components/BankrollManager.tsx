import React, { useState, useMemo, useEffect } from 'react';
import { Bankroll, Bookmaker, BankrollTransfer, Bet, BankrollTransaction } from '../types';
import { formatCurrency, formatOdds, getBookmakerBalanceForBankroll, getCurrencySymbol } from '../utils/storage';
import { formatEventDate } from '../utils/dateUtils';
import { bookmakersApi, bankrollsApi } from '../utils/api';
import {
  Wallet,
  ArrowLeftRight,
  Plus,
  Building2,
  CheckCircle2,
  ShieldAlert,
  History,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeft,
  ChevronRight,
  TrendingUp,
  Percent,
  Award,
  DollarSign,
  PieChart,
  BarChart2,
  Clock,
  Filter,
  XCircle,
  Star,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Check,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface BankrollManagerProps {
  bankrolls: Bankroll[];
  bookmakers: Bookmaker[];
  bets: Bet[];
  transfers: BankrollTransfer[];
  activeBankrollId?: string;
  userCurrency?: string;
  onAddBankroll: (bankroll: { name: string; currency: string; color: string; description: string; allocations: Array<{ bookmakerId: string; cashAmount: number; freeBetAmount: number }> }) => string | void;
  onUpdateBankrollBalance: (bankrollId: string, newBalance: number) => void;
  onAddTransfer: (transfer: Omit<BankrollTransfer, 'id'>) => void;
  onSetActiveBankroll?: (bankrollId: string) => void;
  onDeleteBankroll?: (bankrollId: string, strategy: 'reassign' | 'unassign' | 'delete_all', targetBankrollId?: string) => void;
  onReconcileBookmaker?: (bookmakerId: string, newRealCash: number, newFreeBet: number, notes: string, targetBankrollId?: string) => void;
  onBatchUpdateBookmakers?: (updates: Array<{ id: string; bankrollId?: string; realBalance?: number; freeBetBalance?: number }>) => void;
  onReorderBankrolls?: (reorderedIds: string[]) => void;
  onRefreshData?: () => Promise<void>;
}

export const BankrollManager: React.FC<BankrollManagerProps> = ({
  bankrolls,
  bookmakers,
  bets,
  transfers,
  activeBankrollId,
  userCurrency = 'USD',
  onAddBankroll,
  onUpdateBankrollBalance,
  onAddTransfer,
  onSetActiveBankroll,
  onDeleteBankroll,
  onReconcileBookmaker,
  onBatchUpdateBookmakers,
  onReorderBankrolls,
  onRefreshData
}) => {
  const handleMoveBankroll = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= bankrolls.length) return;

    const updated = [...bankrolls];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);

    const reorderedIds = updated.map((b) => b.id);
    if (onReorderBankrolls) {
      onReorderBankrolls(reorderedIds);
    }
  };
  // Navigation State for Deep-Dive View
  const [selectedBankrollId, setSelectedBankrollId] = useState<string | null>(null);

  // Balance Sheet / Transactions State
  const [subTab, setSubTab] = useState<'wagers' | 'balancesheet'>('wagers');
  const [transactions, setTransactions] = useState<BankrollTransaction[]>([]);
  const [txLoading, setTxLoading] = useState<boolean>(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txRefreshTrigger, setTxRefreshTrigger] = useState<number>(0);

  // Modal States
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [showAddBankrollModal, setShowAddBankrollModal] = useState<boolean>(false);
  const [showDepositWithdrawModal, setShowDepositWithdrawModal] = useState<boolean>(false);

  // Deposit / Withdraw Form State
  const [dwBankrollId, setDwBankrollId] = useState<string>('');
  const [dwBookmakerId, setDwBookmakerId] = useState<string>('');
  const [dwType, setDwType] = useState<'deposit' | 'withdraw'>('deposit');
  const [dwAmount, setDwAmount] = useState<string>('100');
  const [dwLoading, setDwLoading] = useState<boolean>(false);
  const [dwError, setDwError] = useState<string | null>(null);

  // Deletion Management Modal State
  const [bankrollToDelete, setBankrollToDelete] = useState<Bankroll | null>(null);
  const [deleteStrategy, setDeleteStrategy] = useState<'reassign' | 'unassign' | 'delete_all'>('reassign');
  const [targetReassignBankrollId, setTargetReassignBankrollId] = useState<string>('');

  // Reconciliation Modal State for Bankroll's Bookmakers
  const [reconcileBankrollTarget, setReconcileBankrollTarget] = useState<Bankroll | null>(null);
  const [reconcileSelectedBookmakerId, setReconcileSelectedBookmakerId] = useState<string>('');
  const [reconcileBmCash, setReconcileBmCash] = useState<string>('0');
  const [reconcileBmFreeBet, setReconcileBmFreeBet] = useState<string>('0');
  const [reconcileNotes, setReconcileNotes] = useState<string>('');

  // Transfer Form State
  const [fromBankroll, setFromBankroll] = useState<string>(bankrolls[0]?.id || '');
  const [toBankroll, setToBankroll] = useState<string>(bankrolls[1]?.id || '');
  const [fromBookmakerId, setFromBookmakerId] = useState<string>('');
  const [toBookmakerId, setToBookmakerId] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<number>(100);
  const [isFreeBetTransfer, setIsFreeBetTransfer] = useState<boolean>(false);
  const [rolloverRequired, setRolloverRequired] = useState<number>(300);
  const [transferNotes, setTransferNotes] = useState<string>('Bonus credit reallocation');

  useEffect(() => {
    if (fromBankroll) {
      const bms = bookmakers.filter(bm => bm.balances?.some(bal => bal.bankrollId === fromBankroll) || bm.bankrollId === fromBankroll);
      if (bms.length > 0 && !bms.find(b => b.id === fromBookmakerId)) {
        setFromBookmakerId(bms[0].id);
      }
    }
  }, [fromBankroll, bookmakers]);

  useEffect(() => {
    if (toBankroll) {
      const bms = bookmakers; // Destination can be any bookmaker (or maybe just all bookmakers available for user)
      if (bms.length > 0 && !bms.find(b => b.id === toBookmakerId)) {
        setToBookmakerId(bms[0].id);
      }
    }
  }, [toBankroll, bookmakers]);

  // Add Bankroll Form State & Allocations
  const [newBankrollName, setNewBankrollName] = useState<string>('');
  const [newBankrollCurrency, setNewBankrollCurrency] = useState<string>('EUR');
  const [newBankrollAllocations, setNewBankrollAllocations] = useState<Array<{ bookmakerId: string; cashAmount: string; freeBetAmount: string }>>([{ bookmakerId: '', cashAmount: '', freeBetAmount: '' }]);
  const [newBankrollDesc, setNewBankrollDesc] = useState<string>('');

  // Search & Filter for Deep-Dive Bet History Table
  const [betSearchQuery, setBetSearchQuery] = useState<string>('');
  const [betStatusFilter, setBetStatusFilter] = useState<string>('all');

  // Find active bankroll object
  const activeBankroll = useMemo(() => {
    return bankrolls.find((b) => b.id === selectedBankrollId) || null;
  }, [bankrolls, selectedBankrollId]);

  const targetBankroll = useMemo(() => {
    if (activeBankroll) return activeBankroll;
    if (dwBankrollId) {
      const found = bankrolls.find((b) => b.id === dwBankrollId);
      if (found) return found;
    }
    return bankrolls[0] || null;
  }, [activeBankroll, bankrolls, dwBankrollId]);

  const handleDepositWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBr = targetBankroll;
    const targetBmId = dwBookmakerId || (bookmakers.length > 0 ? bookmakers[0].id : '');
    const amount = parseFloat(dwAmount);
    if (!targetBr || !targetBmId || amount <= 0) {
      setDwError('Please select a valid sportsbook and enter an amount greater than 0.');
      return;
    }
    setDwLoading(true);
    setDwError(null);
    try {
      await bookmakersApi.transaction(targetBmId, {
        bankrollId: targetBr.id,
        type: dwType,
        amount: amount
      });
      setShowDepositWithdrawModal(false);
      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err: any) {
      setDwError(err.message || 'Transaction failed');
    } finally {
      setDwLoading(false);
    }
  };

  // Fetch transactions list dynamically
  useEffect(() => {
    if (selectedBankrollId) {
      setTxLoading(true);
      setTxError(null);
      bankrollsApi.transactions(selectedBankrollId)
        .then((data) => {
          setTransactions(data || []);
          setTxLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setTxError(err.message || 'Error loading transaction history');
          setTxLoading(false);
        });
    } else {
      setTransactions([]);
    }
  }, [selectedBankrollId, txRefreshTrigger, bankrolls]);

  const transactionsWithRunningBalance = useMemo(() => {
    let running = 0;
    return transactions.map((t) => {
      running += t.amount;
      return {
        ...t,
        runningBalance: running,
      };
    });
  }, [transactions]);

  useEffect(() => {
    if (showDepositWithdrawModal && bookmakers.length > 0 && !dwBookmakerId) {
      setDwBookmakerId(bookmakers[0].id);
    }
  }, [showDepositWithdrawModal, bookmakers, dwBookmakerId]);

  // Compute Bankroll Scoped Analytics
  

  const scopedBets = useMemo(() => {
    if (!activeBankroll) return [];
    return bets.filter((b) => b.bankrollId === activeBankroll.id);
  }, [activeBankroll, bets]);

  const coreAnalytics = useMemo(() => {
    if (!activeBankroll) return null;
    let totalVolumeStaked = 0;
    let activeExposure = 0;
    let totalReturns = 0;
    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;

    scopedBets.forEach((b) => {
      totalVolumeStaked += b.stake;
      if (b.status === 'pending') {
        pendingCount++;
        activeExposure += b.stake;
      } else if (b.status === 'won') {
        wonCount++;
        totalReturns += b.actualReturn ?? b.potentialPayout;
      } else if (b.status === 'lost') {
        lostCount++;
      } else if (b.status === 'cashout') {
        totalReturns += b.actualReturn ?? 0;
      } else if (b.status === 'void') {
        totalReturns += b.stake;
      }
    });

    const settledCount = wonCount + lostCount;
    const settledStaked = scopedBets
      .filter((b) => b.status !== 'pending')
      .reduce((acc, b) => acc + b.stake, 0);

    const netPnL = totalReturns - settledStaked;
    const roi = totalVolumeStaked > 0 ? (netPnL / totalVolumeStaked) * 100 : 0;
    const winRate = settledCount > 0 ? (wonCount / settledCount) * 100 : 0;
    
    const bookmakerCashSum = bookmakers.reduce(
      (sum, bm) => sum + getBookmakerBalanceForBankroll(bm, activeBankroll.id).cashBalance,
      0
    );
    const bookmakerFreeBetSum = bookmakers.reduce(
      (sum, bm) => sum + getBookmakerBalanceForBankroll(bm, activeBankroll.id).freeBetBalance,
      0
    );
    const totalPortfolioValue = activeBankroll.currentBalance + activeBankroll.freeBetCredits;

    return {
      totalPortfolioValue,
      bookmakerCashSum,
      bookmakerFreeBetSum,
      totalVolumeStaked,
      activeExposure,
      netPnL,
      roi,
      winRate,
      settledCount,
      pendingCount
    };
  }, [scopedBets, activeBankroll, bookmakers]);

  const growthChartData = useMemo(() => {
    const sortedBets = [...scopedBets].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let cumulativeProfit = 0;
    const data = [{ date: 'Start', profit: 0 }];

    sortedBets.forEach((bet) => {
      if (bet.status === 'won') {
        cumulativeProfit += (bet.actualReturn ?? bet.potentialPayout) - bet.stake;
      } else if (bet.status === 'lost') {
        cumulativeProfit -= bet.stake;
      } else if (bet.status === 'cashout') {
        cumulativeProfit += (bet.actualReturn ?? 0) - bet.stake;
      }
      if (bet.status !== 'pending') {
        data.push({
          date: new Date(bet.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          profit: Number(cumulativeProfit.toFixed(2))
        });
      }
    });
    return data;
  }, [scopedBets]);

  const bookmakerBreakdown = useMemo(() => {
    if (!activeBankroll) return [];
    const map: Record<string, any> = {};

    bookmakers.forEach((bm) => {
      const bal = getBookmakerBalanceForBankroll(bm, activeBankroll.id);
      if (bal.cashBalance > 0 || bal.freeBetBalance > 0 || bm.bankrollId === activeBankroll.id || scopedBets.some((b) => b.bookmakerId === bm.id)) {
        map[bm.id] = {
          id: bm.id,
          name: bm.name,
          cashBalance: bal.cashBalance,
          freeBetBalance: bal.freeBetBalance,
          betsCount: 0,
          staked: 0,
          netPnL: 0
        };
      }
    });

    scopedBets.forEach((bet) => {
      if (!map[bet.bookmakerId]) {
        const bm = bookmakers.find((b) => b.id === bet.bookmakerId);
        const bal = bm ? getBookmakerBalanceForBankroll(bm, activeBankroll.id) : { cashBalance: 0, freeBetBalance: 0 };
        map[bet.bookmakerId] = {
          id: bet.bookmakerId,
          name: bm ? bm.name : 'Unknown Sportsbook',
          cashBalance: bal.cashBalance,
          freeBetBalance: bal.freeBetBalance,
          betsCount: 0,
          staked: 0,
          netPnL: 0
        };
      }

      const item = map[bet.bookmakerId];
      item.betsCount += 1;
      item.staked += bet.stake;

      if (bet.status === 'won') {
        item.netPnL += (bet.actualReturn ?? bet.potentialPayout) - bet.stake;
      } else if (bet.status === 'lost') {
        item.netPnL -= bet.stake;
      } else if (bet.status === 'cashout') {
        item.netPnL += (bet.actualReturn ?? 0) - bet.stake;
      }
    });

    return Object.values(map);
  }, [scopedBets, activeBankroll, bookmakers]);

  const bankrollAnalytics = useMemo(() => {
    if (!coreAnalytics) return null;
    return {
      scopedBets,
      ...coreAnalytics,
      growthChartData,
      bookmakerBreakdown
    };
  }, [scopedBets, coreAnalytics, growthChartData, bookmakerBreakdown]);

  // Filtered bets for Deep-Dive Bet History
  const filteredBankrollBets = useMemo(() => {
    if (!bankrollAnalytics) return [];
    return bankrollAnalytics.scopedBets.filter((bet) => {
      if (betStatusFilter !== 'all' && bet.status !== betStatusFilter) return false;
      if (betSearchQuery.trim()) {
        const query = betSearchQuery.toLowerCase();
        const matchesSelection = bet.legs.some(
          (l) => l.selection.toLowerCase().includes(query) || l.event.toLowerCase().includes(query)
        );
        const bm = bookmakers.find((b) => b.id === bet.bookmakerId)?.name.toLowerCase() || '';
        return matchesSelection || bm.includes(query) || bet.type.toLowerCase().includes(query);
      }
      return true;
    });
  }, [bankrollAnalytics, betStatusFilter, betSearchQuery, bookmakers]);

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (transferAmount <= 0 || fromBankroll === toBankroll || !fromBookmakerId || !toBookmakerId) return;

    onAddTransfer({
      date: new Date().toISOString(),
      fromBankrollId: fromBankroll,
      toBankrollId: toBankroll,
      fromBookmakerId,
      toBookmakerId,
      amount: transferAmount,
      isFreeBetCredit: isFreeBetTransfer,
      rolloverRequired: isFreeBetTransfer ? rolloverRequired : undefined,
      rolloverCompleted: 0,
      notes: transferNotes
    });

    setShowTransferModal(false);
  };

  const handleCreateBankroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankrollName) return;

    onAddBankroll({
      name: newBankrollName,
      currency: newBankrollCurrency,
      allocations: newBankrollAllocations.map(a => ({
        bookmakerId: a.bookmakerId,
        cashAmount: parseFloat(a.cashAmount) || 0,
        freeBetAmount: parseFloat(a.freeBetAmount) || 0
      })),
      color: '#2563eb',
      description: newBankrollDesc
    });

    setNewBankrollName('');
    setNewBankrollAllocations([{ bookmakerId: '', cashAmount: '', freeBetAmount: '' }]);
    setShowAddBankrollModal(false);
  };

  // If a bankroll deep-dive is active, render the Bankroll Detailed Dashboard
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-12 animate-fade-in">
      {activeBankroll && bankrollAnalytics ? (
        <>
          {/* Breadcrumb Navigation & Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#171f33] p-4 rounded-xl border border-[#27314a]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedBankrollId(null)}
              className="p-2 bg-[#0b1326] hover:bg-[#2563eb] text-[#8d90a0] hover:text-white rounded-lg border border-[#27314a] transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
            >
              <ArrowLeft size={16} /> Back to Overview
            </button>
            <div className="h-6 w-px bg-[#27314a]"></div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8d90a0]">Bankrolls</span>
                <ChevronRight size={12} className="text-[#8d90a0]" />
                <span className="text-xs font-bold text-[#b4c5ff]">{activeBankroll.name}</span>
              </div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Wallet className="text-[#2563eb]" size={20} />
                <span>{activeBankroll.name} Detailed Dashboard</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDwBookmakerId(bookmakers[0]?.id || '');
                setDwType('deposit');
                setDwAmount('100');
                setDwError(null);
                setShowDepositWithdrawModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <ArrowUpRight size={14} /> Deposit / Withdraw
            </button>
            <button
              onClick={() => {
                setFromBankroll(activeBankroll.id);
                setShowTransferModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <ArrowLeftRight size={14} /> Transfer Out / In
            </button>
          </div>
        </div>

        {/* Scoped KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Total Portfolio</span>
            <div className="text-lg font-extrabold text-white font-mono">
              {formatCurrency(bankrollAnalytics.totalPortfolioValue, userCurrency)}
            </div>
            <span className="text-[10px] text-[#4edea3] font-mono block">
              {formatCurrency(activeBankroll.currentBalance, userCurrency)} Cash + {formatCurrency(activeBankroll.freeBetCredits, userCurrency)} Promo
            </span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Net PnL</span>
            <div className={`text-lg font-extrabold font-mono ${bankrollAnalytics.netPnL >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
              {bankrollAnalytics.netPnL >= 0 ? '+' : ''}{formatCurrency(bankrollAnalytics.netPnL, userCurrency)}
            </div>
            <span className="text-[10px] text-[#8d90a0] block">Lifetime segment return</span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">ROI / Yield</span>
            <div className={`text-lg font-extrabold font-mono ${bankrollAnalytics.roi >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
              {bankrollAnalytics.roi >= 0 ? '+' : ''}{bankrollAnalytics.roi.toFixed(1)}%
            </div>
            <span className="text-[10px] text-[#8d90a0] block">Yield on staked capital</span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Win Rate</span>
            <div className="text-lg font-extrabold text-[#b4c5ff] font-mono">
              {bankrollAnalytics.winRate.toFixed(1)}%
            </div>
            <span className="text-[10px] text-[#8d90a0] block">{bankrollAnalytics.settledCount} settled wagers</span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Volume Staked</span>
            <div className="text-lg font-extrabold text-white font-mono">
              {formatCurrency(bankrollAnalytics.totalVolumeStaked, userCurrency)}
            </div>
            <span className="text-[10px] text-[#8d90a0] block">Total turnover</span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Active Exposure</span>
            <div className="text-lg font-extrabold text-amber-400 font-mono">
              {formatCurrency(bankrollAnalytics.activeExposure, userCurrency)}
            </div>
            <span className="text-[10px] text-amber-400 block">{bankrollAnalytics.pendingCount} pending bets</span>
          </div>
        </div>

        {/* Dedicated Bankroll Profit Curve Chart */}
        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp size={16} className="text-[#2563eb]" />
              <span>Cumulative Profit Curve ({activeBankroll.name})</span>
            </h3>
            <span className="text-xs text-[#8d90a0] font-mono">
              Initial: {formatCurrency(activeBankroll.initialBalance, userCurrency)}
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bankrollAnalytics.growthChartData}>
                <defs>
                  <linearGradient id="bankrollColorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={bankrollAnalytics.netPnL >= 0 ? '#4edea3' : '#ffb3ad'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={bankrollAnalytics.netPnL >= 0 ? '#4edea3' : '#ffb3ad'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27314a" />
                <XAxis dataKey="date" stroke="#8d90a0" fontSize={11} tickLine={false} />
                <YAxis stroke="#8d90a0" fontSize={11} tickLine={false} tickFormatter={(val) => `${getCurrencySymbol(userCurrency)}${val}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b1326', borderColor: '#27314a', borderRadius: '8px', color: '#fff' }}
                  formatter={(value: any) => [`${getCurrencySymbol(userCurrency)}${value}`, 'Cumulative Profit']}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke={bankrollAnalytics.netPnL >= 0 ? '#4edea3' : '#ffb3ad'}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#bankrollColorGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sub-Tabs Selector */}
        <div className="flex border-b border-[#27314a]">
          <button
            onClick={() => setSubTab('wagers')}
            className={`py-3 px-6 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
              subTab === 'wagers'
                ? 'border-[#2563eb] text-white'
                : 'border-transparent text-[#8d90a0] hover:text-white'
            }`}
          >
            Sportsbooks & Wagers
          </button>
          <button
            onClick={() => setSubTab('balancesheet')}
            className={`py-3 px-6 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
              subTab === 'balancesheet'
                ? 'border-[#2563eb] text-white'
                : 'border-transparent text-[#8d90a0] hover:text-white'
            }`}
          >
            Financial Balance Sheet
          </button>
        </div>

        {subTab === 'wagers' && (
          <>
            {/* Sportsbook Breakdown Table for this Bankroll */}
            <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Building2 size={16} className="text-[#2563eb]" />
                <span>Sportsbook Allocation & PnL Breakdown</span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#0b1326] border-b border-[#27314a] text-[#8d90a0] font-semibold uppercase text-[10px]">
                      <th className="p-3">Sportsbook</th>
                      <th className="p-3 text-right font-mono">Cash Balance</th>
                      <th className="p-3 text-right font-mono">Free Bet Balance</th>
                      <th className="p-3 text-center">Wagers</th>
                      <th className="p-3 text-right font-mono">Volume Staked</th>
                      <th className="p-3 text-right font-mono">PnL Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27314a]">
                    {bankrollAnalytics.bookmakerBreakdown.map((bm: any) => (
                      <tr key={bm.id} className="hover:bg-[#131b2e] transition-colors">
                        <td className="p-3 font-bold text-white flex items-center gap-2">
                          <Building2 size={14} className="text-[#2563eb]" />
                          <span>{bm.name}</span>
                        </td>
                        <td className="p-3 text-right font-mono text-white">
                          {formatCurrency(bm.cashBalance, userCurrency)}
                        </td>
                        <td className="p-3 text-right font-mono text-[#4edea3]">
                          {formatCurrency(bm.freeBetBalance, userCurrency)}
                        </td>
                        <td className="p-3 text-center text-white">{bm.betsCount}</td>
                        <td className="p-3 text-right font-mono text-white">{formatCurrency(bm.staked, userCurrency)}</td>
                        <td className={`p-3 text-right font-mono font-bold ${bm.netPnL >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
                          {bm.netPnL >= 0 ? '+' : ''}{formatCurrency(bm.netPnL, userCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Filtered Bet History Table for this Bankroll */}
            <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <History size={16} className="text-[#2563eb]" />
                  <span>Bankroll Bet History ({filteredBankrollBets.length})</span>
                </h3>

                {/* Filter Controls */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search wagers..."
                    value={betSearchQuery}
                    onChange={(e) => setBetSearchQuery(e.target.value)}
                    className="bg-[#0b1326] border border-[#27314a] rounded px-3 py-1.5 text-xs text-white"
                  />
                  <select
                    value={betStatusFilter}
                    onChange={(e) => setBetStatusFilter(e.target.value)}
                    className="bg-[#0b1326] border border-[#27314a] rounded px-3 py-1.5 text-xs text-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                    <option value="void">Void</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#0b1326] border-b border-[#27314a] text-[#8d90a0] font-semibold uppercase text-[10px]">
                      <th className="p-3">Date</th>
                      <th className="p-3">Sportsbook</th>
                      <th className="p-3">Selections</th>
                      <th className="p-3 text-center">Type</th>
                      <th className="p-3 text-right">Odds</th>
                      <th className="p-3 text-right">Stake</th>
                      <th className="p-3 text-right">Return</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27314a]">
                    {filteredBankrollBets.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-[#8d90a0]">
                          No wagers found matching this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredBankrollBets.map((bet) => {
                        const bm = bookmakers.find((b) => b.id === bet.bookmakerId)?.name || 'Sportsbook';
                        return (
                          <tr key={bet.id} className="hover:bg-[#131b2e] transition-colors">
                            <td className="p-3 text-[#8d90a0] whitespace-nowrap">
                              {new Date(bet.date).toLocaleDateString()}
                            </td>
                            <td className="p-3 font-bold text-white whitespace-nowrap">{bm}</td>
                            <td className="p-3 max-w-xs truncate">
                              {bet.legs.map((l, i) => (
                                <div key={i} className="text-white font-medium truncate">
                                  {l.selection} <span className="text-[10px] text-[#8d90a0]">({l.event}{formatEventDate(l.eventDate) ? ` — ${formatEventDate(l.eventDate)}` : ''})</span>
                                </div>
                              ))}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-1.5 py-0.5 rounded bg-[#0b1326] text-[#b4c5ff] font-mono text-[10px] uppercase border border-[#27314a]">
                                {bet.type}
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-[#b4c5ff]">
                              @{formatOdds(bet.totalOdds)}
                            </td>
                            <td className="p-3 text-right font-mono text-white">
                              {formatCurrency(bet.stake, userCurrency)}
                              {bet.isFreeBet && <span className="block text-[9px] text-[#4edea3]">Free Bet</span>}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-white">
                              {formatCurrency(bet.actualReturn ?? (bet.status === 'won' ? bet.potentialPayout : 0), userCurrency)}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  bet.status === 'won'
                                    ? 'bg-[#005236] text-[#4edea3]'
                                    : bet.status === 'lost'
                                    ? 'bg-[#601410] text-[#ffb3ad]'
                                    : bet.status === 'void'
                                    ? 'bg-gray-800 text-gray-300'
                                    : 'bg-amber-950 text-amber-400'
                                }`}
                              >
                                {bet.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {subTab === 'balancesheet' && (
          <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4 font-sans">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <History size={16} className="text-[#2563eb]" />
                <span>Bankroll Cash Balance Sheet</span>
              </h3>
              <span className="text-xs text-[#8d90a0] font-mono bg-[#0b1326] px-3 py-1 rounded border border-[#27314a]">
                Running Cash Total: {formatCurrency(
                  transactionsWithRunningBalance[transactionsWithRunningBalance.length - 1]?.runningBalance || 0,
                  userCurrency
                )}
              </span>
            </div>

            {txLoading ? (
              <div className="p-12 text-center text-xs text-[#8d90a0]">
                Loading transaction history...
              </div>
            ) : txError ? (
              <div className="p-12 text-center text-xs text-red-400">
                {txError}
              </div>
            ) : transactionsWithRunningBalance.length === 0 ? (
              <div className="p-12 text-center text-xs text-[#8d90a0]">
                No financial transactions logged yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#0b1326] border-b border-[#27314a] text-[#8d90a0] font-semibold uppercase text-[10px]">
                      <th className="p-3">Date</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Sportsbook</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27314a]">
                    {transactionsWithRunningBalance.map((t) => {
                      const bmName = bookmakers.find((bm) => bm.id === t.bookmakerId)?.name || '—';
                      return (
                        <tr key={t.id} className="hover:bg-[#131b2e] transition-colors">
                          <td className="p-3 text-[#8d90a0] whitespace-nowrap font-mono">
                            {new Date(t.date).toLocaleDateString()}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                t.type === 'Initial Balance'
                                  ? 'bg-blue-950 text-blue-400 border border-blue-800'
                                  : t.type === 'Deposit'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : t.type === 'Withdrawal'
                                  ? 'bg-red-950 text-red-400 border border-red-800'
                                  : 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td className="p-3 text-white font-medium">{t.description}</td>
                          <td className="p-3 text-white font-bold">{bmName}</td>
                          <td
                            className={`p-3 text-right font-mono font-bold ${
                              t.amount > 0
                                ? 'text-[#4edea3]'
                                : t.amount < 0
                                ? 'text-[#ffb3ad]'
                                : 'text-white'
                            }`}
                          >
                            {t.amount > 0 ? '+' : ''}
                            {formatCurrency(t.amount, userCurrency)}
                          </td>
                          <td className="p-3 text-right font-mono text-white font-semibold">
                            {formatCurrency(t.runningBalance, userCurrency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        </>
      ) : (
        <>
          {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#171f33] p-5 rounded-xl border border-[#27314a]">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Wallet className="text-[#2563eb]" />
            <span>Bankrolls & Capital Allocation</span>
          </h2>
          <p className="text-sm text-[#8d90a0] mt-1">
            Segment capital into distinct strategies, explore deep analytics, execute internal transfers, and track rollover requirements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const firstBr = bankrolls[0];
              setDwBankrollId(firstBr?.id || '');
              setDwBookmakerId(bookmakers[0]?.id || '');
              setDwType('deposit');
              setDwAmount((firstBr ? Math.max(1, Math.min(100, firstBr.currentBalance)) : 50).toString());
              setDwError(null);
              setShowDepositWithdrawModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer"
          >
            <ArrowUpRight size={16} /> Deposit / Withdraw
          </button>
          <button
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer"
          >
            <ArrowLeftRight size={16} /> Transfer Funds
          </button>
          <button
            onClick={() => setShowAddBankrollModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#171f33] hover:bg-[#222a3d] border border-[#27314a] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Plus size={16} /> New Bankroll
          </button>
        </div>
      </div>

      {/* Bankroll Grid Cards */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-white">Active Bankroll Segments ({bankrolls.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {bankrolls.map((b, idx) => {
            const scopedBets = bets.filter((bet) => bet.bankrollId === b.id);
            const netPnL = scopedBets.reduce((acc, bet) => {
              if (bet.status === 'won') return acc + ((bet.actualReturn ?? bet.potentialPayout) - bet.stake);
              if (bet.status === 'lost') return acc - bet.stake;
              if (bet.status === 'cashout') return acc + ((bet.actualReturn ?? 0) - bet.stake);
              return acc;
            }, 0);

            const isActivePrimary = b.id === activeBankrollId;
            const bTotalCash = b.currentBalance;
            const bTotalFree = b.freeBetCredits;

            return (
              <div
                key={b.id}
                className={`bg-[#171f33] p-5 rounded-xl border ${isActivePrimary ? 'border-amber-500/80 shadow-lg shadow-amber-950/20' : 'border-[#27314a]'} space-y-4 hover:border-[#2563eb]/60 transition-all flex flex-col justify-between relative`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-white text-base">{b.name}</span>
                      {isActivePrimary && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60 flex items-center gap-1">
                          <Star size={10} className="fill-amber-400" /> ACTIVE
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {onReorderBankrolls && bankrolls.length > 1 && (
                        <div className="flex items-center bg-[#0b1326] rounded border border-[#27314a] p-0.5 mr-1">
                          <button
                            disabled={idx === 0}
                            onClick={() => handleMoveBankroll(idx, 'up')}
                            title="Move Bankroll Earlier"
                            className="p-1 text-[#8d90a0] hover:text-white disabled:opacity-30 disabled:hover:text-[#8d90a0] cursor-pointer"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            disabled={idx === bankrolls.length - 1}
                            onClick={() => handleMoveBankroll(idx, 'down')}
                            title="Move Bankroll Later"
                            className="p-1 text-[#8d90a0] hover:text-white disabled:opacity-30 disabled:hover:text-[#8d90a0] cursor-pointer"
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                      )}
                      {onSetActiveBankroll && (
                        <button
                          onClick={() => onSetActiveBankroll(b.id)}
                          title={isActivePrimary ? 'Currently Primary Active Bankroll' : 'Set as Primary Active Bankroll'}
                          className={`p-1.5 rounded transition-all cursor-pointer ${isActivePrimary ? 'text-amber-400 bg-amber-950/60' : 'text-[#8d90a0] hover:text-amber-400 hover:bg-[#0b1326]'}`}
                        >
                          <Star size={15} className={isActivePrimary ? 'fill-amber-400' : ''} />
                        </button>
                      )}
                      {onDeleteBankroll && (
                        <button
                          onClick={() => {
                            setBankrollToDelete(b);
                            setDeleteStrategy('reassign');
                            const other = bankrolls.find((item) => item.id !== b.id);
                            setTargetReassignBankrollId(other?.id || '');
                          }}
                          title="Delete Bankroll"
                          className="p-1.5 text-[#8d90a0] hover:text-red-400 hover:bg-red-950/40 rounded transition-all cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-2xl font-extrabold text-white font-mono flex items-center justify-between">
                      <span>{formatCurrency(bTotalCash, userCurrency)}</span>
                      <span className="text-xs font-normal px-2 py-0.5 rounded bg-[#0b1326] text-[#b4c5ff] border border-[#27314a]">
                        {userCurrency}
                      </span>
                    </div>
                    <div className="text-xs text-[#8d90a0]">
                      Total: {formatCurrency(b.currentBalance, userCurrency)} • Initial: {formatCurrency(b.initialBalance, userCurrency)}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#27314a] grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-[#8d90a0] block">Free Bet Credits</span>
                      <span className="text-[#4edea3] font-mono font-bold">{formatCurrency(bTotalFree, userCurrency)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#8d90a0] block">Net PnL</span>
                      <span className={`font-mono font-bold ${netPnL >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
                        {netPnL >= 0 ? '+' : ''}{formatCurrency(netPnL, userCurrency)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => {
                        setDwBankrollId(b.id);
                        setDwBookmakerId(bookmakers[0]?.id || '');
                        setDwType('deposit');
                        setDwAmount(Math.max(1, Math.min(100, b.currentBalance)).toString());
                        setDwError(null);
                        setShowDepositWithdrawModal(true);
                      }}
                      className="flex-1 py-1.5 bg-[#10b981]/20 hover:bg-[#10b981]/30 text-[#10b981] border border-[#10b981]/40 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-[110px]"
                    >
                      <ArrowUpRight size={12} /> Deposit / Withdraw
                    </button>
                    <button
                      onClick={() => {
                        setReconcileBankrollTarget(b);
                        const bms = bookmakers.filter(bm => bm.balances?.some(bal => bal.bankrollId === b.id) || bm.bankrollId === b.id);
                        if (bms.length > 0) {
                          setReconcileSelectedBookmakerId(bms[0].id);
                          const bal = getBookmakerBalanceForBankroll(bms[0], b.id);
                          setReconcileBmCash(bal.cashBalance.toString());
                          setReconcileBmFreeBet(bal.freeBetBalance.toString());
                        } else {
                          setReconcileSelectedBookmakerId('');
                          setReconcileBmCash('0');
                          setReconcileBmFreeBet('0');
                        }
                        setReconcileNotes('');
                      }}
                      className="py-1.5 px-2 bg-[#0b1326] hover:bg-[#1a233a] text-[#8d90a0] hover:text-white border border-[#27314a] rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                      title="Reconcile a bookmaker's balance in this bankroll"
                    >
                      <RefreshCw size={12} className="text-[#2563eb]" /> Reconcile
                    </button>
                    <button
                      onClick={() => setSelectedBankrollId(b.id)}
                      className="py-1.5 px-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shadow"
                    >
                      <BarChart2 size={13} /> Analytics
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Integrated Bookmakers Overview */}
      <div className="space-y-3 pt-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Building2 size={18} className="text-[#b4c5ff]" />
          <span>Integrated Bookmakers & Credit Vault</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {bookmakers.map((bm) => (
            <div key={bm.id} className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-white">{bm.name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0b1326] text-amber-400">
                  {bm.averageMargin}% juice
                </span>
              </div>

              <div className="text-lg font-bold text-white font-mono">
                {formatCurrency(bm.realBalance, userCurrency)}
              </div>

              <div className="text-xs text-[#8d90a0] flex justify-between">
                <span>Free Credits:</span>
                <span className="text-[#4edea3] font-mono font-bold">{formatCurrency(bm.freeBetBalance, userCurrency)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Financial Transfer Audit Log */}
      <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <History size={18} className="text-[#2563eb]" />
          <span>Transfer History & Rollover Automation Audit Log</span>
        </h3>

        {transfers.length === 0 ? (
          <div className="text-center py-6 text-xs text-[#8d90a0]">No fund transfers recorded.</div>
        ) : (
          <div className="space-y-2">
            {transfers.map((tr) => {
              const from = bankrolls.find((b) => b.id === tr.fromBankrollId)?.name || 'External';
              const to = bankrolls.find((b) => b.id === tr.toBankrollId)?.name || 'External';

              return (
                <div key={tr.id} className="bg-[#0b1326] p-3 rounded-lg border border-[#27314a] flex flex-wrap items-center justify-between text-xs gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 font-semibold text-white">
                      <span>{from}</span>
                      <span className="text-[#2563eb]">➔</span>
                      <span>{to}</span>
                      {tr.isFreeBetCredit && (
                        <span className="text-[10px] bg-amber-950 text-amber-400 px-1.5 py-0.5 rounded">Free Bet Credit</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#8d90a0]">
                      {new Date(tr.date).toLocaleDateString()} • {tr.notes || 'No notes'}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-[#4edea3] text-sm">
                      +{formatCurrency(tr.amount, userCurrency)}
                    </div>
                    {tr.rolloverRequired && (
                      <div className="text-[10px] text-[#8d90a0]">
                        Rollover: {formatCurrency(tr.rolloverCompleted || 0, userCurrency)} / {formatCurrency(tr.rolloverRequired, userCurrency)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#171f33] border border-[#27314a] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Transfer Funds & Rollover Setup</h3>

            <form onSubmit={handleExecuteTransfer} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#8d90a0] mb-1">Source Bankroll</label>
                <select
                  value={fromBankroll}
                  onChange={(e) => setFromBankroll(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white mb-2"
                >
                  {bankrolls.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({formatCurrency(b.currentBalance, userCurrency)})
                    </option>
                  ))}
                </select>
                
                <label className="block text-[#8d90a0] mb-1">Source Bookmaker</label>
                <select
                  value={fromBookmakerId}
                  onChange={(e) => setFromBookmakerId(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                >
                  {bookmakers.filter(bm => bm.balances?.some(bal => bal.bankrollId === fromBankroll) || bm.bankrollId === fromBankroll).map(bm => (
                    <option key={bm.id} value={bm.id}>{bm.name} ({formatCurrency(getBookmakerBalanceForBankroll(bm, fromBankroll).cashBalance, userCurrency)} Cash)</option>
                  ))}
                  {bookmakers.filter(bm => bm.balances?.some(bal => bal.bankrollId === fromBankroll) || bm.bankrollId === fromBankroll).length === 0 && (
                    <option value="" disabled>No bookmakers with balance</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Destination Bankroll</label>
                <select
                  value={toBankroll}
                  onChange={(e) => setToBankroll(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white mb-2"
                >
                  {bankrolls.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                <label className="block text-[#8d90a0] mb-1">Destination Bookmaker</label>
                <select
                  value={toBookmakerId}
                  onChange={(e) => setToBookmakerId(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                >
                  {bookmakers.map((bm) => (
                    <option key={bm.id} value={bm.id}>{bm.name}</option>
                  ))}
                  {bookmakers.length === 0 && (
                    <option value="" disabled>No bookmakers available</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Transfer Amount ({getCurrencySymbol(userCurrency)})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(Number(e.target.value))}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                />
              </div>

              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFreeBetTransfer}
                  onChange={(e) => setIsFreeBetTransfer(e.target.checked)}
                />
                <span>Free Bet Promo Credit Transfer</span>
              </label>

              {isFreeBetTransfer && (
                <div>
                  <label className="block text-[#8d90a0] mb-1">Required Wagering Rollover ({getCurrencySymbol(userCurrency)})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rolloverRequired}
                    onChange={(e) => setRolloverRequired(Number(e.target.value))}
                    className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 py-2 bg-[#0b1326] text-[#8d90a0] rounded hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#2563eb] text-white font-bold rounded shadow"
                >
                  Confirm Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Granular Add Bankroll Creation Wizard Modal */}
      {showAddBankrollModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#171f33] border border-[#27314a] rounded-xl p-6 max-w-xl w-full space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#27314a] pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Wallet className="text-[#2563eb]" size={20} />
                <span>Granular Bankroll Creation Wizard</span>
              </h3>
              <button
                onClick={() => setShowAddBankrollModal(false)}
                className="text-[#8d90a0] hover:text-white transition-colors"
              >
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateBankroll} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#8d90a0] mb-1 font-medium">Bankroll Name</label>
                <input
                  type="text"
                  placeholder="e.g. High Yield Unit"
                  value={newBankrollName}
                  onChange={(e) => setNewBankrollName(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1 font-medium">Currency</label>
                <select
                  value={newBankrollCurrency}
                  onChange={(e) => setNewBankrollCurrency(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD (C$)</option>
                  <option value="BRL">BRL (R$)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-[#8d90a0] font-medium">Initial Allocations</label>
                {newBankrollAllocations.map((alloc, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-[10px] text-[#8d90a0] mb-0.5">Bookmaker</label>
                      <select
                        value={alloc.bookmakerId}
                        onChange={(e) => {
                          const newAllocs = [...newBankrollAllocations];
                          newAllocs[idx].bookmakerId = e.target.value;
                          setNewBankrollAllocations(newAllocs);
                        }}
                        className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2 py-1 text-white text-xs"
                      >
                        <option value="">Select...</option>
                        {bookmakers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] text-[#8d90a0] mb-0.5">Cash ({newBankrollCurrency})</label>
                      <input
                        type="number"
                        value={alloc.cashAmount}
                        onChange={(e) => {
                          const newAllocs = [...newBankrollAllocations];
                          newAllocs[idx].cashAmount = e.target.value;
                          setNewBankrollAllocations(newAllocs);
                        }}
                        className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2 py-1 text-white text-xs"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] text-[#8d90a0] mb-0.5">Free Bet ({newBankrollCurrency})</label>
                      <input
                        type="number"
                        value={alloc.freeBetAmount}
                        onChange={(e) => {
                          const newAllocs = [...newBankrollAllocations];
                          newAllocs[idx].freeBetAmount = e.target.value;
                          setNewBankrollAllocations(newAllocs);
                        }}
                        className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2 py-1 text-white text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewBankrollAllocations(newBankrollAllocations.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-300 mb-1"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setNewBankrollAllocations([...newBankrollAllocations, { bookmakerId: '', cashAmount: '', freeBetAmount: '' }])}
                  className="text-xs text-[#2563eb] hover:underline"
                >
                  + Add another allocation
                </button>
              </div>

              <div>
                <label className="block text-[#8d90a0] font-medium text-right">
                    Total: {newBankrollAllocations.reduce((sum, a) => sum + (parseFloat(a.cashAmount) || 0) + (parseFloat(a.freeBetAmount) || 0), 0).toFixed(2)}
                </label>
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1 font-medium">Description / Strategy Note</label>
                <input
                  type="text"
                  placeholder="e.g. Primary sharp single bets fund"
                  value={newBankrollDesc}
                  onChange={(e) => setNewBankrollDesc(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-[#27314a]">
                <button
                  type="button"
                  onClick={() => setShowAddBankrollModal(false)}
                  className="flex-1 py-2 bg-[#0b1326] text-[#8d90a0] rounded-lg hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold rounded-lg shadow transition-colors cursor-pointer"
                >
                  Create Bankroll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Bankroll Confirmation Modal */}
      {bankrollToDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#171f33] border border-red-900/60 rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold text-white">Delete Bankroll: {bankrollToDelete.name}</h3>
            </div>

            <p className="text-xs text-[#8d90a0]">
              You are about to delete <strong className="text-white">{bankrollToDelete.name}</strong> (Current Value: ${bankrollToDelete.currentBalance}). Please choose how to handle associated wagers and bookmakers:
            </p>

            <div className="space-y-2 text-xs">
              <label className="flex items-start gap-2.5 p-2.5 bg-[#0b1326] rounded-lg border border-[#27314a] cursor-pointer">
                <input
                  type="radio"
                  name="deleteStrat"
                  checked={deleteStrategy === 'reassign'}
                  onChange={() => setDeleteStrategy('reassign')}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <span className="font-bold text-white block">Reassign Data to Another Bankroll</span>
                  {deleteStrategy === 'reassign' && (
                    <select
                      value={targetReassignBankrollId}
                      onChange={(e) => setTargetReassignBankrollId(e.target.value)}
                      className="w-full mt-1 bg-[#171f33] border border-[#27314a] rounded px-2 py-1 text-white text-xs"
                    >
                      <option value="">Select Target Bankroll...</option>
                      {bankrolls
                        .filter((b) => b.id !== bankrollToDelete.id)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 bg-[#0b1326] rounded-lg border border-[#27314a] cursor-pointer">
                <input
                  type="radio"
                  name="deleteStrat"
                  checked={deleteStrategy === 'unassign'}
                  onChange={() => setDeleteStrategy('unassign')}
                  className="mt-0.5"
                />
                <div>
                  <span className="font-bold text-white block">Keep Unassigned</span>
                  <span className="text-[10px] text-[#8d90a0]">Preserve bet history without a bankroll assignment.</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 bg-[#0b1326] rounded-lg border border-[#27314a] cursor-pointer">
                <input
                  type="radio"
                  name="deleteStrat"
                  checked={deleteStrategy === 'delete_all'}
                  onChange={() => setDeleteStrategy('delete_all')}
                  className="mt-0.5"
                />
                <div>
                  <span className="font-bold text-red-400 block">Permanently Delete Associated Bets</span>
                  <span className="text-[10px] text-[#8d90a0]">Completely remove all wagers assigned to this bankroll.</span>
                </div>
              </label>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#27314a]">
              <button
                type="button"
                onClick={() => setBankrollToDelete(null)}
                className="flex-1 py-2 bg-[#0b1326] text-[#8d90a0] rounded-lg hover:text-white transition-colors cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteBankroll) {
                    onDeleteBankroll(bankrollToDelete.id, deleteStrategy, targetReassignBankrollId);
                  }
                  setBankrollToDelete(null);
                }}
                disabled={deleteStrategy === 'reassign' && !targetReassignBankrollId}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold rounded-lg shadow transition-colors cursor-pointer text-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reconcile Bankroll Modal */}
      {reconcileBankrollTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#171f33] border border-[#27314a] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#27314a] pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <RefreshCw size={18} className="text-[#2563eb]" />
                <span>Reconcile Bookmaker</span>
              </h3>
              <button
                onClick={() => setReconcileBankrollTarget(null)}
                className="text-[#8d90a0] hover:text-white transition-colors cursor-pointer"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#8d90a0] mb-1 font-medium">Select Bookmaker in {reconcileBankrollTarget.name}</label>
                <select
                  value={reconcileSelectedBookmakerId}
                  onChange={(e) => {
                    setReconcileSelectedBookmakerId(e.target.value);
                    const bm = bookmakers.find(b => b.id === e.target.value);
                    if (bm) {
                      const bal = getBookmakerBalanceForBankroll(bm, reconcileBankrollTarget.id);
                      setReconcileBmCash(bal.cashBalance.toString());
                      setReconcileBmFreeBet(bal.freeBetBalance.toString());
                    } else {
                      setReconcileBmCash('0');
                      setReconcileBmFreeBet('0');
                    }
                  }}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                >
                  {bookmakers.filter(bm => bm.balances?.some(b => b.bankrollId === reconcileBankrollTarget.id) || bm.bankrollId === reconcileBankrollTarget.id).map(bm => (
                    <option key={bm.id} value={bm.id}>{bm.name}</option>
                  ))}
                  {bookmakers.filter(bm => bm.balances?.some(b => b.bankrollId === reconcileBankrollTarget.id) || bm.bankrollId === reconcileBankrollTarget.id).length === 0 && (
                    <option value="" disabled>No bookmakers in this bankroll</option>
                  )}
                </select>
              </div>

              {reconcileSelectedBookmakerId && (() => {
                const selectedBm = bookmakers.find(b => b.id === reconcileSelectedBookmakerId);
                if (!selectedBm) return null;
                const bal = getBookmakerBalanceForBankroll(selectedBm, reconcileBankrollTarget.id);
                
                return (
                  <>
                    <div>
                      <label className="block text-[#8d90a0] mb-1 font-medium">New Real Cash Balance ({getCurrencySymbol(userCurrency)})</label>
                      <input
                        type="number"
                        step="0.01"
                        value={reconcileBmCash}
                        onChange={(e) => setReconcileBmCash(e.target.value)}
                        className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                      />
                      <span className="text-[10px] text-[#8d90a0]">
                        Current: {formatCurrency(bal.cashBalance, userCurrency)} (Variance: {formatCurrency((parseFloat(reconcileBmCash) || 0) - bal.cashBalance, userCurrency)})
                      </span>
                    </div>

                    <div>
                      <label className="block text-[#8d90a0] mb-1 font-medium">New Free Bet Credits ({getCurrencySymbol(userCurrency)})</label>
                      <input
                        type="number"
                        step="0.01"
                        value={reconcileBmFreeBet}
                        onChange={(e) => setReconcileBmFreeBet(e.target.value)}
                        className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                      />
                      <span className="text-[10px] text-[#8d90a0]">
                        Current: {formatCurrency(bal.freeBetBalance, userCurrency)} (Variance: {formatCurrency((parseFloat(reconcileBmFreeBet) || 0) - bal.freeBetBalance, userCurrency)})
                      </span>
                    </div>

                    <div>
                      <label className="block text-[#8d90a0] mb-1 font-medium">Adjustment Reason / Audit Note</label>
                      <input
                        type="text"
                        placeholder="e.g. Discrepancy correction or micro rounding fix"
                        value={reconcileNotes}
                        onChange={(e) => setReconcileNotes(e.target.value)}
                        className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                      />
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#27314a]">
              <button
                type="button"
                onClick={() => setReconcileBankrollTarget(null)}
                className="flex-1 py-2 bg-[#0b1326] text-[#8d90a0] rounded-lg hover:text-white transition-colors cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onReconcileBookmaker && reconcileSelectedBookmakerId) {
                    onReconcileBookmaker(reconcileSelectedBookmakerId, parseFloat(reconcileBmCash) || 0, parseFloat(reconcileBmFreeBet) || 0, reconcileNotes, reconcileBankrollTarget.id);
                  }
                  setReconcileBankrollTarget(null);
                }}
                disabled={!reconcileSelectedBookmakerId}
                className="flex-1 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-bold rounded-lg shadow transition-colors cursor-pointer text-xs"
              >
                Save Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit / Withdraw Modal */}
      {showDepositWithdrawModal && targetBankroll && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#171f33] border border-[#27314a] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#27314a] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowUpRight className="text-[#10b981]" size={18} />
                <span>Deposit / Withdraw ({targetBankroll.name})</span>
              </h3>
              <button
                onClick={() => setShowDepositWithdrawModal(false)}
                className="text-[#8d90a0] hover:text-white transition-colors cursor-pointer"
              >
                <XCircle size={18} />
              </button>
            </div>

            {dwError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded text-xs flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{dwError}</span>
              </div>
            )}

            <form onSubmit={handleDepositWithdrawSubmit} className="space-y-4">
              {bankrolls.length > 1 && (
                <div>
                  <label className="block text-xs font-bold text-[#8d90a0] uppercase tracking-wider mb-1">
                    Select Target Bankroll
                  </label>
                  <select
                    value={targetBankroll.id}
                    onChange={(e) => {
                      setDwBankrollId(e.target.value);
                      if (selectedBankrollId) {
                        setSelectedBankrollId(e.target.value);
                      }
                    }}
                    className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2.5 text-white text-xs focus:outline-none focus:border-[#2563eb]"
                  >
                    {bankrolls.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (Balance: {formatCurrency(b.currentBalance, userCurrency)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#8d90a0] uppercase tracking-wider mb-1">
                  Select Sportsbook
                </label>
                <select
                  value={dwBookmakerId || (bookmakers[0]?.id || '')}
                  onChange={(e) => setDwBookmakerId(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2.5 text-white text-xs focus:outline-none focus:border-[#2563eb]"
                  required
                >
                  {bookmakers.length === 0 ? (
                    <option value="">No Sportsbooks Available</option>
                  ) : (
                    bookmakers.map((bm) => {
                      const bal = getBookmakerBalanceForBankroll(bm, targetBankroll.id);
                      return (
                        <option key={bm.id} value={bm.id}>
                          {bm.name} (Current: {formatCurrency(bal.cashBalance, userCurrency)})
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8d90a0] uppercase tracking-wider mb-1">
                  Transaction Action
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDwType('deposit')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                      dwType === 'deposit'
                        ? 'bg-[#10b981]/20 border-[#10b981] text-[#10b981]'
                        : 'bg-[#0b1326] border-[#27314a] text-[#8d90a0] hover:text-white'
                    }`}
                  >
                    Deposit to Sportsbook
                  </button>
                  <button
                    type="button"
                    onClick={() => setDwType('withdraw')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                      dwType === 'withdraw'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                        : 'bg-[#0b1326] border-[#27314a] text-[#8d90a0] hover:text-white'
                    }`}
                  >
                    Withdraw to Bank Account
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-[#8d90a0] uppercase tracking-wider">
                    Amount ({getCurrencySymbol(userCurrency)})
                  </label>
                  <span className="text-[10px] text-[#4edea3] font-mono">
                    Total Balance: {formatCurrency(targetBankroll.currentBalance, userCurrency)}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8d90a0] font-mono font-bold">
                    {getCurrencySymbol(userCurrency)}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={dwAmount}
                    onChange={(e) => setDwAmount(e.target.value)}
                    className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg pl-8 pr-3 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-[#2563eb]"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDepositWithdrawModal(false)}
                  className="px-4 py-2 bg-[#0b1326] hover:bg-[#111c38] text-[#8d90a0] hover:text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dwLoading || bookmakers.length === 0 || !targetBankroll || parseFloat(dwAmount) <= 0}
                  className="px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {dwLoading ? 'Processing...' : dwType === 'deposit' ? 'Confirm Deposit' : 'Confirm Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
