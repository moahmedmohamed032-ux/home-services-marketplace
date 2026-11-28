// Business-logic layer over a pluggable persistence backend: MongoDB when
// MONGODB_URI is set (production), in-memory otherwise (local dev and tests).
// Every function is async; routes always await them.
const ApiError = require('./ApiError');
const seed = require('./seed');
const paymob = require('./paymob');
const cache = require('./cache');

// Any write to these tables drops the cached public reads built from them.
const CACHE_NS = { technicians: 'tech', clinics: 'dir', providers: 'dir', procedures: 'dir' };
function instrument(backend) {
  for (const [table, ns] of Object.entries(CACHE_NS)) {
    const t = backend[table];
    if (!t || t.__cacheHooked) continue;
    for (const m of ['insert', 'update', 'remove', 'insertMany', 'publishAll']) {
      if (typeof t[m] !== 'function') continue;
      const orig = t[m].bind(t);
      t[m] = async (...args) => { const r = await orig(...args); await cache.invalidate(ns); return r; };
    }
    t.__cacheHooked = true;
  }
  return backend;
}

let db = null;
let ready = null;

function init() {
  if (!ready) {
    ready = (async () => {
      if (process.env.MONGODB_URI) {
        try {
          db = instrument(require('./persist-mongo'));
          await db.init();
          console.log('FIX-IT store: MongoDB');
          return db;
        } catch (err) {
          console.error(`FIX-IT store: MongoDB unavailable (${err.message}), using in-memory store`);
          db = null;
        }
      }
      db = instrument(require('./persist-memory'));
      await db.init();
      return db;
    })();
  }
  return ready;
}
init();

const BOOKING_STATUS = ['pending', 'accepted', 'in_progress', 'awaiting_confirmation', 'declined', 'completed', 'cancelled'];
const AUTO_CONFIRM_MS = 48 * 3600 * 1000;

// ---- users ----
// Egyptian mobile numbers are the login for technicians without email.
// Accepts 01012345678, +20 101 234 5678, 0020..., and returns 01012345678.
function normalizePhone(p) {
  let d = String(p || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('0020')) d = d.slice(4);
  if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith('1')) d = `0${d}`;
  return d;
}
const isEgPhone = (p) => /^01[0125][0-9]{8}$/.test(normalizePhone(p));

async function findUserByEmail(email) {
  await init();
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  const all = await db.users.getAll();
  return all.find((u) => u.email && u.email.toLowerCase() === e) || null;
}
// ---- usernames: 3-24 chars, lowercase letters, digits, dot, underscore; unique ----
const USERNAME_RE = /^[a-z0-9][a-z0-9._]{2,23}$/;
const RESERVED_USERNAMES = ['admin', 'administrator', 'support', 'fixit', 'fix-it', 'root', 'system', 'moderator'];
function normalizeUsername(u) { return String(u || '').trim().toLowerCase().replace(/^@/, ''); }
function validUsername(u) { return USERNAME_RE.test(u) && !RESERVED_USERNAMES.includes(u); }
async function findUserByUsername(u) {
  await init();
  const n = normalizeUsername(u);
  if (!n) return null;
  return (await db.users.getAll()).find((x) => x.username && x.username === n) || null;
}
// Free username built from a Gmail/email local part (or the name): "ahmed.m@gmail.com" -> ahmed.m, then ahmed.m2, ahmed.m3...
async function suggestUsername(email, name) {
  await init();
  let base = String(email || '').split('@')[0].toLowerCase().replace(/\+.*$/, '').replace(/[^a-z0-9._]/g, '');
  if (base.length < 3) base = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (base.length < 3) base = `user${Math.floor(1000 + Math.random() * 9000)}`;
  base = base.replace(/^[._]+/, '').slice(0, 20);
  if (base.length < 3) base = `user${Math.floor(1000 + Math.random() * 9000)}`;
  const taken = new Set((await db.users.getAll()).map((x) => x.username).filter(Boolean));
  let cand = base; let i = 1;
  while (taken.has(cand) || !validUsername(cand)) { i += 1; cand = `${base}${i}`.slice(0, 24); if (i > 500) { cand = `user${Date.now() % 1e8}`; break; } }
  return cand;
}
async function findUserByPhone(phone) {
  await init();
  const p = normalizePhone(phone);
  if (!p) return null;
  const all = await db.users.getAll();
  return all.find((u) => u.phone && normalizePhone(u.phone) === p) || null;
}
// Login identifier: an email address, or an Egyptian mobile number.
async function findUserByLogin(identifier) {
  const id = String(identifier || '').trim();
  if (id.includes('@') && !id.startsWith('@')) return findUserByEmail(id);
  return (await findUserByPhone(id)) || (await findUserByUsername(id)) || findUserByEmail(id);
}
async function setUserPassword(id, passwordHash) {
  await init();
  return db.users.update(id, { passwordHash });
}
async function findUserById(id) {
  await init();
  return db.users.getById(id);
}
function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}
async function createUser({ name, username, email, phone, passwordHash, role, city, lat, lng }) {
  await init();
  const user = {
    id: await db.nextId('usr'), name, ...(username ? { username: normalizeUsername(username) } : {}), email: email || '', ...(phone ? { phone: normalizePhone(phone) } : {}), passwordHash, role, city: city || '',
    ...(lat !== undefined && lng !== undefined ? { lat: Number(lat), lng: Number(lng) } : {}),
    createdAt: new Date().toISOString(),
  };
  return db.users.insert(user);
}

// Public marketplace is Luxor-only. Records for other cities (demo data) are kept, just hidden.
// Override with PUBLIC_CITIES="Luxor,Cairo" (comma separated) to show more.
const SUPPORTED_CITIES = ['Luxor', 'Esna', 'Qena', 'Aswan'];
const canonicalCity = (c) => SUPPORTED_CITIES.find((x) => x.toLowerCase() === String(c || '').trim().toLowerCase()) || null;
const PUBLIC_CITIES = (process.env.PUBLIC_CITIES || SUPPORTED_CITIES.join(',')).split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
const isPublicCity = (t) => PUBLIC_CITIES.includes(String(t.city || '').toLowerCase()) && t.approved !== false;

// ---- professions ----
async function listProfessions() {
  await init();
  const techs = (await db.technicians.getAll()).filter(isPublicCity);
  return seed.PROFESSIONS.map((p) => ({
    ...p,
    technicianCount: techs.filter((t) => t.profession === p.id).length,
  }));
}
async function listCities() {
  await init();
  // Fixed list of served cities (empty ones included: customers see an honest empty state).
  return PUBLIC_CITIES.map((c) => canonicalCity(c)).filter(Boolean);
}

// ---- geo ----
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---- technicians ----
async function searchTechnicians({ profession, city, search, minRating, lat, lng } = {}) {
  await init();
  let out = (await db.technicians.getAll()).filter((t) => t.addressActive !== false && isPublicCity(t));
  if (profession) out = out.filter((t) => t.profession === profession);
  if (city) out = out.filter((t) => t.city.toLowerCase() === String(city).toLowerCase());
  if (minRating) out = out.filter((t) => t.rating >= Number(minRating));
  if (search) {
    const q = String(search).toLowerCase();
    out = out.filter((t) => t.name.toLowerCase().includes(q) || t.bio.toLowerCase().includes(q));
  }
  const hasGeo = lat !== undefined && lng !== undefined && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));
  if (hasGeo) {
    out = out.map((t) => ({
      ...t,
      distanceKm: Math.round(haversineKm(Number(lat), Number(lng), t.lat, t.lng) * 10) / 10,
    }));
    out.sort((a, b) => a.distanceKm - b.distanceKm || b.rating - a.rating);
  } else {
    out.sort((a, b) => b.rating - a.rating);
  }
  return out;
}

