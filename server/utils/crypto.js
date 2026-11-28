const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../core/config');

// Password hashing (bcrypt) and JWT helpers in one place, so the rest of
// the app never touches the crypto libraries directly.

async function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Short-lived access token. The jti lets logout revoke this exact token.
function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: config.accessTtl, jwtid: crypto.randomUUID(), algorithm: 'HS256' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }); // throws on invalid/expired
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken };
