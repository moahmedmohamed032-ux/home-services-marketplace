// Real client IP behind Vercel's proxy. req.ip alone would be the proxy for everyone.
module.exports = function clientIp(req) {
  const h = req.headers || {};
  const v = h['x-vercel-forwarded-for'] || h['x-forwarded-for'] || '';
  return String(v).split(',')[0].trim() || req.ip || 'unknown';
};
