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
        // Free bet converted to real cash: full return is credited to real cash without subtracting stake
        return {
          realCashDelta: payout,
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
 * Lists bets for the authenticated user, supporting optional startDate, endDate, bankrollId, page, and limit.
 * Defaults to limit = 8 per page if page/limit are provided.
 * Excludes raw base64 image data from response to optimize performance and prevent RAM/bandwidth spikes.
 */
router.get('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const page = parseInt((req.query.page as string) || '1', 10) || 1;
    const limit = parseInt((req.query.limit as string) || '8', 10) || 8;
    const offset = Math.max(0, (page - 1) * limit);

    const status = req.query.status as string | undefined;
    const sport = req.query.sport as string | undefined;
    const bookmakerId = (req.query.bookmakerId || req.query.bookmaker_id || req.query.bookmaker) as string | undefined;
    const bankrollId = (req.query.bankrollId || req.query.bankroll_id || req.query.bankroll) as string | undefined;
    const type = req.query.type as string | undefined;
    const liveFilter = (req.query.isLive || req.query.live || req.query.is_live) as string | undefined;
    const search = (req.query.search || req.query.searchQuery || req.query.searchTerm || req.query.q) as string | undefined;
    const tag = (req.query.tag || req.query.tags) as string | undefined;
    const tipsterId = (req.query.tipsterId || req.query.tipster) as string | undefined;
    const dateRange = req.query.dateRange as string | undefined;
    let startDate = (req.query.startDate || req.query.dateFrom || req.query.date_from) as string | undefined;
    let endDate = (req.query.endDate || req.query.dateTo || req.query.date_to) as string | undefined;
    const sortBy = (req.query.sortBy || req.query.sort_by) as string | undefined;

    const usePagination = req.query.page !== undefined || req.query.limit !== undefined;

    // Evaluate preset dateRange if explicit startDate/endDate are not supplied
    if (dateRange && dateRange !== 'all' && !startDate && !endDate) {
      const now = new Date();
      if (dateRange === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (dateRange === 'yesterday') {
        const yestStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const yestEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        startDate = yestStart.toISOString();
        endDate = yestEnd.toISOString();
      } else if (dateRange === '7days' || dateRange === 'this_week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (dateRange === '30days' || dateRange === 'this_month') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (dateRange === 'last_month') {
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        startDate = lastMonthStart.toISOString();
        endDate = lastMonthEnd.toISOString();
      } else if (dateRange === 'this_year') {
        startDate = new Date(now.getFullYear(), 0, 1).toISOString();
      }
    }

    let whereClause = ` WHERE b.user_id = $1`;
    const queryParams: any[] = [userId];

    if (status && status !== 'all') {
      queryParams.push(status);
      whereClause += ` AND b.status = $${queryParams.length}`;
    }

    if (sport && sport !== 'all') {
      queryParams.push(sport);
      whereClause += ` AND EXISTS (SELECT 1 FROM bet_legs bl WHERE bl.bet_id = b.id AND bl.sport = $${queryParams.length})`;
    }

    if (bookmakerId && bookmakerId !== 'all') {
      queryParams.push(bookmakerId);
      whereClause += ` AND b.bookmaker_id = $${queryParams.length}`;
    }

    if (bankrollId && bankrollId !== 'all') {
      queryParams.push(bankrollId);
      whereClause += ` AND b.bankroll_id = $${queryParams.length}`;
    }

    if (type && type !== 'all') {
      queryParams.push(type);
      whereClause += ` AND b.type = $${queryParams.length}`;
    }

    if (liveFilter && liveFilter !== 'all') {
      if (liveFilter === 'live' || liveFilter === 'true') {
        whereClause += ` AND b.is_live = TRUE`;
      } else if (liveFilter === 'pre' || liveFilter === 'prematch' || liveFilter === 'false') {
        whereClause += ` AND b.is_live = FALSE`;
      }
    }

    if (tipsterId && tipsterId !== 'all') {
      if (tipsterId === '__MY_OWN_PICKS__' || tipsterId === 'personal' || tipsterId === 'none') {
        whereClause += ` AND b.tipster_id IS NULL`;
      } else {
        queryParams.push(tipsterId);
        whereClause += ` AND b.tipster_id = $${queryParams.length}`;
      }
    }

    if (tag && tag !== 'all' && tag.trim() !== '') {
      queryParams.push(`%${tag.trim()}%`);
      whereClause += ` AND b.tags::text ILIKE $${queryParams.length}`;
    }

    if (startDate) {
      queryParams.push(startDate);
      whereClause += ` AND b.date >= $${queryParams.length}`;
    }

    if (endDate) {
      let formattedEnd = endDate;
      if (formattedEnd.length === 10) {
        formattedEnd = `${formattedEnd}T23:59:59.999Z`;
      }
      queryParams.push(formattedEnd);
      whereClause += ` AND b.date <= $${queryParams.length}`;
    }

    if (search && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`;
      queryParams.push(searchPattern);
      const searchIdx = queryParams.length;
      whereClause += ` AND (
        b.notes ILIKE $${searchIdx} OR
        EXISTS (
          SELECT 1 FROM bet_legs bl 
          WHERE bl.bet_id = b.id 
          AND (bl.event ILIKE $${searchIdx} OR bl.selection ILIKE $${searchIdx} OR bl.market ILIKE $${searchIdx} OR bl.league ILIKE $${searchIdx})
        ) OR
        EXISTS (
          SELECT 1 FROM bookmakers bm 
          WHERE bm.id = b.bookmaker_id 
          AND bm.name ILIKE $${searchIdx}
        )
      )`;
    }

    // 1. Get total count
    const countResult = await query(
      `SELECT COUNT(*)::int as total FROM bets b ${whereClause}`,
      queryParams
    );
    const totalCount = countResult.rows[0]?.total || 0;
    const totalBets = totalCount;
    const totalPages = Math.ceil(totalCount / limit) || 1;

    // Determine sort ordering
    let orderSql = `ORDER BY b.date DESC, b.created_at DESC`;
    if (sortBy === 'date-asc') {
      orderSql = `ORDER BY b.date ASC, b.created_at ASC`;
    } else if (sortBy === 'stake-desc') {
      orderSql = `ORDER BY b.stake DESC, b.date DESC`;
    } else if (sortBy === 'stake-asc') {
      orderSql = `ORDER BY b.stake ASC, b.date DESC`;
    } else if (sortBy === 'odds-desc') {
      orderSql = `ORDER BY b.total_odds DESC, b.date DESC`;
    } else if (sortBy === 'profit-desc') {
      orderSql = `ORDER BY (COALESCE(b.actual_return, 0) - b.stake) DESC, b.date DESC`;
    } else if (sortBy === 'event-date-asc') {
      orderSql = `ORDER BY b.date ASC`;
    } else if (sortBy === 'event-date-desc') {
      orderSql = `ORDER BY b.date DESC`;
    }

    // 2. Fetch records
    let queryText = `
      SELECT 
        b.id, b.date::text as date, b.type, b.total_odds as "totalOdds", b.stake, 
        b.potential_payout as "potentialPayout", b.actual_return as "actualReturn", 
        b.status, b.bookmaker_id as "bookmakerId", b.bankroll_id as "bankrollId", 
        b.tipster_id as "tipsterId", t.name as "tipsterName", t.color as "tipsterColor", t.platform as "tipsterPlatform",
        b.is_live as "isLive", b.is_free_bet as "isFreeBet", 
        b.free_bet_destination as "freeBetDestination", b.notes, 
        ((b.scanned_slip_url IS NOT NULL AND b.scanned_slip_url != '') OR (b.image_url IS NOT NULL AND b.image_url != '')) as "hasImage",
        b.tags
      FROM bets b
      LEFT JOIN tipsters t ON b.tipster_id = t.id
      ${whereClause}
      ${orderSql}
    `;

    const dataParams = [...queryParams];
    if (usePagination) {
      dataParams.push(limit);
      queryText += ` LIMIT $${dataParams.length}`;
      dataParams.push(offset);
      queryText += ` OFFSET $${dataParams.length}`;
    } else {
      console.warn(`[WARN] Unpaginated GET /api/bets request from user ${userId}. Capping response to 200 bets.`);
      dataParams.push(200);
      queryText += ` LIMIT $${dataParams.length}`;
      dataParams.push(0);
      queryText += ` OFFSET $${dataParams.length}`;
    }

    const betsResult = await query(queryText, dataParams);
    const bets = betsResult.rows;

    if (bets.length === 0) {
      if (usePagination) {
        return res.json({
          bets: [],
          totalCount,
          totalBets: totalCount,
          totalPages,
          currentPage: page,
          limit,
        });
      }
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
    for (let i = 0; i < bets.length; i++) {
      const bet = bets[i];
      bet.totalOdds = parseFloat(bet.totalOdds);
      bet.stake = parseFloat(bet.stake);
      bet.potentialPayout = parseFloat(bet.potentialPayout);
      bet.actualReturn = bet.actualReturn ? parseFloat(bet.actualReturn) : 0;
      bet.tags = typeof bet.tags === 'string' ? JSON.parse(bet.tags) : (bet.tags || []);
      const hasImg = !!bet.hasImage;
      bet.hasImage = hasImg;
      bet.scannedSlipUrl = hasImg ? 'attached' : '';
      bet.imageUrl = hasImg ? 'attached' : '';
      bet.legs = legsByBetId[bet.id] || [];
    }

    if (usePagination) {
      return res.json({
        bets,
        totalCount,
        totalBets: totalCount,
        totalPages,
        currentPage: page,
        limit,
      });
    }

    return res.json(bets);
  } catch (err: any) {
    console.error('Error listing bets:', err);
    return res.status(500).json({ error: 'Failed to retrieve bets list.' });
  }
});

/**
 * GET /api/bets/:id/image
 * Light endpoint to retrieve the base64 image or scanned slip URL on demand for the Lightbox modal.
 */
router.get('/:id/image', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const betId = req.params.id;

    const result = await query(
      `SELECT scanned_slip_url as "scannedSlipUrl", image_url as "imageUrl" 
       FROM bets 
       WHERE id = $1 AND user_id = $2`,
      [betId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bet image not found.' });
    }

    const row = result.rows[0];
    const imageUrl = row.imageUrl || row.scannedSlipUrl || '';
    return res.json({
      id: betId,
      imageUrl,
      scannedSlipUrl: row.scannedSlipUrl || imageUrl || '',
    });
  } catch (err: any) {
    console.error('Error fetching bet image:', err);
    return res.status(500).json({ error: 'Failed to fetch bet image.' });
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
      tipsterId,
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
        free_bet_destination, notes, scanned_slip_url, image_url, tags, tipster_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
      tipsterId || null,
    ];

    const betResult = await client.query(betInsertQuery, betInsertParams);
    const betId = betResult.rows[0].id;

    // 2. Insert Bet Legs
    for (const leg of legs) {
      let eventDateIso: string | null = null;
      if (leg.eventDate) {
        try {
          const d = new Date(leg.eventDate);
          if (!isNaN(d.getTime())) {
            eventDateIso = d.toISOString();
          }
        } catch {
          eventDateIso = null;
        }
      }

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
          eventDateIso,
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
      tipsterId,
    } = req.body;

    await client.query('BEGIN');

    // 1. Get original bet to reverse its balance impact before updating
    const originalBetQuery = await client.query(
      'SELECT bankroll_id, bookmaker_id, stake, actual_return, potential_payout, status, is_free_bet, free_bet_destination, scanned_slip_url, image_url FROM bets WHERE id = $1 AND user_id = $2',
      [betId, userId]
    );

    if (originalBetQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bet record not found.' });
    }

    const orig = originalBetQuery.rows[0];

    // Preserve existing image fields if client passed 'attached' or omitted them
    const newScannedSlipUrl = (scannedSlipUrl && scannedSlipUrl !== 'attached') ? scannedSlipUrl : (orig.scanned_slip_url || '');
    const newImageUrl = (imageUrl && imageUrl !== 'attached') ? imageUrl : (orig.image_url || '');

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
        scanned_slip_url = $14, image_url = $15, tags = $16, tipster_id = $17
       WHERE id = $18 AND user_id = $19`,
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
        newScannedSlipUrl,
        newImageUrl,
        JSON.stringify(tags || []),
        tipsterId || null,
        betId,
        userId,
      ]
    );

    // 4. Update Bet Legs (Clear & re-insert is safest for variable count legs)
    await client.query('DELETE FROM bet_legs WHERE bet_id = $1', [betId]);
    for (const leg of legs) {
      let eventDateIso: string | null = null;
      if (leg.eventDate) {
        try {
          const d = new Date(leg.eventDate);
          if (!isNaN(d.getTime())) {
            eventDateIso = d.toISOString();
          }
        } catch {
          eventDateIso = null;
        }
      }

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
          eventDateIso,
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
    return res.json({ 
      message: 'Bet updated successfully.',
      hasImage: !!(newScannedSlipUrl || newImageUrl)
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error updating bet:', err);
    return res.status(500).json({ error: 'Failed to update bet.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/bets/:id/legs/:legId/status
 * Light endpoint to update a single leg status without returning base64 image strings.
 */
router.patch('/:id/legs/:legId/status', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const client = await getDbPool().connect();
  try {
    const userId = req.user?.id;
    const betId = req.params.id;
    const legId = req.params.legId;
    const { status: newLegStatus } = req.body;

    if (!newLegStatus) {
      return res.status(400).json({ error: 'Leg status is required.' });
    }

    await client.query('BEGIN');

    // 1. Update the leg status
    await client.query(
      `UPDATE bet_legs SET status = $1 WHERE id = $2 AND bet_id = $3`,
      [newLegStatus, legId, betId]
    );

    // 2. Fetch original bet header
    const origBetRes = await client.query(
      `SELECT bankroll_id, bookmaker_id, stake, total_odds, actual_return, potential_payout, status, is_free_bet, free_bet_destination, type, scanned_slip_url, image_url
       FROM bets WHERE id = $1 AND user_id = $2`,
      [betId, userId]
    );

    if (origBetRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bet not found.' });
    }

    const orig = origBetRes.rows[0];

    // 3. Reverse original financial impact
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

    // 4. Recalculate bet status based on all legs
    const allLegsRes = await client.query(
      `SELECT id, odds, status FROM bet_legs WHERE bet_id = $1`,
      [betId]
    );
    const allLegs = allLegsRes.rows.map((l) => ({ ...l, odds: parseFloat(l.odds) }));

    const anyLost = allLegs.some((l) => l.status === 'lost');
    const allWon = allLegs.every((l) => l.status === 'won');
    const allVoid = allLegs.every((l) => l.status === 'void');
    const allWonOrVoid = allLegs.every((l) => l.status === 'won' || l.status === 'void');
    const hasWon = allLegs.some((l) => l.status === 'won');

    let newStatus = orig.status;
    if (anyLost) newStatus = 'lost';
    else if (allWon || (allWonOrVoid && hasWon)) newStatus = 'won';
    else if (allVoid) newStatus = 'void';
    else newStatus = 'pending';

    let effectiveOdds = 1.0;
    for (const leg of allLegs) {
      if (leg.status !== 'void') {
        effectiveOdds *= (leg.odds || 1.0);
      }
    }

    const stake = parseFloat(orig.stake);
    const payout = Number((stake * effectiveOdds).toFixed(2));
    let ret = 0;
    if (newStatus === 'won') ret = payout;
    else if (newStatus === 'lost') ret = 0;
    else if (newStatus === 'void') ret = stake;

    // 5. Update bet header
    await client.query(
      `UPDATE bets SET status = $1, total_odds = $2, potential_payout = $3, actual_return = $4
       WHERE id = $5 AND user_id = $6`,
      [newStatus, parseFloat(effectiveOdds.toFixed(3)), payout, ret, betId, userId]
    );

    // 6. Apply new financial impact
    const newImpact = computeBetFinancialImpact({
      stake,
      potentialPayout: payout,
      actualReturn: ret,
      status: newStatus,
      isFreeBet: !!orig.is_free_bet,
      freeBetDestination: orig.free_bet_destination || 'cash'
    });

    if (newImpact.realCashDelta !== 0 || newImpact.freeBetDelta !== 0) {
      await applyBookmakerBalanceChange(client, orig.bankroll_id, orig.bookmaker_id, newImpact.realCashDelta, newImpact.freeBetDelta);
    }

    await client.query('COMMIT');

    const hasImg = !!(orig.scanned_slip_url || orig.image_url);
    return res.json({
      id: betId,
      status: newStatus,
      totalOdds: parseFloat(effectiveOdds.toFixed(3)),
      potentialPayout: payout,
      actualReturn: ret,
      scannedSlipUrl: hasImg ? 'attached' : '',
      imageUrl: hasImg ? 'attached' : '',
      hasImage: hasImg
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error updating leg status:', err);
    return res.status(500).json({ error: 'Failed to update leg status.' });
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
