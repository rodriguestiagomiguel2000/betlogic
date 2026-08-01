import express, { Response } from 'express';
import { query } from './db';
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
  try {
    const userId = req.user?.id;
    const { date, fromBankrollId, toBankrollId, amount, isFreeBetCredit, conversionRate, notes } = req.body;

    if (!date || !fromBankrollId || !toBankrollId || amount === undefined) {
      return res.status(400).json({ error: 'Missing transfer parameters.' });
    }

    const transferAmount = parseFloat(amount);
    const rate = conversionRate ? parseFloat(conversionRate) : 1.0;

    // Insert transfer record
    const result = await query(
      `INSERT INTO bankroll_transfers (user_id, date, from_bankroll_id, to_bankroll_id, amount, is_free_bet_credit, conversion_rate, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id as "userId", date::text as date, from_bankroll_id as "fromBankrollId", to_bankroll_id as "toBankrollId", amount, is_free_bet_credit as "isFreeBetCredit", conversion_rate as "conversionRate", notes`,
      [userId, date, fromBankrollId, toBankrollId, transferAmount, isFreeBetCredit || false, rate, notes || '']
    );

    // Deduct from source bankroll
    await query(
      'UPDATE bankrolls SET current_balance = current_balance - $1 WHERE id = $2 AND user_id = $3',
      [transferAmount, fromBankrollId, userId]
    );

    // Add to destination bankroll (multiplied by conversion rate)
    const creditedAmount = transferAmount * rate;
    await query(
      'UPDATE bankrolls SET current_balance = current_balance + $1 WHERE id = $2 AND user_id = $3',
      [creditedAmount, toBankrollId, userId]
    );

    const t = result.rows[0];
    return res.status(201).json({
      ...t,
      amount: parseFloat(t.amount),
      conversionRate: parseFloat(t.conversionRate),
    });
  } catch (err: any) {
    console.error('Error recording transfer:', err);
    return res.status(500).json({ error: 'Failed to record bankroll transfer.' });
  }
});

export default router;
