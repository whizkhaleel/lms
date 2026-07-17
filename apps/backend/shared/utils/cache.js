'use strict';

const crypto = require('crypto');
const redis  = require('../../config/redis');

const DEFAULT_TTL = 300; // 5 minutes

function buildKey(key) {
  if (typeof key === 'string') return key;
  return crypto.createHash('md5').update(JSON.stringify(key)).digest('hex');
}

async function get(key) {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

async function set(key, value, ttl = DEFAULT_TTL) {
  await redis.setEx(key, ttl, JSON.stringify(value));
}

async function del(key) {
  await redis.del(key);
}

async function delPattern(pattern) {
  let cursor = 0;
  do {
    const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
    cursor = Number(result.cursor);
    if (result.keys && result.keys.length > 0) {
      await redis.del(result.keys);
    }
  } while (cursor !== 0);
}

async function getOrSet(key, fetchFn, ttl = DEFAULT_TTL) {
  const cacheKey = buildKey(key);
  const cached = await get(cacheKey);
  if (cached !== null) return cached;
  const fresh = await fetchFn();
  await set(cacheKey, fresh, ttl);
  return fresh;
}

async function invalidate(key) {
  await del(buildKey(key));
}

async function invalidatePattern(pattern) {
  await delPattern(pattern);
}

module.exports = { get, set, del, delPattern, getOrSet, invalidate, invalidatePattern, DEFAULT_TTL, buildKey };
