// MongoDB persistence backend (Mongoose). Same primitive CRUD surface as the
// in-memory backend, so store.js business logic is identical either way.
// The connection is cached on globalThis so serverless warm containers reuse it.
const mongoose = require('mongoose');
const { buildDataset } = require('./dataset');

const opts = { versionKey: false };
const reviewSchema = new mongoose.Schema(
  { clientName: String, comment: String, commentAr: String, rating: Number, createdAt: String },
  { _id: false }
);

const User = mongoose.model('User', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  name: String, username: { type: String, index: true }, email: { type: String, index: true }, phone: { type: String, index: true }, passwordHash: String,
  role: { type: String, index: true }, city: String, active: Boolean, lat: Number, lng: Number, createdAt: String,
}, opts));

const Technician = mongoose.model('Technician', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  userId: { type: String, index: true }, name: String, profession: { type: String, index: true }, city: { type: String, index: true }, district: String,
  yearsExperience: Number, hourlyRate: Number, approved: Boolean, rating: Number, jobsDone: Number,
  bio: String, bioAr: String, phone: String, phonePublic: Boolean,
  address: String, addressActive: Boolean, reviews: [reviewSchema], lat: Number, lng: Number,
  verified: Boolean, photo: String, workPhotos: [String], settlementClaim: mongoose.Schema.Types.Mixed, idStatus: String,
}, opts));

const Booking = mongoose.model('Booking', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  clientId: { type: String, index: true }, technicianId: { type: String, index: true }, date: String,
  description: String, descriptionAr: String, address: String,
  clientLat: Number, clientLng: Number, status: String, createdAt: String,
  startedAt: String, awaitingSince: String, remind1At: String, remind2At: String, cashAskedAt: String, cashAnswer: String, cashAnsweredAt: String, finalAmount: Number, proofPhotos: [String], proofAt: String, completedAt: String, autoConfirmed: Boolean, digested: Boolean, dispatchId: { type: String, index: true }, nearest: Boolean, superseded: Boolean, chosen: Boolean, expired: Boolean,
  review: { type: new mongoose.Schema({ rating: Number, comment: String, commentAr: String, createdAt: String }, { _id: false }), default: null },
}, opts));

const Invoice = mongoose.model('Invoice', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  number: String, bookingId: { type: String, index: true }, clientId: String, technicianId: { type: String, index: true },
  items: [{ _id: false, label: String, labelAr: String, amount: Number, rate: Number }],
  total: Number, method: String, status: String,
  cardLast4: String, mobileNumber: String, confirmationCode: String, verificationCode: String,
  paidAt: String, createdAt: String,
  paymobRef: String, paymobIntentionId: String, paymobTxnId: String,
  commissionPaid: Boolean, commissionPaidAt: String,
}, opts));

const Notification = mongoose.model('Notification', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  userId: { type: String, index: true }, type: String, bookingId: String, invoiceId: String,
  titleAr: String, titleEn: String, bodyAr: String, bodyEn: String, link: String,
  read: Boolean, createdAt: String,
}, opts));

const Clinic = mongoose.model('Clinic', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  name: String, city: String, address: String, phone: String, phoneRaw: String, whatsapp: String, email: String,
  lat: Number, lng: Number, about: String, hours: String, services: [String],
  prices: { type: mongoose.Schema.Types.Mixed, default: {} },
  photos: [String], openStatus: String, openStatusAt: String, origin: String, sources: [String], notes: String, invited: Boolean,
  schedule: { type: mongoose.Schema.Types.Mixed, default: {} }, insurance: { type: mongoose.Schema.Types.Mixed, default: {} },
  faq: { type: mongoose.Schema.Types.Mixed, default: {} }, mapUrl: String, otherServices: String, registryId: String, directoryListed: Boolean,
  approved: Boolean, verified: Boolean, removed: Boolean, createdAt: String, updatedAt: String,
}, opts));
const Procedure = mongoose.model('Procedure', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  slug: String, nameAr: String, descAr: String, icon: String, min: Number, max: Number, order: Number,
  sources: [{ _id: false, name: String, url: String, note: String }], checkedAt: String,
}, opts));
const Provider = mongoose.model('Provider', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  kind: { type: String, index: true }, name: String, specialty: String, specialtyKey: { type: String, index: true }, city: { type: String, index: true },
  address: String, phone: String, whatsapp: String, website: String, sources: [String], notes: String, registryNo: String, origin: String,
  openStatus: String, openStatusAt: String, contactEmail: String, approved: { type: Boolean, index: true }, removed: Boolean, publishedBatch: String, mergedWith: String, createdAt: String, updatedAt: String,
}, opts));
const Appointment = mongoose.model('Appointment', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  clinicId: String, clinicName: String, name: String, phone: String, procedure: String, preferred: String, note: String,
  status: String, createdAt: String,
}, opts));

