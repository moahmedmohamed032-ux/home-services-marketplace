const crypto = require('crypto');

// Verifies a Google Sign-In ID token (RS256 JWT) against Google's published keys.
// No client secret is needed: the token is checked for signature, issuer,
// audience (our client ID), expiry and a verified email.
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let cache = { keys: null, at: 0 };

async function fetchJwks() {
  if (cache.keys && Date.now() - cache.at < 3600e3) return cache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error('google keys unavailable');
  cache = { keys: (await r.json()).keys || [], at: Date.now() };
  return cache.keys;
}

const b64 = (s) => Buffer.from(s, 'base64url');

async function verifyGoogleIdToken(token, clientId, getKeys = fetchJwks) {
  const bad = (m) => Object.assign(new Error(m), { status: 401 });
  if (!clientId) throw bad('Google sign-in is not configured');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw bad('Invalid Google token');
  let header; let payload;
  try { header = JSON.parse(b64(parts[0]).toString()); payload = JSON.parse(b64(parts[1]).toString()); } catch { throw bad('Invalid Google token'); }
  if (header.alg !== 'RS256') throw bad('Invalid Google token');
  const jwk = (await getKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw bad('Invalid Google token');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), b64(parts[2]));
  if (!ok) throw bad('Invalid Google token');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw bad('Invalid Google token');
  if (payload.aud !== clientId) throw bad('Invalid Google token');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw bad('Google token expired');
  if (!payload.email || payload.email_verified !== true) throw bad('Google email is not verified');
  return { sub: payload.sub, email: String(payload.email).toLowerCase(), name: payload.name || String(payload.email).split('@')[0] };
}

module.exports = { verifyGoogleIdToken };
