export type BetStatus = 'pending' | 'won' | 'lost' | 'void' | 'cashout';
export type BetType = 'single' | 'parlay' | 'bet_builder';
export type SportType = 'Football' | 'Basketball' | 'Tennis' | 'Baseball' | 'Ice Hockey' | 'Esports' | 'MMA' | 'Golf';

export interface BetLeg {
  id: string;
  sport?: SportType | '';
  league?: string;
  event: string;
  market: string;
  selection: string;
  odds: number;
  status: BetStatus;
  eventDate?: string;
  builderId?: string;
  builderOdds?: number;
}

export interface Bet {
  id: string;
  date: string;
  type: BetType;
  legs: BetLeg[];
  totalOdds: number;
  stake: number;
  potentialPayout: number;
  actualReturn?: number;
  status: BetStatus;
  bookmakerId: string;
  bankrollId: string;
  isLive: boolean;
  isFreeBet: boolean;
  freeBetDestination?: 'cash' | 'free_bet'; // 'cash' (default SNR: net profit to cash) or 'free_bet' (rollover back to bonus)
  notes?: string;
  scannedSlipUrl?: string;
  imageUrl?: string;
  hasImage?: boolean;
  tags?: string[];
  tipsterId?: string;
  tipsterName?: string;
  tipsterColor?: string;
  tipsterPlatform?: string;
}

export interface PaginatedBets {
  bets: Bet[];
  totalPages: number;
  currentPage: number;
  totalBets: number;
  totalCount?: number;
  limit?: number;
}

export interface Tipster {
  id: string;
  userId?: string;
  name: string;
  platform?: string;
  notes?: string;
  color?: string;
  createdAt?: string;
}

export interface TagDefinition {
  id: string;
  name: string;
  color: string;
}

export interface Bankroll {
  id: string;
  name: string;
  currency: string;
  initialBalance: number;
  currentBalance: number;
  freeBetCredits: number;
  allocatedMargin: number;
  color: string;
  description?: string;
  displayOrder?: number;
  rolloverFromBankrollId?: string;
  status?: 'active' | 'archived';
}

export interface BankrollBookmakerBalance {
  id?: string;
  bankrollId: string;
  bookmakerId: string;
  bookmakerName: string;
  cashBalance: number;
  freeBetBalance: number;
}

export interface Bookmaker {
  id: string;
  bankrollId?: string; // Default or target bankroll
  name: string;
  logoUrl?: string;
  iconName?: string;
  realBalance: number; // Aggregated total or primary cash balance
  freeBetBalance: number; // Aggregated total or primary free bet balance
  averageMargin: number; // e.g. 4.8% juice
  pendingBetsCount: number;
  color: string;
  balances?: BankrollBookmakerBalance[]; // Sub-relation or scoped array keyed by bankrollId
}

export interface BankrollTransfer {
  id: string;
  date: string;
  fromBankrollId: string;
  toBankrollId: string;
  fromBookmakerId?: string;
  toBookmakerId?: string;
  amount: number;
  isFreeBetCredit: boolean;
  conversionRate?: number;
  rolloverRequired?: number;
  rolloverCompleted?: number;
  notes?: string;
}

export interface BankrollTransaction {
  id: string;
  userId: string;
  bankrollId: string;
  date: string;
  type: string; // Initial Balance, Deposit, Withdrawal, Adjustment, Transfer
  description: string;
  bookmakerId?: string;
  amount: number;
}

export interface CSVMappingField {
  sourceColumn: string;
  targetField: keyof Bet | 'ignore';
}

export interface CSVImportResult {
  totalRows: number;
  successfulRows: number;
  errors: Array<{ line: number; message: string; rawData: Record<string, string> }>;
}

export interface UserPreferences {
  name: string;
  email: string;
  currency: string;
  oddsFormat: 'decimal' | 'american' | 'fractional';
  twoFactorEnabled: boolean;
  activeBankrollId?: string;
  notifications: {
    winStreakAlerts: boolean;
    highRiskWarnings: boolean;
    rolloverMilestones: boolean;
    weeklyReports: boolean;
  };
}
