// Sessions: short-lived access JWT + opaque refresh token stored in Redis, plus revocation.
//   rt:<sha256(refresh)>  -> user id            (TTL = refresh lifetime)
//   rs:<userId>           -> set of refresh hashes (so "log out everywhere" can delete them)
//   rv:<jti>              -> "1"                (revoked access token, TTL = its remaining life)
//   uv:<userId>           -> unix seconds       (every access token issued before this is dead)
// Revocation checks fail open if Redis is down: access tokens live 15 minutes, so the exposure is bounded.
const crypto = require('crypto');
const redis = require('../core/redis');
const config = require('../core/config');
const { signToken, verifyToken } = require('./crypto');

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const ACCESS_PAD_S = 20 * 60; // keep revocation marks a bit longer than the access token lifetime
const ROTATION_GRACE_S = 30;  // an old refresh token still works briefly, so two open tabs do not log each other out

async function issueSession(user) {
  const token = signToken(user);
  const refreshToken = crypto.randomBytes(40).toString('base64url');
  const h = hash(refreshToken);
  try {
    await redis.pipeline([
      ['SET', `rt:${h}`, user.id, 'EX', config.refreshTtlSeconds],
      ['SADD', `rs:${user.id}`, h],
      ['EXPIRE', `rs:${user.id}`, config.refreshTtlSeconds],
    ]);
    return { token, refreshToken };
  } catch (err) {
    console.error('sessions: refresh token not stored:', err.message);
    return { token }; // user can still use the access token; the client signs in again when it expires
  }
}

// Returns the user id the refresh token belongs to (and retires it), or null.
async function consumeRefresh(refreshToken) {
  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length > 200) return null;
  const h = hash(refreshToken);
  const uid = await redis.cmd('GET', `rt:${h}`); // throws if Redis is down: the route answers 503
  if (!uid) return null;
  await redis.cmd('EXPIRE', `rt:${h}`, ROTATION_GRACE_S).catch(() => {});
  return uid;
}

async function isRevoked(payload) {
  try {
    const [rv, uv] = await redis.cmd('MGET', `rv:${payload.jti}`, `uv:${payload.sub}`);
    if (rv) return true;
    if (uv && Number(payload.iat) < Number(uv)) return true;
    return false;
  } catch {
    return false;
  }
}

// Logout: kill this access token now and delete the refresh token.
async function revokeSession({ accessToken, refreshToken }) {
  const cmds = [];
  if (accessToken) {
    try {
      const p = verifyToken(accessToken);
      const ttl = Math.max(1, Number(p.exp) - Math.floor(Date.now() / 1000)) + 60;
      cmds.push(['SET', `rv:${p.jti}`, '1', 'EX', ttl]);
    } catch { /* already expired or invalid: nothing to revoke */ }
  }
  if (refreshToken && typeof refreshToken === 'string' && refreshToken.length <= 200) cmds.push(['DEL', `rt:${hash(refreshToken)}`]);
  if (!cmds.length) return true;
  try { await redis.pipeline(cmds); return true; } catch (err) { console.error('sessions: revoke failed:', err.message); return false; }
}

// Password change, deactivation: every token and refresh token of this user dies.
async function revokeUser(userId) {
  try {
    const hs = (await redis.cmd('SMEMBERS', `rs:${userId}`)) || [];
    const cmds = [['SET', `uv:${userId}`, String(Math.floor(Date.now() / 1000)), 'EX', ACCESS_PAD_S]];
    for (const h of hs) cmds.push(['DEL', `rt:${h}`]);
    cmds.push(['DEL', `rs:${userId}`]);
    await redis.pipeline(cmds);
    return true;
  } catch (err) { console.error('sessions: revokeUser failed:', err.message); return false; }
}

module.exports = { issueSession, consumeRefresh, isRevoked, revokeSession, revokeUser };
