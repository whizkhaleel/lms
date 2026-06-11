'use strict';

/**
 * Manual migration runner.
 * Runs all .sql files in /database/migrations in filename order.
 * Safe to re-run: uses a migrations tracking table.
 *
 * Usage:
 *   node database/migrate.js            -> run pending migrations
 *   node database/migrate.js --seed     -> also run seed files after migrations
 *   node database/migrate.js --reset    -> DROP all tables then re-run (dev only)
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT_DIR = path.join(__dirname, '..');
const BACKEND_NODE_MODULES = path.join(ROOT_DIR, 'apps', 'backend', 'node_modules');

if (!module.paths.includes(BACKEND_NODE_MODULES)) {
  module.paths.push(BACKEND_NODE_MODULES);
  process.env.NODE_PATH = process.env.NODE_PATH
    ? `${process.env.NODE_PATH}${path.delimiter}${BACKEND_NODE_MODULES}`
    : BACKEND_NODE_MODULES;
  Module._initPaths();
}

require('dotenv').config({ path: path.join(ROOT_DIR, '.env') });

const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEEDS_DIR = path.join(__dirname, 'seeds');

const args = process.argv.slice(2);
const SEED = args.includes('--seed');
const RESET = args.includes('--reset');

function env(name, fallbackName, defaultValue) {
  return process.env[name] || process.env[fallbackName] || defaultValue;
}

async function getClient() {
  const client = new Client({
    host: env('DB_HOST', 'POSTGRES_HOST', 'localhost'),
    port: parseInt(env('DB_PORT', 'POSTGRES_PORT', '5432'), 10),
    database: env('DB_NAME', 'POSTGRES_DB', 'lms_db'),
    user: env('DB_USER', 'POSTGRES_USER', 'lms_user'),
    password: env('DB_PASSWORD', 'POSTGRES_PASSWORD'),
  });

  await client.connect();
  return client;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(client) {
  const { rows } = await client.query('SELECT filename FROM _migrations ORDER BY id');
  return new Set(rows.map((row) => row.filename));
}

function getSqlFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

async function runFile(client, filePath, filename) {
  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`  -> Running: ${filename}`);
  await client.query(sql);
}

async function reset(client) {
  console.log('\nRESET mode: dropping all tables...');
  await client.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO PUBLIC;
  `);
  console.log('   Schema wiped.');
}

async function runMigrations(client) {
  const applied = await getApplied(client);
  const files = getSqlFiles(MIGRATIONS_DIR);

  let count = 0;
  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`  OK Already applied: ${filename}`);
      continue;
    }

    await runFile(client, path.join(MIGRATIONS_DIR, filename), filename);
    await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
    count++;
  }

  if (count === 0) {
    console.log('  OK All migrations already applied. Nothing to do.');
  } else {
    console.log(`\n  OK Applied ${count} migration(s).`);
  }
}

async function runSeeds(client) {
  console.log('\nRunning seeds...');
  const files = getSqlFiles(SEEDS_DIR);

  for (const filename of files) {
    await runFile(client, path.join(SEEDS_DIR, filename), filename);
  }

  console.log('  OK Seeds complete.');
}

async function main() {
  let client;

  try {
    console.log('\nLMS Migration Runner');
    console.log('--------------------');

    client = await getClient();
    console.log(`Connected to: ${env('DB_NAME', 'POSTGRES_DB', 'lms_db')}@${env('DB_HOST', 'POSTGRES_HOST', 'localhost')}\n`);

    if (RESET) {
      if (process.env.NODE_ENV === 'production') {
        console.error('RESET is not allowed in production.');
        process.exit(1);
      }
      await reset(client);
    }

    await ensureMigrationsTable(client);

    console.log('Migrations:');
    await runMigrations(client);

    if (SEED) {
      await runSeeds(client);
    }

    console.log('\nDone.\n');
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

main();
