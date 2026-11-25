// Central configuration. Environment-driven with safe local defaults.
module.exports = {
  port: process.env.PORT || 3001,
  jwtSecret: process.env.JWT_SECRET || 'fanni-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: 10,
  isProduction: process.env.NODE_ENV === 'production',
};
