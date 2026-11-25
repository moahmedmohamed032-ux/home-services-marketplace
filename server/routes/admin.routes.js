const express = require('express');
const store = require('../core/store');
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

module.exports = router;