// National ID photos + selfie: private, admin-only. Kept apart from the technician document so nothing public can ever include them.
const IdDoc = mongoose.model('IdDoc', new mongoose.Schema({
  id: { type: String, unique: true, index: true }, front: String, back: String, selfie: String, submittedAt: String,
}, opts));

// Receivables ledger: one row per paid job = FIX-IT's commission due on it. Kept in step with invoices by store.syncReceivables().
const Receivable = mongoose.model('Receivable', new mongoose.Schema({
  id: { type: String, unique: true, index: true }, invoiceId: String, bookingId: String, invoiceNumber: String,
  technicianId: { type: String, index: true }, clientId: String, jobAmount: Number, rate: Number, techCommission: Number, clientFee: Number, commission: Number,
  accruedAt: String, status: String, via: String, method: String, reportedAt: String, reportMethod: String, reportRef: String,
  settledAt: String, settledBy: String,
}, opts));

// Disputes: either party of an active job can open one; admins review and resolve.
const Dispute = mongoose.model('Dispute', new mongoose.Schema({
  id: { type: String, unique: true, index: true }, bookingId: { type: String, index: true }, clientId: String, technicianId: String,
  openedBy: String, status: String, reason: String, notes: [mongoose.Schema.Types.Mixed], resolution: String, createdAt: String, resolvedAt: String,
}, opts));

const Counter = mongoose.model('Counter', new mongoose.Schema({ _id: String, value: Number, summary: String }, opts));

const MODELS = { users: User, technicians: Technician, bookings: Booking, invoices: Invoice, notifications: Notification, clinics: Clinic, procedures: Procedure, appointments: Appointment, providers: Provider, idDocs: IdDoc, receivables: Receivable, disputes: Dispute };

const strip = (doc) => {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const { _id, ...rest } = o;
  return rest;
};


// One-time removal of the seeded demo records (owner order, 2026-11-27). Runs once, guarded by a Counter marker.
// Seeded ids are deterministic (the seed ran on an empty cluster, real records start after it), and every id is
// double-checked against the seed's own name/email so a real record can never match by id alone.
// Admin accounts are never touched. Everything removed is first copied to the private demo_archive collection
// (never served by any route) so it can be restored.
async function purgeDemoData() {
  if (process.env.DEMO_PURGE === '0') return;
  if (await Counter.findOne({ _id: 'demoPurgeDone' }).lean()) return;
  const seeded = buildDataset();
  const demoUsers = [];
  for (const u of seeded.users) {
    if (u.role === 'admin') continue;
    const row = await User.findOne({ id: u.id, email: u.email, role: u.role }).lean();
    if (row) demoUsers.push(row);
  }
  const demoTechs = [];
  for (const t of seeded.technicians) {
    const row = await Technician.findOne({ id: t.id, name: t.name, phone: t.phone }).lean();
    if (row) demoTechs.push(row);
  }
  const uIds = demoUsers.map((u) => u.id);
  const tIds = demoTechs.map((t) => t.id);
  const bookings = await Booking.find({ $or: [{ clientId: { $in: uIds } }, { technicianId: { $in: tIds } }] }).lean();
  const bIds = bookings.map((b) => b.id);
  const invoices = await Invoice.find({ $or: [{ bookingId: { $in: bIds } }, { clientId: { $in: uIds } }, { technicianId: { $in: tIds } }] }).lean();
  const iIds = invoices.map((i) => i.id);
  const receivables = await Receivable.find({ $or: [{ invoiceId: { $in: iIds } }, { technicianId: { $in: tIds } }] }).lean();
  const notifications = await Notification.find({ $or: [{ userId: { $in: uIds } }, { bookingId: { $in: bIds } }, { invoiceId: { $in: iIds } }] }).lean();
  const idDocs = await IdDoc.find({ id: { $in: tIds } }).lean();
  const strip2 = (rows) => rows.map(({ passwordHash, ...r }) => r);
  const summary = {
    users: demoUsers.length, technicians: demoTechs.length, bookings: bookings.length, invoices: invoices.length,
    receivables: receivables.length, notifications: notifications.length, idDocs: idDocs.length,
  };
  await mongoose.connection.collection('demo_archive').insertOne({
    removedAt: new Date().toISOString(), summary,
    users: strip2(demoUsers), technicians: demoTechs, bookings, invoices, receivables, notifications, idDocs,
  });
  await Receivable.deleteMany({ id: { $in: receivables.map((r) => r.id) } });
  await Notification.deleteMany({ id: { $in: notifications.map((n) => n.id) } });
  await Invoice.deleteMany({ id: { $in: iIds } });
  await Booking.deleteMany({ id: { $in: bIds } });
  await IdDoc.deleteMany({ id: { $in: idDocs.map((d) => d.id) } });
  await Technician.deleteMany({ id: { $in: tIds } });
  await User.deleteMany({ id: { $in: uIds }, role: { $ne: 'admin' } });
  await Counter.updateOne({ _id: 'demoPurgeDone' }, { $set: { value: 1, summary: JSON.stringify(summary) } }, { upsert: true });
  console.log('FIX-IT: demo data purged', JSON.stringify(summary));
}

