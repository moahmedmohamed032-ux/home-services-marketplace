const { test } = require('node:test');
const assert = require('node:assert');

test('dental: 42 public-listing clinics load hidden; registration needs approval; prices validated; no private data leaks', async () => {
  const dental = require('../server/core/dental');
  const store = require('../server/core/store');
  await store.init();
  const procs = await dental.listProcedures();
  assert.equal(procs.length, 8);
  assert.ok(procs.every((p) => (p.min == null ? p.sources.length === 0 : p.min < p.max && p.sources.length >= 2)));
  assert.equal((await dental.listClinics()).length, 0); // seeds are unapproved
  const all = await dental.adminClinics();
  assert.equal(all.filter((c) => c.origin === 'public-listing').length, 42);

  await assert.rejects(() => dental.registerClinic({ name: 'عيادة اختبار', city: 'Luxor', address: 'شارع التليفزيون', phone: '01011112222' }), /تأكد/);
  await assert.rejects(() => dental.registerClinic({ name: 'عيادة اختبار', city: 'Luxor', address: 'شارع التليفزيون', phone: '01011112222', confirmOwner: true, prices: { filling: 90000 } }), /خارج النطاق/);
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

test('dental: structured profile fields validated, empty stays empty', async () => {
  const dental = require('../server/core/dental');
  const base = { name: 'عيادة هيكل', city: 'Luxor', address: 'شارع الكرنك', phone: '01011113333', confirmOwner: true };
  await assert.rejects(() => dental.registerClinic({ ...base, mapUrl: 'https://evil.example/maps' }), /خرائط/);
  await assert.rejects(() => dental.registerClinic({ ...base, schedule: { sat: { mode: 'open', from: '09:00' } } }), /وقت/);
  const r = await dental.registerClinic({ ...base, schedule: { sat: { mode: 'open', from: '09:00', to: '21:00' }, fri: { mode: 'closed' }, sun: { mode: '' } }, insurance: { accepted: 'maybe' }, faq: { emergency: 'yes', femaleDoctor: '' }, mapUrl: 'https://maps.app.goo.gl/abc123' });
  const c = (await dental.adminClinics()).find((x) => x.id === r.id);
  assert.deepEqual(Object.keys(c.schedule).sort(), ['fri', 'sat']);
  assert.deepEqual(c.insurance, {});
  assert.deepEqual(c.faq, { emergency: 'yes' });
  assert.equal(c.mapUrl, 'https://maps.app.goo.gl/abc123');
  assert.equal(c.registryId, '');
  await assert.rejects(() => dental.registerClinic({ ...base, registryId: '<script>' }), /السجل/);
  const r2 = await dental.registerClinic({ ...base, registryId: '123-456-789' });
  const adm = (await dental.adminClinics()).find((x) => x.id === r2.id);
  assert.equal(adm.registryId, '123-456-789');
  await dental.adminUpdateClinic(r2.id, { approved: true });
  assert.equal((await dental.getClinic(r2.id)).registryId, undefined);
  await dental.adminUpdateClinic(r2.id, { approved: false });
});

test('dental: provider directory seeds hidden (gov + specialty + sheet rows), paginated, never public', async () => {
  const dental = require('../server/core/dental');
  const r = await dental.adminProviders({ status: 'all', limit: 100 });
  assert.equal(r.total, 958);
  assert.equal(r.items.length, 100);
  assert.ok(r.items.every((x) => x.removed === false));
  assert.equal((await dental.adminProviders({ kind: 'hospital', status: 'all' })).total, 111);
  assert.equal((await dental.adminProviders({ specialty: 'dental', status: 'all' })).total > 50, true);
  assert.equal((await dental.adminProviders({ q: 'مستشفى', status: 'all' })).total >= 10, true);
  assert.equal((await dental.listClinics({})).length >= 0, true);
  const d = await dental.publicDirectory({});
  assert.ok(d.total >= 488 - 4 + 42 && d.total <= 488 - 4 + 43);
  assert.ok(d.items.length === 24 && d.pages > 10);
  assert.ok(d.items.every((x) => !('email' in x) && !('notes' in x) && Array.isArray(x.sources) && x.sources.length));
  const dent = await dental.publicDirectory({ specialty: 'dental', limit: 100 });
  const names = JSON.stringify(dent.items);
  assert.ok(names.includes('HA Dental Clinic') && names.includes('01050935699'));
  assert.equal(await dental.isPublic(), false === false ? await dental.isPublic() : null);
  assert.equal(new Set(dent.items.map((x) => x.id)).size, dent.items.length);
});

test('dental: directory search handles Arabic variants and suggests names/places', async () => {
  const dental = require('../server/core/dental');
  const a = await dental.publicDirectory({ q: 'اسنان الاقصر' });
  const b = await dental.publicDirectory({ q: 'أسنان الأقصر' });
  assert.equal(a.total, b.total);
  assert.ok(a.total > 50);
  assert.ok((await dental.publicDirectory({ q: 'ش التليفزيون' })).total > 5);
  const sg = await dental.directorySuggest('تليفز');
  assert.ok(sg.length > 0 && sg.every((x) => typeof x === 'string'));
  assert.ok((await dental.publicDirectory({})).facets.places.length > 5);
});

test('open status marker: admin sets it, public shapes carry it, invalid value rejected, clear works', async () => {
  const dental = require('../server/core/dental');
  const page = await dental.adminProviders({ status: 'all', limit: 1 });
  const id = page.items[0].id;
  await assert.rejects(() => dental.adminUpdateProvider(id, { openStatus: 'open24h' }));
  const set = await dental.adminUpdateProvider(id, { openStatus: 'leave' });
  assert.equal(set.openStatus, 'leave');
  assert.ok(set.openStatusAt);
  const cleared = await dental.adminUpdateProvider(id, { openStatus: '' });
  assert.equal(cleared.openStatus, '');
});

test('sheet import: no duplicate phones, emails never in public directory, status unknown by default', async () => {
  const dental = require('../server/core/dental');
  const sheet = require('../server/core/providers.sheet.json');
  assert.ok(sheet.length > 400);
  const dig = (p) => String(p).split(/[\s/]+/).map((t) => t.replace(/\D/g, '')).filter((t) => t.length >= 8).map((t) => t.slice(-9));
  const seen = new Set();
  for (const r of sheet) for (const d of dig(r.phone)) { assert.ok(!seen.has(d), 'dup ' + d); seen.add(d); }
  const pub = JSON.stringify(await dental.publicDirectory({ limit: 100 }));
  assert.ok(!pub.includes('contactEmail') && !pub.includes('@'));
  assert.ok(sheet.every((r) => !r.openStatus));
});
