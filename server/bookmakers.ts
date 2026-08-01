import express, { Response } from 'express';
import { query } from './db';
import { authenticateToken, AuthenticatedRequest } from './middleware';

const router = express.Router();

/**
 * GET /api/bookmakers
 * List all bookmakers for the authenticated user, including per-bankroll balances.
 */
router.get('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    // 1. Backfill check: ensure every bookmaker has at least one bankroll_bookmaker_balances row
    const bankrollRes = await query(
      `SELECT b.id FROM bankrolls b WHERE b.user_id = $1 ORDER BY b.created_at ASC LIMIT 1`,
      [userId]
    );
    const defaultBankrollId = bankrollRes.rows[0]?.id;

    if (defaultBankrollId) {
      await query(
        `INSERT INTO bankroll_bookmaker_balances (bankroll_id, bookmaker_id, cash_balance, free_bet_balance)
         SELECT $1, bm.id, bm.real_balance, bm.free_bet_balance
         FROM bookmakers bm
         WHERE bm.user_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM bankroll_bookmaker_balances bbb WHERE bbb.bookmaker_id = bm.id
           )`,
        [defaultBankrollId]
      );
    }

    // 2. Fetch all bookmakers
    const result = await query(
      `SELECT 
        id, user_id as "userId", name, logo_url as "logoUrl", 
        icon_name as "iconName", real_balance as "realBalance", 
        free_bet_balance as "freeBetBalance", average_margin as "averageMargin", 
        color, created_at as "createdAt"
       FROM bookmakers 
       WHERE user_id = $1 
       ORDER BY name ASC`,
      [userId]
    );

    // 3. Fetch all balances for these bookmakers
    const balancesRes = await query(
      `SELECT 
        bbb.bankroll_id as "bankrollId", bbb.bookmaker_id as "bookmakerId", 
        bbb.cash_balance as "cashBalance", bbb.free_bet_balance as "freeBetBalance"
       FROM bankroll_bookmaker_balances bbb
       JOIN bookmakers bm ON bm.id = bbb.bookmaker_id
       WHERE bm.user_id = $1`,
      [userId]
    );

    const balancesMap = new Map<string, Array<{ bankrollId: string; cashBalance: number; freeBetBalance: number }>>();
    for (const row of balancesRes.rows) {
      const list = balancesMap.get(row.bookmakerId) || [];
      list.push({
        bankrollId: row.bankrollId,
        cashBalance: parseFloat(row.cashBalance),
        freeBetBalance: parseFloat(row.freeBetBalance)
      });
      balancesMap.set(row.bookmakerId, list);
    }

    const bookmakers = result.rows.map((b) => {
      const balances = balancesMap.get(b.id) || [];
      const realBalance = balances.reduce((acc, x) => acc + x.cashBalance, 0);
      const freeBetBalance = balances.reduce((acc, x) => acc + x.freeBetBalance, 0);
      return {
        ...b,
        realBalance,
        freeBetBalance,
        averageMargin: parseFloat(b.averageMargin),
        balances
      };
    });

    return res.json(bookmakers);
  } catch (err: any) {
    console.error('Error fetching bookmakers:', err);
    return res.status(500).json({ error: 'Failed to retrieve bookmakers.' });
  }
});

/**
 * POST /api/bookmakers
 * Create a new bookmaker with optional initial balance for a bankroll.
 */
