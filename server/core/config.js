// Central configuration. Environment-driven. Production refuses to start without a real JWT secret.
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (s) {
    if (isProduction && s.length < 32) throw new Error('JWT_SECRET is too short: use at least 32 random characters');
    return s;
  }
  if (isProduction) throw new Error('JWT_SECRET is not set: refusing to start in production with a default secret');
  return 'fanni-dev-secret-change-me'; // local dev and tests only
}

module.exports = {
  port: process.env.PORT || 3001,
  jwtSecret: jwtSecret(),
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 30 * 24 * 3600),
  bcryptRounds: 10,
  isProduction,
};
