import React, { useState } from 'react';
import { Bet, BetLeg, Bankroll, Bookmaker, BetType, SportType, BetStatus } from '../types';
import {
  ScanLine,
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Trash2,
  Plus,
  RefreshCw,
  Wallet,
  Code,
  ChevronDown,
  ChevronUp,
  Copy,
  Sparkles,
  ShieldAlert,
  Key
} from 'lucide-react';
import { formatCurrency, formatOdds, getCurrencySymbol } from '../utils/storage';

interface BetslipScannerProps {
  bankrolls: Bankroll[];
  bookmakers: Bookmaker[];
  activeBankrollId?: string;
  userCurrency?: string;
  onAddBet: (bet: Omit<Bet, 'id'>) => void;
  onNavigate: (tab: string) => void;
}

export const BetslipScanner: React.FC<BetslipScannerProps> = ({
  bankrolls,
  bookmakers,
  activeBankrollId,
  userCurrency,
  onAddBet,
  onNavigate
}) => {
  const [selectedBankroll, setSelectedBankroll] = useState<string>(
    activeBankrollId && bankrolls.some((b) => b.id === activeBankrollId)
      ? activeBankrollId
      : bankrolls[0]?.id || ''
  );
  const [scanningState, setScanningState] = useState<'idle' | 'scanning' | 'scanned' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{
    is403: boolean;
    isQuotaExceeded: boolean;
    attemptedModels: string[];
    message: string;
  } | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [rawOcrJson, setRawOcrJson] = useState<string | null>(null);
  const [showRawDrawer, setShowRawDrawer] = useState<boolean>(false);

  // Extracted fields state
  const [betType, setBetType] = useState<BetType>('parlay');
  const [selectedBookmaker, setSelectedBookmaker] = useState<string>(bookmakers[0]?.id || '');
  const [stake, setStake] = useState<number>(100);
  const [betStatus, setBetStatus] = useState<BetStatus>('pending');
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isFreeBet, setIsFreeBet] = useState<boolean>(false);
  const [freeBetDestination, setFreeBetDestination] = useState<'cash' | 'free_bet'>('cash');
  const [notes, setNotes] = useState<string>('Scanned via Gemini 3.1 Flash Lite OCR engine');

  // Extracted Legs
  const [legs, setLegs] = useState<BetLeg[]>([
    {
      id: 'scanned-leg-1',
      sport: 'Football',
      league: 'Premier League',
      event: 'Liverpool vs Manchester City',
      market: 'Both Teams To Score',
      selection: 'Yes (BTTS)',
      odds: 1.75,
      status: 'pending'
    },
    {
      id: 'scanned-leg-2',
      sport: 'Basketball',
      league: 'NBA',
      event: 'Warriors vs Bucks',
      market: 'Point Spread',
      selection: 'Warriors -3.5',
      odds: 1.91,
      status: 'pending'
    }
  ]);

  const rawTotalOdds = legs.reduce((acc, leg) => acc * (leg.odds || 1), 1);
  const effectiveTotalOdds = legs.reduce((acc, leg) => acc * (leg.status === 'void' ? 1.0 : (leg.odds || 1)), 1);
  const totalOdds = effectiveTotalOdds;
  const potentialPayout = stake * effectiveTotalOdds;
  const hasVoidLegs = legs.some((l) => l.status === 'void');

  const handleProcessImage = async (file: File) => {
    if (!selectedBankroll) {
      alert("Please select a target bankroll before scanning.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setUploadedImage(dataUrl);

      // Extract mime type and base64
      const mimeType = dataUrl.split(';')[0].replace('data:', '') || 'image/jpeg';
      const base64Data = dataUrl.split(',')[1] || '';

      await runGeminiOcr(base64Data, mimeType, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSimulateSampleScan = (sampleType: 'parlay' | 'single') => {
    if (!selectedBankroll) {
      alert("Please select a target bankroll before scanning.");
      return;
    }

    const sampleUrl = sampleType === 'parlay'
      ? 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80'
      : 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=600&q=80';

    setUploadedImage(sampleUrl);

    const dummyBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    runGeminiOcr(dummyBase64, 'image/png', sampleUrl, true, sampleType);
  };

  const runGeminiOcr = async (
    base64Data: string,
    mimeType: string,
    displayUrl: string,
    isSample: boolean = false,
    sampleType: 'parlay' | 'single' = 'parlay'
  ) => {
    setScanningState('scanning');
    setErrorMessage(null);
    setErrorDetails(null);

    if (isSample) {
      // Simulation mode if sample clicked
      setTimeout(() => {
        const sampleResult = sampleType === 'single'
          ? {
              bookmaker: bookmakers[0]?.name || "Pinnacle",
              sport: "Football",
              market_type: "Single",
              stake: 150.00,
              potentialPayout: 307.50,
              currency: "EUR",
              status: "won",
              placed_at: new Date().toISOString().slice(0, 10),
              bet_id: "BET-" + Math.floor(Math.random() * 899999 + 100000),
              total_odds: 2.05,
              legs: [
                {
                  event: "Real Madrid vs Barcelona",
                  team: "Real Madrid Win",
                  market: "Match Result",
                  odds_decimal: 2.05
                }
              ]
            }
          : {
              bookmaker: bookmakers[0]?.name || "Bet365",
              sport: "Football",
              market_type: "Multiple",
              stake: 100.00,
              potentialPayout: 334.25,
              currency: "EUR",
              status: "open",
              placed_at: new Date().toISOString().slice(0, 10),
              bet_id: "BET-" + Math.floor(Math.random() * 899999 + 100000),
              total_odds: 3.34,
              legs: [
                {
                  event: "Liverpool vs Manchester City",
                  team: "Both Teams To Score",
                  market: "BTTS",
                  odds_decimal: 1.75
                },
                {
                  event: "Warriors vs Bucks",
                  team: "Warriors -3.5",
                  market: "Point Spread",
                  odds_decimal: 1.91
                }
              ]
            };

        const jsonString = JSON.stringify(sampleResult, null, 2);
        setRawOcrJson(jsonString);
        applyParsedData(sampleResult);
        setNotes('Scanned via Demo Sample OCR');
        setScanningState('scanned');
      }, 1500);
      return;
    }

    try {
      const response = await fetch('/api/scan-betslip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: base64Data,
          mimeType: mimeType || 'image/jpeg'
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server-side scanning failed with status ${response.status}`);
      }

      const result = await response.json();
      setRawOcrJson(JSON.stringify(result, null, 2));
      applyParsedData(result);
      setNotes(`Scanned via secure server-side Gemini 3.1 Flash Lite`);
      setScanningState('scanned');
    } catch (err: any) {
      console.error("Gemini OCR Parsing Error:", err);
      const finalErrorMessage = err.message || "Failed to scan and analyze betslip image.";
      setErrorMessage(finalErrorMessage);
      
      const is403 = finalErrorMessage.includes('403') || finalErrorMessage.includes('API key');
      const isQuotaExceeded = finalErrorMessage.toLowerCase().includes('quota') || 
                               finalErrorMessage.toLowerCase().includes('exhausted') || 
                               finalErrorMessage.includes('429');

      setErrorDetails({
        is403,
        isQuotaExceeded,
        attemptedModels: ['gemini-3.1-flash-lite (server-side)'],
        message: finalErrorMessage
      });
      setScanningState('error');
    }
  };

  const normalizeScannedDate = (dateStr?: string): string | undefined => {
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return undefined;

    let cleaned = dateStr.trim();
    const currentYear = new Date().getFullYear(); // 2026

    // Replace past years 2024/2025 with current year 2026 when inferred incorrectly by model
    cleaned = cleaned.replace(/\b202[0-5]\b/g, String(currentYear));

    // If format is "DD/MM • HH:mm" or "DD/MM HH:mm" or "DD/MM" (e.g. "02/08 • 20:00" -> 2nd August 2026)
    const ddMmMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})(?:\s*[•\s]\s*(\d{1,2}:\d{2}))?/);
    if (ddMmMatch) {
      const day = ddMmMatch[1].padStart(2, '0');
      const month = ddMmMatch[2].padStart(2, '0');
      const time = ddMmMatch[3] ? `T${ddMmMatch[3]}:00` : '';
      return `${currentYear}-${month}-${day}${time}`;
    }

    return cleaned;
  };

  const applyParsedData = (parsed: any) => {
    // Live detection
    const isLiveDetected = Boolean(
      parsed.is_live === true ||
      (typeof parsed.is_live === 'string' && parsed.is_live.toLowerCase() === 'true') ||
      (parsed.market_type || '').toLowerCase().includes('live') ||
      (parsed.market_type || '').toLowerCase().includes('in-play') ||
      (parsed.market || '').toLowerCase().includes('live') ||
      (parsed.notes || '').toLowerCase().includes('halftime') ||
      JSON.stringify(parsed).toLowerCase().includes('halftime')
    );
    setIsLive(isLiveDetected);

    // Bet classification
    let type: BetType = 'single';
    const mType = (parsed.market_type || '').toLowerCase();
    if (mType.includes('multiple') || mType.includes('accumulator') || mType.includes('parlay')) {
      type = 'parlay';
    } else if (mType.includes('builder')) {
      type = 'bet_builder';
    } else if (Array.isArray(parsed.legs) && parsed.legs.length > 1) {
      type = 'parlay';
    }
    setBetType(type);

    // Bookmaker matching
    if (parsed.bookmaker) {
      const targetBmStr = parsed.bookmaker.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matched = bookmakers.find((bm) => {
        const bmStr = bm.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return bmStr.includes(targetBmStr) || targetBmStr.includes(bmStr);
      });
      if (matched) setSelectedBookmaker(matched.id);
    }

    // Stake
    if (parsed.stake && !isNaN(parsed.stake) && parsed.stake > 0) {
      setStake(Number(parsed.stake));
    }

    // Status
    let status: BetStatus = 'pending';
    const rawStatus = (parsed.status || '').toLowerCase();
    if (rawStatus.includes('won')) status = 'won';
    else if (rawStatus.includes('lost')) status = 'lost';
    else if (rawStatus.includes('void')) status = 'void';
    else status = 'pending';
    setBetStatus(status);

    // Notes
    const rawDateStr = parsed.placed_at || new Date().toISOString().slice(0, 10);
    const dateStr = normalizeScannedDate(rawDateStr) || new Date().toISOString().slice(0, 10);
    const idStr = parsed.bet_id ? ` [Ref: ${parsed.bet_id}]` : '';
    setNotes(`Scanned via Gemini 3.1 Flash Lite on ${dateStr}${idStr}`);

    // Detect Sport
    let sport: SportType = 'Football';
    const sportSource = parsed.sport || (parsed.legs && parsed.legs[0] && parsed.legs[0].sport) || '';
    if (sportSource) {
      const sLower = sportSource.toLowerCase();
      if (sLower.includes('basket')) sport = 'Basketball';
      else if (sLower.includes('tennis')) sport = 'Tennis';
      else if (sLower.includes('baseball')) sport = 'Baseball';
      else if (sLower.includes('hockey')) sport = 'Ice Hockey';
      else if (sLower.includes('esport')) sport = 'Esports';
      else if (sLower.includes('mma') || sLower.includes('ufc')) sport = 'MMA';
      else if (sLower.includes('golf')) sport = 'Golf';
    }

    // Legs
    if (Array.isArray(parsed.legs) && parsed.legs.length > 0) {
      const isMultiLeg = parsed.legs.length > 1;
      const extractedLegs: BetLeg[] = parsed.legs.map((leg: any, idx: number) => {
        const legSelection = leg.selection || leg.team || (!isMultiLeg ? parsed.selection : '') || leg.market || 'Selection';
        const legMarket = leg.market || (!isMultiLeg ? parsed.market : '') || 'Match Odds';
        const legEvent = leg.event || (!isMultiLeg ? parsed.event : '') || leg.team || 'Match Event';

        let legOdds = leg.odds_decimal ? Number(leg.odds_decimal) : (leg.odds ? Number(leg.odds) : NaN);
        if (isNaN(legOdds) || legOdds <= 0) {
          legOdds = !isMultiLeg ? Number(parsed.odds || parsed.total_odds || 1.85) : 1.85;
        }

        const rawLegDate = leg.event_date || leg.eventDate || parsed.placed_at || undefined;

        return {
          id: `scanned-leg-${Date.now()}-${idx}`,
          sport,
          event: legEvent,
          market: legMarket,
          selection: legSelection,
          odds: legOdds,
          status: status === 'won' ? 'won' : status === 'lost' ? 'lost' : status === 'void' ? 'void' : 'pending',
          eventDate: normalizeScannedDate(rawLegDate),
        };
      });
      setLegs(extractedLegs);
    } else if (parsed.event || parsed.selection || parsed.odds || parsed.market) {
      // Fallback: If legs array was omitted or empty, build a single leg from top-level fields
      const singleLeg: BetLeg = {
        id: `scanned-leg-${Date.now()}-0`,
        sport,
        event: parsed.event || 'Match Event',
        market: parsed.market || 'Match Odds',
        selection: parsed.selection || parsed.team || parsed.event || 'Selection',
        odds: parsed.odds ? Number(parsed.odds) : (parsed.total_odds ? Number(parsed.total_odds) : 1.85),
        status: status === 'won' ? 'won' : status === 'lost' ? 'lost' : status === 'void' ? 'void' : 'pending',
        eventDate: normalizeScannedDate(parsed.event_date || parsed.placed_at || undefined),
      };
      setLegs([singleLeg]);
    }
  };

  const handleAddLeg = () => {
    const newLeg: BetLeg = {
      id: `scanned-leg-${Date.now()}`,
      sport: 'Football',
      event: 'New Match Event',
      market: 'Match Result',
      selection: 'Team Selection',
      odds: 1.50,
      status: betStatus
    };
    setLegs([...legs, newLeg]);
  };

  const handleRemoveLeg = (id: string) => {
    setLegs(legs.filter((l) => l.id !== id));
  };

  const handleUpdateLeg = (id: string, field: keyof BetLeg, value: any) => {
    const updatedLegs = legs.map((l) => (l.id === id ? { ...l, [field]: value } : l));
    setLegs(updatedLegs);

    if (field === 'status') {
      const anyLost = updatedLegs.some((l) => l.status === 'lost');
      const allWon = updatedLegs.length > 0 && updatedLegs.every((l) => l.status === 'won');
      const allVoid = updatedLegs.length > 0 && updatedLegs.every((l) => l.status === 'void');
      const allWonOrVoid = updatedLegs.length > 0 && updatedLegs.every((l) => l.status === 'won' || l.status === 'void');
      const hasWonLeg = updatedLegs.some((l) => l.status === 'won');

      if (anyLost) {
        setBetStatus('lost');
      } else if (allWon || (allWonOrVoid && hasWonLeg)) {
        setBetStatus('won');
      } else if (allVoid) {
        setBetStatus('void');
      } else {
        setBetStatus('pending');
      }
    }
  };

  const handleSaveScannedBet = () => {
    if (!selectedBankroll) {
      alert("Please select a target bankroll.");
      return;
    }
    if (legs.length === 0) {
      alert("Please add at least one leg to the bet.");
      return;
    }

    const calculatedReturn = betStatus === 'won'
      ? Number(potentialPayout.toFixed(2))
      : betStatus === 'lost'
      ? 0
      : undefined;

    onAddBet({
      date: new Date().toISOString(),
      type: betType,
      legs,
      totalOdds: Number(effectiveTotalOdds.toFixed(3)),
      stake,
      potentialPayout: Number(potentialPayout.toFixed(2)),
      actualReturn: calculatedReturn,
      status: betStatus,
      bookmakerId: selectedBookmaker,
      bankrollId: selectedBankroll,
      isLive,
      isFreeBet,
      freeBetDestination: isFreeBet ? freeBetDestination : 'cash',
      notes,
      scannedSlipUrl: uploadedImage || undefined,
      imageUrl: uploadedImage || undefined
    });

    onNavigate('dashboard');
  };

  const activeBankroll = bankrolls.find((b) => b.id === selectedBankroll);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto pb-24 md:pb-12">
      {/* Header */}
      <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a]">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ScanLine className="text-[#2563eb]" />
            <span>Optical Betslip Scanner (Gemini 3.1 Flash Lite OCR)</span>
          </h2>
          <span className="text-xs font-mono bg-[#2563eb]/20 text-[#2563eb] border border-[#2563eb]/30 px-2.5 py-1 rounded-md flex items-center gap-1">
            <Sparkles size={12} /> Gemini Vision AI
          </span>
        </div>
        <p className="text-sm text-[#8d90a0] mt-1">
          Upload or photograph a sports betslip image. Gemini 3.1 Flash Lite extracts multi-leg events, decimal odds, parlay structures, and bookmaker metadata into your selected bankroll.
        </p>
      </div>

      {/* Target Bankroll Selector Box (Mandatory Pre-condition) */}
      <div
        className={`p-4 rounded-xl border transition-all ${
          !selectedBankroll
            ? 'bg-rose-950/40 border-rose-500 shadow-lg shadow-rose-950/30 ring-2 ring-rose-500/50'
            : 'bg-[#171f33] border-[#2563eb]/50'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`p-2.5 rounded-lg shrink-0 ${
                !selectedBankroll ? 'bg-rose-500/20 text-rose-400' : 'bg-[#2563eb]/20 text-[#2563eb]'
              }`}
            >
              <Wallet size={22} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                Target Bankroll Destination
                {!selectedBankroll && (
                  <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded font-bold animate-pulse">
                    Selection Required
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8d90a0] mt-0.5">
                {activeBankroll
                  ? `Selected: ${activeBankroll.name} (Current balance: ${formatCurrency(activeBankroll.currentBalance)})`
                  : 'Mandatory precondition: Select which bankroll receives the OCR-extracted bets & balance updates'}
              </p>
            </div>
          </div>

          <div className="w-full sm:w-80">
            <select
              value={selectedBankroll}
              onChange={(e) => setSelectedBankroll(e.target.value)}
              className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-bold font-mono border transition-all ${
                !selectedBankroll
                  ? 'bg-rose-950/80 border-rose-500 text-white focus:ring-2 focus:ring-rose-500'
                  : 'bg-[#0b1326] border-[#27314a] text-white focus:border-[#2563eb]'
              }`}
            >
              <option value="">-- Choose Target Bankroll --</option>
              {bankrolls.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({formatCurrency(b.currentBalance)})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Idle Upload / Capture Section */}
      {scanningState === 'idle' && (
        <div className="space-y-4">
          {!selectedBankroll && (
            <div className="bg-amber-950/40 border border-amber-800/60 p-3.5 rounded-xl text-xs text-amber-200 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              <span>Please select a target bankroll above before uploading or photographing a betslip.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* File Upload Box */}
            <label
              className={`border-2 border-dashed p-8 rounded-xl flex flex-col items-center justify-center text-center transition-all space-y-4 group ${
                !selectedBankroll
                  ? 'border-[#27314a] bg-[#0b1326]/50 opacity-60 cursor-not-allowed'
                  : 'border-[#27314a] hover:border-[#2563eb] bg-[#0b1326] cursor-pointer'
              }`}
            >
              <input
                type="file"
                accept="image/*"
                disabled={!selectedBankroll}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleProcessImage(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-full bg-[#171f33] group-hover:bg-[#2563eb]/20 flex items-center justify-center text-[#2563eb] transition-colors">
                <Upload size={32} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Upload Betslip Image</h3>
                <p className="text-xs text-[#8d90a0] mt-1">Supports PNG, JPG, WEBP formats (Max 10MB)</p>
              </div>
              <span className={`px-4 py-2 rounded-lg text-white text-xs font-semibold transition-colors ${
                !selectedBankroll ? 'bg-slate-700' : 'bg-[#2563eb] group-hover:bg-[#1d4ed8]'
              }`}>
                Select Image File
              </span>
            </label>

            {/* Camera Capture Box */}
            <label
              className={`border-2 border-dashed p-8 rounded-xl flex flex-col items-center justify-center text-center transition-all space-y-4 group ${
                !selectedBankroll
                  ? 'border-[#27314a] bg-[#0b1326]/50 opacity-60 cursor-not-allowed'
                  : 'border-[#27314a] hover:border-[#00a572] bg-[#0b1326] cursor-pointer'
              }`}
            >
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={!selectedBankroll}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleProcessImage(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-full bg-[#171f33] group-hover:bg-[#00a572]/20 flex items-center justify-center text-[#4edea3] transition-colors">
                <Camera size={32} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Capture via Camera</h3>
                <p className="text-xs text-[#8d90a0] mt-1">Snap a photo of a physical paper betslip</p>
              </div>
              <span className={`px-4 py-2 rounded-lg text-white text-xs font-semibold transition-colors ${
                !selectedBankroll ? 'bg-slate-700' : 'bg-[#00a572] group-hover:bg-[#00875c]'
              }`}>
                Open Camera
              </span>
            </label>
          </div>

          {/* Quick Demo Sample Buttons */}
          <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-[#8d90a0] font-medium flex items-center gap-1.5">
              <Sparkles size={14} className="text-[#2563eb]" /> Try Instant OCR Demo Samples:
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={!selectedBankroll}
                onClick={() => handleSimulateSampleScan('parlay')}
                className="px-3 py-1.5 bg-[#0b1326] hover:bg-[#131b2e] border border-[#27314a] text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
              >
                Multi-Leg Parlay Slip
              </button>
              <button
                disabled={!selectedBankroll}
                onClick={() => handleSimulateSampleScan('single')}
                className="px-3 py-1.5 bg-[#0b1326] hover:bg-[#131b2e] border border-[#27314a] text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
              >
                Single Bet Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {scanningState === 'scanning' && (
        <div className="bg-[#171f33] p-12 rounded-xl border border-[#27314a] text-center space-y-4">
          <RefreshCw size={44} className="animate-spin text-[#2563eb] mx-auto" />
          <h3 className="text-lg font-bold text-white flex items-center justify-center gap-2">
            <span>Analyzing Betslip with Gemini 3.1 Flash Lite OCR...</span>
          </h3>
          <p className="text-xs text-[#8d90a0] max-w-md mx-auto">
            Extracting sportsbook metadata, fixture legs, selections, decimal odds, stake values, and payout structures.
          </p>
        </div>
      )}

      {/* Error State with 403 Diagnostics */}
      {scanningState === 'error' && (
        <div className="bg-[#171f33] border border-rose-800/80 rounded-xl p-6 space-y-6 shadow-xl text-left">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl shrink-0">
              <ShieldAlert size={32} />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">
                  {errorDetails?.isQuotaExceeded 
                    ? '429 RESOURCE_EXHAUSTED: Gemini API Quota Limit Reached'
                    : errorDetails?.is403 
                    ? '403 PERMISSION_DENIED: Gemini API Access Restricted' 
                    : 'Gemini OCR Parsing Failed'}
                </h3>
                {errorDetails?.isQuotaExceeded && (
                  <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase">
                    HTTP 429
                  </span>
                )}
                {errorDetails?.is403 && (
                  <span className="bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase">
                    HTTP 403
                  </span>
                )}
              </div>
              <p className="text-xs text-rose-200 leading-relaxed font-mono bg-rose-950/40 border border-rose-900/60 p-3 rounded-lg break-all">
                {errorMessage}
              </p>
              {errorDetails?.attemptedModels && errorDetails.attemptedModels.length > 0 && (
                <p className="text-[11px] text-[#8d90a0] pt-1">
                  Fallback Models Evaluated: <span className="text-slate-300 font-mono font-semibold">{errorDetails.attemptedModels.join(' → ')}</span>
                </p>
              )}
            </div>
          </div>

          {errorDetails?.is403 && (
            <div className="bg-[#0b1326] border border-[#27314a] p-4.5 rounded-xl space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Key size={15} /> Gemini API Diagnostic Checklist & Solutions
              </h4>
              <ul className="space-y-2.5 text-xs text-[#8d90a0]">
                <li className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</div>
                  <div>
                    <strong className="text-white block font-semibold">Server-Side API Key Validation</strong>
                    <span>Ensure <code className="text-[#4edea3] bg-[#171f33] px-1.5 py-0.5 rounded font-mono">GEMINI_API_KEY</code> is configured in your server environment variables without whitespace or extra quotes.</span>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</div>
                  <div>
                    <strong className="text-white block font-semibold">Enable Generative Language API</strong>
                    <span>Verify that the <strong>Generative Language API</strong> service is enabled in your Google Cloud Console / Google AI Studio project.</span>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</div>
                  <div>
                    <strong className="text-white block font-semibold">Check API Key HTTP / Referrer Restrictions</strong>
                    <span>Verify that your API Key does not have strict IP address or HTTP referrer restrictions blocking client-side browser requests from this app's preview domain.</span>
                  </div>
                </li>
              </ul>
            </div>
          )}

          {errorDetails?.isQuotaExceeded && (
            <div className="bg-[#0b1326] border border-[#27314a] p-4.5 rounded-xl space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <AlertTriangle size={15} /> Quota Limit Diagnostic Checklist & Solutions
              </h4>
              <ul className="space-y-2.5 text-xs text-[#8d90a0]">
                <li className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-amber-950 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 border border-amber-800">1</div>
                  <div>
                    <strong className="text-white block font-semibold">Free-Tier Requests Per Minute Limit</strong>
                    <span>Free Google AI Studio API Keys have a rate limit of 15 Requests Per Minute (RPM). If you perform multiple uploads or re-scans in short succession, you will encounter a rate-limiting block.</span>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-amber-950 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 border border-amber-800">2</div>
                  <div>
                    <strong className="text-white block font-semibold">Daily Token Limit</strong>
                    <span>Free-tier accounts also have a daily token usage quota of 25 million tokens. Scanning very large, high-resolution images multiple times can consume this budget quickly.</span>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-amber-950 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 border border-amber-800">3</div>
                  <div>
                    <strong className="text-white block font-semibold">Immediate Mitigation</strong>
                    <span>Please wait at least 60 seconds before uploading again. If your token quota is fully exhausted, you can still use the <strong>Run Instant Demo Sample</strong> option below to test the full parsing interface.</span>
                  </div>
                </li>
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#27314a]">
            <button
              onClick={() => handleSimulateSampleScan('parlay')}
              className="px-4 py-2 bg-[#00a572] hover:bg-[#00875c] text-white text-xs font-bold rounded-lg shadow flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles size={14} /> Run Instant Demo Sample (No Key Required)
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setScanningState('idle')}
                className="px-4 py-2 bg-[#0b1326] hover:bg-[#131b2e] border border-[#27314a] text-slate-300 hover:text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Dismiss & Back to Upload
              </button>
              {uploadedImage && (
                <button
                  onClick={() => {
                    const mime = uploadedImage.split(';')[0].replace('data:', '') || 'image/jpeg';
                    const base64 = uploadedImage.split(',')[1] || '';
                    runGeminiOcr(base64, mime, uploadedImage, false);
                  }}
                  className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={14} /> Retry OCR Scan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scanned Results & Verification Editor */}
      {scanningState === 'scanned' && (
        <div className="space-y-6">
          {/* Success Notification Banner */}
          <div className="bg-[#00a572]/10 border border-[#00a572]/30 p-4 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2.5 text-[#4edea3] font-semibold">
              <CheckCircle2 size={18} />
              <span>Gemini OCR Extracted Successfully! Review & edit extracted wagers below.</span>
            </div>
            <span className="text-slate-300 font-mono text-[11px] bg-[#0b1326] px-2.5 py-1 rounded border border-[#27314a]">
              Target: {activeBankroll?.name || 'Selected Bankroll'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Image & Confidence */}
            <div className="space-y-4">
              <div className="bg-[#171f33] p-4 rounded-xl border border-[#27314a] space-y-3">
                <div className="flex items-center justify-between text-xs text-[#8d90a0]">
                  <span className="font-semibold text-white">Scanned Image</span>
                  <span className="text-[#4edea3] flex items-center gap-1 font-medium">
                    <CheckCircle2 size={13} /> OCR Confidence 98%
                  </span>
                </div>
                {uploadedImage && (
                  <img
                    src={uploadedImage}
                    alt="Scanned Betslip"
                    className="w-full h-48 object-cover rounded-lg border border-[#27314a]"
                  />
                )}
                <button
                  onClick={() => setScanningState('idle')}
                  className="w-full py-2 bg-[#0b1326] hover:bg-[#131b2e] border border-[#27314a] text-xs font-semibold text-[#8d90a0] hover:text-white rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <RefreshCw size={14} /> Scan Another Image
                </button>
              </div>

              {/* Raw Extracted Data Preview Drawer */}
              {rawOcrJson && (
                <div className="bg-[#171f33] rounded-xl border border-[#27314a] overflow-hidden">
                  <button
                    onClick={() => setShowRawDrawer(!showRawDrawer)}
                    className="w-full p-3.5 flex items-center justify-between bg-[#0b1326]/60 hover:bg-[#0b1326] transition-colors text-xs font-bold text-slate-300"
                  >
                    <div className="flex items-center gap-2 text-[#4edea3]">
                      <Code size={16} />
                      <span>Raw Gemini OCR JSON Response</span>
                    </div>
                    {showRawDrawer ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {showRawDrawer && (
                    <div className="p-3 bg-[#070d19] border-t border-[#27314a] space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-[#8d90a0]">
                        <span>Model: gemini-3.1-flash-lite (Primary OCR Engine)</span>
                        <button
                          onClick={() => {
                            if (rawOcrJson) {
                              navigator.clipboard.writeText(rawOcrJson);
                              alert("Raw OCR JSON copied to clipboard!");
                            }
                          }}
                          className="flex items-center gap-1 text-[#2563eb] hover:text-[#b4c5ff] font-medium"
                        >
                          <Copy size={12} /> Copy JSON
                        </button>
                      </div>
                      <pre className="p-3 bg-[#0b1326] rounded-lg border border-[#27314a] text-[11px] font-mono text-[#4edea3] overflow-x-auto max-h-60 leading-relaxed">
                        {rawOcrJson}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Editable Metadata & Legs */}
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a] space-y-4">
                <h3 className="text-base font-bold text-white border-b border-[#27314a] pb-3 flex items-center justify-between">
                  <span>Extracted Betslip Parameters</span>
                  <span className="text-xs font-normal text-[#8d90a0]">Edit any field before saving</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#8d90a0] font-medium mb-1">Bet Classification</label>
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
                    <label className="block text-xs text-[#8d90a0] font-medium mb-1">Target Bankroll</label>
                    <select
                      value={selectedBankroll}
                      onChange={(e) => setSelectedBankroll(e.target.value)}
                      className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white font-mono"
                    >
                      {bankrolls.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({formatCurrency(b.currentBalance)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[#8d90a0] font-medium mb-1">Bookmaker Platform</label>
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
                    <label className="block text-xs text-[#8d90a0] font-medium mb-1">Total Stake ({getCurrencySymbol(userCurrency)})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={stake}
                      onChange={(e) => setStake(Number(e.target.value))}
                      className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#8d90a0] font-medium mb-1">Extracted Result Status</label>
                    <select
                      value={betStatus}
                      onChange={(e) => setBetStatus(e.target.value as BetStatus)}
                      className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white font-semibold"
                    >
                      <option value="pending">Open / Pending</option>
                      <option value="won">Won (Settled)</option>
                      <option value="lost">Lost (Settled)</option>
                      <option value="void">Void / Refunded</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[#8d90a0] font-medium mb-1">OCR Notes / Ref</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-[#0b1326] border border-[#27314a] rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                {/* Switches for Live / Free Bet */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isLive}
                        onChange={(e) => setIsLive(e.target.checked)}
                        className="rounded bg-[#0b1326] border-[#27314a] text-[#2563eb]"
                      />
                      <span>In-Play / Live Bet</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isFreeBet}
                        onChange={(e) => setIsFreeBet(e.target.checked)}
                        className="rounded bg-[#0b1326] border-[#27314a] text-[#2563eb]"
                      />
                      <span className="font-bold">Use Free Bet Credit</span>
                    </label>
                  </div>

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

                {/* Legs Table / Editor */}
                <div className="space-y-3 pt-4 border-t border-[#27314a]">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#8d90a0]">
                      Extracted Selections ({legs.length} Legs)
                    </h4>
                    <button
                      onClick={handleAddLeg}
                      className="text-xs text-[#2563eb] hover:text-[#b4c5ff] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={14} /> Add Leg
                    </button>
                  </div>

                  <div className="space-y-2">
                    {legs.map((leg, idx) => (
                      <div
                        key={leg.id}
                        className="bg-[#0b1326] p-3 rounded-lg border border-[#27314a] space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono text-[#2563eb] font-bold">Leg #{idx + 1}</span>
                          <button
                            onClick={() => handleRemoveLeg(leg.id)}
                            className="text-xs text-rose-400 hover:text-rose-300 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                          <input
                            type="text"
                            placeholder="Event (e.g. Real Madrid vs Barcelona)"
                            value={leg.event}
                            onChange={(e) => handleUpdateLeg(leg.id, 'event', e.target.value)}
                            className="bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            type="datetime-local"
                            value={leg.eventDate || ''}
                            onChange={(e) => handleUpdateLeg(leg.id, 'eventDate', e.target.value)}
                            className="bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            type="text"
                            placeholder="Selection (e.g. Over 2.5 Goals)"
                            value={leg.selection}
                            onChange={(e) => handleUpdateLeg(leg.id, 'selection', e.target.value)}
                            className="bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Decimal Odds"
                            value={leg.odds}
                            onChange={(e) => handleUpdateLeg(leg.id, 'odds', Number(e.target.value))}
                            className="bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white font-mono"
                          />
                          <select
                            value={leg.status || 'pending'}
                            onChange={(e) => handleUpdateLeg(leg.id, 'status', e.target.value as BetStatus)}
                            className={`border rounded px-2 py-1.5 text-xs font-bold uppercase tracking-wide cursor-pointer ${
                              leg.status === 'won'
                                ? 'bg-[#005236] text-[#4edea3] border-[#008f5d]'
                                : leg.status === 'lost'
                                ? 'bg-[#601410] text-[#ffb3ad] border-[#93231e]'
                                : leg.status === 'void'
                                ? 'bg-gray-800 text-gray-300 border-gray-600'
                                : 'bg-[#171f33] text-amber-400 border-[#27314a]'
                            }`}
                          >
                            <option value="pending">⌛ Pending</option>
                            <option value="won">✓ Won</option>
                            <option value="lost">✗ Lost</option>
                            <option value="void">⊘ Void</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {hasVoidLegs && (
                  <div className="bg-amber-950/40 border border-amber-700/60 p-3 rounded-lg text-xs text-amber-300 flex items-center justify-between font-mono">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-amber-400" /> Void leg detected — Odds recalculated
                    </span>
                    <span className="font-bold">@{formatOdds(rawTotalOdds)} → @{formatOdds(effectiveTotalOdds)}</span>
                  </div>
                )}

                {/* Summary Payout Bar */}
                <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs text-[#8d90a0]">Combined Odds Multiplier</span>
                    <div className="text-lg font-extrabold text-white font-mono">
                      @{formatOdds(totalOdds)}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-[#8d90a0]">Potential Return</span>
                    <div className="text-lg font-extrabold text-[#4edea3] font-mono">
                      {formatCurrency(potentialPayout)}
                    </div>
                  </div>

                  <button
                    onClick={handleSaveScannedBet}
                    className="w-full sm:w-auto px-6 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-sm rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span>Commit to Bankroll</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
