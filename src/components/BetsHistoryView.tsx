import React, { useState, useMemo, useEffect } from 'react';
import { Bet, Bankroll, Bookmaker, BetStatus, SportType, BetType, TagDefinition, Tipster } from '../types';
import { formatCurrency, formatOdds, getCurrencySymbol } from '../utils/storage';
import { formatEventDate, getRepresentativeEventDateTimestamp, formatLegSelection, formatBetDateTime } from '../utils/dateUtils';
import { betsApi } from '../utils/api';
import { BookmakerLogo } from './BookmakerLogo';
import {
  Search,
  Filter,
  Download,
  Calendar,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  DollarSign,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
  RefreshCw,
  Trophy,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Radio,
  Camera,
  Image as ImageIcon,
  Users,
  Loader2
} from 'lucide-react';

interface BetsHistoryViewProps {
  bets: Bet[];
  bankrolls: Bankroll[];
  bookmakers: Bookmaker[];
  tagDefinitions: TagDefinition[];
  tipsters?: Tipster[];
  activeBankrollId?: string;
  userCurrency?: string;
  onUpdateBetStatus: (
    betId: string,
    status: BetStatus,
    actualReturn?: number
  ) => void;
  onUpdateBetLegStatus?: (
    betId: string,
    legId: string,
    status: BetStatus
  ) => void;
  onNavigate: (tab: string) => void;
  onDeleteBet?: (betId: string) => void;
}

