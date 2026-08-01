import React, { useState } from 'react';
import { Bet, Bankroll, Bookmaker, BetStatus, SportType } from '../types';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Download,
  ArrowRight,
  Wallet,
  Building2,
  Coins,
  Sparkles,
  Layers,
  HelpCircle
} from 'lucide-react';
import { formatCurrency, getCurrencySymbol } from '../utils/storage';

export type CSVFormatType = 'wagers' | 'bankrolls' | 'bookmakers';

interface CSVImportExportProps {
  bets: Bet[];
  bankrolls: Bankroll[];
  bookmakers?: Bookmaker[];
  userCurrency?: string;
  onImportBets: (newBets: Bet[], targetBankrollId?: string) => void;
  onBatchImport?: (payload: {
    csvType: CSVFormatType;
    currencyDetected?: string;
    targetBankrollId?: string;
    rawBankrolls?: Array<{ id?: string; name: string; currency?: string; initialBalance?: number }>;
    rawBookmakers?: Array<{ id?: string; name: string; currency?: string; startingBalance?: number; bankrollId?: string; bankrollName?: string }>;
    rawTransfers?: Array<{ id?: string; date?: string; fromBankrollName?: string; toBankrollName?: string; amount: number; isFreeBetCredit?: boolean; bookmakerName?: string; notes?: string }>;
    rawBets?: Array<{ id?: string; date?: string; type?: 'single' | 'parlay' | 'bet_builder'; sport?: SportType; event?: string; selection?: string; market?: string; odds?: number; stake?: number; potentialPayout?: number; actualReturn?: number; status?: BetStatus; bookmakerName?: string; bankrollName?: string; bankrollId?: string; currency?: string; notes?: string }>;
  }) => {
    importedBetsCount: number;
    createdBankrollsCount: number;
    createdBookmakersCount: number;
    currencyUsed: string;
  };
}

// Helper: Line parser respecting quotes
const parseCSVLine = (text: string): string[] => {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim().replace(/^"|"$/g, ''));
  return result;
};

