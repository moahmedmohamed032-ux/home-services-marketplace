// Business-logic layer over a pluggable persistence backend: MongoDB when
// MONGODB_URI is set (production), in-memory otherwise (local dev and tests).
// Every function is async; routes always await them.
const ApiError = require('./ApiError');
const seed = require('./seed');
const paymob = require('./paymob');

let db = null;
let ready = null;

function init() {
  if (!ready) {
    ready = (async () => {
      if (process.env.MONGODB_URI) {
        try {
          db = require('./persist-mongo');
          await db.init();
          console.log('FIX-IT store: MongoDB');
          return db;
        } catch (err) {
          console.error(`FIX-IT store: MongoDB unavailable (${err.message}), using in-memory store`);
          db = null;
        }
      }
      db = require('./persist-memory');
      await db.init();
      return db;
    })();
  }
  return ready;
}
init();

const BOOKING_STATUS = ['pending', 'accepted', 'declined', 'completed', 'cancelled'];

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
  if (id.includes('@')) return findUserByEmail(id);
  return (await findUserByPhone(id)) || findUserByEmail(id);
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
async function createUser({ name, email, phone, passwordHash, role, city, lat, lng }) {
  await init();
  const user = {
    id: await db.nextId('usr'), name, email: email || '', ...(phone ? { phone: normalizePhone(phone) } : {}), passwordHash, role, city: city || '',
    ...(lat !== undefined && lng !== undefined ? { lat: Number(lat), lng: Number(lng) } : {}),
    createdAt: new Date().toISOString(),
  };
  return db.users.insert(user);
}

// Public marketplace is Luxor-only. Records for other cities (demo data) are kept, just hidden.
// Override with PUBLIC_CITIES="Luxor,Cairo" (comma separated) to show more.
const PUBLIC_CITIES = (process.env.PUBLIC_CITIES || 'Luxor').split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
const isPublicCity = (t) => PUBLIC_CITIES.includes(String(t.city || '').toLowerCase());

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
  const techs = (await db.technicians.getAll()).filter(isPublicCity);
  return [...new Set(techs.map((t) => t.city))].sort();
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

async function publicTechnician(t, { owner = false, withReviews = false } = {}) {
  if (!t) return null;
  const { phone, reviews, workPhotos, ...rest } = t;
  const out = { ...rest, verified: t.verified === true, phone: owner || t.phonePublic ? phone : null };
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
  const fallback = seed.CITY_COORDS[city || user.city] || {};
  const t = {
    id: await db.nextId('tec'), userId: user.id, name: user.name, profession,
    city: city || user.city || '', district: district || '',
    yearsExperience: Number(yearsExperience) || 0, hourlyRate: Number(hourlyRate) || 0,
    rating: 0, jobsDone: 0, bio, bioAr,
    phone: String(phone || ''), phonePublic: phonePublic === true || phonePublic === 'true',
    address: String(address || ''), addressActive: addressActive !== false && addressActive !== 'false',
    reviews: [],
    lat: lat !== undefined ? Number(lat) : fallback.lat,
    lng: lng !== undefined ? Number(lng) : fallback.lng,
  };
  return db.technicians.insert(t);
}
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const PHOTO_MAX = 120000;
const WORK_PHOTO_MAX = 300000;
const WORK_PHOTOS_MAX = 6;
function cleanImage(v, max) {
  if (v === '' || v === null) return '';
  if (typeof v !== 'string' || v.length > max || !IMG_RE.test(v)) throw ApiError.badRequest('Invalid or too large image (JPEG/PNG/WebP only)');
  return v;
}
async function updateTechnicianProfile(id, patch) {
  await init();
  const allowed = ['city', 'district', 'yearsExperience', 'hourlyRate', 'bio', 'bioAr', 'profession', 'lat', 'lng', 'phone', 'phonePublic', 'address', 'addressActive'];
  const clean = {};
  for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k];
  // Photos (resized to JPEG data URLs by the browser). 'verified' is admin-only and never accepted here.
  if (patch.photo !== undefined) clean.photo = cleanImage(patch.photo, PHOTO_MAX);
  if (patch.workPhotos !== undefined) {
    if (!Array.isArray(patch.workPhotos) || patch.workPhotos.length > WORK_PHOTOS_MAX) throw ApiError.badRequest(`At most ${WORK_PHOTOS_MAX} work photos`);
    clean.workPhotos = patch.workPhotos.map((p) => cleanImage(p, WORK_PHOTO_MAX)).filter(Boolean);
  }
  return db.technicians.update(id, clean);
}

