const express = require('express');
const store = require('../core/store');
const ApiError = require('../core/ApiError');
const { hashPassword } = require('../utils/crypto');
const { requireFields, assertEmail, assertPassword } = require('../utils/validators');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

// GET /api/admin/overview — headline numbers for the admin dashboard.
router.get('/overview', async (req, res, next) => {
  try {
    res.json({ overview: await store.adminOverview() });
  } catch (err) { next(err); }
});

// GET /api/admin/users — every registered user, technicians carry their profile.
router.get('/users', async (req, res, next) => {
  try {
    res.json({ users: await store.listUsersAdmin() });
  } catch (err) { next(err); }
});

// GET /api/admin/invoices — every invoice with payment status.
router.get('/invoices', async (req, res, next) => {
  try {
    res.json({ invoices: await store.allInvoices() });
  } catch (err) { next(err); }
});

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (err) { next(err); } };

// GET /api/admin/commissions — 6% platform commission per completed booking.
router.get('/commissions', wrap(async (req, res) => res.json({ commissions: await store.adminCommissions() })));

// ---- technicians ----
router.get('/technicians', wrap(async (req, res) => res.json({ technicians: await store.adminListTechnicians() })));
router.post('/technicians', wrap(async (req, res) => {
  requireFields(req.body, ['name', 'password', 'profession', 'city']);
  if (String(req.body.email || '').trim()) {
    assertEmail(req.body.email);
    if (await store.findUserByEmail(req.body.email)) throw ApiError.conflict('Email is already registered');
  }
  assertPassword(req.body.password);
  const technician = await store.adminCreateTechnician(req.body, await hashPassword(req.body.password));
  res.status(201).json({ technician });
}));
router.patch('/technicians/:id', wrap(async (req, res) => res.json({ technician: await store.adminUpdateTechnician(req.params.id, req.body) })));
router.delete('/technicians/:id', wrap(async (req, res) => { await store.adminDeleteTechnician(req.params.id); res.json({ ok: true }); }));

// ---- users ----
router.patch('/users/:id', wrap(async (req, res) => res.json({ user: await store.adminUpdateUser(req.params.id, req.body, req.user) })));
router.delete('/users/:id', wrap(async (req, res) => { await store.adminDeleteUser(req.params.id, req.user); res.json({ ok: true }); }));

// ---- bookings ----
router.get('/bookings', wrap(async (req, res) => res.json({ bookings: await store.adminListBookings() })));
router.patch('/bookings/:id', wrap(async (req, res) => {
  requireFields(req.body, ['status']);
  res.json({ booking: await store.adminSetBookingStatus(req.params.id, req.body.status) });
}));
router.delete('/bookings/:id', wrap(async (req, res) => { await store.adminDeleteBooking(req.params.id); res.json({ ok: true }); }));

// ---- invoices ----
router.patch('/invoices/:id', wrap(async (req, res) => res.json({ invoice: await store.adminUpdateInvoice(req.params.id, req.body) })));
router.delete('/invoices/:id', wrap(async (req, res) => { await store.adminDeleteInvoice(req.params.id); res.json({ ok: true }); }));

module.exports = router;
