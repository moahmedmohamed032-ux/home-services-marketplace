const express = require('express');
const store = require('../core/store');
const ApiError = require('../core/ApiError');
const { hashPassword, comparePassword, signToken } = require('../utils/crypto');
const { requireFields, assertEmail, assertPassword, assertRole } = require('../utils/validators');
const rateLimiter = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../core/config');
const { verifyGoogleIdToken } = require('../utils/google');

const router = express.Router();

function authPayload(user) {
  return { token: signToken(user), user: store.publicUser(user) };
}

// ---- Sign in / sign up with Google (ID token from Google Identity Services) ----
const googleClientId = () => process.env.GOOGLE_CLIENT_ID || '';
const verifyGoogle = (credential) => verifyGoogleIdToken(credential, googleClientId());
const googleTicket = (g) => jwt.sign({ purpose: 'google-signup', email: g.email, name: g.name }, config.jwtSecret, { expiresIn: '20m' });
const USERNAME_MSG = 'Username must be 3 to 24 characters: lowercase letters, digits, dot or underscore';
async function assertFreeUsername(u) {
  if (!store.validUsername(u)) throw ApiError.badRequest(USERNAME_MSG);
  if (await store.findUserByUsername(u)) throw ApiError.conflict('Username is already taken');
}

// GET /api/auth/username-available?u=name — live check while typing on the sign-up form.
router.get('/username-available', rateLimiter, async (req, res, next) => {
  try {
    const u = store.normalizeUsername(req.query.u);
    if (!store.validUsername(u)) return res.json({ valid: false, available: false });
    res.json({ valid: true, available: !(await store.findUserByUsername(u)) });
  } catch (err) { next(err); }
});

router.get('/google/config', (req, res) => res.json({ enabled: !!googleClientId(), clientId: googleClientId() || undefined }));

// POST /api/auth/google { credential, mode: 'login' | 'client' | 'technician' }
router.post('/google', rateLimiter, async (req, res, next) => {
  try {
    const g = await verifyGoogle(req.body.credential);
    const mode = String(req.body.mode || 'login');
    const user = await store.findUserByEmail(g.email);
    if (user) {
      if (user.active === false) throw ApiError.unauthorized('Account is deactivated');
      return res.json({ status: 'signed_in', ...authPayload(user) });
    }
    // Sign-up (client or technician): the verified Google email prefills name + username, the user confirms on the form.
    if (mode === 'client' || mode === 'technician') {
      return res.json({ status: 'needs_profile', ticket: googleTicket(g), name: g.name, email: g.email, suggestedUsername: await store.suggestUsername(g.email, g.name) });
    }
    throw ApiError.notFound('No account for this Google email yet. Sign up first.');
  } catch (err) {
    next(err.status === 401 ? ApiError.unauthorized(err.message) : err);
  }
});

// POST /api/auth/register — creates a client or a technician (with profile).
router.post('/register', rateLimiter, async (req, res, next) => {
  try {
    let google = null;
    if (req.body.googleTicket) {
      try { google = jwt.verify(req.body.googleTicket, config.jwtSecret); } catch { throw ApiError.unauthorized('Google sign-up expired, try again'); }
      if (google.purpose !== 'google-signup') throw ApiError.unauthorized('Invalid Google sign-up');
      req.body.email = google.email; req.body.name = req.body.name || google.name;
      req.body.password = crypto.randomBytes(24).toString('hex');
    }
    requireFields(req.body, ['name', 'password', 'role']);
    const { name, password, role, city, profession, yearsExperience, hourlyRate, bio, lat, lng, phone, phonePublic, address, addressActive } = req.body;
    const email = String(req.body.email || '').trim();
    const username = String(req.body.username || '').trim() ? store.normalizeUsername(req.body.username) : await store.suggestUsername(email, name);
    await assertFreeUsername(username);
    assertPassword(password);
    assertRole(role);
    // Email is optional: a valid Egyptian mobile number is enough to register and log in.
    if (!email && !String(phone || '').trim()) throw ApiError.badRequest('Enter a mobile number or an email address');
    if (email) {
      assertEmail(email);
      if (await store.findUserByEmail(email)) throw ApiError.conflict('Email is already registered');
    }
    if (String(phone || '').trim()) {
      if (!store.isEgPhone(phone)) throw ApiError.badRequest('Enter a valid Egyptian mobile number (e.g. 01012345678)');
      if (await store.findUserByPhone(phone)) throw ApiError.conflict('Phone number is already registered');
    }
    let idDocs = null;
    if (role === 'technician') {
      requireFields(req.body, ['profession', 'phone']);
      idDocs = store.cleanIdentity(req.body); // national ID front + back + selfie are required
      if (!(await store.listProfessions()).some((p) => p.id === profession)) {
        throw ApiError.badRequest('Unknown profession');
      }
    }

    const user = await store.createUser({
      name: String(name).trim(), username, email, phone: String(phone || '').trim() ? phone : undefined,
      passwordHash: await hashPassword(password), role, city, lat, lng,
    });
    if (role === 'technician') {
      await store.createTechnicianProfile(user, { profession, city, yearsExperience, hourlyRate, bio, lat, lng, phone: store.normalizePhone(phone), phonePublic, address, addressActive });
      const techRow = await store.findTechnicianByUserId(user.id);
      if (techRow && idDocs) await store.saveIdentity(techRow, idDocs);
    }
    res.status(201).json(authPayload(user));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', rateLimiter, async (req, res, next) => {
  try {
    const identifier = req.body.identifier || req.body.email;
    requireFields({ identifier, password: req.body.password }, ['identifier', 'password']);
    const { password } = req.body;
    const user = await store.findUserByLogin(identifier);
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      throw ApiError.unauthorized('Wrong email/phone or password');
    }
    if (user.active === false) throw ApiError.unauthorized('Account is deactivated');
    res.json(authPayload(user));
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — current session user (+ technician profile if any).
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const technician = (await store.findTechnicianByUserId(req.user.id)) || null;
    res.json({ user: store.publicUser(req.user), technician: technician ? await store.publicTechnician(technician, { owner: true, withReviews: true }) : null });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password — signed-in user changes their own password.
router.post('/change-password', rateLimiter, authenticate, async (req, res, next) => {
  try {
    requireFields(req.body, ['currentPassword', 'newPassword']);
    const { currentPassword, newPassword } = req.body;
    assertPassword(newPassword);
    if (String(newPassword).length > 128) throw ApiError.badRequest('Password is too long');
    const user = await store.findUserById(req.user.id);
    if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Current password is wrong');
    }
    await store.setUserPassword(user.id, await hashPassword(newPassword));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
