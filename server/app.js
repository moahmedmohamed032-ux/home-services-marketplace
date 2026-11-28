const express = require('express');
const cors = require('cors');
const logger = require('./core/logger');
const store = require('./core/store');
const errorHandler = require('./middleware/errorHandler');
const ApiError = require('./core/ApiError');

const authRoutes = require('./routes/auth.routes');
const professionRoutes = require('./routes/professions.routes');
const technicianRoutes = require('./routes/technicians.routes');
const bookingRoutes = require('./routes/bookings.routes');
const invoiceRoutes = require('./routes/invoices.routes');
const adminRoutes = require('./routes/admin.routes');
const paymobRoutes = require('./routes/paymob.routes');
const dentalRoutes = require('./routes/dental.routes');
const assistantRoutes = require('./routes/assistant.routes');
const notificationRoutes = require('./routes/notifications.routes');

const securityHeaders = require('./middleware/securityHeaders');

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
// The API is called by our own site (Bearer token, no cookies). Other websites' browsers are refused.
const ALLOWED_ORIGINS = new Set(['https://fanni-marketplace.vercel.app', ...(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)]);
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)),
}));
app.use(express.json({ limit: '3mb' }));
app.use(logger);

// Make sure the store (MongoDB connection or in-memory seed) is ready before
// any route runs; on serverless this awaits the cached connection on cold start.
app.use(async (req, res, next) => {
  try {
    await store.init();
    next();
  } catch (err) {
    next(err);
  }
});

app.get('/api/health', async (req, res) => {
  const out = { status: 'ok', service: 'fixit-api' };
  try { const p = require('./core/persist-mongo'); if (process.env.MONGODB_URI) out.demoPurge = await p.demoPurgeStatus(); } catch { /* optional */ }
  res.json(out);
});
app.use('/api/auth', authRoutes);
app.use('/api/professions', professionRoutes);
app.use('/api/technicians', technicianRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/dental', dentalRoutes.pub);
app.use('/api/directory', dentalRoutes.directory);
app.use('/api/admin/dental', dentalRoutes.admin);
app.use('/api/admin', adminRoutes);
app.use('/api/paymob', paymobRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/assistant', assistantRoutes);
// Daily Vercel cron: auto-confirm jobs the client did not answer within 48h (idempotent; also runs lazily on list reads).
app.get('/api/cron/autoconfirm', async (req, res, next) => {
  try { res.json({ confirmed: await store.sweepAutoConfirm() }); } catch (e) { next(e); }
});

app.use('/api', (req, res, next) => next(ApiError.notFound(`No route: ${req.method} ${req.originalUrl}`)));
app.use(errorHandler);

module.exports = app;
