// End-to-end smoke test against the real Express app on an ephemeral port:
// register -> login -> browse -> book -> accept -> complete -> review.
// Run with: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');

let server;
let base;

before(async () => {
  const app = require('../server/app');
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server.close());

const post = (path, body, token) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const patch = (path, body, token) =>
  fetch(base + path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

test('health check', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'ok');
});

test('geo matching ranks nearest first and reports distance', async () => {
  // Luxor center: the seeded Luxor technicians should come before Cairo ones.
  const res = await fetch(`${base}/technicians?lat=25.6872&lng=32.6396`);
  assert.equal(res.status, 200);
  const { technicians } = await res.json();
  assert.ok(technicians.length > 0);
  assert.ok(technicians[0].distanceKm <= technicians[technicians.length - 1].distanceKm);
  assert.equal(technicians[0].city, 'Luxor');
});

test('full client + technician flow', async () => {
  // register a fresh client
  const email = `client_${Date.now()}@test.dev`;
  let res = await post('/auth/register', { name: 'Test Client', email, password: 'Passw0rd!', role: 'client', city: 'Luxor' });
  assert.equal(res.status, 201);
  const { token: clientToken } = await res.json();

  // passwords are hashed, not stored in plain text
  const store = require('../server/core/store');
  assert.notEqual(store.findUserByEmail(email).passwordHash, 'Passw0rd!');

  // login as the demo technician
  res = await post('/auth/login', { email: 'tech@demo.com', password: 'Demo@1234' });
  assert.equal(res.status, 200);
  const { token: techToken, user: techUser } = await res.json();
  assert.equal(techUser.role, 'technician');

  // browse technicians
  res = await fetch(`${base}/technicians?profession=electrician`);
  assert.equal(res.status, 200);
  const { technicians } = await res.json();
  assert.ok(technicians.length > 0);
  const target = technicians.find((t) => t.userId === techUser.id) || technicians[0];

  // client books the technician
  res = await post('/bookings', { technicianId: target.id, date: '2026-12-01', description: 'Fix the kitchen light', address: '1 Test St' }, clientToken);
  assert.equal(res.status, 201);
  const { booking } = await res.json();
  assert.equal(booking.status, 'pending');

  // technician sees it incoming, accepts, completes
  res = await fetch(`${base}/bookings/incoming`, { headers: { authorization: `Bearer ${techToken}` } });
  const { bookings: incoming } = await res.json();
  assert.ok(incoming.some((b) => b.id === booking.id));

  res = await patch(`/bookings/${booking.id}/status`, { status: 'accepted' }, techToken);
  assert.equal(res.status, 200);
  res = await patch(`/bookings/${booking.id}/status`, { status: 'completed' }, techToken);
  assert.equal(res.status, 200);

  // invalid transitions are rejected
  res = await patch(`/bookings/${booking.id}/status`, { status: 'accepted' }, techToken);
  assert.equal(res.status, 400);

  // client reviews the completed job
  res = await post(`/bookings/${booking.id}/review`, { rating: 5, comment: 'Great work' }, clientToken);
  assert.equal(res.status, 201);

  // a client cannot drive technician-only transitions
  const res2 = await post('/bookings', { technicianId: target.id, date: '2026-12-02', description: 'x', address: 'y' }, clientToken);
  const { booking: b2 } = await res2.json();
  res = await patch(`/bookings/${b2.id}/status`, { status: 'accepted' }, clientToken);
  assert.equal(res.status, 403);

  // unauthenticated access is rejected
  res = await fetch(`${base}/bookings/mine`);
  assert.equal(res.status, 401);
});

test('technician phone is private unless made public', async () => {
  const res = await fetch(`${base}/technicians`);
  const { technicians } = await res.json();
  const hidden = technicians.find((t) => t.phonePublic === false);
  const shown = technicians.find((t) => t.phonePublic === true);
  assert.equal(hidden.phone, null);
  assert.ok(shown.phone);
  const detail = await (await fetch(`${base}/technicians/${hidden.id}`)).json();
  assert.equal(detail.technician.phone, null);
  assert.ok(detail.technician.reviews.length > 0);
});
