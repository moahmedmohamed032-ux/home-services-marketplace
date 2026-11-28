// Sessions, revocation, rate limiting and caching (uses the in-process Redis fallback).
const { test, before, after } = require('node:test');
const assert = require('node:assert');

let server; let base;
before(async () => {
  const app = require('../server/app');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const call = (method, path, body, token, headers = {}) => fetch(base + path, {
  method,
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined,
});

async function signup() {
  const email = `sess_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.dev`;
  const r = await call('POST', '/auth/register', { name: 'Sess User', email, password: 'Passw0rd!', role: 'client', city: 'Luxor' }, null, { 'x-forwarded-for': `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  assert.equal(r.status, 201);
  return { email, ...(await r.json()) };
}

test('login returns a short-lived access token and a refresh token', async () => {
  const s = await signup();
  assert.ok(s.token && s.refreshToken);
  const claims = JSON.parse(Buffer.from(s.token.split('.')[1], 'base64url').toString());
  assert.ok(claims.jti, 'access token has a jti');
  assert.ok(claims.exp - claims.iat <= 15 * 60, 'access token lives 15 minutes or less');
});

test('refresh rotates the pair and the new access token works', async () => {
  const s = await signup();
  const r = await call('POST', '/auth/refresh', { refreshToken: s.refreshToken });
  assert.equal(r.status, 200);
  const n = await r.json();
  assert.ok(n.token && n.refreshToken && n.refreshToken !== s.refreshToken);
  assert.equal((await call('GET', '/auth/me', null, n.token)).status, 200);
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: 'nope' })).status, 401);
  assert.equal((await call('POST', '/auth/refresh', {})).status, 401);
});

test('logout kills the access token immediately and the refresh token', async () => {
  const s = await signup();
  assert.equal((await call('GET', '/auth/me', null, s.token)).status, 200);
  assert.equal((await call('POST', '/auth/logout', { refreshToken: s.refreshToken }, s.token)).status, 200);
  assert.equal((await call('GET', '/auth/me', null, s.token)).status, 401, 'revoked access token is refused');
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken })).status, 401, 'refresh token is gone');
});

test('changing the password ends every other session', async () => {
  const s = await signup();
  const second = await (await call('POST', '/auth/login', { identifier: s.email, password: 'Passw0rd!' })).json();
  await new Promise((r) => setTimeout(r, 1100)); // token iat is in whole seconds
  const ch = await call('POST', '/auth/change-password', { currentPassword: 'Passw0rd!', newPassword: 'N3wPassw0rd!' }, s.token);
  assert.equal(ch.status, 200);
  const fresh = await ch.json();
  assert.ok(fresh.token, 'this device gets a fresh session');
  assert.equal((await call('GET', '/auth/me', null, second.token)).status, 401, 'other device is signed out');
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: second.refreshToken })).status, 401);
  assert.equal((await call('GET', '/auth/me', null, fresh.token)).status, 200);
});

test('a tampered or unsigned token is rejected', async () => {
  const s = await signup();
  const [h, p, sig] = s.token.split('.');
  assert.equal((await call('GET', '/auth/me', null, `${h}.${p}.${sig.slice(0, -2)}xx`)).status, 401);
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  assert.equal((await call('GET', '/auth/me', null, `${none}.${p}.`)).status, 401);
});

test('rate limit: 50 requests per IP, then 429, other IPs unaffected', async () => {
  const ip = '203.0.113.77';
  let last;
  for (let i = 0; i < 51; i += 1) last = await call('POST', '/auth/login', { identifier: 'nobody@test.dev', password: 'x' }, null, { 'x-forwarded-for': ip });
  assert.equal(last.status, 429);
  const other = await call('POST', '/auth/login', { identifier: 'nobody@test.dev', password: 'x' }, null, { 'x-forwarded-for': '203.0.113.78' });
  assert.equal(other.status, 401);
});

test('technician list is cached and a technician write invalidates it', async () => {
  const redis = require('../server/core/redis');
  const store = require('../server/core/store');
  const a = await (await call('GET', '/technicians?city=Luxor')).json();
  assert.ok(await redis.cmd('HGET', 'cache:tech', JSON.stringify(['', 'Luxor', '', ''])), 'entry stored');
  const t = a.technicians[0];
  const db = await store.getDb();
  await db.technicians.update(t.id, { bio: 'cache-bust-check' });
  assert.equal(await redis.cmd('HGET', 'cache:tech', JSON.stringify(['', 'Luxor', '', ''])), null, 'write dropped the cache');
  const b = await (await call('GET', '/technicians?city=Luxor')).json();
  assert.equal(b.technicians.find((x) => x.id === t.id).bio, 'cache-bust-check');
});

test('production refuses to start without a strong JWT_SECRET', () => {
  const { spawnSync } = require('node:child_process');
  const run = (env) => spawnSync(process.execPath, ['-e', "require('./server/core/config')"], { cwd: require('path').join(__dirname, '..'), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  assert.notEqual(run({ NODE_ENV: 'production' }).status, 0);
  assert.notEqual(run({ NODE_ENV: 'production', JWT_SECRET: 'short' }).status, 0);
  assert.equal(run({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }).status, 0);
  assert.equal(run({}).status, 0, 'dev still works');
});
