// Builds the initial dataset (users, technicians, bookings, invoices) from
// seed.js as plain objects. Shared by the in-memory and MongoDB persistence
// backends so both boot with identical data.
const bcrypt = require('bcryptjs');
const seed = require('./seed');

const avgRating = (reviews) =>
  reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : 0;

const reviewDate = (month, day) => new Date(Date.UTC(2026, month - 1, day, 12)).toISOString();

const mapReviews = (reviews) =>
  reviews.map(([clientName, rating, comment, commentAr, month, day]) => ({
    clientName, rating, comment, commentAr, createdAt: reviewDate(month, day),
  }));

function buildDataset() {
  let seq = 1;
  const nextId = (p) => `${p}_${seq++}`;
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const created = new Date(Date.UTC(2026, 0, 15, 10)).toISOString();

  const users = [];
  const technicians = [];
  const bookings = [];
  const invoices = [];

  const coords = (city) => seed.CITY_COORDS[city] || { lat: 30.0444, lng: 31.2357 };

  const demoClient = {
    id: nextId('usr'), name: seed.DEMO_CLIENT.name, email: seed.DEMO_CLIENT.email,
    passwordHash: hash(seed.DEMO_CLIENT.password), role: 'client', city: seed.DEMO_CLIENT.city,
    ...coords(seed.DEMO_CLIENT.city), createdAt: created,
  };
  users.push(demoClient);

  const demoTechUser = {
    id: nextId('usr'), name: seed.DEMO_TECH.name, email: seed.DEMO_TECH.email,
    passwordHash: hash(seed.DEMO_TECH.password), role: 'technician', city: seed.DEMO_TECH.city, createdAt: created,
  };
  users.push(demoTechUser);

  const adminUser = {
    id: nextId('usr'), name: seed.ADMIN.name, email: seed.ADMIN.email,
    passwordHash: hash(seed.ADMIN.password), role: 'admin', city: seed.ADMIN.city, createdAt: created,
  };
  users.push(adminUser);

  const mkTech = (t, userId, i) => {
    const base = coords(t.city);
    const angle = (i + 1) * 2.399963; // golden angle for an even spread
    const r = 0.008 + (i % 5) * 0.014;
    const reviews = mapReviews(t.reviews || []);
    return {
      id: nextId('tec'), userId, name: t.name, profession: t.profession, city: t.city,
      district: t.district || '', yearsExperience: t.yearsExperience, hourlyRate: t.hourlyRate,
      rating: avgRating(reviews), jobsDone: t.jobsDone, bio: t.bio, bioAr: t.bioAr || '',
      phone: t.phone, phonePublic: t.phonePublic === true, addressActive: true,
      address: `${t.district ? `${t.district}, ` : ''}${t.city}`, reviews,
      lat: base.lat + r * Math.cos(angle), lng: base.lng + r * Math.sin(angle),
    };
  };

  technicians.push(mkTech(seed.DEMO_TECH, demoTechUser.id, 0));
  seed.TECHNICIANS.forEach((t, i) => technicians.push(mkTech(t, null, i + 1)));

  seed.SEED_BOOKINGS.forEach((b) => {
    const tech = technicians[b.tech + 1]; // +1: index 0 is the demo technician
    const prof = seed.PROFESSIONS.find((p) => p.id === tech.profession);
    const booking = {
      id: nextId('bkg'), clientId: demoClient.id, technicianId: tech.id,
      date: b.date, description: b.description, descriptionAr: b.descriptionAr || '',
      address: b.address, status: b.status, createdAt: `${b.date}T10:00:00.000Z`, review: null,
    };
    if (b.review) {
      booking.review = {
        rating: b.review.rating, comment: b.review.comment, commentAr: b.review.commentAr,
        createdAt: reviewDate(b.review.month, b.review.day),
      };
    }
    bookings.push(booking);
    if (b.invoice) {
      const id = nextId('inv');
      const paid = b.invoice.status === 'paid';
      invoices.push({
        id, number: `INV-2026-${String(seq).padStart(4, '0')}`,
        bookingId: booking.id, clientId: demoClient.id, technicianId: tech.id,
        items: [
          { label: `${prof.name} visit`, labelAr: `زيارة ${prof.nameAr}`, amount: tech.hourlyRate },
          { label: 'FIX-IT service fee (6%)', labelAr: 'رسوم خدمة FIX-IT (٦٪)', amount: Math.round(tech.hourlyRate * seed.CLIENT_FEE_RATE * 100) / 100, rate: seed.CLIENT_FEE_RATE },
        ],
        total: tech.hourlyRate + Math.round(tech.hourlyRate * seed.CLIENT_FEE_RATE * 100) / 100,
        method: b.invoice.method, status: b.invoice.status,
        cardLast4: b.invoice.method === 'visa' ? '4242' : null,
        mobileNumber: b.invoice.method === 'vodafone-cash' ? '01092245837' : null,
        confirmationCode: paid ? `FX-${100000 + seq * 137}`.slice(0, 8) : null,
        verificationCode: null,
        paidAt: paid ? reviewDate(b.invoice.month, b.invoice.day) : null,
        createdAt: `${b.date}T18:00:00.000Z`,
      });
    }
  });

  return { professions: seed.PROFESSIONS, users, technicians, bookings, invoices, nextId, seq };
}

module.exports = { buildDataset };
