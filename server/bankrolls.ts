import express, { Response } from 'express';
import { query, getDbPool, recomputeBankrollBalance } from './db';
import { authenticateToken, AuthenticatedRequest } from './middleware';
import { TRANSACTION_TYPES } from '../src/types';

const router = express.Router();

/**
 * GET /api/bankrolls
 * List all bankrolls for the authenticated user.
 */
router.get('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await query(
      `SELECT 
        b.id, b.user_id as "userId", b.name, b.currency, 
        b.initial_balance as "initialBalance", 
        COALESCE(SUM(bbb.cash_balance), 0) as "currentBalance",
        COALESCE(SUM(bbb.free_bet_balance), 0) as "freeBetCredits",
        b.allocated_margin as "allocatedMargin", 
        b.color, b.description, b.display_order as "displayOrder",
        b.rollover_from_bankroll_id as "rolloverFromBankrollId",
        COALESCE(b.status, 'active') as status,
        b.created_at as "createdAt"
       FROM bankrolls b
       LEFT JOIN bankroll_bookmaker_balances bbb ON bbb.bankroll_id = b.id
       WHERE b.user_id = $1
       GROUP BY b.id
       ORDER BY b.display_order ASC, b.created_at ASC`,
      [userId]
    );

    // Optimize by modifying in-place to reduce memory pressure
    for (let i = 0; i < result.rows.length; i++) {
      const b = result.rows[i];
      b.initialBalance = parseFloat(b.initialBalance);
      b.currentBalance = parseFloat(b.currentBalance);
      b.freeBetCredits = parseFloat(b.freeBetCredits);
      b.allocatedMargin = parseFloat(b.allocatedMargin);
      b.displayOrder = parseInt(b.displayOrder || 0);
      b.status = b.status || 'active';
    }

    return res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching bankrolls:', err);
    return res.status(500).json({ error: 'Failed to retrieve bankrolls.' });
  }
});

/**
 * POST /api/bankrolls
 * Create a new bankroll with optional rollover from an existing bankroll.
 */
