// Fixed-window rate limiter for auth and public POST endpoints, per client IP.
// Counters live in Redis (shared by every serverless instance). If Redis is down the
// limiter falls back to a per-instance in-memory counter, so a Redis outage never
// blocks users and never leaves the endpoints unprotected.
const redis = require('../core/redis');
const clientIp = require('../utils/clientIp');

const WINDOW_S = 15 * 60;
const MAX_REQUESTS = 50;

const buckets = new Map();
function localCount(key) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > WINDOW_S * 1000) { b = { start: now, count: 0 }; buckets.set(key, b); }
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start > WINDOW_S * 1000) buckets.delete(k);
  b.count += 1;
  return b.count;
}

async function count(key) {
  try {
    const [n] = await redis.pipeline([['INCR', key], ['EXPIRE', key, WINDOW_S, 'NX']]);
    return Number(n);
  } catch {
    return localCount(key);
  }
}

async function rateLimiter(req, res, next) {
  const n = await count(`rl:${clientIp(req)}`);
  if (n > MAX_REQUESTS) {
    return res.status(429).json({ error: { message: 'Too many requests, try again later' } });
  }
  next();
}

module.exports = rateLimiter;
module.exports.count = count;
