// Naive fixed-window rate limiter for auth endpoints (per IP).
// In-memory is fine for a single instance / serverless warm container.
const buckets = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 50;

function rateLimiter(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start > WINDOW_MS) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({ error: { message: 'Too many requests, try again later' } });
  }
  next();
}

module.exports = rateLimiter;
