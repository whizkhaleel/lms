'use strict';

const { createClient } = require('redis');
const env              = require('./env');

const client = createClient({
  socket: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  },
  password: env.REDIS_PASSWORD,
});

client.on('connect', () => {
  console.log('[Redis] Connected');
});

client.on('error', (err) => {
  console.error('[Redis] Error:', err);
});

client.on('reconnecting', () => {
  console.warn('[Redis] Reconnecting...');
});

// Connect immediately
client.connect().catch((err) => {
  console.error('[Redis] Failed to connect:', err);
  process.exit(1);
});

module.exports = client;