async function allReviews(t) {
  const bookings = await db.bookings.getAll();
  const real = [];
  for (const b of bookings.filter((x) => x.technicianId === t.id && x.review)) {
    const c = await findUserById(b.clientId);
    real.push({
      clientName: c ? c.name : 'Client',
      comment: b.review.comment, commentAr: b.review.commentAr || '',
      rating: b.review.rating, createdAt: b.review.createdAt,
    });
  }
  return [...real, ...(t.reviews || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Market price band per profession (EGP/hour, Luxor = Cairo market -15%). Hard cap, soft floor.
const priceBand = (profession) => seed.PROFESSIONS.find((p) => p.id === profession) || null;
function assertRateWithinCap(profession, rate) {
  const b = priceBand(profession);
  if (!b || !Number.isFinite(Number(rate))) return;
  if (Number(rate) > b.priceMax) {
    throw ApiError.badRequest(`Hourly rate is above the market limit for this service (max ${b.priceMax} EGP). Please lower it.`);
  }
}

async function publicTechnician(t, { owner = false, withReviews = false } = {}) {
  if (!t) return null;
  const { phone, reviews, workPhotos, settlementClaim, idStatus, ...rest } = t;
  const out = { ...rest, ...(owner ? { idStatus: idStatus || 'none' } : {}), verified: t.verified === true, phone: owner || t.phonePublic ? phone : null };
  const band = priceBand(t.profession);
  if (band) {
    out.priceMin = band.priceMin; out.priceMax = band.priceMax;
    out.priceStatus = t.hourlyRate > band.priceMax ? 'above' : t.hourlyRate < band.priceMin ? 'below' : 'within';
  }
  // Work photos are heavy: only on the profile page and the owner's dashboard.
  if (withReviews || owner) out.workPhotos = workPhotos || [];
  else out.workPhotoCount = (workPhotos || []).length;
  const all = await allReviews(t);
  out.reviewCount = all.length;
  if (withReviews) out.reviews = all;
  return out;
}

async function findTechnicianById(id) {
  await init();
  return db.technicians.getById(id);
}
async function findTechnicianByUserId(userId) {
  await init();
  const all = await db.technicians.getAll();
  return all.find((t) => t.userId === userId) || null;
}
async function createTechnicianProfile(user, { profession, city, district, yearsExperience = 0, hourlyRate = 0, bio = '', bioAr = '', lat, lng, phone = '', phonePublic = false, address = '', addressActive = true }) {
  await init();
  const cityKey = canonicalCity(city || user.city);
  if (!cityKey) throw ApiError.badRequest('Please choose your city: Luxor, Esna, Qena or Aswan');
  city = cityKey;
  assertRateWithinCap(profession, hourlyRate);
  const fallback = seed.CITY_COORDS[city || user.city] || {};
  const t = {
    id: await db.nextId('tec'), userId: user.id, name: user.name, profession,
    city: city || user.city || '', district: district || '',
    yearsExperience: Number(yearsExperience) || 0, hourlyRate: Number(hourlyRate) || 0,
    rating: 0, jobsDone: 0, bio, bioAr,
    phone: String(phone || ''), phonePublic: phonePublic === true || phonePublic === 'true',
    address: String(address || ''), addressActive: addressActive !== false && addressActive !== 'false',
    reviews: [],
    approved: false, // new technicians appear publicly only after an admin approves them
    lat: lat !== undefined ? Number(lat) : fallback.lat,
    lng: lng !== undefined ? Number(lng) : fallback.lng,
  };
  const saved = await db.technicians.insert(t);
  for (const a of (await db.users.getAll()).filter((u) => u.role === 'admin')) {
    await notify(a.id, { type: 'tech_pending', link: '/admin', titleAr: 'فني جديد في انتظار الاعتماد', titleEn: 'New technician awaiting approval', bodyAr: `${user.name} (${city})`, bodyEn: `${user.name} (${city})` });
  }
  return saved;
}
const imageSigOk = require('../utils/imageSig');
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const PHOTO_MAX = 120000;
const WORK_PHOTO_MAX = 300000;
const WORK_PHOTOS_MAX = 6;
function cleanImage(v, max) {
  if (v === '' || v === null) return '';
  if (typeof v !== 'string' || v.length > max || !IMG_RE.test(v) || !imageSigOk(v)) throw ApiError.badRequest('Invalid or too large image (JPEG/PNG/WebP only)');
  return v;
}
async function updateTechnicianProfile(id, patch) {
  await init();
  const allowed = ['city', 'district', 'yearsExperience', 'hourlyRate', 'bio', 'bioAr', 'profession', 'lat', 'lng', 'phone', 'phonePublic', 'address', 'addressActive'];
  const clean = {};
  for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k];
  // Hard cap on the hourly rate. Only checked when the rate or profession changes,
  // so an unrelated profile edit is never blocked by an older out-of-range rate.
  if (clean.hourlyRate !== undefined || clean.profession !== undefined) {
    const cur = await db.technicians.getById(id);
    const prof = clean.profession !== undefined ? clean.profession : cur.profession;
    const rate = clean.hourlyRate !== undefined ? clean.hourlyRate : cur.hourlyRate;
    assertRateWithinCap(prof, rate);
  }
  // Photos (resized to JPEG data URLs by the browser). 'verified' is admin-only and never accepted here.
  if (patch.photo !== undefined) clean.photo = cleanImage(patch.photo, PHOTO_MAX);
  if (patch.workPhotos !== undefined) {
    if (!Array.isArray(patch.workPhotos) || patch.workPhotos.length > WORK_PHOTOS_MAX) throw ApiError.badRequest(`At most ${WORK_PHOTOS_MAX} work photos`);
    clean.workPhotos = patch.workPhotos.map((p) => cleanImage(p, WORK_PHOTO_MAX)).filter(Boolean);
  }
  return db.technicians.update(id, clean);
}

// ---- bookings ----

// "Nearest available technician": one request goes to the 3 closest technicians of the category.
// Those who accept become price offers; the customer picks one (see chooseNearestOffer).
const NEAREST_MAX_KM = 50;
async function createNearestRequest({ clientId, profession, city, date, description, address, clientLat, clientLng }) {
  await init();
  let cands = (await db.technicians.getAll()).filter((t) => t.profession === profession && t.addressActive !== false && isPublicCity(t));
  const hasGeo = clientLat !== undefined && clientLng !== undefined && clientLat !== '' && Number.isFinite(Number(clientLat)) && Number.isFinite(Number(clientLng));
  if (hasGeo) {
    cands = cands
      .map((t) => ({ t, d: haversineKm(Number(clientLat), Number(clientLng), t.lat, t.lng) }))
      .filter((x) => Number.isFinite(x.d) && x.d <= NEAREST_MAX_KM)
      .sort((a, b) => a.d - b.d || (b.t.rating || 0) - (a.t.rating || 0)).map((x) => x.t);
  } else {
    const c = canonicalCity(city);
    if (!c) throw ApiError.badRequest('Share your location or choose your city');
    cands = cands.filter((t) => t.city === c).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }
  const open = [];
  for (const t of cands) if (!(await isTechnicianBlocked(t))) open.push(t);
  cands = open.slice(0, 3);
  if (!cands.length) throw ApiError.notFound('No technician available near you for this service yet');
  const dispatchId = await db.nextId('dsp');
  const made = [];
  for (const t of cands) {
    made.push(await createBooking({ clientId, technicianId: t.id, date, description, address, clientLat: hasGeo ? clientLat : undefined, clientLng: hasGeo ? clientLng : undefined, dispatchId, nearest: true }));
  }
  return { booking: await hydrateBooking(made[0]), notified: made.length };
}
async function withdrawDispatchSiblings(booking, reasonAr, reasonEn, statuses = ['pending']) {
  if (!booking.dispatchId) return;
  const all = await db.bookings.getAll();
  for (const b of all.filter((x) => x.dispatchId === booking.dispatchId && x.id !== booking.id && statuses.includes(x.status))) {
    await db.bookings.update(b.id, { status: 'cancelled', superseded: true });
    await notify(await techUserId(b.technicianId), { type: 'booking_taken', bookingId: b.id, link: '/pro', titleAr: reasonAr, titleEn: reasonEn, bodyAr: '', bodyEn: '' });
  }
}
// One entry per nearest-request for the client. Before the customer chooses, the entry carries the
// price offers (technicians who accepted); after the choice only the chosen booking remains.
async function collapseDispatch(rows) {
  const groups = new Map();
  for (const r of rows) if (r.dispatchId) { if (!groups.has(r.dispatchId)) groups.set(r.dispatchId, []); groups.get(r.dispatchId).push(r); }
  const hide = new Set();
  const extra = new Map();
  for (const g of groups.values()) {
    const live = g.filter((r) => !r.superseded);
    const chosen = live.find((r) => r.chosen);
    if (chosen) { for (const r of g) if (r !== chosen) hide.add(r); continue; }
    const pick = live.find((r) => r.status === 'accepted') || live.find((r) => r.status === 'pending') || live[0] || g[0];
    for (const r of g) if (r !== pick) hide.add(r);
    const offers = [];
    for (const r of live.filter((x) => x.status === 'accepted')) {
      const t = await findTechnicianById(r.technicianId);
      if (!t) continue;
      const hasGeo = r.clientLat !== undefined && r.clientLng !== undefined && Number.isFinite(Number(t.lat));
      offers.push({ bookingId: r.id, technicianId: t.id, name: t.name, hourlyRate: t.hourlyRate, rating: t.rating || 0, jobsDone: t.jobsDone || 0,
        distanceKm: hasGeo ? Math.round(haversineKm(Number(r.clientLat), Number(r.clientLng), t.lat, t.lng) * 10) / 10 : undefined });
    }
    offers.sort((a, b) => a.hourlyRate - b.hourlyRate);
    const waiting = live.filter((x) => x.status === 'pending').length;
    if (['pending', 'accepted'].includes(pick.status)) extra.set(pick, { technicianName: 'أقرب فني متاح', nearestPending: true, offers, waiting });
  }
  return rows.filter((r) => !hide.has(r)).map((r) => (extra.has(r) ? { ...r, ...extra.get(r) } : (r.dispatchId && !r.chosen ? { ...r, technicianName: 'أقرب فني متاح' } : r)));
}
// Customer picks one offer: it becomes the job, every other request of the group is withdrawn.
async function chooseNearestOffer(booking) {
  await init();
  if (!booking.dispatchId) throw ApiError.badRequest('Not a nearest-technician request');
  if (booking.status !== 'accepted') throw ApiError.badRequest('This technician has not accepted yet');
  if (booking.superseded) throw ApiError.badRequest('This offer is no longer available');
  const all = await db.bookings.getAll();
  if (all.some((x) => x.dispatchId === booking.dispatchId && x.chosen)) throw ApiError.conflict('A technician was already chosen');
  const updated = await db.bookings.update(booking.id, { chosen: true });
  await withdrawDispatchSiblings(booking, 'العميل اختار فني تاني', 'The client chose another technician', ['pending', 'accepted']);
  await notify(await techUserId(booking.technicianId), { type: 'booking_chosen', bookingId: booking.id, link: '/pro', titleAr: 'العميل اختارك ✅', titleEn: 'The client chose you ✅', bodyAr: 'تقدر تبدأ الشغل. رقمك وموقعك ظاهرين للعميل في الطلب ده عشان يعرف هتوصله امتى.', bodyEn: 'You can start the job. Your phone and location are visible to this client for this job so they can estimate your arrival.' });
  return updated;
}

// ---- in-app notifications (stored per user; the app polls and shows toasts) ----
async function notify(userId, n) {
  try {
    if (!userId) return null;
    await init();
    const id = await db.nextId('ntf');
    return await db.notifications.insert({
      id, userId, type: n.type || 'info', bookingId: n.bookingId || '', invoiceId: n.invoiceId || '',
      titleAr: n.titleAr, titleEn: n.titleEn, bodyAr: n.bodyAr || '', bodyEn: n.bodyEn || '',
      link: n.link || '', read: false, createdAt: new Date().toISOString(),
    });
  } catch (err) { console.error('notify failed', err.message); return null; }
}
async function techUserId(technicianId) {
  const t = await findTechnicianById(technicianId);
  return t ? t.userId : null;
}
async function notificationsFor(userId, limit = 30) {
  await init();
  const all = (await db.notifications.getAll()).filter((n) => n.userId === userId);
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { notifications: all.slice(0, limit), unread: all.filter((n) => !n.read).length };
}
async function markNotificationsRead(userId, ids) {
  await init();
  const all = (await db.notifications.getAll()).filter((n) => n.userId === userId && !n.read && (!ids || ids.includes(n.id)));
  for (const n of all) await db.notifications.update(n.id, { read: true });
  return all.length;
}
async function notifyPaid(invoice) {
  const inv = invoice;
  // Paid = completed: payment is the completion indicator for a job.
  const bk = inv.bookingId ? await findBookingById(inv.bookingId) : null;
  if (bk && ['accepted', 'in_progress', 'awaiting_confirmation'].includes(bk.status)) await setBookingStatus(bk, 'completed', { completedBy: 'payment' });
  await syncReceivables();
  await notify(inv.clientId, { type: 'paid', bookingId: inv.bookingId, invoiceId: inv.id, link: '/dashboard',
    titleAr: 'تم تسجيل الدفع ✅', titleEn: 'Payment recorded ✅',
    bodyAr: `فاتورة ${inv.number} اتدفعت. شكراً لاستخدامك FIX-IT.`, bodyEn: `Invoice ${inv.number} is paid. Thank you for using FIX-IT.` });
  await notify(await techUserId(inv.technicianId), { type: 'paid', bookingId: inv.bookingId, invoiceId: inv.id, link: '/pro',
    titleAr: 'استلمت دفعة جديدة 💰', titleEn: 'Payment received 💰',
    bodyAr: `فاتورة ${inv.number} اتدفعت.`, bodyEn: `Invoice ${inv.number} was paid.` });
}

async function createBooking({ clientId, technicianId, date, description, descriptionAr = '', address, clientLat, clientLng, dispatchId, nearest }) {
  await init();
  const b = {
    id: await db.nextId('bkg'), clientId, technicianId, date, description, descriptionAr, address,
    ...(clientLat !== undefined && clientLng !== undefined
      ? { clientLat: Number(clientLat), clientLng: Number(clientLng) }
      : {}),
    status: 'pending', createdAt: new Date().toISOString(), review: null,
    ...(dispatchId ? { dispatchId, nearest: nearest === true } : {}),
  };
  const saved = await db.bookings.insert(b);
  const client = await findUserById(clientId);
  await notify(await techUserId(technicianId), { type: 'booking_new', bookingId: saved.id, link: '/pro',
    titleAr: 'طلب جديد 🔔', titleEn: 'New request 🔔',
    bodyAr: `${client ? client.name : 'عميل'} طلب خدمتك: ${String(description).slice(0, 60)}`,
    bodyEn: `${client ? client.name : 'A client'} requested you: ${String(description).slice(0, 60)}` });
  return saved;
}
async function findBookingById(id) {
  await init();
  return db.bookings.getById(id);
}
// Proof photos are heavy and sensitive: list payloads carry only a count, photos load via getBookingProof.
function stripProof(b) {
  if (!b) return b;
  const { proofPhotos, ...rest } = b;
  return { ...rest, proofCount: (proofPhotos || []).length };
}
async function getBookingProof(booking) {
  await init();
  const b = await db.bookings.getById(booking.id);
  return { photos: (b && b.proofPhotos) || [], at: (b && b.proofAt) || null };
}
async function hydrateBooking(b) {
  const tech = await findTechnicianById(b.technicianId);
  const client = await findUserById(b.clientId);
  const profession = seed.PROFESSIONS.find((p) => p.id === (tech && tech.profession));
  return {
    ...stripProof(b),
    technicianName: tech ? tech.name : 'Unknown',
    profession: profession ? profession.name : '',
    professionAr: profession ? profession.nameAr : '',
    clientName: client ? client.name : 'Unknown',
  };
}
// Once the customer has selected a technician (nearest flow: the chosen offer; direct booking: the technician accepted) and the job is
// active, that technician's phone and location are shown to that customer for this job only, whatever phonePublic says. Only real stored
// values are returned; missing ones stay out. The customer's own phone is never part of any technician payload.
const CONTACT_STATUSES = ['accepted', 'in_progress', 'awaiting_confirmation'];
async function technicianContactFor(b) {
  if (!CONTACT_STATUSES.includes(b.status) || b.superseded || (b.dispatchId && !b.chosen)) return null;
  const t = await findTechnicianById(b.technicianId);
  if (!t) return null;
  const u = await findUserById(t.userId);
  const phone = String(t.phone || (u && u.phone) || '').trim();
  const lat = Number(t.lat), lng = Number(t.lng);
  const hasLoc = t.lat !== undefined && t.lat !== null && t.lat !== '' && Number.isFinite(lat) && Number.isFinite(lng);
  const hasClient = b.clientLat !== undefined && b.clientLat !== null && b.clientLat !== '' && Number.isFinite(Number(b.clientLat)) && Number.isFinite(Number(b.clientLng));
  const out = {};
  if (phone) out.phone = phone;
  if (t.address) out.address = t.address;
  if (hasLoc) { out.lat = lat; out.lng = lng; if (hasClient) out.distanceKm = Math.round(haversineKm(Number(b.clientLat), Number(b.clientLng), lat, lng) * 10) / 10; }
  return Object.keys(out).length ? out : null;
}
async function bookingsForClient(clientId) {
  await init();
  await sweepAutoConfirm();
  const all = await db.bookings.getAll();
  const rows = [];
  for (const b of all.filter((x) => x.clientId === clientId)) rows.push({ ...(await hydrateBooking(b)), technicianContact: await technicianContactFor(b) });
  return (await collapseDispatch(rows)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function bookingsForTechnician(userId) {
  await sweepAutoConfirm();
  const tech = await findTechnicianByUserId(userId);
  if (!tech) return [];
  const all = await db.bookings.getAll();
  const rows = [];
  for (const b of all.filter((x) => x.technicianId === tech.id && !x.superseded)) rows.push(await hydrateBooking(b));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Customer pays the job price plus a 6% service fee on that price. The fee item carries its rate so old invoices
// (flat 25 EGP fee, no rate) keep their meaning and are never recalculated.
const clientFee = (jobAmount) => Math.round(Number(jobAmount) * seed.CLIENT_FEE_RATE * 100) / 100;
async function createInvoiceForBooking(booking) {
  const existing = (await db.invoices.getAll()).find((i) => i.bookingId === booking.id);
  const tech = await findTechnicianById(booking.technicianId);
  const prof = seed.PROFESSIONS.find((p) => p.id === (tech && tech.profession));
  const jobAmount = booking.finalAmount || (tech ? tech.hourlyRate : 0);
  if (existing) {
    // Reopened and finished again: refresh the amount while still unpaid. Anything else is left alone.
    if (existing.status !== 'unpaid') return null;
    const old = existing.items[1];
    const feeItem = old && old.rate ? { ...old, amount: clientFee(jobAmount) } : { label: 'FIX-IT service fee (6%)', labelAr: 'رسوم خدمة FIX-IT (٦٪)', amount: clientFee(jobAmount), rate: seed.CLIENT_FEE_RATE };
    const items = [{ ...(existing.items[0] || {}), amount: jobAmount }, feeItem, ...existing.items.slice(2)];
    return db.invoices.update(existing.id, { items, total: round2(jobAmount + feeItem.amount) });
  }
  const id = await db.nextId('inv');
  const num = Number(id.split('_')[1]);
  const invoice = {
    id, number: `INV-2026-${String(num).padStart(4, '0')}`,
    bookingId: booking.id, clientId: booking.clientId, technicianId: booking.technicianId,
    items: [
      { label: `${prof ? prof.name : 'Service'} visit`, labelAr: `زيارة ${prof ? prof.nameAr : 'فني'}`, amount: jobAmount },
      { label: 'FIX-IT service fee (6%)', labelAr: 'رسوم خدمة FIX-IT (٦٪)', amount: clientFee(jobAmount), rate: seed.CLIENT_FEE_RATE },
    ],
    total: round2(jobAmount + clientFee(jobAmount)),
    method: null, status: 'unpaid',
    cardLast4: null, mobileNumber: null, confirmationCode: null, verificationCode: null,
    paidAt: null, createdAt: new Date().toISOString(),
  };
  return db.invoices.insert(invoice);
}

// Technician reports the job as done with the final amount; must be inside the market cap.
const PROOF_MAX = 250000;
const PROOF_PHOTOS_MAX = 6;
async function submitFinalAmount(booking, amount, photos) {
  await init();
  let proof = [];
  if (photos !== undefined && photos !== null) {
    if (!Array.isArray(photos) || photos.length > PROOF_PHOTOS_MAX) throw ApiError.badRequest(`Up to ${PROOF_PHOTOS_MAX} photos`);
    proof = photos.map((p) => cleanImage(p, PROOF_MAX)).filter(Boolean);
  }
  const tech = await findTechnicianById(booking.technicianId);
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) throw ApiError.badRequest('Enter the final amount in EGP');
  const band = priceBand(tech && tech.profession);
  if (band && a > band.priceMax * 5) throw ApiError.badRequest(`Final amount is above the market limit for this service (max ${band.priceMax * 5} EGP per job)`);
  const extra = { finalAmount: Math.round(a) };
  if (proof.length) {
    // Evidence is append-only: a re-submit after the customer reopened keeps the earlier photos.
    extra.proofPhotos = [...(booking.proofPhotos || []), ...proof].slice(-PROOF_PHOTOS_MAX);
    extra.proofAt = new Date().toISOString();
  }
  return stripProof(await setBookingStatus(booking, 'awaiting_confirmation', extra));
}
// Confirm automatically when the client has not answered within 48h. Safe to call often.
const NEAREST_TIMEOUT_MS = 30 * 60 * 1000;
// A nearest request nobody accepted within 30 minutes is closed and the customer is told.
async function sweepNearestExpiry() {
  const now = Date.now();
  const all = await db.bookings.getAll();
  const groups = new Map();
  for (const b of all) if (b.dispatchId) { if (!groups.has(b.dispatchId)) groups.set(b.dispatchId, []); groups.get(b.dispatchId).push(b); }
  for (const g of groups.values()) {
    const live = g.filter((b) => !b.superseded);
    if (live.some((b) => b.chosen || !['pending', 'declined'].includes(b.status))) continue; // answered, chosen or closed
    const pending = live.filter((b) => b.status === 'pending');
    if (!pending.length) continue;
    if (now - Date.parse(pending[0].createdAt) < NEAREST_TIMEOUT_MS) continue;
    for (const b of pending) {
      await db.bookings.update(b.id, { status: 'cancelled', expired: true });
      await notify(await techUserId(b.technicianId), { type: 'booking_expired', bookingId: b.id, link: '/pro', titleAr: 'انتهى وقت الطلب', titleEn: 'Request expired', bodyAr: '', bodyEn: '' });
    }
    await notify(pending[0].clientId, { type: 'nearest_expired', bookingId: pending[0].id, link: '/request-nearest',
      titleAr: 'مفيش فني رد على طلبك', titleEn: 'No technician replied to your request',
      bodyAr: 'جرّب تبعت الطلب تاني أو اختار فني من القايمة.', bodyEn: 'Try again or pick a technician from the list.' });
  }
}
async function sweepAutoConfirm() {
  await init();
  await sweepNearestExpiry();
  // A job is completed when its invoice is paid (never by timeout). Backfill an invoice for
  // any finished job that does not have one yet, so the customer always has something to pay.
  const all = await db.bookings.getAll();
  const have = new Set((await db.invoices.getAll()).map((i) => i.bookingId));
  let n = 0;
  for (const b of all) {
    if (b.status === 'awaiting_confirmation' && !have.has(b.id)) { await createInvoiceForBooking(b); n += 1; }
  }
  await sweepCashConfirmations();
  return n;
}

// The technician never confirms cash: remind him (3h, 24h); at 48h ask the customer "did he collect his money?".
// Customer yes, or no answer for 24h -> the job completes as cash-paid and the commission accrues.
// Customer no -> the job stays open and the admin is told to step in.
const CASH_REMIND_1_H = 3; const CASH_REMIND_2_H = 24; const CASH_ASK_H = 48; const CASH_ASK_GRACE_H = 24;
async function sweepCashConfirmations() {
  const H = 3600e3; const now = Date.now();
  const invoices = await db.invoices.getAll();
  for (const b of await db.bookings.getAll()) {
    if (b.status !== 'awaiting_confirmation' || !b.awaitingSince) continue;
    const inv = invoices.find((i) => i.bookingId === b.id);
    if (!inv || inv.status === 'paid') continue;
    const age = now - Date.parse(b.awaitingSince);
    if (!Number.isFinite(age)) continue;
    const tuid = await techUserId(b.technicianId);
    const remind = (field, at) => notify(tuid, { type: 'cash_reminder', bookingId: b.id, invoiceId: inv.id, link: '/pro',
      titleAr: 'أكّد استلام فلوس الشغلانة 💰', titleEn: 'Confirm you received the cash 💰',
      bodyAr: `فاتورة ${inv.number} (${inv.total} جنيه) لسه متأكدتش. لو استلمت الفلوس اضغط تأكيد الاستلام عشان الشغلانة تتقفل.`,
      bodyEn: `Invoice ${inv.number} (${inv.total} EGP) is not confirmed yet. If you were paid, confirm receipt so the job can close.` }).then(() => db.bookings.update(b.id, { [field]: at }));
    if (!b.remind1At && age >= CASH_REMIND_1_H * H) { await remind('remind1At', new Date().toISOString()); continue; }
    if (!b.remind2At && b.remind1At && age >= CASH_REMIND_2_H * H) { await remind('remind2At', new Date().toISOString()); continue; }
    if (!b.cashAskedAt && age >= CASH_ASK_H * H) {
      await notify(b.clientId, { type: 'cash_check', bookingId: b.id, invoiceId: inv.id, link: '/dashboard',
        titleAr: 'الفني قبض فلوسه؟', titleEn: 'Did the technician collect his money?',
        bodyAr: `الفني خلّص الشغلانة وفاتورتها ${inv.total} جنيه. افتح لوحتك وقول لو دفعت له. لو مردّيتش هنقفل الشغلانة كمدفوعة.`,
        bodyEn: `The technician finished the job (invoice ${inv.total} EGP). Open your dashboard and tell us if you paid him. If you do not answer, we will close it as paid.` });
      await db.bookings.update(b.id, { cashAskedAt: new Date().toISOString() });
      continue;
    }
    if (b.cashAskedAt && !b.cashAnswer && now - Date.parse(b.cashAskedAt) >= CASH_ASK_GRACE_H * H) await autoCompleteCash(b, inv, 'no-response');
  }
}
async function autoCompleteCash(b, inv, why) {
  await db.bookings.update(b.id, { cashAnswer: why === 'client-yes' ? 'yes' : 'no-response', cashAnsweredAt: new Date().toISOString() });
  await db.invoices.update(inv.id, { method: 'cash', autoCompleted: why });
  const fresh = await db.invoices.getById(inv.id);
  await confirmInvoice(fresh);
}
// The customer answers the "did the technician collect his money?" question.
async function clientCashAnswer(bookingId, clientId, collected) {
  await init();
  const b = await findBookingById(bookingId);
  if (!b || b.clientId !== clientId) throw ApiError.notFound('Booking not found');
  if (b.status !== 'awaiting_confirmation' || !b.cashAskedAt) throw ApiError.badRequest('Nothing to confirm for this booking');
  if (b.cashAnswer) throw ApiError.conflict('Already answered');
  const inv = (await db.invoices.getAll()).find((i) => i.bookingId === b.id);
  if (!inv || inv.status === 'paid') throw ApiError.badRequest('Invoice is already paid');
  if (collected) { await autoCompleteCash(b, inv, 'client-yes'); return { completed: true }; }
  await db.bookings.update(b.id, { cashAnswer: 'no', cashAnsweredAt: new Date().toISOString() });
  for (const a of (await db.users.getAll()).filter((u) => u.role === 'admin')) {
    await notify(a.id, { type: 'cash_dispute', bookingId: b.id, invoiceId: inv.id, link: '/admin',
      titleAr: 'عميل بيقول إنه مدفعش للفني ⚠️', titleEn: 'Customer says he did not pay the technician ⚠️',
      bodyAr: `الحجز ${b.id} / فاتورة ${inv.number}: العميل قال إن الفني ما قبضش. اتدخل وراجع الطرفين.`, bodyEn: `Booking ${b.id} / invoice ${inv.number}: the customer says the technician was not paid. Please step in.` });
  }
  return { completed: false };
}

// ---- admin digest: one summary for every 10 completed jobs (Telegram bot + in-app toast) ----
const DIGEST_EVERY = 10;
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN; const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }),
    });
    return r.ok;
  } catch (err) { console.error('telegram failed', err.message); return false; }
}
let digestBusy = false;
async function adminDigestIfDue() {
  if (digestBusy) return;
  digestBusy = true;
  try {
    const all = await db.bookings.getAll();
    const batch = all.filter((b) => b.status === 'completed' && !b.digested);
    if (batch.length < DIGEST_EVERY) return;
    const slice = batch.slice(0, DIGEST_EVERY);
    const invoices = await db.invoices.getAll();
    let total = 0; let paid = 0;
    const lines = [];
    for (const b of slice) {
      const inv = invoices.find((i) => i.bookingId === b.id);
      const amt = inv ? commissionBase(inv) : (b.finalAmount || 0);
      total += amt; if (inv && inv.status === 'paid') paid += 1;
      lines.push(`- ${b.id}: ${amt} EGP${inv && inv.status === 'paid' ? ' (paid)' : ''}`);
    }
    const text = `FIX-IT: ${DIGEST_EVERY} completed jobs\nملخص ${DIGEST_EVERY} عمليات مكتملة\nإجمالي الشغل: ${total} جنيه\nعمولة ${COMMISSION_RATE * 100}%: ${round2(total * COMMISSION_RATE)} جنيه\nمدفوع: ${paid}/${DIGEST_EVERY}\n${lines.join('\n')}`;
    const sent = await sendTelegram(text);
    if (!sent) return; // not configured or failed: keep the batch and retry on the next completion
    const admins = (await db.users.getAll()).filter((u) => u.role === 'admin');
    for (const a of admins) {
      await notify(a.id, { type: 'admin_digest', link: '/admin', titleAr: `${DIGEST_EVERY} عمليات اكتملت`, titleEn: `${DIGEST_EVERY} jobs completed`,
        bodyAr: `إجمالي ${total} جنيه، العمولة ${round2(total * COMMISSION_RATE)} جنيه`, bodyEn: `Total ${total} EGP, commission ${round2(total * COMMISSION_RATE)} EGP` });
    }
    for (const b of slice) await db.bookings.update(b.id, { digested: true });
  } catch (err) { console.error('digest failed', err.message); } finally { digestBusy = false; }
}

