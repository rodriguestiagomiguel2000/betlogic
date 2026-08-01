import React, { useState } from 'react';
import { Bet, BetLeg, Bankroll, Bookmaker, BetType, SportType, TagDefinition } from '../types';
import { formatCurrency, formatOdds, getCurrencySymbol } from '../utils/storage';
import { PlusCircle, Trash2, CheckCircle2, ArrowLeft, Zap, Sparkles } from 'lucide-react';

interface ManualBetEntryProps {
  bankrolls: Bankroll[];
  bookmakers: Bookmaker[];
  activeBankrollId?: string;
  onAddBet: (bet: Omit<Bet, 'id'>) => void;
  onNavigate: (tab: string) => void;
  tagDefinitions: TagDefinition[];
  onAddTagDefinition?: (tag: TagDefinition) => void;
}

export const ManualBetEntry: React.FC<ManualBetEntryProps> = ({
  bankrolls,
  bookmakers,
  activeBankrollId,
  onAddBet,
  onNavigate,
  tagDefinitions,
  onAddTagDefinition
}) => {
  const [betType, setBetType] = useState<BetType>('single');
  const [selectedBookmaker, setSelectedBookmaker] = useState<string>(bookmakers[0]?.id || '');
  const [selectedBankroll, setSelectedBankroll] = useState<string>(
    activeBankrollId && bankrolls.some((b) => b.id === activeBankrollId)
      ? activeBankrollId
      : bankrolls[0]?.id || ''
  );
  const [stake, setStake] = useState<number>(50);
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

  const totalOdds = legs.reduce((acc, leg) => acc * (leg.odds || 1), 1);
  const potentialPayout = stake * totalOdds;

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

  const handleRemoveLeg = (id: string) => {
    if (legs.length === 1) return;
    setLegs(legs.filter((l) => l.id !== id));
  };

  const handleUpdateLeg = (id: string, field: keyof BetLeg, value: any) => {
    setLegs(legs.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (legs.length === 0 || stake <= 0) return;

    onAddBet({
      date: new Date().toISOString(),
      type: betType,
      legs,
      totalOdds: Number(totalOdds.toFixed(3)),
      stake,
      potentialPayout: Number(potentialPayout.toFixed(2)),
      status: 'pending',
      bookmakerId: selectedBookmaker,
      bankrollId: selectedBankroll,
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
              <span className="font-mono text-white font-bold">{formatCurrency(stake)}</span>
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
        {/* Row 1: Bet Type & Bankroll */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        </div>

        {/* Legs Editor Section */}
        <div className="space-y-4 pt-4 border-t border-[#27314a]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Bet Selections / Legs ({legs.length})
            </h3>
            <button
              type="button"
              onClick={handleAddLeg}
              className="text-xs text-[#2563eb] hover:text-[#b4c5ff] font-semibold flex items-center gap-1"
            >
              <PlusCircle size={14} /> Add Another Leg
            </button>
          </div>

          <div className="space-y-3">
            {legs.map((leg, index) => (
              <div
                key={leg.id}
                className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-[#b4c5ff]">Selection #{index + 1}</span>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#8d90a0] mb-1">Sport</label>
                    <select
                      value={leg.sport}
                      onChange={(e) => handleUpdateLeg(leg.id, 'sport', e.target.value as SportType)}
                      className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="Football">Football</option>
                      <option value="Basketball">Basketball</option>
                      <option value="Tennis">Tennis</option>
                      <option value="Baseball">Baseball</option>
                      <option value="Ice Hockey">Ice Hockey</option>
                      <option value="Esports">Esports</option>
                      <option value="MMA">MMA</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#8d90a0] mb-1">Match / Event</label>
                    <input
                      type="text"
                      placeholder="e.g. Arsenal vs Chelsea"
                      value={leg.event}
                      onChange={(e) => handleUpdateLeg(leg.id, 'event', e.target.value)}
                      className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#8d90a0] mb-1">Market & Selection</label>
                    <input
                      type="text"
                      placeholder="e.g. Over 2.5 Goals"
                      value={leg.selection}
                      onChange={(e) => handleUpdateLeg(leg.id, 'selection', e.target.value)}
                      className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white"
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
                      className="w-full bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white font-mono"
                      required
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stake & Toggles Section */}
        <div className="pt-4 border-t border-[#27314a] grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#8d90a0] mb-1">Total Stake Amount ({getCurrencySymbol()})</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-sm font-mono text-white font-bold"
              required
            />
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
                    💵 Real Cash Balance <span className="text-[10px] text-[#4edea3] font-mono">(SNR Default)</span>
                  </span>
                  <span className="text-[10px] leading-tight text-[#dae2fd]">
                    Net profit <span className="font-mono text-white font-bold">(Payout - Stake)</span> is credited to real cash balance upon winning.
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
    </div>
  );
};
