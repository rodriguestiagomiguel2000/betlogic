import express, { Response } from 'express';
import { query, getDbPool, recomputeBankrollBalance } from './db';
import { authenticateToken, AuthenticatedRequest } from './middleware';

const router = express.Router();

async function applyBookmakerBalanceChange(client: any, bankrollId: string, bookmakerId: string, cashDelta: number, freeDelta: number) {
  if (cashDelta === 0 && freeDelta === 0) return;

  await client.query(
    `INSERT INTO bankroll_bookmaker_balances (bankroll_id, bookmaker_id, cash_balance, free_bet_balance)
     VALUES ($1, $2, 0, 0)
     ON CONFLICT (bankroll_id, bookmaker_id) DO NOTHING`,
    [bankrollId, bookmakerId]
  );

  await client.query(
    `UPDATE bankroll_bookmaker_balances 
     SET cash_balance = cash_balance + $1, free_bet_balance = free_bet_balance + $2 
     WHERE bankroll_id = $3 AND bookmaker_id = $4`,
    [cashDelta, freeDelta, bankrollId, bookmakerId]
  );

  await client.query(
    `UPDATE bookmakers SET 
      real_balance = COALESCE((SELECT SUM(cash_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0),
      free_bet_balance = COALESCE((SELECT SUM(free_bet_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0)
     WHERE id = $1`,
    [bookmakerId]
  );
  
  // Recompute bankroll total
  await recomputeBankrollBalance(client, bankrollId);
}

function computeBetFinancialImpact(bet: {
  stake: number;
  potentialPayout: number;
  actualReturn?: number;
  status: string;
  isFreeBet: boolean;
  freeBetDestination?: string;
}): { realCashDelta: number; freeBetDelta: number } {
  const { stake, potentialPayout, actualReturn, status, isFreeBet, freeBetDestination } = bet;
  const payout = actualReturn !== undefined && actualReturn !== null ? actualReturn : potentialPayout;

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
    const returnAmt = actualReturn !== undefined && actualReturn !== null ? actualReturn : 0;
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

/**
 * GET /api/bets
 * Lists all bets for the authenticated user, supporting optional startDate, endDate, and bankrollId filters.
 */
router.get('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate, endDate, bankrollId } = req.query;

    let queryText = `
      SELECT 
        id, date::text as date, type, total_odds as "totalOdds", stake, 
        potential_payout as "potentialPayout", actual_return as "actualReturn", 
        status, bookmaker_id as "bookmakerId", bankroll_id as "bankrollId", 
        is_live as "isLive", is_free_bet as "isFreeBet", 
        free_bet_destination as "freeBetDestination", notes, 
        scanned_slip_url as "scannedSlipUrl", image_url as "imageUrl", tags
      FROM bets 
      WHERE user_id = $1
    `;
    const queryParams: any[] = [userId];

    if (startDate) {
      queryParams.push(startDate);
      queryText += ` AND date >= $${queryParams.length}`;
    }

    if (endDate) {
      queryParams.push(endDate);
      queryText += ` AND date <= $${queryParams.length}`;
    }

    if (bankrollId) {
      queryParams.push(bankrollId);
      queryText += ` AND bankroll_id = $${queryParams.length}`;
    }

    queryText += ' ORDER BY date DESC, created_at DESC';

    const betsResult = await query(queryText, queryParams);
    const bets = betsResult.rows;

    if (bets.length === 0) {
      return res.json([]);
    }

    // Fetch all legs for these bets in one query to optimize performance
    const betIds = bets.map((b) => b.id);
    const legsResult = await query(
      `SELECT id, bet_id as "betId", sport, league, event, market, selection, odds, status, event_date as "eventDate"
       FROM bet_legs 
       WHERE bet_id = ANY($1)`,
      [betIds]
    );

    const legsByBetId: Record<string, any[]> = {};
    legsResult.rows.forEach((leg) => {
      const betId = leg.betId;
      if (!legsByBetId[betId]) {
        legsByBetId[betId] = [];
      }
      legsByBetId[betId].push({
        id: leg.id,
        sport: leg.sport,
        league: leg.league,
        event: leg.event,
        market: leg.market,
        selection: leg.selection,
        odds: parseFloat(leg.odds),
        status: leg.status,
        eventDate: leg.eventDate,
      });
    });

    // Merge legs into bets
    const enrichedBets = bets.map((bet) => ({
      ...bet,
      totalOdds: parseFloat(bet.totalOdds),
      stake: parseFloat(bet.stake),
      potentialPayout: parseFloat(bet.potentialPayout),
      actualReturn: bet.actualReturn ? parseFloat(bet.actualReturn) : 0,
      tags: typeof bet.tags === 'string' ? JSON.parse(bet.tags) : (bet.tags || []),
      legs: legsByBetId[bet.id] || [],
    }));

    return res.json(enrichedBets);
  } catch (err: any) {
    console.error('Error listing bets:', err);
    return res.status(500).json({ error: 'Failed to retrieve bets list.' });
  }
});

