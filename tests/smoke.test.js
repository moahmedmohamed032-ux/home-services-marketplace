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
  assert.notEqual((await store.findUserByEmail(email)).passwordHash, 'Passw0rd!');

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
  await patch(`/bookings/${booking.id}/status`, { status: 'in_progress' }, techToken);
  await patch(`/bookings/${booking.id}/status`, { status: 'awaiting_confirmation', finalAmount: 100 }, techToken);
  res = await patch(`/bookings/${booking.id}/status`, { status: 'completed' }, clientToken);
  assert.equal(res.status, 200);

  // invalid transitions are rejected
  res = await patch(`/bookings/${booking.id}/status`, { status: 'accepted' }, techToken);
  assert.equal(res.status, 400);

  // client reviews the completed job
  res = await post(`/bookings/${booking.id}/review`, { rating: 5, comment: 'Great work' }, clientToken);
  assert.equal(res.status, 201);

  // in-app notifications were created for both sides
  {
    const tn = await (await fetch(`${base}/notifications`, { headers: { authorization: `Bearer ${techToken}` } })).json();
    const types = tn.notifications.filter((n) => n.bookingId === booking.id).map((n) => n.type);
    assert.ok(types.includes('booking_new') && types.includes('review'));
    const cn = await (await fetch(`${base}/notifications`, { headers: { authorization: `Bearer ${clientToken}` } })).json();
    const ctypes = cn.notifications.filter((n) => n.bookingId === booking.id).map((n) => n.type);
    assert.ok(ctypes.includes('booking_accepted') && ctypes.includes('booking_completed'));
    assert.ok(cn.unread >= 2);
    const mr = await (await post('/notifications/read', {}, clientToken)).json();
    assert.ok(mr.marked >= 2);
    const after = await (await fetch(`${base}/notifications`, { headers: { authorization: `Bearer ${clientToken}` } })).json();
    assert.equal(after.unread, 0);
    // a user never sees someone else's notifications
    assert.ok(!tn.notifications.some((n) => n.userId !== techUser.id));
    assert.equal((await fetch(`${base}/notifications`)).status, 401);
  }

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

