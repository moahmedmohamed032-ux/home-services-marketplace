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