async function setBookingStatus(booking, status, extra = {}) {
  await init();
  const patch = { status, ...extra };
  if (status === 'in_progress' && !booking.startedAt) patch.startedAt = new Date().toISOString();
  if (status === 'awaiting_confirmation') patch.awaitingSince = new Date().toISOString();
  if (status === 'completed') patch.completedAt = new Date().toISOString();
  const updated = await db.bookings.update(booking.id, patch);
  if (status === 'cancelled') await withdrawDispatchSiblings(booking, 'العميل لغى الطلب', 'Client cancelled the request', ['pending', 'accepted']);
  if (status === 'awaiting_confirmation') await createInvoiceForBooking(updated);
  if (status === 'completed') {
    const tech = await findTechnicianById(booking.technicianId);
    if (tech) await db.technicians.update(tech.id, { jobsDone: (tech.jobsDone || 0) + 1 });
    await createInvoiceForBooking(updated);
    const admins = (await db.users.getAll()).filter((u) => u.role === 'admin');
    for (const a of admins) {
      await notify(a.id, { type: 'job_completed', bookingId: booking.id, link: '/admin', titleAr: 'عملية اكتملت ✅', titleEn: 'A job was completed ✅',
        bodyAr: `الطلب ${booking.id} اتدفع واكتمل.`, bodyEn: `Booking ${booking.id} was paid and completed.` });
    }
    await adminDigestIfDue();
  }
  const msgs = {
    accepted: ['الفني قبل طلبك ✅', 'Technician accepted your request ✅', 'الفني هيتواصل معاك لتأكيد الميعاد.', 'The technician will contact you to confirm the time.'],
    declined: ['الفني اعتذر عن الطلب', 'Technician declined the request', 'ممكن تختار فني تاني من القايمة.', 'You can pick another technician.'],
    in_progress: ['الفني بدأ الشغل 🔧', 'The technician started the job 🔧', '', ''],
    awaiting_confirmation: ['الفني أنهى الشغل، الفاتورة جاهزة للدفع', 'Work finished, your invoice is ready to pay', 'راجع المبلغ النهائي وادفع من لوحة التحكم. الطلب بيكتمل أول ما الدفع يتسجل.', 'Review the final amount and pay from your dashboard. The job completes once payment is recorded.'],
    completed: ['الخدمة اكتملت ✅', 'Service completed ✅', 'التقييم اختياري، تقدر تقيّم الفني من لوحة التحكم.', 'Rating is optional, you can rate the technician from your dashboard.'],
  };
  if (msgs[status]) {
    const m = msgs[status];
    await notify(booking.clientId, { type: `booking_${status}`, bookingId: booking.id, link: '/dashboard', titleAr: m[0], titleEn: m[1], bodyAr: m[2], bodyEn: m[3] });
  } else if (status === 'cancelled') {
    await notify(await techUserId(booking.technicianId), { type: 'booking_cancelled', bookingId: booking.id, link: '/pro',
      titleAr: 'العميل لغى الطلب', titleEn: 'Client cancelled the request', bodyAr: '', bodyEn: '' });
  }
  return updated;
}

