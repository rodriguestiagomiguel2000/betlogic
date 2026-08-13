import React, { useState, useMemo } from 'react';
import { Tipster, Bet } from '../types';
import { formatCurrency, getCurrencySymbol, calculateBetProfit } from '../utils/storage';
import {
  Users,
  Plus,
  Trash2,
  Edit3,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Search,
  MessageSquare,
  Globe,
  X,
  CheckCircle2,
  DollarSign,
  PieChart,
  UserCheck
} from 'lucide-react';

interface TipstersViewProps {
  tipsters: Tipster[];
  bets: Bet[];
  userCurrency?: string;
  onAddTipster: (data: { name: string; platform?: string; notes?: string; color?: string }) => Promise<Tipster>;
  onUpdateTipster?: (id: string, data: Partial<Tipster>) => Promise<void>;
  onDeleteTipster?: (id: string) => Promise<void>;
}

export const TipstersView: React.FC<TipstersViewProps> = ({
  tipsters,
  bets,
  userCurrency = 'USD',
  onAddTipster,
  onUpdateTipster,
  onDeleteTipster
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTipster, setEditingTipster] = useState<Tipster | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('Telegram');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const PLATFORM_OPTIONS = [
    'Telegram',
    'Twitter/X',
    'Discord',
    'Website / Blog',
    'VIP Club',
    'Substack',
    'YouTube',
    'Personal Friend',
    'Other'
  ];

  const COLOR_PRESETS = [
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#ef4444', // Red
    '#8b5cf6', // Purple
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#14b8a6', // Teal
    '#6366f1'  // Indigo
  ];

  const handleOpenAddModal = () => {
    setEditingTipster(null);
    setName('');
    setPlatform('Telegram');
    setNotes('');
    setColor('#3b82f6');
    setShowModal(true);
  };

  const handleOpenEditModal = (t: Tipster) => {
    setEditingTipster(t);
    setName(t.name);
    setPlatform(t.platform || 'Telegram');
    setNotes(t.notes || '');
    setColor(t.color || '#3b82f6');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingTipster) {
        if (onUpdateTipster) {
          await onUpdateTipster(editingTipster.id, {
            name: name.trim(),
            platform,
            notes: notes.trim(),
            color
          });
        }
      } else {
        await onAddTipster({
          name: name.trim(),
          platform,
          notes: notes.trim(),
          color
        });
      }
      setShowModal(false);
    } catch (err: any) {
      alert(`Error saving tipster source: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!onDeleteTipster) return;
    if (!window.confirm('Are you sure you want to delete this tipster? Past bets logged with this tipster will be retained under "My Own Picks".')) {
      return;
    }
    setDeletingId(id);
    try {
      await onDeleteTipster(id);
    } catch (err: any) {
      alert(`Error deleting tipster: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Compute stats per tipster
  const tipsterStatsMap = useMemo(() => {
    const statsMap: Record<string, {
      totalBets: number;
      wonBets: number;
      lostBets: number;
      pendingBets: number;
      staked: number;
      returned: number;
      profit: number;
      roi: number;
      winRate: number;
    }> = {};

    // Initialize stats for each known tipster
    tipsters.forEach((t) => {
      statsMap[t.id] = {
        totalBets: 0,
        wonBets: 0,
        lostBets: 0,
        pendingBets: 0,
        staked: 0,
        returned: 0,
        profit: 0,
        roi: 0,
        winRate: 0
      };
    });

    // Special key for own picks
    statsMap['__MY_OWN_PICKS__'] = {
      totalBets: 0,
      wonBets: 0,
      lostBets: 0,
      pendingBets: 0,
      staked: 0,
      returned: 0,
      profit: 0,
      roi: 0,
      winRate: 0
    };

    bets.forEach((b) => {
      const key = b.tipsterId && statsMap[b.tipsterId] ? b.tipsterId : '__MY_OWN_PICKS__';
      const item = statsMap[key];

      item.totalBets += 1;
      item.staked += b.stake || 0;

      if (b.status === 'won') {
        item.wonBets += 1;
        const ret = b.actualReturn !== undefined ? b.actualReturn : b.potentialPayout;
        item.returned += ret;
        item.profit += calculateBetProfit(b);
      } else if (b.status === 'lost') {
        item.lostBets += 1;
        item.profit += calculateBetProfit(b);
      } else if (b.status === 'pending') {
        item.pendingBets += 1;
      } else if (b.status === 'cashout') {
        if (b.actualReturn !== undefined) item.returned += b.actualReturn;
        item.profit += calculateBetProfit(b);
      }
    });

    // Calculate ROI and Win Rates
    Object.keys(statsMap).forEach((k) => {
      const item = statsMap[k];
      item.roi = item.staked > 0 ? (item.profit / item.staked) * 100 : 0;
      const settled = item.wonBets + item.lostBets;
      item.winRate = settled > 0 ? (item.wonBets / settled) * 100 : 0;
    });

    return statsMap;
  }, [tipsters, bets]);

  // Overall Global Summary
  const globalSummary = useMemo<{
    totalTipsterBets: number;
    totalTipsterStaked: number;
    totalTipsterProfit: number;
    tipsterRoi: number;
    topTipster: Tipster | null;
  }>(() => {
    let totalTipsterBets = 0;
    let totalTipsterStaked = 0;
    let totalTipsterProfit = 0;

    tipsters.forEach((t) => {
      const s = tipsterStatsMap[t.id];
      if (s) {
        totalTipsterBets += s.totalBets;
        totalTipsterStaked += s.staked;
        totalTipsterProfit += s.profit;
      }
    });

    const tipsterRoi = totalTipsterStaked > 0 ? (totalTipsterProfit / totalTipsterStaked) * 100 : 0;

    // Find top performing tipster (minimum 1 bet settled)
    let best: Tipster | null = null;
    let highestRoi = -999999;

    tipsters.forEach((t) => {
      const s = tipsterStatsMap[t.id];
      if (s && s.totalBets > 0 && s.roi > highestRoi) {
        highestRoi = s.roi;
        best = t;
      }
    });

    return {
      totalTipsterBets,
      totalTipsterStaked,
      totalTipsterProfit,
      tipsterRoi,
      topTipster: best
    };
  }, [tipsters, tipsterStatsMap]);

  // Filter tipsters by search
  const filteredTipsters = tipsters.filter((t) => {
    const q = searchTerm.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.platform && t.platform.toLowerCase().includes(q)) ||
      (t.notes && t.notes.toLowerCase().includes(q))
    );
  });

  const ownPicksStats = tipsterStatsMap['__MY_OWN_PICKS__'];

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto pb-24 md:pb-12">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#171f33] p-6 rounded-xl border border-[#27314a]">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Users className="text-[#3b82f6]" size={24} />
            <span>Tipster & Advisory Sources</span>
          </h2>
          <p className="text-xs text-[#8d90a0] mt-1">
            Track individual tipster yield, ROI %, win rates, and compare third-party advisors against your unassisted own picks.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <Plus size={16} />
          <span>Add Tipster Source</span>
        </button>
      </div>

      {/* Global High-Level Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#8d90a0]">
            <span>Active Sources</span>
            <Users size={16} className="text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{tipsters.length}</div>
          <p className="text-[11px] text-[#8d90a0]">Tracked betting tipsters</p>
        </div>

        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#8d90a0]">
            <span>Advisory Wagers</span>
            <Target size={16} className="text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{globalSummary.totalTipsterBets}</div>
          <p className="text-[11px] text-[#8d90a0]">Total bets from tipsters</p>
        </div>

        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#8d90a0]">
            <span>Tipster P&L</span>
            {globalSummary.totalTipsterProfit >= 0 ? (
              <TrendingUp size={16} className="text-[#4edea3]" />
            ) : (
              <TrendingDown size={16} className="text-rose-400" />
            )}
          </div>
          <div className={`text-2xl font-black font-mono ${
            globalSummary.totalTipsterProfit >= 0 ? 'text-[#4edea3]' : 'text-rose-400'
          }`}>
            {globalSummary.totalTipsterProfit >= 0 ? '+' : ''}
            {formatCurrency(globalSummary.totalTipsterProfit, userCurrency)}
          </div>
          <p className="text-[11px] text-[#8d90a0]">
            Combined Yield: <span className="font-bold">{globalSummary.tipsterRoi.toFixed(1)}% ROI</span>
          </p>
        </div>

        <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#8d90a0]">
            <span>Top Performing</span>
            <Award size={16} className="text-amber-400" />
          </div>
          <div className="text-base font-bold text-white truncate">
            {globalSummary.topTipster ? globalSummary.topTipster.name : 'N/A'}
          </div>
          <p className="text-[11px] text-amber-400 font-medium">
            {globalSummary.topTipster
              ? `${tipsterStatsMap[globalSummary.topTipster.id]?.roi.toFixed(1)}% ROI`
              : 'Log wagers to rank'}
          </p>
        </div>
      </div>

      {/* Main List Section */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8d90a0]" />
            <input
              type="text"
              placeholder="Search tipster name, platform, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#171f33] border border-[#27314a] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#2563eb]"
            />
          </div>

          <div className="text-xs text-[#8d90a0]">
            Showing <strong className="text-white">{filteredTipsters.length}</strong> of {tipsters.length} sources
          </div>
        </div>

        {/* Unassisted "My Own Picks" Card Benchmark */}
        <div className="bg-gradient-to-r from-[#11192e] to-[#18233c] p-6 rounded-xl border border-indigo-500/30 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#27314a] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-black">
                <UserCheck size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">My Own Unassisted Picks</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
                    Personal Benchmark
                  </span>
                </div>
                <p className="text-xs text-[#8d90a0]">Wagers placed directly without any external advisory service</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-[#8d90a0] block text-[10px]">TOTAL BETS</span>
                <span className="text-white font-bold">{ownPicksStats.totalBets}</span>
              </div>
              <div>
                <span className="text-[#8d90a0] block text-[10px]">WIN RATE</span>
                <span className="text-indigo-300 font-bold">{ownPicksStats.winRate.toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-[#8d90a0] block text-[10px]">NET PROFIT</span>
                <span className={`font-bold ${ownPicksStats.profit >= 0 ? 'text-[#4edea3]' : 'text-rose-400'}`}>
                  {ownPicksStats.profit >= 0 ? '+' : ''}{formatCurrency(ownPicksStats.profit, userCurrency)}
                </span>
              </div>
              <div>
                <span className="text-[#8d90a0] block text-[10px]">ROI %</span>
                <span className={`font-bold ${ownPicksStats.roi >= 0 ? 'text-[#4edea3]' : 'text-rose-400'}`}>
                  {ownPicksStats.roi >= 0 ? '+' : ''}{ownPicksStats.roi.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tipster Grid */}
        {filteredTipsters.length === 0 ? (
          <div className="bg-[#171f33] p-12 rounded-xl border border-[#27314a] text-center space-y-3">
            <Users size={36} className="mx-auto text-[#8d90a0]" />
            <h3 className="text-base font-bold text-white">No Tipster Sources Found</h3>
            <p className="text-xs text-[#8d90a0] max-w-sm mx-auto">
              {searchTerm
                ? 'No tipsters match your search query.'
                : 'Click "Add Tipster Source" to start tracking Telegram groups, handicappers, and advisory platforms.'}
            </p>
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2 bg-[#2563eb] text-white text-xs font-bold rounded-lg shadow inline-flex items-center gap-1.5 cursor-pointer mt-2"
            >
              <Plus size={14} /> Add First Tipster
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTipsters.map((t) => {
              const stats = tipsterStatsMap[t.id] || {
                totalBets: 0,
                wonBets: 0,
                lostBets: 0,
                pendingBets: 0,
                staked: 0,
                returned: 0,
                profit: 0,
                roi: 0,
                winRate: 0
              };
              const themeColor = t.color || '#3b82f6';

              return (
                <div
                  key={t.id}
                  className="bg-[#171f33] rounded-xl border border-[#27314a] overflow-hidden flex flex-col justify-between hover:border-[#27314a]/80 transition-all shadow-lg group"
                >
                  {/* Top Color Accent Line */}
                  <div style={{ backgroundColor: themeColor }} className="h-1.5 w-full" />

                  <div className="p-5 space-y-4 flex-1">
                    {/* Title Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: themeColor }}
                          />
                          <h3 className="text-base font-bold text-white group-hover:text-indigo-200 transition-colors">
                            {t.name}
                          </h3>
                        </div>
                        {t.platform && (
                          <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-[#0b1326] text-[#8d90a0] px-2 py-0.5 rounded border border-[#27314a]">
                            {t.platform}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditModal(t)}
                          className="p-1.5 text-[#8d90a0] hover:text-white hover:bg-[#0b1326] rounded transition-colors cursor-pointer"
                          title="Edit tipster"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deletingId === t.id}
                          className="p-1.5 text-[#8d90a0] hover:text-rose-400 hover:bg-[#0b1326] rounded transition-colors cursor-pointer"
                          title="Delete tipster"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {t.notes && (
                      <p className="text-xs text-[#8d90a0] line-clamp-2 bg-[#0b1326]/60 p-2.5 rounded-lg border border-[#27314a]/50">
                        {t.notes}
                      </p>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-[#0b1326] p-3 rounded-lg border border-[#27314a] space-y-0.5">
                        <span className="text-[10px] text-[#8d90a0] font-bold uppercase tracking-wider">Total Bets</span>
                        <div className="text-sm font-bold text-white font-mono">{stats.totalBets}</div>
                        <div className="text-[10px] text-[#8d90a0] font-medium">
                          {stats.wonBets}W - {stats.lostBets}L ({stats.pendingBets} open)
                        </div>
                      </div>

                      <div className="bg-[#0b1326] p-3 rounded-lg border border-[#27314a] space-y-0.5">
                        <span className="text-[10px] text-[#8d90a0] font-bold uppercase tracking-wider">Win Rate</span>
                        <div className="text-sm font-bold text-white font-mono">{stats.winRate.toFixed(1)}%</div>
                        <div className="text-[10px] text-[#8d90a0] font-medium">Settled wagers</div>
                      </div>

                      <div className="bg-[#0b1326] p-3 rounded-lg border border-[#27314a] space-y-0.5">
                        <span className="text-[10px] text-[#8d90a0] font-bold uppercase tracking-wider">Total Staked</span>
                        <div className="text-sm font-bold text-white font-mono">
                          {formatCurrency(stats.staked, userCurrency)}
                        </div>
                      </div>

                      <div className="bg-[#0b1326] p-3 rounded-lg border border-[#27314a] space-y-0.5">
                        <span className="text-[10px] text-[#8d90a0] font-bold uppercase tracking-wider">Net Profit</span>
                        <div className={`text-sm font-bold font-mono ${
                          stats.profit >= 0 ? 'text-[#4edea3]' : 'text-rose-400'
                        }`}>
                          {stats.profit >= 0 ? '+' : ''}{formatCurrency(stats.profit, userCurrency)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Footer Yield Bar */}
                  <div className="p-3 bg-[#0b1326] border-t border-[#27314a] flex items-center justify-between text-xs">
                    <span className="text-[#8d90a0] font-medium">Tipster ROI Yield:</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                      stats.roi >= 0
                        ? 'bg-[#00a572]/20 text-[#4edea3] border border-[#00a572]/30'
                        : 'bg-rose-950/40 text-rose-400 border border-rose-900/40'
                    }`}>
                      {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(1)}% ROI
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Tipster Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#171f33] border border-[#27314a] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#27314a] pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users size={18} className="text-[#3b82f6]" />
                <span>{editingTipster ? 'Edit Tipster Source' : 'Add New Tipster Source'}</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#8d90a0] hover:text-white p-1 rounded-lg hover:bg-[#0b1326]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white mb-1">Tipster / Source Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VegasSharp, Alex Telegram Picks"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#2563eb]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white mb-1">Platform / Channel</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#2563eb]"
                >
                  {PLATFORM_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white mb-1">Badge Color Theme</label>
                <div className="flex items-center gap-2.5 mb-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                        color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white mb-1">Notes / Subscription Info (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="e.g. VIP Telegram channel ($50/mo), specializes in NBA Player Props"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-[#0b1326] border border-[#27314a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#2563eb]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-[#0b1326] text-xs font-semibold text-[#8d90a0] hover:text-white rounded-xl border border-[#27314a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="px-5 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 size={15} />
                  <span>{editingTipster ? 'Save Changes' : 'Create Tipster'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
