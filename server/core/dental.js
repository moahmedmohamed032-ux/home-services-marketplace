// Dental clinics guide: price-range guide + clinic directory + appointment requests.
// Clinics are public only after an admin approves them. Seed clinics (from public listings)
// are loaded UNAPPROVED and hidden until verified by a phone call.
const store = require('./store');
const ApiError = require('./ApiError');
const { PROCEDURES, DENTAL_CITIES, CITY_AR, UPDATED } = require('./dental.seed');
const SEED_CLINICS = require('./clinics.seed.json');

const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const PHOTO_MAX = 150000; // chars of base64 per photo (client resizes to ~900px JPEG)
const MAX_PHOTOS = 5;

let seeded = null;
async function ensureSeed() {
  if (!seeded) {
    seeded = (async () => {
      const db = await store.getDb();
      const procs = await db.procedures.getAll();
      for (const p of PROCEDURES) {
        if (!procs.find((x) => x.id === p.id)) await db.procedures.insert({ ...p, checkedAt: UPDATED });
      }
      const clinics = await db.clinics.getAll();
      const now = new Date().toISOString();
      for (const c of SEED_CLINICS) {
        if (clinics.find((x) => x.id === c.id)) continue;
        await db.clinics.insert({
          id: c.id, name: c.name, city: c.city, address: c.address, phone: c.phone, phoneRaw: c.phoneRaw || '', whatsapp: c.whatsapp || '',
          email: c.email || '', lat: undefined, lng: undefined, about: '', hours: '', services: [], prices: {}, photos: [],
          origin: 'public-listing', sources: c.sources || [], notes: c.notes || '', invited: !!c.invited,
          approved: false, verified: false, removed: false, createdAt: now, updatedAt: now,
        });
      }
    })().catch((e) => { seeded = null; throw e; });
  }
  return seeded;
}

const publicClinic = (c) => ({
  id: c.id, name: c.name, city: c.city, cityAr: CITY_AR[c.city] || c.city, address: c.address,
  phone: c.phone, whatsapp: c.whatsapp, lat: c.lat, lng: c.lng, about: c.about, hours: c.hours,
  services: c.services || [], prices: c.prices || {}, photos: c.photos || [], verified: !!c.verified,
});
const isLive = (c) => c.approved && !c.removed;

// The public guide is dark until the first real clinic is approved.
async function isPublic() {
  await ensureSeed();
  const db = await store.getDb();
  return (await db.clinics.getAll()).some(isLive);
}
async function requirePublic() {
  if (!(await isPublic())) throw ApiError.notFound('Not found');
}

