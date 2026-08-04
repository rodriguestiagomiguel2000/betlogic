import React, { useState, useMemo, useEffect } from 'react';
import { Bookmaker, Bet, Bankroll } from '../types';
import { formatCurrency, formatOdds, getBookmakerBalanceForBankroll, parseCurrency, getCurrencySymbol } from '../utils/storage';
import { formatEventDate, formatLegSelection, formatBetDateTime } from '../utils/dateUtils';
import { BookmakerLogo } from './BookmakerLogo';
import {
  Building2,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Percent,
  Wallet,
  Gift,
  Award,
  ChevronRight,
  ArrowLeft,
  Filter,
  BarChart2,
  History,
  CheckCircle2,
  XCircle,
  Zap,
  Target,
  Trash2,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  Settings,
  Upload
} from 'lucide-react';

interface BookmakersViewProps {
  bookmakers: Bookmaker[];
  bankrolls: Bankroll[];
  bets: Bet[];
  activeBankrollId?: string;
  userCurrency?: string;
  onAddBookmaker: (bookmaker: Omit<Bookmaker, 'id'>, targetBankrollId?: string) => void;
  onUpdateBookmaker?: (bookmakerId: string, updates: Partial<Bookmaker>) => void;
  onUpdateBookmakerBalance: (
    bookmakerId: string,
    realBalance: number,
    freeBetBalance: number,
    targetBankrollId?: string,
    type?: 'deposit' | 'withdraw' | 'freebet',
    amount?: number
  ) => void;
  onUpdateBookmakerMargin: (bookmakerId: string, margin: number) => void;
  onNavigateToHistory: (bookmakerId: string) => void;
  onDeleteBookmaker?: (bookmakerId: string) => void;
  onReconcileBookmaker?: (bookmakerId: string, newRealCash: number, newFreeBet: number, notes: string, targetBankrollId?: string) => void;
}

