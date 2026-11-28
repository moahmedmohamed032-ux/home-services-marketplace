// Short-TTL response cache in Redis for hot public reads. One hash per namespace, so a write
// invalidates the whole namespace with a single DEL. Best effort: any Redis error means "no cache".
const redis = require('./redis');

const MAX_AGE_S = 60; // hard upper bound for staleness even if an invalidation is missed

async function get(ns, field) {
  try {
    const raw = await redis.cmd('HGET', `cache:${ns}`, field);
    if (!raw) return null;
    const e = JSON.parse(raw);
    // Reject entries that are expired or claim a lifetime longer than the hard bound (a stale or foreign entry must not outlive MAX_AGE_S).
    return e && e.e > Date.now() && e.e - Date.now() <= MAX_AGE_S * 1000 + 1000 ? e.v : null;
  } catch { return null; }
}

async function set(ns, field, value, ttlS = MAX_AGE_S) {
  try {
    await redis.pipeline([
      ['HSET', `cache:${ns}`, field, JSON.stringify({ e: Date.now() + ttlS * 1000, v: value })],
      ['EXPIRE', `cache:${ns}`, MAX_AGE_S * 2, 'NX'],
    ]);
  } catch { /* ignore */ }
}

async function invalidate(ns) {
  try { await redis.cmd('DEL', `cache:${ns}`); } catch { /* ignore */ }
}

// Cache a JSON-producing function. Returns the value.
async function wrap(ns, field, fn, ttlS) {
  const hit = await get(ns, field);
  if (hit !== null) return hit;
  const v = await fn();
  await set(ns, field, v, ttlS);
  return v;
}

module.exports = { get, set, invalidate, wrap };
