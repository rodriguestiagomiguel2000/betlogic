import { Bankroll, Bookmaker, Bet, BankrollTransfer, UserPreferences, TagDefinition } from './types';

export const INITIAL_BANKROLLS: Bankroll[] = [
  {
    id: 'bank-1',
    name: 'Main Aggressive Unit',
    currency: 'USD',
    initialBalance: 5000,
    currentBalance: 6840.50,
    freeBetCredits: 150.00,
    allocatedMargin: 1200,
    color: '#2563eb',
    description: 'Primary high-ROI betting fund'
  },
  {
    id: 'bank-2',
    name: 'Conservative Value Bankroll',
    currency: 'USD',
    initialBalance: 2500,
    currentBalance: 3120.00,
    freeBetCredits: 50.00,
    allocatedMargin: 500,
    color: '#00a572',
    description: 'Low risk single bets only'
  },
  {
    id: 'bank-3',
    name: 'Bonus Rollover Fund',
    currency: 'USD',
    initialBalance: 1000,
    currentBalance: 1420.00,
    freeBetCredits: 200.00,
    allocatedMargin: 300,
    color: '#cf2c30',
    description: 'Promo unlocking and free bet conversion'
  }
];

export const INITIAL_BOOKMAKERS: Bookmaker[] = [
  {
    id: 'bm-1',
    bankrollId: 'bank-1',
    name: 'Pinnacle',
    realBalance: 3200.00,
    freeBetBalance: 0.00,
    averageMargin: 2.3, // Lowest margin/juice
    pendingBetsCount: 2,
    color: '#3b82f6',
    balances: [
      { bankrollId: 'bank-1', bookmakerId: 'bm-1', bookmakerName: 'Pinnacle', cashBalance: 3200.00, freeBetBalance: 0.00 }
    ]
  },
  {
    id: 'bm-2',
    bankrollId: 'bank-1',
    name: 'Bet365',
    realBalance: 2950.50,
    freeBetBalance: 125.00,
    averageMargin: 4.5,
    pendingBetsCount: 4,
    color: '#10b981',
    balances: [
      { bankrollId: 'bank-1', bookmakerId: 'bm-2', bookmakerName: 'Bet365', cashBalance: 2450.50, freeBetBalance: 100.00 },
      { bankrollId: 'bank-2', bookmakerId: 'bm-2', bookmakerName: 'Bet365', cashBalance: 500.00, freeBetBalance: 25.00 }
    ]
  },
  {
    id: 'bm-3',
    bankrollId: 'bank-2',
    name: 'DraftKings',
    realBalance: 1800.00,
    freeBetBalance: 150.00,
    averageMargin: 5.2,
    pendingBetsCount: 1,
    color: '#f59e0b',
    balances: [
      { bankrollId: 'bank-2', bookmakerId: 'bm-3', bookmakerName: 'DraftKings', cashBalance: 1800.00, freeBetBalance: 150.00 }
    ]
  },
  {
    id: 'bm-4',
    bankrollId: 'bank-2',
    name: 'Fanduel',
    realBalance: 2200.00,
    freeBetBalance: 50.00,
    averageMargin: 4.9,
    pendingBetsCount: 0,
    color: '#6366f1',
    balances: [
      { bankrollId: 'bank-2', bookmakerId: 'bm-4', bookmakerName: 'Fanduel', cashBalance: 2200.00, freeBetBalance: 50.00 }
    ]
  },
  {
    id: 'bm-5',
    bankrollId: 'bank-3',
    name: 'Betclic',
    realBalance: 1500.00,
    freeBetBalance: 250.00,
    averageMargin: 4.2,
    pendingBetsCount: 0,
    color: '#ef4444',
    balances: [
      { bankrollId: 'bank-3', bookmakerId: 'bm-5', bookmakerName: 'Betclic', cashBalance: 1200.00, freeBetBalance: 200.00 },
      { bankrollId: 'bank-1', bookmakerId: 'bm-5', bookmakerName: 'Betclic', cashBalance: 300.00, freeBetBalance: 50.00 }
    ]
  }
];

