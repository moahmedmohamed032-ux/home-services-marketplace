// In-memory data layer. A single module-level "database" with small
// query helpers; swap this file for Mongo/Postgres without touching routes.
const bcrypt = require('bcryptjs');
const config = require('./config');
const seed = require('./seed');

const db = {
  users: [],        // {id, name, email, passwordHash, role, city, createdAt}
  technicians: [],  // {id, userId, name, profession, city, yearsExperience, hourlyRate, rating, jobsDone, bio}
  bookings: [],     // {id, clientId, technicianId, date, description, address, status, createdAt, review?}
  seq: 1,
};

const nextId = (prefix) => `${prefix}_${db.seq++}`;

function seedDatabase() {
  if (db.users.length) return;
  db.professions = seed.PROFESSIONS;

  const demoClientHash = bcrypt.hashSync(seed.DEMO_CLIENT.password, config.bcryptRounds);
  const demoTechHash = bcrypt.hashSync(seed.DEMO_TECH.password, config.bcryptRounds);

  const demoClient = { id: nextId('usr'), ...stripPassword(seed.DEMO_CLIENT), passwordHash: demoClientHash, createdAt: new Date().toISOString() };
  db.users.push(demoClient);

  const demoTechUser = { id: nextId('usr'), name: seed.DEMO_TECH.name, email: seed.DEMO_TECH.email, passwordHash: demoTechHash, role: 'technician', city: seed.DEMO_TECH.city, createdAt: new Date().toISOString() };
  db.users.push(demoTechUser);
  db.technicians.push({
    id: nextId('tec'), userId: demoTechUser.id, name: demoTechUser.name,
    profession: seed.DEMO_TECH.profession, city: seed.DEMO_TECH.city,
    yearsExperience: seed.DEMO_TECH.yearsExperience, hourlyRate: seed.DEMO_TECH.hourlyRate,
    rating: 0, jobsDone: 0, bio: seed.DEMO_TECH.bio,
  });

  for (const t of seed.TECHNICIANS) {
    db.technicians.push({ id: nextId('tec'), userId: null, ...t });
  }
}

function stripPassword(u) {
  const { password, ...rest } = u;
  return rest;
}

// ---- users ----
function findUserByEmail(email) {
  return db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
}
function findUserById(id) {
  return db.users.find((u) => u.id === id);
}
function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}
function createUser({ name, email, passwordHash, role, city }) {
  const user = { id: nextId('usr'), name, email, passwordHash, role, city: city || '', createdAt: new Date().toISOString() };
  db.users.push(user);
  return user;
}

// ---- professions ----
function listProfessions() {
  return db.professions.map((p) => ({
    ...p,
    technicianCount: db.technicians.filter((t) => t.profession === p.id).length,
  }));
}

// ---- technicians ----
function searchTechnicians({ profession, city, search, minRating } = {}) {
  let out = [...db.technicians];
  if (profession) out = out.filter((t) => t.profession === profession);
  if (city) out = out.filter((t) => t.city.toLowerCase() === String(city).toLowerCase());
  if (minRating) out = out.filter((t) => t.rating >= Number(minRating));
  if (search) {
    const q = String(search).toLowerCase();
    out = out.filter((t) => t.name.toLowerCase().includes(q) || t.bio.toLowerCase().includes(q));
  }
  return out.sort((a, b) => b.rating - a.rating);
}
function findTechnicianById(id) {
  return db.technicians.find((t) => t.id === id);
}
function findTechnicianByUserId(userId) {
  return db.technicians.find((t) => t.userId === userId);
}
function createTechnicianProfile(user, { profession, city, yearsExperience = 0, hourlyRate = 0, bio = '' }) {
  const t = {
    id: nextId('tec'), userId: user.id, name: user.name, profession,
    city: city || user.city || '', yearsExperience: Number(yearsExperience) || 0,
    hourlyRate: Number(hourlyRate) || 0, rating: 0, jobsDone: 0, bio,
  };
  db.technicians.push(t);
  return t;
}
function updateTechnicianProfile(id, patch) {
  const t = findTechnicianById(id);
  if (!t) return null;
  const allowed = ['city', 'yearsExperience', 'hourlyRate', 'bio', 'profession'];
  for (const k of allowed) {
    if (patch[k] !== undefined) t[k] = patch[k];
  }
  return t;
}
function listCities() {
  return [...new Set(db.technicians.map((t) => t.city))].sort();
}

// ---- bookings ----
const BOOKING_STATUS = ['pending', 'accepted', 'declined', 'completed', 'cancelled'];

function createBooking({ clientId, technicianId, date, description, address }) {
  const b = {
    id: nextId('bkg'), clientId, technicianId, date, description, address,
    status: 'pending', createdAt: new Date().toISOString(), review: null,
  };
  db.bookings.push(b);
  return b;
}
function findBookingById(id) {
  return db.bookings.find((b) => b.id === id);
}
function bookingsForClient(clientId) {
  return db.bookings.filter((b) => b.clientId === clientId).map(hydrateBooking).sort(byNewest);
}
function bookingsForTechnician(userId) {
  const tech = findTechnicianByUserId(userId);
  if (!tech) return [];
  return db.bookings.filter((b) => b.technicianId === tech.id).map(hydrateBooking).sort(byNewest);
}
function byNewest(a, b) {
  return b.createdAt.localeCompare(a.createdAt);
}
function hydrateBooking(b) {
  const tech = findTechnicianById(b.technicianId);
  const client = findUserById(b.clientId);
  const profession = db.professions.find((p) => p.id === (tech && tech.profession));
  return {
    ...b,
    technicianName: tech ? tech.name : 'Unknown',
    profession: profession ? profession.name : '',
    clientName: client ? client.name : 'Unknown',
  };
}
function addReview(booking, { rating, comment }) {
  booking.review = { rating: Number(rating), comment: comment || '', createdAt: new Date().toISOString() };
  // Recompute the technician's rating as an average of all reviews.
  const techBookings = db.bookings.filter((b) => b.technicianId === booking.technicianId && b.review);
  const tech = findTechnicianById(booking.technicianId);
  if (tech && techBookings.length) {
    const avg = techBookings.reduce((s, b) => s + b.review.rating, 0) / techBookings.length;
    tech.rating = Math.round(avg * 10) / 10;
  }
  return booking;
}

seedDatabase();

module.exports = {
  BOOKING_STATUS,
  findUserByEmail, findUserById, publicUser, createUser,
  listProfessions, listCities,
  searchTechnicians, findTechnicianById, findTechnicianByUserId,
  createTechnicianProfile, updateTechnicianProfile,
  createBooking, findBookingById, bookingsForClient, bookingsForTechnician, addReview,
};
