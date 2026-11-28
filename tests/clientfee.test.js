// Customer-side 6% service fee (replaced the flat 25 EGP fee) and how it is accounted.
const { test } = require('node:test');
const assert = require('node:assert');
const store = require('../server/core/store');
const { retrieve } = require('../server/core/assistantKb');

async function tech() { return { id: 'tech_feetest' }; }

test('invoice = job price + 6% of the job price, no flat fee', async () => {
  const t = await tech();
  const inv = await store.createInvoiceForBooking({ id: 'bk_fee1', technicianId: t.id, clientId: 'usr_x', finalAmount: 250 });
  assert.equal(inv.items[0].amount, 250);
  assert.equal(inv.items[1].amount, 15);
  assert.equal(inv.items[1].rate, 0.06);
  assert.equal(inv.total, 265);
  assert.ok(!JSON.stringify(inv.items).includes('25 EGP'));
});

test('fee rounds to 2 decimals and follows a corrected amount while unpaid', async () => {
  const t = await tech();
  const b = { id: 'bk_fee2', technicianId: t.id, clientId: 'usr_x', finalAmount: 333 };
  const inv = await store.createInvoiceForBooking(b);
  assert.equal(inv.items[1].amount, 19.98);
  assert.equal(inv.total, 352.98);
  const upd = await store.createInvoiceForBooking({ ...b, finalAmount: 400 });
  assert.equal(upd.items[1].amount, 24);
  assert.equal(upd.total, 424);
});

test('accounting: technician owes his 6% plus the 6% fee he collected; old flat-fee invoices are unchanged', async () => {
  const t = await tech();
  const db = await store.getDb();
  const inv = await db.invoices.getAll().then((a) => a.find((i) => i.bookingId === 'bk_fee1'));
  await db.invoices.update(inv.id, { status: 'paid', method: 'cash', paidAt: new Date().toISOString() });
  // legacy invoice: flat fee item without a rate
  const legacy = await db.invoices.insert({ id: 'inv_legacy1', number: 'INV-OLD', bookingId: 'bk_old', clientId: 'usr_x', technicianId: t.id,
    items: [{ label: 'visit', labelAr: 'زيارة', amount: 100 }, { label: 'FIX-IT service fee', labelAr: 'رسوم خدمة FIX-IT', amount: 25 }], total: 125, status: 'paid', method: 'cash', paidAt: new Date().toISOString(), createdAt: new Date().toISOString() });
  const rep = await store.adminCommissions();
  const row = rep.rows.find((r) => r.invoiceId === inv.id);
  assert.equal(row.base, 250);
  assert.equal(row.techCommission, 15);
  assert.equal(row.clientFee, 15);
  assert.equal(row.commission, 30);
  const old = rep.rows.find((r) => r.invoiceId === legacy.id);
  assert.equal(old.commission, 6, 'legacy: 6% of 100 only');
  assert.equal(old.clientFee, 0);
});

test('assistant KB states 6% on both sides, not the old flat fee or "customer pays no commission"', () => {
  const all = [...retrieve('الفاتورة بكام رسوم الخدمة'), ...retrieve('العمولة كام'), ...retrieve('دورة العمولة')].map((c) => c.t).join('\n');
  assert.match(all, /6%/);
  assert.ok(!/العميل مش بيدفع عمولة/.test(all));
  assert.ok(!/بيدفعها الفني مش العميل/.test(all));
});