export const INITIAL_BETS: Bet[] = [
  {
    id: 'bet-101',
    date: '2026-07-29T18:30:00Z',
    type: 'single',
    legs: [
      {
        id: 'leg-1',
        sport: 'Football',
        league: 'Champions League',
        event: 'Real Madrid vs Bayern Munich',
        market: 'Match Result',
        selection: 'Real Madrid to Win',
        odds: 2.10,
        status: 'won'
      }
    ],
    totalOdds: 2.10,
    stake: 200,
    potentialPayout: 420,
    actualReturn: 420,
    status: 'won',
    bookmakerId: 'bm-1',
    bankrollId: 'bank-1',
    isLive: false,
    isFreeBet: false,
    notes: 'High confidence sharp line value',
    tags: ['Value Bet', 'Pre-Match'],
    imageUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=800&q=80',
    scannedSlipUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'bet-102',
    date: '2026-07-29T20:15:00Z',
    type: 'parlay',
    legs: [
      {
        id: 'leg-2',
        sport: 'Basketball',
        league: 'NBA',
        event: 'Celtics vs Lakers',
        market: 'Spread',
        selection: 'Celtics -5.5',
        odds: 1.90,
        status: 'won'
      },
      {
        id: 'leg-3',
        sport: 'Basketball',
        league: 'NBA',
        event: 'Nuggets vs Suns',
        market: 'Over/Under',
        selection: 'Over 224.5',
        odds: 1.85,
        status: 'won'
      }
    ],
    totalOdds: 3.515,
    stake: 100,
    potentialPayout: 351.50,
    actualReturn: 351.50,
    status: 'won',
    bookmakerId: 'bm-2',
    bankrollId: 'bank-1',
    isLive: true,
    isFreeBet: false,
    notes: 'In-play momentum parlay',
    tags: ['Live'],
    imageUrl: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=800&q=80',
    scannedSlipUrl: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'bet-103',
    date: '2026-07-30T14:00:00Z',
    type: 'bet_builder',
    legs: [
      {
        id: 'leg-4',
        sport: 'Football',
        league: 'Premier League',
        event: 'Arsenal vs Chelsea',
        market: 'Anytime Goalscorer',
        selection: 'Bukayo Saka',
        odds: 2.60,
        status: 'pending'
      },
      {
        id: 'leg-5',
        sport: 'Football',
        league: 'Premier League',
        event: 'Arsenal vs Chelsea',
        market: 'Total Corners',
        selection: 'Over 9.5 Corners',
        odds: 1.75,
        status: 'pending'
      }
    ],
    totalOdds: 4.55,
    stake: 50,
    potentialPayout: 227.50,
    status: 'pending',
    bookmakerId: 'bm-2',
    bankrollId: 'bank-1',
    isLive: false,
    isFreeBet: true,
    notes: 'Used Free Bet promo credit',
    tags: ['System']
  },
  {
    id: 'bet-104',
    date: '2026-07-28T16:00:00Z',
    type: 'single',
    legs: [
      {
        id: 'leg-6',
        sport: 'Tennis',
        league: 'Wimbledon',
        event: 'Alcaraz vs Djokovic',
        market: 'Set Handicap',
        selection: 'Alcaraz -1.5 Sets',
        odds: 2.25,
        status: 'won'
      }
    ],
    totalOdds: 2.25,
    stake: 150,
    potentialPayout: 337.50,
    actualReturn: 337.50,
    status: 'won',
    bookmakerId: 'bm-1',
    bankrollId: 'bank-2',
    isLive: false,
    isFreeBet: false,
    tags: ['Pre-Match', 'Value Bet']
  },
  {
    id: 'bet-105',
    date: '2026-07-27T19:00:00Z',
    type: 'single',
    legs: [
      {
        id: 'leg-7',
        sport: 'Esports',
        league: 'CS:GO Major',
        event: 'Faze vs NaVi',
        market: 'Map 1 Winner',
        selection: 'NaVi',
        odds: 1.80,
        status: 'lost'
      }
    ],
    totalOdds: 1.80,
    stake: 100,
    potentialPayout: 180,
    actualReturn: 0,
    status: 'lost',
    bookmakerId: 'bm-3',
    bankrollId: 'bank-2',
    isLive: true,
    isFreeBet: false,
    tags: ['Live', 'Cashout']
  }
];

export const INITIAL_TAGS: TagDefinition[] = [
  { id: 'tag-1', name: 'Pre-Match', color: '#2563eb' },
  { id: 'tag-2', name: 'Live', color: '#ef4444' },
  { id: 'tag-3', name: 'Value Bet', color: '#10b981' },
  { id: 'tag-4', name: 'System', color: '#8b5cf6' },
  { id: 'tag-5', name: 'Cashout', color: '#f59e0b' }
];

export const INITIAL_TRANSFERS: BankrollTransfer[] = [
  {
    id: 'tr-1',
    date: '2026-07-25T10:00:00Z',
    fromBankrollId: 'bank-1',
    toBankrollId: 'bank-3',
    amount: 300,
    isFreeBetCredit: false,
    rolloverRequired: 900,
    rolloverCompleted: 900,
    notes: 'Initial promo allocation'
  },
  {
    id: 'tr-2',
    date: '2026-07-28T11:30:00Z',
    fromBankrollId: 'bank-3',
    toBankrollId: 'bank-2',
    amount: 150,
    isFreeBetCredit: true,
    conversionRate: 0.85,
    notes: 'Free bet profit transfer'
  }
];

export const INITIAL_USER_PREFS: UserPreferences = {
  name: 'Tiago Rodrigues',
  email: 'rodrigues.tiagomiguel@gmail.com',
  currency: 'EUR',
  oddsFormat: 'decimal',
  twoFactorEnabled: true,
  activeBankrollId: 'bank-1',
  notifications: {
    winStreakAlerts: true,
    highRiskWarnings: true,
    rolloverMilestones: true,
    weeklyReports: false
  }
};
