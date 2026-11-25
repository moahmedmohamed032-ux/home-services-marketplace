const ApiError = require('../core/ApiError');

// Small validation helpers used by the routes before touching the store.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === '');
  if (missing.length) {
    throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}`);
  }
}

function assertEmail(email) {
  if (!EMAIL_RE.test(String(email))) throw ApiError.badRequest('Invalid email address');
}

function assertPassword(password) {
  if (String(password).length < 8) throw ApiError.badRequest('Password must be at least 8 characters');
}

function assertRole(role) {
  if (!['client', 'technician'].includes(role)) {
    throw ApiError.badRequest("Role must be 'client' or 'technician'");
  }
}

function assertRating(rating) {
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw ApiError.badRequest('Rating must be an integer from 1 to 5');
}

module.exports = { requireFields, assertEmail, assertPassword, assertRole, assertRating };
