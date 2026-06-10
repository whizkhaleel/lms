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
  max:             20,   // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,

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

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  }
  release();
  console.log(`[DB] Connected to PostgreSQL — ${env.POSTGRES_DB}`);
});

/**
 * Convenience wrapper for single queries.
 * Usage: const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
 */
module.exports = {
  query: (text, params) => pool.query(text, params),
  end:   ()            => pool.end(),
  pool,

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
