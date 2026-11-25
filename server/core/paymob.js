// Paymob Accept integration (Intention API + Unified Checkout redirect).
// Mode (test or live) is decided only by the keys and integration IDs in the
// environment, so going live is a config change, not a code change.
//
//   PAYMOB_SECRET_KEY            server-only, "Token <secret>" auth for the Intention API
//   PAYMOB_PUBLIC_KEY            used to build the hosted checkout URL
//   PAYMOB_HMAC_SECRET           verifies callbacks / redirects
//   PAYMOB_CARD_INTEGRATION_ID   online card integration (Visa / Mastercard / Meeza)
//   PAYMOB_WALLET_INTEGRATION_ID optional, mobile wallets (Vodafone Cash etc.)
//   PAYMOB_BASE_URL              default https://accept.paymob.com
//   APP_URL                      public site origin (default: taken from the request)
const crypto = require('crypto');
const ApiError = require('./ApiError');

const env = () => process.env;

function config() {
  const e = env();
  const card = parseInt(e.PAYMOB_CARD_INTEGRATION_ID, 10);
  const wallet = parseInt(e.PAYMOB_WALLET_INTEGRATION_ID, 10);
  return {
    enabled: Boolean(e.PAYMOB_SECRET_KEY && e.PAYMOB_PUBLIC_KEY && e.PAYMOB_HMAC_SECRET && card),
    secretKey: e.PAYMOB_SECRET_KEY,
    publicKey: e.PAYMOB_PUBLIC_KEY,
    hmacSecret: e.PAYMOB_HMAC_SECRET,
    baseUrl: (e.PAYMOB_BASE_URL || 'https://accept.paymob.com').replace(/\/$/, ''),
    integrations: { card: Number.isFinite(card) ? card : null, wallet: Number.isFinite(wallet) ? wallet : null },
  };
}

// Keys present is not enough: real payments are only accepted when PAYMOB_LIVE=true
// (set after Paymob live activation). Test/sandbox keys must never settle a real order.
const isLive = () => config().enabled && String(env().PAYMOB_LIVE || '').toLowerCase() === 'true';

// Public description for the client: which methods can the UI offer?
function publicConfig() {
  const c = config();
  if (c.enabled && !isLive()) return { provider: 'cash_only', methods: [] };
  return {
    provider: c.enabled ? 'paymob' : 'simulated',
    methods: c.enabled ? ['card', ...(c.integrations.wallet ? ['wallet'] : [])] : [],
  };
}

function splitName(full = '') {
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || 'Customer', last: parts.slice(1).join(' ') || 'FIX-IT' };
}

const normalizePhone = (p) => {
  const d = String(p || '').replace(/[^\d+]/g, '');
  if (/^01[0125]\d{8}$/.test(d)) return `+2${d}`;
  if (/^\+201[0125]\d{8}$/.test(d)) return d;
  return null;
};

// Create an Intention and return { clientSecret, checkoutUrl, intentionId, reference }.
async function createIntention({ invoice, user, method, phone, appUrl }) {
  const c = config();
  if (!c.enabled || !isLive()) throw ApiError.badRequest('Online payment is not available yet');
  const integrationId = method === 'wallet' ? c.integrations.wallet : c.integrations.card;
  if (!integrationId) throw ApiError.badRequest('This payment method is not available yet');
  const mobile = normalizePhone(phone);
  if (!mobile) throw ApiError.badRequest('Enter a valid Egyptian mobile number (e.g. 01012345678)');

  const { first, last } = splitName(user.name);
  const reference = `${invoice.id}-${Date.now().toString(36)}`; // unique per attempt
  const amount = Math.round(invoice.total * 100); // cents
  const body = {
    amount,
    currency: 'EGP',
    payment_methods: [integrationId],
    items: (invoice.items || []).map((i) => ({
      name: i.label, amount: Math.round(i.amount * 100), description: i.label, quantity: 1,
    })),
    billing_data: {
      first_name: first, last_name: last, email: user.email, phone_number: mobile,
      street: 'NA', building: 'NA', floor: 'NA', apartment: 'NA',
      city: user.city || 'Cairo', country: 'EGY', state: user.city || 'Cairo',
    },
    extras: { invoice_id: invoice.id, invoice_number: invoice.number },
    special_reference: reference,
    notification_url: `${appUrl}/api/paymob/callback`,
    redirection_url: `${appUrl}/api/paymob/return`,
  };
  // Items must add up to the total.
  if (body.items.reduce((s, i) => s + i.amount, 0) !== amount) body.items = [{ name: `Invoice ${invoice.number}`, amount, description: invoice.number, quantity: 1 }];

  const res = await fetch(`${c.baseUrl}/v1/intention/`, {
    method: 'POST',
    headers: { Authorization: `Token ${c.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.client_secret) {
    console.error('Paymob intention failed', res.status, JSON.stringify(data).slice(0, 300));
    throw ApiError.badRequest('Could not start the payment. Please try again.');
  }
  return {
    intentionId: String(data.id || ''),
    reference,
    clientSecret: data.client_secret,
    checkoutUrl: `${c.baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(c.publicKey)}&clientSecret=${encodeURIComponent(data.client_secret)}`,
  };
}

// ---- HMAC ----
// Transaction processed callback: values come from the JSON body's `obj`.
const FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id',
  'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
  'is_voided', 'order', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type',
  'source_data.type', 'success',
];

const dig = (o, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
const str = (v) => (v === null || v === undefined ? '' : String(v));

// obj: nested transaction object (callback) -> order is obj.order.id
// flat: query params of the redirect -> order is a plain value
function hmacFor(source, secret, { flat = false } = {}) {
  const concat = FIELDS.map((f) => {
    if (flat) return str(source[f]);
    if (f === 'order') return str(dig(source, 'order.id'));
    return str(dig(source, f));
  }).join('');
  return crypto.createHmac('sha512', secret).update(concat).digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function verifyCallback(obj, hmac) {
  const c = config();
  if (!c.hmacSecret || !obj) return false;
  return safeEqual(hmacFor(obj, c.hmacSecret), String(hmac || '').toLowerCase());
}

function verifyRedirect(query) {
  const c = config();
  if (!c.hmacSecret) return false;
  return safeEqual(hmacFor(query, c.hmacSecret, { flat: true }), String(query.hmac || '').toLowerCase());
}

module.exports = { config, isLive, publicConfig, createIntention, verifyCallback, verifyRedirect, hmacFor, normalizePhone };