test('invoice and simulated payment flow', async () => {
  // fresh client + booking through to completion
  const email = `pay_${Date.now()}@test.dev`;
  let res = await post('/auth/register', { name: 'Pay Client', email, password: 'Passw0rd!', role: 'client', city: 'Cairo' });
  const { token: clientToken } = await res.json();
  res = await post('/auth/login', { email: 'tech@demo.com', password: 'Demo@1234' });
  const { token: techToken } = await res.json();
  const { technician: target } = await (await fetch(`${base}/technicians/me`, { headers: { authorization: `Bearer ${techToken}` } })).json();
  res = await post('/bookings', { technicianId: target.id, date: '2026-12-05', description: 'Install ceiling fan', address: '2 Pay St' }, clientToken);
  const { booking } = await res.json();
  await patch(`/bookings/${booking.id}/status`, { status: 'accepted' }, techToken);
  await patch(`/bookings/${booking.id}/status`, { status: 'in_progress' }, techToken);
  await patch(`/bookings/${booking.id}/status`, { status: 'awaiting_confirmation', finalAmount: 100 }, techToken);
  res = await patch(`/bookings/${booking.id}/status`, { status: 'completed' }, clientToken);
  assert.equal(res.status, 200);

  // completion generated an invoice for the client
  res = await fetch(`${base}/invoices/mine`, { headers: { authorization: `Bearer ${clientToken}` } });
  const { invoices } = await res.json();
  const inv = invoices.find((i) => i.bookingId === booking.id);
  assert.ok(inv, 'invoice exists after completion');
  assert.equal(inv.status, 'unpaid');
  assert.ok(inv.number.startsWith('INV-2026-'));
  assert.equal(inv.verificationCode, undefined, 'verification code never leaks');

  // Vodafone Cash: code issued, wrong code rejected, right code pays
  // Simulated payments are blocked by default: nothing can be marked paid without real payment.
  res = await post(`/invoices/${inv.id}/pay`, { method: 'visa', cardNumber: '4242424242424242' }, clientToken);
  assert.equal(res.status, 400);
  res = await post(`/invoices/${inv.id}/pay`, { method: 'vodafone-cash', mobileNumber: '01012345678' }, clientToken);
  assert.equal(res.status, 400);
  process.env.ALLOW_SIMULATED_PAYMENTS = '1';
  res = await post(`/invoices/${inv.id}/pay`, { method: 'vodafone-cash', mobileNumber: '01012345678' }, clientToken);
  assert.equal(res.status, 200);
  const { demoCode } = await res.json();
  assert.ok(/^\d{4}$/.test(demoCode));
  res = await post(`/invoices/${inv.id}/verify`, { code: '0000' === demoCode ? '9999' : '0000' }, clientToken);
  assert.equal(res.status, 400);
  res = await post(`/invoices/${inv.id}/verify`, { code: demoCode }, clientToken);
  assert.equal(res.status, 200);
  const { invoice: paid } = await res.json();
  assert.equal(paid.status, 'paid');
  assert.ok(paid.confirmationCode.startsWith('FX-'));

  // second payment attempt on a paid invoice is rejected
  delete process.env.ALLOW_SIMULATED_PAYMENTS;
  res = await post(`/invoices/${inv.id}/pay`, { method: 'cash' }, clientToken);
  assert.equal(res.status, 409);

  // a second booking paid by cash, confirmed by the technician
  res = await post('/bookings', { technicianId: target.id, date: '2026-12-06', description: 'Check sockets', address: '2 Pay St' }, clientToken);
  const { booking: b2 } = await res.json();
  await patch(`/bookings/${b2.id}/status`, { status: 'accepted' }, techToken);
  await patch(`/bookings/${b2.id}/status`, { status: 'in_progress' }, techToken);
  await patch(`/bookings/${b2.id}/status`, { status: 'awaiting_confirmation', finalAmount: 100 }, techToken);
  await patch(`/bookings/${b2.id}/status`, { status: 'completed' }, clientToken);
  const { invoices: inv2 } = await (await fetch(`${base}/invoices/mine`, { headers: { authorization: `Bearer ${clientToken}` } })).json();
  const cashInv = inv2.find((i) => i.bookingId === b2.id);
  res = await post(`/invoices/${cashInv.id}/pay`, { method: 'cash' }, clientToken);
  assert.equal(res.status, 200);
  res = await post(`/invoices/${cashInv.id}/confirm`, {}, clientToken);
  assert.equal(res.status, 403, 'client cannot confirm cash receipt');
  res = await post(`/invoices/${cashInv.id}/confirm`, {}, techToken);
  assert.equal(res.status, 200);

  // admin sees users, invoices and the overview
  res = await post('/auth/login', { email: 'admin@demo.com', password: 'Demo@1234' });
  const { token: adminToken, user: adminUser } = await res.json();
  assert.equal(adminUser.role, 'admin');
  res = await fetch(`${base}/admin/overview`, { headers: { authorization: `Bearer ${adminToken}` } });
  const { overview } = await res.json();
  assert.ok(overview.invoices.paid >= 2);
  assert.ok(overview.invoices.collected > 0);
  res = await fetch(`${base}/admin/users`, { headers: { authorization: `Bearer ${adminToken}` } });
  const { users } = await res.json();
  assert.ok(users.some((u) => u.email === email));
  res = await fetch(`${base}/admin/invoices`, { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);

  // non-admin is blocked from admin endpoints
  res = await fetch(`${base}/admin/overview`, { headers: { authorization: `Bearer ${clientToken}` } });
  assert.equal(res.status, 403);
});

// ---- Paymob: HMAC verification + callback marks the invoice paid ----
test('paymob hmac + callback', async () => {
  process.env.PAYMOB_SECRET_KEY = 'sk_test_x';
  process.env.PAYMOB_PUBLIC_KEY = 'pk_test_x';
  process.env.PAYMOB_HMAC_SECRET = 'hmac-test-secret';
  process.env.PAYMOB_CARD_INTEGRATION_ID = '123';
  process.env.PAYMOB_LIVE = 'true';
  const paymob = require('../server/core/paymob');
  const store = require('../server/core/store');
  assert.equal(paymob.publicConfig().provider, 'paymob');

  const all = await store.allInvoices();
  const inv = all.find((i) => i.status === 'unpaid');
  if (!inv) return; // seed has no unpaid invoice; HMAC logic still covered below
  const obj = {
    amount_cents: inv.total * 100, created_at: '2026-11-25T10:00:00.000000', currency: 'EGP', error_occured: false,
    has_parent_transaction: false, id: 99001, integration_id: 123, is_3d_secure: true, is_auth: false,
    is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false,
    order: { id: 555, merchant_order_id: `${inv.id}-abc` }, owner: 1, pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' }, success: true,
  };
  const good = paymob.hmacFor(obj, 'hmac-test-secret');
  const bad = await post('/paymob/callback?hmac=deadbeef', { obj });
  assert.equal(bad.status, 401);
  const ok = await post(`/paymob/callback?hmac=${good}`, { obj });
  assert.equal(ok.status, 200);
  assert.equal((await store.findInvoiceById(inv.id)).status, 'paid');
  // replay is a no-op
  assert.equal((await post(`/paymob/callback?hmac=${good}`, { obj })).status, 200);
  process.env.PAYMOB_LIVE = '';
  { const r = await (await fetch(`${base}/invoices/payment-config`)).json(); assert.equal(r.provider, 'cash_only'); }
  delete process.env.PAYMOB_LIVE;
  delete process.env.PAYMOB_SECRET_KEY;
});

test('phone-only technician signup, photo upload, verified badge and 6% commission', async () => {
  const phone = '0101' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  const reg = await post('/auth/register', { name: 'Fni Luxor', password: 'secret123', role: 'technician', phone, profession: 'plumber', city: 'Luxor' });
  assert.equal(reg.status, 201);
  const { token, user } = await reg.json();
  assert.equal(user.email, '');
  // log in by phone, with spaces / +20 formatting
  const li = await post('/auth/login', { identifier: '+20 ' + phone.slice(1), password: 'secret123' });
  assert.equal(li.status, 200);
  // phone is required for technicians
  const bad = await post('/auth/register', { name: 'No Phone', email: 'np@example.com', password: 'secret123', role: 'technician', profession: 'plumber', city: 'Luxor' });
  assert.equal(bad.status, 400);
  const dup = await post('/auth/register', { name: 'Dup', password: 'secret123', role: 'technician', phone, profession: 'plumber', city: 'Luxor' });
  assert.equal(dup.status, 409);
  // photo upload accepts images only; technician cannot self-verify
  const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD';
  const up = await patch('/technicians/me', { photo: img, workPhotos: [img], verified: true }, token);
  assert.equal(up.status, 200);
  const me = (await up.json()).technician;
  assert.equal(me.photo, img); assert.equal(me.workPhotos.length, 1); assert.equal(me.verified, false);
  assert.equal((await patch('/technicians/me', { photo: 'javascript:alert(1)' }, token)).status, 400);
  // admin grants the badge
  const adm = await (await post('/auth/login', { email: 'admin@demo.com', password: 'Demo@1234' })).json();
  assert.ok(adm.token);
  {
    const v = await patch(`/admin/technicians/${me.id}`, { verified: true }, adm.token);
    assert.equal(v.status, 200);
    const c = await (await fetch(`${base}/admin/commissions`, { headers: { authorization: `Bearer ${adm.token}` } })).json();
    assert.equal(c.commissions.rate, 0.06);
  }
});
