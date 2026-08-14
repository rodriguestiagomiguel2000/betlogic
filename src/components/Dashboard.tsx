import React, { useState, useMemo } from 'react';
import { Bet, Bankroll, Bookmaker, BetStatus } from '../types';
import { formatCurrency, formatOdds, calculateWinStreak, getBookmakerBalanceForBankroll, getCurrencySymbol, calculateBetProfit } from '../utils/storage';
import { formatEventDate, getRepresentativeEventDateTimestamp, formatLegSelection, formatBetDateTime, getBetLatestEventDate } from '../utils/dateUtils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { TrendingUp, Flame, ShieldAlert, Zap, Filter, CheckCircle2, XCircle, Clock, Plus, ScanLine, ArrowUpRight, Camera, Loader2 } from 'lucide-react';
import { BookmakerLogo } from './BookmakerLogo';
import { betsApi } from '../utils/api';

interface DashboardProps {
  bets: Bet[];
  bankrolls: Bankroll[];
  bookmakers: Bookmaker[];
  activeBankrollId?: string;
  userCurrency?: string;
  onUpdateBetStatus: (betId: string, status: 'won' | 'lost' | 'void' | 'cashout', actualReturn?: number) => void;
  onUpdateBetLegStatus?: (betId: string, legId: string, status: BetStatus) => void;
  onNavigate: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  bets,
  bankrolls,
  bookmakers,
  activeBankrollId,
  userCurrency,
  onUpdateBetStatus,
  onUpdateBetLegStatus,
  onNavigate
}) => {
  // Filters
  const [filterMode, setFilterMode] = useState<'all' | 'live' | 'prematch'>('all');
  const [selectedBankroll, setSelectedBankroll] = useState<string>('all');
  const [userChangedBankroll, setUserChangedBankroll] = useState<boolean>(false);

  React.useEffect(() => {
    if (activeBankrollId && !userChangedBankroll) {
      setSelectedBankroll(activeBankrollId);
    }
  }, [activeBankrollId, userChangedBankroll]);
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Lightbox modal state
  const [lightboxBet, setLightboxBet] = useState<Bet | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState<boolean>(false);

  React.useEffect(() => {
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

  // Filter bets
  const filteredBets = useMemo(() => {
    return bets.filter((b: Bet) => {
      if (filterMode === 'live' && !b.isLive) return false;
      if (filterMode === 'prematch' && b.isLive) return false;
      if (selectedBankroll !== 'all' && b.bankrollId !== selectedBankroll) return false;
      if (selectedStatus !== 'all' && b.status !== selectedStatus) return false;
      if (selectedSport !== 'all') {
        const hasSport = b.legs.some((leg: any) => leg.sport && leg.sport.toLowerCase() === selectedSport.toLowerCase());
        if (!hasSport) return false;
      }
      return true;
    });
  }, [bets, filterMode, selectedBankroll, selectedStatus, selectedSport]);

  // Calculate Metrics
  const totalBankrollBalance = useMemo(() => {
    return bankrolls.reduce((sum, b) => {
      if (selectedBankroll !== 'all' && b.id !== selectedBankroll) return sum;
      return sum + b.currentBalance;
    }, 0);
  }, [bankrolls, selectedBankroll]);

  const totalFreeBets = useMemo(() => {
    return bankrolls.reduce((sum, b) => {
      if (selectedBankroll !== 'all' && b.id !== selectedBankroll) return sum;
      return sum + b.freeBetCredits;
    }, 0);
  }, [bankrolls, selectedBankroll]);
  
  const dashboardStats = useMemo(() => {
    const settled = filteredBets.filter((b: Bet) => b.status === 'won' || b.status === 'lost' || b.status === 'cashout');
    const staked = settled.reduce((sum: number, b: Bet) => sum + b.stake, 0);
    const returns = settled.reduce((sum: number, b: Bet) => sum + (b.actualReturn || (b.status === 'won' ? b.potentialPayout : 0)), 0);
    const net = settled.reduce((sum: number, b: Bet) => sum + calculateBetProfit(b), 0);
    const roi = staked > 0 ? (net / staked) * 100 : 0;
    
    const won = settled.filter((b: Bet) => b.status === 'won').length;
    const wr = settled.length > 0 ? (won / settled.length) * 100 : 0;
    
    return { settled, staked, returns, net, roi, won, wr };
  }, [filteredBets]);

  const { settled: settledBets, staked: totalStaked, returns: totalReturns, net: netProfit, roi: roiPercentage, won: wonCount, wr: winRate } = dashboardStats;

  const pendingBets = useMemo(() => {
    const pending = filteredBets.filter((b: Bet) => b.status === 'pending');
    
    // Pre-calculate timestamps for sorting
    const pendingWithKeys = pending.map((bet: Bet) => ({
      bet,
      timestamp: getRepresentativeEventDateTimestamp(bet)
    }));
    
    pendingWithKeys.sort((a: any, b: any) => a.timestamp - b.timestamp);
    
    return pendingWithKeys.map((item: any) => item.bet);
  }, [filteredBets]);

  const winStreak = useMemo(() => calculateWinStreak(bets), [bets]);

  // Profit Chart Data generator
  const chartData = useMemo(() => {
    // Pre-calculate timestamps for sorting
    const settledWithKeys = settledBets.map(bet => ({
      bet,
      timestamp: getRepresentativeEventDateTimestamp(bet)
    }));
    
    settledWithKeys.sort((a, b) => a.timestamp - b.timestamp);
    
    let runningProfit = 0;
    return settledWithKeys.map((item: any, index: number) => {
      const bet = item.bet;
      const profit = calculateBetProfit(bet);
      runningProfit += profit;
      return {
        index: `#${index + 1}`,
        date: getBetLatestEventDate(bet).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        profit: Number(runningProfit.toFixed(2)),
      };
    });
  }, [settledBets]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-12">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-[#171f33] to-[#0d162a] p-5 rounded-xl border border-[#27314a]">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Betting Operations Center
          </h2>
          <p className="text-sm text-[#8d90a0] mt-1">
            Real-time portfolio analytics, odds edge tracking, and bankroll manager.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('scanner')}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold text-sm shadow-md transition-all cursor-pointer"
          >
            <ScanLine size={18} />
            <span>Scan Betslip OCR</span>
          </button>
          <button
            onClick={() => onNavigate('entry')}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#171f33] hover:bg-[#222a3d] border border-[#27314a] text-white font-semibold text-sm transition-all cursor-pointer"
          >
            <Plus size={18} />
            <span>Log Bet</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Portfolio Value */}
        <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-2">
          <div className="flex items-center justify-between text-[#8d90a0]">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Portfolio</span>
            <ArrowUpRight size={16} className="text-[#4edea3]" />
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-white">
            {formatCurrency(totalBankrollBalance, userCurrency)}
          </div>
          <div className="text-xs text-[#8d90a0] flex items-center gap-1">
            <span className="text-[#4edea3] font-medium">+{formatCurrency(totalFreeBets, userCurrency)}</span> free bet credits
          </div>
        </div>

        {/* Total Net Profit */}
        <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-2">
          <div className="flex items-center justify-between text-[#8d90a0]">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Profit</span>
            <TrendingUp size={16} className={netProfit >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'} />
          </div>
          <div className={`text-xl md:text-2xl font-extrabold ${netProfit >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
            {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit, userCurrency)}
          </div>
          <div className="text-xs text-[#8d90a0]">
            From {settledBets.length} settled wagers
          </div>
        </div>

        {/* ROI Percentage */}
        <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-2">
          <div className="flex items-center justify-between text-[#8d90a0]">
            <span className="text-xs font-semibold uppercase tracking-wider">Yield / ROI</span>
            <Zap size={16} className="text-[#b4c5ff]" />
          </div>
          <div className={`text-xl md:text-2xl font-extrabold ${roiPercentage >= 0 ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
            {roiPercentage >= 0 ? '+' : ''}{roiPercentage.toFixed(2)}%
          </div>
          <div className="text-xs text-[#8d90a0]">
            Total stake: {formatCurrency(totalStaked, userCurrency)}
          </div>
        </div>

        {/* Live Win Streak & Win Rate */}
        <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-2">
          <div className="flex items-center justify-between text-[#8d90a0]">
            <span className="text-xs font-semibold uppercase tracking-wider">Streak & Win Rate</span>
            <Flame size={16} className="text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl md:text-2xl font-extrabold text-white">{winRate.toFixed(1)}%</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#0b1326] text-amber-400 border border-amber-500/30">
              🔥 {winStreak.currentStreak} {winStreak.streakType.toUpperCase()}S
            </span>
          </div>
          <div className="text-xs text-[#8d90a0]">
            Best streak: {winStreak.bestStreak} WINS
          </div>
        </div>
      </div>

      {/* Live Bet Filters Header & Bar */}
      <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#27314a]">
          <div className="flex items-center gap-2 text-white font-semibold text-base">
            <Filter size={18} className="text-[#2563eb]" />
            <span>Interactive Bet Filters & Live Monitor</span>
          </div>

          {/* Quick Toggle: All / Live / Pre-match */}
          <div className="flex bg-[#0b1326] p-1 rounded-lg border border-[#27314a]">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                filterMode === 'all' ? 'bg-[#2563eb] text-white shadow' : 'text-[#8d90a0] hover:text-white'
              }`}
            >
              All Bets ({bets.length})
            </button>
            <button
              onClick={() => setFilterMode('live')}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                filterMode === 'live' ? 'bg-emerald-600 text-white shadow' : 'text-[#8d90a0] hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live ({bets.filter((b) => b.isLive).length})
            </button>
            <button
              onClick={() => setFilterMode('prematch')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                filterMode === 'prematch' ? 'bg-[#2563eb] text-white shadow' : 'text-[#8d90a0] hover:text-white'
              }`}
            >
              Pre-Match ({bets.filter((b) => !b.isLive).length})
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[#8d90a0] font-medium mb-1">Bankroll Target</label>
            <select
              value={selectedBankroll}
              onChange={(e) => {
                setUserChangedBankroll(true);
                setSelectedBankroll(e.target.value);
              }}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2563eb]"
            >
              <option value="all">All Bankrolls</option>
              {bankrolls.map((b) => {
                return (
                  <option key={b.id} value={b.id}>
                    {b.name} ({formatCurrency(b.currentBalance, userCurrency)})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#8d90a0] font-medium mb-1">Sport Category</label>
            <select
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2563eb]"
            >
              <option value="all">All Sports</option>
              <option value="football">Football</option>
              <option value="basketball">Basketball</option>
              <option value="tennis">Tennis</option>
              <option value="esports">Esports</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#8d90a0] font-medium mb-1">Result Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2563eb]"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="cashout">Cashout</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cumulative Profit Curve Chart */}
      <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Cumulative Profit Curve</h3>
            <p className="text-xs text-[#8d90a0]">Track return growth over logged historical wagers</p>
          </div>
          <span className="text-xs font-mono font-bold text-[#4edea3]">
            {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit, userCurrency)} overall
          </span>
        </div>

        <div className="h-56 w-full pt-2">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4edea3" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#4edea3" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27314a" vertical={false} />
                <XAxis dataKey="date" stroke="#8d90a0" tick={{ fontSize: 11 }} />
                <YAxis stroke="#8d90a0" tick={{ fontSize: 11 }} tickFormatter={(v) => `${getCurrencySymbol(userCurrency)}${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b1326', borderColor: '#27314a', borderRadius: '8px', color: '#fff' }}
                  formatter={(value: any) => [`${getCurrencySymbol(userCurrency)}${value}`, 'Cumulative Profit']}
                />
                <Area type="monotone" dataKey="profit" stroke="#4edea3" strokeWidth={2.5} fillOpacity={1} fill="url(#profitGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-[#8d90a0] text-sm">
              No settled bets match the selected filter criteria.
            </div>
          )}
        </div>
      </div>

      {/* Recent & Filtered Wagers List */}
      <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>Portfolio Bet Ledger</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#0b1326] text-[#8d90a0] border border-[#27314a]">
              {filteredBets.length} matches
            </span>
          </h3>
          <button
            onClick={() => onNavigate('entry')}
            className="text-xs text-[#2563eb] hover:text-[#b4c5ff] font-semibold flex items-center gap-1"
          >
            <Plus size={14} /> Add New Bet
          </button>
        </div>

        {filteredBets.length === 0 ? (
          <div className="text-center py-8 text-[#8d90a0] text-sm bg-[#0b1326] rounded-lg border border-[#27314a]">
            No bets found matching active filters.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBets.map((bet: Bet) => {
              const bookmaker = bookmakers.find((b) => b.id === bet.bookmakerId);
              const bankroll = bankrolls.find((b) => b.id === bet.bankrollId);

              return (
                <div
                  key={bet.id}
                  className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] hover:border-[#3b4766] transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f283d] pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#171f33] text-[#b4c5ff] border border-[#27314a]">
                        {bet.type.replace('_', ' ')}
                      </span>
                      {bet.isLive && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> LIVE
                        </span>
                      )}
                      {bet.isFreeBet && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                          FREE BET
                        </span>
                      )}
                      {(bet.imageUrl || bet.scannedSlipUrl) && (
                        <button
                          onClick={() => setLightboxBet(bet)}
                          className="p-1 text-[#2563eb] hover:text-[#b4c5ff] hover:bg-[#2563eb]/20 rounded border border-[#2563eb]/30 transition-colors cursor-pointer flex items-center gap-1 text-xs"
                          title="View original betslip image"
                        >
                          <Camera size={13} /> Slip Image
                        </button>
                      )}
                      <span className="text-xs text-[#8d90a0]">
                        {formatBetDateTime(bet)}
                      </span>
                    </div>

                    {/* Status Badge & Quick Settlement Buttons */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8d90a0] font-medium mr-1">
                        Odds: <strong className="text-white font-mono">@{formatOdds(bet.totalOdds)}</strong>
                      </span>

                      {bet.status === 'pending' ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onUpdateBetStatus(bet.id, 'won', bet.potentialPayout)}
                            className="px-2.5 py-1 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 size={13} /> Win
                          </button>
                          <button
                            onClick={() => onUpdateBetStatus(bet.id, 'lost', 0)}
                            className="px-2.5 py-1 text-xs font-bold rounded bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <XCircle size={13} /> Loss
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded capitalize flex items-center gap-1 ${
                            bet.status === 'won'
                              ? 'bg-[#003824] text-[#4edea3] border border-[#005236]'
                              : bet.status === 'lost'
                              ? 'bg-[#410004] text-[#ffb3ad] border border-[#930013]'
                              : 'bg-[#171f33] text-[#dae2fd]'
                          }`}
                        >
                          {bet.status === 'won' && <CheckCircle2 size={13} />}
                          {bet.status === 'lost' && <XCircle size={13} />}
                          {bet.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Legs detail */}
                  <div className="space-y-1.5">
                    {bet.legs.map((leg: any, idx: number) => (
                      <div key={leg.id || idx} className="text-xs bg-[#171f33] p-2 rounded border border-[#27314a] flex flex-wrap items-center justify-between gap-2">
                        <div className="truncate">
                          <span className="font-semibold text-white">{formatLegSelection(leg.selection, leg.market)}</span>
                          <span className="text-[#8d90a0] ml-1.5">
                            ({leg.event}{formatEventDate(leg.eventDate) ? ` — ${formatEventDate(leg.eventDate)}` : ''} • {leg.market})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#b4c5ff] bg-[#0b1326] px-1.5 py-0.5 rounded">
                            @{formatOdds(leg.odds)}
                          </span>
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

                  {/* Footer Meta: Stake, Payout, Bookie, Bankroll */}
                  <div className="flex flex-wrap items-center justify-between text-xs text-[#8d90a0] pt-2 border-t border-[#171f33] gap-2">
                     <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5">
                        Bookmaker: 
                        {bookmaker && <BookmakerLogo bookmaker={bookmaker} size="sm" />}
                        <strong className="text-white">{bookmaker?.name || 'Unknown'}</strong>
                      </span>
                      <span>Bankroll: <strong className="text-white">{bankroll?.name || 'Default'}</strong></span>
                    </div>

                    <div className="flex items-center gap-3 font-mono">
                      <span>Stake: <strong className="text-white">{formatCurrency(bet.stake, userCurrency)}</strong></span>
                      <span>
                        Return:{' '}
                        <strong className={bet.status === 'won' ? 'text-[#4edea3]' : bet.status === 'lost' ? 'text-[#ffb3ad]' : 'text-white'}>
                          {bet.actualReturn !== undefined ? formatCurrency(bet.actualReturn, userCurrency) : formatCurrency(bet.potentialPayout, userCurrency)}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
                      <span>Date: {new Date(lightboxBet.date).toLocaleDateString()}</span>
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