router.post('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const client = await getDbPool().connect();
  try {
    const userId = req.user?.id;
    const { name, currency, color, description, allocations, rolloverFromBankrollId, archiveSource = true } = req.body;

    if (!name || !allocations || !Array.isArray(allocations) || allocations.length === 0) {
      client.release();
      return res.status(400).json({ error: 'Bankroll name and at least one allocation are required.' });
    }

    await client.query('BEGIN');

    let sourceBankrollName = '';
    if (rolloverFromBankrollId) {
      const sourceCheck = await client.query(
        'SELECT id, name FROM bankrolls WHERE id = $1 AND user_id = $2',
        [rolloverFromBankrollId, userId]
      );
      if (sourceCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'Source rollover bankroll not found.' });
      }
      sourceBankrollName = sourceCheck.rows[0].name;

      if (archiveSource) {
        await client.query(
          `UPDATE bankrolls SET status = 'archived' WHERE id = $1 AND user_id = $2`,
          [rolloverFromBankrollId, userId]
        );
      }
    }

    const orderRes = await client.query('SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM bankrolls WHERE user_id = $1', [userId]);
    const nextOrder = orderRes.rows[0]?.next_order ?? 0;

    const totalInitialCash = allocations.reduce((sum: number, alloc: any) => sum + (parseFloat(alloc.cashAmount) || 0), 0);

    const result = await client.query(
      `INSERT INTO bankrolls (user_id, name, currency, initial_balance, current_balance, free_bet_credits, color, description, display_order, rollover_from_bankroll_id, status)
       VALUES ($1, $2, $3, $4, 0, 0, $5, $6, $7, $8, 'active')
       RETURNING id, user_id as "userId", name, currency, initial_balance as "initialBalance", current_balance as "currentBalance", free_bet_credits as "freeBetCredits", color, description, display_order as "displayOrder", rollover_from_bankroll_id as "rolloverFromBankrollId", status`,
      [userId, name, currency || 'EUR', totalInitialCash, color || '#2563eb', description || '', nextOrder, rolloverFromBankrollId || null]
    );

    const newBankroll = result.rows[0];

    // Process allocations
    for (const alloc of allocations) {
        const cashAmount = parseFloat(alloc.cashAmount) || 0;
        const freeBetAmount = parseFloat(alloc.freeBetAmount) || 0;

        if (cashAmount < 0 || freeBetAmount < 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ error: 'Allocation amounts cannot be negative.' });
        }

        // In close & snapshot model, source bankroll balances are untouched.
        // Determine if this specific allocation is carried over from rollover or fresh capital
        const isAllocRollover = alloc.isRollover !== undefined
          ? Boolean(alloc.isRollover)
          : Boolean(rolloverFromBankrollId);

        if (isAllocRollover) {
          // Log transaction: Opening Balance (Carried Over) on new bankroll
          if (cashAmount > 0) {
            await client.query(
              `INSERT INTO bankroll_transactions (user_id, bankroll_id, date, type, description, bookmaker_id, amount)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [userId, newBankroll.id, new Date().toISOString(), TRANSACTION_TYPES.OPENING_BALANCE_CARRIED_OVER, `Carried over from ${sourceBankrollName || 'previous bankroll'}`, alloc.bookmakerId, cashAmount]
            ).catch(() => {});
          }
        } else {
          // Standard creation / fresh capital: log Initial Balance transaction if cashAmount > 0
          if (cashAmount > 0) {
            await client.query(
              `INSERT INTO bankroll_transactions (user_id, bankroll_id, date, type, description, bookmaker_id, amount)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [userId, newBankroll.id, new Date().toISOString(), TRANSACTION_TYPES.INITIAL_BALANCE, 'Initial bankroll allocation', alloc.bookmakerId, cashAmount]
            ).catch(() => {});
          }
        }

        // Insert into new bankroll
        await client.query(
          `INSERT INTO bankroll_bookmaker_balances (bankroll_id, bookmaker_id, cash_balance, free_bet_balance)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (bankroll_id, bookmaker_id)
           DO UPDATE SET cash_balance = bankroll_bookmaker_balances.cash_balance + $3, free_bet_balance = bankroll_bookmaker_balances.free_bet_balance + $4`,
          [newBankroll.id, alloc.bookmakerId, cashAmount, freeBetAmount]
        );

        // Also update bookmakers real_balance/free_bet_balance filtering active bankrolls
        await client.query(
            `UPDATE bookmakers SET 
              real_balance = COALESCE((SELECT SUM(bbb.cash_balance) FROM bankroll_bookmaker_balances bbb JOIN bankrolls b ON b.id = bbb.bankroll_id WHERE bbb.bookmaker_id = $1 AND b.status = 'active'), 0),
              free_bet_balance = COALESCE((SELECT SUM(bbb.free_bet_balance) FROM bankroll_bookmaker_balances bbb JOIN bankrolls b ON b.id = bbb.bankroll_id WHERE bbb.bookmaker_id = $1 AND b.status = 'active'), 0)
             WHERE id = $1`,
            [alloc.bookmakerId]
        );
    }

    await recomputeBankrollBalance(client, newBankroll.id);

    // If source was archived or this is first bankroll or active bankroll unset, set new bankroll as active
    await client.query(
      `UPDATE users 
       SET active_bankroll_id = CASE 
         WHEN active_bankroll_id IS NULL OR active_bankroll_id = $2 THEN $1 
         ELSE active_bankroll_id 
       END 
       WHERE id = $3`,
      [newBankroll.id, rolloverFromBankrollId || null, userId]
    );
    
    await client.query('COMMIT');

    newBankroll.initialBalance = parseFloat(newBankroll.initialBalance);
    newBankroll.currentBalance = parseFloat(newBankroll.currentBalance);
    newBankroll.freeBetCredits = parseFloat(newBankroll.freeBetCredits);
    newBankroll.status = newBankroll.status || 'active';

    return res.status(201).json(newBankroll);
  } catch (err: any) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating bankroll:', err);
    return res.status(500).json({ error: 'Failed to create bankroll.' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/bankrolls/reorder
 * Reorder bankrolls.
 */
router.put('/reorder', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const { bankrollIds } = req.body;

    if (!Array.isArray(bankrollIds)) {
      client.release();
      return res.status(400).json({ error: 'bankrollIds array is required.' });
    }

    await client.query('BEGIN');

    for (let i = 0; i < bankrollIds.length; i++) {
      await client.query(
        'UPDATE bankrolls SET display_order = $1 WHERE id = $2 AND user_id = $3',
        [i, bankrollIds[i], userId]
      );
    }

    await client.query('COMMIT');
    return res.json({ message: 'Bankrolls reordered successfully.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error reordering bankrolls:', err);
    return res.status(500).json({ error: 'Failed to reorder bankrolls.' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/bankrolls/:id/status
 * Update bankroll status ('active' | 'archived').
 */
router.patch('/:id/status', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const bankrollId = req.params.id;
    const { status } = req.body;

    if (!status || !['active', 'archived'].includes(status)) {
      client.release();
      return res.status(400).json({ error: "Status must be either 'active' or 'archived'." });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE bankrolls SET status = $1 WHERE id = $2 AND user_id = $3
       RETURNING id, user_id as "userId", name, currency, initial_balance as "initialBalance", current_balance as "currentBalance", free_bet_credits as "freeBetCredits", color, description, display_order as "displayOrder", rollover_from_bankroll_id as "rolloverFromBankrollId", status`,
      [status, bankrollId, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Bankroll not found.' });
    }

    // Recalculate all bookmaker balances for this user to reflect active bankrolls only
    await client.query(
      `UPDATE bookmakers SET 
        real_balance = COALESCE((
          SELECT SUM(bbb.cash_balance) 
          FROM bankroll_bookmaker_balances bbb 
          JOIN bankrolls b ON b.id = bbb.bankroll_id 
          WHERE bbb.bookmaker_id = bookmakers.id AND b.status = 'active'
        ), 0),
        free_bet_balance = COALESCE((
          SELECT SUM(bbb.free_bet_balance) 
          FROM bankroll_bookmaker_balances bbb 
          JOIN bankrolls b ON b.id = bbb.bankroll_id 
          WHERE bbb.bookmaker_id = bookmakers.id AND b.status = 'active'
        ), 0)
       WHERE user_id = $1`,
      [userId]
    );

    // If archived and it was the active bankroll, switch active bankroll to another active bankroll
    if (status === 'archived') {
      const activeCheck = await client.query(
        `SELECT active_bankroll_id FROM users WHERE id = $1`,
        [userId]
      );
      if (activeCheck.rows[0]?.active_bankroll_id === bankrollId) {
        const nextActive = await client.query(
          `SELECT id FROM bankrolls WHERE user_id = $1 AND status = 'active' ORDER BY display_order ASC, created_at ASC LIMIT 1`,
          [userId]
        );
        await client.query(
          `UPDATE users SET active_bankroll_id = $1 WHERE id = $2`,
          [nextActive.rows[0]?.id || null, userId]
        );
      }
    }

    await client.query('COMMIT');

    const updated = result.rows[0];
    updated.initialBalance = parseFloat(updated.initialBalance);
    updated.currentBalance = parseFloat(updated.currentBalance);
    updated.freeBetCredits = parseFloat(updated.freeBetCredits);
    updated.status = updated.status || 'active';

    return res.json(updated);
  } catch (err: any) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error updating bankroll status:', err);
    return res.status(500).json({ error: 'Failed to update bankroll status.' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/bankrolls/:id
 * Update an existing bankroll.
 */
router.put('/:id', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const bankrollId = req.params.id;
    const { name, currency, initialBalance, currentBalance, freeBetCredits, color, description } = req.body;

    let balanceDiff = 0;
    if (currentBalance !== undefined) {
      const oldRes = await query('SELECT current_balance FROM bankrolls WHERE id = $1 AND user_id = $2', [bankrollId, userId]);
      if (oldRes.rows.length > 0) {
        const oldVal = oldRes.rows[0].current_balance !== null ? parseFloat(oldRes.rows[0].current_balance) : 0;
        balanceDiff = parseFloat(currentBalance) - oldVal;
      }
    }

    const result = await query(
      `UPDATE bankrolls SET 
        name = COALESCE($1, name),
        currency = COALESCE($2, currency),
        initial_balance = COALESCE($3, initial_balance),
        current_balance = COALESCE($4, current_balance),
        free_bet_credits = COALESCE($5, free_bet_credits),
        color = COALESCE($6, color),
        description = COALESCE($7, description)
       WHERE id = $8 AND user_id = $9
       RETURNING id, user_id as "userId", name, currency, initial_balance as "initialBalance", current_balance as "currentBalance", free_bet_credits as "freeBetCredits", color, description`,
      [name, currency, initialBalance, currentBalance, freeBetCredits, color, description, bankrollId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bankroll not found.' });
    }

    if (balanceDiff !== 0) {
      await query(
        `INSERT INTO bankroll_transactions (user_id, bankroll_id, date, type, description, bookmaker_id, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, bankrollId, new Date().toISOString(), 'Adjustment', `Reconciliation Adjustment`, null, balanceDiff]
      );
    }

    const updated = result.rows[0];
    updated.initialBalance = parseFloat(updated.initialBalance);
    updated.currentBalance = parseFloat(updated.currentBalance);
    updated.freeBetCredits = parseFloat(updated.freeBetCredits);

    return res.json(updated);
  } catch (err: any) {
    console.error('Error updating bankroll:', err);
    return res.status(500).json({ error: 'Failed to update bankroll.' });
  }
});

/**
 * DELETE /api/bankrolls/:id
 * Delete a bankroll.
 */
router.delete('/:id', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const bankrollId = req.params.id;

    // Check how many bankrolls user has
    const countRes = await query('SELECT COUNT(*) FROM bankrolls WHERE user_id = $1', [userId]);
    if (parseInt(countRes.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot delete your only remaining bankroll.' });
    }

    await query('DELETE FROM bankrolls WHERE id = $1 AND user_id = $2', [bankrollId, userId]);

    // Update active bankroll if needed
    const nextBankroll = await query('SELECT id FROM bankrolls WHERE user_id = $1 LIMIT 1', [userId]);
    if (nextBankroll.rows.length > 0) {
      await query('UPDATE users SET active_bankroll_id = $1 WHERE id = $2', [nextBankroll.rows[0].id, userId]);
    }

    return res.json({ message: 'Bankroll deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting bankroll:', err);
    return res.status(500).json({ error: 'Failed to delete bankroll.' });
  }
});

/**
 * GET /api/bankrolls/all-transactions
 * Retrieve all transactions across all bankrolls for the authenticated user.
 */
router.get('/all-transactions', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    // Ensure table exists
    await query(`
      CREATE TABLE IF NOT EXISTS bankroll_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bankroll_id UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
        date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        bookmaker_id UUID REFERENCES bookmakers(id) ON DELETE SET NULL,
        amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    // Check if any bankroll has no transaction log yet and seed initial balance
    const brRes = await query(
      `SELECT b.id, b.initial_balance, b.created_at,
              COALESCE(SUM(bbb.cash_balance), 0) as alloc_total
       FROM bankrolls b
       LEFT JOIN bankroll_bookmaker_balances bbb ON bbb.bankroll_id = b.id
       WHERE b.user_id = $1
       GROUP BY b.id`,
      [userId]
    ).catch(() => ({ rows: [] }));

    for (const br of brRes.rows) {
      const initBal = Math.max(parseFloat(br.initial_balance || 0), parseFloat(br.alloc_total || 0));
      if (initBal > 0) {
        const txCheck = await query(
          `SELECT id FROM bankroll_transactions WHERE bankroll_id = $1 AND user_id = $2 LIMIT 1`,
          [br.id, userId]
        ).catch(() => ({ rows: [] }));

        if (txCheck.rows.length === 0) {
          const txType = br.rollover_from_bankroll_id
            ? TRANSACTION_TYPES.OPENING_BALANCE_CARRIED_OVER
            : TRANSACTION_TYPES.INITIAL_BALANCE;
          const desc = br.rollover_from_bankroll_id
            ? 'Carried over opening balance'
            : 'Initial bankroll creation';

          await query(
            `INSERT INTO bankroll_transactions (user_id, bankroll_id, date, type, description, bookmaker_id, amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, br.id, br.created_at || new Date().toISOString(), txType, desc, null, initBal]
          ).catch(() => {});
        }
      }
    }

    const queryText = `SELECT id, user_id as "userId", bankroll_id as "bankrollId", date::text as date, type, description, bookmaker_id as "bookmakerId", amount
       FROM bankroll_transactions
       WHERE user_id = $1
       ORDER BY date ASC, created_at ASC`;

    const result = await query(queryText, [userId]);
    // Optimize by modifying in-place to reduce memory pressure
    for (let i = 0; i < result.rows.length; i++) {
      const t = result.rows[i];
      t.amount = parseFloat(t.amount || 0);
    }

    return res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching all bankroll transactions:', err);
    return res.status(500).json({ error: err.message || 'Failed to retrieve all bankroll transactions.' });
  }
});

