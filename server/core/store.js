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
  const { phone, reviews, workPhotos, ...rest } = t;
  const out = { ...rest, verified: t.verified === true, phone: owner || t.phonePublic ? phone : null };
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
  await notify(inv.clientId, { type: 'paid', bookingId: inv.bookingId, invoiceId: inv.id, link: '/dashboard',
    titleAr: 'تم تسجيل الدفع ✅', titleEn: 'Payment recorded ✅',
    bodyAr: `فاتورة ${inv.number} اتدفعت. شكراً لاستخدامك FIX-IT.`, bodyEn: `Invoice ${inv.number} is paid. Thank you for using FIX-IT.` });
  await notify(await techUserId(inv.technicianId), { type: 'paid', bookingId: inv.bookingId, invoiceId: inv.id, link: '/pro',
    titleAr: 'استلمت دفعة جديدة 💰', titleEn: 'Payment received 💰',
    bodyAr: `فاتورة ${inv.number} اتدفعت.`, bodyEn: `Invoice ${inv.number} was paid.` });
}

async function createBooking({ clientId, technicianId, date, description, descriptionAr = '', address, clientLat, clientLng }) {
  await init();
  const b = {
    id: await db.nextId('bkg'), clientId, technicianId, date, description, descriptionAr, address,
    ...(clientLat !== undefined && clientLng !== undefined
      ? { clientLat: Number(clientLat), clientLng: Number(clientLng) }
      : {}),
    status: 'pending', createdAt: new Date().toISOString(), review: null,
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
  await sweepAutoConfirm();
  const all = await db.bookings.getAll();
  const rows = [];
  for (const b of all.filter((x) => x.clientId === clientId)) rows.push(await hydrateBooking(b));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function bookingsForTechnician(userId) {
  await sweepAutoConfirm();
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
  const jobAmount = booking.finalAmount || (tech ? tech.hourlyRate : 0);
  const id = await db.nextId('inv');
  const num = Number(id.split('_')[1]);
  const invoice = {
    id, number: `INV-2026-${String(num).padStart(4, '0')}`,
    bookingId: booking.id, clientId: booking.clientId, technicianId: booking.technicianId,
    items: [
      { label: `${prof ? prof.name : 'Service'} visit`, labelAr: `زيارة ${prof ? prof.nameAr : 'فني'}`, amount: jobAmount },
      { label: 'FIX-IT service fee', labelAr: 'رسوم خدمة FIX-IT', amount: seed.SERVICE_FEE_EGP },
    ],
    total: jobAmount + seed.SERVICE_FEE_EGP,
    method: null, status: 'unpaid',
    cardLast4: null, mobileNumber: null, confirmationCode: null, verificationCode: null,
    paidAt: null, createdAt: new Date().toISOString(),
  };
  return db.invoices.insert(invoice);
}

// Technician reports the job as done with the final amount; must be inside the market cap.
async function submitFinalAmount(booking, amount) {
  await init();
  const tech = await findTechnicianById(booking.technicianId);
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) throw ApiError.badRequest('Enter the final amount in EGP');
  const band = priceBand(tech && tech.profession);
  if (band && a > band.priceMax * 5) throw ApiError.badRequest(`Final amount is above the market limit for this service (max ${band.priceMax * 5} EGP per job)`);
  return setBookingStatus(booking, 'awaiting_confirmation', { finalAmount: Math.round(a) });
}
// Confirm automatically when the client has not answered within 48h. Safe to call often.
async function sweepAutoConfirm() {
  await init();
  const now = Date.now();
  const all = await db.bookings.getAll();
  let n = 0;
  for (const b of all) {
    if (b.status === 'awaiting_confirmation' && b.awaitingSince && now - Date.parse(b.awaitingSince) >= AUTO_CONFIRM_MS) {
      await setBookingStatus(b, 'completed', { autoConfirmed: true });
      n += 1;
    }
  }
  return n;
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
  if (status === 'completed') {
    const tech = await findTechnicianById(booking.technicianId);
    if (tech) await db.technicians.update(tech.id, { jobsDone: (tech.jobsDone || 0) + 1 });
    await createInvoiceForBooking(updated);
    await adminDigestIfDue();
  }
  const msgs = {
    accepted: ['الفني قبل طلبك ✅', 'Technician accepted your request ✅', 'الفني هيتواصل معاك لتأكيد الميعاد.', 'The technician will contact you to confirm the time.'],
    declined: ['الفني اعتذر عن الطلب', 'Technician declined the request', 'ممكن تختار فني تاني من القايمة.', 'You can pick another technician.'],
    in_progress: ['الفني بدأ الشغل 🔧', 'The technician started the job 🔧', '', ''],
    awaiting_confirmation: ['الفني أنهى الشغل، أكّد الاستلام', 'Work finished, please confirm', 'راجع المبلغ النهائي وأكّد. لو مفيش رد خلال 48 ساعة هيتأكد تلقائياً.', 'Review the final amount and confirm. It auto-confirms after 48 hours.'],
    completed: ['الشغل خلص، الفاتورة جاهزة 🧾', 'Job done, invoice ready 🧾', 'افتح لوحة التحكم وادفع واكتب تقييمك.', 'Open your dashboard to pay and leave a review.'],
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
  BOOKING_STATUS, submitFinalAmount, sweepAutoConfirm, init,
  findUserByEmail, findUserByPhone, findUserByLogin, setUserPassword, normalizePhone, isEgPhone, findUserById, publicUser, createUser,
  listProfessions, listCities,
  searchTechnicians, publicTechnician, findTechnicianById, findTechnicianByUserId,
  createTechnicianProfile, updateTechnicianProfile,
  createBooking, findBookingById, bookingsForClient, bookingsForTechnician, setBookingStatus, addReview,
  findInvoiceById, findInvoiceByBookingId, invoicesForClient, invoicesForTechnician, allInvoices,
  payInvoice, verifyInvoice, confirmInvoice, publicInvoice,
  startPaymobPayment, applyPaymobTransaction,
  notify, notificationsFor, markNotificationsRead,
  listUsersAdmin, adminOverview, adminCommissions, COMMISSION_RATE,
  adminListTechnicians, adminCreateTechnician, adminUpdateTechnician, adminDeleteTechnician,
  adminUpdateUser, adminDeleteUser, adminListBookings, adminSetBookingStatus, adminDeleteBooking,
  adminUpdateInvoice, adminDeleteInvoice,
};
