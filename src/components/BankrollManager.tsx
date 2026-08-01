import React, { useState, useMemo, useEffect } from 'react';
import { Bankroll, Bookmaker, BankrollTransfer, Bet } from '../types';
import { formatCurrency, formatOdds, getBookmakerBalanceForBankroll } from '../utils/storage';
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
  Check
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface BankrollManagerProps {
  bankrolls: Bankroll[];
  bookmakers: Bookmaker[];
  bets: Bet[];
  transfers: BankrollTransfer[];
  activeBankrollId?: string;
  onAddBankroll: (bankroll: Omit<Bankroll, 'id'>) => string | void;
  onUpdateBankrollBalance: (bankrollId: string, newBalance: number) => void;
  onAddTransfer: (transfer: Omit<BankrollTransfer, 'id'>) => void;
  onSetActiveBankroll?: (bankrollId: string) => void;
  onDeleteBankroll?: (bankrollId: string, strategy: 'reassign' | 'unassign' | 'delete_all', targetBankrollId?: string) => void;
  onReconcileBankroll?: (bankrollId: string, newCash: number, newFreeBet: number, notes: string) => void;
  onBatchUpdateBookmakers?: (updates: Array<{ id: string; bankrollId?: string; realBalance?: number; freeBetBalance?: number }>) => void;
}

