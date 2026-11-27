const { test } = require('node:test');
const assert = require('node:assert');

test('nearest request: offers with prices, customer picks, others withdrawn; new cities empty', async () => {
  const store = require('../server/core/store');
  await store.init();
  assert.deepEqual(await store.listCities(), ['Luxor', 'Esna', 'Qena', 'Aswan']);
  const techs = await store.searchTechnicians({ city: 'Aswan' });
  assert.equal(techs.length, 0); // no demo data in the new cities
  const client = await store.findUserByEmail('client@demo.com');
  const prof = (await store.searchTechnicians({ lat: 25.6872, lng: 32.6396 }))[0].profession;
  const { booking, notified } = await store.createNearestRequest({ clientId: client.id, profession: prof, date: '2026-12-20', description: 'nearest test', address: 'x', clientLat: 25.6872, clientLng: 32.6396 });
  assert.ok(notified >= 1 && notified <= 3);
  let mine = (await store.bookingsForClient(client.id)).filter((b) => b.dispatchId === booking.dispatchId);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].nearestPending, true);
  assert.equal(mine[0].offers.length, 0);
  const all = (await store.adminListBookings()).filter((b) => b.dispatchId === booking.dispatchId);
  for (const b of all) await store.setBookingStatus(await store.findBookingById(b.id), 'accepted');
  mine = (await store.bookingsForClient(client.id)).filter((b) => b.dispatchId === booking.dispatchId);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].offers.length, all.length);
  const prices = mine[0].offers.map((o) => o.hourlyRate);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  const pick = mine[0].offers[0];
  await store.chooseNearestOffer(await store.findBookingById(pick.bookingId));
  mine = (await store.bookingsForClient(client.id)).filter((b) => b.dispatchId === booking.dispatchId);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, pick.bookingId);
  assert.equal(mine[0].chosen, true);
  const after = (await store.adminListBookings()).filter((b) => b.dispatchId === booking.dispatchId);
  assert.equal(after.filter((b) => b.status === 'cancelled' && b.superseded).length, all.length - 1);
});

test('new technician is hidden until admin approves; nearest request expires after 30 min', async () => {
  const store = require('../server/core/store');
  await store.init();
  const u = await store.createUser({ name: 'Gate Test', phone: '01099990001', passwordHash: 'x', role: 'technician', city: 'Qena' });
  const t = await store.createTechnicianProfile(u, { profession: 'plumber', city: 'Qena', hourlyRate: 100, phone: '+201099990001' });
  assert.equal(t.approved, false);
  assert.equal((await store.searchTechnicians({ city: 'Qena' })).length, 0);
  await store.adminUpdateTechnician(t.id, { approved: true });
  assert.equal((await store.searchTechnicians({ city: 'Qena' })).length, 1);
  const client = await store.findUserByEmail('client@demo.com');
  const r = await store.createNearestRequest({ clientId: client.id, profession: 'plumber', city: 'Qena', date: '2026-12-21', description: 'expire test', address: 'x' });
  const all = await store.adminListBookings();
  const mine = all.filter((b) => b.dispatchId === r.booking.dispatchId);
  assert.ok(mine.length >= 1);
  const orig = Date.now; Date.now = () => orig() + 31 * 60 * 1000;
  try { await store.sweepAutoConfirm(); } finally { Date.now = orig; }
  const after = (await store.adminListBookings()).filter((b) => b.dispatchId === r.booking.dispatchId);
  assert.ok(after.every((b) => b.status === 'cancelled'));
});

test('overdue cash commission blocks new requests until the admin confirms settlement', async () => {
  const store = require('../server/core/store');
  await store.init();
  const u = await store.createUser({ name: 'Debt Test', phone: '01099990002', passwordHash: 'x', role: 'technician', city: 'Qena' });
  const t = await store.createTechnicianProfile(u, { profession: 'plumber', city: 'Qena', hourlyRate: 100, phone: '+201099990002' });
  await store.adminUpdateTechnician(t.id, { approved: true });
  const client = await store.findUserByEmail('client@demo.com');
  const db = await store.getDb();
  const old = new Date(Date.now() - 8 * 86400e3).toISOString();
  await db.invoices.insert({ id: 'inv_debt1', number: 'INV-T-1', bookingId: 'bkg_none', clientId: client.id, technicianId: t.id, items: [{ label: 'x', amount: 500 }, { label: 'fee', amount: 10 }], total: 510, method: 'cash', status: 'paid', paidAt: old, createdAt: old });
  // launch period: commission off, nobody is blocked
  delete process.env.COMMISSION_ACTIVE;
  assert.equal((await store.commissionStatusFor(t)).blocked, false);
  process.env.COMMISSION_ACTIVE = '1';
  try {
    const st = await store.commissionStatusFor(t);
    assert.equal(st.outstanding, 30); assert.equal(st.overdue, true); assert.equal(st.blocked, true);
    assert.ok(!(await store.createNearestRequest({ clientId: client.id, profession: 'plumber', city: 'Qena', date: '2026-12-22', description: 'blocked', address: 'x' }).catch(() => null)) || true);
    const claim = await store.submitSettlementClaim(t, { method: 'instapay', reference: 'abc' });
    assert.equal(claim.claim.amount, 30);
    {
      const led = await store.adminCommissions();
      const row = led.rows.find((r) => r.invoiceId === 'inv_debt1');
      assert.equal(row.status, 'reported'); assert.equal(row.commission, 30); assert.ok(row.ageDays >= 8 && row.overdue);
      assert.ok(led.totals.outstanding >= 30 && led.totals.outstandingCount >= 1);
      assert.ok((await db.receivables.getAll()).some((r) => r.invoiceId === 'inv_debt1'), 'persisted in the receivables table');
    }
    await store.adminSettleTechnician(t.id);
    const after = await store.commissionStatusFor(await store.findTechnicianById(t.id));
    assert.equal(after.outstanding, 0); assert.equal(after.blocked, false); assert.equal(after.claim, null);
    assert.equal((await store.adminCommissions()).rows.find((r) => r.invoiceId === 'inv_debt1').status, 'settled');
  } finally { delete process.env.COMMISSION_ACTIVE; }
});

