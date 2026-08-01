import React, { useState, useMemo } from 'react';
import { Bet, Bankroll, Bookmaker, TagDefinition } from '../types';
import { getCurrencySymbol, formatCurrency, formatOdds } from '../utils/storage';
import { BookmakerLogo } from './BookmakerLogo';
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  TrendingUp, 
  TrendingDown, 
  Calendar as CalendarIcon,
  DollarSign,
  Award,
  BookOpen,
  ArrowRight,
  Info,
  Layers,
  Activity,
  User,
  ExternalLink,
  Flame,
  Globe
} from 'lucide-react';

interface PLCalendarViewProps {
  bets: Bet[];
  bankrolls: Bankroll[];
  bookmakers: Bookmaker[];
  tagDefinitions: TagDefinition[];
  userCurrency: string;
}

export const PLCalendarView: React.FC<PLCalendarViewProps> = ({
  bets,
  bankrolls,
  bookmakers,
  tagDefinitions,
  userCurrency,
}) => {
  // Current month/year state (initialize to local date)
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDayBets, setSelectedDayBets] = useState<{ day: number; bets: Bet[] } | null>(null);
  const [currencyUnit, setCurrencyUnit] = useState<'symbol' | 'code'>('symbol');

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-indexed

  const currencySymbol = getCurrencySymbol(userCurrency) || '€';

  // Navigate to previous month
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  // Navigate to next month
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Reset to today
  const handleGoToToday = () => {
    setCurrentDate(new Date());
  };

  // Days of the week header
  const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Map day-by-day bets for the current month
  const monthBetsData = useMemo(() => {
    const dayBetsMap: Record<number, Bet[]> = {};
    const settledMonthBets = bets.filter((b) => {
      const d = new Date(b.date);
      return (
        !isNaN(d.getTime()) &&
        d.getFullYear() === currentYear &&
        d.getMonth() === currentMonth
      );
    });

    settledMonthBets.forEach((bet) => {
      const day = new Date(bet.date).getDate();
      if (!dayBetsMap[day]) {
        dayBetsMap[day] = [];
      }
      dayBetsMap[day].push(bet);
    });

    return dayBetsMap;
  }, [bets, currentYear, currentMonth]);

  // Calculate day net Profit/Loss
  const getDayPnL = (dayBets: Bet[]) => {
    return dayBets.reduce((sum, b) => {
      if (b.status === 'won') {
        return sum + ((b.actualReturn || b.potentialPayout) - b.stake);
      }
      if (b.status === 'lost') {
        return sum - b.stake;
      }
      if (b.status === 'cashout') {
        return sum + ((b.actualReturn || 0) - b.stake);
      }
      // Void / Pending have 0 financial impact
      return sum;
    }, 0);
  };

  // Format compact number inside day cells
  const formatCompactPnL = (amount: number) => {
    const absVal = Math.abs(amount);
    const prefix = amount < 0 ? '-' : '+';
    const displaySymbol = currencyUnit === 'symbol' ? currencySymbol : '';
    const suffix = currencyUnit === 'code' ? ` ${userCurrency}` : '';

    let numStr = '';
    if (absVal < 1000) {
      if (Number.isInteger(absVal)) {
        numStr = `${absVal}`;
      } else {
        numStr = absVal.toFixed(1);
      }
    } else {
      numStr = `${(absVal / 1000).toFixed(1)}K`;
    }

    return `${prefix}${displaySymbol}${numStr}${suffix}`;
  };

  // Header display: Calculate Total Net Profit/Loss for current selected month
  const currentMonthTotalPnL = useMemo(() => {
    let total = 0;
    Object.values(monthBetsData).forEach((dayBets) => {
      total += getDayPnL(dayBets);
    });
    return total;
  }, [monthBetsData]);

  // Calendar rendering math
  const calendarCells = useMemo(() => {
    const cells = [];
    
    // First day of current selected month
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    
    // Total days in current selected month
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Total days in previous month
    const prevMonthTotalDays = new Date(currentYear, currentMonth, 0).getDate();

    // Fill preceding days (from previous month)
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      cells.push({
        day: prevMonthTotalDays - i,
        isCurrentMonth: false,
        key: `prev-${prevMonthTotalDays - i}`
      });
    }

    // Fill current month days
    for (let i = 1; i <= totalDays; i++) {
      const dayBets = monthBetsData[i] || [];
      const pnl = dayBets.length > 0 ? getDayPnL(dayBets) : 0;
      const hasPending = dayBets.some(b => b.status === 'pending');
      cells.push({
        day: i,
        isCurrentMonth: true,
        bets: dayBets,
        pnl,
        hasPending,
        key: `curr-${i}`
      });
    }

    // Fill trailing days (from next month) to form a neat full-grid rows
    const totalGridCells = 42; // standard 6-row layout
    const remainingCells = totalGridCells - cells.length;
    for (let i = 1; i <= remainingCells; i++) {
      cells.push({
        day: i,
        isCurrentMonth: false,
        key: `next-${i}`
      });
    }

    return cells;
  }, [currentYear, currentMonth, monthBetsData]);

  // Find bankroll name by ID
  const getBankrollName = (id: string) => {
    const br = bankrolls.find(b => b.id === id);
    return br ? br.name : 'Unknown Bankroll';
  };

  // Find bookmaker by ID
  const getBookmakerName = (id: string) => {
    const bm = bookmakers.find(b => b.id === id);
    return bm ? bm.name : 'Unknown Bookmaker';
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto pb-24 md:pb-12">
      {/* Visual Identity Hero Section */}
      <div className="bg-[#0e1629] p-5 rounded-2xl border border-[#1e293b] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarIcon className="text-[#2563eb]" />
            <span>Monthly P&L Calendar View</span>
          </h2>
          <p className="text-sm text-[#8d90a0] mt-1">
            Track daily wins, losses, and net sports betting performance with financial precision.
          </p>
        </div>

        {/* Currency Display Selector */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-xs text-[#8d90a0]">Display:</span>
          <div className="inline-flex rounded-lg bg-[#050b14] p-0.5 border border-[#1e293b]">
            <button
              onClick={() => setCurrencyUnit('symbol')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                currencyUnit === 'symbol'
                  ? 'bg-[#2563eb] text-white shadow-sm'
                  : 'text-[#8d90a0] hover:text-[#dae2fd]'
              }`}
            >
              Symbol ({currencySymbol})
            </button>
            <button
              onClick={() => setCurrencyUnit('code')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                currencyUnit === 'code'
                  ? 'bg-[#2563eb] text-white shadow-sm'
                  : 'text-[#8d90a0] hover:text-[#dae2fd]'
              }`}
            >
              Code ({userCurrency})
            </button>
          </div>
        </div>
      </div>

      {/* Main Calendar Section */}
      <div className="bg-[#0e1629] rounded-2xl border border-[#1e293b] overflow-hidden shadow-xl">
        
        {/* Calendar Header Area */}
        <div className="p-4 md:p-6 border-b border-[#1e293b] flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#111a30]/80">
          
          {/* Navigation Controls */}
          <div className="flex items-center gap-4">
            <h3 className="text-lg md:text-xl font-black text-white tracking-tight min-w-[150px] text-center sm:text-left">
              {monthNames[currentMonth]} {currentYear}
            </h3>
            
            <div className="flex items-center gap-1.5 bg-[#050b14] p-1 rounded-xl border border-[#1e293b]">
              <button
                onClick={handlePrevMonth}
                className="p-2 text-[#dae2fd] hover:text-white hover:bg-[#171f33] rounded-lg transition-colors cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleGoToToday}
                className="px-2.5 py-1 text-[11px] font-bold text-[#dae2fd] hover:text-white hover:bg-[#171f33] rounded-md transition-all cursor-pointer"
              >
                Today
              </button>
              <button
                onClick={handleNextMonth}
                className="p-2 text-[#dae2fd] hover:text-white hover:bg-[#171f33] rounded-lg transition-colors cursor-pointer"
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Prominent Net Profit / Loss */}
          <div className="flex items-center gap-3 px-4 py-2 bg-[#050b14] rounded-2xl border border-[#1e293b] shadow-inner w-full sm:w-auto justify-between sm:justify-start">
            <span className="text-xs text-[#8d90a0] font-medium">Monthly Net P&L:</span>
            <div className="flex items-center gap-1.5">
              {currentMonthTotalPnL > 0 ? (
                <TrendingUp size={16} className="text-[#4edea3]" />
              ) : currentMonthTotalPnL < 0 ? (
                <TrendingDown size={16} className="text-[#ff8a80]" />
              ) : null}
              <span
                className={`text-sm md:text-base font-black ${
                  currentMonthTotalPnL > 0
                    ? 'text-[#4edea3]'
                    : currentMonthTotalPnL < 0
                    ? 'text-[#ff8a80]'
                    : 'text-slate-300'
                }`}
              >
                {currentMonthTotalPnL > 0 ? '+' : ''}
                {formatCurrency(currentMonthTotalPnL, userCurrency)}
              </span>
            </div>
          </div>
        </div>

        {/* Calendar Grid Container */}
        <div className="p-4 md:p-6">
          {/* Weekday Header Row */}
          <div className="grid grid-cols-7 gap-2 text-center mb-3">
            {weekdays.map((day, idx) => (
              <div
                key={idx}
                className="text-xs font-bold text-[#8d90a0] uppercase tracking-wider py-1.5 select-none"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Monthly Days Grid */}
          <div className="grid grid-cols-7 gap-3 md:gap-3.5">
            {calendarCells.map((cell) => {
              // Days without active current month content (preceding/trailing)
              if (!cell.isCurrentMonth) {
                return (
                  <div
                    key={cell.key}
                    className="aspect-square bg-transparent rounded-2xl flex items-center justify-center text-slate-700 text-xs font-semibold select-none opacity-25"
                  >
                    {cell.day}
                  </div>
                );
              }

              const hasBets = cell.bets && cell.bets.length > 0;
              const hasPnL = cell.pnl !== 0;

              // Empty or neutral styling for days with no activity (transparent, displaying only the day number)
              if (!hasBets) {
                return (
                  <div
                    key={cell.key}
                    className="aspect-square bg-transparent border border-transparent rounded-2xl flex flex-col items-center justify-center p-2 select-none"
                  >
                    <span className="text-xs font-semibold text-slate-500">
                      {cell.day}
                    </span>
                  </div>
                );
              }

              // Active day cards (either winning, losing, or push/neutral)
              const pnl = cell.pnl || 0;
              const isProfit = pnl > 0;
              const isLoss = pnl < 0;

              let cellBg = 'bg-slate-500/10 border-slate-500/20';
              let textClass = 'text-slate-300';
              let ringClass = 'hover:ring-2 hover:ring-slate-500/30 hover:border-slate-500/50';

              if (isProfit) {
                cellBg = 'bg-emerald-500/10 border-emerald-500/20';
                textClass = 'text-emerald-400';
                ringClass = 'hover:ring-2 hover:ring-emerald-500/30 hover:border-emerald-500/50';
              } else if (isLoss) {
                cellBg = 'bg-rose-500/10 border-rose-500/20';
                textClass = 'text-rose-400';
                ringClass = 'hover:ring-2 hover:ring-rose-500/30 hover:border-rose-500/50';
              }

              return (
                <button
                  key={cell.key}
                  onClick={() => setSelectedDayBets({ day: cell.day, bets: cell.bets || [] })}
                  className={`aspect-square ${cellBg} border rounded-2xl flex flex-col justify-between p-2 md:p-3 text-center transition-all ${ringClass} cursor-pointer relative shadow-sm group`}
                >
                  {/* Center the day number at the top of the cell in subtle text */}
                  <div className="text-center w-full">
                    <span className="text-[11px] font-bold text-slate-400 group-hover:text-white transition-colors">
                      {cell.day}
                    </span>
                  </div>

                  {/* Center the P&L amount prominently in the lower section of the card */}
                  <div className="flex-1 flex flex-col items-center justify-center w-full">
                    <span className={`text-[10px] sm:text-xs md:text-sm font-bold truncate w-full text-center tracking-tight ${textClass}`}>
                      {formatCompactPnL(pnl)}
                    </span>
                  </div>

                  {/* Small subtle indicator dots to declutter layout */}
                  <div className="flex gap-1 justify-center items-center w-full min-h-[6px] mt-0.5">
                    {cell.hasPending ? (
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" title="Pending bets" />
                    ) : (
                      cell.bets?.slice(0, 3).map((_, idx) => (
                        <span 
                          key={idx} 
                          className={`w-1 h-1 rounded-full ${
                            isProfit 
                              ? 'bg-emerald-400/50 group-hover:bg-emerald-400' 
                              : isLoss 
                              ? 'bg-rose-400/50 group-hover:bg-rose-400' 
                              : 'bg-slate-400/50 group-hover:bg-slate-300'
                          } transition-colors`} 
                        />
                      ))
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Info Legend Card */}
      <div className="bg-[#0e1629] p-4 rounded-xl border border-[#1e293b] text-xs text-[#8d90a0] flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Info size={14} className="text-[#2563eb]" />
          <span>Interactive Grid: Click on any active day cell to inspect individual bet logs, mood notes, and stakes.</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-emerald-500/10 border border-emerald-500/20" />
            <span>Green: Profitable Days</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-rose-500/10 border border-rose-500/20" />
            <span>Red/Pink: Loss Days</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full inline-block animate-pulse" />
            <span>Yellow dot: Pending Bets</span>
          </div>
        </div>
      </div>

      {/* Detail Modal / Drawer showing bets for the clicked date */}
      {selectedDayBets && (
        <div className="fixed inset-0 bg-[#060e20]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#171f33] border border-[#27314a] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-[#27314a] bg-[#1b243b] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2563eb]/20 flex items-center justify-center text-[#2563eb]">
                  <CalendarIcon size={20} />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">
                    Wagers on {monthNames[currentMonth]} {selectedDayBets.day}, {currentYear}
                  </h4>
                  <p className="text-xs text-[#8d90a0]">
                    Reviewing {selectedDayBets.bets.length} individual sports betting records.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDayBets(null)}
                className="p-2 text-[#8d90a0] hover:text-white bg-[#0b1326] border border-[#27314a] rounded-xl transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Bets List */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {selectedDayBets.bets.map((bet) => {
                const isWin = bet.status === 'won';
                const isLoss = bet.status === 'lost';
                const isPending = bet.status === 'pending';
                const isCashout = bet.status === 'cashout';
                const isVoid = bet.status === 'void';

                // Calculate Net Profit/Loss of this individual bet
                let betProfit = 0;
                if (isWin) betProfit = (bet.actualReturn || bet.potentialPayout) - bet.stake;
                else if (isLoss) betProfit = -bet.stake;
                else if (isCashout) betProfit = (bet.actualReturn || 0) - bet.stake;

                const bmaker = bookmakers.find(bm => bm.id === bet.bookmakerId);
                const bmakerObj = bmaker || { name: getBookmakerName(bet.bookmakerId) };

                return (
                  <div 
                    key={bet.id} 
                    className="bg-[#0b1326] border border-[#27314a] rounded-xl p-4 space-y-3 shadow-inner hover:border-[#3b82f6]/40 transition-colors"
                  >
                    {/* Bet Top bar */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <BookmakerLogo bookmaker={bmakerObj} size="sm" />
                        <div>
                          <span className="text-xs font-extrabold text-white">
                            {getBookmakerName(bet.bookmakerId)}
                          </span>
                          <span className="mx-1.5 text-slate-500 text-[10px]">•</span>
                          <span className="text-[10px] text-[#8d90a0]">
                            {getBankrollName(bet.bankrollId)}
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                          isWin
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40'
                            : isLoss
                            ? 'bg-rose-950/80 text-rose-400 border border-rose-900/40'
                            : isCashout
                            ? 'bg-amber-950/80 text-amber-400 border border-amber-900/40'
                            : isVoid
                            ? 'bg-slate-900 text-slate-400 border border-[#27314a]'
                            : 'bg-blue-950/80 text-blue-400 border border-blue-900/40'
                        }`}
                      >
                        {bet.status}
                      </span>
                    </div>

                    {/* Legs list */}
                    <div className="bg-[#171f33]/40 rounded-lg p-3 border border-[#27314a]/40 space-y-2">
                      {bet.legs.map((leg, index) => (
                        <div key={leg.id || index} className="text-xs space-y-1">
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-bold text-[#dae2fd]">{leg.event}</span>
                            <span className="text-[#8d90a0] shrink-0 font-mono">@{leg.odds.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#8d90a0]">
                            <span>{leg.market} — <strong className="text-white">{leg.selection}</strong></span>
                            <span className="px-1.5 py-0.5 bg-[#0b1326] rounded text-[10px] border border-[#27314a]/30">
                              {leg.sport}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Financial details row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#171f33]/30 p-2.5 rounded-lg border border-[#27314a]/30 text-center text-xs">
                      <div>
                        <div className="text-[#8d90a0] text-[10px] uppercase font-bold tracking-wider">Stake</div>
                        <div className="font-extrabold text-white mt-0.5">
                          {formatCurrency(bet.stake, userCurrency)}
                          {bet.isFreeBet && <span className="text-[9px] text-[#2563eb] font-semibold block">(Free Bet)</span>}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#8d90a0] text-[10px] uppercase font-bold tracking-wider">Odds</div>
                        <div className="font-extrabold text-[#dae2fd] mt-0.5">{bet.totalOdds.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[#8d90a0] text-[10px] uppercase font-bold tracking-wider">Return</div>
                        <div className="font-extrabold text-[#dae2fd] mt-0.5">
                          {bet.status === 'pending' ? '—' : formatCurrency(bet.actualReturn || 0, userCurrency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#8d90a0] text-[10px] uppercase font-bold tracking-wider">Net Profit</div>
                        <div
                          className={`font-black mt-0.5 ${
                            betProfit > 0
                              ? 'text-[#4edea3]'
                              : betProfit < 0
                              ? 'text-[#ff8a80]'
                              : 'text-slate-400'
                          }`}
                        >
                          {bet.status === 'pending' ? '—' : (betProfit > 0 ? '+' : '') + formatCurrency(betProfit, userCurrency)}
                        </div>
                      </div>
                    </div>

                    {/* Notes & Tags (if exist) */}
                    {(bet.notes || (bet.tags && bet.tags.length > 0)) && (
                      <div className="text-xs space-y-1.5 pt-1">
                        {bet.notes && (
                          <p className="text-[#8d90a0] italic bg-[#171f33]/20 px-2.5 py-1.5 rounded border-l-2 border-[#2563eb]">
                            &ldquo;{bet.notes}&rdquo;
                          </p>
                        )}
                        {bet.tags && bet.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {bet.tags.map((tag, idx) => {
                              const definition = tagDefinitions.find(t => t.name.toLowerCase() === tag.toLowerCase());
                              const tagColor = definition?.color || '#27314a';
                              return (
                                <span
                                  key={idx}
                                  className="text-[10px] px-2 py-0.5 rounded-md text-white font-medium shadow-sm"
                                  style={{ backgroundColor: tagColor }}
                                >
                                  {tag}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#27314a] bg-[#1b243b] flex items-center justify-between">
              <span className="text-[11px] text-[#8d90a0]">
                All amounts are based on settled sportsbook returns.
              </span>
              <button
                onClick={() => setSelectedDayBets(null)}
                className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Close List
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
