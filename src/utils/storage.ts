import { Bet, Bankroll, Bookmaker, BankrollTransfer, UserPreferences, BankrollBookmakerBalance, TagDefinition } from '../types';
import { INITIAL_BETS, INITIAL_BANKROLLS, INITIAL_BOOKMAKERS, INITIAL_TRANSFERS, INITIAL_USER_PREFS, INITIAL_TAGS } from '../mockData';

const STORAGE_KEYS = {
  BETS: 'betlogic_bets',
  BANKROLLS: 'betlogic_bankrolls',
  BOOKMAKERS: 'betlogic_bookmakers',
  TRANSFERS: 'betlogic_transfers',
  USER_PREFS: 'betlogic_user_prefs',
  TAGS: 'betlogic_tag_defs'
};

export function getBookmakerBalanceForBankroll(
  bm: Bookmaker,
  bankrollId?: string
): { cashBalance: number; freeBetBalance: number } {
  if (!bankrollId || bankrollId === 'all') {
    if (bm.balances && bm.balances.length > 0) {
      const cash = bm.balances.reduce((acc, b) => acc + (Number(b.cashBalance) || 0), 0);
      const freeBet = bm.balances.reduce((acc, b) => acc + (Number(b.freeBetBalance) || 0), 0);
      return { cashBalance: cash, freeBetBalance: freeBet };
    }
    return { cashBalance: bm.realBalance || 0, freeBetBalance: bm.freeBetBalance || 0 };
  }

  // Specific bankroll requested
  if (bm.balances && bm.balances.length > 0) {
    const found = bm.balances.find((b) => b.bankrollId === bankrollId);
    if (found) {
      return { cashBalance: Number(found.cashBalance) || 0, freeBetBalance: Number(found.freeBetBalance) || 0 };
    }
  }

  if (bm.bankrollId === bankrollId) {
    return { cashBalance: bm.realBalance || 0, freeBetBalance: bm.freeBetBalance || 0 };
  }

  return { cashBalance: 0, freeBetBalance: 0 };
}

export function updateBookmakerBalanceForBankroll(
  bm: Bookmaker,
  bankrollId: string,
  newCash: number,
  newFreeBet: number
): Bookmaker {
  const existingBalances: BankrollBookmakerBalance[] = bm.balances ? [...bm.balances] : [];

  if (bm.bankrollId && existingBalances.length === 0) {
    existingBalances.push({
      bankrollId: bm.bankrollId,
      bookmakerId: bm.id,
      bookmakerName: bm.name,
      cashBalance: bm.realBalance || 0,
      freeBetBalance: bm.freeBetBalance || 0
    });
  }

  const idx = existingBalances.findIndex((b) => b.bankrollId === bankrollId);
  if (idx >= 0) {
    existingBalances[idx] = {
      ...existingBalances[idx],
      cashBalance: newCash,
      freeBetBalance: newFreeBet
    };
  } else {
    existingBalances.push({
      bankrollId,
      bookmakerId: bm.id,
      bookmakerName: bm.name,
      cashBalance: newCash,
      freeBetBalance: newFreeBet
    });
  }

  const totalCash = existingBalances.reduce((acc, b) => acc + (Number(b.cashBalance) || 0), 0);
  const totalFreeBet = existingBalances.reduce((acc, b) => acc + (Number(b.freeBetBalance) || 0), 0);

  return {
    ...bm,
    realBalance: totalCash,
    freeBetBalance: totalFreeBet,
    balances: existingBalances
  };
}

export function loadStoredBets(): Bet[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.BETS);
    return data ? JSON.parse(data) : INITIAL_BETS;
  } catch {
    return INITIAL_BETS;
  }
}

export function saveStoredBets(bets: Bet[]): void {
  localStorage.setItem(STORAGE_KEYS.BETS, JSON.stringify(bets));
}

export function loadStoredBankrolls(): Bankroll[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.BANKROLLS);
    return data ? JSON.parse(data) : INITIAL_BANKROLLS;
  } catch {
    return INITIAL_BANKROLLS;
  }
}

export function saveStoredBankrolls(bankrolls: Bankroll[]): void {
  localStorage.setItem(STORAGE_KEYS.BANKROLLS, JSON.stringify(bankrolls));
}

export function loadStoredBookmakers(): Bookmaker[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.BOOKMAKERS);
    const loaded: Bookmaker[] = data ? JSON.parse(data) : INITIAL_BOOKMAKERS;
    return loaded.map((bm) => {
      if (!bm.balances || bm.balances.length === 0) {
        const defaultBankrollId = bm.bankrollId || 'bank-1';
        return {
          ...bm,
          balances: [
            {
              bankrollId: defaultBankrollId,
              bookmakerId: bm.id,
              bookmakerName: bm.name,
              cashBalance: bm.realBalance || 0,
              freeBetBalance: bm.freeBetBalance || 0
            }
          ]
        };
      }
      return bm;
    });
  } catch {
    return INITIAL_BOOKMAKERS;
  }
}

export function saveStoredBookmakers(bookmakers: Bookmaker[]): void {
  localStorage.setItem(STORAGE_KEYS.BOOKMAKERS, JSON.stringify(bookmakers));
}

