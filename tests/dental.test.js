const { test } = require('node:test');
const assert = require('node:assert');

test('dental: 42 public-listing clinics load hidden; registration needs approval; prices validated; no private data leaks', async () => {
  const dental = require('../server/core/dental');
  const store = require('../server/core/store');
  await store.init();
  const procs = await dental.listProcedures();
  assert.equal(procs.length, 8);
  assert.ok(procs.every((p) => p.min < p.max && p.sources.length >= 2));
  assert.equal((await dental.listClinics()).length, 0); // seeds are unapproved
  const all = await dental.adminClinics();
  assert.equal(all.filter((c) => c.origin === 'public-listing').length, 42);

  await assert.rejects(() => dental.registerClinic({ name: 'عيادة اختبار', city: 'Luxor', address: 'شارع التليفزيون', phone: '01011112222' }), /تأكد/);
  await assert.rejects(() => dental.registerClinic({ name: 'عيادة اختبار', city: 'Luxor', address: 'شارع التليفزيون', phone: '01011112222', confirmOwner: true, prices: { checkup: 90000 } }), /خارج النطاق/);
  await assert.rejects(() => dental.registerClinic({ name: 'عيادة اختبار', city: 'Luxor', address: 'شارع التليفزيون', phone: '01011112222', confirmOwner: true, photos: ['data:image/jpeg;base64,AAAA'] }), /الصور/);
  const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  const r = await dental.registerClinic({ name: 'عيادة اختبار', city: 'Luxor', address: 'شارع التليفزيون', phone: '01011112222', email: 'private@x.com', confirmOwner: true, photoConsent: true, photos: [photo], services: ['checkup', 'nope'], prices: { checkup: 150 } });
  assert.equal(r.approved, false);
  assert.equal((await dental.listClinics({ city: 'Luxor' })).length, 0);
  await assert.rejects(() => dental.getClinic(r.id), /not found/i);

  assert.equal(await dental.isPublic(), false); // guide stays dark until a clinic is approved
  await assert.rejects(() => dental.requirePublic(), /not found/i);
  await dental.adminUpdateClinic(r.id, { approved: true });
  assert.equal(await dental.isPublic(), true);
  const live = await dental.listClinics({ city: 'Luxor' });
  assert.equal(live.length, 1);
  assert.deepEqual(live[0].services, ['checkup']);
  assert.equal(live[0].photos.length, 1);
  assert.equal(JSON.stringify(live[0]).includes('private@x.com'), false);
  assert.equal('email' in live[0] || 'notes' in live[0] || 'sources' in live[0], false);

  await assert.rejects(() => dental.createAppointment({ clinicId: r.id, name: 'أحمد', phone: '123' }), /موبايل/);
  await assert.rejects(() => dental.createAppointment({ clinicId: 'cln_seed_1', name: 'أحمد', phone: '01012345678' }), /not found/i); // hidden seed clinic
  const a = await dental.createAppointment({ clinicId: r.id, name: 'أحمد', phone: '01012345678', procedure: 'checkup' });
  assert.ok(a.id);
  assert.equal((await dental.adminAppointments()).length, 1);
  const admin = (await store.listUsersAdmin()).find((u) => u.role === 'admin');
  const nf = await store.notificationsFor(admin.id); assert.ok((nf.notifications || nf.items || nf).some((n) => n.type === 'clinic_appointment'));
});