export const CSVImportExport: React.FC<CSVImportExportProps> = ({
  bets,
  bankrolls,
  bookmakers = [],
  userCurrency = 'USD',
  onImportBets,
  onBatchImport
}) => {
  const [selectedBankroll, setSelectedBankroll] = useState<string>(bankrolls[0]?.id || '');
  const [step, setStep] = useState<'upload' | 'mapping' | 'summary'>('upload');
  const [csvFormat, setCsvFormat] = useState<CSVFormatType>('wagers');
  const [csvContent, setCsvContent] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<Array<Record<string, string>>>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  
  const [importSummary, setImportSummary] = useState<{
    successMessage: string;
    importedBetsCount: number;
    createdBankrollsCount: number;
    createdBookmakersCount: number;
    currencyUsed: string;
    errors: string[];
  } | null>(null);

  const activeBankroll = bankrolls.find((b) => b.id === selectedBankroll);

  // Auto-detect CSV Format Type from raw headers
  const detectCSVFormat = (rawHeaders: string[]): CSVFormatType => {
    const lHeaders = rawHeaders.map((h) => h.toLowerCase());
    if (lHeaders.some((h) => h.includes('transaction') || h.includes('allocation'))) {
      return 'bankrolls';
    }
    if (lHeaders.some((h) => h.includes('created at') || (h.includes('starting balance') && !lHeaders.some((x) => x.includes('bankroll'))))) {
      return 'bookmakers';
    }
    if (lHeaders.some((h) => h.includes('stake') || h.includes('odds') || h.includes('placed') || h.includes('sport') || h.includes('wager'))) {
      return 'wagers';
    }
    if (lHeaders.some((h) => h.includes('bankroll name') || h.includes('starting balance'))) {
      return 'bankrolls';
    }
    return 'wagers';
  };

  // Generate Default Column Map based on CSV format
  const generateDefaultMap = (rawHeaders: string[], format: CSVFormatType): Record<string, string> => {
    const defaultMap: Record<string, string> = {};

    if (format === 'wagers') {
      rawHeaders.forEach((h) => {
        const l = h.toLowerCase();
        if (l === 'id' || l === 'bet id' || l === 'wager id') defaultMap[h] = 'id';
        else if (l.includes('bookmaker') || l.includes('sportsbook')) defaultMap[h] = 'bookmakerName';
        else if (l.includes('bankroll id')) defaultMap[h] = 'bankrollId';
        else if (l.includes('bankroll')) defaultMap[h] = 'bankrollName';
        else if (l.includes('sport') || l.includes('category')) defaultMap[h] = 'sport';
        else if (l.includes('market') || l.includes('type')) defaultMap[h] = 'marketType';
        else if (l.includes('odd') || l.includes('price')) defaultMap[h] = 'odds';
        else if (l.includes('stake') || l.includes('wager')) defaultMap[h] = 'stake';
        else if (l.includes('return') || l.includes('payout')) defaultMap[h] = 'potentialPayout';
        else if (l.includes('currency')) defaultMap[h] = 'currency';
        else if (l.includes('status') || l.includes('result')) defaultMap[h] = 'status';
        else if (l.includes('placed') || l.includes('date') || l.includes('time')) defaultMap[h] = 'date';
        else if (l.includes('note') || l.includes('memo') || l.includes('reference')) defaultMap[h] = 'notes';
        else defaultMap[h] = 'ignore';
      });
    } else if (format === 'bankrolls') {
      rawHeaders.forEach((h) => {
        const l = h.toLowerCase();
        if (l.includes('bankroll id')) defaultMap[h] = 'bankrollId';
        else if (l.includes('bankroll name') || l === 'bankroll') defaultMap[h] = 'bankrollName';
        else if (l.includes('currency')) defaultMap[h] = 'currency';
        else if (l.includes('starting') || l.includes('initial') || l.includes('balance')) defaultMap[h] = 'initialBalance';
        else if (l.includes('transaction id')) defaultMap[h] = 'transactionId';
        else if (l.includes('transaction type') || l.includes('type')) defaultMap[h] = 'transactionType';
        else if (l.includes('amount')) defaultMap[h] = 'amount';
        else if (l.includes('bookmaker')) defaultMap[h] = 'bookmakerName';
        else if (l.includes('date') || l.includes('timestamp')) defaultMap[h] = 'transactionDate';
        else if (l.includes('note')) defaultMap[h] = 'notes';
        else defaultMap[h] = 'ignore';
      });
    } else if (format === 'bookmakers') {
      rawHeaders.forEach((h) => {
        const l = h.toLowerCase();
        if (l === 'id' || l.includes('bookmaker id')) defaultMap[h] = 'bookmakerId';
        else if (l.includes('name') || l.includes('bookmaker') || l.includes('sportsbook')) defaultMap[h] = 'bookmakerName';
        else if (l.includes('currency')) defaultMap[h] = 'currency';
        else if (l.includes('starting') || l.includes('balance') || l.includes('real')) defaultMap[h] = 'startingBalance';
        else if (l.includes('created') || l.includes('date')) defaultMap[h] = 'createdAt';
        else if (l.includes('logo') || l.includes('image')) defaultMap[h] = 'logoUrl';
        else defaultMap[h] = 'ignore';
      });
    }

    return defaultMap;
  };

  const processCSVText = (text: string, overrideFormat?: CSVFormatType) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return;

    const rawHeaders = parseCSVLine(lines[0]);
    setHeaders(rawHeaders);

    const detectedFormat = overrideFormat || detectCSVFormat(rawHeaders);
    setCsvFormat(detectedFormat);

    const defaultMap = generateDefaultMap(rawHeaders, detectedFormat);
    setColumnMap(defaultMap);

    const rows: Array<Record<string, string>> = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = parseCSVLine(lines[i]);
      if (cols.length >= 1) {
        const rowObj: Record<string, string> = {};
        rawHeaders.forEach((h, idx) => {
          rowObj[h] = cols[idx] !== undefined ? cols[idx] : '';
        });
        rows.push(rowObj);
      }
    }
    setParsedRows(rows);
    setStep('mapping');
  };

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvContent(text);
        processCSVText(text);
      }
    };
    reader.readAsText(file);
  };

  // Sample CSV generator for Wagers
  const handleLoadSampleWagersCSV = () => {
    const sample = `ID,Bookmaker,Bankroll ID,Bankroll Name,Sport,Market Type,Total Odds,Stake,Potential Return,Currency,Status,Placed At,Notes
wager-101,22Bet,bank-apr,April 2026,Football,Single,2.10,100,210,EUR,won,2026-04-10 14:30:00,Champions League Quarterfinal
wager-102,Betclic,bank-apr,April 2026,Basketball,Parlay,3.50,50,175,EUR,lost,2026-04-12 18:00:00,NBA Playoffs Game 1
wager-103,Pinnacle,bank-jun,June 2026,Tennis,Single,1.85,150,277.50,EUR,won,2026-06-05 11:15:00,Roland Garros Final
wager-104,DraftKings,bank-jul,July 2026,Football,Single,1.95,200,390,EUR,pending,2026-07-28 20:00:00,Pre-season Friendly`;

    setCsvContent(sample);
    processCSVText(sample, 'wagers');
  };

  // Sample CSV generator for Bankrolls
  const handleLoadSampleBankrollsCSV = () => {
    const sample = `Bankroll ID,Bankroll Name,Currency,Starting Balance,Transaction ID,Transaction Type,Amount,Bookmaker,Notes,Transaction Date
bank-apr,April 2026,EUR,5000,tx-001,deposit,2000,22Bet,Initial funding,2026-04-01 09:00:00
bank-jun,June 2026,EUR,7500,tx-002,deposit,3000,Betclic,Summer bankroll allocation,2026-06-01 10:00:00
bank-jul,July 2026,EUR,10000,tx-003,deposit,4000,Pinnacle,Main portfolio expansion,2026-07-01 08:30:00`;

    setCsvContent(sample);
    processCSVText(sample, 'bankrolls');
  };

  // Sample CSV generator for Bookmakers
  const handleLoadSampleBookmakersCSV = () => {
    const sample = `ID,Name,Currency,Starting Balance,Logo,Created At
bm-22bet,22Bet,EUR,2500,https://img.logo.dev/22bet.com,2026-01-15 12:00:00
bm-betclic,Betclic,EUR,1800,https://img.logo.dev/betclic.com,2026-02-01 14:00:00
bm-pinnacle,Pinnacle,EUR,4200,https://img.logo.dev/pinnacle.com,2026-03-10 09:30:00`;

    setCsvContent(sample);
    processCSVText(sample, 'bookmakers');
  };

  const handleExecuteImport = () => {
    const errors: string[] = [];
    let detectedCurrency = userCurrency;

    const getValueForField = (row: Record<string, string>, field: string) => {
      const hKey = Object.keys(columnMap).find((k) => columnMap[k] === field);
      return hKey ? row[hKey] || '' : '';
    };

    if (csvFormat === 'wagers') {
      const rawBets: Array<any> = [];

      parsedRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        const idVal = getValueForField(row, 'id');
        const bmVal = getValueForField(row, 'bookmakerName') || 'Pinnacle';
        const bankNameVal = getValueForField(row, 'bankrollName') || getValueForField(row, 'bankrollId') || 'April 2026';
        const sportVal = (getValueForField(row, 'sport') || 'Football') as SportType;
        const marketVal = getValueForField(row, 'marketType') || 'Match Result';
        const oddsVal = parseFloat(getValueForField(row, 'odds'));
        const stakeVal = parseFloat(getValueForField(row, 'stake'));
        const potPayoutVal = parseFloat(getValueForField(row, 'potentialPayout'));
        const currVal = getValueForField(row, 'currency');
        const statusValRaw = getValueForField(row, 'status').toLowerCase();
        const dateVal = getValueForField(row, 'date') || new Date().toISOString();
        const notesVal = getValueForField(row, 'notes');

        if (currVal) detectedCurrency = currVal;

        if (isNaN(oddsVal) || oddsVal <= 1.0) {
          errors.push(`Row ${rowNum}: Invalid decimal odds "${getValueForField(row, 'odds')}" (using default 1.85)`);
        }
        if (isNaN(stakeVal) || stakeVal <= 0) {
          errors.push(`Row ${rowNum}: Invalid stake amount "${getValueForField(row, 'stake')}" (using default 10)`);
        }

        let status: BetStatus = 'pending';
        if (statusValRaw.includes('won')) status = 'won';
        else if (statusValRaw.includes('lost')) status = 'lost';
        else if (statusValRaw.includes('void')) status = 'void';
        else if (statusValRaw.includes('cashout')) status = 'cashout';

        rawBets.push({
          id: idVal || `imported-wager-${Date.now()}-${idx}`,
          date: dateVal,
          type: 'single',
          sport: sportVal,
          event: marketVal.includes('vs') ? marketVal : 'Match Event',
          market: marketVal,
          selection: 'Selection',
          odds: isNaN(oddsVal) || oddsVal <= 1.0 ? 1.85 : oddsVal,
          stake: isNaN(stakeVal) || stakeVal <= 0 ? 10 : stakeVal,
          potentialPayout: !isNaN(potPayoutVal) && potPayoutVal > 0 ? potPayoutVal : (isNaN(stakeVal) ? 10 : stakeVal) * (isNaN(oddsVal) ? 1.85 : oddsVal),
          status,
          bookmakerName: bmVal,
          bankrollName: bankNameVal,
          currency: currVal || detectedCurrency,
          notes: notesVal || `Imported wager into ${bankNameVal}`
        });
      });

      if (onBatchImport) {
        const result = onBatchImport({
          csvType: 'wagers',
          currencyDetected: detectedCurrency,
          targetBankrollId: selectedBankroll,
          rawBets
        });

        const symbol = getCurrencySymbol(result.currencyUsed);
        const msg = `Successfully imported ${result.importedBetsCount} bets, ${result.createdBankrollsCount} bankrolls, and ${result.createdBookmakersCount} bookmaker accounts in ${result.currencyUsed} (${symbol})`;

        setImportSummary({
          successMessage: msg,
          importedBetsCount: result.importedBetsCount,
          createdBankrollsCount: result.createdBankrollsCount,
          createdBookmakersCount: result.createdBookmakersCount,
          currencyUsed: result.currencyUsed,
          errors
        });
      }
    } else if (csvFormat === 'bankrolls') {
      const rawBankrolls: Array<any> = [];
      const rawTransfers: Array<any> = [];

      parsedRows.forEach((row, idx) => {
        const bankNameVal = getValueForField(row, 'bankrollName') || getValueForField(row, 'bankrollId') || `Bankroll ${idx + 1}`;
        const currVal = getValueForField(row, 'currency');
        const startBalVal = parseFloat(getValueForField(row, 'initialBalance')) || 0;
        const txAmtVal = parseFloat(getValueForField(row, 'amount')) || 0;
        const bmVal = getValueForField(row, 'bookmakerName');
        const txDateVal = getValueForField(row, 'transactionDate') || new Date().toISOString();
        const notesVal = getValueForField(row, 'notes');

        if (currVal) detectedCurrency = currVal;

        rawBankrolls.push({
          name: bankNameVal,
          currency: currVal || detectedCurrency,
          initialBalance: startBalVal
        });

        if (txAmtVal > 0) {
          rawTransfers.push({
            date: txDateVal,
            toBankrollName: bankNameVal,
            amount: txAmtVal,
            bookmakerName: bmVal,
            notes: notesVal || 'Initial Allocation Deposit'
          });
        }
      });

      if (onBatchImport) {
        const result = onBatchImport({
          csvType: 'bankrolls',
          currencyDetected: detectedCurrency,
          targetBankrollId: selectedBankroll,
          rawBankrolls,
          rawTransfers
        });

        const symbol = getCurrencySymbol(result.currencyUsed);
        const msg = `Successfully imported ${result.importedBetsCount} bets, ${result.createdBankrollsCount} bankrolls, and ${result.createdBookmakersCount} bookmaker accounts in ${result.currencyUsed} (${symbol})`;

        setImportSummary({
          successMessage: msg,
          importedBetsCount: result.importedBetsCount,
          createdBankrollsCount: result.createdBankrollsCount,
          createdBookmakersCount: result.createdBookmakersCount,
          currencyUsed: result.currencyUsed,
          errors
        });
      }
    } else if (csvFormat === 'bookmakers') {
      const rawBookmakers: Array<any> = [];

      parsedRows.forEach((row, idx) => {
        const bmNameVal = getValueForField(row, 'bookmakerName') || `Sportsbook ${idx + 1}`;
        const currVal = getValueForField(row, 'currency');
        const startBalVal = parseFloat(getValueForField(row, 'startingBalance')) || 0;
        const logoUrlVal = getValueForField(row, 'logoUrl');

        if (currVal) detectedCurrency = currVal;

        rawBookmakers.push({
          name: bmNameVal,
          currency: currVal || detectedCurrency,
          startingBalance: startBalVal,
          logoUrl: logoUrlVal || undefined
        });
      });

      if (onBatchImport) {
        const result = onBatchImport({
          csvType: 'bookmakers',
          currencyDetected: detectedCurrency,
          targetBankrollId: selectedBankroll,
          rawBookmakers
        });

        const symbol = getCurrencySymbol(result.currencyUsed);
        const msg = `Successfully imported ${result.importedBetsCount} bets, ${result.createdBankrollsCount} bankrolls, and ${result.createdBookmakersCount} bookmaker accounts in ${result.currencyUsed} (${symbol})`;

        setImportSummary({
          successMessage: msg,
          importedBetsCount: result.importedBetsCount,
          createdBankrollsCount: result.createdBankrollsCount,
          createdBookmakersCount: result.createdBookmakersCount,
          currencyUsed: result.currencyUsed,
          errors
        });
      }
    }

    setStep('summary');
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(bets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `betlogic_portfolio_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const handleExportBookmakersCSV = () => {
    const headers = ['Bookmaker ID', 'Sportsbook Name', 'Default Currency', 'Starting Balance', 'Logo URL', 'Accent Theme Color', 'Average Margin %', 'Cash Balance', 'Free Bet Balance', 'Pending Bets Count'];
    const csvRows = [headers.join(',')];

    bookmakers.forEach((bm) => {
      const row = [
        bm.id,
        `"${bm.name.replace(/"/g, '""')}"`,
        userCurrency,
        bm.realBalance || 0,
        bm.logoUrl ? `"${bm.logoUrl.replace(/"/g, '""')}"` : '',
        bm.color || '#2563eb',
        bm.averageMargin || 4.5,
        bm.realBalance || 0,
        bm.freeBetBalance || 0,
        bm.pendingBetsCount || 0
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `betlogic_bookmakers_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handleExportWagersCSV = () => {
    const headers = ['Wager ID', 'Date Placed', 'Type', 'Sport', 'Event', 'Selection', 'Market', 'Decimal Odds', 'Stake Amount', 'Potential Payout', 'Actual Return', 'Bet Status', 'Sportsbook ID', 'Bankroll ID', 'Is Live', 'Is Free Bet', 'Notes'];
    const csvRows = [headers.join(',')];

    bets.forEach((b) => {
      const leg = b.legs[0];
      const row = [
        b.id,
        b.date,
        b.type,
        leg?.sport || 'Football',
        `"${(leg?.event || '').replace(/"/g, '""')}"`,
        `"${(leg?.selection || '').replace(/"/g, '""')}"`,
        `"${(leg?.market || '').replace(/"/g, '""')}"`,
        b.totalOdds,
        b.stake,
        b.potentialPayout,
        b.actualReturn !== undefined ? b.actualReturn : '',
        b.status,
        b.bookmakerId,
        b.bankrollId,
        b.isLive ? 'TRUE' : 'FALSE',
        b.isFreeBet ? 'TRUE' : 'FALSE',
        b.notes ? `"${b.notes.replace(/"/g, '""')}"` : ''
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `betlogic_wagers_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto pb-24 md:pb-12">
      {/* Header */}
      <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a]">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FileSpreadsheet className="text-[#2563eb]" />
          <span>CSV Data Mapping & Bankroll Import Engine</span>
        </h2>
        <p className="text-sm text-[#8d90a0] mt-1">
          Import historical wagers, bankroll allocations, and bookmaker accounts from CSV files. Auto-detect formats, map headers, create missing bankrolls/bookmakers, and update balances dynamically in <strong>{userCurrency} ({getCurrencySymbol(userCurrency)})</strong>.
        </p>
      </div>

      {/* Target Bankroll Destination Box */}
      <div className="p-4 rounded-xl border bg-[#171f33] border-[#2563eb]/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-lg shrink-0 bg-[#2563eb]/20 text-[#2563eb]">
              <Wallet size={22} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                Default Target Bankroll Destination
              </div>
              <p className="text-xs text-[#8d90a0] mt-0.5">
                {activeBankroll
                  ? `Selected: ${activeBankroll.name} (Current balance: ${formatCurrency(activeBankroll.currentBalance, activeBankroll.currency)})`
                  : 'Select default target bankroll for imported wagers'}
              </p>
            </div>
          </div>

          <div className="w-full sm:w-80">
            <select
              value={selectedBankroll}
              onChange={(e) => setSelectedBankroll(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg text-xs font-bold font-mono bg-[#0b1326] border border-[#27314a] text-white focus:border-[#2563eb]"
            >
              <option value="">-- Choose Default Bankroll --</option>
              {bankrolls.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({formatCurrency(b.currentBalance, b.currency)})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {step === 'upload' && (
        <div className="bg-[#171f33] p-6 rounded-xl border border-[#27314a] space-y-6">
          {/* Format Mode Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#8d90a0] uppercase tracking-wider">
              CSV Schema Format Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setCsvFormat('wagers')}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  csvFormat === 'wagers'
                    ? 'bg-[#2563eb]/20 border-[#2563eb] text-white shadow-lg'
                    : 'bg-[#0b1326] border-[#27314a] text-[#8d90a0] hover:border-[#2563eb]/50'
                }`}
              >
                <div className="font-bold text-xs flex items-center gap-2 text-white">
                  <Coins size={16} className="text-[#2563eb]" />
                  <span>A. Wagers & Bets Export</span>
                </div>
                <p className="text-[10px] text-[#8d90a0] mt-1">
                  `bets_export_*.csv` (ID, Bookmaker, Bankroll, Sport, Odds, Stake, Return, Status)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setCsvFormat('bankrolls')}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  csvFormat === 'bankrolls'
                    ? 'bg-[#2563eb]/20 border-[#2563eb] text-white shadow-lg'
                    : 'bg-[#0b1326] border-[#27314a] text-[#8d90a0] hover:border-[#2563eb]/50'
                }`}
              >
                <div className="font-bold text-xs flex items-center gap-2 text-white">
                  <Layers size={16} className="text-[#4edea3]" />
                  <span>B. Bankrolls & Allocations</span>
                </div>
                <p className="text-[10px] text-[#8d90a0] mt-1">
                  `bankrolls_export_*.csv` (Bankroll ID/Name, Starting Balance, Transactions)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setCsvFormat('bookmakers')}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  csvFormat === 'bookmakers'
                    ? 'bg-[#2563eb]/20 border-[#2563eb] text-white shadow-lg'
                    : 'bg-[#0b1326] border-[#27314a] text-[#8d90a0] hover:border-[#2563eb]/50'
                }`}
              >
                <div className="font-bold text-xs flex items-center gap-2 text-white">
                  <Building2 size={16} className="text-[#b4c5ff]" />
                  <span>C. Bookmakers Accounts</span>
                </div>
                <p className="text-[10px] text-[#8d90a0] mt-1">
                  `bookmakers_export_*.csv` (ID, Name, Currency, Starting Balance)
                </p>
              </button>
            </div>
          </div>

          <div className="border-2 border-dashed border-[#27314a] hover:border-[#2563eb] p-8 rounded-xl text-center space-y-4 bg-[#0b1326]">
            <Upload size={38} className="text-[#2563eb] mx-auto" />
            <div>
              <h3 className="text-base font-bold text-white">Upload Sportsbook CSV File</h3>
              <p className="text-xs text-[#8d90a0] mt-1">
                Select a CSV file or load sample data for auto-relation & column mapping
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <label className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-lg shadow transition-colors cursor-pointer">
                <span>Choose CSV File</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {/* Sample Loader Buttons for all 3 formats */}
              <button
                type="button"
                onClick={handleLoadSampleWagersCSV}
                className="px-3 py-2 bg-[#0b1326] hover:bg-[#131b2e] border border-[#27314a] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Sample Wagers CSV
              </button>

              <button
                type="button"
                onClick={handleLoadSampleBankrollsCSV}
                className="px-3 py-2 bg-[#0b1326] hover:bg-[#131b2e] border border-[#27314a] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Sample Bankrolls CSV
              </button>

              <button
                type="button"
                onClick={handleLoadSampleBookmakersCSV}
                className="px-3 py-2 bg-[#0b1326] hover:bg-[#131b2e] border border-[#27314a] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Sample Bookmakers CSV
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-[#27314a]">
            <h4 className="text-xs font-bold text-[#8d90a0] uppercase mb-2">Portfolio Data Exporters</h4>
            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={handleExportJSON}
                className="flex items-center gap-2 px-4 py-2 bg-[#0b1326] hover:bg-[#131b2e] border border-[#27314a] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Download size={16} className="text-[#4edea3]" /> Download Full Portfolio Backup (JSON)
              </button>
              
              <button
                onClick={handleExportBookmakersCSV}
                className="flex items-center gap-2 px-4 py-2 bg-[#0b1326] hover:bg-[#131b2e] border border-[#27314a] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Download size={16} className="text-[#b4c5ff]" /> Export Bookmakers Accounts (CSV)
              </button>

              <button
                onClick={handleExportWagersCSV}
                className="flex items-center gap-2 px-4 py-2 bg-[#0b1326] hover:bg-[#131b2e] border border-[#27314a] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Download size={16} className="text-amber-400" /> Export Settled Wagers (CSV)
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'mapping' && (
        <div className="bg-[#171f33] p-6 rounded-xl border border-[#27314a] space-y-6">
          <div className="flex items-center justify-between border-b border-[#27314a] pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Step 2: Column Header Mapping Wizard</span>
                <span className="text-xs bg-[#2563eb]/20 text-[#2563eb] px-2 py-0.5 rounded uppercase font-mono font-bold">
                  {csvFormat} Format
                </span>
              </h3>
              <p className="text-xs text-[#8d90a0] mt-0.5">
                Parsed {parsedRows.length} rows. Map CSV column headers to application target properties.
              </p>
            </div>
          </div>

          {/* Mapping Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {headers.map((header) => (
              <div key={header} className="bg-[#0b1326] p-3.5 rounded-lg border border-[#27314a] flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-white font-bold truncate">{header}</span>
                <select
                  value={columnMap[header] || 'ignore'}
                  onChange={(e) => setColumnMap({ ...columnMap, [header]: e.target.value })}
                  className="bg-[#171f33] border border-[#27314a] rounded px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="ignore">-- Ignore Column --</option>
                  
                  {csvFormat === 'wagers' && (
                    <>
                      <option value="id">Bet / Wager ID</option>
                      <option value="bookmakerName">Sportsbook / Bookmaker Name</option>
                      <option value="bankrollId">Bankroll ID</option>
                      <option value="bankrollName">Bankroll Name</option>
                      <option value="sport">Sport Category</option>
                      <option value="marketType">Market Type</option>
                      <option value="odds">Decimal Odds</option>
                      <option value="stake">Stake Amount</option>
                      <option value="potentialPayout">Potential Return / Payout</option>
                      <option value="currency">Currency Code (EUR/USD)</option>
                      <option value="status">Bet Result Status</option>
                      <option value="date">Placed Date / Timestamp</option>
                      <option value="notes">Bet Notes / Reference</option>
                    </>
                  )}

                  {csvFormat === 'bankrolls' && (
                    <>
                      <option value="bankrollId">Bankroll ID</option>
                      <option value="bankrollName">Bankroll Name</option>
                      <option value="currency">Currency Code</option>
                      <option value="initialBalance">Starting Balance</option>
                      <option value="transactionId">Transaction ID</option>
                      <option value="transactionType">Transaction Type</option>
                      <option value="amount">Funding Amount</option>
                      <option value="bookmakerName">Sportsbook Name</option>
                      <option value="transactionDate">Transaction Date</option>
                      <option value="notes">Notes / Memo</option>
                    </>
                  )}

                  {csvFormat === 'bookmakers' && (
                    <>
                      <option value="bookmakerId">Bookmaker ID</option>
                      <option value="bookmakerName">Sportsbook Name</option>
                      <option value="currency">Default Currency</option>
                      <option value="startingBalance">Initial Cash Balance</option>
                      <option value="createdAt">Registration Date</option>
                      <option value="logoUrl">Logo URL / Base64</option>
                    </>
                  )}
                </select>
              </div>
            ))}
          </div>

          <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs text-[#8d90a0]">
              Auto-relation enabled: non-existent Bankrolls & Bookmakers will be automatically instantiated!
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 bg-[#171f33] text-white text-xs font-semibold rounded-lg border border-[#27314a]"
              >
                Back
              </button>
              <button
                onClick={handleExecuteImport}
                className="px-6 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs rounded-lg shadow flex items-center gap-2 cursor-pointer"
              >
                <span>Run Validation & Auto-Import</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'summary' && importSummary && (
        <div className="bg-[#171f33] p-6 rounded-xl border border-[#27314a] space-y-6">
          <div className="border-b border-[#27314a] pb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="text-[#4edea3]" />
              <span>Step 3: Import Execution Summary</span>
            </h3>
            <span className="text-xs font-mono bg-[#4edea3]/20 text-[#4edea3] px-2.5 py-1 rounded font-bold">
              Currency: {importSummary.currencyUsed} ({getCurrencySymbol(importSummary.currencyUsed)})
            </span>
          </div>

          {/* Prompt's required exact notification banner */}
          <div className="p-4 rounded-xl bg-[#4edea3]/10 border border-[#4edea3]/40 text-[#4edea3] font-bold text-sm flex items-center gap-3">
            <Sparkles size={22} className="shrink-0" />
            <span>{importSummary.successMessage}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] space-y-1">
              <span className="text-xs text-[#8d90a0]">Imported Wagers</span>
              <div className="text-2xl font-extrabold text-[#4edea3] font-mono">
                {importSummary.importedBetsCount}
              </div>
            </div>

            <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] space-y-1">
              <span className="text-xs text-[#8d90a0]">Auto-Created Bankrolls</span>
              <div className="text-2xl font-extrabold text-[#2563eb] font-mono">
                {importSummary.createdBankrollsCount}
              </div>
            </div>

            <div className="bg-[#0b1326] p-4 rounded-xl border border-[#27314a] space-y-1">
              <span className="text-xs text-[#8d90a0]">Auto-Created Bookmakers</span>
              <div className="text-2xl font-extrabold text-[#b4c5ff] font-mono">
                {importSummary.createdBookmakersCount}
              </div>
            </div>
          </div>

          {importSummary.errors.length > 0 && (
            <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-xl space-y-2 text-xs text-rose-200">
              <div className="font-bold flex items-center gap-1.5 text-rose-400">
                <AlertTriangle size={16} /> Validation Alerts
              </div>
              <ul className="list-disc pl-5 space-y-1">
                {importSummary.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => {
                setStep('upload');
                setImportSummary(null);
              }}
              className="px-6 py-2.5 bg-[#2563eb] text-white text-xs font-bold rounded-lg shadow cursor-pointer"
            >
              Done / Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
