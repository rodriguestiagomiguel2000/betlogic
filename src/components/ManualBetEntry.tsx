import React, { useState, useMemo } from 'react';
import { Bet, BetLeg, Bankroll, Bookmaker, BetType, SportType, TagDefinition, Tipster } from '../types';
import { formatCurrency, formatOdds, getCurrencySymbol } from '../utils/storage';
import { calculateLegsOdds, parseDateString, formatToLocalISOString, formatForDateTimeLocal } from '../utils/dateUtils';
import { PlusCircle, Trash2, CheckCircle2, ArrowLeft, Zap, Sparkles, Plus, UserCheck, X, AlertTriangle } from 'lucide-react';

interface ManualBetEntryProps {
  bankrolls: Bankroll[];
  bookmakers: Bookmaker[];
  bets?: Bet[];
  activeBankrollId?: string;
  onAddBet: (bet: Omit<Bet, 'id'>) => void;
  onNavigate: (tab: string) => void;
  tagDefinitions: TagDefinition[];
  onAddTagDefinition?: (tag: TagDefinition) => void;
  tipsters?: Tipster[];
  onAddTipster?: (data: { name: string; platform?: string; notes?: string; color?: string }) => Promise<Tipster>;
}

export const ManualBetEntry: React.FC<ManualBetEntryProps> = ({
  bankrolls,
  bookmakers,
  bets = [],
  activeBankrollId,
  onAddBet,
  onNavigate,
  tagDefinitions,
  onAddTagDefinition,
  tipsters = [],
  onAddTipster
}) => {
  const [betType, setBetType] = useState<BetType>('single');
  const [selectedBookmaker, setSelectedBookmaker] = useState<string>(bookmakers[0]?.id || '');
  const [selectedBankroll, setSelectedBankroll] = useState<string>(
    activeBankrollId && bankrolls.some((b) => b.id === activeBankrollId)
      ? activeBankrollId
      : bankrolls[0]?.id || ''
  );
  const [selectedTipsterId, setSelectedTipsterId] = useState<string>('');
  const [showInlineTipsterModal, setShowInlineTipsterModal] = useState<boolean>(false);
  const [inlineTipsterName, setInlineTipsterName] = useState<string>('');
  const [inlineTipsterPlatform, setInlineTipsterPlatform] = useState<string>('Telegram');
  const [inlineTipsterColor, setInlineTipsterColor] = useState<string>('#3b82f6');
  const [isCreatingTipster, setIsCreatingTipster] = useState<boolean>(false);
  const [stake, setStake] = useState<string>('50');
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isFreeBet, setIsFreeBet] = useState<boolean>(false);
  const [freeBetDestination, setFreeBetDestination] = useState<'cash' | 'free_bet'>('cash');
  const [notes, setNotes] = useState<string>('');
  const [isSuccessState, setIsSuccessState] = useState<boolean>(false);
  const [createdBetId, setCreatedBetId] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState<string>('');

  const [legs, setLegs] = useState<BetLeg[]>([
    {
      id: 'leg-1',
      sport: 'Football',
      league: 'Champions League',
      event: 'Real Madrid vs Borussia Dortmund',
      market: 'Match Winner',
      selection: 'Real Madrid',
      odds: 1.85,
      status: 'pending'
    }
  ]);

  const { rawTotalOdds, effectiveTotalOdds } = calculateLegsOdds(legs, betType);
  const totalOdds = effectiveTotalOdds;
  const potentialPayout = parseFloat(stake) * totalOdds;

  const activeBankrollObj = bankrolls.find(b => b.id === selectedBankroll);
  const bankrollTotal = activeBankrollObj ? activeBankrollObj.currentBalance : 0;
  const numericStake = parseFloat(stake) || 0;
  const stakePercentage = bankrollTotal > 0 ? (numericStake / bankrollTotal) * 100 : 0;

  const duplicateBet = useMemo(() => {
    if (!bets || bets.length === 0 || !legs || legs.length === 0) return null;
    const firstLeg = legs[0];
    if (!firstLeg || !firstLeg.event || !firstLeg.selection) return null;

    const eventNorm = firstLeg.event.trim().toLowerCase();
    const selNorm = firstLeg.selection.trim().toLowerCase();
    if (!eventNorm || !selNorm) return null;

    return bets.find(b => {
      if (b.status === 'lost' || b.status === 'void') return false;
      return b.legs && b.legs.some(l => {
        const eMatch = l.event && l.event.trim().toLowerCase() === eventNorm;
        const sMatch = l.selection && l.selection.trim().toLowerCase() === selNorm;
        return eMatch && sMatch;
      });
    }) || null;
  }, [bets, legs]);

  const handleAddLeg = () => {
    setLegs([
      ...legs,
      {
        id: `leg-${Date.now()}`,
        sport: 'Basketball',
        league: 'NBA',
        event: 'Lakers vs Warriors',
        market: 'Moneyline',
        selection: 'Lakers',
        odds: 1.90,
        status: 'pending'
      }
    ]);
    if (betType === 'single') setBetType('parlay');
  };

  const handleAddBetBuilderGroup = () => {
    const bId = `builder-${Date.now()}`;
    const defaultEvent = 'Halmstad vs. Sirius';
    const newLegs: BetLeg[] = [
      {
        id: `leg-${Date.now()}-1`,
        sport: 'Football',
        event: defaultEvent,
        market: '1x2',
        selection: 'Sirius',
        odds: 3.50,
        builderId: bId,
        builderOdds: 3.50,
        status: 'pending'
      },
      {
        id: `leg-${Date.now()}-2`,
        sport: 'Football',
        event: defaultEvent,
        market: 'Total Goals',
        selection: 'Over 2.5',
        odds: 3.50,
        builderId: bId,
        builderOdds: 3.50,
        status: 'pending'
      }
    ];
    setLegs([...legs, ...newLegs]);
    if (legs.length > 0) setBetType('parlay');
    else setBetType('bet_builder');
  };

  const handleAddLegToBuilder = (bId: string, eventName: string) => {
    const existing = legs.find((l) => l.builderId === bId);
    const bOdds = existing?.builderOdds || existing?.odds || 3.50;
    const newLeg: BetLeg = {
      id: `leg-${Date.now()}`,
      sport: existing?.sport || 'Football',
      event: eventName || existing?.event || 'Match Event',
      market: 'Market Selection',
      selection: 'Pick Answer',
      odds: bOdds,
      builderId: bId,
      builderOdds: bOdds,
      status: 'pending'
    };
    setLegs([...legs, newLeg]);
  };

  const handleUpdateBuilderOdds = (bId: string, newOdds: number) => {
    setLegs(legs.map((l) => (l.builderId === bId ? { ...l, builderOdds: newOdds, odds: newOdds } : l)));
  };

  const handleUpdateBuilderEvent = (bId: string, newEvent: string) => {
    setLegs(legs.map((l) => (l.builderId === bId ? { ...l, event: newEvent } : l)));
  };

  const handleRemoveBuilderGroup = (bId: string) => {
    setLegs(legs.filter((l) => l.builderId !== bId));
  };

  const handleRemoveLeg = (id: string) => {
    if (legs.length === 1) return;
    setLegs(legs.filter((l) => l.id !== id));
  };

  const handleUpdateLeg = (id: string, field: keyof BetLeg, value: any) => {
    setLegs(legs.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const stakeAmount = parseFloat(stake);
    if (legs.length === 0 || stakeAmount <= 0) return;

    const latestLegTimes = legs && legs.length > 0
      ? legs.map((l) => (l.eventDate ? parseDateString(l.eventDate)?.getTime() || NaN : NaN)).filter((t) => !isNaN(t))
      : [];
    const calculatedBetDate = latestLegTimes.length > 0
      ? formatToLocalISOString(new Date(Math.max(...latestLegTimes)))
      : formatToLocalISOString(new Date());

    onAddBet({
      date: calculatedBetDate,
      type: betType,
      legs,
      totalOdds: Number(totalOdds.toFixed(3)),
      stake: stakeAmount,
      potentialPayout: Number((stakeAmount * totalOdds).toFixed(2)),
      status: 'pending',
      bookmakerId: selectedBookmaker,
      bankrollId: selectedBankroll,
      tipsterId: selectedTipsterId || undefined,
      isLive,
      isFreeBet,
      freeBetDestination: isFreeBet ? freeBetDestination : 'cash',
      notes,
      tags: selectedTags
    });

    setIsSuccessState(true);
  };

  if (isSuccessState) {
    return (
      <div className="p-4 md:p-6 max-w-xl mx-auto py-12 text-center space-y-6">
        <div className="bg-[#171f33] p-8 rounded-2xl border border-[#27314a] space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-[#003824] text-[#4edea3] flex items-center justify-center mx-auto border border-[#005236]">
            <CheckCircle2 size={36} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Bet Successfully Committed!</h2>
            <p className="text-xs text-[#8d90a0] mt-1">
              Your wager has been logged into your portfolio and bankroll balance updated.
            </p>
          </div>

          <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#8d90a0]">Stake:</span>
              <span className="font-mono text-white font-bold">{formatCurrency(parseFloat(stake))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8d90a0]">Combined Odds:</span>
              <span className="font-mono text-[#b4c5ff] font-bold">@{formatOdds(totalOdds)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8d90a0]">Potential Payout:</span>
              <span className="font-mono text-[#4edea3] font-bold">{formatCurrency(potentialPayout)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                setIsSuccessState(false);
                setSelectedTags([]);
                setCustomTagInput('');
                setLegs([{
                  id: 'leg-1',
                  sport: 'Football',
                  league: '',
                  event: '',
                  market: '',
                  selection: '',
                  odds: 1.80,
                  status: 'pending'
                }]);
              }}
              className="flex-1 py-2.5 bg-[#171f33] hover:bg-[#222a3d] border border-[#27314a] text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Log Another Bet
            </button>

            <button
              onClick={() => onNavigate('dashboard')}
              className="flex-1 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold rounded-lg transition-colors shadow-lg"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto pb-24 md:pb-12">
      <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <PlusCircle className="text-[#2563eb]" />
            <span>Manual Wager Entry</span>
          </h2>
          <p className="text-sm text-[#8d90a0] mt-1">
            Log custom single bets, multi-game parlays, or same-game bet builders.
          </p>
        </div>
        <button
          onClick={() => onNavigate('dashboard')}
          className="text-xs text-[#8d90a0] hover:text-white flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#171f33] p-6 rounded-xl border border-[#27314a] space-y-6">
        {/* Row 1: Bet Type, Bankroll, Bookmaker, Tipster */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#8d90a0] mb-1">Structure Type</label>
            <select
              value={betType}
              onChange={(e) => setBetType(e.target.value as BetType)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white"
            >
              <option value="single">Single Bet</option>
              <option value="parlay">Multi-Leg Parlay</option>
              <option value="bet_builder">Same Game Bet Builder</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8d90a0] mb-1">Target Bankroll</label>
            <select
              value={selectedBankroll}
              onChange={(e) => setSelectedBankroll(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white"
            >
              {bankrolls.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({formatCurrency(b.currentBalance)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8d90a0] mb-1">Bookmaker Platform</label>
            <select
              value={selectedBookmaker}
              onChange={(e) => setSelectedBookmaker(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white"
            >
              {bookmakers.map((bm) => (
                <option key={bm.id} value={bm.id}>
                  {bm.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[#8d90a0]">Tipster Source</label>
              <button
                type="button"
                onClick={() => {
                  setInlineTipsterName('');
                  setInlineTipsterPlatform('Telegram');
                  setInlineTipsterColor('#3b82f6');
                  setShowInlineTipsterModal(true);
                }}
                className="text-[10px] text-[#3b82f6] hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
              >
                <Plus size={10} /> Add New
              </button>
            </div>
            <select
              value={selectedTipsterId}
              onChange={(e) => {
                if (e.target.value === '__NEW_TIPSTER__') {
                  setInlineTipsterName('');
                  setInlineTipsterPlatform('Telegram');
                  setInlineTipsterColor('#3b82f6');
                  setShowInlineTipsterModal(true);
                } else {
                  setSelectedTipsterId(e.target.value);
                }
              }}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white"
            >
              <option value="">👤 My Own Pick (No Tipster)</option>
              {tipsters.map((t) => (
                <option key={t.id} value={t.id}>
                  🎯 {t.name} {t.platform ? `(${t.platform})` : ''}
                </option>
              ))}
              <option value="__NEW_TIPSTER__">+ Add New Tipster...</option>
            </select>
          </div>
        </div>

        {/* Legs Editor Section */}
        <div className="space-y-4 pt-4 border-t border-[#27314a]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#2563eb]/20 text-[#2563eb] text-xs font-black">
                {legs.length}
              </div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Bet Selections / Legs
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddLeg}
                className="h-9 px-4 bg-[#171f33] hover:bg-[#222a3d] border border-[#27314a] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <PlusCircle size={15} className="text-[#2563eb]" /> 
                <span>Add Single Leg</span>
              </button>
              <button
                type="button"
                onClick={handleAddBetBuilderGroup}
                className="h-9 px-4 bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/40 text-indigo-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Sparkles size={15} className="text-indigo-400" /> 
                <span>Add Bet Builder</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Render Bet Builder Groups */}
            {Object.values(
              legs.reduce((acc, leg) => {
                if (leg.builderId) {
                  if (!acc[leg.builderId]) {
                    acc[leg.builderId] = {
                      builderId: leg.builderId,
                      event: leg.event || 'Bet Builder Event',
                      builderOdds: leg.builderOdds && leg.builderOdds > 0 ? leg.builderOdds : (leg.odds || 2.05),
                      legs: [],
                    };
                  }
                  acc[leg.builderId].legs.push(leg);
                }
                return acc;
              }, {} as Record<string, { builderId: string; event: string; builderOdds: number; legs: BetLeg[] }>)
            ).map((group) => (
              <div
                key={group.builderId}
                className="bg-[#0b1326] p-4 rounded-xl border border-indigo-500/40 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 bg-[#172036] p-2.5 rounded-lg border border-indigo-500/30">
                  <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <span className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                      <Sparkles size={12} /> Bet Builder
                    </span>
                    <input
                      type="text"
                      placeholder="Match / Event (e.g. Halmstad vs. Sirius)"
                      value={group.event}
                      onChange={(e) => handleUpdateBuilderEvent(group.builderId, e.target.value)}
                      className="bg-[#0b1326] border border-[#27314a] rounded px-2.5 py-1 text-xs text-white font-bold w-full"
                    />
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-indigo-200 font-medium">Combined Odds:</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="4.50"
                        value={group.builderOdds}
                        onChange={(e) => handleUpdateBuilderOdds(group.builderId, Number(e.target.value))}
                        className="bg-[#0b1326] border border-indigo-500/60 rounded px-2 py-1 text-xs text-indigo-300 font-mono font-bold w-20 text-center"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveBuilderGroup(group.builderId)}
                      className="text-xs text-rose-400 hover:text-rose-300 p-1 flex items-center gap-1"
                      title="Delete Bet Builder block"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 pl-2 border-l-2 border-indigo-500/30">
                  {group.legs.map((leg) => (
                    <div key={leg.id}>
                      {/* Desktop view for builder sub-legs */}
                      <div className="hidden lg:block overflow-x-auto w-full">
                        <div
                          className="bg-[#121b2e] p-3 rounded-lg border border-[#27314a] grid gap-4 items-end pb-1"
                          style={{
                            gridTemplateColumns: 'minmax(140px, 2fr) minmax(150px, 1.5fr) minmax(100px, 1.2fr) auto'
                          }}
                        >
                          <div>
                            <label className="block text-[11px] text-[#8d90a0] mb-1 whitespace-nowrap">Selection</label>
                            <input
                              type="text"
                              placeholder="Selection"
                              value={leg.selection}
                              onChange={(e) => handleUpdateLeg(leg.id, 'selection', e.target.value)}
                              className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-indigo-500"
                              style={{ minWidth: '140px' }}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-[#8d90a0] mb-1 whitespace-nowrap">Event Date</label>
                            <input
                              type="datetime-local"
                              value={formatForDateTimeLocal(leg.eventDate)}
                              onChange={(e) => handleUpdateLeg(leg.id, 'eventDate', e.target.value)}
                              className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                              style={{ minWidth: '150px' }}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-[#8d90a0] mb-1 whitespace-nowrap">Sport</label>
                            <select
                              value={leg.sport || ''}
                              onChange={(e) => handleUpdateLeg(leg.id, 'sport', e.target.value as SportType | '')}
                              className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                              style={{ minWidth: '100px' }}
                            >
                              <option value="">No Sport</option>
                              <option value="Football">⚽ Football</option>
                              <option value="Basketball">🏀 Basketball</option>
                              <option value="Tennis">🎾 Tennis</option>
                              <option value="Baseball">⚾ Baseball</option>
                              <option value="Ice Hockey">🏒 Ice Hockey</option>
                              <option value="Esports">🎮 Esports</option>
                              <option value="MMA">🥊 MMA</option>
                              <option value="Golf">⛳ Golf</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-center pb-1">
                            <button
                              type="button"
                              onClick={() => handleRemoveLeg(leg.id)}
                              className="text-xs text-rose-400 hover:text-rose-300 p-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/40 rounded transition-colors"
                              title="Remove leg"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Mobile view for builder sub-legs */}
                      <div className="lg:hidden bg-[#121b2e] p-3 rounded-lg border border-[#27314a] flex flex-col gap-2.5">
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <label className="block text-[11px] text-[#8d90a0] mb-1">Selection</label>
                            <input
                              type="text"
                              placeholder="Selection"
                              value={leg.selection}
                              onChange={(e) => handleUpdateLeg(leg.id, 'selection', e.target.value)}
                              className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white font-semibold focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 items-end">
                          <div>
                            <label className="block text-[11px] text-[#8d90a0] mb-1">Event Date</label>
                            <input
                              type="datetime-local"
                              value={formatForDateTimeLocal(leg.eventDate)}
                              onChange={(e) => handleUpdateLeg(leg.id, 'eventDate', e.target.value)}
                              className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-[#8d90a0] mb-1">Sport</label>
                            <select
                              value={leg.sport || ''}
                              onChange={(e) => handleUpdateLeg(leg.id, 'sport', e.target.value as SportType | '')}
                              className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                            >
                              <option value="">No Sport</option>
                              <option value="Football">⚽ Football</option>
                              <option value="Basketball">🏀 Basketball</option>
                              <option value="Tennis">🎾 Tennis</option>
                              <option value="Baseball">⚾ Baseball</option>
                              <option value="Ice Hockey">🏒 Ice Hockey</option>
                              <option value="Esports">🎮 Esports</option>
                              <option value="MMA">🥊 MMA</option>
                              <option value="Golf">⛳ Golf</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => handleRemoveLeg(leg.id)}
                            className="text-xs text-rose-400 hover:text-rose-300 p-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/40 rounded transition-colors"
                            title="Remove leg"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => handleAddLegToBuilder(group.builderId, group.event)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 pt-1 cursor-pointer"
                  >
                    <Plus size={13} /> Add Selection to this Bet Builder
                  </button>
                </div>
              </div>
            ))}

            {/* Render Single Independent Legs */}
            {legs.filter((l) => !l.builderId).map((leg, index) => (
              <div
                key={leg.id}
                className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] space-y-3"
              >
                <div className="flex items-center justify-between border-b border-[#1b253b] pb-2">
                  <span className="text-xs font-mono font-bold text-[#b4c5ff]">Single Selection #{index + 1}</span>
                  {legs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLeg(leg.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1.4fr_2.5fr_1.8fr_1.8fr_1fr] lg:gap-3 lg:items-end">
                  
                  {/* Row 1 on narrow viewports */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:contents">
                    <div>
                      <label className="block text-[11px] text-[#8d90a0] mb-1">Sport</label>
                      <select
                        value={leg.sport || ''}
                        onChange={(e) => handleUpdateLeg(leg.id, 'sport', e.target.value as SportType | '')}
                        className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">No Sport</option>
                        <option value="Football">⚽ Football</option>
                        <option value="Basketball">🏀 Basketball</option>
                        <option value="Tennis">🎾 Tennis</option>
                        <option value="Baseball">⚾ Baseball</option>
                        <option value="Ice Hockey">🏒 Ice Hockey</option>
                        <option value="Esports">🎮 Esports</option>
                        <option value="MMA">🥊 MMA</option>
                        <option value="Golf">⛳ Golf</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#8d90a0] mb-1">Match / Event</label>
                      <input
                        type="text"
                        placeholder="e.g. Arsenal vs Chelsea"
                        value={leg.event}
                        onChange={(e) => handleUpdateLeg(leg.id, 'event', e.target.value)}
                        className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[11px] text-[#8d90a0] mb-1">Event Date (Optional)</label>
                      <input
                        type="datetime-local"
                        value={formatForDateTimeLocal(leg.eventDate)}
                        onChange={(e) => handleUpdateLeg(leg.id, 'eventDate', e.target.value)}
                        className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Row 2 on narrow viewports */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:contents gap-3">
                    <div>
                      <label className="block text-[11px] text-[#8d90a0] mb-1">Market & Selection</label>
                      <input
                        type="text"
                        placeholder="e.g. Over 2.5 Goals"
                        value={leg.selection}
                        onChange={(e) => handleUpdateLeg(leg.id, 'selection', e.target.value)}
                        className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#8d90a0] mb-1">Decimal Odds</label>
                      <input
                        type="number"
                        step="0.01"
                        min="1.01"
                        placeholder="e.g. 1.85"
                        value={leg.odds}
                        onChange={(e) => handleUpdateLeg(leg.id, 'odds', Number(e.target.value))}
                        className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>

                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Anti-Duplication Warning Guard Banner */}
        {duplicateBet && (
          <div className="bg-amber-950/40 border border-amber-500/50 p-3.5 rounded-xl text-xs text-amber-200 space-y-1 shadow-lg">
            <div className="flex items-center gap-2 font-bold text-amber-400">
              <AlertTriangle size={16} className="shrink-0" />
              <span>Duplicate Bet Detection Guard</span>
            </div>
            <p className="text-[11px] text-amber-300/80">
              You already logged an open/won wager matching <strong>{duplicateBet.legs?.[0]?.event || 'this event'}</strong> ({duplicateBet.legs?.[0]?.selection}) in your portfolio history on {duplicateBet.date?.slice(0, 10)}. Please verify before adding.
            </p>
          </div>
        )}

        {/* Stake & Toggles Section */}
        <div className="pt-4 border-t border-[#27314a] grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[#8d90a0]">Total Stake Amount ({getCurrencySymbol()})</label>
              {activeBankrollObj && bankrollTotal > 0 && numericStake > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  stakePercentage > 5 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' 
                    : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                }`}>
                  {stakePercentage.toFixed(1)}% of {activeBankrollObj.name}
                </span>
              )}
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-sm font-mono text-white font-bold"
              required
            />
            {stakePercentage > 5 && (
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-amber-400 font-medium">
                <AlertTriangle size={12} className="shrink-0 animate-pulse text-amber-500" />
                <span>⚠️ High Exposure: &gt;5% of Bankroll</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8d90a0] mb-1">Optional Wager Notes</label>
            <input
              type="text"
              placeholder="e.g. High value line change on opening news"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>
        </div>

        {/* Strategy Tags Section */}
        <div className="pt-4 border-t border-[#27314a] space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#8d90a0] mb-1">
              Strategy Tags
            </label>
            <p className="text-[11px] text-[#8d90a0] mb-2">
              Categorise this wager with strategies or system tags for deep performance analysis.
            </p>
            
            {/* Current Selected Tags Chips */}
            <div className="flex flex-wrap gap-2 min-h-[36px] p-2 bg-[#0b1326] border border-[#27314a] rounded-lg mb-3">
              {selectedTags.length === 0 ? (
                <span className="text-xs text-[#525866] italic self-center">No tags attached. Select from popular tags below or type a custom one.</span>
              ) : (
                selectedTags.map((tagName) => {
                  const def = tagDefinitions.find(t => t.name.toLowerCase() === tagName.toLowerCase());
                  const color = def ? def.color : '#2563eb';
                  return (
                    <span
                      key={tagName}
                      style={{ backgroundColor: `${color}15`, borderColor: `${color}40`, color: color }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded border whitespace-nowrap"
                    >
                      <span>{tagName}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedTags(prev => prev.filter(t => t !== tagName))}
                        className="hover:bg-white/10 rounded-full p-0.5 text-[#8d90a0] hover:text-white"
                      >
                        <Trash2 size={10} className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  );
                })
              )}
            </div>

            {/* Quick Popular Tags Selector */}
            <div className="space-y-2 mb-3">
              <span className="text-[10px] text-[#8d90a0] font-bold uppercase tracking-wider block">Quick Add Popular Tags:</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: 'Pre-Match', hashtag: '#PreMatch', color: '#2563eb' },
                  { name: 'Live', hashtag: '#Live', color: '#ef4444' },
                  { name: 'Value Bet', hashtag: '#ValueBet', color: '#10b981' },
                  { name: 'Cashout', hashtag: '#Cashout', color: '#f59e0b' }
                ].map((pop) => {
                  const isAttached = selectedTags.some(t => t.toLowerCase() === pop.name.toLowerCase());
                  return (
                    <button
                      type="button"
                      key={pop.hashtag}
                      onClick={() => {
                        if (isAttached) {
                          setSelectedTags(prev => prev.filter(t => t.toLowerCase() !== pop.name.toLowerCase()));
                        } else {
                          const exists = tagDefinitions.some(t => t.name.toLowerCase() === pop.name.toLowerCase());
                          if (!exists && onAddTagDefinition) {
                            onAddTagDefinition({
                              id: `tag-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                              name: pop.name,
                              color: pop.color
                            });
                          }
                          setSelectedTags(prev => [...prev, pop.name]);
                        }
                      }}
                      style={{
                        borderColor: isAttached ? pop.color : '#27314a',
                        backgroundColor: isAttached ? `${pop.color}20` : '#0b1326',
                        color: isAttached ? '#ffffff' : '#8d90a0'
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer hover:text-white"
                    >
                      {pop.hashtag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Tag Input & Available Definitions Dropdown */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Dropdown of available tag definitions */}
              <div className="flex-1">
                <label className="block text-[10px] text-[#8d90a0] mb-1">Attach Existing Strategy</label>
                <select
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !selectedTags.includes(val)) {
                      setSelectedTags(prev => [...prev, val]);
                    }
                  }}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="" disabled>-- Select a strategy tag --</option>
                  {tagDefinitions
                    .filter((t) => !selectedTags.some(sel => sel.toLowerCase() === t.name.toLowerCase()))
                    .map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Add Custom Tag text field */}
              <div className="flex-1">
                <label className="block text-[10px] text-[#8d90a0] mb-1">Create New Custom Tag</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. System, Parlay-Hedging"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const name = customTagInput.trim();
                        if (name) {
                          const lowerName = name.toLowerCase();
                          if (!selectedTags.some(t => t.toLowerCase() === lowerName)) {
                            const exists = tagDefinitions.find(t => t.name.toLowerCase() === lowerName);
                            if (!exists && onAddTagDefinition) {
                              const colors = ['#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#14b8a6'];
                              const randomColor = colors[Math.floor(Math.random() * colors.length)];
                              onAddTagDefinition({
                                id: `tag-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                                name,
                                color: randomColor
                              });
                            }
                            setSelectedTags(prev => [...prev, name]);
                          }
                          setCustomTagInput('');
                        }
                      }
                    }}
                    className="flex-1 bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = customTagInput.trim();
                      if (name) {
                        const lowerName = name.toLowerCase();
                        if (!selectedTags.some(t => t.toLowerCase() === lowerName)) {
                          const exists = tagDefinitions.find(t => t.name.toLowerCase() === lowerName);
                          if (!exists && onAddTagDefinition) {
                            const colors = ['#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#14b8a6'];
                            const randomColor = colors[Math.floor(Math.random() * colors.length)];
                            onAddTagDefinition({
                              id: `tag-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                              name,
                              color: randomColor
                            });
                          }
                          setSelectedTags(prev => [...prev, name]);
                        }
                        setCustomTagInput('');
                      }
                    }}
                    className="px-3 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Add Tag
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
              <input
                type="checkbox"
                checked={isLive}
                onChange={(e) => setIsLive(e.target.checked)}
                className="rounded bg-[#0b1326] border-[#27314a] text-[#2563eb]"
              />
              <span className="flex items-center gap-1">
                <Zap size={13} className="text-amber-400" /> Live / In-Play Wager
              </span>
            </label>

            <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
              <input
                type="checkbox"
                checked={isFreeBet}
                onChange={(e) => setIsFreeBet(e.target.checked)}
                className="rounded bg-[#0b1326] border-[#27314a] text-[#2563eb]"
              />
              <span className="flex items-center gap-1 font-bold">
                <Sparkles size={13} className="text-[#4edea3]" /> Deduct from Free Bet Credits
              </span>
            </label>
          </div>

          {/* Mandatory Free Bet Winnings Destination Selector */}
          {isFreeBet && (
            <div className="bg-[#0b1326] p-3.5 rounded-xl border border-[#2563eb]/40 space-y-2 animate-fade-in">
              <label className="block text-xs font-bold text-[#b4c5ff] flex items-center justify-between">
                <span>Free Bet Winnings Destination</span>
                <span className="text-[10px] text-[#8d90a0] font-normal">Select profit routing upon winning</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <label
                  onClick={() => setFreeBetDestination('cash')}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all flex flex-col gap-1 ${
                    freeBetDestination === 'cash'
                      ? 'bg-[#2563eb]/20 border-[#2563eb] text-white'
                      : 'bg-[#171f33] border-[#27314a] text-[#8d90a0] hover:border-gray-500'
                  }`}
                >
                  <span className="font-bold text-xs flex items-center gap-1.5 text-white">
                    💵 Real Cash Balance <span className="text-[10px] text-[#4edea3] font-mono">(Convert to Cash)</span>
                  </span>
                  <span className="text-[10px] leading-tight text-[#dae2fd]">
                    Full return <span className="font-mono text-white font-bold">(Return)</span> is credited to real cash balance upon winning without deducting the stake.
                  </span>
                </label>

                <label
                  onClick={() => setFreeBetDestination('free_bet')}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all flex flex-col gap-1 ${
                    freeBetDestination === 'free_bet'
                      ? 'bg-[#2563eb]/20 border-[#2563eb] text-white'
                      : 'bg-[#171f33] border-[#27314a] text-[#8d90a0] hover:border-gray-500'
                  }`}
                >
                  <span className="font-bold text-xs flex items-center gap-1.5 text-white">
                    🎟️ Free Bet Bonus Balance <span className="text-[10px] text-amber-400 font-mono">(Rollover)</span>
                  </span>
                  <span className="text-[10px] leading-tight text-[#dae2fd]">
                    Full return/profit is credited back to the sportsbook Free Bet promo balance.
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action Footer */}
        <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs text-[#8d90a0]">Total Odds: </span>
            <span className="text-sm font-mono font-bold text-[#b4c5ff]">@{formatOdds(totalOdds)}</span>
          </div>

          <div>
            <span className="text-xs text-[#8d90a0]">Est. Payout: </span>
            <span className="text-base font-mono font-bold text-[#4edea3]">{formatCurrency(potentialPayout)}</span>
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-sm rounded-lg shadow-lg transition-all cursor-pointer"
          >
            Log Bet to Portfolio
          </button>
        </div>
      </form>

      {/* Inline Add Tipster Modal */}
      {showInlineTipsterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#171f33] border border-[#27314a] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#27314a] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#2563eb]" />
                <span>Create New Tipster Source</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowInlineTipsterModal(false)}
                className="text-[#8d90a0] hover:text-white p-1 rounded-lg hover:bg-[#27314a]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#8d90a0] font-semibold mb-1">
                  Tipster Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. SharpPicks, @JohnDoePicks"
                  value={inlineTipsterName}
                  onChange={(e) => setInlineTipsterName(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded-xl px-3 py-2 text-white placeholder-[#8d90a0] focus:outline-none focus:border-[#2563eb]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[#8d90a0] font-semibold mb-1">Platform</label>
                <select
                  value={inlineTipsterPlatform}
                  onChange={(e) => setInlineTipsterPlatform(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded-xl px-3 py-2 text-white"
                >
                  <option value="Telegram">Telegram</option>
                  <option value="Twitter/X">Twitter/X</option>
                  <option value="Discord">Discord</option>
                  <option value="YouTube">YouTube</option>
                  <option value="VIP Group">VIP Group</option>
                  <option value="Personal Pick">Personal Pick</option>
                  <option value="Website">Website</option>
                </select>
              </div>

              <div>
                <label className="block text-[#8d90a0] font-semibold mb-1.5">Badge Color</label>
                <div className="flex items-center gap-2">
                  {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setInlineTipsterColor(c)}
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform ${
                        inlineTipsterColor === c ? 'scale-110 border-white' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#27314a]">
              <button
                type="button"
                onClick={() => setShowInlineTipsterModal(false)}
                className="px-4 py-2 bg-[#0b1326] text-[#8d90a0] hover:text-white rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!inlineTipsterName.trim() || isCreatingTipster}
                onClick={async () => {
                  if (!inlineTipsterName.trim() || !onAddTipster) return;
                  setIsCreatingTipster(true);
                  try {
                    const newTipster = await onAddTipster({
                      name: inlineTipsterName.trim(),
                      platform: inlineTipsterPlatform,
                      color: inlineTipsterColor
                    });
                    if (newTipster && newTipster.id) {
                      setSelectedTipsterId(newTipster.id);
                    }
                    setShowInlineTipsterModal(false);
                  } catch (err) {
                    console.error('Failed to create tipster:', err);
                  } finally {
                    setIsCreatingTipster(false);
                  }
                }}
                className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {isCreatingTipster ? 'Creating...' : 'Save & Select Tipster'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
