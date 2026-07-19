'use strict';

const { createClient } = require('redis');
const env              = require('./env');

const client = createClient(
  process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : {
        socket: {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          connectTimeout: 10000,
        },
        password: env.REDIS_PASSWORD,
      }
);

client.on('connect', () => {
  console.log('[Redis] Connected');
});

client.on('error', (err) => {
  console.error('[Redis] Error:', err);
});

client.on('reconnecting', () => {
  console.warn('[Redis] Reconnecting...');
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

client.connectWithRetry = async function connectWithRetry({ retries = 10, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!client.isOpen) {
        await client.connect();
      }
      await client.ping();
      console.log('[Redis] Ready');
      return;
    } catch (err) {
      console.error(`[Redis] Connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) {
        throw err;
      }
      await wait(delayMs);
    }
  }
};

module.exports = client;
