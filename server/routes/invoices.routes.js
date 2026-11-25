const express = require('express');
const store = require('../core/store');
const ApiError = require('../core/ApiError');
const { authenticate, requireRole } = require('../middleware/auth');

const paymob = require('../core/paymob');

const router = express.Router();

// GET /api/invoices/payment-config — which payment provider/methods are live.
router.get('/payment-config', (req, res) => res.json(paymob.publicConfig()));

const originOf = (req) => process.env.APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

// POST /api/invoices/:id/paymob — start a real Paymob checkout (card or wallet).
router.post('/:id/paymob', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const invoice = await store.findInvoiceById(req.params.id);
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (invoice.clientId !== req.user.id) throw ApiError.forbidden('Not your invoice');
    const user = await store.findUserById(req.user.id);
    const result = await store.startPaymobPayment(invoice, user, { method: req.body.method === 'wallet' ? 'wallet' : 'card', phone: req.body.mobileNumber, appUrl: originOf(req) });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/invoices/mine — the client's invoices.
router.get('/mine', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    res.json({ invoices: await store.invoicesForClient(req.user.id) });
  } catch (err) { next(err); }
});

// GET /api/invoices/technician — invoices for the logged-in technician's jobs.
router.get('/technician', authenticate, requireRole('technician'), async (req, res, next) => {
  try {
    res.json({ invoices: await store.invoicesForTechnician(req.user.id) });
  } catch (err) { next(err); }
});

// POST /api/invoices/:id/pay — client picks a payment method (simulated).
//   visa:          cardNumber -> paid immediately, confirmation code returned.
//   vodafone-cash: mobileNumber -> a verification code is "sent" (returned in
//                  the response as demoCode, since this demo sends no real SMS).
//   cash:          marks the invoice as cash-on-visit, technician confirms.
router.post('/:id/pay', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const invoice = await store.findInvoiceById(req.params.id);
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (invoice.clientId !== req.user.id) throw ApiError.forbidden('Not your invoice');
    const result = await store.payInvoice(invoice, req.body);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/invoices/:id/verify — client confirms the Vodafone Cash code.
router.post('/:id/verify', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const invoice = await store.findInvoiceById(req.params.id);
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (invoice.clientId !== req.user.id) throw ApiError.forbidden('Not your invoice');
    res.json({ invoice: await store.verifyInvoice(invoice, req.body.code) });
  } catch (err) { next(err); }
});

// POST /api/invoices/:id/confirm — the technician confirms cash received for
// his own invoice; the admin can confirm any pending invoice.
router.post('/:id/confirm', authenticate, requireRole('technician', 'admin'), async (req, res, next) => {
  try {
    const invoice = await store.findInvoiceById(req.params.id);
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (req.user.role === 'technician') {
      const tech = await store.findTechnicianByUserId(req.user.id);
      if (!tech || invoice.technicianId !== tech.id) throw ApiError.forbidden('Not your invoice');
      if (invoice.status !== 'pending_cash') throw ApiError.badRequest('Only cash invoices can be confirmed by the technician');
    }
    res.json({ invoice: await store.confirmInvoice(invoice) });
  } catch (err) { next(err); }
});

module.exports = router;
