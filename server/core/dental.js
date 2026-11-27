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
        const ex = procs.find((x) => x.id === p.id);
        if (!ex) await db.procedures.insert({ ...p, checkedAt: UPDATED });
        // Seed text/sources corrected after launch: refresh only procedures an admin has not edited.
        else if (ex.checkedAt === UPDATED && (ex.descAr !== p.descAr || ex.min !== p.min || ex.max !== p.max || JSON.stringify(ex.sources) !== JSON.stringify(p.sources))) await db.procedures.update(p.id, { descAr: p.descAr, sources: p.sources, min: p.min, max: p.max });
      }
      const clinics = await db.clinics.getAll();
      const now = new Date().toISOString();
      for (const c of SEED_CLINICS) {
        const ex = clinics.find((x) => x.id === c.id);
        if (ex) {
          // Corrected seed phone (source CSV fix): only fill a blank, never touch an edited/approved clinic.
          if (!ex.approved && !ex.phone && c.phone) await db.clinics.update(c.id, { phone: c.phone, whatsapp: c.whatsapp || '', phoneRaw: c.phoneRaw || '' });
          continue;
        }
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

// ---- provider directory (clinics of all specialties + hospitals). Hidden/pending only; no public API reads it yet. ----
let provSeeded = null;
async function ensureProviders() {
  if (!provSeeded) {
    provSeeded = (async () => {
      const db = await store.getDb();
      const seed = require('./providers.seed.json');
      const have = new Set((await db.providers.getAll()).map((x) => x.id));
      const now = new Date().toISOString();
      const rows = seed.filter((x) => !have.has(x.id)).map((x) => ({ ...x, approved: false, removed: false, createdAt: now, updatedAt: now }));
      if (rows.length) await db.providers.insertMany(rows);
    })().catch((e) => { provSeeded = null; throw e; });
  }
  return provSeeded;
}
async function adminProviders(q = {}) {
  await ensureProviders();
  const db = await store.getDb();
  const all = (await db.providers.getAll()).filter((x) => !x.removed);
  const facet = (f) => Object.entries(all.reduce((m, x) => ((m[x[f]] = (m[x[f]] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const text = String(q.q || '').trim();
  let list = all.filter((x) => (!q.kind || x.kind === q.kind) && (!q.city || x.city === q.city) && (q.specialty === undefined || q.specialty === '' || x.specialtyKey === q.specialty)
    && (q.status === 'approved' ? x.approved : q.status === 'all' ? true : !x.approved) && (!text || x.name.includes(text) || (x.specialty || '').includes(text) || (x.address || '').includes(text)));
  list.sort((a, b) => (a.id.length - b.id.length) || (a.id < b.id ? -1 : 1));
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 100);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  return { total: list.length, page, limit, items: list.slice((page - 1) * limit, page * limit), facets: { kinds: facet('kind'), cities: facet('city'), specialties: facet('specialtyKey') } };
}
async function adminUpdateProvider(id, b) {
  await ensureProviders();
  const db = await store.getDb();
  if (!(await db.providers.getById(id))) throw ApiError.notFound('Provider not found');
  const patch = { updatedAt: new Date().toISOString() };
  if (b.approved !== undefined) patch.approved = !!b.approved;
  if (b.removed !== undefined) patch.removed = !!b.removed;
  if (b.phone !== undefined) patch.phone = b.phone ? checkPhone(b.phone) : '';
  if (b.whatsapp !== undefined) patch.whatsapp = b.whatsapp ? checkPhone(b.whatsapp, 'رقم واتساب') : '';
  if (b.notes !== undefined) patch.notes = str(b.notes, 300);
  return db.providers.update(id, patch);
}

const publicClinic = (c) => ({
  id: c.id, name: c.name, city: c.city, cityAr: CITY_AR[c.city] || c.city, address: c.address,
  phone: c.phone, whatsapp: c.whatsapp, lat: c.lat, lng: c.lng, about: c.about, hours: c.hours,
  services: c.services || [], prices: c.prices || {}, photos: c.photos || [], verified: !!c.verified,
  schedule: c.schedule || {}, insurance: c.insurance || {}, mapUrl: c.mapUrl || '', faq: c.faq || {}, otherServices: c.otherServices || '',
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
    if (p.min == null) { if (n <= 0 || n > 100000) throw ApiError.badRequest('سعر غير صالح'); continue; }
    if (n < p.min * 0.5 || n > p.max * 1.5) {
      throw ApiError.badRequest(`سعر "${p.nameAr}" خارج النطاق المعقول (${Math.round(p.min * 0.5)} - ${Math.round(p.max * 1.5)} ج). تواصل معنا لو السعر صحيح.`);
    }
    out[k] = Math.round(n);
  }
  return out;
}

// ---- structured profile fields (only what the clinic actually states; empty stays empty) ----
const DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function cleanSchedule(sch) {
  const out = {};
  if (!sch || typeof sch !== 'object') return out;
  for (const d of DAYS) {
    const v = sch[d];
    if (!v || typeof v !== 'object' || !v.mode) continue;
    if (v.mode === 'closed' || v.mode === 'appointment') { out[d] = { mode: v.mode }; continue; }
    if (v.mode !== 'open') throw ApiError.badRequest('مواعيد العمل غير صالحة');
    if (!TIME_RE.test(v.from || '') || !TIME_RE.test(v.to || '') || v.from === v.to) throw ApiError.badRequest('اكتب وقت البداية والنهاية لكل يوم مفتوح');
    out[d] = { mode: 'open', from: v.from, to: v.to };
  }
  return out;
}
function cleanMapUrl(u) {
  const t = str(u, 300);
  if (!t) return '';
  let url;
  try { url = new URL(t); } catch { throw ApiError.badRequest('رابط الخريطة غير صالح'); }
  const h = url.hostname.replace(/^www\./, '');
  const ok = url.protocol === 'https:' && (h === 'maps.app.goo.gl' || h === 'goo.gl' || h === 'maps.google.com' || (/^google\.[a-z.]+$/.test(h) && url.pathname.startsWith('/maps')));
  if (!ok) throw ApiError.badRequest('الصق رابط من خرائط جوجل (Google Maps)');
  return url.toString();
}
const yn = (v) => (v === 'yes' || v === 'no' ? v : '');
function cleanInsurance(b) {
  const accepted = yn(b && b.accepted);
  if (!accepted) return {};
  return accepted === 'yes' ? { accepted, names: str(b.names, 200) } : { accepted };
}
function cleanFaq(f) {
  const out = {};
  for (const k of ['emergency', 'advanceBooking', 'femaleDoctor']) { const v = yn(f && f[k]); if (v) out[k] = v; }
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
    schedule: cleanSchedule(b.schedule), insurance: cleanInsurance(b.insurance), mapUrl: cleanMapUrl(b.mapUrl), faq: cleanFaq(b.faq), otherServices: str(b.otherServices, 200),
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
  if (b.schedule !== undefined) patch.schedule = cleanSchedule(b.schedule);
  if (b.insurance !== undefined) patch.insurance = cleanInsurance(b.insurance);
  if (b.mapUrl !== undefined) patch.mapUrl = cleanMapUrl(b.mapUrl);
  if (b.faq !== undefined) patch.faq = cleanFaq(b.faq);
  if (b.otherServices !== undefined) patch.otherServices = str(b.otherServices, 200);
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
  adminProviders, adminUpdateProvider,
  isPublic, requirePublic, DENTAL_CITIES, ensureSeed, listProcedures, listClinics, cityCounts, getClinic, registerClinic, createAppointment,
  adminClinics, adminUpdateClinic, adminAppointments, adminUpdateAppointment, adminUpdateProcedure,
};