async function addReview(booking, { rating, comment, commentAr = '' }) {
  await init();
  const review = { rating: Number(rating), comment: comment || '', commentAr, createdAt: new Date().toISOString() };
  const updated = await db.bookings.update(booking.id, { review });
  const tech = await findTechnicianById(booking.technicianId);
  if (tech) {
    const all = await allReviews(tech);
    if (all.length) {
      const avg = all.reduce((s, r) => s + r.rating, 0) / all.length;
      await db.technicians.update(tech.id, { rating: Math.round(avg * 10) / 10 });
    }
  }
  await notify(tech && tech.userId, { type: 'review', bookingId: booking.id, link: '/pro',
    titleAr: 'تقييم جديد ⭐', titleEn: 'New review ⭐', bodyAr: `${review.rating} من 5`, bodyEn: `${review.rating} out of 5` });
  return updated;
}

// ---- invoices & payments (simulated) ----
function publicInvoice(inv) {
  if (!inv) return null;
  const { verificationCode, ...rest } = inv;
  return rest;
}
async function hydrateInvoice(inv) {
  const tech = await findTechnicianById(inv.technicianId);
  const client = await findUserById(inv.clientId);
  const booking = await findBookingById(inv.bookingId);
  const profession = seed.PROFESSIONS.find((p) => p.id === (tech && tech.profession));
  return {
    ...publicInvoice(inv),
    technicianName: tech ? tech.name : 'Unknown',
    clientName: client ? client.name : 'Unknown',
    profession: profession ? profession.name : '',
    professionAr: profession ? profession.nameAr : '',
    bookingDate: booking ? booking.date : '',
    bookingDescription: booking ? booking.description : '',
  };
}
async function findInvoiceById(id) {
  await init();
  return db.invoices.getById(id);
}
async function findInvoiceByBookingId(bookingId) {
  await init();
  const all = await db.invoices.getAll();
  return all.find((i) => i.bookingId === bookingId) || null;
}
async function invoicesForClient(clientId) {
  await init();
  const all = await db.invoices.getAll();
  const rows = [];
  for (const i of all.filter((x) => x.clientId === clientId)) rows.push(await hydrateInvoice(i));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function invoicesForTechnician(userId) {
  const tech = await findTechnicianByUserId(userId);
  if (!tech) return [];
  const all = await db.invoices.getAll();
  const rows = [];
  for (const i of all.filter((x) => x.technicianId === tech.id)) rows.push(await hydrateInvoice(i));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function allInvoices() {
  await init();
  const rows = [];
  for (const i of await db.invoices.getAll()) rows.push(await hydrateInvoice(i));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const code = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');

async function payInvoice(invoice, { method, mobileNumber, cardNumber }) {
  await init();
  if (!['unpaid', 'pending_online'].includes(invoice.status)) throw ApiError.conflict('Invoice is not awaiting payment');
  if (!['visa', 'cash', 'vodafone-cash'].includes(method)) throw ApiError.badRequest('Unknown payment method');
  // Simulated card / wallet flows never mark anything paid unless a demo flag is set explicitly.
  if (method !== 'cash' && process.env.ALLOW_SIMULATED_PAYMENTS !== '1') throw ApiError.badRequest('Online payment is not available yet. Choose cash.');
  // With a real gateway configured, the simulated card / wallet flows are off.
  if (method !== 'cash' && paymob.config().enabled) throw ApiError.badRequest('Use the secure online checkout to pay');
  const now = new Date().toISOString();
  if (method === 'visa') {
    const digits = String(cardNumber || '').replace(/\s/g, '');
    if (!/^\d{12,19}$/.test(digits)) throw ApiError.badRequest('Invalid card number');
    const updated = await db.invoices.update(invoice.id, {
      method, status: 'paid', cardLast4: digits.slice(-4),
      confirmationCode: `FX-${code(6)}`, paidAt: now,
    });
    await notifyPaid(updated);
    return { invoice: await hydrateInvoice(updated) };
  }
  if (method === 'vodafone-cash') {
    if (!/^01[0125][0-9]{8}$/.test(String(mobileNumber || ''))) {
      throw ApiError.badRequest('Enter a valid Egyptian mobile number (e.g. 01012345678)');
    }
    const verificationCode = code(4);
    const updated = await db.invoices.update(invoice.id, {
      method, status: 'pending_verification', mobileNumber: String(mobileNumber), verificationCode,
    });
    // Demo only: in production this code is sent by SMS; here we return it.
    return { invoice: await hydrateInvoice(updated), demoCode: verificationCode };
  }
  const updated = await db.invoices.update(invoice.id, { method, status: 'pending_cash' });
  await notify(await techUserId(invoice.technicianId), { type: 'cash_pending', bookingId: invoice.bookingId, invoiceId: invoice.id, link: '/pro',
    titleAr: 'العميل هيدفع كاش 💵', titleEn: 'Client will pay cash 💵',
    bodyAr: `فاتورة ${invoice.number}: أكّد الاستلام بعد ما تقبض.`, bodyEn: `Invoice ${invoice.number}: confirm once you are paid.` });
  return { invoice: await hydrateInvoice(updated) };
}

// ---- Paymob (real online payments) ----
// Start a hosted checkout for an unpaid invoice. Returns the URL to redirect to.
async function startPaymobPayment(invoice, user, { method = 'card', phone, appUrl }) {
  await init();
  if (!['unpaid', 'pending_online'].includes(invoice.status)) throw ApiError.conflict('Invoice is not awaiting payment');
  const it = await paymob.createIntention({ invoice, user, method, phone, appUrl });
  await db.invoices.update(invoice.id, {
    status: 'pending_online', method: method === 'wallet' ? 'wallet' : 'card',
    paymobRef: it.reference, paymobIntentionId: it.intentionId,
  });
  return { checkoutUrl: it.checkoutUrl };
}

// Apply a verified Paymob transaction result to its invoice. Idempotent.
// `reference` is "<invoiceId>-<attempt>"; the amount must match the invoice.
async function applyPaymobTransaction({ reference, transactionId, amountCents, success, sourceType, last4 }) {
  await init();
  if (!paymob.isLive()) return { status: 'ignored' }; // sandbox/test results never mark an order paid
  const invoiceId = String(reference || '').split('-')[0];
  const invoice = invoiceId ? await db.invoices.getById(invoiceId) : null;
  if (!invoice) throw ApiError.notFound('Invoice not found for this payment');
  if (invoice.status === 'paid') return { status: 'paid', invoice: await hydrateInvoice(invoice) };
  if (!success) {
    const back = invoice.status === 'pending_online' ? await db.invoices.update(invoice.id, { status: 'unpaid' }) : invoice;
    return { status: back.status, invoice: await hydrateInvoice(back) };
  }
  if (Number(amountCents) !== Math.round(invoice.total * 100)) throw ApiError.badRequest('Paid amount does not match the invoice');
  const updated = await db.invoices.update(invoice.id, {
    status: 'paid', method: sourceType === 'wallet' || invoice.method === 'wallet' ? 'wallet' : 'card',
    cardLast4: sourceType === 'card' ? String(last4 || '').slice(-4) || null : null,
    paymobTxnId: String(transactionId || ''),
    confirmationCode: `FX-${code(6)}`, paidAt: new Date().toISOString(),
  });
  await notifyPaid(updated);
  return { status: 'paid', invoice: await hydrateInvoice(updated) };
}

async function verifyInvoice(invoice, codeInput) {
  await init();
  if (process.env.ALLOW_SIMULATED_PAYMENTS !== '1') throw ApiError.badRequest('Online payment is not available yet.');
  if (invoice.status !== 'pending_verification') throw ApiError.badRequest('Invoice is not awaiting verification');
  if (String(codeInput) !== String(invoice.verificationCode)) throw ApiError.badRequest('Wrong verification code');
  const updated = await db.invoices.update(invoice.id, {
    status: 'paid', confirmationCode: `FX-${code(6)}`, verificationCode: null, paidAt: new Date().toISOString(),
  });
  await notifyPaid(updated);
  return hydrateInvoice(updated);
}

// Technician confirms cash received for his own invoice; admin can confirm any.
async function confirmInvoice(invoice) {
  await init();
  if (invoice.status === 'paid') throw ApiError.conflict('Invoice is already paid');
  const updated = await db.invoices.update(invoice.id, {
    status: 'paid', confirmationCode: `FX-${code(6)}`, verificationCode: null, paidAt: new Date().toISOString(),
  });
  await notifyPaid(updated);
  return hydrateInvoice(updated);
}

// ---- admin ----
async function listUsersAdmin() {
  await init();
  const users = await db.users.getAll();
  const techs = await db.technicians.getAll();
  return users
    .map((u) => {
      const t = techs.find((x) => x.userId === u.id);
      return {
        ...publicUser(u),
        technician: t
          ? { id: t.id, profession: t.profession, city: t.city, district: t.district, rating: t.rating, jobsDone: t.jobsDone, addressActive: t.addressActive }
          : null,
      };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
// ---- admin CRUD ----
const num = (v, name, { min = 0, max = Infinity, int = false } = {}) => {
  const n = Number(v);
  if (v === '' || v === null || Number.isNaN(n) || n < min || n > max || (int && !Number.isInteger(n))) {
    throw ApiError.badRequest(`${name} must be a number between ${min} and ${max === Infinity ? 'any' : max}`);
  }
  return n;
};
const text = (v, name, { max = 120, required = true } = {}) => {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (required && !s) throw ApiError.badRequest(`${name} is required`);
  if (s.length > max) throw ApiError.badRequest(`${name} is too long`);
  return s;
};
const assertProfession = (id) => {
  if (!seed.PROFESSIONS.some((p) => p.id === id)) throw ApiError.badRequest('Unknown profession');
};

async function adminListTechnicians() {
  await init();
  const techs = await db.technicians.getAll();
  const users = await db.users.getAll();
  return techs.map((t) => {
    const u = users.find((x) => x.id === t.userId);
    return { ...t, reviews: undefined, workPhotos: undefined, workPhotoCount: (t.workPhotos || []).length, verified: t.verified === true, email: u ? u.email : '', userPhone: u ? u.phone || '' : '', userActive: u ? u.active !== false : true };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
async function adminCreateTechnician(body, passwordHash) {
  await init();
  const name = text(body.name, 'name');
  const profession = text(body.profession, 'profession');
  assertProfession(profession);
  const city = text(body.city, 'city', { max: 60 });
  const email = text(body.email, 'email', { max: 120, required: false });
  const phoneIn = text(body.phone, 'phone', { max: 20, required: false });
  if (!email && !phoneIn) throw ApiError.badRequest('email or phone is required');
  if (phoneIn && !isEgPhone(phoneIn)) throw ApiError.badRequest('Enter a valid Egyptian mobile number (e.g. 01012345678)');
  if (phoneIn && (await findUserByPhone(phoneIn))) throw ApiError.conflict('Phone is already registered');
  const user = await createUser({ name, email, phone: phoneIn, passwordHash, role: 'technician', city });
  const t = await createTechnicianProfile(user, {
    profession, city, district: text(body.district, 'district', { max: 60, required: false }),
    yearsExperience: body.yearsExperience === undefined ? 0 : num(body.yearsExperience, 'yearsExperience', { max: 60 }),
    hourlyRate: body.hourlyRate === undefined ? 0 : num(body.hourlyRate, 'hourlyRate', { max: 100000 }),
    phone: phoneIn ? normalizePhone(phoneIn) : '',
    phonePublic: body.phonePublic === true,
  });
  await db.technicians.update(t.id, { approved: true }); // created by an admin: already vetted
  if (body.rating !== undefined && body.rating !== '') {
    return db.technicians.update(t.id, { approved: true, rating: Math.round(num(body.rating, 'rating', { min: 0, max: 5 }) * 10) / 10 });
  }
  return t;
}
async function adminUpdateTechnician(id, body) {
  await init();
  const tech = await db.technicians.getById(id);
  if (!tech) throw ApiError.notFound('Technician not found');
  const patch = {};
  if (body.name !== undefined) patch.name = text(body.name, 'name');
  if (body.profession !== undefined) { assertProfession(body.profession); patch.profession = body.profession; }
  if (body.city !== undefined) patch.city = text(body.city, 'city', { max: 60 });
  if (body.district !== undefined) patch.district = text(body.district, 'district', { max: 60, required: false });
  if (body.phone !== undefined) patch.phone = text(body.phone, 'phone', { max: 20, required: false });
  if (body.rating !== undefined) patch.rating = Math.round(num(body.rating, 'rating', { min: 0, max: 5 }) * 10) / 10;
  if (body.hourlyRate !== undefined) patch.hourlyRate = num(body.hourlyRate, 'hourlyRate', { max: 100000 });
  if (body.yearsExperience !== undefined) patch.yearsExperience = num(body.yearsExperience, 'yearsExperience', { max: 60 });
  if (body.addressActive !== undefined) patch.addressActive = body.addressActive === true;
  if (body.verified !== undefined) patch.verified = body.verified === true;
  if (body.approved !== undefined) patch.approved = body.approved === true;
  if (body.clearPhoto === true) patch.photo = '';
  if (!Object.keys(patch).length) throw ApiError.badRequest('Nothing to update');
  const updated = await db.technicians.update(id, patch);
  if (patch.approved === true && tech.approved === false) {
    await notify(tech.userId, { type: 'tech_approved', link: '/pro', titleAr: 'تم اعتماد حسابك ✅', titleEn: 'Your account was approved ✅', bodyAr: 'بروفايلك ظاهر دلوقتي للعملاء.', bodyEn: 'Your profile is now visible to customers.' });
  }
  if (patch.name && tech.userId) await db.users.update(tech.userId, { name: patch.name });
  return updated;
}
async function removeBookingCascade(bookingId) {
  const inv = (await db.invoices.getAll()).filter((i) => i.bookingId === bookingId);
  for (const i of inv) await db.invoices.remove(i.id);
  await db.bookings.remove(bookingId);
}
async function removeTechnicianCascade(tech) {
  for (const b of (await db.bookings.getAll()).filter((x) => x.technicianId === tech.id)) await removeBookingCascade(b.id);
  await db.technicians.remove(tech.id);
  if (db.idDocs) await db.idDocs.remove(tech.id);
}
async function adminDeleteTechnician(id) {
  await init();
  const tech = await db.technicians.getById(id);
  if (!tech) throw ApiError.notFound('Technician not found');
  await removeTechnicianCascade(tech);
  const u = tech.userId ? await db.users.getById(tech.userId) : null;
  if (u && u.role === 'technician') await db.users.remove(u.id);
  return true;
}
async function adminUpdateUser(id, body, actor) {
  await init();
  const user = await db.users.getById(id);
  if (!user) throw ApiError.notFound('User not found');
  const patch = {};
  if (body.name !== undefined) patch.name = text(body.name, 'name');
  if (body.city !== undefined) patch.city = text(body.city, 'city', { max: 60, required: false });
  if (body.role !== undefined) {
    if (!['client', 'technician', 'admin'].includes(body.role)) throw ApiError.badRequest('Invalid role');
    if (user.id === actor.id && body.role !== 'admin') throw ApiError.badRequest('You cannot change your own role');
    patch.role = body.role;
  }
  if (body.active !== undefined) {
    if (user.id === actor.id && body.active !== true) throw ApiError.badRequest('You cannot deactivate yourself');
    patch.active = body.active === true;
  }
  if (!Object.keys(patch).length) throw ApiError.badRequest('Nothing to update');
  const updated = await db.users.update(id, patch);
  const tech = await findTechnicianByUserId(id);
  if (tech) {
    const tp = {};
    if (patch.name) tp.name = patch.name;
    if (patch.active !== undefined) tp.addressActive = patch.active;
    if (Object.keys(tp).length) await db.technicians.update(tech.id, tp);
  }
  return publicUser(updated);
}
async function adminDeleteUser(id, actor) {
  await init();
  const user = await db.users.getById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.id === actor.id) throw ApiError.badRequest('You cannot delete your own account');
  const tech = await findTechnicianByUserId(id);
  if (tech) await removeTechnicianCascade(tech);
  for (const b of (await db.bookings.getAll()).filter((x) => x.clientId === id)) await removeBookingCascade(b.id);
  await db.users.remove(id);
  return true;
}
async function adminListBookings() {
  await init();
  const rows = [];
  for (const b of await db.bookings.getAll()) rows.push(await hydrateBooking(b));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function adminSetBookingStatus(id, status) {
  await init();
  if (!BOOKING_STATUS.includes(status)) throw ApiError.badRequest('Invalid status');
  const b = await db.bookings.getById(id);
  if (!b) throw ApiError.notFound('Booking not found');
  if (b.status === status) return hydrateBooking(b);
  return hydrateBooking(await setBookingStatus(b, status));
}
async function adminDeleteBooking(id) {
  await init();
  if (!(await db.bookings.getById(id))) throw ApiError.notFound('Booking not found');
  await removeBookingCascade(id);
  return true;
}
async function adminUpdateInvoice(id, body) {
  await init();
  const inv = await db.invoices.getById(id);
  if (!inv) throw ApiError.notFound('Invoice not found');
  const patch = {};
  if (body.items !== undefined) {
    if (!Array.isArray(body.items) || body.items.length !== (inv.items || []).length) throw ApiError.badRequest('items must match the invoice lines');
    patch.items = inv.items.map((it, i) => ({ label: it.label, labelAr: it.labelAr, amount: num(body.items[i], 'amount', { max: 1000000 }), ...(it.rate ? { rate: it.rate } : {}) }));
    patch.total = round2(patch.items.reduce((s, it) => s + it.amount, 0));
  } else if (body.total !== undefined) {
    patch.total = num(body.total, 'total', { max: 1000000 });
  }
  if (body.status !== undefined) {
    if (!['paid', 'unpaid'].includes(body.status)) throw ApiError.badRequest("status must be 'paid' or 'unpaid'");
    if (body.status === 'paid' && inv.status !== 'paid') {
      Object.assign(patch, { status: 'paid', confirmationCode: `FX-${code(6)}`, verificationCode: null, paidAt: new Date().toISOString() });
    } else if (body.status === 'unpaid' && inv.status !== 'unpaid') {
      Object.assign(patch, { status: 'unpaid', method: null, cardLast4: null, mobileNumber: null, confirmationCode: null, verificationCode: null, paidAt: null });
    }
  }
  if (body.commissionPaid !== undefined) {
    patch.commissionPaid = body.commissionPaid === true;
    patch.commissionPaidAt = body.commissionPaid === true ? new Date().toISOString() : null;
  }
  if (!Object.keys(patch).length) throw ApiError.badRequest('Nothing to update');
  return hydrateInvoice(await db.invoices.update(id, patch));
}
async function adminDeleteInvoice(id) {
  await init();
  if (!(await db.invoices.getById(id))) throw ApiError.notFound('Invoice not found');
  await db.invoices.remove(id);
  return true;
}

// ---- commission: 6% of the technician's job amount on every completed booking ----
// An invoice exists only once a booking is completed, so every invoice is one
// completed booking. Commission is collected when FIX-IT receives the money
// itself (Paymob online payment) or when the admin marks the cash commission
// as received from the technician. Everything else is outstanding.
const COMMISSION_RATE = 0.06;
const round2 = (n) => Math.round(n * 100) / 100;
const commissionBase = (inv) => Number(((inv.items || [])[0] || {}).amount) || 0;
// The 6% customer fee is collected in cash by the technician together with the job price, so it is owed to FIX-IT
// on top of his own 6% commission. Only invoices whose fee item carries a rate count (old flat-fee invoices never did).
const clientFeeOf = (inv) => { const f = (inv.items || [])[1]; return f && f.rate ? Number(f.amount) || 0 : 0; };
const techCommissionOf = (inv) => round2(commissionBase(inv) * COMMISSION_RATE);
const commissionOf = (inv) => round2(techCommissionOf(inv) + clientFeeOf(inv));
const paidOnline = (inv) => inv.status === 'paid' && (!!inv.paymobTxnId || inv.method === 'card' || inv.method === 'wallet');
const commissionCollected = (inv) => inv.commissionPaid === true || paidOnline(inv);

// ---- receivables ledger (table `receivables`): one row per paid job, our commission due on it ----
// Statuses: outstanding -> reported (technician says he paid) -> settled (admin confirmed, or taken from an online payment).
async function syncReceivables() {
  await init();
  const [invoices, techs, rows] = await Promise.all([db.invoices.getAll(), db.technicians.getAll(), db.receivables.getAll()]);
  const byId = new Map(rows.map((r) => [r.invoiceId, r]));
  for (const inv of invoices.filter((i) => i.status === 'paid')) {
    const tech = techs.find((x) => x.id === inv.technicianId);
    const claim = tech && tech.settlementClaim;
    const online = paidOnline(inv);
    const settled = commissionCollected(inv);
    const status = settled ? 'settled' : (claim ? 'reported' : 'outstanding');
    const want = {
      status, via: settled ? (online ? 'online' : 'admin') : null,
      reportedAt: !settled && claim ? claim.at : null, reportMethod: !settled && claim ? claim.method : null, reportRef: !settled && claim ? claim.reference : null,
      settledAt: settled ? (online ? (inv.paidAt || null) : (inv.commissionPaidAt || null)) : null, settledBy: settled ? (online ? 'online-payment' : 'admin') : null,
    };
    const cur = byId.get(inv.id);
    if (!cur) {
      await db.receivables.insert({
        id: await db.nextId('rcv'), invoiceId: inv.id, bookingId: inv.bookingId, invoiceNumber: inv.number, technicianId: inv.technicianId, clientId: inv.clientId,
        jobAmount: commissionBase(inv), rate: COMMISSION_RATE, techCommission: techCommissionOf(inv), clientFee: clientFeeOf(inv), commission: commissionOf(inv), accruedAt: inv.paidAt || inv.createdAt, method: inv.method || null, ...want,
      });
    } else if (Object.keys(want).some((k) => (cur[k] ?? null) !== want[k])) {
      await db.receivables.update(cur.id, want);
    }
  }
}

async function adminCommissions() {
  await syncReceivables();
  const [rows, techs, users, bookings] = await Promise.all([db.receivables.getAll(), db.technicians.getAll(), db.users.getAll(), db.bookings.getAll()]);
  const now = Date.now();
  const list = rows.map((r) => {
    const tech = techs.find((x) => x.id === r.technicianId);
    const client = users.find((x) => x.id === r.clientId);
    const bk = bookings.find((x) => x.id === r.bookingId);
    const ageDays = r.status === 'settled' ? null : Math.max(0, Math.floor((now - Date.parse(r.accruedAt)) / 86400e3));
    return {
      id: r.id, invoiceId: r.invoiceId, number: r.invoiceNumber, bookingId: r.bookingId, technicianId: r.technicianId,
      technicianName: tech ? tech.name : 'Unknown', clientName: client ? client.name : 'Unknown',
      job: bk ? String(bk.description || '').slice(0, 80) : '', base: r.jobAmount, techCommission: r.techCommission ?? r.commission, clientFee: r.clientFee || 0, commission: r.commission,
      accruedAt: r.accruedAt, status: r.status, via: r.via || null, reportedAt: r.reportedAt || null, reportMethod: r.reportMethod || null, reportRef: r.reportRef || null,
      settledAt: r.settledAt || null, ageDays, overdue: r.status !== 'settled' && ageDays >= OVERDUE_DAYS,
      // legacy fields used by the older table
      collected: r.status === 'settled', invoiceId2: r.invoiceId, createdAt: r.accruedAt, commissionPaidAt: r.settledAt || null, viaOnline: r.via === 'online',
    };
  }).sort((a, b) => String(b.accruedAt).localeCompare(String(a.accruedAt)));
  const sum = (f) => round2(list.filter(f).reduce((s, r) => s + r.commission, 0));
  const by = new Map();
  for (const r of list) {
    const g = by.get(r.technicianId) || { technicianId: r.technicianId, technicianName: r.technicianName, jobs: 0, earned: 0, collected: 0, outstanding: 0, reported: 0, oldestDays: null, claim: (techs.find((x) => x.id === r.technicianId) || {}).settlementClaim || null };
    g.jobs += 1; g.earned = round2(g.earned + r.commission);
    if (r.status === 'settled') g.collected = round2(g.collected + r.commission);
    else { g.outstanding = round2(g.outstanding + r.commission); if (r.status === 'reported') g.reported = round2(g.reported + r.commission); g.oldestDays = Math.max(g.oldestDays || 0, r.ageDays); }
    by.set(r.technicianId, g);
  }
  const earned = sum(() => true);
  const collected = sum((r) => r.status === 'settled');
  return {
    rate: COMMISSION_RATE, overdueDays: OVERDUE_DAYS, active: commissionActive(),
    totals: {
      jobs: list.length, earned, collected, outstanding: round2(earned - collected), reported: sum((r) => r.status === 'reported'),
      overdue: sum((r) => r.overdue), outstandingCount: list.filter((r) => r.status !== 'settled').length, settledCount: list.filter((r) => r.status === 'settled').length,
    },
    byTechnician: [...by.values()].sort((a, b) => b.outstanding - a.outstanding || b.earned - a.earned),
    rows: list,
  };
}


// ---- technician identity (national ID front + back + selfie): private, admin-only ----
const ID_IMG_MAX = 600000;
function cleanIdImage(v, label) {
  const x = String(v || '');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x)) throw ApiError.badRequest(`${label} photo is required (JPEG, PNG or WebP image)`);
  if (!imageSigOk(x)) throw ApiError.badRequest(`${label} photo is not a valid image file`);
  if (x.length > ID_IMG_MAX) throw ApiError.badRequest(`${label} photo is too large`);
  return x;
}
function cleanIdentity(b = {}) {
  return { front: cleanIdImage(b.idFront || b.front, 'National ID front'), back: cleanIdImage(b.idBack || b.back, 'National ID back'), selfie: cleanIdImage(b.idSelfie || b.selfie, 'Selfie') };
}
async function saveIdentity(tech, docs) {
  await init();
  const row = { ...docs, submittedAt: new Date().toISOString() };
  if (await db.idDocs.getById(tech.id)) await db.idDocs.update(tech.id, row); else await db.idDocs.insert({ id: tech.id, ...row });
  await db.technicians.update(tech.id, { idStatus: 'submitted' });
  const admins = (await db.users.getAll()).filter((u) => u.role === 'admin');
  for (const a of admins) {
    await notify(a.id, { type: 'identity_submitted', link: '/admin', titleAr: 'فني رفع صور الهوية للمراجعة', titleEn: 'A technician submitted ID photos for review',
      bodyAr: `${tech.name}: راجع البطاقة والسيلفي من لوحة الأدمن.`, bodyEn: `${tech.name}: review the ID card and selfie in the admin view.` });
  }
}
async function adminGetIdentity(techId) {
  await init();
  const d = await db.idDocs.getById(techId);
  if (!d) throw ApiError.notFound('No identity documents submitted');
  return d;
}
async function adminDecideIdentity(techId, decision) {
  await init();
  const tech = await findTechnicianById(techId);
  if (!tech) throw ApiError.notFound('Technician not found');
  if (!['approve', 'reject'].includes(decision)) throw ApiError.badRequest('decision must be approve or reject');
  if (!(await db.idDocs.getById(techId))) throw ApiError.badRequest('No identity documents submitted');
  const approve = decision === 'approve';
  await db.technicians.update(techId, approve ? { idStatus: 'approved', verified: true } : { idStatus: 'rejected', verified: false });
  await notify(tech.userId, approve
    ? { type: 'identity_approved', link: '/pro', titleAr: 'تم توثيق هويتك ✅', titleEn: 'Your identity is verified ✅', bodyAr: 'ظهرت شارة "موثّق" على بروفايلك.', bodyEn: 'The verified badge now shows on your profile.' }
    : { type: 'identity_rejected', link: '/pro', titleAr: 'صور الهوية محتاجة تتبعت تاني', titleEn: 'Please resubmit your ID photos', bodyAr: 'الصور مش واضحة أو مش مطابقة. ارفع صور البطاقة (وش وضهر) والسيلفي تاني من لوحة التحكم.', bodyEn: 'The photos were unclear or did not match. Upload the ID (front and back) and a selfie again from your dashboard.' });
  return { idStatus: approve ? 'approved' : 'rejected' };
}

// ---- cash commission settlement + enforcement ----
// Cash jobs: the technician holds the money, so the 6% commission is owed to FIX-IT. He settles
// periodically (Vodafone Cash / InstaPay), the admin confirms receipt and the balance clears.
// A technician whose oldest unsettled commission is older than OVERDUE_DAYS stops receiving new
// requests until he settles. Off until COMMISSION_ACTIVE=1 (the launch period is commission-free).
const OVERDUE_DAYS = 7;
const commissionActive = () => process.env.COMMISSION_ACTIVE === '1';
const collectionDetails = () => ({
  vodafoneCash: process.env.SETTLEMENT_VODAFONE_CASH || '',
  instapay: process.env.SETTLEMENT_INSTAPAY || '',
});
async function commissionStatusFor(tech) {
  await init();
  const mine = (await db.invoices.getAll()).filter((i) => i.technicianId === tech.id && i.status === 'paid' && !commissionCollected(i));
  const outstanding = round2(mine.reduce((s, i) => s + commissionOf(i), 0));
  const times = mine.map((i) => Date.parse(i.paidAt || i.createdAt)).filter(Number.isFinite).sort((a, b) => a - b);
  const oldest = times.length ? new Date(times[0]).toISOString() : null;
  const dueBy = oldest ? new Date(times[0] + OVERDUE_DAYS * 86400e3).toISOString() : null;
  const active = commissionActive();
  const overdue = active && !!dueBy && Date.parse(dueBy) <= Date.now();
  return { active, rate: COMMISSION_RATE, clientFeeRate: seed.CLIENT_FEE_RATE, overdueDays: OVERDUE_DAYS, outstanding, jobs: mine.length, oldest, dueBy, overdue, blocked: overdue, claim: tech.settlementClaim || null, collection: collectionDetails() };
}
// A technician receives new requests only after an admin approved his ID (front + back + selfie).
function idVerified(tech) { return !!tech && tech.idStatus === 'approved'; }
async function isTechnicianBlocked(tech) { return !idVerified(tech) || (await commissionStatusFor(tech)).blocked; }

// ---- disputes ----
const DISPUTE_STATUSES = ['accepted', 'in_progress', 'awaiting_confirmation'];
async function openDispute(booking, user, text) {
  await init();
  const reason = String(text || '').trim().slice(0, 1000);
  if (reason.length < 5) throw ApiError.badRequest('Describe the problem (at least a few words)');
  if (!DISPUTE_STATUSES.includes(booking.status)) throw ApiError.badRequest('A problem can be reported on an active job only');
  const role = user.role === 'technician' ? 'technician' : 'client';
  const now = new Date().toISOString();
  const existing = (await db.disputes.getAll()).find((d) => d.bookingId === booking.id && d.status === 'open');
  let d;
  if (existing) {
    d = await db.disputes.update(existing.id, { notes: [...(existing.notes || []), { by: role, text: reason, at: now }] });
  } else {
    d = await db.disputes.insert({ id: await db.nextId('dsx'), bookingId: booking.id, clientId: booking.clientId, technicianId: booking.technicianId,
      openedBy: role, status: 'open', reason, notes: [], resolution: '', createdAt: now, resolvedAt: null });
  }
  const tech = await findTechnicianById(booking.technicianId);
  const otherUserId = role === 'client' ? (tech && tech.userId) : booking.clientId;
  const who = role === 'client' ? ['العميل', 'The customer'] : ['الفني', 'The technician'];
  for (const a of (await db.users.getAll()).filter((u) => u.role === 'admin')) {
    await notify(a.id, { type: 'dispute', bookingId: booking.id, link: '/admin', titleAr: 'مشكلة جديدة في طلب', titleEn: 'New job dispute', bodyAr: `${who[0]}: ${reason.slice(0, 120)}`, bodyEn: `${who[1]}: ${reason.slice(0, 120)}` });
  }
  if (otherUserId) await notify(otherUserId, { type: 'dispute', bookingId: booking.id, link: '/dashboard', titleAr: 'تم تسجيل مشكلة في الطلب', titleEn: 'A problem was reported on your job', bodyAr: 'الإدارة هتراجع الطلب وتتواصل معاك لو احتاجت.', bodyEn: 'The FIX-IT team will review the job and contact you if needed.' });
  return d;
}
async function disputesForBooking(booking) {
  await init();
  return (await db.disputes.getAll()).filter((d) => d.bookingId === booking.id).map((d) => ({ id: d.id, status: d.status, openedBy: d.openedBy, createdAt: d.createdAt, resolvedAt: d.resolvedAt }));
}
async function adminListDisputes() {
  await init();
  const [rows, bookings, users, techs] = await Promise.all([db.disputes.getAll(), db.bookings.getAll(), db.users.getAll(), db.technicians.getAll()]);
  return rows.map((d) => {
    const b = bookings.find((x) => x.id === d.bookingId) || {};
    const c = users.find((u) => u.id === d.clientId) || {};
    const t = techs.find((x) => x.id === d.technicianId) || {};
    return { ...d, job: { id: b.id, status: b.status, date: b.date, description: b.description, address: b.address, finalAmount: b.finalAmount, proofCount: (b.proofPhotos || []).length },
      client: { name: c.name, phone: c.phone, email: c.email }, technician: { name: t.name, phone: t.phone } };
  }).sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'open' ? -1 : 1));
}
async function adminResolveDispute(id, resolution) {
  await init();
  const d = await db.disputes.getById(id);
  if (!d) throw ApiError.notFound('Dispute not found');
  const note = String(resolution || '').trim().slice(0, 1000);
  if (!note) throw ApiError.badRequest('Write the resolution notes');
  const upd = await db.disputes.update(id, { status: 'resolved', resolution: note, resolvedAt: new Date().toISOString() });
  const tech = await findTechnicianById(d.technicianId);
  for (const uid of [d.clientId, tech && tech.userId].filter(Boolean)) {
    await notify(uid, { type: 'dispute', bookingId: d.bookingId, link: '/dashboard', titleAr: 'تم إغلاق المشكلة المسجلة على الطلب', titleEn: 'The reported problem was closed', bodyAr: note.slice(0, 160), bodyEn: note.slice(0, 160) });
  }
  return upd;
}

async function submitSettlementClaim(tech, { method, reference }) {
  await init();
  if (!['vodafone-cash', 'instapay'].includes(method)) throw ApiError.badRequest('Choose Vodafone Cash or InstaPay');
  const st = await commissionStatusFor(tech);
  if (!st.outstanding) throw ApiError.badRequest('No outstanding commission');
  const claim = { method, reference: String(reference || '').trim().slice(0, 80), amount: st.outstanding, at: new Date().toISOString() };
  await db.technicians.update(tech.id, { settlementClaim: claim });
  await syncReceivables();
  const admins = (await db.users.getAll()).filter((u) => u.role === 'admin');
  for (const a of admins) {
    await notify(a.id, { type: 'settlement_claim', link: '/admin', titleAr: 'فني بلّغ إنه سدّد العمولة', titleEn: 'A technician reports a commission settlement',
      bodyAr: `${tech.name}: ${claim.amount} جنيه عن طريق ${method === 'instapay' ? 'انستاباي' : 'فودافون كاش'}. راجع الاستلام وأكّد.`, bodyEn: `${tech.name}: ${claim.amount} EGP via ${method}. Verify receipt and confirm.` });
  }
  return commissionStatusFor({ ...tech, settlementClaim: claim });
}

// Admin confirms the money arrived: every outstanding cash commission of this technician is cleared.
async function adminSettleTechnician(techId) {
  await init();
  const tech = await findTechnicianById(techId);
  if (!tech) throw ApiError.notFound('Technician not found');
  const now = new Date().toISOString();
  let n = 0;
  for (const i of (await db.invoices.getAll()).filter((x) => x.technicianId === tech.id && x.status === 'paid' && !commissionCollected(x))) {
    await db.invoices.update(i.id, { commissionPaid: true, commissionPaidAt: now }); n += 1;
  }
  await db.technicians.update(tech.id, { settlementClaim: null });
  await syncReceivables();
  await notify(tech.userId, { type: 'settlement_confirmed', link: '/pro', titleAr: 'تم استلام السداد ✅', titleEn: 'Settlement received ✅',
    bodyAr: 'شكراً، رصيدك اتصفّى وبتستقبل الطلبات عادي.', bodyEn: 'Thank you, your balance is cleared and you receive requests as usual.' });
  return { cleared: n };
}

async function adminOverview() {
  await init();
  const users = await db.users.getAll();
  const techs = await db.technicians.getAll();
  const bookings = await db.bookings.getAll();
  const invoices = await db.invoices.getAll();
  const paid = invoices.filter((i) => i.status === 'paid');
  return {
    users: {
      total: users.length,
      clients: users.filter((u) => u.role === 'client').length,
      technicians: users.filter((u) => u.role === 'technician').length,
    },
    technicians: { total: techs.length, active: techs.filter((t) => t.addressActive !== false).length },
    bookings: {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === 'pending').length,
      accepted: bookings.filter((b) => b.status === 'accepted').length,
      completed: bookings.filter((b) => b.status === 'completed').length,
    },
    invoices: {
      total: invoices.length,
      paid: paid.length,
      unpaid: invoices.length - paid.length,
      collected: paid.reduce((s, i) => s + i.total, 0),
      outstanding: invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.total, 0),
    },
    commission: (({ rate, totals }) => ({ rate, ...totals }))(await adminCommissions()),
    verifiedTechnicians: techs.filter((t) => t.verified === true).length,
  };
}

async function getDb() { await init(); return db; }
module.exports = {
  getDb, BOOKING_STATUS, createNearestRequest, chooseNearestOffer, SUPPORTED_CITIES, submitFinalAmount, getBookingProof, sweepAutoConfirm, clientCashAnswer, init,
  findUserByEmail, findUserByPhone, findUserByLogin, setUserPassword, normalizePhone, isEgPhone, findUserById, publicUser, createUser,
  listProfessions, listCities,
  searchTechnicians, publicTechnician, findTechnicianById, findTechnicianByUserId,
  createTechnicianProfile, updateTechnicianProfile,
  createBooking, findBookingById, bookingsForClient, bookingsForTechnician, setBookingStatus, addReview,
  createInvoiceForBooking, findInvoiceById, findInvoiceByBookingId, invoicesForClient, invoicesForTechnician, allInvoices,
  payInvoice, verifyInvoice, confirmInvoice, publicInvoice,
  startPaymobPayment, applyPaymobTransaction,
  notify, notificationsFor, markNotificationsRead,
  cleanIdentity, saveIdentity, adminGetIdentity, adminDecideIdentity,
  listUsersAdmin, adminOverview, adminCommissions, syncReceivables, COMMISSION_RATE, commissionStatusFor, isTechnicianBlocked, idVerified, normalizeUsername, validUsername, findUserByUsername, suggestUsername, openDispute, disputesForBooking, adminListDisputes, adminResolveDispute, submitSettlementClaim, adminSettleTechnician,
  adminListTechnicians, adminCreateTechnician, adminUpdateTechnician, adminDeleteTechnician,
  adminUpdateUser, adminDeleteUser, adminListBookings, adminSetBookingStatus, adminDeleteBooking,
  adminUpdateInvoice, adminDeleteInvoice,
};