async function init() {
  if (!global._fixitMongo) {
    global._fixitMongo = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority' },
      bufferCommands: false,
    }).then(async () => {
      // Demo data never loads in production. Seeding an empty cluster is a dev-only action (DEMO_SEED=1).
      if ((await User.countDocuments()) === 0 && process.env.DEMO_SEED === '1') {
        const data = buildDataset();
        await User.insertMany(data.users);
        await Technician.insertMany(data.technicians);
        await Booking.insertMany(data.bookings);
        await Invoice.insertMany(data.invoices);
        await Counter.updateOne({ _id: 'seq' }, { $set: { value: data.seq } }, { upsert: true });
        console.log('FIX-IT: MongoDB seeded (DEMO_SEED=1)');
      }
      await purgeDemoData().catch((e) => console.error("FIX-IT: demo purge failed", e.message));
      return mongoose;
    });
  }
  await global._fixitMongo;
}

const table = (Model) => ({
  getAll: async () => (await Model.find().lean()).map((o) => strip(o)),
  // Equality filter evaluated by MongoDB (uses the indexes) instead of loading the whole collection.
  find: async (filter) => (await Model.find(filter).lean()).map((o) => strip(o)),
  getById: async (id) => strip(await Model.findOne({ id }).lean()),
  insert: async (row) => strip(await Model.create(row)),
  update: async (id, patch) => strip(await Model.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean()),
  remove: async (id) => (await Model.deleteOne({ id })).deletedCount > 0,
});

async function demoPurgeStatus() {
  const d = await Counter.findOne({ _id: 'demoPurgeDone' }).lean();
  return d ? { done: true, removed: d.summary ? JSON.parse(d.summary) : null } : { done: false };
}

module.exports = {
  init,
  demoPurgeStatus,
  nextId: async (prefix) => {
    const c = await Counter.findOneAndUpdate({ _id: 'seq' }, { $inc: { value: 1 } }, { new: true, upsert: true }).lean();
    return `${prefix}_${c.value}`;
  },
  users: table(MODELS.users),
  technicians: table(MODELS.technicians),
  bookings: table(MODELS.bookings),
  invoices: table(MODELS.invoices),
  notifications: table(MODELS.notifications),
  clinics: table(MODELS.clinics),
  procedures: table(MODELS.procedures),
  appointments: table(MODELS.appointments),
  idDocs: table(MODELS.idDocs),
  receivables: table(MODELS.receivables),
  providers: { ...table(MODELS.providers), insertMany: async (rows) => { await Provider.insertMany(rows, { ordered: false }); },
    publishAll: async (batch) => { await Provider.updateMany({ publishedBatch: { $exists: false } }, { $set: { approved: true, publishedBatch: batch } }); } },
};
