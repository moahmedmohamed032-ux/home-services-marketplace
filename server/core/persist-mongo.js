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
  name: String, email: { type: String, index: true }, phone: { type: String, index: true }, passwordHash: String,
  role: String, city: String, active: Boolean, lat: Number, lng: Number, createdAt: String,
}, opts));

const Technician = mongoose.model('Technician', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  userId: String, name: String, profession: String, city: String, district: String,
  yearsExperience: Number, hourlyRate: Number, approved: Boolean, rating: Number, jobsDone: Number,
  bio: String, bioAr: String, phone: String, phonePublic: Boolean,
  address: String, addressActive: Boolean, reviews: [reviewSchema], lat: Number, lng: Number,
  verified: Boolean, photo: String, workPhotos: [String], settlementClaim: mongoose.Schema.Types.Mixed, idStatus: String,
}, opts));

const Booking = mongoose.model('Booking', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  clientId: String, technicianId: String, date: String,
  description: String, descriptionAr: String, address: String,
  clientLat: Number, clientLng: Number, status: String, createdAt: String,
  startedAt: String, awaitingSince: String, remind1At: String, remind2At: String, cashAskedAt: String, cashAnswer: String, cashAnsweredAt: String, finalAmount: Number, completedAt: String, autoConfirmed: Boolean, digested: Boolean, dispatchId: String, nearest: Boolean, superseded: Boolean, chosen: Boolean, expired: Boolean,
  review: { type: new mongoose.Schema({ rating: Number, comment: String, commentAr: String, createdAt: String }, { _id: false }), default: null },
}, opts));

const Invoice = mongoose.model('Invoice', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  number: String, bookingId: { type: String, index: true }, clientId: String, technicianId: String,
  items: [{ _id: false, label: String, labelAr: String, amount: Number }],
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
  photos: [String], origin: String, sources: [String], notes: String, invited: Boolean,
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
  approved: { type: Boolean, index: true }, removed: Boolean, publishedBatch: String, mergedWith: String, createdAt: String, updatedAt: String,
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

const Counter = mongoose.model('Counter', new mongoose.Schema({ _id: String, value: Number }, opts));

const MODELS = { users: User, technicians: Technician, bookings: Booking, invoices: Invoice, notifications: Notification, clinics: Clinic, procedures: Procedure, appointments: Appointment, providers: Provider, idDocs: IdDoc };

const strip = (doc) => {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const { _id, ...rest } = o;
  return rest;
};

async function init() {
  if (!global._fixitMongo) {
    global._fixitMongo = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority' },
      bufferCommands: false,
    }).then(async () => {
      // First boot on an empty cluster: load the seed dataset.
      if ((await User.countDocuments()) === 0) {
        const data = buildDataset();
        await User.insertMany(data.users);
        await Technician.insertMany(data.technicians);
        await Booking.insertMany(data.bookings);
        await Invoice.insertMany(data.invoices);
        await Counter.updateOne({ _id: 'seq' }, { $set: { value: data.seq } }, { upsert: true });
        console.log('FIX-IT: MongoDB seeded');
      }
      return mongoose;
    });
  }
  await global._fixitMongo;
}

const table = (Model) => ({
  getAll: async () => (await Model.find().lean()).map((o) => strip(o)),
  getById: async (id) => strip(await Model.findOne({ id }).lean()),
  insert: async (row) => strip(await Model.create(row)),
  update: async (id, patch) => strip(await Model.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean()),
  remove: async (id) => (await Model.deleteOne({ id })).deletedCount > 0,
});

module.exports = {
  init,
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
  providers: { ...table(MODELS.providers), insertMany: async (rows) => { await Provider.insertMany(rows, { ordered: false }); },
    publishAll: async (batch) => { await Provider.updateMany({ publishedBatch: { $exists: false } }, { $set: { approved: true, publishedBatch: batch } }); } },
};