async function listProcedures() {
  await ensureSeed();
  const db = await store.getDb();
  return (await db.procedures.getAll()).sort((a, b) => (a.order || 0) - (b.order || 0));
}
async function listClinics({ city, procedure } = {}) {
  await ensureSeed();
  const db = await store.getDb();
  let rows = (await db.clinics.getAll()).filter(isLive);
  if (city) rows = rows.filter((c) => c.city.toLowerCase() === String(city).toLowerCase());
  if (procedure) rows = rows.filter((c) => !(c.services || []).length || c.services.includes(procedure));
  return rows.sort((a, b) => Number(!!b.verified) - Number(!!a.verified) || a.name.localeCompare(b.name, 'ar')).map(publicClinic);
}
async function cityCounts() {
  await ensureSeed();
  const db = await store.getDb();
  const rows = (await db.clinics.getAll()).filter(isLive);
  return DENTAL_CITIES.map((c) => ({ city: c, cityAr: CITY_AR[c], count: rows.filter((r) => r.city === c).length }));
}
async function getClinic(id) {
  await ensureSeed();
  const db = await store.getDb();
  const c = await db.clinics.getById(id);
  if (!c || !isLive(c)) throw ApiError.notFound('Clinic not found');
  return publicClinic(c);
}

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
async function admins() {
  const db = await store.getDb();
  return (await db.users.getAll()).filter((u) => u.role === 'admin');
}
function cleanPhotos(photos, consent) {
  const list = Array.isArray(photos) ? photos : [];
  if (!list.length) return [];
  if (!consent) throw ApiError.badRequest('لازم تأكد إن الصور بتاعتك وإنك موافق على عرضها');
  if (list.length > MAX_PHOTOS) throw ApiError.badRequest(`الحد الأقصى ${MAX_PHOTOS} صور`);
  for (const p of list) {
    if (typeof p !== 'string' || !IMG_RE.test(p) || p.length > PHOTO_MAX) throw ApiError.badRequest('صورة غير صالحة أو كبيرة (JPG/PNG/WebP فقط)');
  }
  return list;
}
async function cleanPrices(prices) {
  const out = {};
  if (!prices || typeof prices !== 'object') return out;
  const procs = await listProcedures();
  for (const [k, v] of Object.entries(prices)) {
    if (v === '' || v == null) continue;
    const p = procs.find((x) => x.id === k);
    const n = Number(v);
    if (!p || !Number.isFinite(n)) throw ApiError.badRequest('سعر غير صالح');
    // Same idea as technician price caps: stay inside the guide band with some room (50%-150%).
    if (n < p.min * 0.5 || n > p.max * 1.5) {
      throw ApiError.badRequest(`سعر "${p.nameAr}" خارج النطاق المعقول (${Math.round(p.min * 0.5)} - ${Math.round(p.max * 1.5)} ج). تواصل معنا لو السعر صحيح.`);
    }
    out[k] = Math.round(n);
  }
  return out;
}
function checkPhone(p, label = 'التليفون') {
  const d = store.normalizePhone(p);
  if (!/^0\d{8,10}$/.test(d)) throw ApiError.badRequest(`${label} غير صالح`);
  return d;
}

async function registerClinic(b) {
  await ensureSeed();
  const db = await store.getDb();
  if (b.confirmOwner !== true && b.confirmOwner !== 'true') throw ApiError.badRequest('لازم تأكد إنك صاحب العيادة أو مفوض بالتسجيل');
  const name = str(b.name, 120);
  if (name.length < 3) throw ApiError.badRequest('اسم العيادة مطلوب');
  if (!DENTAL_CITIES.includes(b.city)) throw ApiError.badRequest('المدينة غير صالحة');
  const address = str(b.address, 200);
  if (address.length < 5) throw ApiError.badRequest('العنوان مطلوب');
  const phone = checkPhone(b.phone);
  const whatsapp = b.whatsapp ? checkPhone(b.whatsapp, 'رقم واتساب') : '';
  const procs = await listProcedures();
  const services = (Array.isArray(b.services) ? b.services : []).filter((s) => procs.find((p) => p.id === s));
  const now = new Date().toISOString();
  const clinic = await db.clinics.insert({
    id: await db.nextId('cln'), name, city: b.city, address, phone, phoneRaw: '', whatsapp,
    email: str(b.email, 120), about: str(b.about, 600), hours: str(b.hours, 120), services,
    prices: await cleanPrices(b.prices), photos: cleanPhotos(b.photos, b.photoConsent === true || b.photoConsent === 'true'),
    origin: 'registered', sources: [], notes: `contact: ${str(b.contactName, 80)}`, invited: false,
    approved: false, verified: false, removed: false, createdAt: now, updatedAt: now,
  });
  for (const a of await admins()) {
    await store.notify(a.id, { type: 'clinic_pending', link: '/admin/dental', titleAr: 'عيادة أسنان جديدة في انتظار الاعتماد', titleEn: 'New dental clinic awaiting approval', bodyAr: `${name} (${CITY_AR[b.city]})`, bodyEn: `${name} (${b.city})` });
  }
  return { id: clinic.id, approved: false };
}