/**
 * GET /api/bankrolls/:id/transactions
 * Retrieve the balance sheet / transaction history for a bankroll.
 */
router.get('/:id/transactions', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const bankrollId = req.params.id;
    console.log(`[DEBUG] GET /api/bankrolls/${bankrollId}/transactions called for user ${userId}`);

    // Ensure table exists
    await query(`
      CREATE TABLE IF NOT EXISTS bankroll_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bankroll_id UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
        date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        bookmaker_id UUID REFERENCES bookmakers(id) ON DELETE SET NULL,
        amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    const queryText = `SELECT id, user_id as "userId", bankroll_id as "bankrollId", date::text as date, type, description, bookmaker_id as "bookmakerId", amount
       FROM bankroll_transactions
       WHERE bankroll_id = $1 AND user_id = $2
       ORDER BY date ASC, created_at ASC`;
    console.log(`[DEBUG] Executing SQL query: ${queryText} with params: [${bankrollId}, ${userId}]`);

    const result = await query(queryText, [bankrollId, userId]);

    let rows = result.rows;
    console.log(`[DEBUG] Query returned ${rows.length} rows`);

    if (rows.length === 0) {
      const brRes = await query(
        `SELECT id, initial_balance, created_at, rollover_from_bankroll_id FROM bankrolls WHERE id = $1 AND user_id = $2`,
        [bankrollId, userId]
      ).catch(() => ({ rows: [] }));

      if (brRes.rows.length > 0) {
        const br = brRes.rows[0];
        const initBal = parseFloat(br.initial_balance || 0);
        if (initBal > 0) {
          const txType = br.rollover_from_bankroll_id
            ? TRANSACTION_TYPES.OPENING_BALANCE_CARRIED_OVER
            : TRANSACTION_TYPES.INITIAL_BALANCE;
          const desc = br.rollover_from_bankroll_id
            ? 'Carried over opening balance'
            : 'Initial bankroll creation';

          await query(
            `INSERT INTO bankroll_transactions (user_id, bankroll_id, date, type, description, bookmaker_id, amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, bankrollId, br.created_at || new Date().toISOString(), txType, desc, null, initBal]
          ).catch(() => {});

          const retryRes = await query(queryText, [bankrollId, userId]).catch(() => ({ rows: [] }));
          rows = retryRes.rows;
          console.log(`[DEBUG] After seeding initial balance, query returned ${rows.length} rows`);
        }
      }
    }

    // Optimize by modifying in-place to reduce memory pressure
    for (let i = 0; i < rows.length; i++) {
      const t = rows[i];
      t.amount = parseFloat(t.amount || 0);
    }

    return res.json(rows);
  } catch (err: any) {
    console.error('Error fetching bankroll transactions:', err);
    return res.status(500).json({ error: err.message || 'Failed to retrieve bankroll transactions.' });
  }
});

export default router;
