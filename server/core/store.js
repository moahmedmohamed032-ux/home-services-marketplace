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
async function findUserByEmail(email) {
  await init();
  const all = await db.users.getAll();
  return all.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
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
async function createUser({ name, email, passwordHash, role, city, lat, lng }) {
  await init();
  const user = {
    id: await db.nextId('usr'), name, email, passwordHash, role, city: city || '',
    ...(lat !== undefined && lng !== undefined ? { lat: Number(lat), lng: Number(lng) } : {}),
    createdAt: new Date().toISOString(),
  };
  return db.users.insert(user);
}

// ---- professions ----
async function listProfessions() {
  await init();
  const techs = await db.technicians.getAll();
  return seed.PROFESSIONS.map((p) => ({
    ...p,
    technicianCount: techs.filter((t) => t.profession === p.id).length,
  }));
}
async function listCities() {
  await init();
  const techs = await db.technicians.getAll();
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
  let out = (await db.technicians.getAll()).filter((t) => t.addressActive !== false);
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
  const { phone, reviews, ...rest } = t;
  const out = { ...rest, phone: owner || t.phonePublic ? phone : null };
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
async function updateTechnicianProfile(id, patch) {
  await init();
  const allowed = ['city', 'district', 'yearsExperience', 'hourlyRate', 'bio', 'bioAr', 'profession', 'lat', 'lng', 'phone', 'phonePublic', 'address', 'addressActive'];
  const clean = {};
  for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k];
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
  };
}

module.exports = {
  BOOKING_STATUS, init,
  findUserByEmail, findUserById, publicUser, createUser,
  listProfessions, listCities,
  searchTechnicians, publicTechnician, findTechnicianById, findTechnicianByUserId,
  createTechnicianProfile, updateTechnicianProfile,
  createBooking, findBookingById, bookingsForClient, bookingsForTechnician, setBookingStatus, addReview,
  findInvoiceById, findInvoiceByBookingId, invoicesForClient, invoicesForTechnician, allInvoices,
  payInvoice, verifyInvoice, confirmInvoice, publicInvoice,
  startPaymobPayment, applyPaymobTransaction,
  listUsersAdmin, adminOverview,
};
