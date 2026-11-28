// Tiny Upstash Redis client over HTTPS (REST). Works on Vercel serverless, no TCP.
// Without UPSTASH_REDIS_REST_URL/TOKEN (local dev, tests) it falls back to an in-process
// store with the same commands, so the app behaves the same but is not shared across instances.
// Callers treat Redis as best effort: every call can throw, and callers decide how to fail.
const URL_ = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const enabled = !!(URL_ && TOKEN);
const TIMEOUT_MS = Number(process.env.REDIS_TIMEOUT_MS || 1500);

// Circuit breaker: after a failure skip Redis for a few seconds so an outage or an exhausted
// free quota does not add a timeout to every request.
let downUntil = 0;

async function http(path, body) {
  if (Date.now() < downUntil) throw new Error('redis unavailable (circuit open)');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(URL_ + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`redis http ${r.status}${j && j.error ? `: ${String(j.error).slice(0, 80)}` : ''}`);
    return j;
  } catch (err) {
    downUntil = Date.now() + 5000;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---- in-process fallback ----
const mem = new Map(); // key -> { v, exp }
function live(k) {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp && e.exp <= Date.now()) { mem.delete(k); return null; }
  return e;
}
function memRun(args) {
  const [op, k, ...a] = args;
  const o = String(op).toUpperCase();
  if (o === 'GET') { const e = live(k); return e ? e.v : null; }
  if (o === 'MGET') return [k, ...a].map((x) => { const e = live(x); return e ? e.v : null; });
  if (o === 'SET') {
    const exIdx = a.findIndex((x) => String(x).toUpperCase() === 'EX');
    mem.set(k, { v: String(a[0]), exp: exIdx >= 0 ? Date.now() + Number(a[exIdx + 1]) * 1000 : 0 });
    return 'OK';
  }
  if (o === 'DEL') { let n = 0; for (const x of [k, ...a]) if (mem.delete(x)) n += 1; return n; }
  if (o === 'INCR') { const e = live(k); const n = (e ? Number(e.v) : 0) + 1; mem.set(k, { v: String(n), exp: e ? e.exp : 0 }); return n; }
  if (o === 'EXPIRE') {
    const e = live(k); if (!e) return 0;
    if (String(a[1] || '').toUpperCase() === 'NX' && e.exp) return 0;
    e.exp = Date.now() + Number(a[0]) * 1000; return 1;
  }
  if (o === 'HGET') { const e = live(k); return e && e.v[a[0]] !== undefined ? e.v[a[0]] : null; }
  if (o === 'HSET') { const e = live(k) || { v: {}, exp: 0 }; e.v[a[0]] = String(a[1]); mem.set(k, e); return 1; }
  if (o === 'SADD') { const e = live(k) || { v: new Set(), exp: 0 }; e.v.add(String(a[0])); mem.set(k, e); return 1; }
  if (o === 'SREM') { const e = live(k); if (e) e.v.delete(String(a[0])); return 1; }
  if (o === 'SMEMBERS') { const e = live(k); return e ? [...e.v] : []; }
  throw new Error(`unsupported command in memory fallback: ${o}`);
}

async function cmd(...args) {
  if (!enabled) return memRun(args);
  const j = await http('', args);
  if (j && j.error) throw new Error(`redis: ${String(j.error).slice(0, 80)}`);
  return j ? j.result : null;
}

// Several commands in one round trip. Returns the results in order.
async function pipeline(commands) {
  if (!enabled) return commands.map((c) => memRun(c));
  const j = await http('/pipeline', commands);
  if (!Array.isArray(j)) throw new Error('redis: bad pipeline reply');
  return j.map((x) => { if (x && x.error) throw new Error(`redis: ${String(x.error).slice(0, 80)}`); return x.result; });
}

module.exports = { enabled, cmd, pipeline, _mem: mem };
