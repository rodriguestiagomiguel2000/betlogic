import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

interface CLIArgs {
  from?: string;
  to?: string;
  email?: string;
}

function parseArgs(): CLIArgs {
  const args: CLIArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--from' && i + 1 < argv.length) {
      args.from = argv[++i];
    } else if (arg === '--to' && i + 1 < argv.length) {
      args.to = argv[++i];
    } else if (arg === '--email' && i + 1 < argv.length) {
      args.email = argv[++i];
    }
  }

  return args;
}

async function inspectReconcileTransactions() {
  const { from, to, email } = parseArgs();
  const connectionString = process.env.DATABASE_URL;

  console.log('='.repeat(90));
  console.log('READ-ONLY Inspection Script: Reconcile Bankroll Transactions');
  console.log('='.repeat(90));

  if (from) console.log(`Filter --from : ${from}`);
  if (to) console.log(`Filter --to   : ${to}`);
  if (email) console.log(`Filter --email: ${email}`);

  const pool = new Pool({
    connectionString: connectionString || undefined,
    ssl: connectionString ? { rejectUnauthorized: false } : undefined,
  });

  try {
    let whereClause = `WHERE bt.type = 'Reconcile'`;
    const params: any[] = [];

    if (from) {
      params.push(from);
      whereClause += ` AND bt.date >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      whereClause += ` AND bt.date <= $${params.length}`;
    }

    if (email) {
      params.push(email);
      whereClause += ` AND u.email = $${params.length}`;
    }

    const queryText = `
      SELECT 
        bt.id,
        bt.date,
        bt.created_at,
        bt.amount,
        bt.description,
        b.name AS bankroll_name,
        bm.name AS bookmaker_name,
        u.email AS user_email
      FROM bankroll_transactions bt
      LEFT JOIN bankrolls b ON b.id = bt.bankroll_id
      LEFT JOIN bookmakers bm ON bm.id = bt.bookmaker_id
      LEFT JOIN users u ON u.id = bt.user_id
      ${whereClause}
      ORDER BY bt.date ASC, bt.created_at ASC;
    `;

    const res = await pool.query(queryText, params);
    const transactions = res.rows;

    if (transactions.length === 0) {
      console.log('\n✅ No "Reconcile" transactions found matching the specified criteria.');
      return;
    }

    console.log(`\n🔍 Found ${transactions.length} "Reconcile" transaction(s):\n`);
    console.log('-'.repeat(90));

    let runningSum = 0;

    transactions.forEach((tx, idx) => {
      const amtNum = parseFloat(tx.amount || 0);
      runningSum += amtNum;

      console.log(`[${idx + 1}] Transaction ID : ${tx.id}`);
      console.log(`    - Bankroll       : ${tx.bankroll_name || 'N/A'}`);
      console.log(`    - Bookmaker      : ${tx.bookmaker_name || 'N/A'}`);
      console.log(`    - User Email     : ${tx.user_email || 'N/A'}`);
      console.log(`    - Date           : ${tx.date}`);
      console.log(`    - Created At     : ${tx.created_at}`);
      console.log(`    - Amount         : ${amtNum >= 0 ? '+' : ''}${amtNum.toFixed(2)}`);
      console.log(`    - Description    : ${tx.description}`);
      console.log(`    - Running Sum    : ${runningSum >= 0 ? '+' : ''}${runningSum.toFixed(2)}`);
      console.log('-'.repeat(90));
    });

    console.log(`\n📊 SUMMARY:`);
    console.log(`    - Total Count    : ${transactions.length}`);
    console.log(`    - Total Capital  : ${runningSum >= 0 ? '+' : ''}${runningSum.toFixed(2)}`);
    console.log('='.repeat(90));
  } catch (err: any) {
    console.error('❌ Error during database query:', err.message || err);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

inspectReconcileTransactions();
