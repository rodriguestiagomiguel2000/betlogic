import express, { Response } from 'express';
import { query, getDbPool } from './db';
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
  const { date, fromBankrollId, toBankrollId, amount, isFreeBetCredit, conversionRate, notes } = req.body;

  if (!date || !fromBankrollId || !toBankrollId || amount === undefined) {
    return res.status(400).json({ error: 'Missing transfer parameters.' });
  }

  const transferAmount = parseFloat(amount);
  const rate = conversionRate ? parseFloat(conversionRate) : 1.0;

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert transfer record
    const result = await client.query(
      `INSERT INTO bankroll_transfers (user_id, date, from_bankroll_id, to_bankroll_id, amount, is_free_bet_credit, conversion_rate, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id as "userId", date::text as date, from_bankroll_id as "fromBankrollId", to_bankroll_id as "toBankrollId", amount, is_free_bet_credit as "isFreeBetCredit", conversion_rate as "conversionRate", notes`,
      [userId, date, fromBankrollId, toBankrollId, transferAmount, isFreeBetCredit || false, rate, notes || '']
    );

    // Fetch bankroll names for logging
    const fromBrNameQuery = await client.query('SELECT name FROM bankrolls WHERE id = $1', [fromBankrollId]);
    const fromBrName = fromBrNameQuery.rows[0]?.name || 'Bankroll A';

    const toBrNameQuery = await client.query('SELECT name FROM bankrolls WHERE id = $1', [toBankrollId]);
    const toBrName = toBrNameQuery.rows[0]?.name || 'Bankroll B';

    // Find source bookmaker in source bankroll
    const srcBmRes = await client.query(
      `SELECT bookmaker_id, cash_balance, free_bet_balance FROM bankroll_bookmaker_balances WHERE bankroll_id = $1 ORDER BY (cash_balance + free_bet_balance) DESC LIMIT 1`,
      [fromBankrollId]
    );
    let srcBookmakerId = srcBmRes.rows[0]?.bookmaker_id;
    if (!srcBookmakerId) {
      const anyBm = await client.query('SELECT id FROM bookmakers WHERE user_id = $1 LIMIT 1', [userId]);
      srcBookmakerId = anyBm.rows[0]?.id;
      if (srcBookmakerId) {
        await client.query(
          `INSERT INTO bankroll_bookmaker_balances (bankroll_id, bookmaker_id, cash_balance, free_bet_balance) VALUES ($1, $2, 0, 0) ON CONFLICT DO NOTHING`,
          [fromBankrollId, srcBookmakerId]
        );
      }
    }

    // Find destination bookmaker in destination bankroll
    const dstBmRes = await client.query(
      `SELECT bookmaker_id FROM bankroll_bookmaker_balances WHERE bankroll_id = $1 LIMIT 1`,
      [toBankrollId]
    );
    let dstBookmakerId = dstBmRes.rows[0]?.bookmaker_id;
    if (!dstBookmakerId && srcBookmakerId) {
      dstBookmakerId = srcBookmakerId;
    }
    if (!dstBookmakerId) {
      const anyBm = await client.query('SELECT id FROM bookmakers WHERE user_id = $1 LIMIT 1', [userId]);
      dstBookmakerId = anyBm.rows[0]?.id;
    }
    if (dstBookmakerId) {
      await client.query(
        `INSERT INTO bankroll_bookmaker_balances (bankroll_id, bookmaker_id, cash_balance, free_bet_balance) VALUES ($1, $2, 0, 0) ON CONFLICT DO NOTHING`,
        [toBankrollId, dstBookmakerId]
      );
    }

    // Deduct from source bookmaker balance
    if (srcBookmakerId) {
      const cDelta = isFreeBetCredit ? 0 : -transferAmount;
      const fDelta = isFreeBetCredit ? -transferAmount : 0;
      await client.query(
        `UPDATE bankroll_bookmaker_balances SET cash_balance = cash_balance + $1, free_bet_balance = free_bet_balance + $2 WHERE bankroll_id = $3 AND bookmaker_id = $4`,
        [cDelta, fDelta, fromBankrollId, srcBookmakerId]
      );
      await client.query(
        `UPDATE bookmakers SET 
          real_balance = COALESCE((SELECT SUM(cash_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0),
          free_bet_balance = COALESCE((SELECT SUM(free_bet_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0)
         WHERE id = $1`,
        [srcBookmakerId]
      );
    }

    // Add to destination bookmaker balance (multiplied by conversion rate)
    const creditedAmount = transferAmount * rate;
    if (dstBookmakerId) {
      const cDelta = isFreeBetCredit ? 0 : creditedAmount;
      const fDelta = isFreeBetCredit ? creditedAmount : 0;
      await client.query(
        `UPDATE bankroll_bookmaker_balances SET cash_balance = cash_balance + $1, free_bet_balance = free_bet_balance + $2 WHERE bankroll_id = $3 AND bookmaker_id = $4`,
        [cDelta, fDelta, toBankrollId, dstBookmakerId]
      );
      await client.query(
        `UPDATE bookmakers SET 
          real_balance = COALESCE((SELECT SUM(cash_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0),
          free_bet_balance = COALESCE((SELECT SUM(free_bet_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0)
         WHERE id = $1`,
        [dstBookmakerId]
      );
    }

    // Log in bankroll_transactions for Bankroll A
    await client.query(
      `INSERT INTO bankroll_transactions (user_id, bankroll_id, date, type, description, bookmaker_id, amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, fromBankrollId, date, 'Transfer', `Transfer to ${toBrName}`, null, -transferAmount]
    );

    // Log in bankroll_transactions for Bankroll B
    await client.query(
      `INSERT INTO bankroll_transactions (user_id, bankroll_id, date, type, description, bookmaker_id, amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, toBankrollId, date, 'Transfer', `Transfer from ${fromBrName}`, null, creditedAmount]
    );

    await client.query('COMMIT');

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