router.post('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, logoUrl, iconName, realBalance, cashBalance, freeBetBalance, averageMargin, color, bankrollId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Bookmaker name is required.' });
    }

    const initialCash = realBalance !== undefined ? parseFloat(realBalance) : (cashBalance !== undefined ? parseFloat(cashBalance) : 0.00);
    const initialFree = freeBetBalance !== undefined ? parseFloat(freeBetBalance) : 0.00;

    let targetBankrollId = bankrollId;
    if (!targetBankrollId) {
      const userRes = await query('SELECT active_bankroll_id as "activeBankrollId" FROM users WHERE id = $1', [userId]);
      targetBankrollId = userRes.rows[0]?.activeBankrollId;
      if (!targetBankrollId) {
        const brRes = await query('SELECT id FROM bankrolls WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1', [userId]);
        targetBankrollId = brRes.rows[0]?.id;
      }
    }

    const result = await query(
      `INSERT INTO bookmakers (user_id, name, logo_url, icon_name, real_balance, free_bet_balance, average_margin, color)
       VALUES ($1, $2, $3, $4, 0, 0, $5, $6)
       RETURNING id, user_id as "userId", name, logo_url as "logoUrl", icon_name as "iconName", real_balance as "realBalance", free_bet_balance as "freeBetBalance", average_margin as "averageMargin", color, created_at as "createdAt"`,
      [
        userId,
        name,
        logoUrl || '',
        iconName || '',
        averageMargin !== undefined ? parseFloat(averageMargin) : 5.00,
        color || '#2563eb',
      ]
    );

    const b = result.rows[0];

    if (targetBankrollId) {
      await query(
        `INSERT INTO bankroll_bookmaker_balances (bankroll_id, bookmaker_id, cash_balance, free_bet_balance)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (bankroll_id, bookmaker_id)
         DO UPDATE SET cash_balance = $3, free_bet_balance = $4`,
        [targetBankrollId, b.id, initialCash, initialFree]
      );

      await query(
        `UPDATE bookmakers SET 
          real_balance = COALESCE((SELECT SUM(cash_balance)::INTEGER FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0),
          free_bet_balance = COALESCE((SELECT SUM(free_bet_balance)::INTEGER FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0)
         WHERE id = $1`,
        [b.id]
      );
    }

    const finalRes = await query(
      `SELECT 
        id, user_id as "userId", name, logo_url as "logoUrl", 
        icon_name as "iconName", real_balance as "realBalance", 
        free_bet_balance as "freeBetBalance", average_margin as "averageMargin", 
        color, created_at as "createdAt"
       FROM bookmakers WHERE id = $1`,
      [b.id]
    );
    const balancesRes = await query(
      `SELECT bankroll_id as "bankrollId", cash_balance as "cashBalance", free_bet_balance as "freeBetBalance"
       FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1`,
      [b.id]
    );

    const updated = finalRes.rows[0];
    const balances = balancesRes.rows.map(x => ({
      bankrollId: x.bankrollId,
      cashBalance: parseFloat(x.cashBalance),
      freeBetBalance: parseFloat(x.freeBetBalance)
    }));

    return res.status(201).json({
      ...updated,
      realBalance: balances.reduce((acc, x) => acc + x.cashBalance, 0),
      freeBetBalance: balances.reduce((acc, x) => acc + x.freeBetBalance, 0),
      averageMargin: parseFloat(updated.averageMargin),
      balances
    });
  } catch (err: any) {
    console.error('Error creating bookmaker:', err);
    return res.status(500).json({ error: 'Failed to create bookmaker.' });
  }
});

/**
 * PUT /api/bookmakers/:id
 * Update bookmaker details or balance for a bankroll.
 */
router.put('/:id', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const bookmakerId = req.params.id;
    const { name, logoUrl, iconName, realBalance, cashBalance, freeBetBalance, averageMargin, color, bankrollId } = req.body;

    const newCash = realBalance !== undefined ? parseFloat(realBalance) : (cashBalance !== undefined ? parseFloat(cashBalance) : undefined);
    const newFree = freeBetBalance !== undefined ? parseFloat(freeBetBalance) : undefined;

    let targetBankrollId = bankrollId;
    if ((newCash !== undefined || newFree !== undefined) && !targetBankrollId) {
      const userRes = await query('SELECT active_bankroll_id as "activeBankrollId" FROM users WHERE id = $1', [userId]);
      targetBankrollId = userRes.rows[0]?.activeBankrollId;
      if (!targetBankrollId) {
        const brRes = await query('SELECT id FROM bankrolls WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1', [userId]);
        targetBankrollId = brRes.rows[0]?.id;
      }
    }

    if (targetBankrollId && (newCash !== undefined || newFree !== undefined)) {
      const existingRow = await query(
        `SELECT cash_balance as "cashBalance", free_bet_balance as "freeBetBalance" FROM bankroll_bookmaker_balances WHERE bankroll_id = $1 AND bookmaker_id = $2`,
        [targetBankrollId, bookmakerId]
      );
      const curCash = existingRow.rows[0] ? parseFloat(existingRow.rows[0].cashBalance) : 0;
      const curFree = existingRow.rows[0] ? parseFloat(existingRow.rows[0].freeBetBalance) : 0;

      const targetCash = newCash !== undefined ? newCash : curCash;
      const targetFree = newFree !== undefined ? newFree : curFree;

      await query(
        `INSERT INTO bankroll_bookmaker_balances (bankroll_id, bookmaker_id, cash_balance, free_bet_balance)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (bankroll_id, bookmaker_id)
         DO UPDATE SET cash_balance = $3, free_bet_balance = $4`,
        [targetBankrollId, bookmakerId, targetCash, targetFree]
      );

      await query(
        `UPDATE bookmakers SET 
          real_balance = COALESCE((SELECT SUM(cash_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0),
          free_bet_balance = COALESCE((SELECT SUM(free_bet_balance) FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0)
         WHERE id = $1`,
        [bookmakerId]
      );
    }

    const result = await query(
      `UPDATE bookmakers SET 
        name = COALESCE($1, name),
        logo_url = COALESCE($2, logo_url),
        icon_name = COALESCE($3, icon_name),
        average_margin = COALESCE($4, average_margin),
        color = COALESCE($5, color)
       WHERE id = $6 AND user_id = $7
       RETURNING id, user_id as "userId", name, logo_url as "logoUrl", icon_name as "iconName", real_balance as "realBalance", free_bet_balance as "freeBetBalance", average_margin as "averageMargin", color, created_at as "createdAt"`,
      [name, logoUrl, iconName, averageMargin, color, bookmakerId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmaker not found.' });
    }

    const b = result.rows[0];
    const balancesRes = await query(
      `SELECT bankroll_id as "bankrollId", cash_balance as "cashBalance", free_bet_balance as "freeBetBalance"
       FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1`,
      [bookmakerId]
    );
    const balances = balancesRes.rows.map(x => ({
      bankrollId: x.bankrollId,
      cashBalance: parseFloat(x.cashBalance),
      freeBetBalance: parseFloat(x.freeBetBalance)
    }));

    return res.json({
      ...b,
      realBalance: balances.reduce((acc, x) => acc + x.cashBalance, 0),
      freeBetBalance: balances.reduce((acc, x) => acc + x.freeBetBalance, 0),
      averageMargin: parseFloat(b.averageMargin),
      balances
    });
  } catch (err: any) {
    console.error('Error updating bookmaker:', err);
    return res.status(500).json({ error: 'Failed to update bookmaker.' });
  }
});

