import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Lazily initializes and returns the PostgreSQL Connection Pool.
 * If DATABASE_URL is not set, it logs a warning instead of crashing.
 */
export function getDbPool(): pg.Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn('⚠️  DATABASE_URL environment variable is missing.');
    console.warn('Backend database integration is inactive. Please configure DATABASE_URL in Settings.');
    
    // We create a dummy pool that will throw an informative error only when queried
    pool = new Pool();
    const originalQuery = pool.query;
    pool.query = function (...args: any[]) {
      throw new Error(
        'DATABASE_URL environment variable is not configured. Please set up your PostgreSQL connection string in Settings > Secrets.'
      );
    };
    return pool;
  }

  try {
    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false, // Required for secure connections to Aiven, Supabase, Neon, etc.
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle database client:', err);
    });

    console.log('✅ PostgreSQL Connection Pool initialized successfully.');
    return pool;
  } catch (error) {
    console.error('Failed to initialize PostgreSQL Pool:', error);
    throw error;
  }
}

/**
 * Execute a query helper
 */
export async function query(text: string, params?: any[]) {
  const activePool = getDbPool();
  return activePool.query(text, params);
}
