import express, { Response } from 'express';
import { query } from './db';
import { authenticateToken, AuthenticatedRequest } from './middleware';

const router = express.Router();

/**
 * GET /api/analytics/pnl-calendar
 * Aggregates daily net P&L totals, bet counts, and pending statuses for a specific month and year.
 */
router.get('/pnl-calendar', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1); // 1-indexed on server query

    const aggregationQuery = `
      SELECT 
        EXTRACT(DAY FROM date)::integer as day,
        COUNT(id)::integer as "betCount",
        SUM(
          CASE 
            WHEN status = 'won' AND is_free_bet = true AND (free_bet_destination = 'cash' OR free_bet_destination IS NULL) THEN COALESCE(actual_return, potential_payout)
            WHEN status = 'won' THEN (COALESCE(actual_return, potential_payout) - stake)
            WHEN status = 'lost' THEN -stake
            WHEN status = 'cashout' AND is_free_bet = true AND (free_bet_destination = 'cash' OR free_bet_destination IS NULL) THEN COALESCE(actual_return, 0)
            WHEN status = 'cashout' THEN (COALESCE(actual_return, 0) - stake)
            ELSE 0
          END
        )::double precision as pnl,
        BOOL_OR(status = 'pending') as "hasPending"
      FROM bets
      WHERE user_id = $1 
        AND EXTRACT(YEAR FROM date) = $2 
        AND EXTRACT(MONTH FROM date) = $3
      GROUP BY EXTRACT(DAY FROM date)
      ORDER BY day
    `;

    const result = await query(aggregationQuery, [userId, year, month]);

    // Format into a map structure
    const dailyData: Record<number, { pnl: number; betCount: number; hasPending: boolean }> = {};
    result.rows.forEach((row) => {
      dailyData[row.day] = {
        pnl: row.pnl || 0.0,
        betCount: row.betCount || 0,
        hasPending: row.hasPending || false,
      };
    });

    return res.json({
      year,
      month,
      dailyData,
    });
  } catch (err: any) {
    console.error('Error fetching P&L calendar analytics:', err);
    return res.status(500).json({ error: 'Failed to aggregate daily calendar analytics.' });
  }
});

/**
 * GET /api/analytics/summary
 * Returns general KPI performance data: Win rate, total yield, ROI, total net P&L.
 */
router.get('/summary', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const summaryQuery = `
      SELECT
        COUNT(id)::integer as "totalBets",
        COUNT(CASE WHEN status = 'won' THEN 1 END)::integer as "wonBets",
        COUNT(CASE WHEN status = 'lost' THEN 1 END)::integer as "lostBets",
        COUNT(CASE WHEN status = 'pending' THEN 1 END)::integer as "pendingBets",
        SUM(stake)::double precision as "totalStaked",
        SUM(
          CASE 
            WHEN status = 'won' AND is_free_bet = true AND (free_bet_destination = 'cash' OR free_bet_destination IS NULL) THEN COALESCE(actual_return, potential_payout)
            WHEN status = 'won' THEN (COALESCE(actual_return, potential_payout) - stake)
            WHEN status = 'lost' THEN -stake
            WHEN status = 'cashout' AND is_free_bet = true AND (free_bet_destination = 'cash' OR free_bet_destination IS NULL) THEN COALESCE(actual_return, 0)
            WHEN status = 'cashout' THEN (COALESCE(actual_return, 0) - stake)
            ELSE 0
          END
        )::double precision as "totalPnL"
      FROM bets
      WHERE user_id = $1
    `;

    const result = await query(summaryQuery, [userId]);
    const stats = result.rows[0];

    const totalBets = stats.totalBets || 0;
    const settledBets = (stats.wonBets || 0) + (stats.lostBets || 0);
    const winRate = settledBets > 0 ? (stats.wonBets / settledBets) * 100 : 0.0;
    const totalStaked = stats.totalStaked || 0.0;
    const totalPnL = stats.totalPnL || 0.0;
    const roi = totalStaked > 0 ? (totalPnL / totalStaked) * 100 : 0.0;

    return res.json({
      totalBets,
      wonBets: stats.wonBets || 0,
      lostBets: stats.lostBets || 0,
      pendingBets: stats.pendingBets || 0,
      totalStaked,
      totalPnL,
      winRate: parseFloat(winRate.toFixed(2)),
      roi: parseFloat(roi.toFixed(2)),
    });
  } catch (err: any) {
    console.error('Error fetching analytics summary:', err);
    return res.status(500).json({ error: 'Failed to calculate performance summary.' });
  }
});

export default router;