// ---- bookings ----
async function createBooking({ clientId, technicianId, date, description, descriptionAr = '', address, clientLat, clientLng }) {
  await init();
  const b = {
    id: await db.nextId('bkg'), clientId, technicianId, date, description, descriptionAr, address,
    ...(clientLat !== undefined && clientLng !== undefined
      ? { clientLat: Number(clientLat), clientLng: Number(clientLng) }
      : {}),
    status: 'pending', createdAt: new Date().toISOString(), review: null,
  };
  return db.bookings.insert(b);
}
async function findBookingById(id) {
  await init();
  return db.bookings.getById(id);
}
async function hydrateBooking(b) {
  const tech = await findTechnicianById(b.technicianId);
  const client = await findUserById(b.clientId);
  const profession = seed.PROFESSIONS.find((p) => p.id === (tech && tech.profession));
  return {
    ...b,
    technicianName: tech ? tech.name : 'Unknown',
    profession: profession ? profession.name : '',
    professionAr: profession ? profession.nameAr : '',
    clientName: client ? client.name : 'Unknown',
  };
}
async function bookingsForClient(clientId) {
  await init();
  const all = await db.bookings.getAll();
  const rows = [];
  for (const b of all.filter((x) => x.clientId === clientId)) rows.push(await hydrateBooking(b));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function bookingsForTechnician(userId) {
  const tech = await findTechnicianByUserId(userId);
  if (!tech) return [];
  const all = await db.bookings.getAll();
  const rows = [];
  for (const b of all.filter((x) => x.technicianId === tech.id)) rows.push(await hydrateBooking(b));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function createInvoiceForBooking(booking) {
  const existing = await db.invoices.getAll();
  if (existing.some((i) => i.bookingId === booking.id)) return null;
  const tech = await findTechnicianById(booking.technicianId);
  const prof = seed.PROFESSIONS.find((p) => p.id === (tech && tech.profession));
  const id = await db.nextId('inv');
  const num = Number(id.split('_')[1]);
  const invoice = {
    id, number: `INV-2026-${String(num).padStart(4, '0')}`,
    bookingId: booking.id, clientId: booking.clientId, technicianId: booking.technicianId,
    items: [
      { label: `${prof ? prof.name : 'Service'} visit`, labelAr: `زيارة ${prof ? prof.nameAr : 'فني'}`, amount: tech ? tech.hourlyRate : 0 },
      { label: 'FIX-IT service fee', labelAr: 'رسوم خدمة FIX-IT', amount: seed.SERVICE_FEE_EGP },
    ],
    total: (tech ? tech.hourlyRate : 0) + seed.SERVICE_FEE_EGP,
    method: null, status: 'unpaid',
    cardLast4: null, mobileNumber: null, confirmationCode: null, verificationCode: null,
    paidAt: null, createdAt: new Date().toISOString(),
  };
  return db.invoices.insert(invoice);
}

async function setBookingStatus(booking, status) {
  await init();
  const updated = await db.bookings.update(booking.id, { status });
  if (status === 'completed') {
    const tech = await findTechnicianById(booking.technicianId);
    if (tech) await db.technicians.update(tech.id, { jobsDone: (tech.jobsDone || 0) + 1 });
    await createInvoiceForBooking(updated);
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
  return { status: 'paid', invoice: await hydrateInvoice(updated) };
}

async function verifyInvoice(invoice, codeInput) {
  await init();
  if (invoice.status !== 'pending_verification') throw ApiError.badRequest('Invoice is not awaiting verification');
  if (String(codeInput) !== String(invoice.verificationCode)) throw ApiError.badRequest('Wrong verification code');
  const updated = await db.invoices.update(invoice.id, {
    status: 'paid', confirmationCode: `FX-${code(6)}`, verificationCode: null, paidAt: new Date().toISOString(),
  });
  return hydrateInvoice(updated);
}

// Technician confirms cash received for his own invoice; admin can confirm any.
async function confirmInvoice(invoice) {
  await init();
  if (invoice.status === 'paid') throw ApiError.conflict('Invoice is already paid');
  const updated = await db.invoices.update(invoice.id, {
    status: 'paid', confirmationCode: `FX-${code(6)}`, verificationCode: null, paidAt: new Date().toISOString(),
  });
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
  if (body.rating !== undefined && body.rating !== '') {
    return db.technicians.update(t.id, { rating: Math.round(num(body.rating, 'rating', { min: 0, max: 5 }) * 10) / 10 });
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
  if (body.clearPhoto === true) patch.photo = '';
  if (!Object.keys(patch).length) throw ApiError.badRequest('Nothing to update');
  const updated = await db.technicians.update(id, patch);
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
    patch.items = inv.items.map((it, i) => ({ label: it.label, labelAr: it.labelAr, amount: num(body.items[i], 'amount', { max: 1000000 }) }));
    patch.total = patch.items.reduce((s, it) => s + it.amount, 0);
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
const commissionOf = (inv) => round2(commissionBase(inv) * COMMISSION_RATE);
const paidOnline = (inv) => inv.status === 'paid' && (!!inv.paymobTxnId || inv.method === 'card' || inv.method === 'wallet');
const commissionCollected = (inv) => inv.commissionPaid === true || paidOnline(inv);

async function adminCommissions() {
  await init();
  const invoices = await db.invoices.getAll();
  const techs = await db.technicians.getAll();
  const users = await db.users.getAll();
  const rows = [];
  const by = new Map();
  for (const inv of invoices) {
    const tech = techs.find((x) => x.id === inv.technicianId);
    const client = users.find((x) => x.id === inv.clientId);
    const base = commissionBase(inv);
    const commission = commissionOf(inv);
    const collected = commissionCollected(inv);
    rows.push({
      invoiceId: inv.id, number: inv.number, bookingId: inv.bookingId, technicianId: inv.technicianId,
      technicianName: tech ? tech.name : 'Unknown', clientName: client ? client.name : 'Unknown',
      base, commission, collected, invoiceStatus: inv.status, method: inv.method || null,
      viaOnline: paidOnline(inv), createdAt: inv.createdAt, commissionPaidAt: inv.commissionPaidAt || null,
    });
    const g = by.get(inv.technicianId) || { technicianId: inv.technicianId, technicianName: tech ? tech.name : 'Unknown', jobs: 0, earned: 0, collected: 0, outstanding: 0 };
    g.jobs += 1; g.earned = round2(g.earned + commission);
    if (collected) g.collected = round2(g.collected + commission); else g.outstanding = round2(g.outstanding + commission);
    by.set(inv.technicianId, g);
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const earned = round2(rows.reduce((s, r) => s + r.commission, 0));
  const collected = round2(rows.filter((r) => r.collected).reduce((s, r) => s + r.commission, 0));
  return {
    rate: COMMISSION_RATE,
    totals: { jobs: rows.length, earned, collected, outstanding: round2(earned - collected) },
    byTechnician: [...by.values()].sort((a, b) => b.outstanding - a.outstanding || b.earned - a.earned),
    rows,
  };
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

module.exports = {
  BOOKING_STATUS, init,
  findUserByEmail, findUserByPhone, findUserByLogin, setUserPassword, normalizePhone, isEgPhone, findUserById, publicUser, createUser,
  listProfessions, listCities,
  searchTechnicians, publicTechnician, findTechnicianById, findTechnicianByUserId,
  createTechnicianProfile, updateTechnicianProfile,
  createBooking, findBookingById, bookingsForClient, bookingsForTechnician, setBookingStatus, addReview,
  findInvoiceById, findInvoiceByBookingId, invoicesForClient, invoicesForTechnician, allInvoices,
  payInvoice, verifyInvoice, confirmInvoice, publicInvoice,
  startPaymobPayment, applyPaymobTransaction,
  listUsersAdmin, adminOverview, adminCommissions, COMMISSION_RATE,
  adminListTechnicians, adminCreateTechnician, adminUpdateTechnician, adminDeleteTechnician,
  adminUpdateUser, adminDeleteUser, adminListBookings, adminSetBookingStatus, adminDeleteBooking,
  adminUpdateInvoice, adminDeleteInvoice,
};
