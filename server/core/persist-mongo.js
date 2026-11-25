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
  yearsExperience: Number, hourlyRate: Number, rating: Number, jobsDone: Number,
  bio: String, bioAr: String, phone: String, phonePublic: Boolean,
  address: String, addressActive: Boolean, reviews: [reviewSchema], lat: Number, lng: Number,
  verified: Boolean, photo: String, workPhotos: [String],
}, opts));

const Booking = mongoose.model('Booking', new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  clientId: String, technicianId: String, date: String,
  description: String, descriptionAr: String, address: String,
  clientLat: Number, clientLng: Number, status: String, createdAt: String,
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

const Counter = mongoose.model('Counter', new mongoose.Schema({ _id: String, value: Number }, opts));

const MODELS = { users: User, technicians: Technician, bookings: Booking, invoices: Invoice };

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
};
