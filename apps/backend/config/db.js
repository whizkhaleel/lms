'use strict';

const { Pool } = require('pg');
const env      = require('./env');

const pool = new Pool({
  host:     env.POSTGRES_HOST,
  port:     env.POSTGRES_PORT,
  database: env.POSTGRES_DB,
  user:     env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,

  // Pool config — tuned for production
  min:             2,    // keep 2 idle connections ready
  max:             25,   // max concurrent connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,

  // SSL for production
  ssl: env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : false,
});

// Log connection events
pool.on('connect', () => {
  if (env.NODE_ENV === 'development') {
    console.log('[DB] New client connected to PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
  process.exit(-1);
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkConnection({ retries = 10, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log(`[DB] Connected to PostgreSQL - ${env.POSTGRES_DB}`);
      return;
    } catch (err) {
      console.error(`[DB] Connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) {
        throw err;
      }
      await wait(delayMs);
    }
  }
}

/**
 * Convenience wrapper for single queries.
 * Usage: const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
 */
module.exports = {
  query: (text, params) => pool.query(text, params),
  end:   ()            => pool.end(),
  pool,
  checkConnection,

  /**
   * Transaction helper.
   * Usage:
   *   const result = await db.transaction(async (client) => {
   *     await client.query(...)
   *     await client.query(...)
   *     return something;
   *   });
   */
  transaction: async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
