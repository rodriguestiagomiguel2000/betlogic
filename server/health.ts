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
  'bankroll_transactions',
  'tipsters',
];

/**
 * Helper function to check and log database tables on startup.
 */
export async function verifyDatabaseSchema() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    console.warn('⚠️ DATABASE_URL not set. Running in lightweight in-memory storage mode.');
    return;
  }

  try {
    await query('ALTER TABLE bankrolls ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0');
    await query('ALTER TABLE bet_legs ADD COLUMN IF NOT EXISTS event_date TIMESTAMP WITH TIME ZONE');
    await query('ALTER TABLE bet_legs ADD COLUMN IF NOT EXISTS sport VARCHAR(100)');
    await query('ALTER TABLE bet_legs ALTER COLUMN sport DROP NOT NULL');
    await query(`
      CREATE TABLE IF NOT EXISTS tipsters (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        platform VARCHAR(100),
        notes TEXT,
        color VARCHAR(50) DEFAULT '#3b82f6',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, name)
      )
    `);
    await query('ALTER TABLE bets ADD COLUMN IF NOT EXISTS tipster_id UUID REFERENCES tipsters(id) ON DELETE SET NULL');
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
    `);
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
    console.warn('⚠️ Could not verify database tables on startup (using fallback mode):', err.message || err);
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