export const BetsHistoryView: React.FC<BetsHistoryViewProps> = ({
  bets,
  bankrolls,
  bookmakers,
  tagDefinitions,
  tipsters = [],
  activeBankrollId,
  userCurrency,
  onUpdateBetStatus,
  onUpdateBetLegStatus,
  onNavigate,
  onDeleteBet
}) => {
  // Filter States
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [bookmakerFilter, setBookmakerFilter] = useState<string>('all');
  const [bankrollFilter, setBankrollFilter] = useState<string>(activeBankrollId || bankrolls[0]?.id || 'all');
  const [userChangedBankroll, setUserChangedBankroll] = useState<boolean>(false);

  useEffect(() => {
    if (activeBankrollId && !userChangedBankroll) {
      setBankrollFilter(activeBankrollId);
    }
  }, [activeBankrollId]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [liveFilter, setLiveFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [selectedTagsFilter, setSelectedTagsFilter] = useState<string[]>([]);
  const [tipsterFilter, setTipsterFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'event-date-asc' | 'event-date-desc' | 'stake-desc' | 'odds-desc' | 'profit-desc'>('date-desc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  useEffect(() => {
    if (window.innerWidth < 768) {
      setViewMode('cards');
    }
  }, []);

  // Expanded legs state & Lightbox state
  const [expandedBetIds, setExpandedBetIds] = useState<Set<string>>(new Set());
  const [lightboxBet, setLightboxBet] = useState<Bet | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState<boolean>(false);

  // Pagination state (limit = 8)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [serverBets, setServerBets] = useState<Bet[] | null>(null);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalBets, setTotalBets] = useState<number>(0);
  const [loadingPaginated, setLoadingPaginated] = useState<boolean>(false);

  const fetchPaginatedBets = React.useCallback(async (page: number) => {
    setLoadingPaginated(true);
    try {
      const bankrollId = bankrollFilter !== 'all' ? bankrollFilter : undefined;
      let startDate: string | undefined;
      let endDate: string | undefined;

      if (dateRange !== 'all') {
        const now = new Date();
        if (dateRange === 'today') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        } else if (dateRange === '7days') {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (dateRange === '30days') {
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        }
      }

      const res = await betsApi.listPaginated({
        page,
        limit: 8,
        bankrollId,
        startDate,
        endDate,
      });

      setServerBets(res.bets || []);
      setTotalPages(res.totalPages || 1);
      setTotalBets(res.totalBets || 0);
      setCurrentPage(res.currentPage || page);
    } catch (err) {
      console.error('Error fetching paginated bets:', err);
    } finally {
      setLoadingPaginated(false);
    }
  }, [bankrollFilter, dateRange]);

  useEffect(() => {
    fetchPaginatedBets(currentPage);
  }, [currentPage, bankrollFilter, dateRange, fetchPaginatedBets]);

  useEffect(() => {
    setCurrentPage(1);
  }, [bankrollFilter, dateRange]);

  useEffect(() => {
    if (!lightboxBet) {
      setLightboxImage(null);
      setLoadingImage(false);
      return;
    }

    const cachedImg = lightboxBet.imageUrl || lightboxBet.scannedSlipUrl;
    if (cachedImg && cachedImg !== 'attached' && cachedImg.length > 50) {
      setLightboxImage(cachedImg);
    } else {
      setLoadingImage(true);
      betsApi.getBetImage(lightboxBet.id)
        .then((res) => {
          setLightboxImage(res.imageUrl || res.scannedSlipUrl || null);
        })
        .catch((err) => {
          console.error('Failed to fetch bet image:', err);
          setLightboxImage(null);
        })
        .finally(() => {
          setLoadingImage(false);
        });
    }
  }, [lightboxBet]);

  // Settlement Modal state
  const [settlementBet, setSettlementBet] = useState<Bet | null>(null);
  const [customReturnInput, setCustomReturnInput] = useState<number>(0);

  const toggleExpand = (betId: string) => {
    setExpandedBetIds((prev) => {
      const next = new Set(prev);
      if (next.has(betId)) {
        next.delete(betId);
      } else {
        next.add(betId);
      }
      return next;
    });
  };

  // Filtered Bets Computation
  const filteredBets = useMemo(() => {
    const sourceList = serverBets !== null ? serverBets : bets;
    const filtered = sourceList.filter((bet) => {
      // Search term filter
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchesLeg = bet.legs.some(
          (leg) =>
            leg.event.toLowerCase().includes(query) ||
            leg.selection.toLowerCase().includes(query) ||
            leg.market.toLowerCase().includes(query) ||
            (leg.league && leg.league.toLowerCase().includes(query))
        );
        const matchesNotes = bet.notes?.toLowerCase().includes(query);
        const matchesBookmaker = bookmakers.find((bm) => bm.id === bet.bookmakerId)?.name.toLowerCase().includes(query);

        if (!matchesLeg && !matchesNotes && !matchesBookmaker) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && bet.status !== statusFilter) return false;

      // Sport filter
      if (sportFilter !== 'all') {
        const hasSport = bet.legs.some((leg) => leg.sport === sportFilter);
        if (!hasSport) return false;
      }

      // Bookmaker filter
      if (bookmakerFilter !== 'all' && bet.bookmakerId !== bookmakerFilter) return false;

      // Bankroll filter
      if (bankrollFilter !== 'all' && bet.bankrollId !== bankrollFilter) return false;

      // Type filter
      if (typeFilter !== 'all' && bet.type !== typeFilter) return false;

      // Live filter
      if (liveFilter === 'live' && !bet.isLive) return false;
      if (liveFilter === 'pre' && bet.isLive) return false;

      // Date range filter
      if (dateRange !== 'all') {
        const betDate = getRepresentativeEventDateTimestamp(bet);
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;

        if (dateRange === 'today') {
          if (now - betDate > dayMs) return false;
        } else if (dateRange === '7days') {
          if (now - betDate > 7 * dayMs) return false;
        } else if (dateRange === '30days') {
          if (now - betDate > 30 * dayMs) return false;
        }
      }

      // Tipster filter
      if (tipsterFilter !== 'all') {
        if (tipsterFilter === '__MY_OWN_PICKS__') {
          if (bet.tipsterId) return false;
        } else {
          if (bet.tipsterId !== tipsterFilter) return false;
        }
      }

      // Tag filter
      if (selectedTagsFilter.length > 0) {
        if (!bet.tags) return false;
        
        let tagsList: string[] = [];
        if (Array.isArray(bet.tags)) {
          tagsList = bet.tags.map(t => typeof t === 'string' ? t : (t as any)?.name || String(t));
        } else if (typeof bet.tags === 'string') {
          try {
            const parsed = JSON.parse(bet.tags);
            if (Array.isArray(parsed)) {
              tagsList = parsed.map(t => typeof t === 'string' ? t : (t as any)?.name || String(t));
            } else {
              tagsList = [bet.tags];
            }
          } catch {
            tagsList = [bet.tags];
          }
        }

        const matchesTag = tagsList.some((t) => {
          if (!t) return false;
          const cleanT = String(t).trim().toLowerCase();
          return selectedTagsFilter.some((ft) => ft.trim().toLowerCase() === cleanT);
        });

        if (!matchesTag) return false;
      }

      return true;
    });

    // Pre-calculate sort keys to avoid expensive calls during sort
    const betsWithKeys = filtered.map(bet => ({
      bet,
      timestamp: getRepresentativeEventDateTimestamp(bet),
      profit: (() => {
        if (bet.status === 'won') return (bet.actualReturn ?? bet.potentialPayout) - bet.stake;
        if (bet.status === 'lost') return -bet.stake;
        if (bet.status === 'cashout') return (bet.actualReturn ?? 0) - bet.stake;
        return 0;
      })()
    }));

    betsWithKeys.sort((a, b) => {
      if (sortBy === 'date-desc') return b.timestamp - a.timestamp;
      if (sortBy === 'date-asc') return a.timestamp - b.timestamp;
      if (sortBy === 'event-date-asc') return a.timestamp - b.timestamp;
      if (sortBy === 'event-date-desc') return b.timestamp - a.timestamp;
      if (sortBy === 'stake-desc') return b.bet.stake - a.bet.stake;
      if (sortBy === 'odds-desc') return b.bet.totalOdds - a.bet.totalOdds;
      if (sortBy === 'profit-desc') return b.profit - a.profit;
      return 0;
    });

    return betsWithKeys.map((bk: any) => bk.bet);
  }, [
    serverBets,
    bets,
    searchTerm,
    statusFilter,
    sportFilter,
    bookmakerFilter,
    bankrollFilter,
    typeFilter,
    liveFilter,
    dateRange,
    selectedTagsFilter,
    tipsterFilter,
    sortBy,
    bookmakers,
    tagDefinitions,
    tipsters
  ]);

  // Derived metrics for pagination and displayed slice
  const hasClientFilters =
    Boolean(searchTerm) ||
    statusFilter !== 'all' ||
    sportFilter !== 'all' ||
    bookmakerFilter !== 'all' ||
    typeFilter !== 'all' ||
    liveFilter !== 'all' ||
    tipsterFilter !== 'all' ||
    selectedTagsFilter.length > 0;

  const effectiveTotalBets =
    serverBets !== null && !hasClientFilters
      ? totalBets || serverBets.length
      : filteredBets.length;

  const effectiveTotalPages = Math.ceil(effectiveTotalBets / 8) || 1;

  // Sliced bets array for current page view display
  const displayedBets = useMemo(() => {
    // If backend provided a server-paginated array for current page and no extra client filters are active, use directly
    if (serverBets !== null && !hasClientFilters && filteredBets.length <= 8) {
      return filteredBets;
    }
    // Perform exact client-side array slice: bets.slice((currentPage - 1) * limit, currentPage * limit)
    const start = (currentPage - 1) * 8;
    return filteredBets.slice(start, start + 8);
  }, [filteredBets, serverBets, currentPage, hasClientFilters]);

  // Statistics for filtered list
  const metrics = useMemo(() => {
    let totalStaked = 0;
    let totalReturns = 0;
    let pendingStake = 0;
    let wonCount = 0;
    let lostCount = 0;
    let settledCount = 0;

    filteredBets.forEach((bet) => {
      totalStaked += bet.stake;
      if (bet.status === 'pending') {
        pendingStake += bet.stake;
      } else if (bet.status === 'won') {
        const ret = bet.actualReturn ?? bet.potentialPayout;
        totalReturns += ret;
        wonCount++;
        settledCount++;
      } else if (bet.status === 'lost') {
        lostCount++;
        settledCount++;
      } else if (bet.status === 'cashout') {
        totalReturns += bet.actualReturn ?? 0;
        settledCount++;
      } else if (bet.status === 'void') {
        totalReturns += bet.stake;
        settledCount++;
      }
    });

    const netProfit = totalReturns - (totalStaked - pendingStake);
    const roi = (totalStaked - pendingStake) > 0 ? (netProfit / (totalStaked - pendingStake)) * 100 : 0;
    const winRate = settledCount > 0 ? (wonCount / settledCount) * 100 : 0;

    return {
      totalWagers: filteredBets.length,
      totalStaked,
      totalReturns,
      pendingStake,
      netProfit,
      roi,
      winRate,
      wonCount,
      lostCount,
      settledCount
    };
  }, [filteredBets]);

  const handleOpenSettlement = (bet: Bet) => {
    setSettlementBet(bet);
    setCustomReturnInput(bet.status === 'cashout' ? (bet.actualReturn || bet.potentialPayout * 0.5) : bet.potentialPayout);
  };

  const handleConfirmSettlement = (status: BetStatus) => {
    if (!settlementBet) return;
    let ret: number | undefined = undefined;
    if (status === 'won') ret = settlementBet.potentialPayout;
    else if (status === 'lost') ret = 0;
    else if (status === 'void') ret = settlementBet.stake;
    else if (status === 'cashout') ret = customReturnInput;

    onUpdateBetStatus(settlementBet.id, status, ret);
    setSettlementBet(null);
    setTimeout(() => {
      fetchPaginatedBets(currentPage);
    }, 150);
  };

  const exportFilteredCSV = () => {
    const headers = ['Date', 'Type', 'Sport', 'Event/Selection', 'Odds', 'Stake', 'Potential Payout', 'Actual Return', 'Status', 'Bookmaker', 'Live', 'Free Bet', 'Notes'];
    const rows = filteredBets.map((b) => {
      const bmName = bookmakers.find((bm) => bm.id === b.bookmakerId)?.name || 'Unknown';
      const eventDesc = b.legs.map((l: any) => `${l.event} (${l.selection} @ ${l.odds})`).join(' | ');
      return [
        formatBetDateTime(b),
        b.type.toUpperCase(),
        b.legs[0]?.sport || 'Other',
        `"${eventDesc.replace(/"/g, '""')}"`,
        b.totalOdds,
        b.stake,
        b.potentialPayout,
        b.actualReturn ?? (b.status === 'won' ? b.potentialPayout : 0),
        b.status.toUpperCase(),
        `"${bmName}"`,
        b.isLive ? 'YES' : 'NO',
        b.isFreeBet ? 'YES' : 'NO',
        `"${(b.notes || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BetLogic_History_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#171f33] p-5 rounded-xl border border-[#27314a]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="text-[#2563eb]" />
              <span>Complete Betting History & Audit Trail</span>
            </h2>
            <span className="text-xs bg-[#2563eb]/20 text-[#b4c5ff] px-2 py-0.5 rounded-full border border-[#2563eb]/30 font-semibold">
              {metrics.totalWagers} Records
            </span>
          </div>
          <p className="text-sm text-[#8d90a0] mt-1">
            Search, filter, settle, and export historical sports wagers with full parlay leg breakdowns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('scanner')}
            className="px-3.5 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg shadow transition-all flex items-center gap-2 cursor-pointer"
          >
            <Radio size={16} /> Scan Slip OCR
          </button>
          <button
            onClick={() => onNavigate('entry')}
            className="px-3.5 py-2 bg-[#171f33] hover:bg-[#222a3d] border border-[#27314a] text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer"
          >
            <DollarSign size={16} className="text-[#4edea3]" /> Log Manual Bet
          </button>
          <button
            onClick={exportFilteredCSV}
            className="px-3.5 py-2 bg-[#0b1326] hover:bg-[#1f283d] border border-[#27314a] text-[#b4c5ff] text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer"
            title="Export filtered bets to CSV"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Metrics Bar for Filtered Results */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a]">
          <span className="text-[11px] text-[#8d90a0] font-medium block">Total Filtered Staked</span>
          <div className="text-lg font-extrabold text-white font-mono mt-1">
            {formatCurrency(metrics.totalStaked)}
          </div>
          <span className="text-[10px] text-[#8d90a0]">Across {metrics.totalWagers} bets</span>
        </div>

        <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a]">
          <span className="text-[11px] text-[#8d90a0] font-medium block">Net Profit / Loss</span>
          <div className={`text-lg font-extrabold font-mono mt-1 ${metrics.netProfit >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
            {metrics.netProfit >= 0 ? '+' : ''}{formatCurrency(metrics.netProfit)}
          </div>
          <span className="text-[10px] text-[#8d90a0]">Settled wagers return</span>
        </div>

        <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a]">
          <span className="text-[11px] text-[#8d90a0] font-medium block">ROI %</span>
          <div className={`text-lg font-extrabold font-mono mt-1 ${metrics.roi >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
            {metrics.roi >= 0 ? '+' : ''}{metrics.roi.toFixed(1)}%
          </div>
          <span className="text-[10px] text-[#8d90a0]">Yield on stake</span>
        </div>

        <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a]">
          <span className="text-[11px] text-[#8d90a0] font-medium block">Win Rate %</span>
          <div className="text-lg font-extrabold text-[#b4c5ff] font-mono mt-1">
            {metrics.winRate.toFixed(1)}%
          </div>
          <span className="text-[10px] text-[#8d90a0]">{metrics.wonCount} W / {metrics.lostCount} L</span>
        </div>

        <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a]">
          <span className="text-[11px] text-[#8d90a0] font-medium block">Pending Exposure</span>
          <div className="text-lg font-extrabold text-amber-400 font-mono mt-1">
            {formatCurrency(metrics.pendingStake)}
          </div>
          <span className="text-[10px] text-[#8d90a0]">{metrics.totalWagers - metrics.settledCount} Open Bets</span>
        </div>

        <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a]">
          <span className="text-[11px] text-[#8d90a0] font-medium block">Total Returns</span>
          <div className="text-lg font-extrabold text-white font-mono mt-1">
            {formatCurrency(metrics.totalReturns)}
          </div>
          <span className="text-[10px] text-[#8d90a0]">Gross payouts collected</span>
        </div>
      </div>

      {/* Filter Control Console */}
      <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 text-[#8d90a0]" size={16} />
            <input
              type="text"
              placeholder="Search teams, selections, markets, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-[#8d90a0] focus:outline-none focus:border-[#2563eb]"
            />
          </div>

          {/* Quick Status Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {['all', 'pending', 'won', 'lost', 'cashout', 'void'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === st
                    ? st === 'won'
                      ? 'bg-[#005236] text-[#4edea3] border border-[#008f5d]'
                      : st === 'lost'
                      ? 'bg-[#601410] text-[#ffb3ad] border border-[#93231e]'
                      : st === 'pending'
                      ? 'bg-amber-950 text-amber-400 border border-amber-700'
                      : 'bg-[#2563eb] text-white border border-[#3b82f6]'
                    : 'bg-[#0b1326] text-[#8d90a0] hover:text-white border border-[#27314a]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Table / Card toggle */}
          <div className="flex items-center gap-1 bg-[#0b1326] p-1 rounded-lg border border-[#27314a]">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${viewMode === 'table' ? 'bg-[#2563eb] text-white' : 'text-[#8d90a0] hover:text-white'}`}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${viewMode === 'cards' ? 'bg-[#2563eb] text-white' : 'text-[#8d90a0] hover:text-white'}`}
            >
              Card View
            </button>
          </div>
        </div>

        {/* Extended Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 pt-2 border-t border-[#27314a] text-xs">
          {/* Sport Filter */}
          <div>
            <label className="block text-[10px] text-[#8d90a0] mb-1">Sport</label>
            <select
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2.5 py-1.5 text-white"
            >
              <option value="all">All Sports</option>
              <option value="Football">Football</option>
              <option value="Basketball">Basketball</option>
              <option value="Tennis">Tennis</option>
              <option value="Baseball">Baseball</option>
              <option value="Ice Hockey">Ice Hockey</option>
              <option value="Esports">Esports</option>
              <option value="MMA">MMA</option>
              <option value="Golf">Golf</option>
            </select>
          </div>

          {/* Bookmaker Filter */}
          <div>
            <label className="block text-[10px] text-[#8d90a0] mb-1">Bookmaker</label>
            <select
              value={bookmakerFilter}
              onChange={(e) => setBookmakerFilter(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2.5 py-1.5 text-white"
            >
              <option value="all">All Sportsbooks</option>
              {bookmakers.map((bm) => (
                <option key={bm.id} value={bm.id}>
                  {bm.name}
                </option>
              ))}
            </select>
          </div>

          {/* Bankroll Filter */}
          <div>
            <label className="block text-[10px] text-[#8d90a0] mb-1">Bankroll</label>
            <select
              value={bankrollFilter}
              onChange={(e) => {
                setUserChangedBankroll(true);
                setBankrollFilter(e.target.value);
              }}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2.5 py-1.5 text-white"
            >
              <option value="all">All Bankrolls</option>
              {bankrolls.map((br) => (
                <option key={br.id} value={br.id}>
                  {br.name}
                </option>
              ))}
            </select>
          </div>

          {/* Bet Type Filter */}
          <div>
            <label className="block text-[10px] text-[#8d90a0] mb-1">Bet Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2.5 py-1.5 text-white"
            >
              <option value="all">All Types</option>
              <option value="single">Single Bet</option>
              <option value="parlay">Multi Parlay</option>
              <option value="bet_builder">Same Game Builder</option>
            </select>
          </div>

          {/* Live / Pre-match */}
          <div>
            <label className="block text-[10px] text-[#8d90a0] mb-1">In-Play / Pre</label>
            <select
              value={liveFilter}
              onChange={(e) => setLiveFilter(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2.5 py-1.5 text-white"
            >
              <option value="all">All Timing</option>
              <option value="live">⚡ Live In-Play</option>
              <option value="pre">📅 Pre-Match</option>
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-[10px] text-[#8d90a0] mb-1">Timeframe</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2.5 py-1.5 text-white"
            >
              <option value="all">All-Time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>
          </div>

          {/* Strategy Tag Filter */}
          <div>
            <label className="block text-[10px] text-[#8d90a0] mb-1">Strategy Tag</label>
            <select
              value={selectedTagsFilter.length === 1 ? selectedTagsFilter[0] : 'all'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'all') {
                  setSelectedTagsFilter([]);
                } else {
                  setSelectedTagsFilter([val]);
                }
              }}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2.5 py-1.5 text-white"
            >
              <option value="all">All Tags</option>
              {tagDefinitions.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tipster Source Filter */}
          <div>
            <label className="block text-[10px] text-[#8d90a0] mb-1">Tipster Source</label>
            <select
              value={tipsterFilter}
              onChange={(e) => setTipsterFilter(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded px-2.5 py-1.5 text-white"
            >
              <option value="all">All Sources</option>
              <option value="__MY_OWN_PICKS__">👤 My Own Picks</option>
              {tipsters.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.platform || 'General'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Multi-Tag & Tipster Chips Selector */}
        {(tagDefinitions.length > 0 || tipsters.length > 0) && (
          <div className="pt-2 space-y-2 border-t border-[#27314a]/30">
            {tagDefinitions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-[#8d90a0] font-bold uppercase tracking-wider min-w-[90px]">Strategy Filter:</span>
                <div className="flex flex-wrap gap-1.5">
                  {tagDefinitions.map((tag) => {
                    const isSelected = selectedTagsFilter.includes(tag.name);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedTagsFilter(selectedTagsFilter.filter((t) => t !== tag.name));
                          } else {
                            setSelectedTagsFilter([...selectedTagsFilter, tag.name]);
                          }
                        }}
                        style={{
                          borderColor: isSelected ? tag.color : '#27314a',
                          backgroundColor: isSelected ? `${tag.color}20` : '#0b1326',
                          color: isSelected ? '#ffffff' : '#8d90a0',
                        }}
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all cursor-pointer hover:text-white"
                      >
                        {isSelected && <span className="inline-block mr-1 text-white">✓</span>}
                        {tag.name}
                      </button>
                    );
                  })}
                  {selectedTagsFilter.length > 0 && (
                    <button
                      onClick={() => setSelectedTagsFilter([])}
                      className="text-[10px] font-bold text-rose-400 hover:text-rose-300 px-2.5 py-1 bg-[#201013] border border-rose-950 rounded-full transition-colors cursor-pointer"
                    >
                      Clear Tags
                    </button>
                  )}
                </div>
              </div>
            )}

            {tipsters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-[#8d90a0] font-bold uppercase tracking-wider min-w-[90px]">Tipster Source:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setTipsterFilter('all')}
                    className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                      tipsterFilter === 'all'
                        ? 'bg-[#2563eb] border-[#3b82f6] text-white'
                        : 'bg-[#0b1326] border-[#27314a] text-[#8d90a0] hover:text-white'
                    }`}
                  >
                    All Sources
                  </button>

                  <button
                    onClick={() => setTipsterFilter(tipsterFilter === '__MY_OWN_PICKS__' ? 'all' : '__MY_OWN_PICKS__')}
                    className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                      tipsterFilter === '__MY_OWN_PICKS__'
                        ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200'
                        : 'bg-[#0b1326] border-[#27314a] text-[#8d90a0] hover:text-white'
                    }`}
                  >
                    {tipsterFilter === '__MY_OWN_PICKS__' && <span className="inline-block mr-1 text-white">✓</span>}
                    👤 My Own Picks
                  </button>

                  {tipsters.map((t) => {
                    const isSelected = tipsterFilter === t.id;
                    const color = t.color || '#3b82f6';
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTipsterFilter(isSelected ? 'all' : t.id)}
                        style={{
                          borderColor: isSelected ? color : '#27314a',
                          backgroundColor: isSelected ? `${color}25` : '#0b1326',
                          color: isSelected ? '#ffffff' : '#8d90a0',
                        }}
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all cursor-pointer hover:text-white"
                      >
                        {isSelected && <span className="inline-block mr-1 text-white">✓</span>}
                        {t.name}
                      </button>
                    );
                  })}

                  {tipsterFilter !== 'all' && (
                    <button
                      onClick={() => setTipsterFilter('all')}
                      className="text-[10px] font-bold text-rose-400 hover:text-rose-300 px-2.5 py-1 bg-[#201013] border border-rose-950 rounded-full transition-colors cursor-pointer"
                    >
                      Clear Tipster
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bets List Content */}
      {filteredBets.length === 0 ? (
        <div className="bg-[#171f33] p-12 rounded-xl border border-[#27314a] text-center space-y-3">
          <Layers size={40} className="mx-auto text-[#8d90a0] opacity-50" />
          <h3 className="text-base font-bold text-white">No wagers found</h3>
          <p className="text-xs text-[#8d90a0] max-w-sm mx-auto">
            No bets match your current filter parameters. Try clearing your search query or adjusting the filters.
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('all');
              setSportFilter('all');
              setBookmakerFilter('all');
              setTypeFilter('all');
              setLiveFilter('all');
              setDateRange('all');
              setSelectedTagsFilter([]);
              setTipsterFilter('all');
            }}
            className="px-4 py-2 bg-[#2563eb] text-white text-xs font-bold rounded-lg hover:bg-[#1d4ed8] cursor-pointer inline-block"
          >
            Reset All Filters
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* Table View */
        <div className="bg-[#171f33] rounded-xl border border-[#27314a] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0b1326] border-b border-[#27314a] text-[#8d90a0] font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-3 w-8"></th>
                  <th className="p-3">Date & Type</th>
                  <th className="p-3">Event / Selections</th>
                  <th className="p-3">Bookmaker</th>
                  <th className="p-3 text-right">Odds</th>
                  <th className="p-3 text-right">Stake</th>
                  <th className="p-3 text-right">Payout / Return</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27314a]">
                {displayedBets.map((bet) => {
                  const bm = bookmakers.find((b) => b.id === bet.bookmakerId);
                  const isExpanded = expandedBetIds.has(bet.id);
                  const mainLeg = bet.legs[0];

                  let profitLoss = 0;
                  if (bet.status === 'won') profitLoss = (bet.actualReturn ?? bet.potentialPayout) - bet.stake;
                  else if (bet.status === 'lost') profitLoss = -bet.stake;
                  else if (bet.status === 'cashout') profitLoss = (bet.actualReturn ?? 0) - bet.stake;

                  return (
                    <React.Fragment key={bet.id}>
                      <tr className={`hover:bg-[#131b2e] transition-colors ${isExpanded ? 'bg-[#131b2e]' : ''}`}>
                        {/* Expand toggle */}
                        <td className="p-3 text-center">
                          {bet.legs.length > 1 ? (
                            <button
                              onClick={() => toggleExpand(bet.id)}
                              className="text-[#8d90a0] hover:text-white p-1 rounded"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          ) : (
                            <span className="text-[#8d90a0] text-[10px]">•</span>
                          )}
                        </td>

                        {/* Date & Type */}
                        <td className="p-3">
                          <div className="font-semibold text-white">
                            {formatBetDateTime(bet)}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] uppercase font-bold text-[#b4c5ff] bg-[#0b1326] px-1.5 py-0.5 rounded border border-[#27314a]">
                              {bet.type}
                            </span>
                            {bet.isLive && (
                              <span className="text-[9px] uppercase font-bold text-red-400 bg-red-950 px-1 py-0.5 rounded">
                                LIVE
                              </span>
                            )}
                            {bet.isFreeBet && (
                              <span className="text-[9px] uppercase font-bold text-amber-400 bg-amber-950 px-1 py-0.5 rounded">
                                FREE BET
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Event / Selection */}
                        <td className="p-3 max-w-sm md:max-w-md">
                          {bet.legs.length === 1 ? (
                            <div>
                              <div className="font-bold text-white whitespace-normal break-words">{mainLeg?.event}</div>
                              <div className="text-[#8d90a0] text-[11px] whitespace-normal break-words">
                                <span className="text-[#2563eb] font-semibold">{formatLegSelection(mainLeg?.selection, mainLeg?.market)}</span> • {mainLeg?.market}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-bold text-white flex items-center gap-1">
                                <span>{bet.legs.length}-Leg Multi Parlay</span>
                                <span className="text-[10px] text-[#8d90a0]">({mainLeg?.sport})</span>
                              </div>
                              <div className="text-[#8d90a0] text-[11px] whitespace-normal break-words">
                                First leg: <span className="text-white font-medium">{formatLegSelection(mainLeg?.selection, mainLeg?.market)}</span> ({mainLeg?.event})
                              </div>
                            </div>
                          )}
                          {((bet.tags && bet.tags.length > 0) || bet.tipsterId || bet.tipsterName) && (
                            <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                              {(() => {
                                const tObj = tipsters.find(t => t.id === bet.tipsterId);
                                const name = tObj?.name || bet.tipsterName;
                                const color = tObj?.color || bet.tipsterColor || '#3b82f6';
                                if (!name) return null;
                                return (
                                  <span
                                    style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, color: color }}
                                    className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap flex items-center gap-1"
                                  >
                                    🎯 {name}
                                  </span>
                                );
                              })()}
                              {bet.tags && bet.tags.map((tagName: string) => {
                                const def = tagDefinitions.find(t => t.name.toLowerCase() === tagName.toLowerCase());
                                const color = def ? def.color : '#4b5563';
                                return (
                                  <span
                                    key={tagName}
                                    style={{ backgroundColor: `${color}15`, borderColor: `${color}40`, color: color }}
                                    className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap"
                                  >
                                    {tagName}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        {/* Bookmaker */}
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {bm && <BookmakerLogo bookmaker={bm} size="sm" />}
                            <span className="font-semibold text-[#dae2fd]">{bm?.name || 'Bookmaker'}</span>
                          </div>
                        </td>

                        {/* Odds */}
                        <td className="p-3 text-right font-mono font-bold text-white">
                          {formatOdds(bet.totalOdds)}
                        </td>

                        {/* Stake */}
                        <td className="p-3 text-right font-mono text-white">
                          {formatCurrency(bet.stake, userCurrency)}
                        </td>

                        {/* Payout & Net PnL */}
                        <td className="p-3 text-right font-mono">
                          <div className="font-bold text-white">
                            {formatCurrency(bet.status === 'won' ? (bet.actualReturn ?? bet.potentialPayout) : bet.status === 'cashout' ? (bet.actualReturn ?? 0) : bet.potentialPayout, userCurrency)}
                          </div>
                          {bet.status !== 'pending' && bet.status !== 'void' && (
                            <div className={`text-[10px] font-bold ${profitLoss >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
                              {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss, userCurrency)}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                              bet.status === 'won'
                                ? 'bg-[#005236] text-[#4edea3] border-[#008f5d]'
                                : bet.status === 'lost'
                                ? 'bg-[#601410] text-[#ffb3ad] border-[#93231e]'
                                : bet.status === 'cashout'
                                ? 'bg-purple-950 text-purple-300 border-purple-800'
                                : bet.status === 'void'
                                ? 'bg-gray-800 text-gray-300 border-gray-600'
                                : 'bg-amber-950 text-amber-400 border-amber-700'
                            }`}
                          >
                            {bet.status === 'won' && <CheckCircle2 size={12} />}
                            {bet.status === 'lost' && <XCircle size={12} />}
                            {bet.status === 'pending' && <Clock size={12} />}
                            {bet.status === 'void' && <Ban size={12} />}
                            {bet.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(bet.imageUrl || bet.scannedSlipUrl) && (
                              <button
                                onClick={() => setLightboxBet(bet)}
                                className="p-1.5 text-[#2563eb] hover:text-[#b4c5ff] hover:bg-[#2563eb]/20 rounded border border-[#2563eb]/30 transition-colors cursor-pointer"
                                title="View original betslip image lightbox"
                              >
                                <Camera size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenSettlement(bet)}
                              className="px-2 py-1 bg-[#0b1326] hover:bg-[#2563eb] text-[#b4c5ff] hover:text-white border border-[#27314a] rounded text-[11px] font-semibold transition-colors cursor-pointer"
                              title="Update bet status"
                            >
                              Settle
                            </button>
                            {onDeleteBet && (
                              <button
                                onClick={() => onDeleteBet(bet.id)}
                                className="p-1 text-[#8d90a0] hover:text-[#ffb3ad] hover:bg-[#601410]/40 rounded transition-colors"
                                title="Delete record"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Parlay Legs */}
                      {isExpanded && (
                        <tr className="bg-[#0b1326]/60 border-b border-[#27314a]">
                          <td colSpan={9} className="p-4 pl-12">
                            <div className="space-y-2">
                              <div className="text-[11px] font-bold text-[#b4c5ff] uppercase tracking-wider">
                                Parlay Legs Detail Breakdown ({bet.legs.length} Selections)
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {bet.legs.map((leg: any, idx: number) => (
                                  <div key={leg.id || idx} className="bg-[#171f33] p-2.5 rounded border border-[#27314a] text-xs space-y-1.5">
                                    <div className="flex justify-between items-center text-[#8d90a0] text-[10px]">
                                      <span>Leg #{idx + 1} • {leg.sport}</span>
                                      <span className="font-mono font-bold text-white">@{formatOdds(leg.odds)}</span>
                                    </div>
                                    <div className="font-bold text-white text-xs whitespace-normal break-words">
                                      {leg.event}
                                      {formatEventDate(leg.eventDate) ? (
                                        <span className="text-[10px] font-normal text-[#8d90a0] ml-1.5">— {formatEventDate(leg.eventDate)}</span>
                                      ) : null}
                                    </div>
                                    <div className="text-[#2563eb] font-semibold text-[11px] whitespace-normal break-words">
                                      {formatLegSelection(leg.selection, leg.market)} <span className="text-[#8d90a0]">({leg.market})</span>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-[#27314a] pt-1.5 mt-1 text-[10px]">
                                      <span className="text-[#8d90a0]">Leg Status:</span>
                                      <select
                                        value={leg.status || 'pending'}
                                        onChange={(e) => onUpdateBetLegStatus?.(bet.id, leg.id, e.target.value as BetStatus)}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                                          leg.status === 'won'
                                            ? 'bg-[#005236] text-[#4edea3] border border-[#008f5d]'
                                            : leg.status === 'lost'
                                            ? 'bg-[#601410] text-[#ffb3ad] border border-[#93231e]'
                                            : leg.status === 'void'
                                            ? 'bg-gray-800 text-gray-300 border border-gray-600'
                                            : 'bg-[#0b1326] text-amber-400 border border-amber-700'
                                        }`}
                                      >
                                        <option value="pending">Pending</option>
                                        <option value="won">Won</option>
                                        <option value="lost">Lost</option>
                                        <option value="void">Void</option>
                                      </select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {bet.notes && (
                                <div className="text-[11px] text-[#8d90a0] bg-[#171f33] p-2 rounded border border-[#27314a] mt-2">
                                  <strong>Notes:</strong> {bet.notes}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedBets.map((bet: any) => {
            const bm = bookmakers.find((b) => b.id === bet.bookmakerId);
            const mainLeg = bet.legs[0];

            let profitLoss = 0;
            if (bet.status === 'won') profitLoss = (bet.actualReturn ?? bet.potentialPayout) - bet.stake;
            else if (bet.status === 'lost') profitLoss = -bet.stake;
            else if (bet.status === 'cashout') profitLoss = (bet.actualReturn ?? 0) - bet.stake;

            return (
              <div key={bet.id} className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4 flex flex-col justify-between hover:border-[#2563eb]/50 transition-all">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8d90a0] font-medium flex items-center gap-1.5">
                      {formatBetDateTime(bet)}
                      <span>•</span>
                      {bm && <BookmakerLogo bookmaker={bm} size="sm" />}
                      <span>{bm?.name}</span>
                      {(bet.imageUrl || bet.scannedSlipUrl) && (
                        <button
                          onClick={() => setLightboxBet(bet)}
                          className="p-1 text-[#2563eb] hover:text-[#b4c5ff] hover:bg-[#2563eb]/20 rounded border border-[#2563eb]/30 transition-colors cursor-pointer"
                          title="View betslip image"
                        >
                          <Camera size={13} />
                        </button>
                      )}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                        bet.status === 'won'
                          ? 'bg-[#005236] text-[#4edea3] border-[#008f5d]'
                          : bet.status === 'lost'
                          ? 'bg-[#601410] text-[#ffb3ad] border-[#93231e]'
                          : bet.status === 'cashout'
                          ? 'bg-purple-950 text-purple-300 border-purple-800'
                          : bet.status === 'void'
                          ? 'bg-gray-800 text-gray-300 border-gray-600'
                          : 'bg-amber-950 text-amber-400 border-amber-700'
                      }`}
                    >
                      {bet.status}
                    </span>
                  </div>

                  <div>
                    <div className="text-xs text-[#2563eb] font-bold uppercase tracking-wide flex items-center gap-1">
                      <span>{bet.type}</span>
                      {bet.isLive && <span className="text-[9px] bg-red-950 text-red-400 px-1 rounded">LIVE</span>}
                    </div>
                    <h4 className="text-sm font-bold text-white mt-0.5">{mainLeg?.event}</h4>
                    <p className="text-xs text-[#8d90a0] mt-0.5">
                      <span className="text-white font-semibold">{formatLegSelection(mainLeg?.selection, mainLeg?.market)}</span> ({mainLeg?.market})
                    </p>
                    {((bet.tags && bet.tags.length > 0) || bet.tipsterId || bet.tipsterName) && (
                      <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                        {(() => {
                          const tObj = tipsters.find(t => t.id === bet.tipsterId);
                          const name = tObj?.name || bet.tipsterName;
                          const color = tObj?.color || bet.tipsterColor || '#3b82f6';
                          if (!name) return null;
                          return (
                            <span
                              style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, color: color }}
                              className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap flex items-center gap-1"
                            >
                              🎯 {name}
                            </span>
                          );
                        })()}
                        {bet.tags && bet.tags.map((tagName: string) => {
                          const def = tagDefinitions.find(t => t.name.toLowerCase() === tagName.toLowerCase());
                          const color = def ? def.color : '#4b5563';
                          return (
                            <span
                              key={tagName}
                              style={{ backgroundColor: `${color}15`, borderColor: `${color}40`, color: color }}
                              className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap"
                            >
                              {tagName}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Legs breakdown */}
                  <div className="space-y-2 pt-1.5">
                    {bet.legs.map((leg: any, idx: number) => (
                      <div key={leg.id || idx} className="bg-[#0b1326] p-3 rounded-lg border border-[#27314a] text-xs flex items-center justify-between gap-3 shadow-sm">
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Event & Market Context Header */}
                          <div className="text-[#8d90a0] text-[10px] leading-relaxed font-medium whitespace-normal break-words">
                            <span className="text-slate-300 font-semibold">{leg.event}</span>
                            {leg.market ? <span className="text-[#8d90a0]"> • {leg.market}</span> : ''}
                          </div>
                          
                          {/* Selection value block */}
                          <div className="whitespace-normal break-words text-xs">
                            <span className="text-slate-400">Selection: </span>
                            <span className="font-extrabold text-[#4edea3] text-[13px]">{formatLegSelection(leg.selection, leg.market)}</span>
                            {leg.odds ? <span className="text-[#8d90a0] font-mono text-[10px] ml-1.5">(@{formatOdds(leg.odds)})</span> : ''}
                          </div>

                          {/* Date details if any */}
                          {formatEventDate(leg.eventDate) && (
                            <div className="text-[9px] text-[#8d90a0]">
                              Event Date: {formatEventDate(leg.eventDate)}
                            </div>
                          )}
                        </div>
                        <select
                          value={leg.status || 'pending'}
                          onChange={(e) => onUpdateBetLegStatus?.(bet.id, leg.id, e.target.value as BetStatus)}
                          className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer border shrink-0 ${
                            leg.status === 'won'
                              ? 'bg-[#005236] text-[#4edea3] border-[#008f5d]'
                              : leg.status === 'lost'
                              ? 'bg-[#601410] text-[#ffb3ad] border-[#93231e]'
                              : leg.status === 'void'
                              ? 'bg-gray-800 text-gray-300 border-gray-600'
                              : 'bg-[#171f33] text-amber-400 border-amber-700'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                          <option value="void">Void</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#27314a] flex items-center justify-between text-xs">
                  <div>
                    <div className="text-[#8d90a0]">Stake: <span className="font-mono font-bold text-white">{formatCurrency(bet.stake, userCurrency)}</span></div>
                    <div className="text-[#8d90a0]">Odds: <span className="font-mono font-bold text-white">@{formatOdds(bet.totalOdds)}</span></div>
                  </div>

                  <div className="text-right">
                    <div className="text-[#8d90a0]">Payout</div>
                    <div className="font-mono font-extrabold text-white text-sm">
                      {formatCurrency(bet.status === 'won' ? (bet.actualReturn ?? bet.potentialPayout) : bet.potentialPayout, userCurrency)}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenSettlement(bet)}
                  className="w-full py-2 bg-[#0b1326] hover:bg-[#2563eb] text-[#b4c5ff] hover:text-white border border-[#27314a] rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Update Bet Settlement
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#171f33] p-4 rounded-xl border border-[#27314a] mt-4 shadow-sm">
        <div className="text-xs text-[#8d90a0] flex items-center gap-2">
          <span>
            Showing <span className="font-semibold text-white">{effectiveTotalBets > 0 ? (currentPage - 1) * 8 + 1 : 0}</span> to{' '}
            <span className="font-semibold text-white">{Math.min(currentPage * 8, effectiveTotalBets)}</span> of{' '}
            <span className="font-semibold text-white">{effectiveTotalBets}</span> bets
          </span>
          {loadingPaginated && <Loader2 className="animate-spin text-[#2563eb]" size={14} />}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || loadingPaginated}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0b1326] text-[#b4c5ff] hover:bg-[#2563eb] hover:text-white border border-[#27314a] disabled:opacity-40 disabled:hover:bg-[#0b1326] disabled:hover:text-[#b4c5ff] transition-all cursor-pointer"
          >
            <ChevronLeft size={14} />
            Previous
          </button>

          {Array.from({ length: effectiveTotalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === effectiveTotalPages || Math.abs(p - currentPage) <= 1)
            .map((p, idx, arr) => {
              const prevP = arr[idx - 1];
              const showEllipsis = prevP && p - prevP > 1;
              return (
                <React.Fragment key={p}>
                  {showEllipsis && <span className="text-xs text-[#8d90a0] px-1">...</span>}
                  <button
                    onClick={() => setCurrentPage(p)}
                    disabled={loadingPaginated}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      currentPage === p
                        ? 'bg-[#2563eb] text-white border-[#2563eb]'
                        : 'bg-[#0b1326] text-[#b4c5ff] hover:bg-[#2563eb]/20 border-[#27314a]'
                    }`}
                  >
                    {p}
                  </button>
                </React.Fragment>
              );
            })}

          <button
            onClick={() => setCurrentPage((p) => Math.min(effectiveTotalPages, p + 1))}
            disabled={currentPage >= effectiveTotalPages || loadingPaginated}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0b1326] text-[#b4c5ff] hover:bg-[#2563eb] hover:text-white border border-[#27314a] disabled:opacity-40 disabled:hover:bg-[#0b1326] disabled:hover:text-[#b4c5ff] transition-all cursor-pointer"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Settlement Dialog Modal */}
      {settlementBet && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#171f33] border border-[#27314a] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="text-[#2563eb]" />
              <span>Settle Wager Status</span>
            </h3>

            <div className="bg-[#0b1326] p-3 rounded-lg border border-[#27314a] text-xs space-y-1">
              <div className="font-bold text-white">{settlementBet.legs[0]?.event}</div>
              <div className="text-[#2563eb] font-semibold">{settlementBet.legs[0]?.selection}</div>
              <div className="text-[#8d90a0]">
                Stake: {formatCurrency(settlementBet.stake, userCurrency)} • Potential: {formatCurrency(settlementBet.potentialPayout, userCurrency)}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-[#8d90a0]">Select Settlement Outcome:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleConfirmSettlement('won')}
                  className="py-2.5 bg-[#005236] hover:bg-[#00704a] text-[#4edea3] border border-[#008f5d] rounded-lg font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                >
                  <CheckCircle2 size={16} /> Won ({formatCurrency(settlementBet.potentialPayout, userCurrency)})
                </button>
                <button
                  onClick={() => handleConfirmSettlement('lost')}
                  className="py-2.5 bg-[#601410] hover:bg-[#801b15] text-[#ffb3ad] border border-[#93231e] rounded-lg font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                >
                  <XCircle size={16} /> Lost ({formatCurrency(0, userCurrency)})
                </button>
                <button
                  onClick={() => handleConfirmSettlement('void')}
                  className="py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 rounded-lg font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                >
                  <Ban size={16} /> Push / Void ({formatCurrency(settlementBet.stake, userCurrency)})
                </button>
                <button
                  onClick={() => handleConfirmSettlement('cashout')}
                  className="py-2.5 bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-700 rounded-lg font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                >
                  <DollarSign size={16} /> Early Cashout
                </button>
              </div>
            </div>

            <div className="space-y-1 pt-2">
              <label className="block text-xs text-[#8d90a0]">Custom Cashout Return Amount ({getCurrencySymbol(userCurrency)})</label>
              <input
                type="number"
                value={customReturnInput}
                onChange={(e) => setCustomReturnInput(Number(e.target.value))}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white font-mono text-sm"
              />
            </div>

            <div className="flex gap-2 pt-3">
              <button
                type="button"
                onClick={() => setSettlementBet(null)}
                className="w-full py-2 bg-[#0b1326] text-[#8d90a0] rounded-lg text-xs font-semibold hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Betslip Image Viewer Lightbox Modal */}
      {lightboxBet && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 md:p-6 animate-fade-in">
          <div className="bg-[#171f33] border border-[#27314a] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Lightbox Header */}
            <div className="p-4 bg-[#0b1326] border-b border-[#27314a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="text-[#2563eb]" size={18} />
                <h3 className="text-base font-bold text-white">Scanned Betslip Visual Verification</h3>
                <span className="text-xs font-mono bg-[#2563eb]/20 text-[#b4c5ff] border border-[#2563eb]/30 px-2 py-0.5 rounded">
                  {lightboxBet.type.toUpperCase()}
                </span>
              </div>
              <button
                onClick={() => setLightboxBet(null)}
                className="p-1.5 text-[#8d90a0] hover:text-white hover:bg-[#171f33] rounded-lg transition-colors cursor-pointer"
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* Lightbox Body Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 flex-1 overflow-y-auto p-4 gap-6">
              {/* Slip Image View */}
              <div className="bg-[#0b1326] rounded-xl border border-[#27314a] p-3 flex flex-col items-center justify-center min-h-[280px]">
                {loadingImage ? (
                  <div className="flex flex-col items-center gap-2 text-xs text-[#8d90a0]">
                    <Loader2 className="animate-spin text-[#2563eb]" size={24} />
                    <span>Loading betslip image...</span>
                  </div>
                ) : lightboxImage ? (
                  <img
                    src={lightboxImage}
                    alt="Original scanned betslip"
                    className="max-h-[420px] w-auto max-w-full object-contain rounded-lg border border-[#27314a]"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="text-[#8d90a0] text-xs">No image attached</div>
                )}
                <span className="text-[11px] text-[#8d90a0] mt-2 flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-[#4edea3]" /> Visual OCR verified screenshot
                </span>
              </div>

              {/* Extracted Legs & Metadata */}
              <div className="space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="bg-[#0b1326] p-3.5 rounded-xl border border-[#27314a] space-y-1.5">
                    <div className="text-xs text-[#8d90a0] flex justify-between">
                      <span>Date: {formatBetDateTime(lightboxBet)}</span>
                      <span className="font-mono text-white">Stake: {formatCurrency(lightboxBet.stake, userCurrency)}</span>
                    </div>
                    <div className="text-xs text-[#8d90a0] flex justify-between">
                      <span>Total Odds: <strong className="text-white font-mono">@{formatOdds(lightboxBet.totalOdds)}</strong></span>
                      <span className="font-mono text-[#4edea3] font-bold">Payout: {formatCurrency(lightboxBet.potentialPayout, userCurrency)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-[#b4c5ff] uppercase tracking-wider">Extracted Legs ({lightboxBet.legs.length})</h4>
                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                      {lightboxBet.legs.map((leg, idx) => (
                        <div key={leg.id || idx} className="bg-[#0b1326] p-3 rounded-xl border border-[#27314a] text-xs space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-white">Leg #{idx + 1} • {leg.sport}</span>
                            <span className="font-mono font-bold text-[#2563eb]">@{formatOdds(leg.odds)}</span>
                          </div>
                          <div className="text-white font-semibold">
                            {leg.event}
                            {formatEventDate(leg.eventDate) ? (
                              <span className="text-xs font-normal text-[#8d90a0] ml-1.5">— {formatEventDate(leg.eventDate)}</span>
                            ) : null}
                          </div>
                          <div className="text-[#b4c5ff] text-[11px]">{formatLegSelection(leg.selection, leg.market)} ({leg.market})</div>

                          <div className="pt-1.5 flex items-center justify-between border-t border-[#1f283d]">
                            <span className="text-[10px] text-[#8d90a0]">Status:</span>
                            <select
                              value={leg.status || 'pending'}
                              onChange={(e) => onUpdateBetLegStatus?.(lightboxBet.id, leg.id, e.target.value as BetStatus)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                                leg.status === 'won'
                                  ? 'bg-[#005236] text-[#4edea3] border border-[#008f5d]'
                                  : leg.status === 'lost'
                                  ? 'bg-[#601410] text-[#ffb3ad] border border-[#93231e]'
                                  : leg.status === 'void'
                                  ? 'bg-gray-800 text-gray-300 border border-gray-600'
                                  : 'bg-amber-950 text-amber-400 border border-amber-800'
                              }`}
                            >
                              <option value="pending">Pending</option>
                              <option value="won">Won</option>
                              <option value="lost">Lost</option>
                              <option value="void">Void</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setLightboxBet(null)}
                  className="w-full py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Close Visual Verification
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
