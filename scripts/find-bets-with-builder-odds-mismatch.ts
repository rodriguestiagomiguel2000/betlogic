import 'dotenv/config';
import pg from 'pg';
import { calculateEffectiveOddsFromLegs, LegForOddsCalculation } from '../server/bets';

const { Pool } = pg;

interface BetRow {
  id: string;
  user_id: string;
  date: string;
  type: string;
  status: string;
  total_odds: string | number;
  stake: string | number;
  potential_payout: string | number;
  actual_return: string | number;
}

interface BetLegRow {
  id: string;
  bet_id: string;
  sport: string;
  league: string;
  event: string;
  market: string;
  selection: string;
  odds: string | number;
  status: string;
  builder_id: string | null;
  builder_odds: string | number | null;
}

async function runDiagnostic() {
  const connectionString = process.env.DATABASE_URL;

  console.log('='.repeat(88));
  console.log(' BetLogic Diagnostic: Find Bets with Corrupted Bet Builder Total Odds');
  console.log('='.repeat(88));

  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL environment variable is not defined.');
    console.error('Please configure DATABASE_URL in your environment or .env file.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    console.log(' Connected to PostgreSQL database.');
    console.log('Scanning for bets containing Bet Builder legs (builder_id IS NOT NULL)...\n');

    // Find all bets with at least one leg having a non-null, non-empty builder_id
    const betsQuery = `
      SELECT DISTINCT 
        b.id,
        b.user_id,
        b.date,
        b.type,
        b.status,
        b.total_odds,
        b.stake,
        b.potential_payout,
        b.actual_return
      FROM bets b
      JOIN bet_legs bl ON bl.bet_id = b.id
      WHERE bl.builder_id IS NOT NULL AND TRIM(bl.builder_id) != ''
      ORDER BY b.date DESC
    `;

    const betsResult = await client.query(betsQuery);
    const candidateBets: BetRow[] = betsResult.rows;

    console.log(`Found ${candidateBets.length} bet(s) with at least one Bet Builder leg.\n`);

    if (candidateBets.length === 0) {
      console.log(' No bets with Bet Builder legs found. Database is clean.');
      client.release();
      await pool.end();
      return;
    }

    const betIds = candidateBets.map((b) => b.id);
    const legsQuery = `
      SELECT 
        id,
        bet_id,
        sport,
        league,
        event,
        market,
        selection,
        odds,
        status,
        builder_id,
        builder_odds
      FROM bet_legs
      WHERE bet_id = ANY($1)
      ORDER BY bet_id, id
    `;

    const legsResult = await client.query(legsQuery);
    const allLegs: BetLegRow[] = legsResult.rows;

    // Group legs by bet_id
    const legsByBetId = new Map<string, BetLegRow[]>();
    for (const leg of allLegs) {
      const existing = legsByBetId.get(leg.bet_id) || [];
      existing.push(leg);
      legsByBetId.set(leg.bet_id, existing);
    }

    let mismatchCount = 0;
    const mismatches: Array<{
      bet: BetRow;
      legs: BetLegRow[];
      storedOdds: number;
      expectedOdds: number;
      expectedRawOdds: number;
      diff: number;
      storedPayout: number;
      expectedPayout: number;
    }> = [];

    for (const bet of candidateBets) {
      const legs = legsByBetId.get(bet.id) || [];
      const storedOdds = parseFloat(String(bet.total_odds || 0));

      const legsForCalc: LegForOddsCalculation[] = legs.map((l) => ({
        odds: parseFloat(String(l.odds || 1.0)),
        status: l.status,
        builder_id: l.builder_id,
        builder_odds: l.builder_odds !== null && l.builder_odds !== undefined ? parseFloat(String(l.builder_odds)) : null,
      }));

      // Recompute what total_odds SHOULD be using the new grouped helper
      // allowVoidExclusion=true matches the settled effective odds stored by the patch handler
      const expectedOdds = calculateEffectiveOddsFromLegs(legsForCalc, true, bet.type);
      const expectedRawOdds = calculateEffectiveOddsFromLegs(legsForCalc, false, bet.type);

      const diff = Math.abs(storedOdds - expectedOdds);

      if (diff > 0.01) {
        mismatchCount++;
        const stake = parseFloat(String(bet.stake || 0));
        const storedPayout = parseFloat(String(bet.potential_payout || 0));
        const expectedPayout = Number((stake * expectedOdds).toFixed(2));

        mismatches.push({
          bet,
          legs,
          storedOdds,
          expectedOdds,
          expectedRawOdds,
          diff: storedOdds - expectedOdds,
          storedPayout,
          expectedPayout,
        });
      }
    }

    if (mismatchCount === 0) {
      console.log(' All scanned Bet Builder bets have consistent total_odds!');
      console.log(`Scanned ${candidateBets.length} bet(s), 0 mismatches found.`);
    } else {
      console.log(`⚠️ MISMATCH DETECTED: Found ${mismatchCount} corrupted bet(s) out of ${candidateBets.length} scanned:\n`);

      mismatches.forEach((item, index) => {
        const { bet, legs, storedOdds, expectedOdds, expectedRawOdds, diff, storedPayout, expectedPayout } = item;
        const dateStr = bet.date
          ? (typeof bet.date === 'string' ? bet.date.substring(0, 10) : new Date(bet.date).toISOString().substring(0, 10))
          : 'N/A';
        console.log('-'.repeat(88));
        console.log(
          `[#${index + 1}] Bet ID: ${bet.id} | Date: ${dateStr} | Type: ${bet.type} | Status: ${bet.status.toUpperCase()}`
        );
        console.log(`     User ID:          ${bet.user_id}`);
        console.log(`     Stored total_odds: ${storedOdds.toFixed(3)}`);
        console.log(
          `     Expected Odds:    ${expectedOdds.toFixed(3)}${
            expectedRawOdds !== expectedOdds ? ` (raw unadjusted: ${expectedRawOdds.toFixed(3)})` : ''
          }`
        );
        console.log(`     Discrepancy:      ${diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3)} (inflation factor: ${(storedOdds / (expectedOdds || 1)).toFixed(2)}x)`);
        console.log(`     Stake:            ${parseFloat(String(bet.stake)).toFixed(2)}`);
        console.log(`     Stored Payout:    ${storedPayout.toFixed(2)}  -->  Expected Payout: ${expectedPayout.toFixed(2)}`);
        console.log('     Legs breakdown:');

        // Group legs for display
        const builderGroups = new Map<string, BetLegRow[]>();
        const singleLegs: BetLegRow[] = [];
        for (const l of legs) {
          if (l.builder_id && l.builder_id.trim()) {
            const list = builderGroups.get(l.builder_id.trim()) || [];
            list.push(l);
            builderGroups.set(l.builder_id.trim(), list);
          } else {
            singleLegs.push(l);
          }
        }

        builderGroups.forEach((groupLegs, bId) => {
          const groupOdds = groupLegs[0]?.builder_odds || groupLegs[0]?.odds || 1.0;
          console.log(`       * Bet Builder Group [${bId}] (Shared Group Odds: ${parseFloat(String(groupOdds)).toFixed(3)}):`);
          groupLegs.forEach((gl) => {
            console.log(
              `         - [${gl.status.toUpperCase()}] ${gl.event || 'N/A'} | ${gl.market || 'N/A'}: ${gl.selection} (leg.odds: ${parseFloat(String(gl.odds)).toFixed(3)})`
            );
          });
        });

        singleLegs.forEach((sl) => {
          console.log(
            `       * Single Leg: [${sl.status.toUpperCase()}] ${sl.event || 'N/A'} | ${sl.market || 'N/A'}: ${sl.selection} (odds: ${parseFloat(String(sl.odds)).toFixed(3)})`
          );
        });
        console.log('');
      });

      console.log('='.repeat(88));
      console.log(`DIAGNOSTIC SUMMARY: ${mismatchCount} of ${candidateBets.length} bets require correction.`);
      console.log('This is a read-only script. No changes have been made to the database.');
      console.log('='.repeat(88));
    }

    client.release();
    await pool.end();
  } catch (err: any) {
    console.error('❌ Error executing diagnostic scan:', err);
    await pool.end();
    process.exit(1);
  }
}

runDiagnostic();
