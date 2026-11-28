// Security headers for API responses (static files get the same set from vercel.json).
// No external dependency: the set is small and fixed.
module.exports = function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Permissions-Policy': 'camera=(self), microphone=(), payment=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  res.removeHeader('X-Powered-By');
  next();
};
