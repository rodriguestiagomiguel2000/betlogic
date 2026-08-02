import express, { Response } from 'express';
import { query, getDbPool, recomputeBankrollBalance } from './db';
import { authenticateToken, AuthenticatedRequest } from './middleware';

const router = express.Router();

/**
 * GET /api/bankroll-transfers
 * List bankroll transfers for the authenticated user.
 */
router.get('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await query(
      `SELECT 
         id, user_id as "userId", date::text as date, 
         from_bankroll_id as "fromBankrollId", to_bankroll_id as "toBankrollId", 
         amount, is_free_bet_credit as "isFreeBetCredit", 
         conversion_rate as "conversionRate", notes, created_at as "createdAt"
       FROM bankroll_transfers 
       WHERE user_id = $1 
       ORDER BY date DESC, created_at DESC`,
      [userId]
    );

    const transfers = result.rows.map((t) => ({
      ...t,
      amount: parseFloat(t.amount),
      conversionRate: parseFloat(t.conversionRate),
    }));

    return res.json(transfers);
  } catch (err: any) {
    console.error('Error fetching bankroll transfers:', err);
    return res.status(500).json({ error: 'Failed to retrieve transfers.' });
  }
});

/**
 * POST /api/bankroll-transfers
 * Record a bankroll transfer and update balances accordingly.
 */
router.post('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { date, fromBankrollId, toBankrollId, fromBookmakerId, toBookmakerId, amount, isFreeBetCredit, conversionRate, notes } = req.body;

  if (!date || !fromBankrollId || !toBankrollId || !fromBookmakerId || !toBookmakerId || amount === undefined) {
    return res.status(400).json({ error: 'Missing transfer parameters. Both source and destination bookmakers must be specified.' });
  }

  const transferAmount = parseFloat(amount);
  const rate = conversionRate ? parseFloat(conversionRate) : 1.0;

  const pool = getDbPool();
  const startTime = Date.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verify source bookmaker has enough balance (if we are strictly requiring it)
    // The prompt says "Reject the request with 400 ... if the source bookmaker doesn't have sufficient balance in that bankroll"
    const srcBalRes = await client.query(
      `SELECT cash_balance, free_bet_balance FROM bankroll_bookmaker_balances WHERE bankroll_id = $1 AND bookmaker_id = $2`,
      [fromBankrollId, fromBookmakerId]
    );
    if (srcBalRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Source bookmaker has no balance in the source bankroll.' });
    }
    const { cash_balance, free_bet_balance } = srcBalRes.rows[0];
    if (isFreeBetCredit && transferAmount > free_bet_balance) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient free bet balance in the source bookmaker.' });
    } else if (!isFreeBetCredit && transferAmount > cash_balance) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient cash balance in the source bookmaker.' });
    }

    // 2. Fetch bankroll names (1 query)
    const brNamesQuery = await client.query(
      'SELECT id, name FROM bankrolls WHERE id = ANY($1)',
      [[fromBankrollId, toBankrollId]]
    );
    const fromBrName = brNamesQuery.rows.find((r: any) => r.id === fromBankrollId)?.name || 'Bankroll A';
    const toBrName = brNamesQuery.rows.find((r: any) => r.id === toBankrollId)?.name || 'Bankroll B';

    // 3. Insert transfer record
    const result = await client.query(
      `INSERT INTO bankroll_transfers (user_id, date, from_bankroll_id, to_bankroll_id, amount, is_free_bet_credit, conversion_rate, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id as "userId", date::text as date, from_bankroll_id as "fromBankrollId", to_bankroll_id as "toBankrollId", amount, is_free_bet_credit as "isFreeBetCredit", conversion_rate as "conversionRate", notes`,
      [userId, date, fromBankrollId, toBankrollId, transferAmount, isFreeBetCredit || false, rate, notes || '']
    );

    // 4. Ensure destination bookmaker allocation exists
    await client.query(
      `INSERT INTO bankroll_bookmaker_balances (bankroll_id, bookmaker_id, cash_balance, free_bet_balance) VALUES ($1, $2, 0, 0) ON CONFLICT DO NOTHING`,
      [toBankrollId, toBookmakerId]
    );

    // 5. Update bankroll_bookmaker_balances and bookmakers concurrently where possible
    const creditedAmount = transferAmount * rate;
    const srcCDelta = isFreeBetCredit ? 0 : -transferAmount;
    const srcFDelta = isFreeBetCredit ? -transferAmount : 0;
    const dstCDelta = isFreeBetCredit ? 0 : creditedAmount;
    const dstFDelta = isFreeBetCredit ? creditedAmount : 0;

    await Promise.all([
      client.query(
        `UPDATE bankroll_bookmaker_balances SET cash_balance = cash_balance + $1, free_bet_balance = free_bet_balance + $2 WHERE bankroll_id = $3 AND bookmaker_id = $4`,
        [srcCDelta, srcFDelta, fromBankrollId, fromBookmakerId]
      ),
      client.query(
        `UPDATE bankroll_bookmaker_balances SET cash_balance = cash_balance + $1, free_bet_balance = free_bet_balance + $2 WHERE bankroll_id = $3 AND bookmaker_id = $4`,
        [dstCDelta, dstFDelta, toBankrollId, toBookmakerId]
      )
    ]);

    await Promise.all([
      client.query(
        `UPDATE bookmakers SET 
          real_balance = COALESCE((SELECT SUM(cash_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0),
          free_bet_balance = COALESCE((SELECT SUM(free_bet_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0)
         WHERE id = $1`,
        [fromBookmakerId]
      ),
      fromBookmakerId !== toBookmakerId ? client.query(
        `UPDATE bookmakers SET 
          real_balance = COALESCE((SELECT SUM(cash_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0),
          free_bet_balance = COALESCE((SELECT SUM(free_bet_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0)
         WHERE id = $1`,
        [toBookmakerId]
      ) : Promise.resolve()
    ]);

    // 6. Recompute bankroll totals
    await Promise.all([
      recomputeBankrollBalance(client, fromBankrollId),
      fromBankrollId !== toBankrollId ? recomputeBankrollBalance(client, toBankrollId) : Promise.resolve()
    ]);

    // 7. Log in bankroll_transactions
    await Promise.all([
      client.query(
        `INSERT INTO bankroll_transactions (user_id, bankroll_id, date, type, description, bookmaker_id, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, fromBankrollId, date, 'Transfer', `Transfer to ${toBrName}`, fromBookmakerId, -transferAmount]
      ),
      client.query(
        `INSERT INTO bankroll_transactions (user_id, bankroll_id, date, type, description, bookmaker_id, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, toBankrollId, date, 'Transfer', `Transfer from ${fromBrName}`, toBookmakerId, creditedAmount]
      )
    ]);

    await client.query('COMMIT');
    const endTime = Date.now();
    console.log(`[Transfer API] Transaction completed in ${endTime - startTime}ms`);

    const t = result.rows[0];
    return res.status(201).json({
      ...t,
      amount: parseFloat(t.amount),
      conversionRate: parseFloat(t.conversionRate),
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error recording transfer:', err);
    return res.status(500).json({ error: 'Failed to record bankroll transfer.' });
  } finally {
    client.release();
  }
});

export default router;