/**
 * POST /api/bets
 * Logs a new bet and its selections/legs. Automatically updates the parent bankroll and bookmaker.
 */
router.post('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const client = await getDbPool().connect();
  try {
    const userId = req.user?.id;
    const {
      date,
      type,
      legs,
      totalOdds,
      stake,
      potentialPayout,
      actualReturn,
      status,
      bookmakerId,
      bankrollId,
      isLive,
      isFreeBet,
      freeBetDestination,
      notes,
      scannedSlipUrl,
      imageUrl,
      tags,
    } = req.body;

    if (!date || !type || !legs || !stake || !bookmakerId || !bankrollId) {
      return res.status(400).json({ error: 'Missing required bet entry parameters.' });
    }

    await client.query('BEGIN');

    // 1. Insert Bet Header
    const betInsertQuery = `
      INSERT INTO bets (
        user_id, bankroll_id, bookmaker_id, date, type, total_odds, stake, 
        potential_payout, actual_return, status, is_live, is_free_bet, 
        free_bet_destination, notes, scanned_slip_url, image_url, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `;
    const betInsertParams = [
      userId,
      bankrollId,
      bookmakerId,
      date,
      type,
      totalOdds || 1.0,
      stake,
      potentialPayout || 0,
      actualReturn || 0,
      status || 'pending',
      isLive || false,
      isFreeBet || false,
      freeBetDestination || 'cash',
      notes || '',
      scannedSlipUrl || '',
      imageUrl || '',
      JSON.stringify(tags || []),
    ];

    const betResult = await client.query(betInsertQuery, betInsertParams);
    const betId = betResult.rows[0].id;

    // 2. Insert Bet Legs
    for (const leg of legs) {
      await client.query(
        `INSERT INTO bet_legs (bet_id, sport, league, event, market, selection, odds, status, event_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          betId,
          leg.sport,
          leg.league || '',
          leg.event,
          leg.market,
          leg.selection,
          leg.odds || 1.0,
          leg.status || status || 'pending',
          leg.eventDate ? new Date(leg.eventDate).toISOString() : null,
        ]
      );
    }

    // 3. Balance Adjustments (using computeBetFinancialImpact for pending or settled)
    const impact = computeBetFinancialImpact({
      stake: parseFloat(stake),
      potentialPayout: parseFloat(potentialPayout || 0),
      actualReturn: actualReturn !== undefined ? parseFloat(actualReturn) : undefined,
      status: status || 'pending',
      isFreeBet: !!isFreeBet,
      freeBetDestination: freeBetDestination || 'cash'
    });

    if (impact.realCashDelta !== 0 || impact.freeBetDelta !== 0) {
      await applyBookmakerBalanceChange(client, bankrollId, bookmakerId, impact.realCashDelta, impact.freeBetDelta);
    }

    await client.query('COMMIT');
    return res.status(201).json({ id: betId, message: 'Bet successfully logged.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error logging bet:', err);
    return res.status(500).json({ error: 'Failed to log your bet.' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/bets/:id
 * Updates an existing bet and its legs.
 */
router.put('/:id', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const client = await getDbPool().connect();
  try {
    const userId = req.user?.id;
    const betId = req.params.id;
    const {
      date,
      type,
      legs,
      totalOdds,
      stake,
      potentialPayout,
      actualReturn,
      status,
      bookmakerId,
      bankrollId,
      isLive,
      isFreeBet,
      freeBetDestination,
      notes,
      scannedSlipUrl,
      imageUrl,
      tags,
    } = req.body;

    await client.query('BEGIN');

    // 1. Get original bet to reverse its balance impact before updating
    const originalBetQuery = await client.query(
      'SELECT bankroll_id, bookmaker_id, stake, actual_return, potential_payout, status, is_free_bet, free_bet_destination FROM bets WHERE id = $1 AND user_id = $2',
      [betId, userId]
    );

    if (originalBetQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bet record not found.' });
    }

    const orig = originalBetQuery.rows[0];

    // 2. Reverse original balance adjustments (pending or settled)
    const origImpact = computeBetFinancialImpact({
      stake: parseFloat(orig.stake),
      potentialPayout: parseFloat(orig.potential_payout || 0),
      actualReturn: orig.actual_return !== null && orig.actual_return !== undefined ? parseFloat(orig.actual_return) : undefined,
      status: orig.status,
      isFreeBet: !!orig.is_free_bet,
      freeBetDestination: orig.free_bet_destination || 'cash'
    });

    if (origImpact.realCashDelta !== 0 || origImpact.freeBetDelta !== 0) {
      await applyBookmakerBalanceChange(client, orig.bankroll_id, orig.bookmaker_id, -origImpact.realCashDelta, -origImpact.freeBetDelta);
    }

    // 3. Update Bet Header
    await client.query(
      `UPDATE bets SET 
        bankroll_id = $1, bookmaker_id = $2, date = $3, type = $4, total_odds = $5, 
        stake = $6, potential_payout = $7, actual_return = $8, status = $9, 
        is_live = $10, is_free_bet = $11, free_bet_destination = $12, notes = $13, 
        scanned_slip_url = $14, image_url = $15, tags = $16
       WHERE id = $17 AND user_id = $18`,
      [
        bankrollId || orig.bankroll_id,
        bookmakerId || orig.bookmaker_id,
        date,
        type,
        totalOdds || 1.0,
        stake,
        potentialPayout || 0,
        actualReturn || 0,
        status || 'pending',
        isLive || false,
        isFreeBet || false,
        freeBetDestination || 'cash',
        notes || '',
        scannedSlipUrl || '',
        imageUrl || '',
        JSON.stringify(tags || []),
        betId,
        userId,
      ]
    );

    // 4. Update Bet Legs (Clear & re-insert is safest for variable count legs)
    await client.query('DELETE FROM bet_legs WHERE bet_id = $1', [betId]);
    for (const leg of legs) {
      await client.query(
        `INSERT INTO bet_legs (bet_id, sport, league, event, market, selection, odds, status, event_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          betId,
          leg.sport,
          leg.league || '',
          leg.event,
          leg.market,
          leg.selection,
          leg.odds || 1.0,
          leg.status || status || 'pending',
          leg.eventDate ? new Date(leg.eventDate).toISOString() : null,
        ]
      );
    }

    // 5. Apply NEW balance adjustments
    const newImpact = computeBetFinancialImpact({
      stake: parseFloat(stake),
      potentialPayout: parseFloat(potentialPayout || 0),
      actualReturn: actualReturn !== undefined ? parseFloat(actualReturn) : undefined,
      status: status || 'pending',
      isFreeBet: !!isFreeBet,
      freeBetDestination: freeBetDestination || 'cash'
    });

    if (newImpact.realCashDelta !== 0 || newImpact.freeBetDelta !== 0) {
      const targetBankroll = bankrollId || orig.bankroll_id;
      const targetBookmaker = bookmakerId || orig.bookmaker_id;
      await applyBookmakerBalanceChange(client, targetBankroll, targetBookmaker, newImpact.realCashDelta, newImpact.freeBetDelta);
    }

    await client.query('COMMIT');
    return res.json({ message: 'Bet updated successfully.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error updating bet:', err);
    return res.status(500).json({ error: 'Failed to update bet.' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/bets/:id
 * Deletes an existing bet. Reverses settled financial gains or losses from the bankroll/bookmaker automatically.
 */
router.delete('/:id', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const client = await getDbPool().connect();
  try {
    const userId = req.user?.id;
    const betId = req.params.id;

    await client.query('BEGIN');

    // 1. Get bet details for balance rollback
    const originalBetQuery = await client.query(
      'SELECT bankroll_id, bookmaker_id, stake, actual_return, potential_payout, status, is_free_bet, free_bet_destination FROM bets WHERE id = $1 AND user_id = $2',
      [betId, userId]
    );

    if (originalBetQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bet record not found.' });
    }

    const orig = originalBetQuery.rows[0];

    // 2. Reverse balance impact (pending or settled)
    const origImpact = computeBetFinancialImpact({
      stake: parseFloat(orig.stake),
      potentialPayout: parseFloat(orig.potential_payout || 0),
      actualReturn: orig.actual_return !== null && orig.actual_return !== undefined ? parseFloat(orig.actual_return) : undefined,
      status: orig.status,
      isFreeBet: !!orig.is_free_bet,
      freeBetDestination: orig.free_bet_destination || 'cash'
    });

    if (origImpact.realCashDelta !== 0 || origImpact.freeBetDelta !== 0) {
      await applyBookmakerBalanceChange(client, orig.bankroll_id, orig.bookmaker_id, -origImpact.realCashDelta, -origImpact.freeBetDelta);
    }

    // 3. Delete bet legs and header (cascading delete on legs handled via database schema constraint)
    await client.query('DELETE FROM bets WHERE id = $1 AND user_id = $2', [betId, userId]);

    await client.query('COMMIT');
    return res.json({ message: 'Bet deleted successfully.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error deleting bet:', err);
    return res.status(500).json({ error: 'Failed to delete bet.' });
  } finally {
    client.release();
  }
});

export default router;
