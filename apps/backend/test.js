'use strict';

const assert = require('assert');

const port = process.env.BACKEND_PORT || 5000;
const url = `http://127.0.0.1:${port}/api/health`;

async function main() {
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    console.error(`[test] GET ${url} failed with ${res.status}`);
    console.error(text);
    process.exit(1);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    console.error('[test] Health response was not valid JSON');
    console.error(text);
    throw err;
  }

  assert.strictEqual(body.status, 'ok', 'health status should be ok');
  assert.strictEqual(body.services.database, 'up', 'database should be up');
  assert.strictEqual(body.services.redis, 'up', 'redis should be up');

  console.log('[test] backend health check passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
