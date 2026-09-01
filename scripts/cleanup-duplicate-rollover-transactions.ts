import 'dotenv/config';
import pg from 'pg';
import { TRANSACTION_TYPES } from '../src/types';

const { Pool } = pg;

interface DuplicateTransactionRow {
  initial_tx_id: string;
  user_id: string;
  bankroll_id: string;
  amount: string | number;
  initial_tx_date: string;
  initial_tx_created_at: string;
  initial_tx_desc: string;
  rollover_tx_id: string;
  rollover_tx_type: string;
  rollover_tx_date: string;
  rollover_tx_created_at: string;
  rollover_tx_desc: string;
  bankroll_name?: string;
  bankroll_currency?: string;
}

async function runCleanup() {
  const isConfirm = process.argv.includes('--confirm');
  const connectionString = process.env.DATABASE_URL;

  console.log('='.repeat(80));
  console.log('Bankroll Transactions Cleanup: Redundant Initial Balance Entries');
  console.log(`Mode: ${isConfirm ? 'EXECUTE (--confirm supplied)' : 'DRY RUN (preview only)'}`);
  console.log('='.repeat(80));

  if (!connectionString) {
    console.log('⚠️ No DATABASE_URL environment variable found. Checking if database is reachable...');
  }

  const pool = new Pool({
    connectionString: connectionString || undefined,
    ssl: connectionString ? { rejectUnauthorized: false } : undefined,
  });

  try {
    // Query for pairs of transactions on the same bankroll where both Initial Balance
    // and Opening Balance (Carried Over) exist for the same rollover event/amount,
    // created within 10 seconds of each other.
    const findDuplicatesQuery = `
      SELECT 
        init_tx.id AS initial_tx_id,
        init_tx.user_id,
        init_tx.bankroll_id,
        init_tx.amount,
        init_tx.date AS initial_tx_date,
        init_tx.created_at AS initial_tx_created_at,
        init_tx.description AS initial_tx_desc,
        rollover_tx.id AS rollover_tx_id,
        rollover_tx.type AS rollover_tx_type,
        rollover_tx.date AS rollover_tx_date,
        rollover_tx.created_at AS rollover_tx_created_at,
        rollover_tx.description AS rollover_tx_desc,
        b.name AS bankroll_name,
        b.currency AS bankroll_currency
      FROM bankroll_transactions init_tx
      JOIN bankroll_transactions rollover_tx 
        ON init_tx.bankroll_id = rollover_tx.bankroll_id
        AND init_tx.user_id = rollover_tx.user_id
        AND ABS(CAST(init_tx.amount AS NUMERIC) - CAST(rollover_tx.amount AS NUMERIC)) < 0.001
      LEFT JOIN bankrolls b ON b.id = init_tx.bankroll_id
      WHERE init_tx.type = $1
        AND (rollover_tx.type = $2 OR rollover_tx.type = 'Rollover In')
        AND init_tx.id != rollover_tx.id
        AND init_tx.created_at >= rollover_tx.created_at - INTERVAL '10 seconds'
        AND init_tx.created_at <= rollover_tx.created_at + INTERVAL '10 seconds'
      ORDER BY init_tx.created_at DESC;
    `;

    const res = await pool.query(findDuplicatesQuery, [
      TRANSACTION_TYPES.INITIAL_BALANCE,
      TRANSACTION_TYPES.OPENING_BALANCE_CARRIED_OVER,
    ]);

    const duplicates: DuplicateTransactionRow[] = res.rows;

    if (duplicates.length === 0) {
      console.log('✅ No redundant "Initial Balance" transactions found. All bankrolls are clean!');
      return;
    }

    console.log(`🔍 Found ${duplicates.length} redundant "Initial Balance" transaction(s) matching rollover events within 10 seconds:\n`);

    const idsToDelete: string[] = [];

    duplicates.forEach((row, idx) => {
      if (!idsToDelete.includes(row.initial_tx_id)) {
        idsToDelete.push(row.initial_tx_id);
      }

      console.log(`[${idx + 1}] Redundant Initial Balance Transaction:`);
      console.log(`    - ID to delete      : ${row.initial_tx_id}`);
      console.log(`    - Bankroll          : ${row.bankroll_name || 'N/A'} (ID: ${row.bankroll_id})`);
      console.log(`    - Amount            : ${row.amount} ${row.bankroll_currency || ''}`);
      console.log(`    - Initial Tx Date   : ${row.initial_tx_date} (Created: ${row.initial_tx_created_at})`);
      console.log(`    - Initial Tx Desc   : ${row.initial_tx_desc}`);
      console.log(`    - Matching Rollover : ID ${row.rollover_tx_id} [${row.rollover_tx_type}]`);
      console.log(`    - Rollover Tx Date  : ${row.rollover_tx_date} (Created: ${row.rollover_tx_created_at})`);
      console.log(`    - Rollover Tx Desc  : ${row.rollover_tx_desc}`);
      console.log('-'.repeat(80));
    });

    if (!isConfirm) {
      console.log('\n🔒 [DRY RUN COMPLETE]');
      console.log(`Identified ${idsToDelete.length} unique transaction(s) that would be removed.`);
      console.log('No modifications were made to the database.');
      console.log('To permanently delete these redundant transactions, re-run with --confirm:');
      console.log('  npx tsx scripts/cleanup-duplicate-rollover-transactions.ts --confirm\n');
    } else {
      console.log(`\n🚀 Executing deletion of ${idsToDelete.length} redundant transaction(s)...`);
      const deleteQuery = `DELETE FROM bankroll_transactions WHERE id = ANY($1::uuid[])`;
      const deleteResult = await pool.query(deleteQuery, [idsToDelete]);
      console.log(`✅ Successfully deleted ${deleteResult.rowCount} redundant "Initial Balance" transaction(s).`);
      console.log('Bankroll transaction history is now synchronized and clean!\n');
    }
  } catch (err: any) {
    console.error('❌ Error during cleanup script execution:', err.message || err);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

runCleanup();
