const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { verifyGoogleIdToken } = require('../server/utils/google');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' };
const keys = async () => [jwk];
const mk = (over = {}, key = privateKey) => {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'cid', exp: Math.floor(Date.now() / 1000) + 600, email: 'A@B.com', email_verified: true, name: 'A', sub: '1', ...over })).toString('base64url');
  return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key).toString('base64url')}`;
};

test('google id token verification', async () => {
  assert.deepEqual(await verifyGoogleIdToken(mk(), 'cid', keys), { sub: '1', email: 'a@b.com', name: 'A' });
  await assert.rejects(() => verifyGoogleIdToken(mk({ aud: 'other' }), 'cid', keys));
  await assert.rejects(() => verifyGoogleIdToken(mk({ exp: 1 }), 'cid', keys));
  await assert.rejects(() => verifyGoogleIdToken(mk({ email_verified: false }), 'cid', keys));
  await assert.rejects(() => verifyGoogleIdToken(mk({ iss: 'evil' }), 'cid', keys));
  await assert.rejects(() => verifyGoogleIdToken(mk({}, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), 'cid', keys));
  await assert.rejects(() => verifyGoogleIdToken(mk(), '', keys));
});