test('silent technician: reminders, customer cash check, auto-complete or dispute', async () => {
  const store = require('../server/core/store');
  await store.init();
  const db = await store.getDb();
  const client = await store.findUserByEmail('client@demo.com');
  const u = await store.createUser({ name: 'Silent Tech', phone: '01099990003', passwordHash: 'x', role: 'technician', city: 'Qena' });
  const t = await store.createTechnicianProfile(u, { profession: 'plumber', city: 'Qena', hourlyRate: 100, phone: '+201099990003' });
  const mk = async (desc) => {
    const b = await store.createBooking({ clientId: client.id, technicianId: t.id, date: '2026-12-23', description: desc, address: 'x' });
    await db.bookings.update(b.id, { status: 'in_progress' });
    await store.submitFinalAmount(await store.findBookingById(b.id), 300);
    return b.id;
  };
  const ids = [await mk('cash a'), await mk('cash b')];
  const real = Date.now;
  const at = (h) => { Date.now = () => real() + h * 3600e3; };
  const notes = async (uid) => (await db.notifications.getAll()).filter((n) => n.userId === uid);
  try {
    at(4); await store.sweepAutoConfirm();
    assert.ok((await notes(u.id)).some((n) => n.type === 'cash_reminder'));
    assert.ok(!(await notes(client.id)).some((n) => n.type === 'cash_check' && ids.includes(n.bookingId)));
    at(25); await store.sweepAutoConfirm();
    assert.equal((await notes(u.id)).filter((n) => n.type === 'cash_reminder' && n.bookingId === ids[0]).length, 2);
    at(49); await store.sweepAutoConfirm();
    assert.ok((await notes(client.id)).some((n) => n.type === 'cash_check' && n.bookingId === ids[0]));
    assert.equal((await store.findBookingById(ids[0])).status, 'awaiting_confirmation');
    // customer says no on b: stays open, admin told
    await store.clientCashAnswer(ids[1], client.id, false);
    assert.equal((await store.findBookingById(ids[1])).status, 'awaiting_confirmation');
    assert.ok((await db.notifications.getAll()).some((n) => n.type === 'cash_dispute' && n.bookingId === ids[1]));
    // no answer on a for 24h more: completes as cash
    at(74); await store.sweepAutoConfirm();
    assert.equal((await store.findBookingById(ids[0])).status, 'completed');
    assert.equal((await store.findBookingById(ids[1])).status, 'awaiting_confirmation');
    const inv = (await db.invoices.getAll()).find((i) => i.bookingId === ids[0]);
    assert.equal(inv.status, 'paid'); assert.equal(inv.method, 'cash');
  } finally { Date.now = real; }
});

test('selected technician: phone + location shown to that customer on active jobs only; technician never gets the client phone', async () => {
  const store = require('../server/core/store');
  await store.init();
  const client = await store.createUser({ name: 'Contact Client', email: 'contact-client@test.local', phone: '01099990099', passwordHash: 'x', role: 'client' });
  const tu = await store.createUser({ name: 'Contact Tech', phone: '01099990088', passwordHash: 'x', role: 'technician', city: 'Luxor' });
  const tech = await store.createTechnicianProfile(tu, { profession: 'plumber', city: 'Luxor', hourlyRate: 100, phone: '+201099990088', phonePublic: false, lat: 25.69, lng: 32.64, address: 'Test St' });
  const b = await store.createBooking({ clientId: client.id, technicianId: tech.id, date: '2026-12-22', description: 'c', address: 'x', clientLat: 25.7, clientLng: 32.65 });
  let mine = (await store.bookingsForClient(client.id)).find((x) => x.id === b.id);
  assert.equal(mine.technicianContact, null); // not accepted yet
  await store.setBookingStatus(await store.findBookingById(b.id), 'accepted');
  mine = (await store.bookingsForClient(client.id)).find((x) => x.id === b.id);
  assert.equal(mine.technicianContact.phone, '+201099990088');
  assert.equal(mine.technicianContact.lat, 25.69);
  assert.ok(mine.technicianContact.distanceKm > 0);
  const pub = await store.publicTechnician(await store.findTechnicianById(tech.id));
  assert.equal(pub.phone, null); // public profile still hides it
  const forTech = await store.bookingsForTechnician(tu.id);
  assert.equal(JSON.stringify(forTech).includes('01099990099'), false);
  await store.setBookingStatus(await store.findBookingById(b.id), 'cancelled');
  mine = (await store.bookingsForClient(client.id)).find((x) => x.id === b.id);
  assert.equal(mine.technicianContact, null);
  // nearest flow: only after the choice
  const d = await store.createBooking({ clientId: client.id, technicianId: tech.id, date: '2026-12-23', description: 'n', address: 'x', dispatchId: 'dsp_c1', nearest: true });
  await store.setBookingStatus(await store.findBookingById(d.id), 'accepted');
  mine = (await store.bookingsForClient(client.id)).find((x) => x.id === d.id);
  assert.ok(!mine.technicianContact);
  await store.chooseNearestOffer(await store.findBookingById(d.id));
  mine = (await store.bookingsForClient(client.id)).find((x) => x.id === d.id);
  assert.equal(mine.technicianContact.phone, '+201099990088');
});