export function loadStoredTransfers(): BankrollTransfer[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.TRANSFERS);
    return data ? JSON.parse(data) : INITIAL_TRANSFERS;
  } catch {
    return INITIAL_TRANSFERS;
  }
}

export function saveStoredTransfers(transfers: BankrollTransfer[]): void {
  localStorage.setItem(STORAGE_KEYS.TRANSFERS, JSON.stringify(transfers));
}

export function loadStoredUserPrefs(): UserPreferences {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER_PREFS);
    return data ? JSON.parse(data) : INITIAL_USER_PREFS;
  } catch {
    return INITIAL_USER_PREFS;
  }
}

export function saveStoredUserPrefs(prefs: UserPreferences): void {
  localStorage.setItem(STORAGE_KEYS.USER_PREFS, JSON.stringify(prefs));
}

export function loadStoredTagDefinitions(): TagDefinition[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.TAGS);
    return data ? JSON.parse(data) : INITIAL_TAGS;
  } catch {
    return INITIAL_TAGS;
  }
}

export function saveStoredTagDefinitions(tags: TagDefinition[]): void {
  localStorage.setItem(STORAGE_KEYS.TAGS, JSON.stringify(tags));
}

// Financial Settlement Engine Calculation Helper
export function computeBetFinancialImpact(bet: Bet): { realCashDelta: number; freeBetDelta: number } {
  const { stake, potentialPayout, actualReturn, status, isFreeBet, freeBetDestination } = bet;
  const payout = actualReturn !== undefined ? actualReturn : potentialPayout;

  if (status === 'pending') {
    return {
      realCashDelta: isFreeBet ? 0 : -stake,
      freeBetDelta: isFreeBet ? -stake : 0
    };
  }

  if (status === 'won') {
    if (isFreeBet) {
      if (freeBetDestination === 'free_bet') {
        return {
          realCashDelta: 0,
          freeBetDelta: -stake + payout
        };
      } else {
        // Default SNR: Stake Not Returned (Only net profit credited to real cash)
        const netProfit = payout - stake;
        return {
          realCashDelta: netProfit > 0 ? netProfit : 0,
          freeBetDelta: -stake
        };
      }
    } else {
      return {
        realCashDelta: payout - stake,
        freeBetDelta: 0
      };
    }
  }

  if (status === 'lost') {
    return {
      realCashDelta: isFreeBet ? 0 : -stake,
      freeBetDelta: isFreeBet ? -stake : 0
    };
  }

  if (status === 'void') {
    return {
      realCashDelta: 0,
      freeBetDelta: 0
    };
  }

  if (status === 'cashout') {
    const returnAmt = actualReturn !== undefined ? actualReturn : 0;
    if (isFreeBet) {
      return {
        realCashDelta: returnAmt,
        freeBetDelta: -stake
      };
    } else {
      return {
        realCashDelta: returnAmt - stake,
        freeBetDelta: 0
      };
    }
  }

  return { realCashDelta: 0, freeBetDelta: 0 };
}

// Utility calculations
export function calculateWinStreak(bets: Bet[]): { currentStreak: number; bestStreak: number; streakType: 'win' | 'loss' } {
  const settledBets = bets
    .filter(b => b.status === 'won' || b.status === 'lost')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (settledBets.length === 0) {
    return { currentStreak: 0, bestStreak: 0, streakType: 'win' };
  }

  const latestStatus = settledBets[0].status;
  let currentStreak = 0;
  for (const bet of settledBets) {
    if (bet.status === latestStatus) {
      currentStreak++;
    } else {
      break;
    }
  }

  let bestStreak = 0;
  let tempStreak = 0;
  for (const bet of [...settledBets].reverse()) {
    if (bet.status === 'won') {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  return {
    currentStreak,
    bestStreak,
    streakType: latestStatus === 'won' ? 'win' : 'loss'
  };
}

const CURRENCY_MAP: Record<string, string> = {
  '€': 'EUR',
  'EUR': 'EUR',
  '$': 'USD',
  'USD': 'USD',
  '£': 'GBP',
  'GBP': 'GBP',
  'C$': 'CAD',
  'CAD': 'CAD',
  'R$': 'BRL',
  'BRL': 'BRL'
};

export function getCurrencySymbol(currency?: string): string {
  return '€';
}

export function parseCurrency(value: string | number): number {
  if (typeof value === 'number') return value;
  const sanitizedValue = value.replace(',', '.');
  if (sanitizedValue === '') return 0;
  return parseFloat(sanitizedValue) || 0;
}

export function formatCurrency(amount: number, currency?: string): string {
  try {
    const cur = currency || 'EUR';
    const curCode = CURRENCY_MAP[cur] || cur;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency || '€'}${amount.toFixed(2)}`;
  }
}

export function formatOdds(decimalOdds: number, format: 'decimal' | 'american' | 'fractional' = 'decimal'): string {
  if (format === 'decimal') {
    return decimalOdds.toFixed(2);
  }
  if (format === 'american') {
    if (decimalOdds >= 2.0) {
      const american = Math.round((decimalOdds - 1) * 100);
      return `+${american}`;
    } else {
      const american = Math.round(-100 / (decimalOdds - 1));
      return `${american}`;
    }
  }
  // Fractional fallback
  const frac = (decimalOdds - 1).toFixed(2);
  return `${frac}/1`;
}
