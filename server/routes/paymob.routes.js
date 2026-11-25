const express = require('express');
const store = require('../core/store');
const paymob = require('../core/paymob');

const router = express.Router();

// POST /api/paymob/callback — "transaction processed" webhook from Paymob.
// Authenticated only by its HMAC. Always answers 200 for valid, handled events.
router.post('/callback', async (req, res, next) => {
  try {
    const obj = req.body && req.body.obj;
    if (!obj || !paymob.verifyCallback(obj, req.query.hmac)) return res.status(401).json({ error: 'Bad signature' });
    const reference = obj.order && (obj.order.merchant_order_id || obj.merchant_order_id);
    await store.applyPaymobTransaction({
      reference: reference || (obj.payment_key_claims && obj.payment_key_claims.extra && obj.payment_key_claims.extra.invoice_id),
      transactionId: obj.id, amountCents: obj.amount_cents, success: obj.success === true && obj.pending !== true,
      sourceType: obj.source_data && obj.source_data.type, last4: obj.source_data && obj.source_data.pan,
    });
    res.json({ received: true });
  } catch (err) { next(err); }
});

// GET /api/paymob/return — the browser lands here after the hosted checkout.
// The redirect query is signed too; we verify it, mark the invoice and send
// the customer back to the dashboard with a result flag (UX only).
router.get('/return', async (req, res) => {
  const q = req.query;
  let flag = 'failed';
  try {
    if (paymob.verifyRedirect(q)) {
      const ref = q.merchant_order_id || q['order.merchant_order_id'] || '';
      const r = await store.applyPaymobTransaction({
        reference: ref, transactionId: q.id, amountCents: q.amount_cents,
        success: q.success === 'true' && q.pending !== 'true',
        sourceType: q['source_data.type'], last4: q['source_data.pan'],
      });
      flag = r.status === 'paid' ? 'paid' : (q.pending === 'true' ? 'pending' : 'failed');
    }
  } catch (err) { console.error('paymob return error', err.message); }
  res.redirect(`/dashboard?payment=${flag}`);
});

module.exports = router;
