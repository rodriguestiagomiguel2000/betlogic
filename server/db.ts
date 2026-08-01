import pg from 'pg';

const { Pool } = pg;

let pool: any = null;
let isInMemoryMode = false;

function isValidPgUrl(url?: string): boolean {
  if (!url || typeof url !== 'string' || url.trim() === '') return false;
  if (url.includes('user:password@host:port') || url.includes('dbname?sslmode=require') && url.includes('host:port')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

// In-Memory Database Store as fallback when PostgreSQL is not configured
const memoryStore = {
  users: [] as any[],
  bankrolls: [] as any[],
  bookmakers: [] as any[],
  bankrollBookmakerBalances: [] as any[],
  bets: [] as any[],
  betLegs: [] as any[],
  transfers: [] as any[],
  tags: [] as any[],
  bankrollTransactions: [] as any[],
};

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Executes a simulated query against the in-memory database fallback.
 */
async function runInMemoryQuery(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  const sql = text.trim();
  const normalizedSql = sql.replace(/\s+/g, ' ');

  // Transaction control statements
  if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) {
    return { rows: [], rowCount: 0 };
  }

  // Database verification & health queries
  if (sql.includes('information_schema.tables')) {
    return {
      rows: [
        { table_name: 'users' },
        { table_name: 'bankrolls' },
        { table_name: 'bookmakers' },
        { table_name: 'bankroll_bookmaker_balances' },
        { table_name: 'bets' },
        { table_name: 'bet_legs' },
        { table_name: 'bankroll_transfers' },
        { table_name: 'tag_definitions' },
        { table_name: 'bankroll_transactions' },
      ],
      rowCount: 9,
    };
  }

  if (/^(ALTER TABLE|CREATE TABLE)/i.test(sql)) {
    return { rows: [], rowCount: 0 };
  }

  if (/SELECT NOW\(\)/i.test(sql)) {
    return { rows: [{ current_time: new Date().toISOString() }], rowCount: 1 };
  }

  // --- USERS ---
  if (/SELECT id FROM users WHERE email =/i.test(sql)) {
    const email = params[0]?.toLowerCase();
    const found = memoryStore.users.filter((u) => u.email === email);
    return { rows: found.map((u) => ({ id: u.id })), rowCount: found.length };
  }

  if (/INSERT INTO users/i.test(sql)) {
    const name = params[0];
    const email = params[1]?.toLowerCase();
    const passwordHash = params[2];
    const currency = params[3] || 'EUR';

    const newUser = {
      id: generateId('user'),
      name,
      email,
      password_hash: passwordHash,
      currency,
      odds_format: 'decimal',
      two_factor_enabled: false,
      active_bankroll_id: null,
      created_at: new Date().toISOString(),
    };
    memoryStore.users.push(newUser);
    return {
      rows: [
        {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          currency: newUser.currency,
        },
      ],
      rowCount: 1,
    };
  }

  if (/SELECT id, name, email, password_hash, currency, active_bankroll_id FROM users WHERE email =/i.test(sql)) {
    const email = params[0]?.toLowerCase();
    const found = memoryStore.users.filter((u) => u.email === email);
    return { rows: found, rowCount: found.length };
  }

  if (/SELECT .* FROM users WHERE id =/i.test(sql)) {
    const id = params[0];
    const found = memoryStore.users.filter((u) => u.id === id);
    return { rows: found, rowCount: found.length };
  }

  if (/UPDATE users SET active_bankroll_id = \$1 WHERE id = \$2/i.test(sql)) {
    const [bankrollId, userId] = params;
    const user = memoryStore.users.find((u) => u.id === userId);
    if (user) {
      user.active_bankroll_id = bankrollId;
    }
    return { rows: [], rowCount: user ? 1 : 0 };
  }

  if (/UPDATE users SET/i.test(sql)) {
    const userId = params[4];
    const user = memoryStore.users.find((u) => u.id === userId);
    if (user) {
      if (params[0] !== null && params[0] !== undefined) user.name = params[0];
      if (params[1] !== null && params[1] !== undefined) user.currency = params[1];
      if (params[2] !== null && params[2] !== undefined) user.odds_format = params[2];
      if (params[3] !== null && params[3] !== undefined) user.active_bankroll_id = params[3];
      return {
        rows: [
          {
            id: user.id,
            name: user.name,
            email: user.email,
            currency: user.currency,
            oddsFormat: user.odds_format,
            twoFactorEnabled: user.two_factor_enabled,
            activeBankrollId: user.active_bankroll_id,
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }

  // --- BANKROLLS ---
  if (/SELECT COALESCE\(MAX\(display_order\), -1\) \+ 1 as next_order FROM bankrolls/i.test(sql)) {
    const userId = params[0];
    const userBankrolls = memoryStore.bankrolls.filter((b) => b.user_id === userId);
    const maxOrder = userBankrolls.reduce((max, b) => Math.max(max, b.display_order || 0), -1);
    return { rows: [{ next_order: maxOrder + 1 }], rowCount: 1 };
  }

  if (/SELECT COUNT\(\*\) FROM bankrolls WHERE user_id =/i.test(sql)) {
    const userId = params[0];
    const count = memoryStore.bankrolls.filter((b) => b.user_id === userId).length;
    return { rows: [{ count: count.toString() }], rowCount: 1 };
  }

  if (/SELECT .* FROM bankrolls WHERE user_id = \$1/i.test(sql)) {
    const userId = params[0];
    const found = memoryStore.bankrolls
      .filter((b) => b.user_id === userId)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    return {
      rows: found.map((b) => {
        const bbbList = memoryStore.bankrollBookmakerBalances.filter((x) => x.bankroll_id === b.id);
        const currentBalance = bbbList.reduce((sum, x) => sum + (x.cash_balance || 0), 0);
        const freeBetCredits = bbbList.reduce((sum, x) => sum + (x.free_bet_balance || 0), 0);
        return {
          id: b.id,
          userId: b.user_id,
          name: b.name,
          currency: b.currency,
          initialBalance: b.initial_balance,
          currentBalance,
          freeBetCredits,
          allocatedMargin: b.allocated_margin || 0,
          color: b.color,
          description: b.description || '',
          displayOrder: b.display_order || 0,
          createdAt: b.created_at,
        };
      }),
      rowCount: found.length,
    };
  }

  if (/INSERT INTO bankrolls/i.test(sql)) {
    const [userId, name, currency, initBal, freeBal, color, description, displayOrder] = params;
    const newBankroll = {
      id: generateId('bank'),
      user_id: userId,
      name,
      currency: currency || 'EUR',
      initial_balance: parseFloat(initBal || 0),
      current_balance: 0,
      free_bet_credits: 0,
      allocated_margin: 0,
      color: color || '#2563eb',
      description: description || '',
      display_order: displayOrder || 0,
      created_at: new Date().toISOString(),
    };
    memoryStore.bankrolls.push(newBankroll);
    return {
      rows: [
        {
          id: newBankroll.id,
          userId: newBankroll.user_id,
          name: newBankroll.name,
          currency: newBankroll.currency,
          initialBalance: newBankroll.initial_balance,
          currentBalance: 0,
          freeBetCredits: 0,
          color: newBankroll.color,
          description: newBankroll.description,
          displayOrder: newBankroll.display_order,
        },
      ],
      rowCount: 1,
    };
  }

  if (/UPDATE bankrolls SET current_balance = current_balance \+ \$1/i.test(sql)) {
    const [delta, bankrollId, userId] = params;
    const br = memoryStore.bankrolls.find((b) => b.id === bankrollId && b.user_id === userId);
    if (br) {
      br.current_balance += parseFloat(delta);
    }
    return { rows: [], rowCount: br ? 1 : 0 };
  }

  if (/UPDATE bankrolls SET current_balance = current_balance - \$1/i.test(sql)) {
    const [delta, bankrollId, userId] = params;
    const br = memoryStore.bankrolls.find((b) => b.id === bankrollId && b.user_id === userId);
    if (br) {
      br.current_balance -= parseFloat(delta);
    }
    return { rows: [], rowCount: br ? 1 : 0 };
  }

  if (/UPDATE bankrolls SET free_bet_credits = free_bet_credits \+ \$1/i.test(sql)) {
    const [delta, bankrollId, userId] = params;
    const br = memoryStore.bankrolls.find((b) => b.id === bankrollId && b.user_id === userId);
    if (br) {
      br.free_bet_credits = (br.free_bet_credits || 0) + parseFloat(delta);
    }
    return { rows: [], rowCount: br ? 1 : 0 };
  }

  if (/UPDATE bankrolls SET current_balance = current_balance \+ \$1, free_bet_credits = free_bet_credits \+ \$2/i.test(sql)) {
    const [cDelta, fDelta, bankrollId, userId] = params;
    const br = memoryStore.bankrolls.find((b) => b.id === bankrollId && b.user_id === userId);
    if (br) {
      br.current_balance += parseFloat(cDelta);
      br.free_bet_credits = (br.free_bet_credits || 0) + parseFloat(fDelta);
    }
    return { rows: [], rowCount: br ? 1 : 0 };
  }

  if (/UPDATE bankrolls SET current_balance = current_balance - \$1, free_bet_credits = free_bet_credits - \$2/i.test(sql)) {
    const [cDelta, fDelta, bankrollId, userId] = params;
    const br = memoryStore.bankrolls.find((b) => b.id === bankrollId && b.user_id === userId);
    if (br) {
      br.current_balance -= parseFloat(cDelta);
      br.free_bet_credits = (br.free_bet_credits || 0) - parseFloat(fDelta);
    }
    return { rows: [], rowCount: br ? 1 : 0 };
  }

  if (/UPDATE bankrolls SET display_order =/i.test(sql)) {
    const [order, bankrollId, userId] = params;
    const br = memoryStore.bankrolls.find((b) => b.id === bankrollId && b.user_id === userId);
    if (br) {
      br.display_order = parseInt(order);
    }
    return { rows: [], rowCount: br ? 1 : 0 };
  }

  if (/UPDATE bankrolls SET/i.test(sql)) {
    const [name, currency, initBal, currBal, freeBal, color, description, bankrollId, userId] = params;
    const br = memoryStore.bankrolls.find((b) => b.id === bankrollId && b.user_id === userId);
    if (br) {
      if (name !== null && name !== undefined) br.name = name;
      if (currency !== null && currency !== undefined) br.currency = currency;
      if (initBal !== null && initBal !== undefined) br.initial_balance = parseFloat(initBal);
      if (currBal !== null && currBal !== undefined) br.current_balance = parseFloat(currBal);
      if (freeBal !== null && freeBal !== undefined) br.free_bet_credits = parseFloat(freeBal);
      if (color !== null && color !== undefined) br.color = color;
      if (description !== null && description !== undefined) br.description = description;

      return {
        rows: [
          {
            id: br.id,
            userId: br.user_id,
            name: br.name,
            currency: br.currency,
            initialBalance: br.initial_balance,
            currentBalance: br.current_balance,
            freeBetCredits: br.free_bet_credits,
            color: br.color,
            description: br.description,
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }

  if (/DELETE FROM bankrolls WHERE id = \$1 AND user_id = \$2/i.test(sql)) {
    const [id, userId] = params;
    const initialLen = memoryStore.bankrolls.length;
    memoryStore.bankrolls = memoryStore.bankrolls.filter((b) => !(b.id === id && b.user_id === userId));
    return { rows: [], rowCount: initialLen - memoryStore.bankrolls.length };
  }

  // --- BOOKMAKERS ---
  if (/INSERT INTO bookmakers .* ON CONFLICT/i.test(sql)) {
    const [userId, name, realBal, freeBal, avgMargin, color] = params;
    const exists = memoryStore.bookmakers.some((bm) => bm.user_id === userId && bm.name === name);
    if (!exists) {
      memoryStore.bookmakers.push({
        id: generateId('bm'),
        user_id: userId,
        name,
        logo_url: '',
        icon_name: '',
        real_balance: parseFloat(realBal || 0),
        free_bet_balance: parseFloat(freeBal || 0),
        average_margin: parseFloat(avgMargin || 5),
        color: color || '#10b981',
        created_at: new Date().toISOString(),
      });
    }
    return { rows: [], rowCount: 1 };
  }

  if (/SELECT .* FROM bookmakers WHERE user_id = \$1/i.test(sql)) {
    const userId = params[0];
    const found = memoryStore.bookmakers.filter((bm) => bm.user_id === userId);
    return {
      rows: found.map((b) => ({
        id: b.id,
        userId: b.user_id,
        name: b.name,
        logoUrl: b.logo_url || '',
        iconName: b.icon_name || '',
        realBalance: b.real_balance || 0,
        freeBetBalance: b.free_bet_balance || 0,
        averageMargin: b.average_margin || 5.0,
        color: b.color || '#2563eb',
        createdAt: b.created_at,
      })),
      rowCount: found.length,
    };
  }

  if (/INSERT INTO bookmakers/i.test(sql)) {
    const [userId, name, logoUrl, iconName, avgMargin, color] = params;
    const newBm = {
      id: generateId('bm'),
      user_id: userId,
      name,
      logo_url: logoUrl || '',
      icon_name: iconName || '',
      real_balance: 0,
      free_bet_balance: 0,
      average_margin: parseFloat(avgMargin || 5),
      color: color || '#2563eb',
      created_at: new Date().toISOString(),
    };
    memoryStore.bookmakers.push(newBm);
    return {
      rows: [
        {
          id: newBm.id,
          userId: newBm.user_id,
          name: newBm.name,
          logoUrl: newBm.logo_url,
          iconName: newBm.icon_name,
          realBalance: newBm.real_balance,
          freeBetBalance: newBm.free_bet_balance,
          averageMargin: newBm.average_margin,
          color: newBm.color,
          createdAt: newBm.created_at,
        },
      ],
      rowCount: 1,
    };
  }

  if (/UPDATE bookmakers SET/i.test(sql)) {
    const bmId = params[params.length - 1];
    const bm = memoryStore.bookmakers.find((b) => b.id === bmId);
    if (bm) {
      // Recalculate balances if needed
      const bbbList = memoryStore.bankrollBookmakerBalances.filter((x) => x.bookmaker_id === bmId);
      bm.real_balance = bbbList.reduce((acc, x) => acc + (x.cash_balance || 0), 0);
      bm.free_bet_balance = bbbList.reduce((acc, x) => acc + (x.free_bet_balance || 0), 0);

      return {
        rows: [
          {
            id: bm.id,
            userId: bm.user_id,
            name: bm.name,
            logoUrl: bm.logo_url || '',
            iconName: bm.icon_name || '',
            realBalance: bm.real_balance,
            freeBetBalance: bm.free_bet_balance,
            averageMargin: bm.average_margin,
            color: bm.color,
            createdAt: bm.created_at,
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }

  if (/DELETE FROM bookmakers WHERE id = \$1 AND user_id = \$2/i.test(sql)) {
    const [id, userId] = params;
    memoryStore.bookmakers = memoryStore.bookmakers.filter((b) => !(b.id === id && b.user_id === userId));
    return { rows: [], rowCount: 1 };
  }

  // --- BANKROLL BOOKMAKER BALANCES ---
  if (/INSERT INTO bankroll_bookmaker_balances/i.test(sql)) {
    const [bankrollId, bookmakerId, cashBal, freeBal] = params;
    const existing = memoryStore.bankrollBookmakerBalances.find(
      (x) => x.bankroll_id === bankrollId && x.bookmaker_id === bookmakerId
    );
    if (existing) {
      if (sql.includes('GREATEST')) {
        existing.cash_balance = Math.max(0, existing.cash_balance + parseFloat(cashBal || 0));
        existing.free_bet_balance = Math.max(0, existing.free_bet_balance + parseFloat(freeBal || 0));
      } else {
        existing.cash_balance = parseFloat(cashBal || 0);
        existing.free_bet_balance = parseFloat(freeBal || 0);
      }
    } else {
      memoryStore.bankrollBookmakerBalances.push({
        bankroll_id: bankrollId,
        bookmaker_id: bookmakerId,
        cash_balance: parseFloat(cashBal || 0),
        free_bet_balance: parseFloat(freeBal || 0),
      });
    }
    return { rows: [], rowCount: 1 };
  }

  if (/SELECT .* FROM bankroll_bookmaker_balances/i.test(sql)) {
    const userId = params[0];
    const userBmIds = memoryStore.bookmakers.filter((b) => b.user_id === userId).map((b) => b.id);
    const found = memoryStore.bankrollBookmakerBalances.filter((x) => userBmIds.includes(x.bookmaker_id));
    return {
      rows: found.map((x) => ({
        bankrollId: x.bankroll_id,
        bookmakerId: x.bookmaker_id,
        cashBalance: x.cash_balance,
        freeBetBalance: x.free_bet_balance,
      })),
      rowCount: found.length,
    };
  }

  // --- BETS & BET LEGS ---
  if (/SELECT .* FROM bets WHERE user_id = \$1/i.test(sql)) {
    const userId = params[0];
    let found = memoryStore.bets.filter((b) => b.user_id === userId);

    if (params[1]) {
      found = found.filter((b) => b.date >= params[1]);
    }
    if (params[2]) {
      found = found.filter((b) => b.date <= params[2]);
    }
    if (params[3]) {
      found = found.filter((b) => b.bankroll_id === params[3]);
    }

    found.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      rows: found.map((b) => ({
        id: b.id,
        date: b.date,
        type: b.type,
        totalOdds: b.total_odds,
        stake: b.stake,
        potentialPayout: b.potential_payout,
        actualReturn: b.actual_return,
        status: b.status,
        bookmakerId: b.bookmaker_id,
        bankrollId: b.bankroll_id,
        isLive: b.is_live,
        isFreeBet: b.is_free_bet,
        freeBetDestination: b.free_bet_destination,
        notes: b.notes || '',
        scannedSlipUrl: b.scanned_slip_url || '',
        imageUrl: b.image_url || '',
        tags: b.tags || [],
      })),
      rowCount: found.length,
    };
  }

  if (/SELECT .* FROM bet_legs WHERE bet_id = ANY\(\$1\)/i.test(sql)) {
    const betIds = params[0] || [];
    const found = memoryStore.betLegs.filter((leg) => betIds.includes(leg.bet_id));
    return {
      rows: found.map((leg) => ({
        id: leg.id,
        betId: leg.bet_id,
        sport: leg.sport,
        league: leg.league,
        event: leg.event,
        market: leg.market,
        selection: leg.selection,
        odds: leg.odds,
        status: leg.status,
      })),
      rowCount: found.length,
    };
  }

  if (/INSERT INTO bets/i.test(sql)) {
    const [
      userId,
      bankrollId,
      bookmakerId,
      date,
      type,
      totalOdds,
      stake,
      potentialPayout,
      actualReturn,
      status,
      isLive,
      isFreeBet,
      freeBetDestination,
      notes,
      scannedSlipUrl,
      imageUrl,
      tagsJson,
    ] = params;

    const newBet = {
      id: generateId('bet'),
      user_id: userId,
      bankroll_id: bankrollId,
      bookmaker_id: bookmakerId,
      date,
      type,
      total_odds: parseFloat(totalOdds || 1.0),
      stake: parseFloat(stake || 0),
      potential_payout: parseFloat(potentialPayout || 0),
      actual_return: parseFloat(actualReturn || 0),
      status: status || 'pending',
      is_live: !!isLive,
      is_free_bet: !!isFreeBet,
      free_bet_destination: freeBetDestination || 'cash',
      notes: notes || '',
      scanned_slip_url: scannedSlipUrl || '',
      image_url: imageUrl || '',
      tags: typeof tagsJson === 'string' ? JSON.parse(tagsJson) : tagsJson || [],
      created_at: new Date().toISOString(),
    };
    memoryStore.bets.push(newBet);
    return { rows: [{ id: newBet.id }], rowCount: 1 };
  }

  if (/INSERT INTO bet_legs/i.test(sql)) {
    const [betId, sport, league, event, market, selection, odds, status] = params;
    const newLeg = {
      id: generateId('leg'),
      bet_id: betId,
      sport,
      league: league || '',
      event,
      market,
      selection,
      odds: parseFloat(odds || 1.0),
      status: status || 'pending',
    };
    memoryStore.betLegs.push(newLeg);
    return { rows: [{ id: newLeg.id }], rowCount: 1 };
  }

  if (/SELECT bankroll_id, bookmaker_id, stake, actual_return, potential_payout, status, is_free_bet, free_bet_destination FROM bets WHERE id = \$1 AND user_id = \$2/i.test(sql)) {
    const [betId, userId] = params;
    const found = memoryStore.bets.filter((b) => b.id === betId && b.user_id === userId);
    return { rows: found, rowCount: found.length };
  }

  if (/UPDATE bets SET/i.test(sql)) {
    const betId = params[params.length - 2];
    const userId = params[params.length - 1];
    const bet = memoryStore.bets.find((b) => b.id === betId && b.user_id === userId);
    if (bet) {
      bet.bankroll_id = params[0] || bet.bankroll_id;
      bet.bookmaker_id = params[1] || bet.bookmaker_id;
      bet.date = params[2] || bet.date;
      bet.type = params[3] || bet.type;
      bet.total_odds = parseFloat(params[4] || 1.0);
      bet.stake = parseFloat(params[5] || 0);
      bet.potential_payout = parseFloat(params[6] || 0);
      bet.actual_return = parseFloat(params[7] || 0);
      bet.status = params[8] || 'pending';
      bet.is_live = !!params[9];
      bet.is_free_bet = !!params[10];
      bet.free_bet_destination = params[11] || 'cash';
      bet.notes = params[12] || '';
      bet.scanned_slip_url = params[13] || '';
      bet.image_url = params[14] || '';
      bet.tags = typeof params[15] === 'string' ? JSON.parse(params[15]) : params[15] || [];
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (/DELETE FROM bet_legs WHERE bet_id = \$1/i.test(sql)) {
    const betId = params[0];
    memoryStore.betLegs = memoryStore.betLegs.filter((l) => l.bet_id !== betId);
    return { rows: [], rowCount: 1 };
  }

  if (/DELETE FROM bets WHERE id = \$1 AND user_id = \$2/i.test(sql)) {
    const [betId, userId] = params;
    memoryStore.bets = memoryStore.bets.filter((b) => !(b.id === betId && b.user_id === userId));
    memoryStore.betLegs = memoryStore.betLegs.filter((l) => l.bet_id !== betId);
    return { rows: [], rowCount: 1 };
  }

  // --- BANKROLL TRANSACTIONS / BALANCE SHEET ---
  if (/SELECT .* FROM bankroll_transactions/i.test(sql)) {
    const [bankrollId, userId] = params;
    const found = memoryStore.bankrollTransactions.filter(
      (t) => t.bankroll_id === bankrollId && t.user_id === userId
    );
    const sorted = [...found].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return {
      rows: sorted.map((t) => ({
        id: t.id,
        userId: t.user_id,
        bankrollId: t.bankroll_id,
        date: t.date,
        type: t.type,
        description: t.description,
        bookmakerId: t.bookmaker_id,
        amount: t.amount,
        createdAt: t.created_at,
      })),
      rowCount: sorted.length,
    };
  }

  if (/INSERT INTO bankroll_transactions/i.test(sql)) {
    const [userId, bankrollId, date, type, description, bookmakerId, amount] = params;
    const newTx = {
      id: generateId('tx'),
      user_id: userId,
      bankroll_id: bankrollId,
      date: date || new Date().toISOString(),
      type,
      description: description || '',
      bookmaker_id: bookmakerId || null,
      amount: parseFloat(amount || 0),
      created_at: new Date().toISOString(),
    };
    memoryStore.bankrollTransactions.push(newTx);
    return {
      rows: [
        {
          id: newTx.id,
          userId: newTx.user_id,
          bankrollId: newTx.bankroll_id,
          date: newTx.date,
          type: newTx.type,
          description: newTx.description,
          bookmakerId: newTx.bookmaker_id,
          amount: newTx.amount,
          createdAt: newTx.created_at,
        },
      ],
      rowCount: 1,
    };
  }

  // --- TRANSFERS ---
  if (/SELECT .* FROM bankroll_transfers WHERE user_id = \$1/i.test(sql)) {
    const userId = params[0];
    const found = memoryStore.transfers.filter((t) => t.user_id === userId);
    return {
      rows: found.map((t) => ({
        id: t.id,
        userId: t.user_id,
        date: t.date,
        fromBankrollId: t.from_bankroll_id,
        toBankrollId: t.to_bankroll_id,
        amount: t.amount,
        isFreeBetCredit: t.is_free_bet_credit,
        conversionRate: t.conversion_rate,
        notes: t.notes,
        createdAt: t.created_at,
      })),
      rowCount: found.length,
    };
  }

  if (/INSERT INTO bankroll_transfers/i.test(sql)) {
    const [userId, date, fromId, toId, amount, isFree, rate, notes] = params;
    const newTransfer = {
      id: generateId('tr'),
      user_id: userId,
      date,
      from_bankroll_id: fromId,
      to_bankroll_id: toId,
      amount: parseFloat(amount),
      is_free_bet_credit: !!isFree,
      conversion_rate: parseFloat(rate || 1.0),
      notes: notes || '',
      created_at: new Date().toISOString(),
    };
    memoryStore.transfers.push(newTransfer);
    return {
      rows: [
        {
          id: newTransfer.id,
          userId: newTransfer.user_id,
          date: newTransfer.date,
          fromBankrollId: newTransfer.from_bankroll_id,
          toBankrollId: newTransfer.to_bankroll_id,
          amount: newTransfer.amount,
          isFreeBetCredit: newTransfer.is_free_bet_credit,
          conversionRate: newTransfer.conversion_rate,
          notes: newTransfer.notes,
        },
      ],
      rowCount: 1,
    };
  }

  // --- TAGS ---
  if (/SELECT .* FROM tag_definitions WHERE user_id = \$1/i.test(sql)) {
    const userId = params[0];
    const found = memoryStore.tags.filter((t) => t.user_id === userId);
    return { rows: found, rowCount: found.length };
  }

  if (/INSERT INTO tag_definitions/i.test(sql)) {
    const [userId, name, color] = params;
    let existing = memoryStore.tags.find((t) => t.user_id === userId && t.name === name);
    if (existing) {
      existing.color = color;
    } else {
      existing = {
        id: generateId('tag'),
        user_id: userId,
        name,
        color: color || '#3b82f6',
      };
      memoryStore.tags.push(existing);
    }
    return {
      rows: [
        {
          id: existing.id,
          userId: existing.user_id,
          name: existing.name,
          color: existing.color,
        },
      ],
      rowCount: 1,
    };
  }

  if (/DELETE FROM tag_definitions WHERE id = \$1 AND user_id = \$2/i.test(sql)) {
    const [id, userId] = params;
    memoryStore.tags = memoryStore.tags.filter((t) => !(t.id === id && t.user_id === userId));
    return { rows: [], rowCount: 1 };
  }

  // --- ANALYTICS AGGREGATIONS ---
  if (/FROM bets.*GROUP BY EXTRACT\(DAY FROM date\)/i.test(sql)) {
    const [userId, year, month] = params;
    const dailyMap: Record<number, { day: number; betCount: number; pnl: number; hasPending: boolean }> = {};

    memoryStore.bets.forEach((bet) => {
      if (bet.user_id !== userId) return;
      const d = new Date(bet.date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const dayNum = d.getDate();
        if (!dailyMap[dayNum]) {
          dailyMap[dayNum] = { day: dayNum, betCount: 0, pnl: 0, hasPending: false };
        }
        dailyMap[dayNum].betCount += 1;
        if (bet.status === 'pending') {
          dailyMap[dayNum].hasPending = true;
        } else if (bet.status === 'won') {
          dailyMap[dayNum].pnl += (bet.actual_return || bet.potential_payout) - bet.stake;
        } else if (bet.status === 'lost') {
          dailyMap[dayNum].pnl -= bet.stake;
        } else if (bet.status === 'cashout') {
          dailyMap[dayNum].pnl += (bet.actual_return || 0) - bet.stake;
        }
      }
    });

    const rows = Object.values(dailyMap).sort((a, b) => a.day - b.day);
    return { rows, rowCount: rows.length };
  }

  if (/COUNT\(id\)::integer as "totalBets"/i.test(sql)) {
    const userId = params[0];
    const userBets = memoryStore.bets.filter((b) => b.user_id === userId);

    let totalBets = userBets.length;
    let wonBets = 0;
    let lostBets = 0;
    let pendingBets = 0;
    let totalStaked = 0;
    let totalPnL = 0;

    userBets.forEach((b) => {
      totalStaked += b.stake || 0;
      if (b.status === 'won') {
        wonBets += 1;
        totalPnL += (b.actual_return || b.potential_payout) - b.stake;
      } else if (b.status === 'lost') {
        lostBets += 1;
        totalPnL -= b.stake;
      } else if (b.status === 'pending') {
        pendingBets += 1;
      } else if (b.status === 'cashout') {
        totalPnL += (b.actual_return || 0) - b.stake;
      }
    });

    return {
      rows: [
        {
          totalBets,
          wonBets,
          lostBets,
          pendingBets,
          totalStaked,
          totalPnL,
        },
      ],
      rowCount: 1,
    };
  }

  // Fallback for unknown queries
  return { rows: [], rowCount: 0 };
}

/**
 * Creates a mock Pool object to mirror pg.Pool when running in in-memory mode.
 */
function createInMemoryPool(): any {
  return {
    query: runInMemoryQuery,
    connect: async () => ({
      query: runInMemoryQuery,
      release: () => {},
    }),
    on: () => {},
  };
}

/**
 * Lazily initializes and returns the PostgreSQL Connection Pool.
 * If DATABASE_URL is missing or invalid, falls back safely to in-memory mode.
 */
export function getDbPool(): pg.Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!isValidPgUrl(connectionString)) {
    console.warn('ℹ️  DATABASE_URL environment variable is missing or not a valid PostgreSQL URL.');
    console.warn('Running in lightweight in-memory storage mode.');
    isInMemoryMode = true;
    pool = createInMemoryPool();
    return pool;
  }

  try {
    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false, // Required for secure connections to Aiven, Supabase, Neon, Cloud SQL, etc.
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err: any) => {
      console.error('Unexpected error on idle database client:', err);
    });

    console.log('✅ PostgreSQL Connection Pool initialized successfully.');
    return pool;
  } catch (error) {
    console.warn('Failed to initialize PostgreSQL Pool, falling back to in-memory mode:', error);
    isInMemoryMode = true;
    pool = createInMemoryPool();
    return pool;
  }
}

/**
 * Execute a query helper
 */
export async function query(text: string, params?: any[]) {
  const activePool = getDbPool();
  return activePool.query(text, params);
}