async function createAppointment(b) {
  await ensureSeed();
  const db = await store.getDb();
  const c = await db.clinics.getById(String(b.clinicId || ''));
  if (!c || !isLive(c)) throw ApiError.notFound('Clinic not found');
  const name = str(b.name, 80);
  if (name.length < 2) throw ApiError.badRequest('الاسم مطلوب');
  if (!store.isEgPhone(b.phone)) throw ApiError.badRequest('رقم موبايل مصري صحيح مطلوب');
  const procs = await listProcedures();
  const proc = procs.find((p) => p.id === b.procedure);
  const a = await db.appointments.insert({
    id: await db.nextId('apt'), clinicId: c.id, clinicName: c.name, name, phone: store.normalizePhone(b.phone),
    procedure: proc ? proc.nameAr : '', preferred: str(b.preferred, 80), note: str(b.note, 300), status: 'new', createdAt: new Date().toISOString(),
  });
  for (const ad of await admins()) {
    await store.notify(ad.id, { type: 'clinic_appointment', link: '/admin/dental', titleAr: 'طلب موعد أسنان جديد', titleEn: 'New dental appointment request', bodyAr: `${name} → ${c.name}`, bodyEn: `${name} → ${c.name}` });
  }
  return { id: a.id };
}

// ---- admin ----
async function adminClinics() {
  await ensureSeed();
  const db = await store.getDb();
  return (await db.clinics.getAll()).filter((c) => !c.removed)
    .sort((a, b) => Number(a.approved) - Number(b.approved) || (a.createdAt < b.createdAt ? 1 : -1));
}
async function adminUpdateClinic(id, b) {
  await ensureSeed();
  const db = await store.getDb();
  const c = await db.clinics.getById(id);
  if (!c) throw ApiError.notFound('Clinic not found');
  const patch = { updatedAt: new Date().toISOString() };
  for (const k of ['name', 'address', 'about', 'hours', 'email', 'notes']) if (b[k] !== undefined) patch[k] = str(b[k], k === 'about' ? 600 : 200);
  if (b.city !== undefined) { if (!DENTAL_CITIES.includes(b.city)) throw ApiError.badRequest('city'); patch.city = b.city; }
  if (b.phone !== undefined) patch.phone = b.phone ? checkPhone(b.phone) : '';
  if (b.whatsapp !== undefined) patch.whatsapp = b.whatsapp ? checkPhone(b.whatsapp, 'رقم واتساب') : '';
  if (b.lat !== undefined) patch.lat = b.lat === '' || b.lat === null ? undefined : Number(b.lat);
  if (b.lng !== undefined) patch.lng = b.lng === '' || b.lng === null ? undefined : Number(b.lng);
  if (b.prices !== undefined) patch.prices = await cleanPrices(b.prices);
  if (b.photos !== undefined) patch.photos = cleanPhotos(b.photos, true);
  if (b.approved !== undefined) patch.approved = !!b.approved;
  if (b.verified !== undefined) patch.verified = !!b.verified;
  if (b.removed !== undefined) patch.removed = !!b.removed;
  return db.clinics.update(id, patch);
}
async function adminAppointments() {
  await ensureSeed();
  const db = await store.getDb();
  return (await db.appointments.getAll()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
async function adminUpdateAppointment(id, b) {
  const db = await store.getDb();
  if (!['new', 'contacted', 'done', 'cancelled'].includes(b.status)) throw ApiError.badRequest('status');
  const a = await db.appointments.update(id, { status: b.status });
  if (!a) throw ApiError.notFound('Appointment not found');
  return a;
}
async function adminUpdateProcedure(id, b) {
  await ensureSeed();
  const db = await store.getDb();
  const patch = { checkedAt: new Date().toISOString().slice(0, 10) };
  for (const k of ['min', 'max']) if (b[k] !== undefined) { const n = Number(b[k]); if (!Number.isFinite(n) || n < 0) throw ApiError.badRequest(k); patch[k] = n; }
  if (b.descAr !== undefined) patch.descAr = str(b.descAr, 400);
  const p = await db.procedures.update(id, patch);
  if (!p) throw ApiError.notFound('Procedure not found');
  return p;
}

module.exports = {
  isPublic, requirePublic, DENTAL_CITIES, ensureSeed, listProcedures, listClinics, cityCounts, getClinic, registerClinic, createAppointment,
  adminClinics, adminUpdateClinic, adminAppointments, adminUpdateAppointment, adminUpdateProcedure,
};
