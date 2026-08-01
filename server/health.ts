import express, { Request, Response } from 'express';
import { query, getDbPool } from './db';

const router = express.Router();

const EXPECTED_TABLES = [
  'users',
  'bankrolls',
  'bookmakers',
  'bankroll_bookmaker_balances',
  'bets',
  'bet_legs',
  'bankroll_transfers',
  'tag_definitions',
];

/**
 * Helper function to check and log database tables on startup.
 */
export async function verifyDatabaseSchema() {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL not set. Skipping database table verification on startup.');
    return;
  }

  try {
    await query('ALTER TABLE bankrolls ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0');
    const res = await query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const existingTables = res.rows.map((row) => row.table_name);
    console.log('📋 Public schema tables found in database:', existingTables);

    const missingTables = EXPECTED_TABLES.filter((t) => !existingTables.includes(t));
    if (missingTables.length > 0) {
      console.warn(
        `⚠️ WARNING: The following expected tables from tables.sql are MISSING in the database: [${missingTables.join(
          ', '
        )}]. Please ensure tables.sql has been executed against your database instance.`
      );
    } else {
      console.log('✅ All expected database tables are present and verified.');
    }
  } catch (err: any) {
    console.error('❌ Failed to verify database tables on startup:', err.message);
  }
}

/**
 * GET /api/health/db
 * Lightweight health-check endpoint that tests database connectivity via SELECT NOW()
 */
router.get('/db', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT NOW() as current_time');
    return res.json({
      connected: true,
      timestamp: result.rows[0].current_time,
    });
  } catch (err: any) {
    console.error('Database health check failed:', err);
    return res.status(500).json({
      connected: false,
      error: err.message || 'Database connection failed',
    });
  }
});

export default router;
