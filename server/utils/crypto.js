const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../core/config');

// Password hashing (bcrypt) and JWT helpers in one place, so the rest of
// the app never touches the crypto libraries directly.

async function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret); // throws on invalid/expired
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken };
