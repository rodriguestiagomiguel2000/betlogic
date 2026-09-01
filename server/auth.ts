import express, { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, getDbPool } from './db';
import { authenticateToken, AuthenticatedRequest } from './middleware';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'betlogic_super_secret_session_token_key';

/**
 * POST /api/auth/register
 * Register a new user and seed their default bankroll.
 */
router.post('/register', async (req: any, res: any) => {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    const { name, email, password, currency } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    // Check if user already exists
    const checkUser = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (checkUser.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    await client.query('BEGIN');

    // Insert user
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, currency) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, name, email, currency`,
      [name, email.toLowerCase(), passwordHash, currency || 'EUR']
    );

    const user = userResult.rows[0];

    // Auto-seed a default Primary Bankroll for the user
    const defaultBankroll = await client.query(
      `INSERT INTO bankrolls (user_id, name, currency, initial_balance, current_balance, color, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [user.id, 'Primary Bankroll', user.currency, 1000.00, 1000.00, '#2563eb', 'Default bankroll for tracking bets.']
    );

    const bankrollId = defaultBankroll.rows[0].id;

    // Set as active bankroll for the user
    await client.query('UPDATE users SET active_bankroll_id = $1 WHERE id = $2', [bankrollId, user.id]);

    // Seed default bookmakers
    const defaultBookmakers = ['Bet365', 'DraftKings', 'FanDuel', 'Pinnacle', 'Bwin'];
    for (const bookmakerName of defaultBookmakers) {
      await client.query(
        `INSERT INTO bookmakers (user_id, name, real_balance, free_bet_balance, average_margin, color)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, name) DO NOTHING`,
        [user.id, bookmakerName, 0.00, 0.00, 5.00, '#10b981']
      );
    }

    await client.query('COMMIT');

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        currency: user.currency,
        activeBankrollId: bankrollId,
      },
    });
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      // Ignore rollback error if transaction didn't start
    }
    console.error('Error during registration:', err);
    return res.status(500).json({ error: 'Registration failed due to a server error.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/auth/login
 * Log in an existing user.
 */
router.post('/login', async (req: any, res: any) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const userResult = await query(
      'SELECT id, name, email, password_hash, currency, active_bankroll_id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = userResult.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        currency: user.currency,
        activeBankrollId: user.active_bankroll_id,
      },
    });
  } catch (err: any) {
    console.error('Error during login:', err);
    return res.status(500).json({ error: 'Login failed due to a server error.' });
  }
});

/**
 * POST /api/auth/demo
 * One-click demo login for fast exploration and preview.
 */
router.post('/demo', async (req: any, res: any) => {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    const demoEmail = 'demo@betlogic.pro';
    let userResult = await client.query(
      'SELECT id, name, email, currency, active_bankroll_id FROM users WHERE email = $1',
      [demoEmail]
    );

    let user;

    if (userResult.rows.length === 0) {
      const passwordHash = await bcrypt.hash('betlogic_demo_pass', 10);

      await client.query('BEGIN');
      const newUserRes = await client.query(
        `INSERT INTO users (name, email, password_hash, currency) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, name, email, currency`,
        ['Demo User', demoEmail, passwordHash, 'EUR']
      );
      user = newUserRes.rows[0];

      // Seed bankroll
      const defaultBankroll = await client.query(
        `INSERT INTO bankrolls (user_id, name, currency, initial_balance, current_balance, color, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [user.id, 'Primary Bankroll', 'EUR', 1000.00, 1000.00, '#2563eb', 'Default primary bankroll.']
      );
      const bankrollId = defaultBankroll.rows[0].id;
      user.active_bankroll_id = bankrollId;

      await client.query('UPDATE users SET active_bankroll_id = $1 WHERE id = $2', [bankrollId, user.id]);

      // Seed bookmakers
      const defaultBookmakers = [
        { name: 'Bet365', color: '#10b981' },
        { name: 'Pinnacle', color: '#f59e0b' },
        { name: 'DraftKings', color: '#3b82f6' }
      ];

      for (const bm of defaultBookmakers) {
        const bmRes = await client.query(
          `INSERT INTO bookmakers (user_id, name, real_balance, free_bet_balance, average_margin, color)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [user.id, bm.name, 300.00, 0.00, 4.50, bm.color]
        );
        const bmId = bmRes.rows[0].id;
        await client.query(
          `INSERT INTO bankroll_bookmaker_balances (bankroll_id, bookmaker_id, cash_balance, free_bet_balance)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [bankrollId, bmId, 300.00, 0.00]
        );
      }

      await client.query('COMMIT');
    } else {
      user = userResult.rows[0];
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        currency: user.currency || 'EUR',
        activeBankrollId: user.active_bankroll_id,
      },
    });
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('Error during demo login:', err);
    return res.status(500).json({ error: 'Demo login failed due to a server error.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/auth/me
 * Fetch authenticated user information and preference settings.
 */
router.get('/me', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userResult = await query(
      'SELECT id, name, email, currency, odds_format, two_factor_enabled, active_bankroll_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User profile not found. Please log in again.' });
    }

    const user = userResult.rows[0];
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      currency: user.currency,
      oddsFormat: user.odds_format,
      twoFactorEnabled: user.two_factor_enabled,
      activeBankrollId: user.active_bankroll_id,
    });
  } catch (err: any) {
    console.error('Error fetching profile:', err);
    return res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});

/**
 * PUT /api/auth/profile
 * Update user preferences and profile settings.
 */
router.put('/profile', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, currency, oddsFormat, activeBankrollId } = req.body;

    const result = await query(
      `UPDATE users SET 
        name = COALESCE($1, name),
        currency = COALESCE($2, currency),
        odds_format = COALESCE($3, odds_format),
        active_bankroll_id = COALESCE($4, active_bankroll_id)
       WHERE id = $5
       RETURNING id, name, email, currency, odds_format as "oddsFormat", two_factor_enabled as "twoFactorEnabled", active_bankroll_id as "activeBankrollId"`,
      [name, currency, oddsFormat, activeBankrollId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Error updating profile:', err);
    return res.status(500).json({ error: 'Failed to update user profile.' });
  }
});

export default router;