const compressImage = (base64Str: string, maxWidth = 150, maxHeight = 150, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

export const BookmakersView: React.FC<BookmakersViewProps> = ({
  bookmakers,
  bankrolls,
  bets,
  activeBankrollId,
  userCurrency,
  onAddBookmaker,
  onUpdateBookmaker,
  onUpdateBookmakerBalance,
  onUpdateBookmakerMargin,
  onNavigateToHistory,
  onDeleteBookmaker,
  onReconcileBookmaker
}) => {
  // Navigation State for Deep-Dive Detail View
  const [selectedBookmakerId, setSelectedBookmakerId] = useState<string | null>(null);

  // Deletion & Reconciliation Modal States
  const [bookmakerToDelete, setBookmakerToDelete] = useState<Bookmaker | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [reconcileBmTarget, setReconcileBmTarget] = useState<Bookmaker | null>(null);
  const [reconcileBmCash, setReconcileBmCash] = useState<string>('0');
  const [reconcileBmFreeBet, setReconcileBmFreeBet] = useState<string>('0');
  const [reconcileBmNotes, setReconcileBmNotes] = useState<string>('');

  // Main Overview Target Bankroll Filter
  const [overviewBankrollId, setOverviewBankrollId] = useState<string>(activeBankrollId || bankrolls[0]?.id || 'all');
  const [userChangedOverview, setUserChangedOverview] = useState<boolean>(false);

  // Detail View Bankroll Context Selector
  const [detailBankrollId, setDetailBankrollId] = useState<string>(activeBankrollId || bankrolls[0]?.id || 'all');

  useEffect(() => {
    if (activeBankrollId && !userChangedOverview) {
      setOverviewBankrollId(activeBankrollId);
      setDetailBankrollId(activeBankrollId);
    }
  }, [activeBankrollId]);

  // Modal States
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [selectedBookmakerForTx, setSelectedBookmakerForTx] = useState<Bookmaker | null>(null);
  const [txType, setTxType] = useState<'deposit' | 'withdraw' | 'freebet'>('deposit');
  const [txAmount, setTxAmount] = useState<string>('100');
  const [txBankrollId, setTxBankrollId] = useState<string>(bankrolls[0]?.id || '');

  // New Bookmaker form state
  const [newName, setNewName] = useState<string>('');
  const [newLogoUrl, setNewLogoUrl] = useState<string>('');
  const [newBankrollId, setNewBankrollId] = useState<string>(bankrolls[0]?.id || '');
  const [newRealBalance, setNewRealBalance] = useState<number>(500);
  const [newFreeBetBalance, setNewFreeBetBalance] = useState<number>(50);
  const [newMargin, setNewMargin] = useState<number>(4.5);
  const [newColor, setNewColor] = useState<string>('#2563eb');

  // Dual logo select modes & drag state
  const [logoSelectMode, setLogoSelectMode] = useState<'url' | 'upload'>('url');
  const [editLogoSelectMode, setEditLogoSelectMode] = useState<'url' | 'upload'>('url');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [editDragActive, setEditDragActive] = useState<boolean>(false);

  // Edit bookmaker profile states
  const [editingBookmaker, setEditingBookmaker] = useState<Bookmaker | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editLogoUrl, setEditLogoUrl] = useState<string>('');
  const [editColor, setEditColor] = useState<string>('#2563eb');
  const [editMargin, setEditMargin] = useState<number>(4.5);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      if (editingBookmaker) {
        setEditDragActive(true);
      } else {
        setDragActive(true);
      }
    } else if (e.type === "dragleave") {
      if (editingBookmaker) {
        setEditDragActive(false);
      } else {
        setDragActive(false);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent, isEdit = false) => {
    e.preventDefault();
    e.stopPropagation();
    if (isEdit) {
      setEditDragActive(false);
    } else {
      setDragActive(false);
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith('image/')) {
        alert('Please drop an image file (PNG, JPG, SVG, etc.)');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          const compressed = await compressImage(base64);
          if (isEdit) {
            setEditLogoUrl(compressed);
          } else {
            setNewLogoUrl(compressed);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File is too large. Please upload an image under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        try {
          const compressed = await compressImage(base64);
          if (isEdit) {
            setEditLogoUrl(compressed);
          } else {
            setNewLogoUrl(compressed);
          }
        } catch (err) {
          if (isEdit) {
            setEditLogoUrl(base64);
          } else {
            setNewLogoUrl(base64);
          }
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateBookmakerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBookmaker || !editName) return;

    if (onUpdateBookmaker) {
      onUpdateBookmaker(editingBookmaker.id, {
        name: editName,
        logoUrl: editLogoUrl || undefined,
        color: editColor,
        averageMargin: editMargin
      });
    } else {
      editingBookmaker.name = editName;
      editingBookmaker.logoUrl = editLogoUrl || undefined;
      editingBookmaker.color = editColor;
      editingBookmaker.averageMargin = editMargin;
    }

    setEditingBookmaker(null);
  };

  // Find active bookmaker object for deep-dive
  const activeBookmaker = useMemo(() => {
    return bookmakers.find((bm) => bm.id === selectedBookmakerId) || null;
  }, [bookmakers, selectedBookmakerId]);

  // Filter bookmakers for overview based on overviewBankrollId
  const overviewBookmakers = useMemo(() => {
    if (overviewBankrollId === 'all') return bookmakers;
    return bookmakers.filter((bm) =>
      bm.balances?.some((b) => b.bankrollId === overviewBankrollId) || bm.bankrollId === overviewBankrollId
    );
  }, [bookmakers, overviewBankrollId]);

  // Overall system metrics for current overview selection
  const overviewMetrics = useMemo(() => {
    const targetBankrolls = overviewBankrollId === 'all'
      ? bankrolls
      : bankrolls.filter((b) => b.id === overviewBankrollId);

    const bankrollCashSum = targetBankrolls.reduce((sum, b) => sum + (b.currentBalance || 0), 0);
    const bankrollFreeSum = targetBankrolls.reduce((sum, b) => sum + (b.freeBetCredits || 0), 0);

    const bookmakerCashSum = overviewBookmakers.reduce((acc, b) => {
      const bal = getBookmakerBalanceForBankroll(b, overviewBankrollId);
      return acc + bal.cashBalance;
    }, 0);
    const bookmakerFreeSum = overviewBookmakers.reduce((acc, b) => {
      const bal = getBookmakerBalanceForBankroll(b, overviewBankrollId);
      return acc + bal.freeBetBalance;
    }, 0);

    const totalRealBalance = bookmakerCashSum;
    const totalFreeBets = bookmakerFreeSum;

    const avgMargin = overviewBookmakers.length > 0
      ? overviewBookmakers.reduce((acc, b) => acc + b.averageMargin, 0) / overviewBookmakers.length
      : 0;

    let totalProfit = 0;
    overviewBookmakers.forEach((bm) => {
      const bmBets = bets.filter((b) => b.bookmakerId === bm.id && (overviewBankrollId === 'all' || b.bankrollId === overviewBankrollId));
      bmBets.forEach((b) => {
        if (b.status === 'won') totalProfit += (b.actualReturn ?? b.potentialPayout) - b.stake;
        else if (b.status === 'lost') totalProfit -= b.stake;
        else if (b.status === 'cashout') totalProfit += (b.actualReturn ?? 0) - b.stake;
      });
    });

    return {
      totalRealBalance,
      totalFreeBets,
      avgMargin,
      totalProfit,
      totalCombined: totalRealBalance + totalFreeBets
    };
  }, [overviewBookmakers, bets, overviewBankrollId, bankrolls]);

  // Scoped Deep-Dive Analytics for selected bookmaker
  const detailAnalytics = useMemo(() => {
    if (!activeBookmaker) return null;

    const scopedBets = bets.filter((b) => {
      if (b.bookmakerId !== activeBookmaker.id) return false;
      if (detailBankrollId !== 'all' && b.bankrollId !== detailBankrollId) return false;
      return true;
    });

    let totalStaked = 0;
    let totalReturns = 0;
    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;
    let sumOdds = 0;

    scopedBets.forEach((b) => {
      totalStaked += b.stake;
      sumOdds += b.totalOdds;

      if (b.status === 'pending') {
        pendingCount++;
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
    const settledStaked = scopedBets.filter((b) => b.status !== 'pending').reduce((acc, b) => acc + b.stake, 0);
    const netProfit = totalReturns - settledStaked;
    const roi = totalStaked > 0 ? (netProfit / totalStaked) * 100 : 0;
    const winRate = settledCount > 0 ? (wonCount / settledCount) * 100 : 0;
    const avgOdds = scopedBets.length > 0 ? sumOdds / scopedBets.length : 0;

    // Edge Rating based on margin
    let sharpnessTag = 'Standard Market';
    let edgeRating = '+1.5% EV Edge';
    if (activeBookmaker.averageMargin <= 3.0) {
      sharpnessTag = 'Sharp Low Juice';
      edgeRating = '+3.8% Closing Line Edge';
    } else if (activeBookmaker.averageMargin >= 5.5) {
      sharpnessTag = 'Soft Recreational';
      edgeRating = '+0.5% EV Edge';
    }

    // Sport Performance Breakdown
    const sportBreakdownMap: Record<string, {
      sport: string;
      betsCount: number;
      staked: number;
      netPnL: number;
      wonCount: number;
      settledCount: number;
    }> = {};

    scopedBets.forEach((b) => {
      const sportName = b.legs[0]?.sport || 'Other Sports';
      if (!sportBreakdownMap[sportName]) {
        sportBreakdownMap[sportName] = {
          sport: sportName,
          betsCount: 0,
          staked: 0,
          netPnL: 0,
          wonCount: 0,
          settledCount: 0
        };
      }

      const item = sportBreakdownMap[sportName];
      item.betsCount += 1;
      item.staked += b.stake;

      if (b.status === 'won') {
        item.wonCount += 1;
        item.settledCount += 1;
        item.netPnL += (b.actualReturn ?? b.potentialPayout) - b.stake;
      } else if (b.status === 'lost') {
        item.settledCount += 1;
        item.netPnL -= b.stake;
      } else if (b.status === 'cashout') {
        item.settledCount += 1;
        item.netPnL += (b.actualReturn ?? 0) - b.stake;
      }
    });

    const sportBreakdown = Object.values(sportBreakdownMap);

    return {
      scopedBets,
      totalStaked,
      netProfit,
      roi,
      winRate,
      avgOdds,
      sharpnessTag,
      edgeRating,
      settledCount,
      pendingCount,
      sportBreakdown
    };
  }, [activeBookmaker, bets, detailBankrollId]);

  const handleCreateBookmaker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    const targetB = newBankrollId || (overviewBankrollId !== 'all' ? overviewBankrollId : activeBankrollId || bankrolls[0]?.id || 'bank-1');

    onAddBookmaker({
      name: newName,
      bankrollId: targetB,
      realBalance: newRealBalance,
      freeBetBalance: newFreeBetBalance,
      averageMargin: newMargin,
      pendingBetsCount: 0,
      color: newColor,
      logoUrl: newLogoUrl || undefined
    }, targetB);

    setNewName('');
    setNewLogoUrl('');
    setShowAddModal(false);
  };

  const handleExecuteTx = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseCurrency(txAmount);
    if (!selectedBookmakerForTx || amount <= 0 || !txBankrollId) return;

    const current = getBookmakerBalanceForBankroll(selectedBookmakerForTx, txBankrollId);

    let newReal = current.cashBalance;
    let newFree = current.freeBetBalance;

    if (txType === 'deposit') {
      newReal += amount;
    } else if (txType === 'withdraw') {
      newReal = Math.max(0, newReal - amount);
    } else if (txType === 'freebet') {
      newFree += amount;
    }

    onUpdateBookmakerBalance(selectedBookmakerForTx.id, newReal, newFree, txBankrollId, txType, amount);
    setSelectedBookmakerForTx(null);
  };

  // Render Sportsbook Deep-Dive View
  if (activeBookmaker && detailAnalytics) {
    const contextBankrollName = detailBankrollId === 'all'
      ? 'All Bankrolls (Global)'
      : bankrolls.find((b) => b.id === detailBankrollId)?.name || 'Selected Bankroll';

    return (
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-12 animate-fade-in">
        {/* Breadcrumbs & Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#171f33] p-4 rounded-xl border border-[#27314a]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedBookmakerId(null)}
              className="p-2 bg-[#0b1326] hover:bg-[#2563eb] text-[#8d90a0] hover:text-white rounded-lg border border-[#27314a] transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
            >
              <ArrowLeft size={16} /> Back to Sportsbooks
            </button>
            <div className="h-6 w-px bg-[#27314a]"></div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8d90a0]">Sportsbooks</span>
                <ChevronRight size={12} className="text-[#8d90a0]" />
                <span className="text-xs font-bold text-[#b4c5ff]">{activeBookmaker.name} Analytics</span>
              </div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <BookmakerLogo bookmaker={activeBookmaker} size="sm" />
                <span>{activeBookmaker.name} Performance ({contextBankrollName})</span>
              </h2>
            </div>
          </div>

          {/* Bankroll Context Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8d90a0] font-semibold">Bankroll Context:</span>
            <select
              value={detailBankrollId}
              onChange={(e) => setDetailBankrollId(e.target.value)}
              className="bg-[#0b1326] border border-[#2563eb]/50 text-white font-bold text-xs rounded-lg px-3 py-2 cursor-pointer"
            >
              <option value="all">🌐 All Bankrolls (Global)</option>
              {bankrolls.map((b) => (
                <option key={b.id} value={b.id}>
                  💼 {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Scoped Sportsbook KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Net Profit / Loss</span>
            <div className={`text-lg font-extrabold font-mono ${detailAnalytics.netProfit >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
              {detailAnalytics.netProfit >= 0 ? '+' : ''}{formatCurrency(detailAnalytics.netProfit, userCurrency)}
            </div>
            <span className="text-[10px] text-[#8d90a0] block">
              Yield: <strong className={detailAnalytics.roi >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}>{detailAnalytics.roi.toFixed(1)}%</strong>
            </span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Win Rate</span>
            <div className="text-lg font-extrabold text-[#b4c5ff] font-mono">
              {detailAnalytics.winRate.toFixed(1)}%
            </div>
            <span className="text-[10px] text-[#8d90a0] block">{detailAnalytics.settledCount} settled wagers</span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Avg Decimal Odds</span>
            <div className="text-lg font-extrabold text-amber-400 font-mono">
              @{formatOdds(detailAnalytics.avgOdds || 1)}
            </div>
            <span className="text-[10px] text-[#8d90a0] block">Across {detailAnalytics.scopedBets.length} wagers</span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Real Cash Balance</span>
            <div className="text-lg font-extrabold text-white font-mono">
              {formatCurrency(activeBookmaker.realBalance, userCurrency)}
            </div>
            <span className="text-[10px] text-[#8d90a0] block">Available sportsbook funds</span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Free Bet Credits</span>
            <div className="text-lg font-extrabold text-[#4edea3] font-mono">
              {formatCurrency(activeBookmaker.freeBetBalance, userCurrency)}
            </div>
            <span className="text-[10px] text-[#4edea3] block">Promo bonus reserves</span>
          </div>

          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8d90a0]">Line Margin / Edge</span>
            <div className="text-lg font-extrabold text-amber-400 font-mono">
              {activeBookmaker.averageMargin}%
            </div>
            <span className="text-[10px] text-[#b4c5ff] block font-bold">{detailAnalytics.edgeRating}</span>
          </div>
        </div>

        {/* Sport Performance Breakdown */}
        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart2 size={16} className="text-[#2563eb]" />
            <span>Sport Performance Breakdown on {activeBookmaker.name}</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {detailAnalytics.sportBreakdown.length === 0 ? (
              <div className="col-span-full text-center py-6 text-xs text-[#8d90a0]">
                No sports betting activity recorded for this bookmaker in the selected bankroll.
              </div>
            ) : (
              detailAnalytics.sportBreakdown.map((sb, idx) => {
                const wr = sb.settledCount > 0 ? (sb.wonCount / sb.settledCount) * 100 : 0;
                return (
                  <div key={idx} className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">{sb.sport}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-[#171f33] text-[#b4c5ff] font-mono">
                        {sb.betsCount} bets
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      <div>
                        <span className="text-[10px] text-[#8d90a0] block">Net PnL</span>
                        <span className={`font-mono font-bold ${sb.netPnL >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
                          {sb.netPnL >= 0 ? '+' : ''}{formatCurrency(sb.netPnL, userCurrency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#8d90a0] block">Win Rate</span>
                        <span className="font-mono font-bold text-white">{wr.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Filtered Audit Ledger Table */}
        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <History size={16} className="text-[#2563eb]" />
            <span>Wager Audit Ledger ({detailAnalytics.scopedBets.length})</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#0b1326] border-b border-[#27314a] text-[#8d90a0] font-semibold uppercase text-[10px]">
                  <th className="p-3">Date</th>
                  <th className="p-3">Bankroll</th>
                  <th className="p-3">Selections</th>
                  <th className="p-3 text-center">Type</th>
                  <th className="p-3 text-right">Odds</th>
                  <th className="p-3 text-right">Stake</th>
                  <th className="p-3 text-right">Return</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27314a]">
                {detailAnalytics.scopedBets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-[#8d90a0]">
                      No wagers recorded for this bookmaker under {contextBankrollName}.
                    </td>
                  </tr>
                ) : (
                  detailAnalytics.scopedBets.map((bet) => {
                    const bankName = bankrolls.find((b) => b.id === bet.bankrollId)?.name || 'Default Bankroll';
                    return (
                      <tr key={bet.id} className="hover:bg-[#131b2e] transition-colors">
                        <td className="p-3 text-[#8d90a0] whitespace-nowrap">
                          {formatBetDateTime(bet)}
                        </td>
                        <td className="p-3 font-bold text-[#b4c5ff] whitespace-nowrap">{bankName}</td>
                        <td className="p-3 max-w-sm md:max-w-md">
                          {bet.legs.map((l, i) => (
                            <div key={i} className="text-white font-medium whitespace-normal break-words">
                              {formatLegSelection(l.selection, l.market)} <span className="text-[10px] text-[#8d90a0]">({l.event}{formatEventDate(l.eventDate) ? ` — ${formatEventDate(l.eventDate)}` : ''})</span>
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
      </div>
    );
  }

  // Render Main Bookmakers Overview
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-12 animate-fade-in">
      {/* Top Banner & Bankroll Filter Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#171f33] p-5 rounded-xl border border-[#27314a]">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="text-[#2563eb]" />
            <span>Sportsbooks & Bookmaker Intelligence</span>
          </h2>
          <p className="text-sm text-[#8d90a0] mt-1">
            Manage sportsbook bankrolls, promo free bet credits, line juice/margins, and track bookmaker specific ROI.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Target Bankroll Selector */}
          <div className="flex items-center gap-2 bg-[#0b1326] p-1.5 px-3 rounded-lg border border-[#2563eb]/40 w-full sm:w-auto overflow-hidden">
            <Target size={15} className="text-[#2563eb] shrink-0" />
            <span className="text-xs text-[#8d90a0] font-bold whitespace-nowrap">Target Bankroll:</span>
            <select
              value={overviewBankrollId}
              onChange={(e) => {
                setUserChangedOverview(true);
                setOverviewBankrollId(e.target.value);
              }}
              className="bg-[#171f33] border border-[#27314a] text-white text-xs font-bold rounded px-2 py-1 cursor-pointer flex-1 min-w-0 truncate"
            >
              <option value="all">
                All Bankrolls ({formatCurrency(
                  bankrolls.reduce((sum, b) => sum + (b.currentBalance || 0), 0),
                  userCurrency
                )} Cash + {formatCurrency(
                  bankrolls.reduce((sum, b) => sum + (b.freeBetCredits || 0), 0),
                  userCurrency
                )} Free Bets Combined)
              </option>
              {bankrolls.map((b) => {
                return (
                  <option key={b.id} value={b.id}>
                    {b.name} ({formatCurrency(b.currentBalance, userCurrency)} Cash + {formatCurrency(b.freeBetCredits, userCurrency)} Free Bets)
                  </option>
                );
              })}
            </select>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-lg shadow-lg transition-all cursor-pointer"
          >
            <Plus size={16} /> Add New Sportsbook
          </button>
        </div>
      </div>

      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-1">
          <div className="flex items-center justify-between text-[#8d90a0] text-xs">
            <span>💵 Real Cash Balance</span>
            <Wallet size={16} className="text-[#2563eb]" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {formatCurrency(overviewMetrics.totalRealBalance, userCurrency)}
          </div>
          <div className="text-[10px] text-[#8d90a0]">
            Allocated to {overviewBankrollId === 'all' ? 'all' : bankrolls.find((b) => b.id === overviewBankrollId)?.name}
          </div>
        </div>

        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-1">
          <div className="flex items-center justify-between text-[#8d90a0] text-xs">
            <span>🎟️ Free Bet Credits</span>
            <Gift size={16} className="text-[#4edea3]" />
          </div>
          <div className="text-2xl font-extrabold text-[#4edea3] font-mono">
            {formatCurrency(overviewMetrics.totalFreeBets, userCurrency)}
          </div>
          <div className="text-[10px] text-[#8d90a0]">Risk-free promo balance</div>
        </div>

        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-1">
          <div className="flex items-center justify-between text-[#8d90a0] text-xs">
            <span>Average Line Juice / Margin</span>
            <Percent size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400 font-mono">
            {overviewMetrics.avgMargin.toFixed(2)}%
          </div>
          <div className="text-[10px] text-[#8d90a0]">Vigorish rating</div>
        </div>

        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-1">
          <div className="flex items-center justify-between text-[#8d90a0] text-xs">
            <span>Combined Net Profit</span>
            <Award size={16} className="text-[#b4c5ff]" />
          </div>
          <div className={`text-2xl font-extrabold font-mono ${overviewMetrics.totalProfit >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
            {overviewMetrics.totalProfit >= 0 ? '+' : ''}{formatCurrency(overviewMetrics.totalProfit, userCurrency)}
          </div>
          <div className="text-[10px] text-[#8d90a0]">
            Total Bankroll Value: <strong className="text-white font-mono">{formatCurrency(overviewMetrics.totalCombined, userCurrency)}</strong>
          </div>
        </div>
      </div>

      {/* Bookmaker Cards Portfolio Grid */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span>Active Bookmaker Portfolio ({overviewBookmakers.length})</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {overviewBookmakers.map((bm) => {
            const bmBets = bets.filter((b) => b.bookmakerId === bm.id && (overviewBankrollId === 'all' || b.bankrollId === overviewBankrollId));
            let totalStaked = 0;
            let totalReturns = 0;
            let wonCount = 0;
            let lostCount = 0;
            let pendingCount = 0;

            bmBets.forEach((b) => {
              totalStaked += b.stake;
              if (b.status === 'pending') pendingCount++;
              else if (b.status === 'won') {
                wonCount++;
                totalReturns += b.actualReturn ?? b.potentialPayout;
              } else if (b.status === 'lost') lostCount++;
              else if (b.status === 'cashout') totalReturns += b.actualReturn ?? 0;
              else if (b.status === 'void') totalReturns += b.stake;
            });

            const settledCount = wonCount + lostCount;
            const netProfit = totalReturns - (totalStaked - (pendingCount * 0));
            const winRate = settledCount > 0 ? (wonCount / settledCount) * 100 : 0;

            // Mini Recent Wager Impact Audit Log (last 2 bets)
            const recentBets = [...bmBets].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 2);

            const { cashBalance, freeBetBalance } = getBookmakerBalanceForBankroll(bm, overviewBankrollId);
            const cardCur = userCurrency;

            return (
              <div
                key={bm.id}
                className="bg-[#171f33] rounded-xl border border-[#27314a] p-5 space-y-4 hover:border-[#2563eb]/60 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Bookmaker Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <BookmakerLogo bookmaker={bm} size="md" />
                      <div>
                        <h4 className="font-bold text-white text-base leading-none">{bm.name}</h4>
                        <span className="text-[10px] font-semibold text-[#8d90a0] block mt-1">
                          {bm.averageMargin <= 3.0 ? 'Sharp (Low Juice)' : 'Standard Book'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs px-2 py-1 rounded bg-[#0b1326] text-amber-400 border border-[#27314a] font-mono font-bold">
                        {bm.averageMargin}% margin
                      </span>
                      {onDeleteBookmaker && (
                        <button
                          onClick={() => {
                            setBookmakerToDelete(bm);
                            setDeleteError(null);
                          }}
                          className="p-1.5 text-[#8d90a0] hover:text-red-400 hover:bg-red-950/40 rounded transition-colors cursor-pointer"
                          title="Delete Sportsbook"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingBookmaker(bm);
                          setEditName(bm.name);
                          setEditLogoUrl(bm.logoUrl || '');
                          setEditColor(bm.color || '#2563eb');
                          setEditMargin(bm.averageMargin || 4.5);
                          setEditLogoSelectMode(bm.logoUrl?.startsWith('data:') ? 'upload' : 'url');
                        }}
                        className="p-1.5 text-[#8d90a0] hover:text-[#2563eb] hover:bg-[#2563eb]/20 rounded transition-colors cursor-pointer"
                        title="Edit Sportsbook Profile"
                      >
                        <Settings size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Distinct Cash & Promo Badges */}
                  <div className="bg-[#0b1326] p-3 rounded-lg border border-[#27314a] grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-[#8d90a0] block">💵 Real Cash</span>
                      <span className="text-lg font-extrabold text-white font-mono">
                        {formatCurrency(cashBalance, cardCur)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#8d90a0] block">🎟️ Free Bet Credits</span>
                      <span className="text-lg font-extrabold text-[#4edea3] font-mono">
                        {formatCurrency(freeBetBalance, cardCur)}
                      </span>
                    </div>
                  </div>

                  {/* Performance Stats */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-[#131b2e] p-2 rounded border border-[#27314a]">
                      <span className="text-[10px] text-[#8d90a0] block">Total Bets</span>
                      <span className="font-bold text-white">{bmBets.length}</span>
                      <span className="text-[9px] text-amber-400 block">({pendingCount} open)</span>
                    </div>
                    <div className="bg-[#131b2e] p-2 rounded border border-[#27314a]">
                      <span className="text-[10px] text-[#8d90a0] block">Win Rate</span>
                      <span className="font-bold text-[#b4c5ff]">{winRate.toFixed(1)}%</span>
                    </div>
                    <div className="bg-[#131b2e] p-2 rounded border border-[#27314a]">
                      <span className="text-[10px] text-[#8d90a0] block">Net Profit</span>
                      <span className={`font-bold font-mono ${netProfit >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
                        {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit, cardCur)}
                      </span>
                    </div>
                  </div>

                  {/* Visual Audit Trail: Recent Wager Impact */}
                  <div className="bg-[#0b1326] p-2.5 rounded-lg border border-[#27314a] space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#8d90a0] block">Recent Wager Impact</span>
                    {recentBets.length === 0 ? (
                      <span className="text-[10px] text-[#8d90a0] italic block">No recent settled bets</span>
                    ) : (
                      recentBets.map((rb) => {
                        let impactTxt = '';
                        if (rb.status === 'won') {
                          const profit = (rb.actualReturn ?? rb.potentialPayout) - rb.stake;
                          impactTxt = `+${formatCurrency(profit, cardCur)} (Won)`;
                        } else if (rb.status === 'lost') {
                          impactTxt = `-${formatCurrency(rb.stake, cardCur)} (Lost)`;
                        } else {
                          impactTxt = `${rb.status.toUpperCase()}`;
                        }
                        const firstLeg = rb.legs[0];
                        return (
                          <div key={rb.id} className="text-[10px] flex items-start justify-between gap-3 text-[#dae2fd] border-b border-[#27314a]/30 pb-2 pt-1.5 last:border-0 last:pb-0 last:pt-0">
                            <div className="min-w-0 flex-1">
                              {firstLeg && (
                                <span className="text-[#8d90a0] text-[9px] block whitespace-normal break-words leading-tight">
                                  {firstLeg.event} {firstLeg.market ? `• ${firstLeg.market}` : ''}
                                </span>
                              )}
                              <span className="text-white font-bold block whitespace-normal break-words text-[11px] mt-0.5">
                                Selection: <span className="text-[#2563eb]">{firstLeg ? formatLegSelection(firstLeg.selection, firstLeg.market) : 'Bet'}</span>
                              </span>
                            </div>
                            <span className={`font-mono font-bold shrink-0 text-right text-[11px] mt-0.5 ${rb.status === 'won' ? 'text-[#4edea3]' : rb.status === 'lost' ? 'text-[#ffb3ad]' : 'text-amber-400'}`}>
                              {impactTxt}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Explore Performance & Management Action Buttons */}
                <div className="pt-3 border-t border-[#27314a] flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedBookmakerId(bm.id);
                      setDetailBankrollId(overviewBankrollId);
                    }}
                    className="flex-1 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow"
                  >
                    <BarChart2 size={14} /> Performance <ChevronRight size={14} />
                  </button>

                  <button
                    onClick={() => {
                      setReconcileBmTarget(bm);
                      setReconcileBmCash(cashBalance.toString());
                      setReconcileBmFreeBet(freeBetBalance.toString());
                      setReconcileBmNotes('');
                    }}
                    className="p-2 bg-[#0b1326] hover:bg-[#1f283d] text-[#2563eb] border border-[#27314a] rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                    title="Manual Balance Reconciliation Adjustment"
                  >
                    <RefreshCw size={14} />
                  </button>

                  <button
                    onClick={() => {
                      setSelectedBookmakerForTx(bm);
                      setTxType('deposit');
                      setTxBankrollId(overviewBankrollId !== 'all' ? overviewBankrollId : (activeBankrollId || bankrolls[0]?.id || ''));
                    }}
                    className="p-2 bg-[#0b1326] hover:bg-[#1f283d] text-[#dae2fd] border border-[#27314a] rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                    title="Deposit / Withdraw funds"
                  >
                    <Wallet size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deposit / Withdraw Modal */}
      {selectedBookmakerForTx && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#171f33] border border-[#27314a] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              Funds Transaction: {selectedBookmakerForTx.name}
            </h3>

            <div className="flex gap-2 p-1 bg-[#0b1326] rounded-lg border border-[#27314a] text-xs">
              <button
                type="button"
                onClick={() => setTxType('deposit')}
                className={`flex-1 py-1.5 rounded font-bold transition-colors ${txType === 'deposit' ? 'bg-[#2563eb] text-white' : 'text-[#8d90a0]'}`}
              >
                Deposit
              </button>
              <button
                type="button"
                onClick={() => setTxType('withdraw')}
                className={`flex-1 py-1.5 rounded font-bold transition-colors ${txType === 'withdraw' ? 'bg-[#2563eb] text-white' : 'text-[#8d90a0]'}`}
              >
                Withdrawal
              </button>
              <button
                type="button"
                onClick={() => setTxType('freebet')}
                className={`flex-1 py-1.5 rounded font-bold transition-colors ${txType === 'freebet' ? 'bg-[#2563eb] text-white' : 'text-[#8d90a0]'}`}
              >
                + Free Bet
              </button>
            </div>

            <form onSubmit={handleExecuteTx} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#8d90a0] mb-1">Target Bankroll</label>
                <select
                  value={txBankrollId}
                  onChange={(e) => setTxBankrollId(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white text-xs"
                  required
                >
                  {bankrolls.map((br) => (
                    <option key={br.id} value={br.id}>
                      {br.name} ({userCurrency})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">
                  {txType === 'deposit' ? `Deposit Amount (${getCurrencySymbol(userCurrency)})` : txType === 'withdraw' ? `Withdrawal Amount (${getCurrencySymbol(userCurrency)})` : `Free Bet Promo Credit (${getCurrencySymbol(userCurrency)})`}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono text-sm"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedBookmakerForTx(null)}
                  className="flex-1 py-2 bg-[#0b1326] text-[#8d90a0] rounded-lg hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#2563eb] text-white font-bold rounded-lg shadow"
                >
                  Confirm Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Sportsbook Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#171f33] border border-[#27314a] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Register New Sportsbook</h3>

            <form onSubmit={handleCreateBookmaker} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#8d90a0] mb-1">Bookmaker Name</label>
                <input
                  type="text"
                  placeholder="e.g. Pinnacle, FanDuel, DraftKings"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Target Bankroll Segment</label>
                <select
                  value={newBankrollId}
                  onChange={(e) => setNewBankrollId(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                >
                  {bankrolls.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({formatCurrency(b.currentBalance, userCurrency)} Cash)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#8d90a0] mb-1">Initial Balance ({getCurrencySymbol(userCurrency)})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newRealBalance}
                    onChange={(e) => setNewRealBalance(Number(e.target.value))}
                    className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#8d90a0] mb-1">Free Bet Credits ({getCurrencySymbol(userCurrency)})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newFreeBetBalance}
                    onChange={(e) => setNewFreeBetBalance(Number(e.target.value))}
                    className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Estimated Line Juice / Margin %</label>
                <input
                  type="number"
                  step="0.1"
                  value={newMargin}
                  onChange={(e) => setNewMargin(Number(e.target.value))}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Bookmaker Logo</label>
                <div className="flex gap-2 p-1 bg-[#0b1326] border border-[#27314a] rounded-lg mb-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setLogoSelectMode('url')}
                    className={`flex-1 py-1 rounded font-bold transition-colors ${logoSelectMode === 'url' ? 'bg-[#2563eb] text-white' : 'text-[#8d90a0] hover:text-white'}`}
                  >
                    Image URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogoSelectMode('upload')}
                    className={`flex-1 py-1 rounded font-bold transition-colors ${logoSelectMode === 'upload' ? 'bg-[#2563eb] text-white' : 'text-[#8d90a0] hover:text-white'}`}
                  >
                    Upload File
                  </button>
                </div>

                {logoSelectMode === 'url' ? (
                  <input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    value={newLogoUrl}
                    onChange={(e) => setNewLogoUrl(e.target.value)}
                    className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-[#2563eb]"
                  />
                ) : (
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={(e) => handleDrop(e, false)}
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors relative ${
                      dragActive ? 'border-[#2563eb] bg-[#2563eb]/5' : 'border-[#27314a] bg-[#0b1326] hover:border-[#2563eb]/50'
                    }`}
                  >
                    <Upload size={16} className="mx-auto text-[#2563eb] mb-1" />
                    <p className="text-[10px] text-[#8d90a0]">
                      Drag & drop logo, or <span className="text-white font-semibold underline">browse</span>
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, false)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                )}

                {/* Real-time thumbnail preview with Reset/Remove button */}
                {newLogoUrl && (
                  <div className="mt-2 p-1.5 bg-[#0b1326] border border-[#27314a] rounded-lg flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <BookmakerLogo bookmaker={{ name: newName || 'Preview', logoUrl: newLogoUrl, color: newColor }} size="sm" />
                      <span className="text-[10px] text-[#8d90a0] truncate max-w-[150px]">
                        {newLogoUrl.startsWith('data:') ? 'Local Base64 File' : newLogoUrl}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewLogoUrl('')}
                      className="px-2 py-1 text-[10px] bg-red-950/40 hover:bg-red-900/60 text-red-200 border border-red-900/50 rounded font-bold cursor-pointer"
                    >
                      Reset Logo
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Accent Theme Color</label>
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-full h-8 bg-[#0b1326] border border-[#27314a] rounded cursor-pointer"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 bg-[#0b1326] text-[#8d90a0] rounded-lg hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#2563eb] text-white font-bold rounded-lg shadow"
                >
                  Save Sportsbook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Sportsbook Confirmation Modal */}
      {bookmakerToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#171f33] border border-red-900/60 rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold text-white">Delete Sportsbook: {bookmakerToDelete.name}</h3>
            </div>

            {(() => {
              const pendingCount = bets.filter((b) => b.bookmakerId === bookmakerToDelete.id && b.status === 'pending').length;
              
              if (pendingCount > 0) {
                return (
                  <div className="space-y-4 text-xs">
                    <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 rounded-lg flex items-start gap-2">
                      <ShieldAlert size={20} className="shrink-0 text-red-400 mt-0.5" />
                      <div>
                        <strong className="block text-white font-bold">Deletion Blocked!</strong>
                        Cannot delete <strong className="text-white">{bookmakerToDelete.name}</strong> because it currently has <strong className="text-white">{pendingCount} active open wager(s)</strong> attached to it.
                      </div>
                    </div>

                    <p className="text-[#8d90a0]">
                      Please settle, cashout, or void all open bets for this sportsbook before attempting deletion to prevent financial balance inconsistencies.
                    </p>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setBookmakerToDelete(null)}
                        className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold rounded-lg shadow cursor-pointer"
                      >
                        Got It
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-4 text-xs">
                  <p className="text-[#8d90a0]">
                    Are you sure you want to permanently delete <strong className="text-white">{bookmakerToDelete.name}</strong>?
                    This will remove the sportsbook entry and unassign its historical settled bets.
                  </p>

                  <div className="p-3 bg-[#0b1326] rounded-lg border border-[#27314a] space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between text-[#8d90a0]">
                      <span>Cash Balance:</span>
                      <span className="text-white font-bold">{formatCurrency(bookmakerToDelete.realBalance, userCurrency)}</span>
                    </div>
                    <div className="flex justify-between text-[#8d90a0]">
                      <span>Free Bet Credits:</span>
                      <span className="text-[#4edea3] font-bold">{formatCurrency(bookmakerToDelete.freeBetBalance, userCurrency)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-[#27314a]">
                    <button
                      type="button"
                      onClick={() => setBookmakerToDelete(null)}
                      className="flex-1 py-2 bg-[#0b1326] text-[#8d90a0] rounded-lg hover:text-white transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onDeleteBookmaker) {
                          onDeleteBookmaker(bookmakerToDelete.id);
                        }
                        setBookmakerToDelete(null);
                      }}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition-colors cursor-pointer"
                    >
                      Permanently Delete
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Reconcile Sportsbook Balance Modal */}
      {reconcileBmTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#171f33] border border-[#27314a] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#27314a] pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <RefreshCw size={18} className="text-[#2563eb]" />
                <span>Reconcile {reconcileBmTarget.name}</span>
              </h3>
              <button
                onClick={() => setReconcileBmTarget(null)}
                className="text-[#8d90a0] hover:text-white transition-colors cursor-pointer"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
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
                  Current: {formatCurrency(reconcileBmTarget.realBalance, userCurrency)} (Variance: {formatCurrency(parseFloat(reconcileBmCash) - reconcileBmTarget.realBalance, userCurrency)})
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
                  Current: {formatCurrency(reconcileBmTarget.freeBetBalance, userCurrency)} (Variance: {formatCurrency(parseFloat(reconcileBmFreeBet) - reconcileBmTarget.freeBetBalance, userCurrency)})
                </span>
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1 font-medium">Adjustment Audit Note</label>
                <input
                  type="text"
                  placeholder="e.g. Discrepancy correction or sportsbook fee adjustment"
                  value={reconcileBmNotes}
                  onChange={(e) => setReconcileBmNotes(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#27314a]">
              <button
                type="button"
                onClick={() => setReconcileBmTarget(null)}
                className="flex-1 py-2 bg-[#0b1326] text-[#8d90a0] rounded-lg hover:text-white transition-colors cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onReconcileBookmaker) {
                    const targetB = overviewBankrollId === 'all' ? (activeBankrollId || bankrolls[0]?.id) : overviewBankrollId;
                    if (!targetB) {
                      alert('Error: No active bankroll selected to attribute this adjustment to.');
                      return;
                    }
                    onReconcileBookmaker(reconcileBmTarget.id, parseFloat(reconcileBmCash) || 0, parseFloat(reconcileBmFreeBet) || 0, reconcileBmNotes, targetB);
                  }
                  setReconcileBmTarget(null);
                }}
                className="flex-1 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold rounded-lg shadow transition-colors cursor-pointer text-xs"
              >
                Save Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Sportsbook Profile Modal */}
      {editingBookmaker && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateBookmakerSubmit}
            className="bg-[#171f33] border border-[#27314a] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#27314a] pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings size={18} className="text-[#2563eb]" />
                <span>Edit Sportsbook Profile</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingBookmaker(null)}
                className="text-[#8d90a0] hover:text-white transition-colors cursor-pointer"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[#8d90a0] mb-1">Sportsbook Name</label>
                <input
                  type="text"
                  placeholder="e.g. Pinnacle"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Estimated Line Juice / Margin %</label>
                <input
                  type="number"
                  step="0.1"
                  value={editMargin}
                  onChange={(e) => setEditMargin(Number(e.target.value))}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Bookmaker Logo</label>
                <div className="flex gap-2 p-1 bg-[#0b1326] border border-[#27314a] rounded-lg mb-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setEditLogoSelectMode('url')}
                    className={`flex-1 py-1 rounded font-bold transition-colors ${editLogoSelectMode === 'url' ? 'bg-[#2563eb] text-white' : 'text-[#8d90a0] hover:text-white'}`}
                  >
                    Image URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditLogoSelectMode('upload')}
                    className={`flex-1 py-1 rounded font-bold transition-colors ${editLogoSelectMode === 'upload' ? 'bg-[#2563eb] text-white' : 'text-[#8d90a0] hover:text-white'}`}
                  >
                    Upload File
                  </button>
                </div>

                {editLogoSelectMode === 'url' ? (
                  <input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    value={editLogoUrl}
                    onChange={(e) => setEditLogoUrl(e.target.value)}
                    className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-[#2563eb]"
                  />
                ) : (
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={(e) => handleDrop(e, true)}
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors relative ${
                      editDragActive ? 'border-[#2563eb] bg-[#2563eb]/5' : 'border-[#27314a] bg-[#0b1326] hover:border-[#2563eb]/50'
                    }`}
                  >
                    <Upload size={16} className="mx-auto text-[#2563eb] mb-1" />
                    <p className="text-[10px] text-[#8d90a0]">
                      Drag & drop logo, or <span className="text-white font-semibold underline">browse</span>
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, true)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                )}

                {/* Real-time thumbnail preview with Reset/Remove button */}
                {editLogoUrl && (
                  <div className="mt-2 p-1.5 bg-[#0b1326] border border-[#27314a] rounded-lg flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <BookmakerLogo bookmaker={{ name: editName || 'Preview', logoUrl: editLogoUrl, color: editColor }} size="sm" />
                      <span className="text-[10px] text-[#8d90a0] truncate max-w-[150px]">
                        {editLogoUrl.startsWith('data:') ? 'Local Base64 File' : editLogoUrl}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditLogoUrl('')}
                      className="px-2 py-1 text-[10px] bg-red-950/40 hover:bg-red-900/60 text-red-200 border border-red-900/50 rounded font-bold cursor-pointer"
                    >
                      Reset Logo
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[#8d90a0] mb-1">Accent Theme Color</label>
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-full h-8 bg-[#0b1326] border border-[#27314a] rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#27314a]">
              <button
                type="button"
                onClick={() => setEditingBookmaker(null)}
                className="flex-1 py-2 bg-[#0b1326] text-[#8d90a0] rounded-lg hover:text-white transition-colors cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold rounded-lg shadow transition-colors cursor-pointer text-xs"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
