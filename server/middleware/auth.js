const { verifyToken } = require('../utils/crypto');
const store = require('../core/store');
const ApiError = require('../core/ApiError');

// Reads "Authorization: Bearer <jwt>", loads the user onto req.user.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(ApiError.unauthorized());
  try {
    const payload = verifyToken(token);
    const user = store.findUserById(payload.sub);
    if (!user) return next(ApiError.unauthorized('Account no longer exists'));
    req.user = user;
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}

// Role guard, to be used after authenticate.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
