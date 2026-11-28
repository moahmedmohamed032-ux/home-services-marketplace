// Headers, CORS, image signature check, per-account login throttle.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const imageSigOk = require('../server/utils/imageSig');

let server; let base;
before(async () => {
  const app = require('../server/app');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

test('API responses carry security headers and no X-Powered-By', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.ok(r.headers.get('strict-transport-security'));
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('CORS: our site is allowed, another origin gets no allow header', async () => {
  const ok = await fetch(`${base}/health`, { headers: { origin: 'https://fanni-marketplace.vercel.app' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://fanni-marketplace.vercel.app');
  const bad = await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

test('image check looks at the real bytes, not only the data URL prefix', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).toString('base64');
  assert.ok(imageSigOk(`data:image/png;base64,${png}`));
  assert.ok(imageSigOk(`data:image/jpeg;base64,${jpg}`));
  assert.ok(!imageSigOk(`data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`));
  assert.ok(!imageSigOk(`data:image/jpeg;base64,${png}`));
});

test('login is throttled per account even from different IPs', async () => {
  let last;
  for (let i = 0; i < 14; i++) {
    last = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${i}.1` }, body: JSON.stringify({ identifier: 'nobody-throttle@test.dev', password: 'wrongwrong' }) });
  }
  assert.equal(last.status, 429);
});