export const BankrollManager: React.FC<BankrollManagerProps> = ({
  bankrolls,
  bookmakers,
  bets,
  transfers,
  activeBankrollId,
  onAddBankroll,
  onUpdateBankrollBalance,
  onAddTransfer,
  onSetActiveBankroll,
  onDeleteBankroll,
  onReconcileBankroll,
  onBatchUpdateBookmakers
}) => {
  // Navigation State for Deep-Dive View
  const [selectedBankrollId, setSelectedBankrollId] = useState<string | null>(null);

  // Modal States
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [showAddBankrollModal, setShowAddBankrollModal] = useState<boolean>(false);

  // Deletion Management Modal State
  const [bankrollToDelete, setBankrollToDelete] = useState<Bankroll | null>(null);
  const [deleteStrategy, setDeleteStrategy] = useState<'reassign' | 'unassign' | 'delete_all'>('reassign');
  const [targetReassignBankrollId, setTargetReassignBankrollId] = useState<string>('');

  // Reconciliation Modal State
  const [reconcileBankrollTarget, setReconcileBankrollTarget] = useState<Bankroll | null>(null);
  const [reconcileNewCash, setReconcileNewCash] = useState<number>(0);
  const [reconcileNewFreeBet, setReconcileNewFreeBet] = useState<number>(0);
  const [reconcileNotes, setReconcileNotes] = useState<string>('');

  // Transfer Form State
  const [fromBankroll, setFromBankroll] = useState<string>(bankrolls[0]?.id || '');
  const [toBankroll, setToBankroll] = useState<string>(bankrolls[1]?.id || '');
  const [transferAmount, setTransferAmount] = useState<number>(100);
  const [isFreeBetTransfer, setIsFreeBetTransfer] = useState<boolean>(false);
  const [rolloverRequired, setRolloverRequired] = useState<number>(300);
  const [transferNotes, setTransferNotes] = useState<string>('Bonus credit reallocation');

  // Add Bankroll Form State & Matrix
  const [newBankrollName, setNewBankrollName] = useState<string>('');
  const [newBankrollCurrency, setNewBankrollCurrency] = useState<string>('EUR');
  const [newBankrollInitial, setNewBankrollInitial] = useState<number>(1000);
  const [newBankrollDesc, setNewBankrollDesc] = useState<string>('');
  const [bookmakerAllocations, setBookmakerAllocations] = useState<Record<string, { selected: boolean; realBalance: number; freeBetBalance: number }>>({});

  // Initialize matrix when opening Add Modal or when bookmakers change
  useEffect(() => {
    const initialMap: Record<string, { selected: boolean; realBalance: number; freeBetBalance: number }> = {};
    bookmakers.forEach((bm) => {
      initialMap[bm.id] = {
        selected: false,
        realBalance: bm.realBalance || 0,
        freeBetBalance: bm.freeBetBalance || 0
      };
    });
    setBookmakerAllocations(initialMap);
  }, [bookmakers, showAddBankrollModal]);

  // Search & Filter for Deep-Dive Bet History Table
  const [betSearchQuery, setBetSearchQuery] = useState<string>('');
  const [betStatusFilter, setBetStatusFilter] = useState<string>('all');

  // Find active bankroll object
  const activeBankroll = useMemo(() => {
    return bankrolls.find((b) => b.id === selectedBankrollId) || null;
  }, [bankrolls, selectedBankrollId]);

  // Real-time matrix cash calculation
  const totalAllocatedCash = useMemo(() => {
    return Object.values(bookmakerAllocations).reduce((acc, item) => {
      return item.selected ? acc + (Number(item.realBalance) || 0) : acc;
    }, 0);
  }, [bookmakerAllocations]);

  const totalAllocatedFreeBets = useMemo(() => {
    return Object.values(bookmakerAllocations).reduce((acc, item) => {
      return item.selected ? acc + (Number(item.freeBetBalance) || 0) : acc;
    }, 0);
  }, [bookmakerAllocations]);

  const allocationDiff = newBankrollInitial - totalAllocatedCash;

  // Compute Bankroll Scoped Analytics
  const bankrollAnalytics = useMemo(() => {
    if (!activeBankroll) return null;

    const scopedBets = bets.filter((b) => b.bankrollId === activeBankroll.id);

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
    // Net profit for settled bets = total returns - settled staked volume
    const settledStaked = scopedBets
      .filter((b) => b.status !== 'pending')
      .reduce((acc, b) => acc + b.stake, 0);

    const netPnL = totalReturns - settledStaked;
    const roi = totalVolumeStaked > 0 ? (netPnL / totalVolumeStaked) * 100 : 0;
    const winRate = settledCount > 0 ? (wonCount / settledCount) * 100 : 0;
    const totalPortfolioValue = activeBankroll.currentBalance + activeBankroll.freeBetCredits;

    // Cumulative Profit Growth Chart Data
    const sortedBets = [...scopedBets].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let cumulativeProfit = 0;
    const growthChartData = [
      { date: 'Start', profit: 0 }
    ];

    sortedBets.forEach((bet) => {
      if (bet.status === 'won') {
        const p = (bet.actualReturn ?? bet.potentialPayout) - bet.stake;
        cumulativeProfit += p;
      } else if (bet.status === 'lost') {
        cumulativeProfit -= bet.stake;
      } else if (bet.status === 'cashout') {
        cumulativeProfit += (bet.actualReturn ?? 0) - bet.stake;
      }
      if (bet.status !== 'pending') {
        growthChartData.push({
          date: new Date(bet.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          profit: Number(cumulativeProfit.toFixed(2))
        });
      }
    });

    // Sportsbook Breakdown Table for this Bankroll
    const bookmakerBreakdownMap: Record<string, {
      id: string;
      name: string;
      cashBalance: number;
      freeBetBalance: number;
      betsCount: number;
      staked: number;
      netPnL: number;
    }> = {};

    bookmakers.forEach((bm) => {
      const bal = getBookmakerBalanceForBankroll(bm, activeBankroll.id);
      if (bal.cashBalance > 0 || bal.freeBetBalance > 0 || bm.bankrollId === activeBankroll.id || scopedBets.some((b) => b.bookmakerId === bm.id)) {
        bookmakerBreakdownMap[bm.id] = {
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
      if (!bookmakerBreakdownMap[bet.bookmakerId]) {
        const bm = bookmakers.find((b) => b.id === bet.bookmakerId);
        const bal = bm ? getBookmakerBalanceForBankroll(bm, activeBankroll.id) : { cashBalance: 0, freeBetBalance: 0 };
        bookmakerBreakdownMap[bet.bookmakerId] = {
          id: bet.bookmakerId,
          name: bm ? bm.name : 'Unknown Sportsbook',
          cashBalance: bal.cashBalance,
          freeBetBalance: bal.freeBetBalance,
          betsCount: 0,
          staked: 0,
          netPnL: 0
        };
      }

      const item = bookmakerBreakdownMap[bet.bookmakerId];
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

    const bookmakerBreakdown = Object.values(bookmakerBreakdownMap);

    return {
      scopedBets,
      totalPortfolioValue,
      totalVolumeStaked,
      activeExposure,
      netPnL,
      roi,
      winRate,
      settledCount,
      pendingCount,
      growthChartData,
      bookmakerBreakdown
    };
  }, [activeBankroll, bets, bookmakers]);

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
    if (transferAmount <= 0 || fromBankroll === toBankroll) return;

    onAddTransfer({
      date: new Date().toISOString(),
      fromBankrollId: fromBankroll,
      toBankrollId: toBankroll,
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

    const createdId = onAddBankroll({
      name: newBankrollName,
      currency: newBankrollCurrency,
      initialBalance: newBankrollInitial,
      currentBalance: newBankrollInitial,
      freeBetCredits: totalAllocatedFreeBets,
      allocatedMargin: 0,
      color: '#2563eb',
      description: newBankrollDesc
    });

    if (onBatchUpdateBookmakers) {
      const updates: Array<{ id: string; bankrollId?: string; realBalance?: number; freeBetBalance?: number }> = [];
      Object.entries(bookmakerAllocations).forEach(([bmId, val]) => {
        if (val.selected) {
          updates.push({
            id: bmId,
            bankrollId: typeof createdId === 'string' ? createdId : undefined,
            realBalance: Number(val.realBalance) || 0,
            freeBetBalance: Number(val.freeBetBalance) || 0
          });
        }
      });
      if (updates.length > 0) {
        onBatchUpdateBookmakers(updates);
      }
    }

    setNewBankrollName('');
    setShowAddBankrollModal(false);
  };

  // If a bankroll deep-dive is active, render the Bankroll Detailed Dashboard
  if (activeBankroll && bankrollAnalytics) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-12 animate-fade-in">
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
              {formatCurrency(bankrollAnalytics.totalPortfolioValue)}
            </div>
            <span className="text-[10px] text-[#4edea3] font-mono block">
              {formatCurrency(activeBankroll.currentBalance)} Cash + {formatCurrency(activeBankroll.freeBetCredits)} Promo
            </span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Net PnL (€)</span>
            <div className={`text-lg font-extrabold font-mono ${bankrollAnalytics.netPnL >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
              {bankrollAnalytics.netPnL >= 0 ? '+' : ''}{formatCurrency(bankrollAnalytics.netPnL)}
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
              {formatCurrency(bankrollAnalytics.totalVolumeStaked)}
            </div>
            <span className="text-[10px] text-[#8d90a0] block">Total turnover</span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Active Exposure</span>
            <div className="text-lg font-extrabold text-amber-400 font-mono">
              {formatCurrency(bankrollAnalytics.activeExposure)}
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
              Initial: {formatCurrency(activeBankroll.initialBalance)}
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
                <YAxis stroke="#8d90a0" fontSize={11} tickLine={false} tickFormatter={(val) => `€${val}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b1326', borderColor: '#27314a', borderRadius: '8px', color: '#fff' }}
                  formatter={(value: any) => [`€${value}`, 'Cumulative Profit']}
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
                {bankrollAnalytics.bookmakerBreakdown.map((bm) => (
                  <tr key={bm.id} className="hover:bg-[#131b2e] transition-colors">
                    <td className="p-3 font-bold text-white flex items-center gap-2">
                      <Building2 size={14} className="text-[#2563eb]" />
                      <span>{bm.name}</span>
                    </td>
                    <td className="p-3 text-right font-mono text-white">
                      {formatCurrency(bm.cashBalance)}
                    </td>
                    <td className="p-3 text-right font-mono text-[#4edea3]">
                      {formatCurrency(bm.freeBetBalance)}
                    </td>
                    <td className="p-3 text-center text-white">{bm.betsCount}</td>
                    <td className="p-3 text-right font-mono text-white">{formatCurrency(bm.staked)}</td>
                    <td className={`p-3 text-right font-mono font-bold ${bm.netPnL >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
                      {bm.netPnL >= 0 ? '+' : ''}{formatCurrency(bm.netPnL)}
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
                              {l.selection} <span className="text-[10px] text-[#8d90a0]">({l.event})</span>
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
                          {formatCurrency(bet.stake)}
                          {bet.isFreeBet && <span className="block text-[9px] text-[#4edea3]">Free Bet</span>}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white">
                          {formatCurrency(bet.actualReturn ?? (bet.status === 'won' ? bet.potentialPayout : 0))}
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
      </div>
    );
  }

  // Otherwise render Main Overview Grid
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-12 animate-fade-in">
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
          {bankrolls.map((b) => {
            const scopedBets = bets.filter((bet) => bet.bankrollId === b.id);
            const netPnL = scopedBets.reduce((acc, bet) => {
              if (bet.status === 'won') return acc + ((bet.actualReturn ?? bet.potentialPayout) - bet.stake);
              if (bet.status === 'lost') return acc - bet.stake;
              if (bet.status === 'cashout') return acc + ((bet.actualReturn ?? 0) - bet.stake);
              return acc;
            }, 0);

            const isActivePrimary = b.id === activeBankrollId;

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
                      <span>{formatCurrency(b.currentBalance)}</span>
                      <span className="text-xs font-normal px-2 py-0.5 rounded bg-[#0b1326] text-[#b4c5ff] border border-[#27314a]">
                        {b.currency}
                      </span>
                    </div>
                    <div className="text-xs text-[#8d90a0]">
                      Initial allocation: {formatCurrency(b.initialBalance)}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#27314a] grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-[#8d90a0] block">Free Bet Credits</span>
                      <span className="text-[#4edea3] font-mono font-bold">{formatCurrency(b.freeBetCredits)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#8d90a0] block">Net PnL</span>
                      <span className={`font-mono font-bold ${netPnL >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
                        {netPnL >= 0 ? '+' : ''}{formatCurrency(netPnL)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setReconcileBankrollTarget(b);
                        setReconcileNewCash(b.currentBalance);
                        setReconcileNewFreeBet(b.freeBetCredits);
                        setReconcileNotes('');
                      }}
                      className="flex-1 py-1.5 bg-[#0b1326] hover:bg-[#1a233a] text-white border border-[#27314a] rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <RefreshCw size={12} className="text-[#2563eb]" /> Reconcile
                    </button>
                    <button
                      onClick={() => setSelectedBankrollId(b.id)}
                      className="flex-1 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shadow"
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
                {formatCurrency(bm.realBalance)}
              </div>

              <div className="text-xs text-[#8d90a0] flex justify-between">
                <span>Free Credits:</span>
                <span className="text-[#4edea3] font-mono font-bold">{formatCurrency(bm.freeBetBalance)}</span>
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
                      +{formatCurrency(tr.amount)}
                    </div>
                    {tr.rolloverRequired && (
                      <div className="text-[10px] text-[#8d90a0]">
                        Rollover: {formatCurrency(tr.rolloverCompleted || 0)} / {formatCurrency(tr.rolloverRequired)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                >
                  {bankrolls.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({formatCurrency(b.currentBalance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Destination Bankroll</label>
                <select
                  value={toBankroll}
                  onChange={(e) => setToBankroll(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                >
                  {bankrolls.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Transfer Amount ($)</label>
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
                  <label className="block text-[#8d90a0] mb-1">Required Wagering Rollover ($)</label>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

                <div>
                  <label className="block text-[#8d90a0] mb-1 font-medium">Starting Balance</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newBankrollInitial}
                    onChange={(e) => setNewBankrollInitial(Number(e.target.value))}
                    className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                    required
                  />
                </div>
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

              {/* Sportsbook Balance Allocation Matrix */}
              <div className="space-y-2 pt-2 border-t border-[#27314a]">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-white flex items-center gap-1.5">
                    <Building2 size={15} className="text-[#2563eb]" />
                    <span>Sportsbook Balance Allocation Matrix</span>
                  </label>
                  <span className="text-[10px] text-[#8d90a0]">Allocate starting cash to sportsbooks</span>
                </div>

                {/* Real-time Validation Indicator */}
                <div className="p-3 rounded-lg text-xs font-semibold flex items-center justify-between transition-all border">
                  {allocationDiff === 0 ? (
                    <div className="bg-[#005236]/30 border-[#005236] text-[#4edea3] w-full p-2.5 rounded-lg flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Check size={16} /> 100% Capital Allocated Matched
                      </span>
                      <span className="font-mono font-bold">${totalAllocatedCash} / ${newBankrollInitial}</span>
                    </div>
                  ) : allocationDiff > 0 ? (
                    <div className="bg-[#1e293b] border-blue-800 text-[#b4c5ff] w-full p-2.5 rounded-lg flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 size={16} className="text-blue-400" /> Unallocated Reserve Cash: ${allocationDiff}
                      </span>
                      <span className="font-mono font-bold">${totalAllocatedCash} / ${newBankrollInitial}</span>
                    </div>
                  ) : (
                    <div className="bg-[#601410]/30 border-[#601410] text-[#ffb3ad] w-full p-2.5 rounded-lg flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle size={16} /> Over-allocated by ${Math.abs(allocationDiff)}
                      </span>
                      <span className="font-mono font-bold">${totalAllocatedCash} / ${newBankrollInitial}</span>
                    </div>
                  )}
                </div>

                <div className="max-h-52 overflow-y-auto space-y-2 pr-1 pt-1">
                  {bookmakers.length === 0 ? (
                    <div className="text-[#8d90a0] text-center py-4">No sportsbooks created yet. You can create bookmakers in the Bookmakers tab.</div>
                  ) : (
                    bookmakers.map((bm) => {
                      const item = bookmakerAllocations[bm.id] || { selected: false, realBalance: 0, freeBetBalance: 0 };
                      return (
                        <div
                          key={bm.id}
                          className={`p-2.5 rounded-lg border transition-all ${
                            item.selected ? 'bg-[#0b1326] border-[#2563eb]' : 'bg-[#101728] border-[#27314a] opacity-70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <label className="flex items-center gap-2 text-white font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => {
                                  setBookmakerAllocations((prev) => ({
                                    ...prev,
                                    [bm.id]: {
                                      ...prev[bm.id],
                                      selected: e.target.checked
                                    }
                                  }));
                                }}
                                className="rounded bg-[#0b1326] border-[#27314a] text-[#2563eb]"
                              />
                              <span>{bm.name}</span>
                            </label>

                            {item.selected && (
                              <span className="text-[10px] text-[#4edea3] font-mono">Allocated</span>
                            )}
                          </div>

                          {item.selected && (
                            <div className="grid grid-cols-2 gap-2 pl-6">
                              <div>
                                <label className="block text-[10px] text-[#8d90a0] mb-0.5">Starting Cash ($)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.realBalance}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setBookmakerAllocations((prev) => ({
                                      ...prev,
                                      [bm.id]: {
                                        ...prev[bm.id],
                                        realBalance: val
                                      }
                                    }));
                                  }}
                                  className="w-full bg-[#171f33] border border-[#27314a] rounded px-2 py-1 text-white font-mono text-xs"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] text-[#8d90a0] mb-0.5">Starting FreeBets ($)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.freeBetBalance}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setBookmakerAllocations((prev) => ({
                                      ...prev,
                                      [bm.id]: {
                                        ...prev[bm.id],
                                        freeBetBalance: val
                                      }
                                    }));
                                  }}
                                  className="w-full bg-[#171f33] border border-[#27314a] rounded px-2 py-1 text-white font-mono text-xs"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
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
                  Create & Allocate Capital
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
                <span>Reconcile {reconcileBankrollTarget.name}</span>
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
                <label className="block text-[#8d90a0] mb-1 font-medium">New Real Cash Balance ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={reconcileNewCash}
                  onChange={(e) => setReconcileNewCash(Number(e.target.value))}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                />
                <span className="text-[10px] text-[#8d90a0]">
                  Current: ${reconcileBankrollTarget.currentBalance} (Variance: {(reconcileNewCash - reconcileBankrollTarget.currentBalance) >= 0 ? '+' : ''}${(reconcileNewCash - reconcileBankrollTarget.currentBalance).toFixed(2)})
                </span>
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1 font-medium">New Free Bet Credits ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={reconcileNewFreeBet}
                  onChange={(e) => setReconcileNewFreeBet(Number(e.target.value))}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                />
                <span className="text-[10px] text-[#8d90a0]">
                  Current: ${reconcileBankrollTarget.freeBetCredits} (Variance: {(reconcileNewFreeBet - reconcileBankrollTarget.freeBetCredits) >= 0 ? '+' : ''}${(reconcileNewFreeBet - reconcileBankrollTarget.freeBetCredits).toFixed(2)})
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
                  if (onReconcileBankroll) {
                    onReconcileBankroll(reconcileBankrollTarget.id, reconcileNewCash, reconcileNewFreeBet, reconcileNotes);
                  }
                  setReconcileBankrollTarget(null);
                }}
                className="flex-1 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold rounded-lg shadow transition-colors cursor-pointer text-xs"
              >
                Save Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
