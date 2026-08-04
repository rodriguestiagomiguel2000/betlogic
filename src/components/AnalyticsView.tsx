import React, { useState } from 'react';
import { Bet, Bookmaker, BankrollTransaction } from '../types';
import { formatCurrency, calculateWinStreak, getCurrencySymbol } from '../utils/storage';
import { getBetLatestEventDate } from '../utils/dateUtils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import {
  PieChart as PieIcon,
  Flame,
  ShieldAlert,
  Award,
  Calculator,
  Grid,
  TrendingUp,
  Percent,
  Play,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Info,
  Building2,
  Activity,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface AnalyticsViewProps {
  bets: Bet[];
  bookmakers: Bookmaker[];
  transactions?: BankrollTransaction[];
  userCurrency?: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ bets, bookmakers, transactions = [], userCurrency }) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'heatmap_risk' | 'margins' | 'monte_carlo' | 'kelly'>('overview');

  // Kelly Criterion Calculator state
  const [kellyProbability, setKellyProbability] = useState<number>(55);
  const [kellyDecimalOdds, setKellyDecimalOdds] = useState<number>(2.0);
  const [kellyBankrollSize, setKellyBankrollSize] = useState<number>(5000);
  const [kellyFraction, setKellyFraction] = useState<number>(0.5); // Half Kelly

  // Vigorish Calculator state
  const [vigOdds1, setVigOdds1] = useState<number>(1.91);
  const [vigOdds2, setVigOdds2] = useState<number>(1.91);
  const [vigOdds3, setVigOdds3] = useState<number>(0);

  // Monte Carlo simulation state
  const [mcWinRate, setMcWinRate] = useState<number>(58);
  const [mcAvgOdds, setMcAvgOdds] = useState<number>(1.95);
  const [mcBankroll, setMcBankroll] = useState<number>(5000);
  const [mcStakePct, setMcStakePct] = useState<number>(2);
  const [mcNumBets, setMcNumBets] = useState<number>(200);
  const [mcResults, setMcResults] = useState<{
    medianFinal: number;
    worstCase: number;
    bestCase: number;
    ruinRate: number;
    trajectories: Array<{ betIndex: number; median: number; worst: number; best: number }>;
  } | null>(null);

  // Profit Milestone Goal
  const targetMilestone = 15000;
  const settledBets = bets.filter((b) => b.status === 'won' || b.status === 'lost' || b.status === 'cashout');
  const settledWinsCount = bets.filter((b) => b.status === 'won').length;
  
  const currentTotalProfit = settledBets.reduce((sum, b) => {
    if (b.status === 'won') return sum + ((b.actualReturn || b.potentialPayout) - b.stake);
    if (b.status === 'lost') return sum - b.stake;
    if (b.status === 'cashout') return sum + ((b.actualReturn || 0) - b.stake);
    return sum;
  }, 0);

  const totalSettledStaked = settledBets.reduce((sum, b) => sum + b.stake, 0);
  const portfolioRoi = totalSettledStaked > 0 ? (currentTotalProfit / totalSettledStaked) * 100 : null;
  const actualWinRate = settledBets.length > 0 ? settledWinsCount / settledBets.length : null;
  const actualAvgOdds = settledBets.length > 0 ? settledBets.reduce((sum, b) => sum + b.totalOdds, 0) / settledBets.length : null;

  const milestoneProgress = Math.min(100, Math.max(0, (currentTotalProfit / targetMilestone) * 100));

  // Sport ROI Breakdown (Only settled bets)
  const sportStatsMap: Record<string, { staked: number; returned: number; wins: number; total: number }> = {};
  bets.forEach((bet) => {
    if (bet.status !== 'won' && bet.status !== 'lost' && bet.status !== 'cashout') return;
    
    const validLegs = bet.legs && bet.legs.length > 0 ? bet.legs : [{ sport: 'Football' }];
    const legCount = validLegs.length;
    
    validLegs.forEach((leg) => {
      const sport = leg.sport || 'Football';
      if (!sportStatsMap[sport]) {
        sportStatsMap[sport] = { staked: 0, returned: 0, wins: 0, total: 0 };
      }
      
      const proportion = 1 / legCount;
      sportStatsMap[sport].staked += bet.stake * proportion;
      
      let returnedAmt = 0;
      if (bet.status === 'won') {
        returnedAmt = (bet.actualReturn || bet.potentialPayout) * proportion;
        sportStatsMap[sport].wins += proportion;
      } else if (bet.status === 'cashout') {
        returnedAmt = (bet.actualReturn || 0) * proportion;
      }
      
      sportStatsMap[sport].returned += returnedAmt;
      sportStatsMap[sport].total += proportion;
    });
  });

  const sportRoiData = Object.keys(sportStatsMap).map((sport) => {
    const data = sportStatsMap[sport];
    const profit = data.returned - data.staked;
    const roi = data.staked > 0 ? (profit / data.staked) * 100 : 0;
    const winRate = data.total > 0 ? (data.wins / data.total) * 100 : 0;
    return {
      sport,
      staked: Number(data.staked.toFixed(2)),
      profit: Number(profit.toFixed(2)),
      roi: Number(roi.toFixed(2)),
      winRate: Number(winRate.toFixed(1)),
      total: Number(data.total.toFixed(1))
    };
  });

  // Risk Heatmap Bucket Analysis
  const totalStakedAll = bets.reduce((sum, b) => sum + b.stake, 0);
  let highStakeCount = 0;
  let medStakeCount = 0;
  let lowStakeCount = 0;
  let highStakeAmt = 0;
  let medStakeAmt = 0;
  let lowStakeAmt = 0;

  // Dynamic Bankroll Evolution calculation based on chronological history of transactions and settled bets
  interface TimelineItem {
    rawDate: string;
    capitalDelta: number;
    betProfit: number;
    descriptions: string[];
  }

  const timelineMap: Record<string, TimelineItem> = {};

  // 1. Process capital transactions (deposits, withdrawals, transfers, initial balances, adjustments)
  if (transactions && transactions.length > 0) {
    transactions.forEach((tx) => {
      const d = new Date(tx.date);
      if (isNaN(d.getTime())) return;
      const rawDate = d.toISOString().slice(0, 10);
      let amt = Number(tx.amount || 0);
      if (tx.type && tx.type.toLowerCase().includes('withdraw') && amt > 0) {
        amt = -amt;
      }

      if (!timelineMap[rawDate]) {
        timelineMap[rawDate] = {
          rawDate,
          capitalDelta: 0,
          betProfit: 0,
          descriptions: []
        };
      }
      timelineMap[rawDate].capitalDelta += amt;
      if (tx.description) {
        timelineMap[rawDate].descriptions.push(tx.description);
      }
    });
  }

  // 2. Process settled bets
  const sortedBetsForEvolution = [...bets]
    .filter((b) => b.status === 'won' || b.status === 'lost' || b.status === 'cashout');

  sortedBetsForEvolution.forEach((bet) => {
    const d = getBetLatestEventDate(bet);
    if (isNaN(d.getTime())) return;
    const rawDate = d.toISOString().slice(0, 10);

    let profit = 0;
    if (bet.status === 'won') {
      profit = (bet.actualReturn || bet.potentialPayout) - bet.stake;
    } else if (bet.status === 'lost') {
      profit = -bet.stake;
    } else if (bet.status === 'cashout') {
      profit = (bet.actualReturn || 0) - bet.stake;
    }

    if (!timelineMap[rawDate]) {
      timelineMap[rawDate] = {
        rawDate,
        capitalDelta: 0,
        betProfit: 0,
        descriptions: []
      };
    }
    timelineMap[rawDate].betProfit += profit;
  });

  const sortedTimeline = Object.values(timelineMap).sort((a, b) => a.rawDate.localeCompare(b.rawDate));

  const bankrollEvolutionData: Array<{
    date: string;
    rawDate: string;
    balance: number;
    capitalDelta?: number;
    betProfit?: number;
  }> = [];

  if (sortedTimeline.length > 0) {
    const hasTransactions = transactions && transactions.length > 0;
    let runningBalance = 0;

    if (!hasTransactions) {
      // Fallback for legacy mode without transaction log
      const totalCurrentCash = bookmakers.reduce((sum, bm) => sum + (bm.realBalance || 0), 0);
      const fallbackBaseline = Math.max(0, totalCurrentCash - currentTotalProfit);
      runningBalance = fallbackBaseline;

      bankrollEvolutionData.push({
        date: 'Start',
        rawDate: 'start',
        balance: Number(fallbackBaseline.toFixed(2)),
        capitalDelta: 0,
        betProfit: 0
      });
    }

    sortedTimeline.forEach((item) => {
      runningBalance += item.capitalDelta + item.betProfit;
      const displayDate = new Date(item.rawDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      bankrollEvolutionData.push({
        date: displayDate,
        rawDate: item.rawDate,
        balance: Number(runningBalance.toFixed(2)),
        capitalDelta: Number(item.capitalDelta.toFixed(2)),
        betProfit: Number(item.betProfit.toFixed(2))
      });
    });
  }

  // Dynamic ROI by Bookmaker calculation
  const bmRoiMap: Record<string, { staked: number; returned: number }> = {};
  bets.forEach((bet) => {
    if (bet.status !== 'won' && bet.status !== 'lost' && bet.status !== 'cashout') return;
    const bmName = bookmakers.find((b) => b.id === bet.bookmakerId)?.name || 'Other';
    if (!bmRoiMap[bmName]) {
      bmRoiMap[bmName] = { staked: 0, returned: 0 };
    }
    bmRoiMap[bmName].staked += bet.stake;
    if (bet.status === 'won') {
      bmRoiMap[bmName].returned += bet.actualReturn || bet.potentialPayout;
    } else if (bet.status === 'cashout') {
      bmRoiMap[bmName].returned += bet.actualReturn || 0;
    }
  });

  const bookmakerRoiData = Object.keys(bmRoiMap).map((bmName) => {
    const data = bmRoiMap[bmName];
    const profit = data.returned - data.staked;
    const roi = data.staked > 0 ? (profit / data.staked) * 100 : 0;
    return {
      name: bmName,
      roi: Number(roi.toFixed(1))
    };
  });

  bets.forEach((b) => {
    if (b.stake >= 100) {
      highStakeCount++;
      highStakeAmt += b.stake;
    } else if (b.stake >= 30) {
      medStakeCount++;
      medStakeAmt += b.stake;
    } else {
      lowStakeCount++;
      lowStakeAmt += b.stake;
    }
  });

  const highPct = totalStakedAll > 0 ? ((highStakeAmt / totalStakedAll) * 100).toFixed(1) : '0.0';
  const medPct = totalStakedAll > 0 ? ((medStakeAmt / totalStakedAll) * 100).toFixed(1) : '0.0';
  const lowPct = totalStakedAll > 0 ? ((lowStakeAmt / totalStakedAll) * 100).toFixed(1) : '0.0';

  // Analytical Risk of Ruin Calculation
  let analyticalRuinPct: string | null = null;
  if (settledBets.length > 0 && actualWinRate !== null && actualAvgOdds !== null) {
    const netOdds = Math.max(0.1, actualAvgOdds - 1);
    const evFraction = actualWinRate * netOdds - (1 - actualWinRate);
    analyticalRuinPct = evFraction <= 0 ? '99.9' : Math.max(0.1, Math.min(100, Math.exp(-2 * evFraction * 15) * 100)).toFixed(1);
  }

  // Kelly Calculation
  const p = kellyProbability / 100;
  const q = 1 - p;
  const b = kellyDecimalOdds - 1;
  const fullKellyPercent = Math.max(0, (b * p - q) / b);
  const recommendedPercent = fullKellyPercent * kellyFraction;
  const recommendedStakeAmount = recommendedPercent * kellyBankrollSize;

  // Vig calculation
  const p1 = vigOdds1 > 1 ? 1 / vigOdds1 : 0;
  const p2 = vigOdds2 > 1 ? 1 / vigOdds2 : 0;
  const p3 = vigOdds3 > 1 ? 1 / vigOdds3 : 0;
  const totalImpliedProb = (p1 + p2 + p3) * 100;
  const overroundMargin = Math.max(0, totalImpliedProb - 100);

  // Monte Carlo Simulator logic
  const runMonteCarloSimulation = () => {
    const iterations = 500;
    const steps = Math.min(200, mcNumBets);
    const winProb = mcWinRate / 100;
    const stakeAmt = (mcBankroll * mcStakePct) / 100;

    const finalBankrolls: number[] = [];
    const stepSums: Record<number, number[]> = {};
    let ruinedCount = 0;

    for (let i = 0; i < iterations; i++) {
      let currentB = mcBankroll;
      for (let s = 1; s <= steps; s++) {
        if (!stepSums[s]) stepSums[s] = [];
        if (currentB <= mcBankroll * 0.1) {
          currentB = 0;
        } else {
          const won = Math.random() < winProb;
          if (won) {
            currentB += stakeAmt * (mcAvgOdds - 1);
          } else {
            currentB -= stakeAmt;
          }
        }
        stepSums[s].push(currentB);
      }
      if (currentB === 0) ruinedCount++;
      finalBankrolls.push(currentB);
    }

    finalBankrolls.sort((a, b) => a - b);
    const worst = finalBankrolls[Math.floor(iterations * 0.05)];
    const median = finalBankrolls[Math.floor(iterations * 0.5)];
    const best = finalBankrolls[Math.floor(iterations * 0.95)];

    const trajectories: Array<{ betIndex: number; median: number; worst: number; best: number }> = [];
    const stepInterval = Math.max(1, Math.floor(steps / 10));

    for (let s = stepInterval; s <= steps; s += stepInterval) {
      const arr = (stepSums[s] || []).sort((a, b) => a - b);
      trajectories.push({
        betIndex: s,
        worst: Math.round(arr[Math.floor(arr.length * 0.05)] || 0),
        median: Math.round(arr[Math.floor(arr.length * 0.5)] || 0),
        best: Math.round(arr[Math.floor(arr.length * 0.95)] || 0)
      });
    }

    setMcResults({
      medianFinal: Math.round(median),
      worstCase: Math.round(worst),
      bestCase: Math.round(best),
      ruinRate: Number(((ruinedCount / iterations) * 100).toFixed(1)),
      trajectories
    });
  };

  const streakInfo = calculateWinStreak(bets);

  // Tag / Strategy Performance Analytics
  const tagStatsMap: Record<string, { staked: number; returned: number; wins: number; total: number; settled: number }> = {};
  
  bets.forEach((bet) => {
    const betTags = bet.tags && bet.tags.length > 0 ? bet.tags : ['Untagged'];
    
    betTags.forEach((tag) => {
      if (!tagStatsMap[tag]) {
        tagStatsMap[tag] = { staked: 0, returned: 0, wins: 0, total: 0, settled: 0 };
      }
      
      tagStatsMap[tag].staked += bet.stake;
      
      if (bet.status === 'won') {
        tagStatsMap[tag].returned += bet.actualReturn ?? bet.potentialPayout;
        tagStatsMap[tag].wins += 1;
        tagStatsMap[tag].settled += 1;
      } else if (bet.status === 'lost') {
        tagStatsMap[tag].returned += 0;
        tagStatsMap[tag].settled += 1;
      } else if (bet.status === 'cashout') {
        tagStatsMap[tag].returned += bet.actualReturn ?? 0;
        tagStatsMap[tag].settled += 1;
      } else if (bet.status === 'void') {
        tagStatsMap[tag].returned += bet.stake;
        tagStatsMap[tag].settled += 1;
      }
      
      tagStatsMap[tag].total += 1;
    });
  });

  const tagPerformanceData = Object.keys(tagStatsMap).map((tagName) => {
    const data = tagStatsMap[tagName];
    const profitLoss = data.returned - data.staked;
    const roi = data.staked > 0 ? (profitLoss / data.staked) * 100 : 0;
    const winRate = data.settled > 0 ? (data.wins / data.settled) * 100 : 0;
    
    return {
      tag: tagName,
      staked: data.staked,
      profit: Number(profitLoss.toFixed(2)),
      roi: Number(roi.toFixed(1)),
      winRate: Number(winRate.toFixed(1)),
      total: data.total,
      settled: data.settled
    };
  }).sort((a, b) => b.profit - a.profit);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-12">
      {/* Header */}
      <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <PieIcon className="text-[#2563eb]" />
              <span>Advanced Risk Analytics & Market Heatmaps</span>
            </h2>
            <p className="text-sm text-[#8d90a0] mt-1">
              Deep-tier quantitative sports analytics: Risk of Ruin, Vigorish margins, Monte Carlo simulation engine & Kelly sizing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-[#4edea3]/20 text-[#4edea3] px-3 py-1 rounded-full font-mono font-bold flex items-center gap-1.5">
              <Zap size={14} /> AI Risk Engine Active
            </span>
          </div>
        </div>

        {/* Sub-tab switcher */}
        <div className="flex gap-2 mt-5 pt-3 border-t border-[#27314a] overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview & Portfolio Analytics', icon: Grid },
            { id: 'heatmap_risk', label: 'Risk Heatmap & Ruin Metrics', icon: ShieldAlert },
            { id: 'margins', label: 'Bookmaker Margin & Vigorish Tracker', icon: Building2 },
            { id: 'monte_carlo', label: 'Monte Carlo Simulation Engine', icon: Activity },
            { id: 'kelly', label: 'Kelly Stake Calculator', icon: Calculator }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                  activeSubTab === tab.id
                    ? 'bg-[#2563eb] text-white shadow-md'
                    : 'bg-[#0b1326] text-[#8d90a0] hover:text-white border border-[#27314a]'
                }`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SUB-TAB 1: Overview & Portfolio Analytics */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Top Hero Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
            <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
              <span className="text-xs text-[#8d90a0]">Net Portfolio Profit</span>
              <div className={`text-xl font-bold font-mono ${currentTotalProfit >= 0 ? 'text-[#4edea3]' : 'text-rose-400'}`}>
                {currentTotalProfit >= 0 ? '+' : ''}{formatCurrency(currentTotalProfit, userCurrency)}
              </div>
              <div className="w-full bg-[#0b1326] h-1.5 rounded-full overflow-hidden mt-2">
                <div className="bg-[#4edea3] h-full" style={{ width: `${Math.min(100, Math.max(5, (currentTotalProfit > 0 ? 75 : 0)))}%` }}></div>
              </div>
            </div>

            <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
              <span className="text-xs text-[#8d90a0]">Portfolio Yield (ROI)</span>
              <div className="text-xl font-bold font-mono text-[#2563eb]">
                {portfolioRoi !== null ? `${portfolioRoi >= 0 ? '+' : ''}${portfolioRoi.toFixed(1)}%` : '--'}
              </div>
              <div className="w-full bg-[#0b1326] h-1.5 rounded-full overflow-hidden mt-2">
                <div className="bg-[#2563eb] h-full" style={{ width: portfolioRoi !== null ? `${Math.min(100, Math.max(10, Math.abs(portfolioRoi)))}%` : '0%' }}></div>
              </div>
            </div>

            <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
              <span className="text-xs text-[#8d90a0]">Settled Win Rate</span>
              <div className="text-xl font-bold font-mono text-white">
                {actualWinRate !== null ? `${(actualWinRate * 100).toFixed(1)}%` : '--'}
              </div>
              <div className="w-full bg-[#0b1326] h-1.5 rounded-full overflow-hidden mt-2">
                <div className="bg-[#b4c5ff] h-full" style={{ width: actualWinRate !== null ? `${actualWinRate * 100}%` : '0%' }}></div>
              </div>
            </div>

            <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1">
              <span className="text-xs text-[#8d90a0]">Average Decimal Odds</span>
              <div className="text-xl font-bold font-mono text-amber-400">
                {actualAvgOdds !== null ? actualAvgOdds.toFixed(2) : '--'}
              </div>
              <div className="w-full bg-[#0b1326] h-1.5 rounded-full overflow-hidden mt-2">
                <div className="bg-amber-400 h-full" style={{ width: actualAvgOdds !== null ? `${Math.min(100, (actualAvgOdds / 5) * 100)}%` : '0%' }}></div>
              </div>
            </div>

            <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-1 col-span-2 sm:col-span-1">
              <span className="text-xs text-[#8d90a0]">Win Streak</span>
              <div className="text-xl font-bold font-mono text-emerald-400 flex items-center gap-1.5">
                <Flame size={18} className="text-amber-400" />
                <span>{streakInfo.currentStreak} {streakInfo.streakType.toUpperCase()}</span>
              </div>
              <p className="text-[10px] text-[#8d90a0] mt-1">Best: {streakInfo.bestStreak} Ws</p>
            </div>
          </div>

          {/* Sport Yield Bar Chart (Full Width, Market Hot Zones Removed) */}
          <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp size={16} className="text-[#4edea3]" />
              <span>Yield % (ROI) by Sport Category</span>
            </h3>

            <div className="h-56 w-full">
              {sportRoiData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-xs text-[#8d90a0] space-y-2">
                  <Info size={24} className="text-[#27314a]" />
                  <span>No settled bets available to compute yield per sport category.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sportRoiData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27314a" vertical={false} />
                    <XAxis dataKey="sport" stroke="#8d90a0" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#8d90a0" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0b1326', borderColor: '#27314a', borderRadius: '8px', color: '#fff' }}
                      formatter={(val: any) => [`${val}%`, 'Yield ROI']}
                    />
                    <Bar dataKey="roi" fill="#2563eb" radius={[4, 4, 0, 0]}>
                      {sportRoiData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.roi >= 0 ? '#00a572' : '#cf2c30'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Cumulative Bankroll Evolution (Growth Projections Removed) */}
          <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="text-[#4edea3]" size={18} />
                <span>CUMULATIVE BANKROLL EVOLUTION</span>
              </h3>
              <span className="text-[10px] font-bold text-[#4edea3] px-2.5 py-1 bg-[#4edea3]/10 rounded border border-[#4edea3]/30">
                SETTLED HISTORY
              </span>
            </div>

            <div className="h-64 w-full">
              {bankrollEvolutionData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-xs text-[#8d90a0] space-y-2">
                  <Activity size={28} className="text-[#27314a]" />
                  <span>No settled bet history yet. Settle wagers to view cumulative bankroll growth over time.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={bankrollEvolutionData}>
                    <defs>
                      <linearGradient id="bankrollGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4edea3" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#4edea3" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27314a" vertical={false} />
                    <XAxis dataKey="date" stroke="#8d90a0" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#8d90a0" tick={{ fontSize: 11 }} tickFormatter={(v) => `${getCurrencySymbol(userCurrency)}${v}`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const sym = getCurrencySymbol(userCurrency);
                          return (
                            <div className="bg-[#0b1326] border border-[#27314a] p-3 rounded-lg text-xs space-y-1 shadow-xl">
                              <p className="font-bold text-white mb-1">{data.date}</p>
                              <p className="text-[#4edea3] font-semibold">
                                Bankroll: {sym}{Number(data.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </p>
                              {data.capitalDelta !== undefined && data.capitalDelta !== 0 && (
                                <p className={data.capitalDelta > 0 ? 'text-blue-400 font-mono' : 'text-amber-400 font-mono'}>
                                  Capital Movement: {data.capitalDelta > 0 ? '+' : ''}{sym}{data.capitalDelta.toFixed(2)}
                                </p>
                              )}
                              {data.betProfit !== undefined && data.betProfit !== 0 && (
                                <p className={data.betProfit > 0 ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>
                                  Bet P&L: {data.betProfit > 0 ? '+' : ''}{sym}{data.betProfit.toFixed(2)}
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area type="monotone" dataKey="balance" stroke="#4edea3" strokeWidth={2.5} fillOpacity={1} fill="url(#bankrollGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Performance by Tag / Strategy Widget */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4">
            {/* Bar Chart */}
            <div className="lg:col-span-5 bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers size={16} className="text-[#8b5cf6]" />
                  <span>PROFIT & LOSS BY STRATEGY TAG</span>
                </h3>
                <span className="text-[10px] font-mono bg-[#8b5cf6]/20 text-[#c084fc] px-2 py-0.5 rounded font-bold">
                  Strategy Yield
                </span>
              </div>

              <div className="h-56 w-full">
                {tagPerformanceData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-[#8d90a0] italic">
                    No tagged bets logged yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tagPerformanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27314a" vertical={false} />
                      <XAxis dataKey="tag" stroke="#8d90a0" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#8d90a0" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0b1326', borderColor: '#27314a', borderRadius: '8px', color: '#fff' }}
                        formatter={(val: any) => [`${formatCurrency(Number(val), userCurrency)}`, 'Profit/Loss']}
                      />
                      <Bar dataKey="profit" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                        {tagPerformanceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Breakdown Table */}
            <div className="lg:col-span-7 bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity size={16} className="text-[#10b981]" />
                <span>Strategy Performance Breakdown</span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0b1326] border-b border-[#27314a] text-[#8d90a0] font-semibold uppercase tracking-wider text-[10px]">
                      <th className="p-2.5">Strategy / Tag</th>
                      <th className="p-2.5 text-right">Bets</th>
                      <th className="p-2.5 text-right">Total Stake</th>
                      <th className="p-2.5 text-right">Win Rate</th>
                      <th className="p-2.5 text-right">Profit / Loss</th>
                      <th className="p-2.5 text-right">Yield (ROI)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27314a]/50">
                    {tagPerformanceData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-xs text-[#8d90a0] italic">
                          No wagers found. Categorise your manual entries to populate this table.
                        </td>
                      </tr>
                    ) : (
                      tagPerformanceData.map((row) => (
                        <tr key={row.tag} className="hover:bg-[#131b2e] transition-colors">
                          <td className="p-2.5 font-bold text-white flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                            {row.tag}
                          </td>
                          <td className="p-2.5 text-right font-mono text-[#8d90a0]">{row.total}</td>
                          <td className="p-2.5 text-right font-mono text-white">{formatCurrency(row.staked)}</td>
                          <td className="p-2.5 text-right font-mono text-white">{row.winRate}%</td>
                          <td className={`p-2.5 text-right font-mono font-bold ${row.profit >= 0 ? 'text-[#4edea3]' : 'text-rose-400'}`}>
                            {row.profit >= 0 ? '+' : ''}{formatCurrency(row.profit)}
                          </td>
                          <td className={`p-2.5 text-right font-mono font-bold ${row.roi >= 0 ? 'text-[#4edea3]' : 'text-rose-400'}`}>
                            {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(1)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Risk Heatmap & Ruin Metrics */}
      {activeSubTab === 'heatmap_risk' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Heatmap Box with Integrated Donut Chart */}
            <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="text-[#2563eb]" size={18} />
                  <span>PORTFOLIO STAKE RISK HEATMAP</span>
                </h3>
                <span className="text-xs font-mono bg-[#2563eb]/20 text-[#2563eb] px-2.5 py-0.5 rounded font-bold">
                  Variance Exposure
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-2">
                {totalStakedAll === 0 ? (
                  <div className="md:col-span-12 py-8 text-center text-xs text-[#8d90a0] flex flex-col items-center justify-center gap-2">
                    <ShieldAlert size={24} className="text-[#27314a]" />
                    <span>No wager stakes logged yet to build risk heatmap exposure.</span>
                  </div>
                ) : (
                  <>
                    {/* Donut Chart Portion */}
                    <div className="md:col-span-5 h-40 flex items-center justify-center relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Low Stake Tier', value: Number(lowStakeAmt), color: '#4edea3' },
                              { name: 'Medium Stake Tier', value: Number(medStakeAmt), color: '#2563eb' },
                              { name: 'High Stake Tier', value: Number(highStakeAmt), color: '#cf2c30' },
                            ].filter(d => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={38}
                            outerRadius={52}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            <Cell fill="#4edea3" />
                            <Cell fill="#2563eb" />
                            <Cell fill="#cf2c30" />
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0b1326', borderColor: '#27314a', borderRadius: '8px', color: '#fff' }}
                            formatter={(val: any) => [`${getCurrencySymbol(userCurrency)}${Number(val).toFixed(2)}`, 'Allocated']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute text-center pointer-events-none">
                        <span className="text-xs font-semibold text-[#8d90a0]">Staked</span>
                        <p className="text-sm font-bold font-mono text-white">
                          {getCurrencySymbol(userCurrency)}{Math.round(totalStakedAll)}
                        </p>
                      </div>
                    </div>

                    {/* Progress bars explanation legend */}
                    <div className="md:col-span-7 space-y-3">
                      <div>
                        <div className="flex justify-between items-center text-[11px] mb-1">
                          <span className="text-[#8d90a0] font-medium">High Tier (&ge; {formatCurrency(100, userCurrency)})</span>
                          <span className="font-mono font-bold text-rose-400">{highPct}% ({highStakeCount} bets)</span>
                        </div>
                        <div className="h-2 w-full bg-[#0b1326] rounded-full overflow-hidden">
                          <div className="h-full bg-rose-500 rounded-full" style={{ width: `${highPct}%` }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center text-[11px] mb-1">
                          <span className="text-[#8d90a0] font-medium">Medium Tier ({formatCurrency(30, userCurrency)} - {formatCurrency(99, userCurrency)})</span>
                          <span className="font-mono font-bold text-[#2563eb]">{medPct}% ({medStakeCount} bets)</span>
                        </div>
                        <div className="h-2 w-full bg-[#0b1326] rounded-full overflow-hidden">
                          <div className="h-full bg-[#2563eb] rounded-full" style={{ width: `${medPct}%` }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center text-[11px] mb-1">
                          <span className="text-[#8d90a0] font-medium">Low Tier (&lt; {formatCurrency(30, userCurrency)})</span>
                          <span className="font-mono font-bold text-[#4edea3]">{lowPct}% ({lowStakeCount} bets)</span>
                        </div>
                        <div className="h-2 w-full bg-[#0b1326] rounded-full overflow-hidden">
                          <div className="h-full bg-[#4edea3] rounded-full" style={{ width: `${lowPct}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="p-3.5 rounded-lg bg-[#0b1326] border border-[#27314a] text-xs text-[#8d90a0] flex items-start gap-2">
                <Info size={16} className="text-[#2563eb] shrink-0 mt-0.5" />
                <span>
                  <strong>Heatmap Insight:</strong> Maintaining over 70% of portfolio allocations in the Low and Medium tiers prevents rapid drawdowns during standard sports variance cycles.
                </span>
              </div>
            </div>

            {/* Risk of Ruin & Profit Milestones */}
            <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <ShieldAlert className="text-[#4edea3]" size={18} />
                  <span>MATHEMATICAL RISK OF RUIN</span>
                </h3>
                <div className="flex items-center gap-4 bg-[#0b1326] p-4 rounded-xl border border-[#27314a]">
                  {analyticalRuinPct !== null ? (
                    <>
                      <div className="text-3xl font-bold font-mono text-[#4edea3]">
                        {analyticalRuinPct}%
                      </div>
                      <div className="text-xs text-[#8d90a0]">
                        Based on your win rate ({actualWinRate !== null ? (actualWinRate * 100).toFixed(1) : 0}%) and average odds ({actualAvgOdds !== null ? actualAvgOdds.toFixed(2) : 0}), your probability of total bankroll exhaustion is calculated from real settled wagers.
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-[#8d90a0] py-1">
                      Not enough settled bet data to calculate mathematical risk of ruin yet. Settle wagers to view risk metrics.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                  <span className="text-white flex items-center gap-1.5">
                    <Award size={16} className="text-[#2563eb]" />
                    <span>PROFIT MILESTONE PROGRESS</span>
                  </span>
                  <span className="text-[#2563eb] font-mono">{milestoneProgress.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 w-full bg-[#0b1326] rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-[#2563eb]" style={{ width: `${milestoneProgress}%` }}></div>
                </div>
                <p className="text-xs text-[#8d90a0]">
                  {formatCurrency(targetMilestone, userCurrency)} Target Milestone &mdash;{' '}
                  <strong className="text-white">
                    {formatCurrency(Math.max(0, targetMilestone - currentTotalProfit), userCurrency)} remaining
                  </strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Bookmaker Margin & Vigorish Tracker */}
      {activeSubTab === 'margins' && (
        <div className="space-y-6">
          <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Building2 size={18} className="text-[#2563eb]" />
                  <span>BOOKMAKER MARGIN TRACKER (VIGORISH ANALYSIS)</span>
                </h3>
                <p className="text-xs text-[#8d90a0] mt-0.5">
                  Lower bookmaker margin (juice) directly correlates with higher long-term expected value (EV+).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {bookmakers.map((bm) => (
                <div key={bm.id} className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white text-sm">{bm.name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        bm.averageMargin <= 3.5
                          ? 'bg-[#4edea3]/20 text-[#4edea3]'
                          : 'bg-[#2563eb]/20 text-[#b4c5ff]'
                      }`}
                    >
                      {bm.averageMargin <= 3.5 ? 'Sharp (Low Juice)' : 'Standard Margin'}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-[#4edea3] font-mono">
                    {bm.averageMargin}% <span className="text-xs text-[#8d90a0] font-normal">avg margin</span>
                  </div>
                  <div className="text-xs text-[#8d90a0]">
                    Active Cash Balance: <strong className="text-white">{formatCurrency(bm.realBalance, userCurrency)}</strong>
                  </div>
                </div>
              ))}
            </div>

            {/* ROI / Yield % by Sportsbook BarChart */}
            <div className="mt-6 bg-[#0b1326] p-5 rounded-xl border border-[#27314a] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">ROI & Yield % by Active Sportsbook</h4>
                <span className="text-[10px] font-mono bg-[#4edea3]/20 text-[#4edea3] px-2 py-0.5 rounded font-bold">
                  Performance Efficiency
                </span>
              </div>
              <div className="h-56 w-full">
                {bookmakerRoiData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-xs text-[#8d90a0] space-y-2">
                    <Building2 size={24} className="text-[#27314a]" />
                    <span>No settled bets recorded per bookmaker yet.</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bookmakerRoiData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27314a" vertical={false} />
                      <XAxis dataKey="name" stroke="#8d90a0" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#8d90a0" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0b1326', borderColor: '#27314a', borderRadius: '8px', color: '#fff' }}
                        formatter={(val: any) => [`${val}%`, 'Bookmaker ROI']}
                      />
                      <Bar dataKey="roi" fill="#2563eb" radius={[4, 4, 0, 0]}>
                        {bookmakerRoiData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.roi >= 0 ? '#4edea3' : '#cf2c30'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Vigorish / Overround Calculator */}
          <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Calculator size={18} className="text-[#2563eb]" />
              <span>Interactive Vigorish & Overround Calculator</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-[#8d90a0] mb-1">Outcome 1 Decimal Odds</label>
                <input
                  type="number"
                  step="0.01"
                  value={vigOdds1}
                  onChange={(e) => setVigOdds1(Number(e.target.value))}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-[#8d90a0] mb-1">Outcome 2 Decimal Odds</label>
                <input
                  type="number"
                  step="0.01"
                  value={vigOdds2}
                  onChange={(e) => setVigOdds2(Number(e.target.value))}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-[#8d90a0] mb-1">Outcome 3 Decimal Odds (Optional Draw)</label>
                <input
                  type="number"
                  step="0.01"
                  value={vigOdds3}
                  onChange={(e) => setVigOdds3(Number(e.target.value))}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white font-mono"
                  placeholder="Leave 0 for 2-way"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0b1326] border border-[#27314a] flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs text-[#8d90a0]">Total Implied Probability</span>
                <div className="text-xl font-bold font-mono text-white">{totalImpliedProb.toFixed(2)}%</div>
              </div>

              <div>
                <span className="text-xs text-[#8d90a0]">Bookmaker Vigorish / Overround</span>
                <div className="text-2xl font-bold font-mono text-[#4edea3]">
                  {overroundMargin.toFixed(2)}% Juice
                </div>
              </div>

              <div className="text-xs text-[#8d90a0] max-w-xs">
                {overroundMargin <= 3.0
                  ? 'Excellent low-margin market. Highly optimal for EV+ wagers.'
                  : overroundMargin <= 6.0
                  ? 'Standard market margin.'
                  : 'High vigorish market. High theoretical house edge.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: Monte Carlo Simulation Engine */}
      {activeSubTab === 'monte_carlo' && (
        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="text-[#2563eb]" size={18} />
              <span>MONTE CARLO STOCHASTIC SIMULATION ENGINE</span>
            </h3>
            <p className="text-xs text-[#8d90a0] mt-1">
              Simulate 500 distinct betting series iterations across your portfolio variables to model probability distributions of drawdowns, median final bankroll, and worst-case tail risks.
            </p>
          </div>

          {/* Simulation Inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] text-[#8d90a0] mb-1">Win Rate %</label>
              <input
                type="number"
                min="1"
                max="99"
                value={mcWinRate}
                onChange={(e) => setMcWinRate(Number(e.target.value))}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs font-mono text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#8d90a0] mb-1">Average Odds</label>
              <input
                type="number"
                step="0.05"
                min="1.01"
                value={mcAvgOdds}
                onChange={(e) => setMcAvgOdds(Number(e.target.value))}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs font-mono text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#8d90a0] mb-1">Bankroll ({getCurrencySymbol(userCurrency)})</label>
              <input
                type="number"
                value={mcBankroll}
                onChange={(e) => setMcBankroll(Number(e.target.value))}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs font-mono text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#8d90a0] mb-1">Stake % / Bet</label>
              <input
                type="number"
                step="0.5"
                min="0.1"
                value={mcStakePct}
                onChange={(e) => setMcStakePct(Number(e.target.value))}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs font-mono text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#8d90a0] mb-1">Bet Count</label>
              <input
                type="number"
                value={mcNumBets}
                onChange={(e) => setMcNumBets(Number(e.target.value))}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs font-mono text-white"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={runMonteCarloSimulation}
            className="w-full py-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play size={16} />
            <span>Launch 500-Iteration Simulation</span>
          </button>

          {/* Simulation Output */}
          {mcResults && (
            <div className="space-y-6 pt-4 border-t border-[#27314a]">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a]">
                  <span className="text-xs text-[#8d90a0]">Median Outcome (50th %)</span>
                  <div className="text-xl font-bold font-mono text-[#4edea3]">
                    {formatCurrency(mcResults.medianFinal, userCurrency)}
                  </div>
                </div>

                <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a]">
                  <span className="text-xs text-[#8d90a0]">Worst Case (5th %)</span>
                  <div className="text-xl font-bold font-mono text-rose-400">
                    {formatCurrency(mcResults.worstCase, userCurrency)}
                  </div>
                </div>

                <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a]">
                  <span className="text-xs text-[#8d90a0]">Best Case (95th %)</span>
                  <div className="text-xl font-bold font-mono text-[#2563eb]">
                    {formatCurrency(mcResults.bestCase, userCurrency)}
                  </div>
                </div>

                <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a]">
                  <span className="text-xs text-[#8d90a0]">Simulated Ruin Probability</span>
                  <div className="text-xl font-bold font-mono text-amber-400">
                    {mcResults.ruinRate}%
                  </div>
                </div>
              </div>

              {/* Trajectory Line Chart */}
              <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] space-y-3">
                <h4 className="text-xs font-bold text-white uppercase">Simulated Bankroll Trajectory Ranges</h4>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mcResults.trajectories}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27314a" vertical={false} />
                      <XAxis dataKey="betIndex" stroke="#8d90a0" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#8d90a0" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0b1326', borderColor: '#27314a', borderRadius: '8px', color: '#fff' }}
                      />
                      <Line type="monotone" dataKey="best" stroke="#2563eb" strokeWidth={2} name="Best (95th %)" />
                      <Line type="monotone" dataKey="median" stroke="#4edea3" strokeWidth={2} name="Median (50th %)" />
                      <Line type="monotone" dataKey="worst" stroke="#ffb3ad" strokeWidth={2} name="Worst (5th %)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 5: Kelly Calculator */}
      {activeSubTab === 'kelly' && (
        <div className="bg-[#171f33] p-6 rounded-xl border border-[#27314a] space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calculator className="text-[#2563eb]" />
              <span>Kelly Criterion Optimal Stake Calculator</span>
            </h3>
            <p className="text-xs text-[#8d90a0] mt-1">
              Calculate mathematically optimal bet sizing based on your estimated win probability to maximize exponential portfolio growth while avoiding risk of ruin.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-[#8d90a0] font-medium mb-1">Estimated Win Probability (%)</label>
              <input
                type="number"
                min="1"
                max="99"
                value={kellyProbability}
                onChange={(e) => setKellyProbability(Number(e.target.value))}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8d90a0] font-medium mb-1">Decimal Odds</label>
              <input
                type="number"
                step="0.05"
                min="1.01"
                value={kellyDecimalOdds}
                onChange={(e) => setKellyDecimalOdds(Number(e.target.value))}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8d90a0] font-medium mb-1">Total Bankroll Size ({getCurrencySymbol(userCurrency)})</label>
              <input
                type="number"
                value={kellyBankrollSize}
                onChange={(e) => setKellyBankrollSize(Number(e.target.value))}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8d90a0] font-medium mb-1">Kelly Fraction</label>
              <select
                value={kellyFraction}
                onChange={(e) => setKellyFraction(Number(e.target.value))}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value={1}>Full Kelly (Aggressive)</option>
                <option value={0.5}>Half Kelly (Recommended)</option>
                <option value={0.25}>Quarter Kelly (Conservative)</option>
              </select>
            </div>
          </div>

          {/* Results Box */}
          <div className="bg-[#0b1326] p-5 rounded-xl border border-[#27314a] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs text-[#8d90a0]">Recommended Stake Fraction</span>
              <div className="text-xl font-bold text-[#b4c5ff] font-mono">
                {(recommendedPercent * 100).toFixed(2)}% of bankroll
              </div>
            </div>

            <div className="space-y-1 text-right">
              <span className="text-xs text-[#8d90a0]">Recommended Currency Stake</span>
              <div className="text-2xl font-bold text-[#4edea3] font-mono">
                {formatCurrency(recommendedStakeAmount, userCurrency)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
