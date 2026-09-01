import React, { useState, useMemo } from 'react';
import { Bet, Bookmaker, Bankroll, BankrollTransaction, Tipster } from '../types';
import { formatCurrency, calculateWinStreak, getCurrencySymbol, calculateBetProfit } from '../utils/storage';
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
  ArrowRight,
  UserCheck
} from 'lucide-react';

interface AnalyticsViewProps {
  bets: Bet[];
  bookmakers: Bookmaker[];
  bankrolls?: Bankroll[];
  transactions?: BankrollTransaction[];
  userCurrency?: string;
  tipsters?: Tipster[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ bets, bookmakers, bankrolls = [], transactions = [], userCurrency, tipsters = [] }) => {
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

  const targetMilestone = 1000;

  const runMonteCarloSimulation = () => {
    const iterations = 500;
    const numBets = mcNumBets;
    const startBankroll = mcBankroll;
    const winProb = mcWinRate / 100;
    const odds = mcAvgOdds;
    const stakePct = mcStakePct / 100;

    let ruinCount = 0;
    const allFinalBankrolls: number[] = [];
    const allTrajectories: number[][] = [];

    for (let i = 0; i < iterations; i++) {
      let currentBalance = startBankroll;
      const trajectory = [currentBalance];
      let isRuined = false;

      for (let j = 0; j < numBets; j++) {
        if (currentBalance <= 0) {
          isRuined = true;
          currentBalance = 0;
        }

        if (!isRuined) {
          const stake = currentBalance * stakePct;
          const isWin = Math.random() < winProb;
          if (isWin) {
            currentBalance += stake * (odds - 1);
          } else {
            currentBalance -= stake;
          }
        }
        trajectory.push(currentBalance);
      }

      if (isRuined || currentBalance <= 0) ruinCount++;
      allFinalBankrolls.push(currentBalance);
      allTrajectories.push(trajectory);
    }

    allFinalBankrolls.sort((a, b) => a - b);
    const worstCase = allFinalBankrolls[Math.floor(iterations * 0.05)];
    const medianFinal = allFinalBankrolls[Math.floor(iterations * 0.5)];
    const bestCase = allFinalBankrolls[Math.floor(iterations * 0.95)];
    const ruinRate = Number(((ruinCount / iterations) * 100).toFixed(1));

    const combinedTrajectories = [];
    for (let j = 0; j <= numBets; j++) {
      const stepBankrolls = allTrajectories.map(t => t[j]).sort((a, b) => a - b);
      combinedTrajectories.push({
        betIndex: j,
        worst: Number(stepBankrolls[Math.floor(iterations * 0.05)].toFixed(2)),
        median: Number(stepBankrolls[Math.floor(iterations * 0.5)].toFixed(2)),
        best: Number(stepBankrolls[Math.floor(iterations * 0.95)].toFixed(2))
      });
    }

    setMcResults({
      medianFinal,
      worstCase,
      bestCase,
      ruinRate,
      trajectories: combinedTrajectories
    });
  };

  const settledStats = useMemo(() => {
    const settled = bets.filter((b) => b.status === 'won' || b.status === 'lost' || b.status === 'cashout');
    const wonCount = settled.filter((b) => b.status === 'won').length;
    
    const profit = settled.reduce((sum, b) => sum + calculateBetProfit(b), 0);

    const staked = settled.reduce((sum, b) => sum + b.stake, 0);
    const roi = staked > 0 ? (profit / staked) * 100 : null;
    const winRate = settled.length > 0 ? wonCount / settled.length : null;
    const avgOdds = settled.length > 0 ? settled.reduce((sum, b) => sum + b.totalOdds, 0) / settled.length : null;
    const progress = Math.min(100, Math.max(0, (profit / targetMilestone) * 100));

    return { settled, wonCount, profit, staked, roi, winRate, avgOdds, progress };
  }, [bets]);

  const { settled: settledBets, wonCount: settledWinsCount, profit: currentTotalProfit, staked: totalSettledStaked, roi: portfolioRoi, winRate: actualWinRate, avgOdds: actualAvgOdds, progress: milestoneProgress } = settledStats;

  // Sport ROI Breakdown (Only settled bets)
  const sportRoiData = useMemo(() => {
    const sportStatsMap: Record<string, { staked: number; returned: number; profit: number; wins: number; total: number }> = {};
    bets.forEach((bet) => {
      if (bet.status !== 'won' && bet.status !== 'lost' && bet.status !== 'cashout') return;
      
      const validLegs = bet.legs && bet.legs.length > 0 ? bet.legs : [{ sport: 'Football' }];
      const legCount = validLegs.length;
      
      validLegs.forEach((leg) => {
        const sport = leg.sport || 'Football';
        if (!sportStatsMap[sport]) {
          sportStatsMap[sport] = { staked: 0, returned: 0, profit: 0, wins: 0, total: 0 };
        }
        
        const proportion = 1 / legCount;
        sportStatsMap[sport].staked += bet.stake * proportion;
        sportStatsMap[sport].profit += calculateBetProfit(bet) * proportion;
        
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

    return Object.keys(sportStatsMap).map((sport) => {
      const data = sportStatsMap[sport];
      const profit = data.profit;
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
  }, [bets]);

  // Risk Heatmap Bucket Analysis
  const riskAnalysis = useMemo(() => {
    const totalStakedAll = bets.reduce((sum, b) => sum + b.stake, 0);
    let highStakeCount = 0;
    let medStakeCount = 0;
    let lowStakeCount = 0;
    let highStakeAmt = 0;
    let medStakeAmt = 0;
    let lowStakeAmt = 0;

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

    return { totalStakedAll, highStakeCount, medStakeCount, lowStakeCount, highStakeAmt, medStakeAmt, lowStakeAmt, highPct, medPct, lowPct };
  }, [bets]);

  const { totalStakedAll, highStakeAmt, medStakeAmt, lowStakeAmt, highPct, medPct, lowPct, highStakeCount, medStakeCount, lowStakeCount } = riskAnalysis;

  // Dynamic Bankroll Evolution calculation based on chronological history of transactions and settled bets
  const bankrollEvolutionData = useMemo(() => {
    interface TimelineItem {
      rawDate: string;
      capitalDelta: number;
      betProfit: number;
      descriptions: string[];
    }

    const timelineMap: Record<string, TimelineItem> = {};

    // Determine the first ever bankroll created (for genuinely new money entering the system)
    const sortedBankrolls = bankrolls ? [...bankrolls].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)) : [];
    const firstBankrollId = sortedBankrolls.length > 0 ? sortedBankrolls[0]?.id : null;

    // Also identify the earliest bankroll ID from 'Initial Balance' transactions as a robust fallback
    let earliestInitialBankrollId: string | null = null;
    let earliestInitialDate: string | null = null;
    if (transactions && transactions.length > 0) {
      transactions.forEach((tx) => {
        if (tx.type === 'Initial Balance') {
          if (!earliestInitialDate || tx.date < earliestInitialDate) {
            earliestInitialDate = tx.date;
            earliestInitialBankrollId = tx.bankrollId;
          }
        }
      });
    }

    const primaryInitialBankrollId = firstBankrollId || earliestInitialBankrollId;

    // 1. Process capital transactions (deposits, withdrawals, transfers, initial balances, adjustments)
    if (transactions && transactions.length > 0) {
      transactions.forEach((tx) => {
        const d = new Date(tx.date);
        if (isNaN(d.getTime())) return;
        const rawDate = d.toISOString().slice(0, 10);
        const txType = (tx.type || '').trim();

        // 1. Exclude Rollover In, Rollover Out, and Carried Over transactions (internal capital movement between bankrolls)
        if (
          txType === 'Rollover In' ||
          txType === 'Rollover Out' ||
          txType === 'Opening Balance (Carried Over)' ||
          txType.toLowerCase().includes('rollover') ||
          txType.toLowerCase().includes('carried over')
        ) {
          return;
        }

        // 2. Initial Balance: exclude by default UNLESS it is from the very first bankroll created
        // (i.e. genuine initial capital seeding the user's betting portfolio)
        if (txType === 'Initial Balance') {
          const isFirstBankroll = primaryInitialBankrollId
            ? tx.bankrollId === primaryInitialBankrollId
            : true;
          // Check if this bankroll was created from a rollover
          const matchingBankroll = bankrolls?.find((b) => b.id === tx.bankrollId);
          const isRolloverDerived = Boolean(matchingBankroll?.rolloverFromBankrollId);

          if (!isFirstBankroll || isRolloverDerived) {
            return;
          }
        }

        let amt = Number(tx.amount || 0);
        if (txType.toLowerCase().includes('withdraw') && amt > 0) {
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
    const sortedBetsForEvolution = bets.filter((b) => b.status === 'won' || b.status === 'lost' || b.status === 'cashout');

    sortedBetsForEvolution.forEach((bet) => {
      const d = getBetLatestEventDate(bet);
      if (isNaN(d.getTime())) return;
      const rawDate = d.toISOString().slice(0, 10);

      let profit = calculateBetProfit(bet);

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
    const evolutionData: Array<{
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

        evolutionData.push({
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

        evolutionData.push({
          date: displayDate,
          rawDate: item.rawDate,
          balance: Number(runningBalance.toFixed(2)),
          capitalDelta: Number(item.capitalDelta.toFixed(2)),
          betProfit: Number(item.betProfit.toFixed(2))
        });
      });
    }
    return evolutionData;
  }, [bets, transactions, bookmakers, bankrolls, currentTotalProfit]);

  // Dynamic ROI by Bookmaker calculation
  const bookmakerRoiData = useMemo(() => {
    const bmRoiMap: Record<string, { staked: number; profit: number }> = {};
    bets.forEach((bet) => {
      if (bet.status !== 'won' && bet.status !== 'lost' && bet.status !== 'cashout') return;
      const bmName = bookmakers.find((b) => b.id === bet.bookmakerId)?.name || 'Other';
      if (!bmRoiMap[bmName]) {
        bmRoiMap[bmName] = { staked: 0, profit: 0 };
      }
      bmRoiMap[bmName].staked += bet.stake;
      bmRoiMap[bmName].profit += calculateBetProfit(bet);
    });

    return Object.keys(bmRoiMap).map((bmName) => {
      const data = bmRoiMap[bmName];
      const profit = data.profit;
      const roi = data.staked > 0 ? (profit / data.staked) * 100 : 0;
      return {
        name: bmName,
        roi: Number(roi.toFixed(1))
      };
    });
  }, [bets, bookmakers]);

  // Analytical Risk of Ruin Calculation
  const analyticalRuinPct = useMemo(() => {
    if (settledBets.length > 0 && actualWinRate !== null && actualAvgOdds !== null) {
      const netOdds = Math.max(0.1, actualAvgOdds - 1);
      const evFraction = actualWinRate * netOdds - (1 - actualWinRate);
      return evFraction <= 0 ? '99.9' : Math.max(0.1, Math.min(100, Math.exp(-2 * evFraction * 15) * 100)).toFixed(1);
    }
    return null;
  }, [settledBets.length, actualWinRate, actualAvgOdds]);

  // Kelly Calculation
  const kellyMetrics = useMemo(() => {
    const p = kellyProbability / 100;
    const q = 1 - p;
    const b = kellyDecimalOdds - 1;
    const fullKellyPercent = Math.max(0, (b * p - q) / b);
    const recommendedPercent = fullKellyPercent * kellyFraction;
    const recommendedStakeAmount = recommendedPercent * kellyBankrollSize;
    return { fullKellyPercent, recommendedPercent, recommendedStakeAmount };
  }, [kellyProbability, kellyDecimalOdds, kellyFraction, kellyBankrollSize]);

  const { fullKellyPercent, recommendedPercent, recommendedStakeAmount } = kellyMetrics;

  // Vig calculation
  const vigMetrics = useMemo(() => {
    const p1 = vigOdds1 > 1 ? 1 / vigOdds1 : 0;
    const p2 = vigOdds2 > 1 ? 1 / vigOdds2 : 0;
    const p3 = vigOdds3 > 1 ? 1 / vigOdds3 : 0;
    const totalImpliedProb = (p1 + p2 + p3) * 100;
    const overroundMargin = Math.max(0, totalImpliedProb - 100);
    return { totalImpliedProb, overroundMargin };
  }, [vigOdds1, vigOdds2, vigOdds3]);

  const { totalImpliedProb, overroundMargin } = vigMetrics;

  const streakInfo = useMemo(() => calculateWinStreak(bets), [bets]);

  // Tag / Strategy Performance Analytics
  const tagPerformanceData = useMemo(() => {
    const tagStatsMap: Record<string, { staked: number; returned: number; profit: number; wins: number; total: number; settled: number }> = {};
    
    bets.forEach((bet) => {
      const betTags = bet.tags && bet.tags.length > 0 ? bet.tags : ['Untagged'];
      
      betTags.forEach((tag) => {
        if (!tagStatsMap[tag]) {
          tagStatsMap[tag] = { staked: 0, returned: 0, profit: 0, wins: 0, total: 0, settled: 0 };
        }
        
        tagStatsMap[tag].staked += bet.stake;
        tagStatsMap[tag].total += 1;
        
        if (bet.status !== 'pending') {
          tagStatsMap[tag].settled += 1;
          tagStatsMap[tag].profit += calculateBetProfit(bet);
          if (bet.status === 'won') {
            tagStatsMap[tag].wins += 1;
            tagStatsMap[tag].returned += bet.actualReturn ?? bet.potentialPayout;
          } else if (bet.status === 'cashout') {
            tagStatsMap[tag].returned += bet.actualReturn ?? 0;
          } else if (bet.status === 'void') {
            tagStatsMap[tag].returned += bet.stake;
          }
        }
      });
    });

    return Object.keys(tagStatsMap).map((tagName) => {
      const data = tagStatsMap[tagName];
      const profitLoss = data.profit;
      const roi = data.staked > 0 ? (profitLoss / data.staked) * 100 : 0;
      const winRate = data.settled > 0 ? (data.wins / data.settled) * 100 : 0;
      
      return {
        tag: tagName,
        staked: data.staked,
        returned: data.returned,
        profit: Number(profitLoss.toFixed(2)),
        roi: Number(roi.toFixed(1)),
        winRate: Number(winRate.toFixed(1)),
        total: data.total,
        settled: data.settled
      };
    }).sort((a, b) => b.profit - a.profit);
  }, [bets]);

  // Tipster Performance Breakdown
  const tipsterPerformanceData = useMemo(() => {
    const tipsterStatsMap: Record<string, {
      tipsterId?: string;
      name: string;
      platform?: string;
      color?: string;
      staked: number;
      returned: number;
      profit: number;
      wins: number;
      total: number;
      settled: number;
      isSelf: boolean;
    }> = {};

    bets.forEach((bet) => {
      const tId = bet.tipsterId;
      const key = tId || '__MY_OWN_PICKS__';

      if (!tipsterStatsMap[key]) {
        const matchTipster = tipsters.find(t => t.id === tId);
        tipsterStatsMap[key] = {
          tipsterId: tId,
          name: key === '__MY_OWN_PICKS__' ? 'My Own Picks' : (matchTipster?.name || 'Unknown Tipster'),
          platform: key === '__MY_OWN_PICKS__' ? 'Personal' : (matchTipster?.platform || 'General'),
          color: key === '__MY_OWN_PICKS__' ? '#10b981' : (matchTipster?.color || '#3b82f6'),
          staked: 0,
          returned: 0,
          profit: 0,
          wins: 0,
          total: 0,
          settled: 0,
          isSelf: key === '__MY_OWN_PICKS__'
        };
      }

      const stat = tipsterStatsMap[key];
      stat.staked += bet.stake;
      stat.total += 1;

      if (bet.status !== 'pending') {
        stat.settled += 1;
        stat.profit += calculateBetProfit(bet);
        if (bet.status === 'won') {
          stat.wins += 1;
          stat.returned += bet.actualReturn ?? bet.potentialPayout;
        } else if (bet.status === 'cashout') {
          stat.returned += bet.actualReturn ?? 0;
        } else if (bet.status === 'void') {
          stat.returned += bet.stake;
        }
      }
    });

    return Object.values(tipsterStatsMap).map((stat) => {
      const profit = stat.profit;
      const roi = stat.staked > 0 ? (profit / stat.staked) * 100 : 0;
      const winRate = stat.settled > 0 ? (stat.wins / stat.settled) * 100 : 0;

      return {
        ...stat,
        profit: Number(profit.toFixed(2)),
        roi: Number(roi.toFixed(1)),
        winRate: Number(winRate.toFixed(1))
      };
    }).sort((a, b) => b.roi - a.roi); // Default sort by Yield (ROI) descending!
  }, [bets, tipsters]);

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

          {/* Tipster Performance Breakdown Section */}
          <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#27314a] pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <UserCheck size={18} className="text-[#3b82f6]" />
                  <span>TIPSTER PERFORMANCE BREAKDOWN</span>
                </h3>
                <p className="text-xs text-[#8d90a0] mt-0.5">
                  Track ROI, win rates, and net profitability by tipster source versus your own picks.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20 px-2.5 py-1 rounded-lg font-mono font-bold">
                  {tipsterPerformanceData.length} Sources Tracked
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Bar chart for Tipster ROI */}
              <div className="lg:col-span-4 bg-[#0b1326] p-4 rounded-xl border border-[#27314a] space-y-3">
                <span className="text-xs font-bold text-[#8d90a0] uppercase tracking-wider block">
                  Tipster Yield (ROI %)
                </span>
                <div className="h-56 w-full">
                  {tipsterPerformanceData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-[#8d90a0] italic">
                      No tipster data logged yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tipsterPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27314a" vertical={false} />
                        <XAxis dataKey="name" stroke="#8d90a0" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#8d90a0" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#171f33', borderColor: '#27314a', borderRadius: '8px', color: '#fff' }}
                          formatter={(val: any) => [`${val}%`, 'Yield (ROI)']}
                        />
                        <Bar dataKey="roi" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                          {tipsterPerformanceData.map((entry, index) => (
                            <Cell key={`tcell-${index}`} fill={entry.roi >= 0 ? '#10b981' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Tipster Breakdown Table */}
              <div className="lg:col-span-8 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0b1326] border-b border-[#27314a] text-[#8d90a0] font-semibold uppercase tracking-wider text-[10px]">
                      <th className="p-3">Tipster / Source</th>
                      <th className="p-3">Platform</th>
                      <th className="p-3 text-right">Bets</th>
                      <th className="p-3 text-right">Win Rate</th>
                      <th className="p-3 text-right">Staked</th>
                      <th className="p-3 text-right">Returned</th>
                      <th className="p-3 text-right">Net P&L</th>
                      <th className="p-3 text-right">Yield (ROI)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27314a]/50">
                    {tipsterPerformanceData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-xs text-[#8d90a0] italic">
                          No tipster picks recorded. Log wagers with tipster sources or select "My Own Picks" to view performance metrics.
                        </td>
                      </tr>
                    ) : (
                      tipsterPerformanceData.map((row) => (
                        <tr
                          key={row.name}
                          className={`hover:bg-[#131b2e] transition-colors ${
                            row.isSelf ? 'bg-[#10b981]/5 border-l-2 border-l-[#10b981]' : ''
                          }`}
                        >
                          <td className="p-3 font-bold text-white flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: row.color || '#3b82f6' }}
                            />
                            <span>{row.name}</span>
                            {row.isSelf && (
                              <span className="text-[10px] bg-[#10b981]/20 text-[#10b981] px-1.5 py-0.5 rounded border border-[#10b981]/30 font-semibold ml-1">
                                Self
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-[#8d90a0]">
                            <span className="bg-[#0b1326] px-2 py-0.5 rounded text-[11px] font-medium border border-[#27314a]">
                              {row.platform || 'General'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono text-[#8d90a0]">{row.total}</td>
                          <td className="p-3 text-right font-mono text-white">{row.winRate}%</td>
                          <td className="p-3 text-right font-mono text-white">{formatCurrency(row.staked, userCurrency)}</td>
                          <td className="p-3 text-right font-mono text-white">{formatCurrency(row.returned, userCurrency)}</td>
                          <td className={`p-3 text-right font-mono font-bold ${row.profit >= 0 ? 'text-[#4edea3]' : 'text-rose-400'}`}>
                            {row.profit >= 0 ? '+' : ''}{formatCurrency(row.profit, userCurrency)}
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${row.roi >= 0 ? 'text-[#4edea3]' : 'text-rose-400'}`}>
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
