// Delivery courier is a normal technician category, priced per delivery, with no invented market band.
const { test } = require('node:test');
const assert = require('node:assert');
const store = require('../server/core/store');
const { retrieve } = require('../server/core/assistantKb');

test('delivery category exists, per delivery, with no price band', async () => {
  const p = (await store.listProfessions()).find((x) => x.id === 'delivery');
  assert.ok(p);
  assert.equal(p.nameAr, 'توصيل طلبات');
  assert.equal(p.priceMax, undefined);
  assert.equal(p.technicianCount, 0);
});

test('a courier profile has per-trip unit and no "within market" badge', async () => {
  const pub = await store.publicTechnician({ id: 't_x', profession: 'delivery', hourlyRate: 40, phone: '01012345678' });
  assert.equal(pub.rateUnit, 'trip');
  assert.equal(pub.priceStatus, undefined);
  const plumber = await store.publicTechnician({ id: 't_y', profession: 'plumber', hourlyRate: 100 });
  assert.equal(plumber.rateUnit, 'hour');
  assert.equal(plumber.priceStatus, 'within');
});

test('assistant explains the courier service without claiming shop integrations', () => {
  const t = retrieve('عايز طيار توصيل من مطعم').map((c) => c.t).join('\n');
  assert.match(t, /مش مربوط/);
});

test('nearest request: address and map point reach only the technician the customer chose', async () => {
  await store.init();
  await require('./approve-ids')();
  const client = await store.findUserByEmail('client@demo.com');
  const prof = (await store.searchTechnicians({ lat: 25.6872, lng: 32.6396 }))[0].profession;
  const { booking } = await store.createNearestRequest({ clientId: client.id, profession: prof, date: '2026-12-21', description: 'privacy test', address: 'Secret street 5', clientLat: 25.6872, clientLng: 32.6396 });
  const group = (await store.adminListBookings()).filter((b) => b.dispatchId === booking.dispatchId);
  const db = await store.getDb();
  // demo technicians have no login; give each a throwaway user id so their own view can be read
  const userOf = async (b) => { const t = await store.findTechnicianById(b.technicianId); const uid = t.userId || `usr_priv_${t.id}`; if (!t.userId) await db.technicians.update(t.id, { userId: uid }); return uid; };
  for (const b of group) {
    const mine = (await store.bookingsForTechnician(await userOf(b))).find((x) => x.id === b.id);
    assert.equal(mine.locationHidden, true);
    assert.equal(mine.address, undefined);
    assert.equal(mine.clientLat, undefined);
    assert.equal(mine.clientLng, undefined);
  }
  for (const b of group) await store.setBookingStatus(await store.findBookingById(b.id), 'accepted');
  const pick = group[0];
  await store.chooseNearestOffer(await store.findBookingById(pick.id));
  const chosen = (await store.bookingsForTechnician(await userOf(pick))).find((x) => x.id === pick.id);
  assert.equal(chosen.address, 'Secret street 5');
  assert.equal(chosen.clientLat, 25.6872);
});

test('technician can apply from a pre-launch area but customers still do not see it', async () => {
  await store.init();
  const areas = await store.listRegistrationAreas();
  assert.ok(['Asyut', 'Sohag', 'Faisal', '6th of October', 'Badr', 'Shorouk', 'Kom Ombo', 'Edfu', 'Armant', 'Nag Hammadi', 'Dishna', 'Qus', 'Girga', 'Akhmim', 'Tahta', 'Manfalut'].every((n) => areas.some((a) => a.name === n && a.public === false)));
  assert.ok(areas.filter((a) => a.public).map((a) => a.name).join() === 'Luxor,Esna,Qena,Aswan');
  assert.deepEqual(await store.listCities(), ['Luxor', 'Esna', 'Qena', 'Aswan']);
  const u = await store.createUser({ name: 'Asyut Applicant', phone: '01099990077', passwordHash: 'x', role: 'technician', city: 'Asyut' });
  const t = await store.createTechnicianProfile(u, { profession: 'plumber', city: 'asyut', hourlyRate: 100, phone: '01099990077' });
  assert.equal(t.city, 'Asyut');
  await store.adminUpdateTechnician(t.id, { approved: true });
  assert.equal((await store.searchTechnicians({ profession: 'plumber', city: 'Asyut' })).length, 0, 'not in customer search');
  assert.ok((await store.adminListTechnicians()).some((x) => x.id === t.id && x.city === 'Asyut'), 'admin sees it');
  await assert.rejects(() => store.createTechnicianProfile(u, { profession: 'plumber', city: 'Atlantis', hourlyRate: 100 }));
});