/**
 * DELETE /api/bookmakers/:id
 * Delete a bookmaker.
 */
router.delete('/:id', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const bookmakerId = req.params.id;

    await query('DELETE FROM bookmakers WHERE id = $1 AND user_id = $2', [bookmakerId, userId]);
    return res.json({ message: 'Bookmaker deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting bookmaker:', err);
    return res.status(500).json({ error: 'Failed to delete bookmaker.' });
  }
});

/**
 * POST /api/bookmakers/:id/transactions
 * Process deposit, withdrawal, or free bet transaction for a bookmaker against a specific bankroll.
 */
router.post('/:id/transactions', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const bookmakerId = req.params.id;
    const { bankrollId, type, amount, cashDelta, freeBetDelta } = req.body;

    if (!bankrollId) {
      return res.status(400).json({ error: 'bankroll_id is required.' });
    }

    let cDelta = 0;
    let fDelta = 0;

    const amt = parseFloat(amount || 0);
    if (type === 'deposit') {
      cDelta = amt;
    } else if (type === 'withdraw') {
      cDelta = -amt;
    } else if (type === 'freebet') {
      fDelta = amt;
    } else {
      if (cashDelta !== undefined) cDelta = parseFloat(cashDelta);
      if (freeBetDelta !== undefined) fDelta = parseFloat(freeBetDelta);
    }

    // 1. Per-bankroll balance upsert
    await query(
      `INSERT INTO bankroll_bookmaker_balances (bankroll_id, bookmaker_id, cash_balance, free_bet_balance)
       VALUES ($1, $2, GREATEST(0, $3), GREATEST(0, $4))
       ON CONFLICT (bankroll_id, bookmaker_id)
       DO UPDATE SET 
         cash_balance = GREATEST(0, bankroll_bookmaker_balances.cash_balance + $3),
         free_bet_balance = GREATEST(0, bankroll_bookmaker_balances.free_bet_balance + $4)`,
      [bankrollId, bookmakerId, cDelta, fDelta]
    );

    // 2. Aggregate recalculation for bookmakers table
    await query(
      `UPDATE bookmakers SET 
        real_balance = COALESCE((SELECT SUM(cash_balance)::INTEGER FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0),
        free_bet_balance = COALESCE((SELECT SUM(free_bet_balance)::INTEGER FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1), 0)
       WHERE id = $1 AND user_id = $2`,
      [bookmakerId, userId]
    );

    // 3. Update bankroll balance if cash moved
    if (cDelta !== 0) {
      await query(
        `UPDATE bankrolls SET current_balance = current_balance + $1 WHERE id = $2 AND user_id = $3`,
        [cDelta, bankrollId, userId]
      );
    }
    if (fDelta !== 0) {
      await query(
        `UPDATE bankrolls SET free_bet_credits = free_bet_credits + $1 WHERE id = $2 AND user_id = $3`,
        [fDelta, bankrollId, userId]
      );
    }

    // Return updated bookmaker
    const finalRes = await query(
      `SELECT 
        id, user_id as "userId", name, logo_url as "logoUrl", 
        icon_name as "iconName", real_balance as "realBalance", 
        free_bet_balance as "freeBetBalance", average_margin as "averageMargin", 
        color, created_at as "createdAt"
       FROM bookmakers WHERE id = $1 AND user_id = $2`,
      [bookmakerId, userId]
    );

    if (finalRes.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmaker not found.' });
    }

    const b = finalRes.rows[0];
    const balancesRes = await query(
      `SELECT bankroll_id as "bankrollId", cash_balance as "cashBalance", free_bet_balance as "freeBetBalance"
       FROM bankroll_bookmaker_balances WHERE bookmaker_id = $1`,
      [bookmakerId]
    );
    const balances = balancesRes.rows.map(x => ({
      bankrollId: x.bankrollId,
      cashBalance: parseFloat(x.cashBalance),
      freeBetBalance: parseFloat(x.freeBetBalance)
    }));

    return res.json({
      ...b,
      realBalance: balances.reduce((acc, x) => acc + x.cashBalance, 0),
      freeBetBalance: balances.reduce((acc, x) => acc + x.freeBetBalance, 0),
      averageMargin: parseFloat(b.averageMargin),
      balances
    });
  } catch (err: any) {
    console.error('Error processing bookmaker transaction:', err);
    return res.status(500).json({ error: 'Failed to process transaction.' });
  }
});

export default router;
